import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from app.core.firebase import get_firestore_client, is_firebase_initialized
from app.core.websocket_manager import ws_manager
from app.services.gemini_service import gemini_service, ClinicalSOAPNote, ClinicalSummary

logger = logging.getLogger("medikiosk.patient_service")

# Realistic OPD Queue and Clinical Profiles (Zero-Mock: starts empty and populated by live kiosk intake)
SAMPLE_PATIENTS: List[Dict[str, Any]] = []

class PatientService:
    def __init__(self):
        self._patients_cache: Dict[str, Dict[str, Any]] = {}

    def get_all_patients(self) -> List[Dict[str, Any]]:
        """
        Retrieves active OPD patients. Attempts to read from Firestore collection 'patients',
        falling back to the synchronized clinical cache.
        """
        db = get_firestore_client()
        if db is not None:
            try:
                patients_ref = db.collection("patients")
                docs = list(patients_ref.stream())
                if docs:
                    results = []
                    for doc in docs:
                        data = doc.to_dict()
                        data["patient_id"] = doc.id
                        if "voice_history" not in data or data["voice_history"] is None:
                            data["voice_history"] = []
                        if "uploaded_documents" not in data or data["uploaded_documents"] is None:
                            data["uploaded_documents"] = []
                        results.append(data)
                    logger.info("Retrieved %d patients from Firebase Firestore", len(results))
                    return results
            except Exception as e:
                logger.warning("Error reading patients from Firestore: %s. Using internal patient cache.", e)

        cached_patients = []
        for p in self._patients_cache.values():
            if "voice_history" not in p or p["voice_history"] is None:
                p["voice_history"] = []
            if "uploaded_documents" not in p or p["uploaded_documents"] is None:
                p["uploaded_documents"] = []
            cached_patients.append(p)
        return cached_patients

    def get_patient_by_id(self, patient_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a single patient record by ID from Firestore or cache.
        """
        db = get_firestore_client()
        if db is not None:
            try:
                doc = db.collection("patients").document(patient_id).get()
                if doc.exists:
                    data = doc.to_dict()
                    data["patient_id"] = doc.id
                    if "voice_history" not in data or data["voice_history"] is None:
                        data["voice_history"] = []
                    if "uploaded_documents" not in data or data["uploaded_documents"] is None:
                        data["uploaded_documents"] = []
                    return data
            except Exception as e:
                logger.warning("Error reading patient %s from Firestore: %s", patient_id, e)

        record = self._patients_cache.get(patient_id)
        if record:
            if "voice_history" not in record or record["voice_history"] is None:
                record["voice_history"] = []
            if "uploaded_documents" not in record or record["uploaded_documents"] is None:
                record["uploaded_documents"] = []
        return record

    def generate_and_save_soap_note(self, patient_id: str) -> ClinicalSOAPNote:
        """
        Generates a structured SOAP note for the patient using Gemini 3.1 Pro,
        caches it in memory, and persists it to Firebase Firestore if connected.
        """
        patient = self.get_patient_by_id(patient_id)
        if not patient:
            logger.info("Patient '%s' not found in cache. Creating on-demand kiosk profile.", patient_id)
            patient = {
                "patient_id": patient_id,
                "name": f"Patient ({patient_id})",
                "age": 52,
                "gender": "Other",
                "phone": "+91 98765 00000",
                "abha_id": "91-0000-0000-0000",
                "token_number": patient_id,
                "triage_priority": "Priority OPD",
                "department": "General Medicine OPD (Room 102)",
                "checkin_time": datetime.now(timezone.utc).isoformat(),
                "status": "Waiting for Doctor",
                "allergies": ["No known drug allergies (NKDA)"],
                "medical_history": ["Kiosk Consultation"],
                "vitals": {
                    "blood_pressure": "120/80 mmHg",
                    "heart_rate": 76,
                    "spo2": 98,
                    "temperature": 98.6,
                    "respiratory_rate": 18
                },
                "voice_history": [
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "language": "en",
                        "duration_seconds": 12,
                        "text": f"Walk-in patient check-in at MediKiosk for {patient_id}",
                        "translated_text": f"Walk-in patient check-in at MediKiosk for {patient_id}",
                        "triage_urgency": "mild"
                    }
                ],
                "uploaded_documents": [],
                "clinical_summary": None,
                "soap_note": None
            }
            self._patients_cache[patient_id] = patient

        # Generate SOAP note using Gemini 3.1 Pro
        soap_note = gemini_service.generate_soap_note(patient)

        # Update cache
        if patient_id in self._patients_cache:
            self._patients_cache[patient_id]["soap_note"] = soap_note.model_dump()

        # Update Firestore if initialized
        db = get_firestore_client()
        if db is not None:
            try:
                patient_ref = db.collection("patients").document(patient_id)
                patient_ref.set({
                    "soap_note": soap_note.model_dump(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }, merge=True)
                logger.info("Saved Gemini SOAP note to Firestore for patient %s", patient_id)
            except Exception as e:
                logger.error("Failed to write SOAP note to Firestore: %s", e)

        return soap_note

    async def save_clinical_summary(self, patient_id: str, summary: ClinicalSummary) -> Dict[str, Any]:
        """
        Saves a synthesized Clinical Summary for a patient:
        1. Updates the in-memory patient cache.
        2. Persists to Firebase Firestore under collection 'patients' (document `patient_id`).
        3. Broadcasts real-time event 'CLINICAL_SUMMARY_UPDATED' over WebSocket to all Doctor Dashboards.
        """
        summary_dict = summary.model_dump()

        # Update cache
        db = get_firestore_client()
        existing_patient = self._patients_cache.get(patient_id)
        if not existing_patient and db is not None:
            try:
                doc = db.collection("patients").document(patient_id).get()
                if doc.exists:
                    existing_patient = doc.to_dict()
                else:
                    s_doc = db.collection("sessions").document(patient_id).get()
                    if s_doc.exists:
                        existing_patient = s_doc.to_dict()
            except Exception as e:
                logger.warning("Could not fetch patient record from Firestore during summary save: %s", e)

        if existing_patient:
            existing_patient["clinical_summary"] = summary_dict
            self._patients_cache[patient_id] = existing_patient
        else:
            self._patients_cache[patient_id] = {
                "patient_id": patient_id,
                "name": summary.patient_name or f"Patient ({patient_id[-6:]})",
                "age": 35,
                "gender": "Other",
                "phone": "",
                "abha_id": "",
                "token_number": f"OPD-{patient_id[-4:]}",
                "triage_priority": "Normal OPD",
                "department": "General Medicine OPD (Room 102)",
                "checkin_time": datetime.now(timezone.utc).isoformat(),
                "status": "Waiting for Doctor",
                "allergies": summary.past_medical_history or ["No known drug allergies (NKDA)"],
                "medical_history": summary.past_medical_history or [],
                "vitals": {
                    "blood_pressure": "120/80 mmHg",
                    "heart_rate": 74,
                    "spo2": 98,
                    "temperature": 98.6,
                    "respiratory_rate": 18
                },
                "voice_history": [],
                "uploaded_documents": [],
                "clinical_summary": summary_dict,
                "soap_note": None
            }

        # Persist to Firebase Firestore if connected
        db = get_firestore_client()
        firebase_saved = False
        if db is not None:
            try:
                now_str = datetime.now(timezone.utc).isoformat()
                patient_ref = db.collection("patients").document(patient_id)
                patient_ref.set({
                    "clinical_summary": summary_dict,
                    "status": "Ready for Doctor Consultation",
                    "updated_at": now_str
                }, merge=True)
                # Also sync sessions collection
                session_ref = db.collection("sessions").document(patient_id)
                session_ref.set({
                    "clinical_summary": summary_dict,
                    "status": "Ready for Doctor Consultation",
                    "current_step": "completed",
                    "updated_at": now_str
                }, merge=True)
                firebase_saved = True
                logger.info("✅ Successfully pushed Clinical Summary to Firebase Firestore for patient/session %s", patient_id)
            except Exception as e:
                logger.error("❌ Failed to push Clinical Summary to Firebase Firestore: %s", e)

        # Real-time WebSocket broadcast to Doctor Dashboard
        try:
            ws_payload = {
                "type": "CLINICAL_SUMMARY_UPDATED",
                "patient_id": patient_id,
                "patient_name": summary.patient_name or "Patient",
                "clinical_summary": summary_dict,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            await ws_manager.broadcast_json(ws_payload)
            logger.info("📡 Broadcasted CLINICAL_SUMMARY_UPDATED via WebSocket to %d active clients", ws_manager.active_count())
        except Exception as ws_err:
            logger.warning("WebSocket broadcast error: %s", ws_err)

        return {
            "success": True,
            "patient_id": patient_id,
            "firebase_persisted": firebase_saved,
            "clinical_summary": summary_dict
        }

    async def register_or_update_patient(self, patient_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Registers a new patient from the MediKiosk or updates existing record.
        Persists to internal cache and Firestore (if connected), and broadcasts
        PATIENT_REGISTERED via WebSocket to update the Doctor Dashboard.
        """
        patient_id = patient_data.get("patient_id") or f"OPD-{datetime.now().strftime('%H%M%S')}"
        now_iso = datetime.now(timezone.utc).isoformat()

        voice_history = patient_data.get("voice_history")
        if voice_history is None:
            voice_history = []
        uploaded_documents = patient_data.get("uploaded_documents")
        if uploaded_documents is None:
            uploaded_documents = []
        allergies = patient_data.get("allergies")
        if allergies is None:
            allergies = ["No known allergies"]
        medical_history = patient_data.get("medical_history")
        if medical_history is None:
            medical_history = []

        record = {
            "patient_id": patient_id,
            "name": patient_data.get("name") or "Walk-in Kiosk Patient",
            "age": patient_data.get("age", 45),
            "gender": patient_data.get("gender", "Not Specified"),
            "phone": patient_data.get("phone", "+91 98765 00000"),
            "abha_id": patient_data.get("abha_id", "91-0000-0000-0000"),
            "token_number": patient_data.get("token_number", patient_id),
            "triage_priority": patient_data.get("triage_priority", "Normal OPD"),
            "department": patient_data.get("department", "General Medicine OPD (Room 102)"),
            "mode": patient_data.get("mode", "allopathy"),
            "is_red_flag": bool(patient_data.get("is_red_flag", False)),
            "emr_status": patient_data.get("emr_status", "DRAFT"),
            "chief_complaint": patient_data.get("chief_complaint", "General Physical Discomfort"),
            "hpi_points": patient_data.get("hpi_points", []),
            "current_medications": patient_data.get("current_medications", []),
            "ayurveda_pariksha": patient_data.get("ayurveda_pariksha"),
            "checkin_time": now_iso,
            "status": "Waiting for Doctor",
            "allergies": allergies,
            "medical_history": medical_history,
            "vitals": patient_data.get("vitals") or {
                "blood_pressure": "120/80 mmHg",
                "heart_rate": 74,
                "spo2": 98,
                "temperature": 98.6
            },
            "voice_history": voice_history,
            "uploaded_documents": uploaded_documents,
            "medical_timeline": patient_data.get("medical_timeline", []),
            "soap_note": patient_data.get("soap_note"),
            "clinical_summary": patient_data.get("clinical_summary")
        }

        # Update cache
        self._patients_cache[patient_id] = record

        # Persist to Firestore if available
        db = get_firestore_client()
        if db is not None:
            try:
                db.collection("patients").document(patient_id).set(record, merge=True)
                logger.info("Saved patient %s to Firestore.", patient_id)
            except Exception as e:
                logger.warning("Firestore write error for patient %s: %s", patient_id, e)

        # Broadcast via WebSocket
        try:
            ws_payload = {
                "type": "PATIENT_REGISTERED",
                "patient": record,
                "timestamp": now_iso
            }
            await ws_manager.broadcast_json(ws_payload)
            logger.info("📡 Broadcasted PATIENT_REGISTERED for '%s' to Doctor Dashboard", patient_id)
        except Exception as ws_err:
            logger.warning("WebSocket broadcast error: %s", ws_err)

        return record

    async def update_patient_summary(self, patient_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Updates clinical digest fields (chief complaint, HPI points, allergies, medications, etc.)
        edited inline by the attending doctor.
        """
        record = self.get_patient_by_id(patient_id)
        if not record:
            raise ValueError(f"Patient '{patient_id}' not found.")

        # Update allowed fields
        allowed_fields = [
            "chief_complaint", "hpi_points", "allergies", "medical_history",
            "current_medications", "ayurveda_pariksha", "vitals", "status"
        ]
        for field in allowed_fields:
            if field in updates and updates[field] is not None:
                record[field] = updates[field]

        record["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._patients_cache[patient_id] = record

        # Persist to Firestore if available
        db = get_firestore_client()
        if db is not None:
            try:
                db.collection("patients").document(patient_id).set(record, merge=True)
            except Exception as e:
                logger.warning("Firestore update error: %s", e)

        # Broadcast update
        try:
            await ws_manager.broadcast_json({
                "type": "PATIENT_SUMMARY_UPDATED",
                "patient_id": patient_id,
                "patient": record,
                "timestamp": record["updated_at"]
            })
        except Exception as we:
            logger.warning("WebSocket broadcast error: %s", we)

        return record

    async def approve_and_lock_emr(
        self,
        patient_id: str,
        doctor_name: str = "Dr. A. Sharma, MD",
        notes: str = "",
        clinical_digest: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Finalizes and locks the clinical summary into EMR/ABDM format with cryptographic/transaction stamp.
        """
        record = self.get_patient_by_id(patient_id)
        if not record:
            raise ValueError(f"Patient '{patient_id}' not found.")

        import uuid
        now_iso = datetime.now(timezone.utc).isoformat()
        abdm_tx_id = f"ABDM-TX-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        record["emr_status"] = "APPROVED_AND_LOCKED"
        record["approved_at"] = now_iso
        record["approved_by"] = doctor_name
        record["abdm_transaction_id"] = abdm_tx_id
        record["doctor_notes"] = notes
        if clinical_digest:
            record["final_clinical_digest"] = clinical_digest

        record["updated_at"] = now_iso
        self._patients_cache[patient_id] = record

        db = get_firestore_client()
        if db is not None:
            try:
                db.collection("patients").document(patient_id).set(record, merge=True)
            except Exception as e:
                logger.warning("Firestore EMR lock error: %s", e)

        try:
            await ws_manager.broadcast_json({
                "type": "EMR_APPROVED_AND_LOCKED",
                "patient_id": patient_id,
                "abdm_transaction_id": abdm_tx_id,
                "approved_by": doctor_name,
                "approved_at": now_iso,
                "timestamp": now_iso
            })
        except Exception as we:
            logger.warning("WebSocket EMR broadcast error: %s", we)

        return {
            "success": True,
            "patient_id": patient_id,
            "emr_status": "APPROVED_AND_LOCKED",
            "abdm_transaction_id": abdm_tx_id,
            "approved_by": doctor_name,
            "approved_at": now_iso,
            "patient": record
        }

    def seed_firestore_patients(self) -> Dict[str, Any]:
        """
        Seeds sample patients to Firestore if connected.
        """
        db = get_firestore_client()
        if db is None:
            return {"success": False, "message": "Firebase not connected. Configure FIREBASE_CREDENTIALS_PATH in backend/.env."}

        try:
            batch = db.batch()
            for p in SAMPLE_PATIENTS:
                doc_ref = db.collection("patients").document(p["patient_id"])
                batch.set(doc_ref, p, merge=True)
            batch.commit()
            return {"success": True, "message": f"Successfully seeded {len(SAMPLE_PATIENTS)} patients to Firestore."}
        except Exception as e:
            return {"success": False, "error": str(e)}

patient_service = PatientService()
