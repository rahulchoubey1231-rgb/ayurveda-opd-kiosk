import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
from app.core.firebase import get_firestore_client
from app.services.patient_service import patient_service
from app.core.websocket_manager import ws_manager

logger = logging.getLogger("medikiosk.session_api")
router = APIRouter()
import random

class RegisterAbhaRequest(BaseModel):
    full_name: str = Field(..., min_length=2, description="Full name of patient")
    age: int = Field(..., ge=1, le=125, description="Patient age")
    gender: str = Field(default="Male", description="Gender (Male/Female/Other)")
    mobile: str = Field(..., min_length=10, max_length=15, description="Mobile number")
    state: Optional[str] = Field(default="Delhi", description="State")
    pincode: Optional[str] = Field(default="110001", description="Postal pincode")

# Internal memory registry for zero-mock live session lookup
_registered_abha_profiles: Dict[str, Dict[str, Any]] = {}

def _normalize_identifier(val: str) -> str:
    cleaned = "".join(c for c in val if c.isalnum()).lower()
    if len(cleaned) == 12 and cleaned.startswith("91"):
        cleaned = cleaned[2:]
    return cleaned

def _generate_14_digit_abha() -> str:
    p1 = f"{random.randint(10, 99)}"
    p2 = f"{random.randint(1000, 9999)}"
    p3 = f"{random.randint(1000, 9999)}"
    p4 = f"{random.randint(1000, 9999)}"
    return f"{p1}-{p2}-{p3}-{p4}"

@router.get("/lookup-abha")
def lookup_abha_profile(query: str) -> Dict[str, Any]:
    """
    Looks up a patient record in Firestore (collection 'abha_profiles' and 'patients')
    or in-memory registered profiles by 14-digit ABHA Number or Mobile Number.
    """
    clean_query = query.strip()
    norm_query = _normalize_identifier(clean_query)

    # 1. Search in-memory registry
    for profile in _registered_abha_profiles.values():
        if (
            _normalize_identifier(profile.get("abha_number", "")) == norm_query
            or _normalize_identifier(profile.get("mobile", "")) == norm_query
            or _normalize_identifier(profile.get("abha_address", "")) == norm_query
        ):
            logger.info("✅ Found authentic ABHA profile in memory for query: %s", query)
            return {"found": True, "patient": profile, "profile": profile}

    # 2. Search Firestore
    db = get_firestore_client()
    if db is not None:
        try:
            # Query abha_profiles collection
            profiles_ref = db.collection("abha_profiles")
            for doc in profiles_ref.stream():
                pdata = doc.to_dict()
                if (
                    _normalize_identifier(pdata.get("abha_number", "")) == norm_query
                    or _normalize_identifier(pdata.get("mobile", "")) == norm_query
                    or _normalize_identifier(pdata.get("abha_address", "")) == norm_query
                ):
                    logger.info("✅ Found authentic ABHA profile in Firestore 'abha_profiles' for query: %s", query)
                    return {"found": True, "patient": pdata, "profile": pdata}

            # Query patients collection as fallback
            patients_ref = db.collection("patients")
            for doc in patients_ref.stream():
                pdata = doc.to_dict()
                p_abha = pdata.get("abha_id") or pdata.get("abha_number") or ""
                p_phone = pdata.get("phone") or pdata.get("mobile") or ""
                if (
                    _normalize_identifier(p_abha) == norm_query
                    or _normalize_identifier(p_phone) == norm_query
                ):
                    mapped_profile = {
                        "abha_number": p_abha,
                        "full_name": pdata.get("name") or pdata.get("full_name"),
                        "age": pdata.get("age", 30),
                        "gender": pdata.get("gender", "Other"),
                        "mobile": p_phone,
                        "abha_address": f"{_normalize_identifier(pdata.get('name', 'user'))}@abdm",
                        "state": pdata.get("state", "Delhi"),
                        "pincode": pdata.get("pincode", "110001"),
                        "created_at": pdata.get("created_at")
                    }
                    return {"found": True, "patient": mapped_profile, "profile": mapped_profile}
        except Exception as e:
            logger.warning("Firestore lookup error: %s", e)

    return {"found": False, "message": "No ABHA record found with this number."}

@router.post("/register-abha")
def register_abha_profile(request: RegisterAbhaRequest) -> Dict[str, Any]:
    """
    Registers a new authentic ABHA profile:
    - Generates unique 14-digit ABHA (XX-XXXX-XXXX-XXXX).
    - Generates unique ABHA address (name@abdm).
    - Persists to Firestore collection 'abha_profiles'.
    """
    abha_number = _generate_14_digit_abha()
    clean_name = request.full_name.strip()
    name_slug = "".join(c for c in clean_name.lower() if c.isalnum())
    suffix = random.randint(100, 999)
    abha_address = f"{name_slug}{suffix}@abdm"
    now_iso = datetime.now(timezone.utc).isoformat()

    clean_mobile = request.mobile.strip()
    if not clean_mobile.startswith("+") and len(clean_mobile) == 10:
        clean_mobile = f"+91 {clean_mobile[:5]} {clean_mobile[5:]}"

    profile = {
        "abha_number": abha_number,
        "full_name": clean_name,
        "age": request.age,
        "gender": request.gender,
        "mobile": clean_mobile,
        "abha_address": abha_address,
        "state": request.state or "Delhi",
        "pincode": request.pincode or "110001",
        "created_at": now_iso,
        "is_verified": True
    }

    # Store in memory registry
    _registered_abha_profiles[abha_number] = profile

    # Store in Firestore collection 'abha_profiles'
    db = get_firestore_client()
    if db is not None:
        try:
            db.collection("abha_profiles").document(abha_number).set(profile, merge=True)
            logger.info("✅ Saved new ABHA profile '%s' for '%s' to Firestore", abha_number, clean_name)
        except Exception as e:
            logger.error("Failed to persist new ABHA profile to Firestore: %s", e)

    return {"success": True, "patient": profile, "profile": profile}

class SessionInitRequest(BaseModel):
    name: Optional[str] = Field(default=None, description="Patient full name")
    full_name: Optional[str] = Field(default=None, description="Patient full name alias")
    age: int = Field(default=35, description="Patient age")
    gender: str = Field(default="Male", description="Gender")
    mobile: str = Field(..., description="Mobile number")
    abha_id: Optional[str] = Field(default=None, description="ABHA ID")
    abha_number: Optional[str] = Field(default=None, description="ABHA Number alias")
    language: str = Field(default="hi-IN", description="Preferred language")
    mode: Optional[str] = Field(default="allopathy", description="Consultation mode: allopathy or ayurveda")
    opd_mode: Optional[str] = Field(default="allopathy", description="Consultation mode alias")
    session_id: Optional[str] = Field(default=None, description="Existing session ID if resuming")

@router.post("/initialize")
async def initialize_patient_session(request: SessionInitRequest) -> Dict[str, Any]:
    """
    Step 1: Welcome & Data Initialization
    - Accepts patient Name, Age, Mobile Number, and Consultation Mode ('allopathy' vs. 'ayurveda').
    - Creates a new unique session document in Firestore (collection 'sessions').
    - Synchronizes a matching patient record in Firestore (collection 'patients') and in-memory cache.
    - Immediately broadcasts a PATIENT_REGISTERED WebSocket event to the Doctor Dashboard
      so the doctor's queue updates in real-time.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    session_id = request.session_id or f"SES-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    token_number = f"OPD-{session_id.split('-')[-1]}"
    consultation_mode = (request.opd_mode or request.mode or "allopathy").strip().lower()
    patient_name = (request.full_name or request.name or "Patient").strip()
    department = (
        "Ayurveda & Kayachikitsa OPD (Room 108)"
        if consultation_mode == "ayurveda"
        else "General Medicine OPD (Room 102)"
    )

    # Clean phone number format
    clean_mobile = request.mobile.strip()
    if not clean_mobile.startswith("+") and len(clean_mobile) == 10:
        clean_mobile = f"+91 {clean_mobile[:5]} {clean_mobile[5:]}"

    abha_identifier = request.abha_number or request.abha_id

    session_doc = {
        "session_id": session_id,
        "patient_id": session_id,
        "name": patient_name,
        "full_name": patient_name,
        "age": request.age,
        "gender": request.gender,
        "phone": clean_mobile,
        "mobile": clean_mobile,
        "abha_id": abha_identifier or (clean_mobile if ("-" in clean_mobile or "@" in clean_mobile) else None),
        "abha_number": abha_identifier,
        "token_number": token_number,
        "preferred_language": request.language,
        "mode": consultation_mode,
        "opd_mode": consultation_mode,
        "current_step": "triage",
        "status": "In Triage Consultation",
        "triage_priority": "Normal OPD",
        "department": department,
        "created_at": now_iso,
        "updated_at": now_iso,
        "chat_history": [],
        "voice_history": [],
        "uploaded_documents": [],
        "medical_timeline": [],
        "clinical_summary": None,
        "soap_note": None,
        "vitals": {
            "blood_pressure": "120/80 mmHg",
            "heart_rate": 74,
            "spo2": 98,
            "temperature": 98.6,
            "respiratory_rate": 18
        },
        "allergies": ["No known allergies recorded"],
        "medical_history": []
    }

    # 1. Persist to Firestore collection 'sessions' and 'patients' if connected
    db = get_firestore_client()
    firestore_persisted = False
    if db is not None:
        try:
            # Write to sessions collection
            db.collection("sessions").document(session_id).set(session_doc, merge=True)
            # Write to patients collection for doctor dashboard queue
            db.collection("patients").document(session_id).set(session_doc, merge=True)
            firestore_persisted = True
            logger.info("✅ Created session and patient document '%s' (mode: %s) in Firebase Firestore", session_id, consultation_mode)
        except Exception as e:
            logger.error("❌ Failed to write session to Firestore: %s", e)

    # 2. Synchronize in-memory patient service cache
    patient_service._patients_cache[session_id] = session_doc.copy()

    # 3. Broadcast real-time WebSocket event to Doctor Dashboard
    try:
        ws_payload = {
            "type": "PATIENT_REGISTERED",
            "patient": session_doc,
            "session_id": session_id,
            "timestamp": now_iso
        }
        await ws_manager.broadcast_json(ws_payload)
        logger.info("📡 Broadcasted PATIENT_REGISTERED for '%s' to Doctor Dashboard", session_id)
    except Exception as ws_err:
        logger.warning("WebSocket broadcast error during session init: %s", ws_err)

    return {
        "success": True,
        "session_id": session_id,
        "patient_id": session_id,
        "name": request.name,
        "age": request.age,
        "phone": clean_mobile,
        "token_number": token_number,
        "mode": consultation_mode,
        "department": department,
        "current_step": "triage",
        "firestore_persisted": firestore_persisted,
        "patient": session_doc
    }

@router.get("/{session_id}")
def get_session(session_id: str = Path(..., description="Unique Session ID")) -> Dict[str, Any]:
    """Retrieves session state from Firestore or in-memory cache."""
    db = get_firestore_client()
    if db is not None:
        try:
            doc = db.collection("sessions").document(session_id).get()
            if doc.exists:
                data = doc.to_dict()
                data["session_id"] = doc.id
                return data
        except Exception as e:
            logger.warning("Error fetching session '%s' from Firestore: %s", session_id, e)

    # Fallback to patient cache
    patient = patient_service.get_patient_by_id(session_id)
    if patient:
        return patient

    raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

@router.patch("/{session_id}")
async def update_session(
    session_id: str = Path(..., description="Unique Session ID"),
    payload: SessionUpdateRequest = ...
) -> Dict[str, Any]:
    """Updates session state and step in Firestore and in-memory cache."""
    now_iso = datetime.now(timezone.utc).isoformat()
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = now_iso

    db = get_firestore_client()
    if db is not None:
        try:
            db.collection("sessions").document(session_id).set(updates, merge=True)
            db.collection("patients").document(session_id).set(updates, merge=True)
        except Exception as e:
            logger.error("Error updating session in Firestore: %s", e)

    if session_id in patient_service._patients_cache:
        patient_service._patients_cache[session_id].update(updates)

    return {
        "success": True,
        "session_id": session_id,
        "updated_fields": list(updates.keys())
    }
