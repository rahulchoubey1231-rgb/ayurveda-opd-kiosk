import logging
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
from app.services.patient_service import patient_service
from app.services.gemini_service import gemini_service, ClinicalSOAPNote, ClinicalSummary
from app.core.firebase import get_firestore_client
from app.core.websocket_manager import ws_manager

logger = logging.getLogger("medikiosk.doctor_api")
router = APIRouter()

class GenerateClinicalSummaryRequest(BaseModel):
    patient_id: Optional[str] = Field(default="UHID-2026-08941", description="Patient identifier / UHID")
    session_id: Optional[str] = Field(default=None, description="Triage voice session ID to auto-fetch Chat History Context")
    chat_history: Optional[List[Dict[str, Any]]] = Field(default=None, description="Full Chat History array [role, text, timestamp]")
    ocr_text: Optional[str] = Field(default="", description="OCR Text from uploaded prescription/lab reports")
    patient_name: Optional[str] = Field(default=None, description="Patient full name")

class AdHocSOAPRequest(BaseModel):
    patient_id: str = "DEMO-AD-HOC"
    name: str = "Clinical Walk-In Patient"
    age: int = 60
    gender: str = "Other"
    vitals: Dict[str, Any] = {}
    voice_history: List[Dict[str, Any]] = []
    uploaded_documents: List[Dict[str, Any]] = []
    allergies: List[str] = ["No known allergies"]
    medical_history: List[str] = []

class UpdateSummaryRequest(BaseModel):
    chief_complaint: Optional[str] = None
    hpi_points: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    medical_history: Optional[List[str]] = None
    current_medications: Optional[List[Dict[str, Any]]] = None
    ayurveda_pariksha: Optional[Dict[str, Any]] = None
    vitals: Optional[Dict[str, Any]] = None
    status: Optional[str] = None

class ApproveEMRRequest(BaseModel):
    doctor_name: Optional[str] = "Dr. A. Sharma, MD"
    notes: Optional[str] = ""
    clinical_digest: Optional[Dict[str, Any]] = None

class GenerateSummaryRequest(BaseModel):
    session_id: Optional[str] = None
    patient_id: Optional[str] = None
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    mobile: Optional[str] = None
    abha_number: Optional[str] = None
    opd_mode: Optional[str] = "allopathy"
    chat_history: Optional[List[Dict[str, Any]]] = None
    medical_timeline: Optional[List[Dict[str, Any]]] = None
    ocr_text: Optional[str] = ""

@router.get("/patients", response_model=List[Dict[str, Any]])
def get_opd_patient_queue() -> List[Dict[str, Any]]:
    """
    Retrieves the active OPD patient queue from Firebase Firestore.
    Each patient includes demographic data, triage urgency, recorded kiosk vitals,
    voice speech transcripts, and uploaded clinical document OCR results.
    """
    return patient_service.get_all_patients()

@router.post("/patients/checkin", response_model=Dict[str, Any])
async def checkin_patient(patient_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Registers a walk-in patient from MediKiosk, adds to OPD queue, and broadcasts
    to Doctor Dashboard via WebSocket in real-time.
    """
    if "voice_history" not in patient_data or patient_data.get("voice_history") is None:
        patient_data["voice_history"] = []
    if "uploaded_documents" not in patient_data or patient_data.get("uploaded_documents") is None:
        patient_data["uploaded_documents"] = []
    return await patient_service.register_or_update_patient(patient_data)

@router.get("/patients/{patient_id}", response_model=Dict[str, Any])
def get_patient_record(
    patient_id: str = Path(..., description="Unique Patient UHID")
) -> Dict[str, Any]:
    """
    Retrieves full clinical file for a single patient by UHID.
    """
    patient = patient_service.get_patient_by_id(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient '{patient_id}' not found.")
    return patient

@router.put("/patients/{patient_id}/summary", response_model=Dict[str, Any])
async def update_patient_summary_endpoint(
    patient_id: str = Path(..., description="Unique Patient UHID"),
    request: UpdateSummaryRequest = ...
) -> Dict[str, Any]:
    """
    Updates the doctor's inline edits to the clinical summary (chief complaint, HPI points, medications, etc.).
    """
    try:
        return await patient_service.update_patient_summary(
            patient_id,
            request.model_dump(exclude_unset=True)
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to update patient summary: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/patients/{patient_id}/approve-emr", response_model=Dict[str, Any])
async def approve_and_lock_emr_endpoint(
    patient_id: str = Path(..., description="Unique Patient UHID"),
    request: ApproveEMRRequest = ...
) -> Dict[str, Any]:
    """
    Locks the clinical record, timestamps the doctor approval, and assigns an ABDM transaction reference.
    """
    try:
        return await patient_service.approve_and_lock_emr(
            patient_id=patient_id,
            doctor_name=request.doctor_name or "Dr. A. Sharma, MD",
            notes=request.notes or "",
            clinical_digest=request.clinical_digest
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to approve and lock EMR: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/patients/{patient_id}/soap-note", response_model=ClinicalSOAPNote)
def generate_patient_soap_note(
    patient_id: str = Path(..., description="Unique Patient UHID")
) -> ClinicalSOAPNote:
    """
    Uses Gemini 3.1 Pro to synthesize the patient's voice consultation history,
    kiosk biometric sensor telemetry, and uploaded document OCR records into an
    official Clinical SOAP Note (Subjective, Objective, Assessment, Plan).
    Persists the generated note back to Firebase Firestore.
    """
    try:
        logger.info("Generating Gemini SOAP Note for patient %s...", patient_id)
        return patient_service.generate_and_save_soap_note(patient_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to generate SOAP note: %s", e)
        raise HTTPException(status_code=500, detail=f"SOAP note generation failed: {str(e)}")

@router.post("/generate-soap", response_model=ClinicalSOAPNote)
def generate_adhoc_soap_note(request: AdHocSOAPRequest) -> ClinicalSOAPNote:
    """
    Direct endpoint allowing doctors or clinical systems to generate a Gemini 3.1 Pro SOAP note
    from arbitrary voice statements, sensor vitals, and document texts.
    """
    try:
        return gemini_service.generate_soap_note(request.model_dump())
    except Exception as e:
        logger.error("Failed to generate ad-hoc SOAP note: %s", e)
        raise HTTPException(status_code=500, detail=f"SOAP note generation failed: {str(e)}")

@router.post("/seed-firestore")
def seed_firestore_patients() -> Dict[str, Any]:
    """
    Seeds demo clinical patient records to Firebase Firestore.
    """
    return patient_service.seed_firestore_patients()

@router.post("/generate-clinical-summary", response_model=ClinicalSummary)
async def generate_clinical_summary_endpoint(request: GenerateClinicalSummaryRequest) -> ClinicalSummary:
    """
    Synthesizes the full 'Chat History' and 'OCR Text from uploaded reports' using Gemini 1.5 Pro
    into a strictly formatted Clinical Summary JSON:
    1. Chief Complaint
    2. History of Present Illness (HPI)
    3. Past Medical History
    4. Extracted Lab Values / Medications
    Persists the result to Firebase Firestore and triggers real-time Doctor Dashboard updates.
    """
    return await handle_generate_clinical_summary(request)

async def handle_generate_clinical_summary(
    request: GenerateClinicalSummaryRequest
) -> ClinicalSummary:
    """
    Core handler synthesizing Chat History and OCR Text via Gemini 1.5 Pro.
    """
    try:
        patient_id = request.session_id or request.patient_id or "UHID-2026-08941"
        patient = patient_service.get_patient_by_id(patient_id)
        patient_name = request.patient_name or (patient.get("name") if patient else "Walk-in Kiosk Patient")

        # 1. Resolve Chat History
        chat_history = request.chat_history
        if not chat_history:
            if request.session_id:
                chat_history = gemini_service.get_chat_history_context(request.session_id)
            if not chat_history and patient:
                chat_history = [
                    {"role": "user", "text": v.get("text"), "timestamp": v.get("timestamp")}
                    for v in patient.get("voice_history", [])
                ]
        chat_history = chat_history or []

        # 2. Resolve OCR Text from uploaded reports
        ocr_text = request.ocr_text or ""
        if not ocr_text.strip() and patient:
            docs = patient.get("uploaded_documents", [])
            ocr_texts = [d.get("ocr_text", "") for d in docs if d.get("ocr_text")]
            ocr_text = "\n\n".join(ocr_texts)

        logger.info(
            "📋 [/generate-clinical-summary] Synthesizing summary for patient '%s' (%s): %d chat turns, %d OCR chars",
            patient_name, patient_id, len(chat_history), len(ocr_text)
        )

        # 3. Call Gemini 1.5 Pro to generate structured Clinical Summary
        summary = gemini_service.generate_clinical_summary(
            chat_history=chat_history,
            ocr_text=ocr_text,
            patient_info={
                "patient_id": patient_id,
                "name": patient_name
            },
            model_name="gemini-3.1-pro-preview"
        )

        # 4. Persist to Firebase Firestore & broadcast WebSocket alert
        await patient_service.save_clinical_summary(patient_id, summary)

        return summary
    except Exception as e:
        logger.error("❌ Failed to generate clinical summary: %s", e)
        raise HTTPException(status_code=500, detail=f"Clinical summary generation failed: {str(e)}")

@router.post("/generate-summary")
async def generate_summary_endpoint(request: GenerateSummaryRequest) -> Dict[str, Any]:
    """
    Synthesizes conversation history and medical reports into a standardized SOAP note,
    pushes to Firestore queue for Doctor Dashboard live display, and returns token details.
    """
    return await handle_generate_summary(request)

async def handle_generate_summary(request: GenerateSummaryRequest) -> Dict[str, Any]:
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        session_id = request.session_id or request.patient_id or f"SES-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
        
        # Resolve patient metadata
        db = get_firestore_client()
        existing_data = patient_service.get_patient_by_id(session_id) or {}
        if not existing_data and db is not None:
            try:
                s_doc = db.collection("sessions").document(session_id).get()
                if s_doc.exists:
                    existing_data = s_doc.to_dict()
            except Exception as e:
                logger.warning("Could not read session from Firestore: %s", e)

        full_name = request.full_name or existing_data.get("name") or existing_data.get("full_name") or "Patient"
        age = request.age or existing_data.get("age") or 30
        gender = request.gender or existing_data.get("gender") or "Other"
        mobile = request.mobile or existing_data.get("phone") or existing_data.get("mobile") or ""
        abha_number = request.abha_number or existing_data.get("abha_id") or existing_data.get("abha_number") or ""
        opd_mode = (request.opd_mode or existing_data.get("mode") or "allopathy").lower()

        # Resolve chat history
        chat_history = request.chat_history or existing_data.get("chat_history") or []
        if not chat_history and session_id:
            chat_history = gemini_service.get_chat_history_context(session_id)

        # Resolve OCR from timeline or text
        ocr_text = request.ocr_text or ""
        timeline = request.medical_timeline or existing_data.get("medical_timeline") or []
        if not ocr_text.strip() and timeline:
            ocr_parts = []
            for t_item in timeline:
                findings = ", ".join(t_item.get("key_findings", []))
                meds = ", ".join([m.get("name", "") for m in t_item.get("extracted_medications", [])])
                ocr_parts.append(f"Document ({t_item.get('document_type', 'Report')} - {t_item.get('document_date', '')}): {findings}. Meds: {meds}")
            ocr_text = "\n\n".join(ocr_parts)

        # Generate Clinical Summary via Gemini
        summary = gemini_service.generate_clinical_summary(
            chat_history=chat_history,
            ocr_text=ocr_text,
            patient_info={"patient_id": session_id, "name": full_name},
            model_name="gemini-3.1-pro-preview"
        )
        summary_dict = summary.model_dump()

        # Generate SOAP Note via Gemini
        patient_payload = {
            "patient_id": session_id,
            "name": full_name,
            "age": age,
            "gender": gender,
            "voice_history": [{"text": c.get("text", ""), "timestamp": c.get("timestamp", now_iso)} for c in chat_history],
            "uploaded_documents": [{"ocr_text": ocr_text}],
            "allergies": summary.past_medical_history,
            "medical_history": summary.past_medical_history,
            "vitals": {"blood_pressure": "120/80 mmHg", "heart_rate": 74, "spo2": 98, "temperature": 98.6, "respiratory_rate": 18}
        }
        soap_note = gemini_service.generate_soap_note(patient_payload)
        soap_dict = soap_note.model_dump()

        # Token & Department details
        dept = "Ayurveda & Kayachikitsa OPD (Room 108)" if opd_mode == "ayurveda" else "General Medicine OPD (Room 102)"
        doc_assigned = "Vaidya R. K. Shastri, BAMS, MD (Ayu)" if opd_mode == "ayurveda" else "Dr. A. K. Sharma, Senior Physician"
        room_num = "Room No. 108, First Floor" if opd_mode == "ayurveda" else "Room No. 102, First Floor"
        token_num = f"#{'AYU' if opd_mode == 'ayurveda' else 'OPD'}-{session_id.split('-')[-1][:4].upper()}"

        token_details = {
            "token_number": token_num,
            "department": dept,
            "doctor_name": doc_assigned,
            "room_number": room_num,
            "estimated_wait": "Approx. 15-20 mins",
            "queue_ahead": 2,
            "generated_at": now_iso,
            "status": "Clinical History Transmitted to Doctor"
        }

        # Formulate full patient record for doctor dashboard queue
        patient_record = {
            "patient_id": session_id,
            "name": full_name,
            "age": age,
            "gender": gender,
            "phone": mobile,
            "abha_id": abha_number,
            "token_number": token_num,
            "triage_priority": "Normal OPD",
            "department": dept,
            "mode": opd_mode,
            "is_red_flag": False,
            "emr_status": "DRAFT",
            "chief_complaint": summary.chief_complaint,
            "hpi_points": [summary.history_of_present_illness] if summary.history_of_present_illness else [],
            "current_medications": summary_dict.get("extracted_lab_values_medications", {}).get("medications", []),
            "medical_history": summary.past_medical_history or [],
            "allergies": ["No known drug allergies (NKDA)"],
            "vitals": {
                "blood_pressure": "120/80 mmHg",
                "heart_rate": 74,
                "spo2": 98,
                "temperature": 98.6,
                "respiratory_rate": 18
            },
            "chat_history": chat_history,
            "medical_timeline": timeline,
            "clinical_summary": summary_dict,
            "soap_note": soap_dict,
            "token_details": token_details,
            "checkin_time": now_iso,
            "status": "Ready for Doctor Consultation",
            "created_at": now_iso,
            "updated_at": now_iso
        }

        # Persist to in-memory patient cache
        patient_service._patients_cache[session_id] = patient_record

        # Persist to Firestore
        if db is not None:
            try:
                db.collection("patients").document(session_id).set(patient_record, merge=True)
                db.collection("sessions").document(session_id).set(patient_record, merge=True)
                logger.info("✅ Pushed authentic patient '%s' (%s) to Firestore 'patients' queue", full_name, session_id)
            except Exception as fe:
                logger.error("Failed to write to Firestore: %s", fe)

        # Broadcast live to doctor dashboard via WebSocket
        try:
            await ws_manager.broadcast_json({
                "type": "PATIENT_REGISTERED",
                "patient": patient_record,
                "session_id": session_id,
                "timestamp": now_iso
            })
            await ws_manager.broadcast_json({
                "type": "PATIENT_SUMMARY_UPDATED",
                "patient_id": session_id,
                "summary": summary_dict,
                "soap_note": soap_dict,
                "timestamp": now_iso
            })
            logger.info("📡 Broadcasted live PATIENT_REGISTERED for '%s' to Doctor Dashboard", full_name)
        except Exception as ws_err:
            logger.warning("WebSocket broadcast error: %s", ws_err)

        return {
            "success": True,
            "session_id": session_id,
            "summary": summary_dict,
            "soap_note": soap_dict,
            "token_details": token_details,
            "patient": patient_record
        }
    except Exception as e:
        logger.error("❌ Error in handle_generate_summary: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")

