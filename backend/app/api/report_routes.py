import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Literal
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel, Field
from app.services.vision_service import vision_service
from app.services.gemini_service import (
    gemini_service,
    MedicalReportAnalysis,
    sort_medical_timeline,
    extract_year_from_date_str,
)
from app.core.firebase import get_firestore_client
from app.services.patient_service import patient_service
from app.core.websocket_manager import ws_manager

logger = logging.getLogger("medikiosk.reports_api")
router = APIRouter()

class ReportTextRequest(BaseModel):
    text: str

class DemoSampleRequest(BaseModel):
    session_id: str
    sample_type: Literal["discharge_2021", "blood_2023", "imaging_2024", "prescription_2026", "all"] = "all"

# Preset Demo Medical Documents for realistic evaluation
DEMO_DOCUMENT_SAMPLES = {
    "discharge_2021": {
        "text": "APOLLO INDRAPRASTHA HOSPITAL, NEW DELHI - SURGICAL DISCHARGE SUMMARY. Date of Admission: 12-Aug-2021. Date of Discharge: 14-Aug-2021. Patient: {PATIENT_NAME} (Age: 63/M). Consultant: Dr. Rajiv Mehta, MS (General & Laparoscopic Surgery). Diagnosis: Acute Phlegmonous Appendicitis (Status Post Laparoscopic Appendectomy). Procedure: Laparoscopic Appendectomy under General Anesthesia. Histopathology: Acute inflamed appendix without gangrene or perforation. Post-op Course: Smooth and uneventful; port sites clean and dry; sutures removed. Rx: Tab Cefixime 200mg BD x 5 days, Tab Tramadol + Paracetamol 37.5/325mg SOS, Tab Pantoprazole 40mg OD x 7 days.",
        "type": "Discharge Summary",
        "year": 2021,
        "date": "14-Aug-2021"
    },
    "blood_2023": {
        "text": "DR. LAL PATHLABS CLINICAL REFERENCE LABORATORY. Date of Collection: 10-Nov-2023. Patient: {PATIENT_NAME} (Age: 65/M). Referring Physician: Dr. S. K. Gupta, MD. TEST: Glycated Hemoglobin (HbA1c): 8.4% (Reference Range: < 5.7% Normal, 5.7-6.4% Prediabetes, >=6.5% Diabetes). Fasting Blood Glucose: 164 mg/dL (Ref: 70-99). Postprandial Glucose: 228 mg/dL. LIPID PROFILE: Total Cholesterol: 218 mg/dL (Desirable < 200). LDL Cholesterol: 138 mg/dL (Optimal < 100). Serum Triglycerides: 192 mg/dL. Serum Creatinine: 0.92 mg/dL. Impression: Suboptimally controlled Type 2 Diabetes Mellitus with Mixed Dyslipidemia. Rx: Tab Metformin 1000mg BD with meals, Tab Atorvastatin 20mg HS.",
        "type": "Blood Report",
        "year": 2023,
        "date": "10-Nov-2023"
    },
    "imaging_2024": {
        "text": "FORTIS ESCORTS HEART & CHEST INSTITUTE, OKHLA, NEW DELHI. DEPARTMENT OF RADIODIAGNOSIS. DIGITAL CHEST RADIOGRAPHY (PA VIEW). Date: 18-May-2024. Patient: {PATIENT_NAME} (Age: 66/M). Radiologist: Dr. Sunita Kulkarni, DMRD. FINDINGS: Both lung fields are clear. No evidence of focal parenchymal consolidation, infiltrate, cavitation, or pleural effusion. The cardiac silhouette is mildly enlarged with a cardiothoracic ratio of ~52% (Borderline Hypertensive Cardiomegaly). Aortic knob is prominent with atherosclerotic calcification. Bilateral costophrenic angles and domes of diaphragm are normal. IMPRESSION: Mild cardiomegaly and aortic tortuosity consistent with chronic systemic hypertension. Lungs clear. Rx: Tab Telmisartan 40mg OD, Tab Amlodipine 5mg OD.",
        "type": "Imaging",
        "year": 2024,
        "date": "18-May-2024"
    },
    "prescription_2026": {
        "text": "AIIMS NEW DELHI - DEPARTMENT OF MEDICINE OUTPATIENT CLINIC. Date: 02-Sep-2026. Patient: {PATIENT_NAME} (68/M). Consultant: Dr. S. K. Gupta, MD. Vitals: BP 142/92 mmHg, PR 86 bpm, SpO2 96%, Temp 100.8 F. Complaints: 3-day history of high fever, productive cough with sputum, chest heaviness. DIAGNOSIS: 1. Essential Systemic Hypertension (Stage 2) 2. Type 2 Diabetes Mellitus 3. Acute Upper Respiratory Tract Bronchial Congestion. Rx: 1. Tab Telmisartan 40mg OD morning after breakfast x 30 days. 2. Tab Metformin 500mg BD after meals x 30 days. 3. Tab Amoxicillin + Potassium Clavulanate 625mg BD x 5 days. 4. Syp Levosalbutamol + Ambroxol 10ml TID x 7 days. 5. Tab Paracetamol 650mg SOS for fever > 100 F. Review after 30 days or report to Emergency if breathlessness worsens.",
        "type": "Prescription",
        "year": 2026,
        "date": "02-Sep-2026"
    }
}

@router.post("/upload", response_model=MedicalReportAnalysis)
async def upload_and_analyze_medical_report(
    report_image: UploadFile = File(..., description="Prescription or lab report image (PNG, JPEG, WEBP, PDF)"),
    session_id: Optional[str] = Form(None, description="Unique session ID to scope documents and prevent mixing"),
    patient_name: Optional[str] = Form(None, description="Patient name for cross-referencing")
) -> MedicalReportAnalysis:
    """
    Step 3: Medical Document OCR and Chronological Timeline Pipeline:
    1. Uploads an image of past prescription, discharge summary, blood report, or imaging.
    2. Strictly saves the image under the unique session ID directory to prevent data mixing.
    3. Uses Google Cloud Vision API to extract OCR text.
    4. Uses Gemini 3.1 Pro to extract:
       - Document Date / Year
       - Document Type (Prescription, Blood Report, Imaging, Discharge Summary)
       - Key Findings / Extracted Medications
    5. Appends the structured entry into the patient's 'medical_timeline' array.
    6. Sorts the timeline in ASCENDING chronological order (oldest to newest: e.g. 2021 -> 2023 -> 2024 -> 2026).
    7. Persists 'medical_timeline' directly in the Firebase session document and broadcasts real-time WebSocket update.
    """
    try:
        image_bytes = await report_image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty report image file uploaded.")

        logger.info(
            "📥 [Report API] Received report image '%s' (%d bytes) for session: %s (patient: %s)",
            report_image.filename, len(image_bytes), session_id, patient_name
        )

        # Step 1: Session-isolated local file persistence
        safe_filename = os.path.basename(report_image.filename or f"report_{uuid.uuid4().hex[:6]}.jpg")
        effective_session = session_id or f"default_{uuid.uuid4().hex[:8]}"
        session_upload_dir = os.path.join("uploads", "sessions", effective_session, "reports")
        os.makedirs(session_upload_dir, exist_ok=True)
        local_file_path = os.path.join(session_upload_dir, safe_filename)

        with open(local_file_path, "wb") as f:
            f.write(image_bytes)
        logger.info("💾 Saved report file locally at: %s", local_file_path)

        # Step 2: Google Cloud Vision API OCR
        ocr_result = vision_service.extract_text_from_image(image_bytes)
        extracted_text = ocr_result.get("text", "")

        if not extracted_text:
            raise HTTPException(status_code=422, detail="No readable text could be extracted from this image.")

        # Step 3: Gemini 3.1 Pro Structured Extraction
        logger.info("Running Gemini 3.1 Pro structured extraction for Chronological Medical Timeline...")
        report_analysis = gemini_service.parse_medical_report(extracted_text)

        # Step 4: Construct structured MedicalTimelineEntry
        storage_rel_path = f"sessions/{effective_session}/reports/{safe_filename}"
        doc_date = report_analysis.document_date or report_analysis.report_date or datetime.now(timezone.utc).strftime("%d-%b-%Y")
        doc_year = int(report_analysis.document_year or extract_year_from_date_str(doc_date))
        doc_type = report_analysis.document_type or "Prescription"
        doc_title = report_analysis.title or f"{doc_type} ({doc_year})"
        findings = report_analysis.key_findings or [report_analysis.clinical_summary]

        timeline_entry = {
            "id": f"DOC-{uuid.uuid4().hex[:8].upper()}",
            "document_date": doc_date,
            "document_year": doc_year,
            "document_type": doc_type,
            "title": doc_title,
            "key_findings": findings,
            "extracted_medications": [m.model_dump() for m in report_analysis.medications],
            "diagnoses": [d.model_dump() for d in report_analysis.diagnoses],
            "doctor_name": report_analysis.doctor_name,
            "hospital_name": report_analysis.hospital_name,
            "clinical_summary": report_analysis.clinical_summary,
            "storage_path": storage_rel_path,
            "raw_ocr_snippet": extracted_text[:400] if extracted_text else "",
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }

        doc_record = {
            **timeline_entry,
            "filename": safe_filename,
            "session_id": effective_session,
            "file_type": report_image.content_type or "image/jpeg",
            "file_size": len(image_bytes),
            "medications": [m.model_dump() for m in report_analysis.medications],
            "lifestyle_advice": report_analysis.lifestyle_advice
        }

        # Step 5: Merge with existing medical_timeline and sort ASCENDING
        existing_timeline: List[Dict[str, Any]] = []
        if effective_session in patient_service._patients_cache:
            existing_timeline = list(patient_service._patients_cache[effective_session].get("medical_timeline") or [])
        else:
            for p in patient_service._patients_cache.values():
                if p.get("patient_id") == effective_session or p.get("session_id") == effective_session:
                    existing_timeline = list(p.get("medical_timeline") or [])
                    break

        existing_timeline.append(timeline_entry)
        sorted_timeline = sort_medical_timeline(existing_timeline)

        # Update in-memory patient cache
        if effective_session in patient_service._patients_cache:
            patient_service._patients_cache[effective_session]["medical_timeline"] = sorted_timeline
            existing_docs = patient_service._patients_cache[effective_session].setdefault("uploaded_documents", [])
            existing_docs.append(doc_record)
        else:
            for p in patient_service._patients_cache.values():
                if p.get("patient_id") == effective_session or p.get("session_id") == effective_session:
                    p["medical_timeline"] = sorted_timeline
                    p.setdefault("uploaded_documents", []).append(doc_record)
                    break

        # Step 6: Persist sorted timeline under 'medical_timeline' in Firestore
        db = get_firestore_client()
        if db is not None:
            try:
                # Update session doc in 'sessions'
                session_ref = db.collection("sessions").document(effective_session)
                session_snap = session_ref.get()
                if session_snap.exists:
                    curr_docs = session_snap.to_dict().get("uploaded_documents", [])
                    curr_docs.append(doc_record)
                    session_ref.update({
                        "medical_timeline": sorted_timeline,
                        "uploaded_documents": curr_docs,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    })

                # Update patient doc in 'patients'
                patient_ref = db.collection("patients").document(effective_session)
                patient_snap = patient_ref.get()
                if patient_snap.exists:
                    p_docs = patient_snap.to_dict().get("uploaded_documents", [])
                    p_docs.append(doc_record)
                    patient_ref.update({
                        "medical_timeline": sorted_timeline,
                        "uploaded_documents": p_docs,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    })

                logger.info("✅ Saved sorted medical_timeline (%d entries) to Firestore for session '%s'", len(sorted_timeline), effective_session)
            except Exception as fe:
                logger.warning("Firestore document update notice: %s", fe)

        # Step 7: Broadcast real-time WebSocket event
        try:
            await ws_manager.broadcast_json({
                "type": "TIMELINE_UPDATED",
                "session_id": effective_session,
                "medical_timeline": sorted_timeline,
                "latest_entry": timeline_entry,
                "document": doc_record,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as we:
            logger.warning("WebSocket broadcast error for timeline: %s", we)

        # Attach sorted timeline to response object
        report_analysis.medical_timeline = sorted_timeline
        return report_analysis

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Medical report analysis failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Medical report processing failed: {str(e)}")

@router.post("/parse-text", response_model=MedicalReportAnalysis)
def parse_report_text(request: ReportTextRequest) -> MedicalReportAnalysis:
    """
    Direct endpoint to parse raw medical prescription/lab report text into Diagnoses and Medications.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    return gemini_service.parse_medical_report(request.text)

@router.get("/timeline/{session_id}")
async def get_patient_timeline(session_id: str) -> List[Dict[str, Any]]:
    """
    Retrieves the chronological medical timeline for a patient session sorted in ascending order (oldest to newest).
    """
    timeline: List[Dict[str, Any]] = []

    # 1. Try Firestore
    db = get_firestore_client()
    if db is not None:
        try:
            snap = db.collection("sessions").document(session_id).get()
            if snap.exists:
                timeline = snap.to_dict().get("medical_timeline", [])
        except Exception as e:
            logger.warning("Error reading timeline from Firestore: %s", e)

    # 2. Try in-memory cache
    if not timeline and session_id in patient_service._patients_cache:
        timeline = patient_service._patients_cache[session_id].get("medical_timeline", [])
    elif not timeline:
        for p in patient_service._patients_cache.values():
            if p.get("patient_id") == session_id or p.get("session_id") == session_id:
                timeline = p.get("medical_timeline", [])
                break

    return sort_medical_timeline(timeline)

@router.post("/demo-sample")
@router.post("/inject-demo-samples")
async def inject_demo_sample(request: DemoSampleRequest) -> Dict[str, Any]:
    """
    Injects pre-extracted sample medical documents into the session's 'medical_timeline'
    for instant 1-click evaluation without requiring local image files.
    All entries are strictly sorted in ASCENDING order (oldest to newest).
    """
    effective_session = request.session_id.strip()
    keys_to_inject = (
        ["discharge_2021", "blood_2023", "imaging_2024", "prescription_2026"]
        if request.sample_type == "all"
        else [request.sample_type]
    )

    existing_timeline: List[Dict[str, Any]] = []
    if effective_session in patient_service._patients_cache:
        existing_timeline = list(patient_service._patients_cache[effective_session].get("medical_timeline") or [])
    else:
        for p in patient_service._patients_cache.values():
            if p.get("patient_id") == effective_session or p.get("session_id") == effective_session:
                existing_timeline = list(p.get("medical_timeline") or [])
                break

    # Resolve real patient name for zero-mock personalization
    session_patient_name = "Patient"
    if effective_session in patient_service._patients_cache:
        session_patient_name = patient_service._patients_cache[effective_session].get("name") or "Patient"

    injected_count = 0
    for key in keys_to_inject:
        sample_info = DEMO_DOCUMENT_SAMPLES.get(key)
        if not sample_info:
            continue

        raw_sample_text = sample_info["text"].replace("{PATIENT_NAME}", session_patient_name).replace("Rameshwar Dayal", session_patient_name)
        parsed = gemini_service.parse_medical_report(raw_sample_text)
        entry = {
            "id": f"DOC-DEMO-{sample_info['year']}-{uuid.uuid4().hex[:4].upper()}",
            "document_date": parsed.document_date or sample_info["date"],
            "document_year": parsed.document_year or sample_info["year"],
            "document_type": parsed.document_type or sample_info["type"],
            "title": parsed.title or f"{sample_info['type']} ({sample_info['year']})",
            "key_findings": parsed.key_findings or [parsed.clinical_summary],
            "extracted_medications": [m.model_dump() for m in parsed.medications],
            "diagnoses": [d.model_dump() for d in parsed.diagnoses],
            "doctor_name": parsed.doctor_name,
            "hospital_name": parsed.hospital_name,
            "clinical_summary": parsed.clinical_summary,
            "storage_path": f"sessions/{effective_session}/reports/demo_{key}.pdf",
            "raw_ocr_snippet": sample_info["text"][:400],
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }

        # Prevent duplicate insertion of identical year and type
        if not any(e.get("document_year") == entry["document_year"] and e.get("document_type") == entry["document_type"] for e in existing_timeline):
            existing_timeline.append(entry)
            injected_count += 1

    sorted_timeline = sort_medical_timeline(existing_timeline)

    # Update cache
    if effective_session in patient_service._patients_cache:
        patient_service._patients_cache[effective_session]["medical_timeline"] = sorted_timeline
    else:
        for p in patient_service._patients_cache.values():
            if p.get("patient_id") == effective_session or p.get("session_id") == effective_session:
                p["medical_timeline"] = sorted_timeline
                break

    # Persist in Firestore
    db = get_firestore_client()
    if db is not None:
        try:
            session_ref = db.collection("sessions").document(effective_session)
            session_snap = session_ref.get()
            if session_snap.exists:
                session_ref.update({
                    "medical_timeline": sorted_timeline,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                })
            patient_ref = db.collection("patients").document(effective_session)
            patient_snap = patient_ref.get()
            if patient_snap.exists:
                patient_ref.update({
                    "medical_timeline": sorted_timeline,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                })
        except Exception as e:
            logger.warning("Firestore update in demo-sample: %s", e)

    # Broadcast WebSocket update
    try:
        await ws_manager.broadcast_json({
            "type": "TIMELINE_UPDATED",
            "session_id": effective_session,
            "medical_timeline": sorted_timeline,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    except Exception as we:
        logger.warning("WebSocket broadcast error: %s", we)

    return {
        "status": "success",
        "injected": injected_count,
        "total_timeline_entries": len(sorted_timeline),
        "medical_timeline": sorted_timeline
    }
