import os
import re
import io
import base64
import logging
import traceback
from typing import Dict, Any, Optional
from app.core.credentials_check import check_google_credentials

logger = logging.getLogger("medikiosk.tts_service")

# Try importing Google Cloud Text-to-Speech client
try:
    from google.cloud import texttospeech
    GCP_TTS_AVAILABLE = True
except ImportError:
    GCP_TTS_AVAILABLE = False
    logger.warning("⚠️ google-cloud-texttospeech library not installed.")

# Try importing gTTS as a reliable backend fallback
try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False
    logger.warning("⚠️ gTTS library not installed.")


class GoogleCloudTTSService:
    """
    Google Cloud Text-to-Speech Service for MediKiosk.
    Generates high-fidelity MP3 audio buffers for Gemini AI responses
    in Hindi ('hi-IN') and Indian English ('en-IN').
    
    Includes automated fallback to gTTS and audio stream encoding in base64.
    """

    def __init__(self):
        self._client: Optional[Any] = None
        self._initialized: bool = False
        self._init_error: Optional[str] = None
        self._init_client()

    def _init_client(self):
        """Attempts to initialize Google Cloud TextToSpeechClient."""
        if not GCP_TTS_AVAILABLE:
            self._init_error = "google-cloud-texttospeech package not installed"
            return

        cred_status = check_google_credentials()
        if not cred_status.get("is_configured"):
            self._init_error = cred_status.get("error_message") or "Google Cloud credentials not configured"
            logger.info("ℹ️ [TTS Service] Google Cloud credentials not configured. Will use gTTS fallback.")
            return

        try:
            self._client = texttospeech.TextToSpeechClient()
            self._initialized = True
            self._init_error = None
            logger.info(
                "✅ [TTS Service] Google Cloud TextToSpeechClient initialized successfully (Project: %s).",
                cred_status.get("project_id")
            )
        except Exception as e:
            self._init_error = f"Failed to initialize TextToSpeechClient: {str(e)}"
            logger.error("❌ [TTS Service] Failed to initialize TextToSpeechClient:\n%s", traceback.format_exc())

    def clean_text_for_speech(self, text: str) -> str:
        """
        Cleans markdown syntax, symbols, and clinical emojis for natural verbal delivery.
        """
        if not text:
            return ""

        # Remove markdown bold/italic/code/headers
        cleaned = re.sub(r"[\*_#`~>]", " ", text)
        # Remove markdown links [text](url) -> text
        cleaned = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", cleaned)
        # Remove common medical/triage emojis
        cleaned = re.sub(r"[🚨🤖🧑💬📋🎯⚡🔊🩺❤️⚠️✅❌🛑💊💉🏥]", "", cleaned)
        # Collapse multiple dashes or bullet characters
        cleaned = re.sub(r"[-•·–—]\s*", " ", cleaned)
        # Collapse whitespace
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def is_hindi_text(self, text: str, language_code: str = "") -> bool:
        """
        Detects if text contains Devanagari script or language_code indicates Hindi.
        """
        if language_code and language_code.lower().startswith("hi"):
            return True
        # Check Devanagari Unicode range U+0900 to U+097F
        return bool(re.search(r"[\u0900-\u097F]", text))

    def synthesize_speech(
        self,
        text: str,
        language_code: str = "hi-IN",
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        voice_gender: str = "FEMALE"
    ) -> Dict[str, Any]:
        """
        Synthesizes text into an MP3 audio buffer.
        
        Returns:
            Dict containing:
                - success: bool
                - audio_base64: str (base64-encoded MP3 bytes) or None
                - audio_format: "mp3"
                - byte_length: int
                - voice_name: str
                - engine: "google_cloud_tts" | "gtts_fallback" | "none"
                - language_code: str
                - error: Optional[str]
        """
        cleaned_text = self.clean_text_for_speech(text)
        if not cleaned_text:
            return {
                "success": False,
                "audio_base64": None,
                "audio_format": "mp3",
                "byte_length": 0,
                "voice_name": "none",
                "engine": "none",
                "language_code": language_code,
                "error": "Empty text provided for speech synthesis"
            }

        is_hindi = self.is_hindi_text(cleaned_text, language_code)
        target_lang = "hi-IN" if is_hindi else "en-IN"

        # ----------------------------------------------------
        # Tier 1: Try Google Cloud Text-to-Speech API
        # ----------------------------------------------------
        if self._client:
            try:
                # Voice selection: Neural2 voices provide exceptional conversational clarity
                voice_name = "hi-IN-Neural2-A" if is_hindi else "en-IN-Neural2-A"
                ssml_gender = (
                    texttospeech.SsmlVoiceGender.FEMALE
                    if voice_gender.upper() == "FEMALE"
                    else texttospeech.SsmlVoiceGender.MALE
                )

                synthesis_input = texttospeech.SynthesisInput(text=cleaned_text)
                voice = texttospeech.VoiceSelectionParams(
                    language_code=target_lang,
                    name=voice_name,
                    ssml_gender=ssml_gender
                )
                audio_config = texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.MP3,
                    speaking_rate=speaking_rate if is_hindi else (speaking_rate * 0.98),
                    pitch=pitch
                )

                logger.info(
                    "🔊 [Google Cloud TTS] Synthesizing %d characters with voice '%s' (%s)...",
                    len(cleaned_text), voice_name, target_lang
                )

                response = self._client.synthesize_speech(
                    input=synthesis_input,
                    voice=voice,
                    audio_config=audio_config
                )

                audio_content = response.audio_content
                if audio_content and len(audio_content) > 0:
                    audio_b64 = base64.b64encode(audio_content).decode("utf-8")
                    logger.info(
                        "✅ [Google Cloud TTS] Synthesized %d bytes of MP3 audio successfully.",
                        len(audio_content)
                    )
                    return {
                        "success": True,
                        "audio_base64": audio_b64,
                        "audio_format": "mp3",
                        "byte_length": len(audio_content),
                        "voice_name": voice_name,
                        "engine": "google_cloud_tts",
                        "language_code": target_lang,
                        "error": None
                    }
            except Exception as gcp_err:
                logger.warning(
                    "⚠️ [Google Cloud TTS] Cloud API call failed, falling back to gTTS: %s",
                    gcp_err
                )

        # ----------------------------------------------------
        # Tier 2: Zero-Config gTTS Fallback
        # ----------------------------------------------------
        if GTTS_AVAILABLE:
            try:
                gtts_lang = "hi" if is_hindi else "en"
                tld = "co.in"  # Use Indian English / Hindi regional accent
                logger.info(
                    "🔊 [gTTS Fallback] Synthesizing %d characters via gTTS (lang: %s, tld: %s)...",
                    len(cleaned_text), gtts_lang, tld
                )

                tts_obj = gTTS(text=cleaned_text, lang=gtts_lang, tld=tld, slow=False)
                mp3_buffer = io.BytesIO()
                tts_obj.write_to_fp(mp3_buffer)
                audio_bytes = mp3_buffer.getvalue()

                if audio_bytes and len(audio_bytes) > 0:
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                    logger.info(
                        "✅ [gTTS Fallback] Synthesized %d bytes of MP3 audio successfully.",
                        len(audio_bytes)
                    )
                    return {
                        "success": True,
                        "audio_base64": audio_b64,
                        "audio_format": "mp3",
                        "byte_length": len(audio_bytes),
                        "voice_name": f"gTTS-{gtts_lang}-{tld}",
                        "engine": "gtts_fallback",
                        "language_code": target_lang,
                        "error": None
                    }
            except Exception as gtts_err:
                logger.error("❌ [gTTS Fallback] gTTS synthesis failed:\n%s", traceback.format_exc())

        # ----------------------------------------------------
        # Tier 3: Return graceful failure for browser fallback
        # ----------------------------------------------------
        logger.error("❌ [TTS Service] Both Google Cloud TTS and gTTS were unable to synthesize audio.")
        return {
            "success": False,
            "audio_base64": None,
            "audio_format": "mp3",
            "byte_length": 0,
            "voice_name": "none",
            "engine": "none",
            "language_code": target_lang,
            "error": "Failed to synthesize audio on backend"
        }

    def get_status(self) -> Dict[str, Any]:
        """Diagnostic status report of the TTS subsystem."""
        cred_status = check_google_credentials()
        return {
            "gcp_tts_available": GCP_TTS_AVAILABLE,
            "gcp_tts_initialized": self._initialized,
            "gcp_project_id": cred_status.get("project_id"),
            "gtts_fallback_available": GTTS_AVAILABLE,
            "supported_languages": ["hi-IN", "en-IN"],
            "default_voices": {
                "hi-IN": "hi-IN-Neural2-A",
                "en-IN": "en-IN-Neural2-A"
            },
            "initialization_error": self._init_error
        }


# Singleton instance
tts_service = GoogleCloudTTSService()
