import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Any, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from google import genai
from google.genai import types

from app.services.gemini_service import (
    gemini_service,
    sort_medical_timeline,
    extract_year_from_date_str,
)
from app.core.firebase import get_firestore_client
from app.services.patient_service import patient_service
from app.core.websocket_manager import ws_manager

logger = logging.getLogger("medikiosk.ocr_api")
router = APIRouter()

class OCRResponse(BaseModel):
    document_date: str
    document_type: str
    hospital_or_doctor: str
    medications: List[str]
    key_findings: str
    summary: str

@router.post("/scan")
async def scan_medical_document(
    image: UploadFile = File(..., description="Prescription or lab report image (PNG, JPG, JPEG)"),
    session_id: Optional[str] = Form(None, description="Unique session ID to scope documents and prevent mixing"),
    patient_name: Optional[str] = Form(None, description="Patient name for cross-referencing")
):
    """
    Live Medical Document OCR using Google Gemini Vision natively.
    """
    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty report image file uploaded.")
            
        mime_type = image.content_type or "image/jpeg"

        logger.info(
            "📥 [OCR API] Received report image '%s' (%d bytes, %s) for session: %s (patient: %s)",
            image.filename, len(image_bytes), mime_type, session_id, patient_name
        )

        logger.info("🤖 [OCR API] Passing image directly to Gemini Vision for OCR and structured extraction...")
        
        prompt = f"""
        You are a medical OCR engine. Read this real image and extract:
        {{
          "document_date": "extracted date or year",
          "document_type": "Prescription / Lab Report / etc.",
          "hospital_or_doctor": "extracted name",
          "medications": ["extracted medicine names"],
          "key_findings": "extracted findings",
          "summary": "brief summary"
        }}
        Return strictly valid JSON.
        Patient Name context (if present): {patient_name}
        """
        
        # Use the gemini client from gemini_service
        client = gemini_service.client
        
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=[
                prompt,
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=OCRResponse,
                temperature=0.1
            )
        )
        
        import json
        try:
            report_data = json.loads(response.text)
            report_analysis = OCRResponse(**report_data)
        except Exception as e:
            logger.error(f"Failed to parse Gemini JSON output: {e}. Raw text: {response.text}")
            raise HTTPException(status_code=500, detail="Failed to parse OCR response from Gemini.")
        
        # Construct structured MedicalTimelineEntry
        safe_filename = os.path.basename(image.filename or f"ocr_{uuid.uuid4().hex[:6]}.jpg")
        effective_session = session_id or f"default_{uuid.uuid4().hex[:8]}"
        
        session_upload_dir = os.path.join("uploads", "sessions", effective_session, "reports")
        os.makedirs(session_upload_dir, exist_ok=True)
        local_file_path = os.path.join(session_upload_dir, safe_filename)
        with open(local_file_path, "wb") as f:
            f.write(image_bytes)

        storage_rel_path = f"sessions/{effective_session}/reports/{safe_filename}"
        doc_date = report_analysis.document_date or datetime.now(timezone.utc).strftime("%d-%b-%Y")
        doc_year = extract_year_from_date_str(doc_date)
        doc_type = report_analysis.document_type or "Prescription"
        doc_title = f"{doc_type} from {report_analysis.hospital_or_doctor}" if report_analysis.hospital_or_doctor else f"{doc_type} ({doc_year})"

        timeline_entry = {
            "id": f"DOC-{uuid.uuid4().hex[:8].upper()}",
            "document_date": doc_date,
            "document_year": doc_year,
            "document_type": doc_type,
            "title": doc_title,
            "key_findings": [report_analysis.key_findings],
            "extracted_medications": report_analysis.medications,
            "diagnoses": [],
            "clinical_summary": report_analysis.summary,
            "doctor_name": report_analysis.hospital_or_doctor,
            "hospital_name": report_analysis.hospital_or_doctor,
            "file_url": f"/api/reports/download/{storage_rel_path.replace('/', '%2F')}",
            "raw_ocr_text": "Extracted via Gemini Vision OCR natively.",
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }

        db = get_firestore_client()
        if db and session_id:
            try:
                session_ref = db.collection("triage_sessions").document(session_id)
                doc_snap = session_ref.get()
                if doc_snap.exists:
                    current_data = doc_snap.to_dict() or {}
                    current_timeline = current_data.get("medical_timeline", [])
                    
                    if not any(item.get("file_url") == timeline_entry["file_url"] for item in current_timeline):
                        current_timeline.append(timeline_entry)
                        sorted_timeline = sort_medical_timeline(current_timeline)
                        
                        session_ref.update({
                            "medical_timeline": sorted_timeline,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        })
                        logger.info("✅ Appended OCR scan to medical_timeline for session %s", session_id)
                        
                        ws_manager.broadcast_sync({
                            "type": "NEW_REPORT_ANALYZED",
                            "session_id": session_id,
                            "timeline_entry": timeline_entry
                        })
            except Exception as e:
                logger.error("Failed to append OCR result to Firestore: %s", e)

        # Return the parsed response to match the frontend expectations
        return timeline_entry

    except Exception as e:
        logger.exception("Error processing OCR scan")
        raise HTTPException(status_code=500, detail=str(e))
