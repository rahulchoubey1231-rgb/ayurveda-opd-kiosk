from datetime import datetime, timezone
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.firebase import get_firestore_client, is_firebase_initialized
from app.core.config import settings
from app.services.patient_service import patient_service

router = APIRouter()

class TelemetryData(BaseModel):
    temperature: float = 98.6
    heart_rate: int = 72
    spo2: int = 98
    systolic_bp: int = 120
    diastolic_bp: int = 80
    patient_id: str = "DEMO-PATIENT-001"

@router.get("/health")
def health_check() -> Dict[str, Any]:
    firebase_ready = is_firebase_initialized()
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "firebase_connected": firebase_ready,
        "database": "Cloud Firestore" if firebase_ready else "Firestore (Pending Service Account Key)",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/kiosk/status")
def get_kiosk_status() -> Dict[str, Any]:
    return {
        "kiosk_id": "MEDIKIOSK-UNIT-01",
        "location": "Primary Health Centre - Booth 1",
        "status": "online",
        "connected_peripherals": {
            "digital_stethoscope": "connected",
            "pulse_oximeter": "connected",
            "blood_pressure_cuff": "connected",
            "infrared_thermometer": "connected",
            "camera": "connected"
        },
        "system_health": {
            "cpu_usage_pct": 14.2,
            "memory_usage_pct": 38.5,
            "storage_free_gb": 128.4
        },
        "last_sync": datetime.now(timezone.utc).isoformat()
    }

@router.post("/kiosk/test-db")
def test_database_write(data: TelemetryData) -> Dict[str, Any]:
    db = get_firestore_client()
    record_payload = {
        "patient_id": data.patient_id,
        "vitals": {
            "temperature": data.temperature,
            "heart_rate": data.heart_rate,
            "spo2": data.spo2,
            "blood_pressure": f"{data.systolic_bp}/{data.diastolic_bp}"
        },
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    # Also register patient into patient_service cache if not present
    if not patient_service.get_patient_by_id(data.patient_id):
        patient_service._patients_cache[data.patient_id] = {
            "patient_id": data.patient_id,
            "name": f"Kiosk Patient ({data.patient_id})",
            "age": 45,
            "gender": "Other",
            "phone": "+91 98765 00000",
            "abha_id": "91-0000-0000-0000",
            "token_number": data.patient_id,
            "triage_priority": "Normal OPD",
            "department": "General Medicine OPD (Room 102)",
            "checkin_time": datetime.now(timezone.utc).isoformat(),
            "status": "Waiting for Doctor",
            "allergies": ["No known allergies"],
            "medical_history": ["Kiosk Registration"],
            "vitals": record_payload["vitals"],
            "voice_history": [],
            "uploaded_documents": [],
            "soap_note": None,
            "clinical_summary": None
        }
    
    if db is not None:
        try:
            doc_ref = db.collection("telemetry_records").add(record_payload)
            doc_id = doc_ref[1].id
            return {
                "success": True,
                "message": "Record saved to Firestore successfully!",
                "firestore_doc_id": doc_id,
                "record": record_payload
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Firestore error: {str(e)}")
    else:
        return {
            "success": True,
            "message": "Mock record created successfully. Note: Real Firestore write will occur once FIREBASE_CREDENTIALS_PATH is set in backend/.env.",
            "mode": "demo/unconfigured_firebase",
            "record": record_payload
        }

@router.post("/kiosk/checkin", response_model=Dict[str, Any])
async def kiosk_checkin_patient(patient_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Registers a walk-in patient from MediKiosk, adds to OPD queue, and broadcasts
    to Doctor Dashboard via WebSocket in real-time.
    """
    if "voice_history" not in patient_data or patient_data.get("voice_history") is None:
        patient_data["voice_history"] = []
    if "uploaded_documents" not in patient_data or patient_data.get("uploaded_documents") is None:
        patient_data["uploaded_documents"] = []
    return await patient_service.register_or_update_patient(patient_data)
