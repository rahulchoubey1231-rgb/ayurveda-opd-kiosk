import logging
import traceback
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body
from pydantic import BaseModel, Field
from app.services.speech_service import speech_service
from app.services.gemini_service import (
    gemini_service,
    ClinicalSymptomAnalysis,
    check_emergency_red_flag
)
from app.services.dialogflow_service import dialogflow_service
from app.services.tts_service import tts_service
from app.core.websocket_manager import ws_manager
from app.core.credentials_check import check_google_credentials

logger = logging.getLogger("medikiosk.voice_api")
router = APIRouter()

# Critical Red Priority Emergency Keywords (English & Hindi)
EMERGENCY_KEYWORDS = [
    # Cardiac & Chest distress
    "chest pain",
    "severe chest pain",
    "acute chest pain",
    "breathlessness",
    "sudden breathlessness",
    "shortness of breath",
    "breathless",
    "chest tightness",
    "chest pressure",
    "crushing chest",
    "heart attack",
    "dyspnea",
    "छाती में दर्द",
    "सीने में दर्द",
    "सांस फूलना",
    "सांस लेने में दिक्कत",
    "सांस लेने में तकलीफ़",
    "सांस फूलती",
    "दिल का दौरा",
    "हार्ट अटैक",
    "दम घुटना",

    # Stroke signs (FAST)
    "stroke",
    "slurred speech",
    "speech slurred",
    "facial droop",
    "face drooping",
    "mouth drooping",
    "mouth twisted",
    "paralysis",
    "hemiplegia",
    "unable to speak",
    "sudden weakness in arm",
    "one side weak",
    "one-sided weakness",
    "लकवा",
    "फालिज",
    "पक्षाघात",
    "मुंह टेढ़ा",
    "बोली लड़खड़ा",
    "आवाज नहीं निकल रही",

    # Severe Trauma / Shock / Massive Bleeding
    "severe trauma",
    "massive bleeding",
    "heavy bleeding",
    "uncontrolled bleeding",
    "head injury",
    "skull fracture",
    "unconscious",
    "passed out",
    "collapsed",
    "गंभीर चोट",
    "खून बह रहा",
    "अत्यधिक खून",
    "बेहोश",
    "सिर में गहरी चोट",
]

class TextAnalysisRequest(BaseModel):
    text: str = Field(description="Patient voice transcript or text to analyze")
    language: str = Field(default="hi-IN", description="Language code: en-IN or hi-IN")
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None

class DialogflowRequest(BaseModel):
    text: str = Field(description="Patient question or speech utterance")
    session_id: Optional[str] = Field(default=None, description="Dialogflow conversational session ID")
    language_code: str = Field(default="hi-IN", description="Primary language code: hi-IN or en-IN")
    patient_name: Optional[str] = None
    mode: Optional[str] = Field(default="allopathy", description="Clinical consultation mode: allopathy or ayurveda")

class ConversationalBotRequest(BaseModel):
    query: Optional[str] = Field(default=None, description="Patient statement or question to the conversational bot")
    user_message: Optional[str] = Field(default=None, description="Alias for query")
    session_id: Optional[str] = Field(default=None, description="Unique session ID for conversational memory")
    language_code: Optional[str] = Field(default="hi-IN", description="Language code: hi-IN or en-IN")
    language: Optional[str] = Field(default=None, description="Alias for language_code")
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    mode: Optional[str] = Field(default="allopathy", description="Clinical consultation mode: allopathy or ayurveda")
    messages: Optional[List[Dict[str, Any]]] = Field(default=None, description="Complete messages array from frontend")
    chat_history: Optional[List[Dict[str, Any]]] = Field(default=None, description="Complete chat history array from frontend")
    conversation_history: Optional[List[Dict[str, Any]]] = Field(default=None, description="Alias for chat_history / messages")

class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize to MP3 audio")
    language_code: str = Field(default="hi-IN", description="Language code: hi-IN or en-IN")
    speaking_rate: float = Field(default=1.0, description="Speaking rate multiplier")
    voice_gender: str = Field(default="FEMALE", description="Voice gender: FEMALE or MALE")

class SessionInitRequest(BaseModel):
    patient_name: str = Field(..., description="Patient Name")
    language: str = Field(default="hi", description="Language 'hi' or 'en'")

@router.post("/init")
async def init_triage_session(request: SessionInitRequest) -> Dict[str, Any]:
    """
    Initializes a triage session by returning the dynamic greeting for the patient.
    """
    lang = request.language.strip().lower()
    # Normalize language flags
    if lang.startswith("en"):
        greeting = f"Hello {request.patient_name}, what health issues are you facing today?"
    else:
        greeting = f"नमस्ते {request.patient_name}, आपको क्या तकलीफ़ है?"
        
    return {
        "status": "connected",
        "greeting": greeting,
        "language_used": lang
    }

class ProcessVoiceResponse(BaseModel):
    transcription: Dict[str, Any]
    clinical_analysis: ClinicalSymptomAnalysis
    emergency_alert_pushed: bool = False

class EmergencyTestRequest(BaseModel):
    patient_name: str = "Emergency Walk-in Patient"
    patient_id: str = "UHID-2026-08941"
    voice_transcript: str = "मरीज़ को अचानक बहुत तेज़ छाती में दर्द (severe chest pain) और सांस फूलने (breathlessness) की समस्या हो रही है। पसीना आ रहा है।"
    kiosk_location: str = "Main OPD Block, Ground Floor - Kiosk #04"
    spo2: int = 91
    heart_rate: int = 112
    blood_pressure: str = "172/106 mmHg"

async def check_and_broadcast_emergency(
    text: str,
    patient_name: Optional[str] = None,
    patient_id: Optional[str] = None,
    vitals: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """
    Checks if speech transcription contains critical red-priority terms like
    'chest pain' or 'breathlessness'. If detected, immediately broadcasts an
    EMERGENCY_RED_ALERT JSON payload to the Doctor Dashboard over WebSockets.
    """
    text_lower = text.lower()
    matched_triggers = [kw for kw in EMERGENCY_KEYWORDS if kw in text_lower]
    has_red_flag = bool(matched_triggers) or check_emergency_red_flag(text)

    if has_red_flag:
        if not matched_triggers:
            matched_triggers = ["clinical_emergency_red_flag_pattern"]
        logger.warning(
            "🚨 [Emergency Detection] CRITICAL EMERGENCY TRIGGERS DETECTED in voice transcript: %s",
            matched_triggers
        )
        
        alert_payload = {
            "type": "EMERGENCY_RED_ALERT",
            "priority": "CRITICAL_RED_PRIORITY_1",
            "alert_id": f"ALERT-RED-{int(datetime.now(timezone.utc).timestamp())}",
            "patient_name": patient_name or "Walk-in Kiosk Patient",
            "patient_id": patient_id or "UHID-EMERGENCY-01",
            "trigger_keywords": matched_triggers,
            "transcript_snippet": text,
            "vitals": vitals or {
                "blood_pressure": "164/102 mmHg",
                "heart_rate": 108,
                "spo2": 92,
                "temperature": 99.4,
                "respiratory_rate": 26
            },
            "kiosk_location": "Main OPD Block, Ground Floor - Kiosk #04",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "recommended_actions": [
                "STAT Crash Cart & Triage Nurse dispatched to Kiosk #04",
                "Immediate 12-Lead STAT Electrocardiogram (ECG)",
                "High-Flow Supplemental Oxygen (4L/min via Nasal Cannula)",
                "Direct Bed Transfer to ICCU / Casualty Resuscitation Bay"
            ]
        }

        # Instant zero-latency WebSocket broadcast to all connected Doctor Dashboards
        await ws_manager.broadcast_json(alert_payload)
        logger.info("📡 [Emergency Detection] Broadcasted RED ALERT to %d active WebSocket clients", ws_manager.active_count())
        return alert_payload

    return None

@router.get("/credentials-status")
async def get_credentials_diagnostic() -> Dict[str, Any]:
    """
    Diagnostic endpoint to verify whether GOOGLE_APPLICATION_CREDENTIALS are being loaded
    correctly by FastAPI, and check the active status of Speech-to-Text and Dialogflow services.
    """
    diag = check_google_credentials()
    speech_status = speech_service.get_credentials_status()
    df_status = dialogflow_service.get_credentials_status()

    logger.info("🔍 [Credentials Diagnostic] Status queried: configured=%s", diag.get("is_configured"))
    return {
        "google_application_credentials": diag,
        "speech_to_text_service": {
            "is_configured": speech_service._is_configured,
            "supported_languages": ["en-IN", "hi-IN"],
            "status": speech_status
        },
        "dialogflow_service": {
            "is_configured": dialogflow_service._is_configured,
            "project_id": dialogflow_service._project_id,
            "supported_languages": ["en-IN", "hi-IN"],
            "status": df_status
        },
        "gemini_service": {
            "is_configured": gemini_service._client is not None,
            "model": gemini_service._model
        },
        "text_to_speech_service": tts_service.get_status()
    }

@router.post("/transcribe")
async def transcribe_audio(
    audio_file: UploadFile = File(..., description="Audio recording from the kiosk microphone"),
    language_code: str = Form("hi-IN", description="Primary language code: hi-IN or en-IN"),
) -> Dict[str, Any]:
    """
    Transcribes uploaded voice audio using Google Cloud Speech-to-Text API.
    Supports both 'en-IN' and 'hi-IN'.
    If 'chest pain' or 'breathlessness' is detected, broadcasts an immediate emergency WebSocket alert.
    """
    logger.info(
        "📥 [Voice API /transcribe] Received audio upload: filename='%s', content_type='%s', language_code='%s'",
        audio_file.filename, audio_file.content_type, language_code
    )

    try:
        audio_bytes = await audio_file.read()
        if not audio_bytes:
            logger.error("❌ [Voice API /transcribe] Empty audio file uploaded.")
            raise HTTPException(status_code=400, detail="Empty audio file provided.")
        
        result = speech_service.transcribe_audio(
            audio_bytes=audio_bytes,
            content_type=audio_file.content_type or "audio/webm",
            language_code=language_code,
        )

        transcript = result.get("transcript", "")
        if transcript:
            logger.info("🎙️ [Voice API /transcribe] Transcript obtained: '%s'", transcript)
            await check_and_broadcast_emergency(transcript)
        else:
            logger.warning("⚠️ [Voice API /transcribe] Speech-to-Text returned empty transcript.")

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "❌ [Voice API /transcribe] Fatal error in transcription endpoint!\nError: %s\nTraceback:\n%s",
            e,
            traceback.format_exc()
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dialogflow/detect-intent")
async def detect_dialogflow_intent(request: DialogflowRequest) -> Dict[str, Any]:
    """
    Dialogflow intent detection endpoint.
    Guarantees dual-language support ('en-IN' and 'hi-IN').
    Logs detailed logger.error statements with exact stack traces if Google Cloud credentials fail.
    """
    logger.info(
        "🤖 [Voice API /dialogflow/detect-intent] User utterance: '%s' (language: '%s', session: '%s')",
        request.text, request.language_code, request.session_id
    )

    try:
        if not request.text.strip():
            logger.error("❌ [Voice API /dialogflow/detect-intent] Empty text payload provided.")
            raise HTTPException(status_code=400, detail="Text cannot be empty.")

        # Check for emergency symptoms first
        await check_and_broadcast_emergency(request.text)

        result = dialogflow_service.detect_intent(
            text=request.text,
            session_id=request.session_id,
            language_code=request.language_code,
            patient_name=request.patient_name,
            mode=request.mode or "allopathy",
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "❌ [Voice API /dialogflow/detect-intent] Intent detection failed!\nError: %s\nTraceback:\n%s",
            e,
            traceback.format_exc()
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/conversational-bot")
async def conversational_voice_bot(
    request: ConversationalBotRequest
) -> Dict[str, Any]:
    """
    Unified Conversational Voice Bot Endpoint:
    1. Evaluates patient question/symptoms in Hindi ('hi-IN') or English ('en-IN').
    2. Runs Dialogflow Intent Detection or Gemini Conversational Reasoner with Mode ('allopathy' vs. 'ayurveda').
    3. Runs Clinical Symptom Extraction (Gemini 3.1 Pro) for structured triage.
    4. Enforces strict single-question rule and contextual touch quick-reply chips.
    5. Detects emergency red flags (chest pain, acute breathlessness, stroke signs, trauma) and halts standard intake.
    6. Triggers instant Red Alert WebSocket push to Doctor Dashboard.
    """
    consultation_mode = (request.mode or "allopathy").strip().lower()
    effective_query = (request.query or request.user_message or "").strip()
    effective_lang = request.language_code or request.language or "hi-IN"
    effective_messages = request.messages or request.chat_history or request.conversation_history

    logger.info(
        "💬 [Voice API /conversational-bot] Query received: '%s' (lang: %s, patient: %s, mode: %s)",
        effective_query, effective_lang, request.patient_name, consultation_mode
    )

    try:
        if not effective_query:
            raise HTTPException(status_code=400, detail="Query text cannot be empty.")

        # Step 1: Emergency Check
        alert = await check_and_broadcast_emergency(
            text=effective_query,
            patient_name=request.patient_name,
            patient_id=request.patient_id
        )

        # Step 2: Dialogflow / Conversational fulfillment with complete message context and mode
        df_result = dialogflow_service.detect_intent(
            text=effective_query,
            session_id=request.session_id,
            language_code=effective_lang,
            patient_name=request.patient_name,
            messages=effective_messages,
            mode=consultation_mode,
        )

        # Step 3: Clinical Triage extraction via Gemini 3.1 Pro
        clinical_analysis = gemini_service.analyze_clinical_text(
            text=effective_query,
            language=effective_lang[:2]
        )

        session_id = df_result.get("session_id") or request.session_id or "default_kiosk_patient"
        chat_history = gemini_service.get_chat_history_context(session_id)

        # Step 4: Text-to-Speech synthesis via Google Cloud TTS (with gTTS fallback)
        fulfillment_text = df_result.get("fulfillment_text", "")
        tts_result = {
            "success": False,
            "audio_base64": None,
            "audio_format": "mp3",
            "voice_name": "none",
            "engine": "none",
        }
        if fulfillment_text:
            try:
                tts_result = tts_service.synthesize_speech(
                    text=fulfillment_text,
                    language_code=request.language_code
                )
            except Exception as tts_err:
                logger.error("❌ [Voice API /conversational-bot] TTS synthesis error: %s", tts_err)

        is_red_flag_active = df_result.get("is_red_flag", False) or bool(alert)

        response = {
            "success": True,
            "fulfillment_text": fulfillment_text,
            "ai_message": fulfillment_text,
            "intent": df_result.get("intent", "ClinicalTriageInterview"),
            "confidence": df_result.get("confidence", 0.95),
            "mode": df_result.get("mode", consultation_mode),
            "phase": df_result.get("phase", "phase_1_chief_complaint"),
            "question_count_in_phase_1": df_result.get("question_count_in_phase_1", 1),
            "is_single_question_confirmed": df_result.get("is_single_question_confirmed", True),
            "quick_replies": df_result.get("quick_replies", []),
            "is_red_flag": is_red_flag_active,
            "emergency_instruction": df_result.get("emergency_instruction"),
            "clinical_domain_findings": df_result.get("clinical_domain_findings", {}),
            "chief_complaint": df_result.get("chief_complaint"),
            "identified_symptoms": df_result.get("identified_symptoms", []),
            "recommended_opd": df_result.get("recommended_opd", "General Medicine OPD (Room 102)" if consultation_mode != "ayurveda" else "Ayurveda & Kayachikitsa OPD (Room 108)"),
            "is_emergency": df_result.get("is_emergency", False) or is_red_flag_active,
            "is_interview_complete": df_result.get("is_interview_complete", False),
            "language": request.language_code,
            "supported_languages": ["en-IN", "hi-IN"],
            "clinical_analysis": clinical_analysis.model_dump(),
            "emergency_alert_pushed": bool(alert),
            "session_id": session_id,
            "chat_history_context": chat_history,
            "audio_base64": tts_result.get("audio_base64"),
            "audio_format": tts_result.get("audio_format", "mp3"),
            "tts_engine": tts_result.get("engine", "none"),
            "tts_voice": tts_result.get("voice_name", "none"),
        }
        logger.info(
            "✅ [Voice API /conversational-bot] Response dispatched: Mode=%s, Phase=%s, RedFlag=%s, Chips=%d, Complete=%s, HistoryCount=%d, AudioGenerated=%s",
            response["mode"], response["phase"], response["is_red_flag"], len(response["quick_replies"]),
            response["is_interview_complete"], len(chat_history), bool(response["audio_base64"])
        )
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "❌ [Voice API /conversational-bot] Conversational bot logic failed!\nError: %s\nTraceback:\n%s",
            e,
            traceback.format_exc()
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tts")
async def synthesize_text_to_speech(request: TTSRequest) -> Dict[str, Any]:
    """
    Synthesizes given text into an MP3 audio buffer using Google Cloud Text-to-Speech
    (with automated gTTS backend fallback). Returns base64 encoded MP3 audio.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    try:
        result = tts_service.synthesize_speech(
            text=request.text,
            language_code=request.language_code,
            speaking_rate=request.speaking_rate,
            voice_gender=request.voice_gender
        )
        return result
    except Exception as e:
        logger.error("❌ [Voice API /tts] Synthesis failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/triage-interview/context/{session_id}")
async def get_triage_chat_context(session_id: str) -> Dict[str, Any]:
    """
    Retrieves the full 'Chat History Context' array for the specified patient session.
    Lists every user query and AI response in chronological order with timestamps.
    """
    history = gemini_service.get_chat_history_context(session_id)
    return {
        "success": True,
        "session_id": session_id,
        "chat_history_context": history,
        "total_messages": len(history)
    }

@router.post("/triage-interview/reset")
async def reset_triage_interview(payload: Dict[str, str] = Body(...)) -> Dict[str, Any]:
    """
    Resets the 3-Phase Clinical Triage Interview and clears the Chat History Context for a patient session.
    """
    session_id = payload.get("session_id", "default_kiosk_patient")
    gemini_service.reset_triage_session(session_id)
    return {
        "success": True,
        "message": f"Triage session '{session_id}' and Chat History Context reset to Phase 1.",
        "session_id": session_id,
        "chat_history_context": []
    }


@router.post("/analyze-symptoms", response_model=ClinicalSymptomAnalysis)
async def analyze_symptoms(request: TextAnalysisRequest) -> ClinicalSymptomAnalysis:
    """
    Uses Gemini 3.1 Pro (gemini-3.1-pro-preview) to extract clinical symptoms,
    triage severity, and hospital OPD department from patient text.
    Instantly broadcasts a WebSocket Red Emergency Alert if chest pain or breathlessness is identified.
    """
    logger.info(
        "🩺 [Voice API /analyze-symptoms] Analyzing text: '%s' (lang: %s, patient: %s)",
        request.text, request.language, request.patient_name
    )

    if not request.text.strip():
        logger.error("❌ [Voice API /analyze-symptoms] Empty text provided for symptom analysis.")
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    try:
        # Check for emergency triggers and broadcast immediately
        await check_and_broadcast_emergency(
            text=request.text,
            patient_name=request.patient_name,
            patient_id=request.patient_id
        )

        analysis = gemini_service.analyze_clinical_text(
            text=request.text,
            language=request.language
        )
        return analysis
    except Exception as e:
        logger.error(
            "❌ [Voice API /analyze-symptoms] Gemini symptom analysis error!\nError: %s\nTraceback:\n%s",
            e,
            traceback.format_exc()
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process-voice", response_model=ProcessVoiceResponse)
async def process_voice_complete(
    audio_file: UploadFile = File(..., description="Audio recording from kiosk microphone"),
    language_code: str = Form("hi-IN", description="Primary language: hi-IN or en-IN"),
) -> ProcessVoiceResponse:
    """
    Complete Voice Triage Pipeline:
    1. Converts voice audio to text using Google Cloud Speech-to-Text API.
    2. Evaluates emergency keywords; if chest pain or breathlessness present, pushes WebSocket alert.
    3. Analyzes transcribed text using Gemini 3.1 Pro to extract clinical symptoms.
    """
    logger.info("🎙️ [Voice API /process-voice] Complete voice triage request (lang: %s)", language_code)

    try:
        audio_bytes = await audio_file.read()
        if not audio_bytes:
            logger.error("❌ [Voice API /process-voice] Empty audio bytes received.")
            raise HTTPException(status_code=400, detail="Empty audio file provided.")

        # Step 1: Google Cloud Speech-to-Text
        transcription_result = speech_service.transcribe_audio(
            audio_bytes=audio_bytes,
            content_type=audio_file.content_type or "audio/webm",
            language_code=language_code,
        )

        transcript_text = transcription_result.get("transcript", "")

        # Step 2: Emergency detection and WebSocket push
        alert = await check_and_broadcast_emergency(transcript_text)

        # Step 3: Gemini 3.1 Pro Clinical Analysis
        clinical_analysis = gemini_service.analyze_clinical_text(
            text=transcript_text,
            language=language_code[:2]
        )

        return ProcessVoiceResponse(
            transcription=transcription_result,
            clinical_analysis=clinical_analysis,
            emergency_alert_pushed=bool(alert)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "❌ [Voice API /process-voice] Pipeline processing error!\nError: %s\nTraceback:\n%s",
            e,
            traceback.format_exc()
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trigger-emergency-test")
async def trigger_emergency_test(request: EmergencyTestRequest) -> Dict[str, Any]:
    """
    Direct test endpoint to trigger a Red Priority WebSocket Alert for testing and demonstration.
    """
    logger.info("🚨 [Voice API /trigger-emergency-test] Manual emergency simulation requested for %s", request.patient_name)
    alert = await check_and_broadcast_emergency(
        text=request.voice_transcript,
        patient_name=request.patient_name,
        patient_id=request.patient_id,
        vitals={
            "blood_pressure": request.blood_pressure,
            "heart_rate": request.heart_rate,
            "spo2": request.spo2,
            "temperature": 99.2
        }
    )
    return {
        "success": True,
        "message": "Emergency Red Alert broadcasted over WebSocket to Doctor Dashboard",
        "active_ws_clients": ws_manager.active_count(),
        "alert_data": alert
    }

@router.post("/generate-clinical-summary")
async def generate_clinical_summary_voice_alias(
    payload: Dict[str, Any] = Body(...)
) -> Dict[str, Any]:
    """
    Voice API alias for /generate-clinical-summary:
    When voice consultation concludes, generates structured clinical summary
    from full chat history and OCR text using Gemini 1.5 Pro, and pushes to Firebase & Doctor Dashboard.
    """
    from app.api.doctor_routes import handle_generate_clinical_summary, GenerateClinicalSummaryRequest
    req = GenerateClinicalSummaryRequest.model_validate(payload)
    summary = await handle_generate_clinical_summary(req)
    return summary.model_dump()

