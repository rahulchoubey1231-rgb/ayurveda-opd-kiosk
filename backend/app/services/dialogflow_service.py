import os
import logging
import traceback
import uuid
from typing import Optional, Dict, Any, List
from google.cloud import dialogflow_v2 as dialogflow
from app.core.config import settings
from app.core.credentials_check import check_google_credentials
from app.services.gemini_service import gemini_service

logger = logging.getLogger("medikiosk.dialogflow")

class DialogflowConversationalService:
    def __init__(self):
        self._client: Optional[dialogflow.SessionsClient] = None
        self._is_configured = False
        self._project_id = settings.DIALOGFLOW_PROJECT_ID
        self._credentials_diag: Dict[str, Any] = {}
        self._init_client()

    def _init_client(self):
        """
        Initializes Dialogflow SessionsClient with explicit credential checks.
        Logs detailed logging.error statements and stack traces if authentication fails.
        """
        self._credentials_diag = check_google_credentials()
        self._project_id = settings.DIALOGFLOW_PROJECT_ID

        try:
            if self._credentials_diag.get("is_configured") and self._credentials_diag.get("resolved_path"):
                resolved_path = self._credentials_diag["resolved_path"]
                self._client = dialogflow.SessionsClient.from_service_account_file(resolved_path)
                self._is_configured = True
                logger.info(
                    "✅ [Dialogflow] Initialized SessionsClient successfully from service account file: %s (Project: %s)",
                    resolved_path, self._project_id
                )
            elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
                # Attempt default auth
                logger.info("ℹ️ [Dialogflow] Attempting SessionsClient initialization via Application Default Credentials...")
                self._client = dialogflow.SessionsClient()
                self._is_configured = True
                logger.info("✅ [Dialogflow] SessionsClient initialized using ADC.")
            else:
                self._client = None
                self._is_configured = False
                logger.info("ℹ️ [Dialogflow] Credentials not provided; client set to offline fallback mode.")
        except Exception as e:
            self._client = None
            self._is_configured = False
            logger.error(
                "❌ [Dialogflow] Failed to initialize Dialogflow SessionsClient!\n"
                "Error: %s\n"
                "Diagnosis: GOOGLE_APPLICATION_CREDENTIALS not found or missing from backend/.env.\n"
                "Exact Terminal Traceback:\n%s",
                e,
                traceback.format_exc()
            )

    def detect_intent(
        self,
        text: str,
        session_id: Optional[str] = None,
        language_code: str = "hi-IN",
        patient_name: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None,
        mode: str = "allopathy",
    ) -> Dict[str, Any]:
        """
        Detects user intent using Google Cloud Dialogflow API.
        Guarantees support for both 'en-IN' and 'hi-IN'.
        Falls back to Gemini 3.1 Pro conversational assistant if credentials are not configured.
        """
        session_id = session_id or str(uuid.uuid4())
        
        # Normalize language code for Dialogflow (accepts 'hi' / 'hi-IN' or 'en' / 'en-IN')
        lang_input = (language_code or "hi-IN").strip().lower()
        if "hi" in lang_input:
            df_lang = "hi-IN"
            alt_lang = "en-IN"
        else:
            df_lang = "en-IN"
            alt_lang = "hi-IN"

        logger.info(
            "🤖 [Dialogflow] detect_intent request: session_id='%s', patient_name='%s', mode='%s', text='%s', language='%s' (alt: '%s'), messages_count=%d",
            session_id, patient_name, mode, text, df_lang, alt_lang, len(messages) if messages else 0
        )

        if self._is_configured and self._client is not None and self._project_id:
            try:
                session_path = f"projects/{self._project_id}/agent/sessions/{session_id}"
                text_input = dialogflow.TextInput(text=text, language_code=df_lang)
                query_input = dialogflow.QueryInput(text=text_input)

                logger.info("📡 [Dialogflow] Sending query to session: %s", session_path)
                response = self._client.detect_intent(
                    request={"session": session_path, "query_input": query_input}
                )

                query_result = response.query_result
                intent_name = query_result.intent.display_name if query_result.intent else "Default Fallback"
                fulfillment_text = query_result.fulfillment_text or ""
                confidence = float(query_result.intent_detection_confidence)

                logger.info(
                    "✅ [Dialogflow] Intent matched: '%s' (confidence: %.2f) -> Response: '%s'",
                    intent_name, confidence, fulfillment_text
                )

                # Record to chat_history_context
                gemini_service.append_to_chat_history_context(session_id, "user", text)
                gemini_service.append_to_chat_history_context(session_id, "model", fulfillment_text)
                chat_history = gemini_service.get_chat_history_context(session_id)

                return {
                    "success": True,
                    "intent": intent_name,
                    "confidence": confidence,
                    "fulfillment_text": fulfillment_text,
                    "parameters": dict(query_result.parameters),
                    "language": df_lang,
                    "supported_languages": ["en-IN", "hi-IN"],
                    "source": "google_cloud_dialogflow_v2",
                    "session_id": session_id,
                    "patient_name": patient_name,
                    "mode": mode,
                    "quick_replies": [],
                    "is_red_flag": False,
                    "emergency_instruction": None,
                    "clinical_domain_findings": {},
                    "chat_history_context": chat_history,
                }
            except Exception as e:
                logger.error(
                    "❌ [Dialogflow] detect_intent API call failed with exception:\n%s\nTraceback:\n%s",
                    e,
                    traceback.format_exc()
                )

        # Fallback to Gemini 3.1 Pro conversational voice bot reasoning with full message context
        logger.warning(
            "⚠️ [Dialogflow] Dialogflow live service not available (Configured: %s). Delegating to Gemini conversational engine.",
            self._is_configured
        )
        return self._conversational_gemini_fallback(
            text, df_lang, session_id, patient_name, messages=messages, mode=mode
        )

    def _conversational_gemini_fallback(
        self,
        text: str,
        language_code: str,
        session_id: str,
        patient_name: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None,
        mode: str = "allopathy",
    ) -> Dict[str, Any]:
        """
        Conversational fallback engine powered by Gemini 3.1 Pro Clinical Triage Expert.
        Conducts the 3-Phase interview:
        - Mode: 'allopathy' (HPI) or 'ayurveda' (Dashavidha Pariksha & Ahara-Vihara)
        - Strict Rule: Strictly ONE focused question at a time!
        - Generates 2-4 contextual touch quick-replies (chips).
        - Detects emergency red flags and immediately halts intake if critical symptoms are mentioned.
        - Maintains Chat History Context array across turns.
        """
        triage_turn = gemini_service.conduct_triage_interview(
            patient_message=text,
            session_id=session_id,
            language_code=language_code,
            patient_name=patient_name,
            incoming_messages=messages,
            mode=mode,
        )
        chat_history = gemini_service.get_chat_history_context(session_id)

        return {
            "success": True,
            "intent": "ClinicalTriageInterview",
            "confidence": 0.95,
            "fulfillment_text": triage_turn.ai_message,
            "phase": triage_turn.phase,
            "question_count_in_phase_1": triage_turn.question_count_in_phase_1,
            "is_single_question_confirmed": triage_turn.is_single_question_confirmed,
            "mode": triage_turn.mode,
            "quick_replies": triage_turn.quick_replies,
            "is_red_flag": triage_turn.is_red_flag,
            "emergency_instruction": triage_turn.emergency_instruction,
            "clinical_domain_findings": triage_turn.clinical_domain_findings,
            "chief_complaint": triage_turn.chief_complaint,
            "identified_symptoms": triage_turn.identified_symptoms,
            "recommended_opd": triage_turn.recommended_opd,
            "is_emergency": triage_turn.is_emergency or triage_turn.is_red_flag,
            "is_interview_complete": triage_turn.is_interview_complete,
            "language": language_code,
            "supported_languages": ["en-IN", "hi-IN"],
            "source": "gemini_3_phase_clinical_triage",
            "session_id": session_id,
            "patient_name": patient_name,
            "chat_history_context": chat_history,
            "note": f"Powered by Gemini 3.1 Pro Clinical Triage Protocol ({triage_turn.mode.title()} Mode)"
        }


    def get_credentials_status(self) -> Dict[str, Any]:
        return self._credentials_diag

dialogflow_service = DialogflowConversationalService()
