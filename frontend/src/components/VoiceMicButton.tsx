"use client";

import { useState, useEffect, useRef } from "react";
import {
  Mic,
  Volume2,
  VolumeX,
  CheckCircle2,
  RotateCcw,
  Activity,
  Sparkles,
  AlertTriangle,
  Stethoscope,
  Loader2,
  Radio,
  Square,
  History,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { Language, translations } from "@/lib/i18n";
import WaveformVisualizer, { VisualizerMode } from "@/components/WaveformVisualizer";
import { useKioskSession } from "@/context/KioskSessionContext";

export interface ClinicalAnalysis {
  patient_name?: string | null;
  primary_complaint: string;
  symptoms: string[];
  duration?: string | null;
  severity_level: "mild" | "moderate" | "severe" | "emergency";
  recommended_department: string;
  vital_signs_to_check: string[];
  clinical_notes: string;
  is_emergency: boolean;
}

interface VoiceMicButtonProps {
  language: Language;
  ultraContrast: boolean;
  onVoiceResult: (text: string) => void;
  onConfirmCheckIn: (text: string, analysis?: ClinicalAnalysis) => void;
}

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export default function VoiceMicButton({
  language,
  ultraContrast,
  onVoiceResult,
  onConfirmCheckIn,
}: VoiceMicButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [clinicalAnalysis, setClinicalAnalysis] = useState<ClinicalAnalysis | null>(null);
  const [speakingGuide, setSpeakingGuide] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId] = useState<string>(() => `kiosk-patient-${Date.now().toString(36)}`);
  const [showHistoryContext, setShowHistoryContext] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [isSpeakingAi, setIsSpeakingAi] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [lastAudioBase64, setLastAudioBase64] = useState<string | null>(null);
  const [ttsEngine, setTtsEngine] = useState<string>("none");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeVoiceName, setActiveVoiceName] = useState<string>("");
  const [messages, setMessages] = useState<Array<{ role: string; text: string; timestamp?: string }>>([]);

  // Global Kiosk Session Context
  let kioskContext: any = null;
  try {
    kioskContext = useKioskSession();
  } catch {
    // If mounted outside KioskSessionProvider
  }
  const globalSessionId = kioskContext?.sessionId;
  const globalPatientName = kioskContext?.patientName;
  const globalAppendChatTurn = kioskContext?.appendChatTurn;
  const globalSetStep = kioskContext?.setStep;

  const effectiveSessionId = globalSessionId || sessionId;
  const effectivePatientName = globalPatientName || null;

  const recognitionRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const t = translations[language];
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const [conversationalResponse, setConversationalResponse] = useState<{
    fulfillment_text?: string;
    intent?: string;
    confidence?: number;
    emergency_alert_pushed?: boolean;
    phase?: string;
    question_count_in_phase_1?: number;
    mode?: string;
    quick_replies?: string[];
    is_red_flag?: boolean;
    emergency_instruction?: string;
    clinical_domain_findings?: Record<string, any>;
    chat_history_context?: Array<{ role: string; text: string; timestamp: string }>;
    audio_base64?: string | null;
    audio_format?: string;
    tts_engine?: string;
    tts_voice?: string;
  } | null>(null);

  const [credentialsInfo, setCredentialsInfo] = useState<any | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summarySuccess, setSummarySuccess] = useState<any | null>(null);
  const [showRedAlertModal, setShowRedAlertModal] = useState<boolean>(false);
  const [buzzerActive, setBuzzerActive] = useState<boolean>(false);
  const buzzerIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<any>(null);

  // Stop Web Audio Emergency Buzzer
  const stopEmergencyBuzzer = () => {
    if (buzzerIntervalRef.current) {
      clearInterval(buzzerIntervalRef.current);
      buzzerIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    setBuzzerActive(false);
  };

  // Synthesize Web Audio Emergency Buzzer (Alternating 880Hz / 660Hz alarm siren)
  const playEmergencyBuzzer = () => {
    if (typeof window === "undefined") return;
    try {
      stopEmergencyBuzzer();
      setBuzzerActive(true);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const emitDualBeep = () => {
        try {
          if (ctx.state === "suspended") {
            ctx.resume();
          }
          const now = ctx.currentTime;
          // Oscillator 1: High frequency 880Hz (A5)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = "sawtooth";
          osc1.frequency.setValueAtTime(880, now);
          gain1.gain.setValueAtTime(0.35, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.22);

          // Oscillator 2: Lower frequency 660Hz (E5)
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = "sawtooth";
          osc2.frequency.setValueAtTime(660, now + 0.25);
          gain2.gain.setValueAtTime(0.35, now + 0.25);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.25);
          osc2.stop(now + 0.48);
        } catch (e) {
          console.warn("Buzzer beep error:", e);
        }
      };

      // Play immediately
      emitDualBeep();
      // Repeat alarm every 800ms for continuous high-priority audio alert
      buzzerIntervalRef.current = setInterval(emitDualBeep, 800);
    } catch (err) {
      console.warn("Could not start Web Audio emergency buzzer:", err);
    }
  };

  // Calls /generate-clinical-summary endpoint and pushes to Doctor Dashboard via WebSocket
  const handleGenerateClinicalSummary = async () => {
    setIsGeneratingSummary(true);
    setSummarySuccess(null);
    try {
      const res = await fetch(`${apiUrl}/generate-clinical-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: effectiveSessionId,
          patient_id: effectiveSessionId,
          patient_name: effectivePatientName || "Patient",
          chat_history: conversationalResponse?.chat_history_context || [
            {
              role: "user",
              text: transcript || "Patient consultation via MediKiosk microphone",
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSummarySuccess(data);
        console.log("✅ [Clinical Summary Generated & Pushed to Firebase/Doctor Dashboard]:", data);
      } else {
        console.error("Failed to generate clinical summary:", res.status);
      }
    } catch (err) {
      console.error("Error pushing clinical summary:", err);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Check backend credentials status on mount and log to console
  useEffect(() => {
    const fetchCredentialsStatus = async () => {
      try {
        console.log("🔍 [FastAPI Diagnostics] Checking GOOGLE_APPLICATION_CREDENTIALS loading status from backend...");
        const res = await fetch(`${apiUrl}/api/voice/credentials-status`);
        if (res.ok) {
          const data = await res.json();
          setCredentialsInfo(data);
          console.log("📋 [FastAPI Diagnostics] GOOGLE_APPLICATION_CREDENTIALS Status Report:", data);
          if (!data.google_application_credentials?.is_configured) {
            console.warn(
              "⚠️ [FastAPI Diagnostics] GOOGLE_APPLICATION_CREDENTIALS not configured or missing key file on backend:",
              data.google_application_credentials?.error_message
            );
          } else {
            console.log(
              "✅ [FastAPI Diagnostics] GOOGLE_APPLICATION_CREDENTIALS loaded successfully for project:",
              data.google_application_credentials?.project_id
            );
          }
        }
      } catch (err) {
        console.error("❌ [FastAPI Diagnostics] Failed to fetch backend credentials diagnostic:", err);
      }
    };
    fetchCredentialsStatus();
  }, [apiUrl]);

  // Cleanup speech recognition, audio player, and synthesis on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
        } catch {
          // ignore
        }
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopEmergencyBuzzer();
    };
  }, []);

  // Load and cache browser TTS voices (Chrome and Edge load speech synthesis voices asynchronously)
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const populateVoices = () => {
      try {
        const voiceList = window.speechSynthesis.getVoices();
        if (voiceList && voiceList.length > 0) {
          setAvailableVoices(voiceList);
          console.log(`🎙️ [Web Speech TTS] Loaded ${voiceList.length} browser voices.`);
        }
      } catch (err) {
        console.warn("Error getting speech synthesis voices:", err);
      }
    };

    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Selects an Indian English ('en-IN') or Hindi ('hi-IN') voice if available
  const getBestVoice = (isHindi: boolean): SpeechSynthesisVoice | null => {
    const list =
      availableVoices.length > 0
        ? availableVoices
        : typeof window !== "undefined" && "speechSynthesis" in window
        ? window.speechSynthesis.getVoices()
        : [];

    if (!list || list.length === 0) return null;

    if (isHindi) {
      // 1. Exact match for hi-IN or hi_IN
      const hiExact = list.find((v) => {
        const code = v.lang.toLowerCase().replace(/_/g, "-");
        return code === "hi-in" || code === "hi";
      });
      if (hiExact) return hiExact;

      // 2. Starts with hi (e.g. hi-Latn, hi-Deva)
      const hiPrefix = list.find((v) => v.lang.toLowerCase().startsWith("hi"));
      if (hiPrefix) return hiPrefix;

      // 3. Name has Hindi or Indian Hindi voice names (Hemant, Kalpana, Swara)
      const hiName = list.find((v) => /hindi|hemant|kalpana|swara/i.test(v.name));
      if (hiName) return hiName;
    } else {
      // Indian English preferred ('en-IN')
      // 1. Exact match for en-IN or en_IN
      const enInExact = list.find((v) => {
        const code = v.lang.toLowerCase().replace(/_/g, "-");
        return code === "en-in";
      });
      if (enInExact) return enInExact;

      // 2. Name contains India, Indian, or well-known Indian English voices (Ravi, Neerja, Heera, Prabhat)
      const enIndiaName = list.find(
        (v) =>
          /india|indian|ravi|neerja|heera|prabhat/i.test(v.name) &&
          v.lang.toLowerCase().startsWith("en")
      );
      if (enIndiaName) return enIndiaName;

      // 3. Fallback to en-GB or any English voice
      const enGb = list.find((v) => v.lang.toLowerCase().replace(/_/g, "-") === "en-gb");
      if (enGb) return enGb;

      const enAny = list.find((v) => v.lang.toLowerCase().startsWith("en"));
      if (enAny) return enAny;
    }

    return null;
  };

  // Speaks AI response automatically using native Web Speech API (window.speechSynthesis)
  const speakAiResponse = (textToSpeak: string, forcedLang?: Language) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      console.warn("⚠️ [Web Speech TTS] Speech synthesis is not supported in this browser.");
      return;
    }

    if (!textToSpeak || !textToSpeak.trim()) return;

    try {
      // 1. Cancel previous speech immediately and ensure synthesis engine is active
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      // 2. Determine target language: check Devanagari characters or active language
      const hasHindiChars = /[\u0900-\u097F]/.test(textToSpeak);
      const isHindi = hasHindiChars || (forcedLang ? forcedLang === "hi" : language === "hi");
      const targetLang = isHindi ? "hi-IN" : "en-IN";

      // 3. Clean markdown & symbol noise for natural verbal delivery
      const cleanText = textToSpeak
        .replace(/[*_#`~]/g, "")
        .replace(/[🚨🤖🧑💬📋🎯⚡🔊]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = targetLang;
      utterance.rate = isHindi ? 0.9 : 0.95;
      utterance.pitch = 1.0;

      // 4. Select best Indian voice (hi-IN or en-IN)
      const matchedVoice = getBestVoice(isHindi);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang;
        setActiveVoiceName(`${matchedVoice.name} (${matchedVoice.lang})`);
        console.log(`🔊 [Web Speech TTS] Autoplaying AI speech with voice: "${matchedVoice.name}" (${matchedVoice.lang})`);
      } else {
        setActiveVoiceName(`Default Voice (${targetLang})`);
        console.log(`🔊 [Web Speech TTS] Autoplaying AI speech with default voice for: "${targetLang}"`);
      }

      utterance.onstart = () => {
        setIsSpeakingAi(true);
      };

      utterance.onend = () => {
        setIsSpeakingAi(false);
      };

      utterance.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("⚠️ [Web Speech TTS] Speech playback notice/error:", e.error);
        }
        setIsSpeakingAi(false);
      };

      // 5. Autoplay immediately without user intervention
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("❌ [Web Speech TTS] Failed to execute speech synthesis:", err);
      setIsSpeakingAi(false);
    }
  };

  // Autoplays Google Cloud Text-to-Speech MP3 audio buffer
  const playMp3AudioBuffer = (
    base64Audio: string,
    engine?: string,
    voice?: string,
    fallbackText?: string
  ) => {
    if (!base64Audio) {
      if (fallbackText) speakAiResponse(fallbackText, language);
      return;
    }

    try {
      // 1. Stop any currently active browser speech or audio element
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.currentTime = 0;
        } catch {
          // ignore
        }
      }

      // 2. Setup Audio element with MP3 data URI
      const audioSrc = `data:audio/mp3;base64,${base64Audio}`;
      const audio = new Audio(audioSrc);
      audioPlayerRef.current = audio;
      setLastAudioBase64(base64Audio);
      setTtsEngine(engine || "google_cloud_tts");

      const voiceLabel =
        voice && voice !== "none"
          ? voice
          : engine === "google_cloud_tts"
          ? language === "hi"
            ? "hi-IN-Neural2-A (Google Cloud TTS)"
            : "en-IN-Neural2-A (Google Cloud TTS)"
          : "Google Cloud TTS (Fallback MP3)";
      setActiveVoiceName(voiceLabel);

      audio.onplay = () => {
        setIsPlayingAudio(true);
        console.log(`🔊 [Google Cloud TTS] Autoplaying MP3 audio buffer (${voiceLabel})...`);
      };

      audio.onended = () => {
        setIsPlayingAudio(false);
        console.log("🔊 [Google Cloud TTS] MP3 playback finished.");
      };

      audio.onerror = (e) => {
        console.warn("⚠️ [Google Cloud TTS] Audio element playback error, falling back to Web Speech:", e);
        setIsPlayingAudio(false);
        if (fallbackText) {
          speakAiResponse(fallbackText, language);
        }
      };

      // 3. Autoplay immediately without requiring user interaction
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlayingAudio(true);
            console.log("✅ [Google Cloud TTS] MP3 audio buffer playing cleanly.");
          })
          .catch((err) => {
            console.warn("⚠️ [Google Cloud TTS] Autoplay prevented by browser, falling back to Web Speech:", err);
            setIsPlayingAudio(false);
            if (fallbackText) {
              speakAiResponse(fallbackText, language);
            }
          });
      }
    } catch (err) {
      console.error("❌ [Google Cloud TTS] Failed to play MP3 buffer:", err);
      setIsPlayingAudio(false);
      if (fallbackText) {
        speakAiResponse(fallbackText, language);
      }
    }
  };

  const stopSpeaking = () => {
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch {
        // ignore
      }
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setIsSpeakingAi(false);
  };

  // Conversational Voice Bot call: Runs Speech-to-Text, Dialogflow intent detection, and Gemini clinical triage
  const callConversationalVoiceBot = async (textToAnalyze: string) => {
    if (!textToAnalyze.trim()) return;
    stopSpeaking();
    setIsAnalyzing(true);
    setErrorMessage(null);

    const langCode = language === "hi" ? "hi-IN" : "en-IN";
    // Construct full messages array including the latest user query
    const userTurn = {
      role: "user",
      text: textToAnalyze.trim(),
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...messages, userTurn];
    setMessages(updatedMessages);

    console.log(`🗣️ [Conversational Voice Bot] Dispatching request with FULL MESSAGES ARRAY (${updatedMessages.length} turns) to /api/voice/conversational-bot:`, {
      query: textToAnalyze,
      language_code: langCode,
      messages: updatedMessages,
      supported_languages: ["en-IN", "hi-IN"],
    });

    try {
      const res = await fetch(`${apiUrl}/api/voice/conversational-bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: textToAnalyze,
          session_id: effectiveSessionId,
          patient_name: effectivePatientName || undefined,
          language_code: langCode,
          mode: kioskContext?.consultationMode || "allopathy",
          messages: updatedMessages,
          chat_history: updatedMessages,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log("✅ [Conversational Voice Bot] Full response received:", data);

        // Append AI response to messages array to maintain complete conversation history
        if (data.fulfillment_text) {
          const aiTurn = {
            role: "model",
            text: data.fulfillment_text,
            timestamp: new Date().toISOString(),
          };
          setMessages([...updatedMessages, aiTurn]);
        }

        setConversationalResponse({
          fulfillment_text: data.fulfillment_text,
          intent: data.intent,
          confidence: data.confidence,
          emergency_alert_pushed: data.emergency_alert_pushed,
          mode: data.mode || kioskContext?.consultationMode || "allopathy",
          quick_replies: data.quick_replies || [],
          is_red_flag: data.is_red_flag || false,
          emergency_instruction: data.emergency_instruction || null,
          clinical_domain_findings: data.clinical_domain_findings || {},
          phase: data.phase,
          question_count_in_phase_1: data.question_count_in_phase_1,
          chat_history_context: data.chat_history_context || updatedMessages,
          audio_base64: data.audio_base64,
          audio_format: data.audio_format,
          tts_engine: data.tts_engine,
          tts_voice: data.tts_voice,
        });

        // Emergency Red-Flag Trigger: activate unmissable blinking modal and audio buzzer
        if (data.is_red_flag) {
          console.warn("🚨 [CRITICAL RED FLAG DETECTED]: Activating unmissable emergency modal & audio buzzer!");
          setShowRedAlertModal(true);
          playEmergencyBuzzer();
        }

        // Append turns to Global Kiosk Context for Doctor Dashboard synthesis
        if (globalAppendChatTurn) {
          globalAppendChatTurn("user", textToAnalyze);
          if (data.fulfillment_text) {
            globalAppendChatTurn("model", data.fulfillment_text);
          }
        }

        // Priority 1: Autoplay high-fidelity MP3 buffer from Google Cloud TTS API
        if (data.audio_base64) {
          console.log(
            `🔊 [Conversational Voice Bot] Received Google Cloud TTS MP3 audio buffer (${data.audio_base64.length} chars). Autoplaying immediately...`
          );
          playMp3AudioBuffer(
            data.audio_base64,
            data.tts_engine,
            data.tts_voice,
            data.fulfillment_text
          );
        } else if (data.fulfillment_text) {
          // Priority 2: Fallback to browser Web Speech API
          console.log("🔊 [Conversational Voice Bot] No backend audio buffer, falling back to Web Speech API...");
          speakAiResponse(data.fulfillment_text, language);
        }

        if (data.clinical_analysis) {
          console.log("🩺 [Gemini 3.1 Pro] Clinical symptoms extracted:", data.clinical_analysis);
          setClinicalAnalysis(data.clinical_analysis);
        }
      } else {
        const errorText = await res.text();
        console.error(`❌ [Conversational Voice Bot] Backend returned HTTP error ${res.status}:`, errorText);
        setErrorMessage(`Server voice bot error (${res.status}): ${errorText}`);
      }
    } catch (err: any) {
      console.error("❌ [Conversational Voice Bot] Network or execution error:", err);
      setErrorMessage(`Network error connecting to voice bot: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Fallback Gemini direct call
  const analyzeWithGemini = async (textToAnalyze: string) => {
    await callConversationalVoiceBot(textToAnalyze);
  };


  // Main Toggle: Requests Permissions & Starts Native Web Speech Recognition
  const toggleListening = async () => {
    stopSpeaking();
    // 1. If currently listening, stop the recognition session
    if (isListening) {
      console.log("🛑 [Web Speech API] Listening stopped by user.");
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Error stopping recognition:", e);
        }
      }
      setIsListening(false);

      if (transcript.trim()) {
        analyzeWithGemini(transcript.trim());
      }
      return;
    }

    // 2. Reset state for fresh capture
    setErrorMessage(null);
    setClinicalAnalysis(null);
    setTranscript("");

    // 3. Verify browser support for Web Speech API
    const SpeechRecognition =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognition) {
      console.warn("⚠️ [Web Speech API] Not supported in this browser.");
      setErrorMessage(
        language === "hi"
          ? "इस ब्राउज़र में वेब स्पीच एपीआई समर्थित नहीं है। कृपया Google Chrome या Microsoft Edge का उपयोग करें।"
          : "Web Speech API is not supported in this browser. Please use Google Chrome or Microsoft Edge."
      );
      return;
    }

    // 4. Explicitly request microphone permissions via getUserMedia
    console.log("🎙️ [Permission] Requesting microphone permission from user...");
    setPermissionStatus("requesting");

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("✅ [Permission] Microphone access granted by user.");
        setPermissionStatus("granted");

        // Release hardware audio tracks immediately so Web Speech API can attach without hardware conflict
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (permError: any) {
      console.error("❌ [Permission] Microphone access denied by user:", permError);
      setPermissionStatus("denied");
      setErrorMessage(
        language === "hi"
          ? "माइक्रोफ़ोन की अनुमति अस्वीकृत कर दी गई है। कृपया ब्राउज़र के एड्रेस बार में माइक्रोफ़ोन की अनुमति (Allow) दें।"
          : "Microphone permission denied. Please allow microphone access in your browser address bar."
      );
      return;
    }

    // 5. Initialize and configure Web Speech API Recognition instance
    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === "hi" ? "hi-IN" : "en-IN";

      recognition.onstart = () => {
        const langLabel = language === "hi" ? "Hindi (hi-IN)" : "English (en-IN)";
        console.log(`🎤 [Web Speech API] Listening started. Speak into your microphone (${langLabel})...`);
        setIsListening(true);
        setErrorMessage(null);
      };

      recognition.onresult = (event: any) => {
        let finalChunk = "";
        let interimChunk = "";

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript || "";
          if (result.isFinal) {
            finalChunk += text + " ";
          } else {
            interimChunk += text;
          }
        }

        const recognizedText = (finalChunk + interimChunk).trim();
        // Mandatory Console Log requirement
        console.log("🎤 [Web Speech API] Recognized text:", recognizedText);

        setTranscript(recognizedText);
        onVoiceResult(recognizedText);
      };

      recognition.onerror = (event: any) => {
        console.error("❌ [Web Speech API] Speech recognition error:", event.error, event);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setPermissionStatus("denied");
          setErrorMessage(
            language === "hi"
              ? "माइक्रोफ़ोन अनुमति अस्वीकृत है। कृपया ब्राउज़र सेटिंग्स में माइक्रोफ़ोन चालू करें।"
              : "Microphone permission denied. Please enable microphone permissions in your browser."
          );
        } else if (event.error === "no-speech") {
          console.log("ℹ️ [Web Speech API] No speech detected yet, continuing to listen...");
          return;
        } else if (event.error === "aborted") {
          // Normal abort when stopping or resetting
          return;
        } else if (event.error === "network") {
          setErrorMessage(
            language === "hi"
              ? "ब्राउज़र स्पीच नेटवर्क अनुपलब्ध है। कृपया नीचे दिए गए त्वरित लक्षणों में से चुनें या टाइप करें।"
              : "Speech recognition network unavailable. Please select from quick symptoms below or type your symptoms."
          );
        } else {
          setErrorMessage(`Speech recognition notice: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        console.log("🛑 [Web Speech API] Speech recognition session ended.");
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (startError: any) {
      console.error("❌ [Web Speech API] Failed to start recognition:", startError);
      setErrorMessage(startError.message || "Failed to start speech recognition.");
      setIsListening(false);
    }
  };

  // Preset clinical phrases for instant testing or environments without mic hardware
  const handleSelectPreset = (sampleText: string) => {
    stopSpeaking();
    console.log("🎤 [Demo Preset Selected] Recognized text:", sampleText);
    setTranscript(sampleText);
    onVoiceResult(sampleText);
    analyzeWithGemini(sampleText);
  };

  // Text-to-Speech Guidance
  const speakInstruction = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const textToSpeak = transcript
        ? t.voicePromptSuccessSpoken
        : t.voicePromptSpoken;

      const isHindi = language === "hi";
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = isHindi ? "hi-IN" : "en-IN";
      utterance.rate = 0.85;
      utterance.pitch = 1.0;

      const matchedVoice = getBestVoice(isHindi);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang;
      }

      utterance.onstart = () => setSpeakingGuide(true);
      utterance.onend = () => setSpeakingGuide(false);
      utterance.onerror = () => setSpeakingGuide(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-6 w-full max-w-3xl mx-auto">
      {/* Audio guide trigger pill */}
      <button
        onClick={speakInstruction}
        className={`inline-flex items-center space-x-2.5 px-6 py-2.5 rounded-full font-bold text-sm sm:text-base transition-all transform hover:scale-105 active:scale-95 shadow-sm ${
          ultraContrast
            ? "bg-[#FFFF00] text-black border-4 border-black"
            : "bg-white text-teal-700 border border-teal-200/80 hover:bg-teal-50 shadow-[0_2px_12px_rgba(13,148,136,0.12)]"
        }`}
        aria-label={t.listenToGuide}
      >
        <Volume2 className={`w-5 h-5 ${speakingGuide ? "animate-bounce text-teal-600" : "text-teal-600"}`} />
        <span>{t.listenToGuide} (🔊)</span>
      </button>

      {/* Permission Warning / Error Alert Banner */}
      {errorMessage && (
        <div className="w-full max-w-xl p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-sm font-bold flex items-start space-x-3 shadow-md animate-shake">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-extrabold">{errorMessage}</p>
            <p className="text-xs text-rose-600 mt-1 font-normal">
              {language === "hi"
                ? "युक्ति: ब्राउज़र एड्रेस बार में लॉक (🔒) आइकन पर क्लिक करें और 'Microphone' को 'Allow' करें।"
                : "Tip: Click the lock (🔒) icon in your browser address bar and set 'Microphone' to 'Allow'."}
            </p>
          </div>
        </div>
      )}

      {/* Dynamic 3-State CSS Waveform Visualizer & Central Voice Terminal */}
      <WaveformVisualizer
        mode={isListening ? "listening" : isPlayingAudio || isSpeakingAi ? "speaking" : "idle"}
        onToggleListening={toggleListening}
        onStopSpeaking={stopSpeaking}
        language={language}
        ultraContrast={ultraContrast}
        activeVoiceName={activeVoiceName}
        errorMessage={errorMessage}
        quickReplies={conversationalResponse?.quick_replies}
        onSelectQuickReply={(chip) => {
          stopSpeaking();
          setTranscript(chip);
          callConversationalVoiceBot(chip);
        }}
        isAnalyzing={isAnalyzing}
      />

      {/* 🚨 UNMISSABLE HIGH-PRIORITY BLINKING RED ALERT MODAL WITH AUDIO BUZZER */}
      {showRedAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-red-950/90 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="relative w-full max-w-2xl bg-gradient-to-b from-red-600 via-rose-700 to-red-800 text-white rounded-3xl p-6 sm:p-10 shadow-[0_0_120px_rgba(239,68,68,1)] border-4 border-white animate-pulse space-y-6 text-center">
            
            {/* Blinking Emergency Siren Icon & Top Badge */}
            <div className="flex flex-col items-center space-y-3">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white text-red-700 flex items-center justify-center shadow-2xl animate-bounce">
                <AlertTriangle className="w-12 h-12 sm:w-14 sm:h-14" />
              </div>
              <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/50 text-xs sm:text-sm font-black uppercase tracking-widest text-amber-300">
                <Radio className="w-4 h-4 text-rose-400 animate-ping" />
                <span>CODE RED • CRITICAL TRIAGE PRIORITY 1</span>
              </div>
            </div>

            {/* Exact Required String in Unmissable Blinking Headline */}
            <div className="space-y-3">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-snug uppercase drop-shadow-lg text-white">
                🚨 EMERGENCY ALERT: Please report to the Emergency/Triage Room immediately. Staff has been notified.
              </h2>
              {language === "hi" && (
                <p className="text-base sm:text-lg font-black text-amber-200 drop-shadow-sm">
                  आपातकालीन सूचना: कृपया तुरंत आपातकालीन / ट्राइएज कक्ष में जाएँ। स्वास्थ्य कर्मचारियों को सूचित कर दिया गया है।
                </p>
              )}
            </div>

            {/* Real-time Telemetry Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/30 text-left space-y-2.5">
              <div className="flex items-center justify-between text-xs sm:text-sm font-black border-b border-white/20 pb-2">
                <span>PATIENT: {effectivePatientName || "Emergency Walk-In"}</span>
                <span className="font-mono bg-white text-red-800 px-2.5 py-0.5 rounded-md font-bold">
                  RESUSCITATION ROOM 101
                </span>
              </div>
              <p className="text-sm font-bold text-red-100 leading-relaxed">
                {conversationalResponse?.emergency_instruction ||
                  "Critical red-flag symptoms detected. The casualty department and triage nursing officers have been dispatched."}
              </p>
              <div className="flex items-center justify-between pt-1 text-xs text-red-200">
                <span className="flex items-center space-x-1.5 font-bold">
                  <Activity className="w-4 h-4 animate-spin text-amber-300" />
                  <span>Audio Buzzer: {buzzerActive ? "🔊 ACTIVE ALARM SIREN" : "MUTED"}</span>
                </span>
                <span className="font-mono text-[11px] text-white/90">
                  Doctor Dashboard Notified via WebSocket
                </span>
              </div>
            </div>

            {/* Action Buttons: Audio Buzzer Controls & Acknowledge */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              {buzzerActive ? (
                <button
                  type="button"
                  onClick={stopEmergencyBuzzer}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-black/60 hover:bg-black/80 text-white font-black text-sm flex items-center justify-center space-x-2 border border-white/40 transition active:scale-95"
                >
                  <VolumeX className="w-4 h-4 text-rose-300" />
                  <span>{language === "hi" ? "सायरन म्यूट करें" : "Mute Siren"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={playEmergencyBuzzer}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-black font-black text-sm flex items-center justify-center space-x-2 transition active:scale-95"
                >
                  <Volume2 className="w-4 h-4 text-black" />
                  <span>{language === "hi" ? "सायरन दोबारा बजाएं" : "Replay Siren"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  stopEmergencyBuzzer();
                  setShowRedAlertModal(false);
                }}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-red-700 font-black text-base flex items-center justify-center space-x-2 shadow-2xl transition active:scale-95"
              >
                <span>{language === "hi" ? "कर्मचारी सूचित (Proceed) →" : "Staff Notified - Proceed →"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Subtitle and Live Tech Telemetry */}
      <div className="text-center space-y-1">
        <p
          className={`font-bold text-base sm:text-lg max-w-lg mx-auto ${
            ultraContrast ? "text-[#FFFF00]" : "text-slate-600"
          }`}
        >
          {isListening
            ? language === "hi"
              ? "साफ़-साफ़ बोलें... बोलने के बाद रोकने के लिए बटन दबाएं।"
              : "Speak clearly into your microphone. Tap the button when finished."
            : t.voiceInstruction}
        </p>
        <div className="flex items-center justify-center space-x-2 text-xs font-semibold text-teal-700">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          <span>
            {permissionStatus === "granted"
              ? "Microphone Active • Native Web Speech API • Gemini 3.1 Pro"
              : "Browser Web Speech API • Chrome & Edge Supported"}
          </span>
        </div>
      </div>

      {/* Live Recognized Speech Transcript Card */}
      {(transcript || isListening) && (
        <div
          className={`w-full p-5 sm:p-6 rounded-3xl border-2 transition-all shadow-lg space-y-3 ${
            ultraContrast
              ? "bg-black text-white border-[#FFFF00]"
              : "bg-white text-slate-900 border-teal-200 shadow-teal-700/5"
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              {isListening ? (
                <span className="inline-flex items-center text-xs font-extrabold px-3 py-1 rounded-full bg-rose-100 text-rose-700 uppercase tracking-wider animate-pulse border border-rose-300">
                  <Radio className="w-3.5 h-3.5 mr-1.5 text-rose-600 animate-ping" />
                  {language === "hi" ? "लाइव रिकॉर्डिंग जारी है..." : "Live Listening..."}
                </span>
              ) : (
                <span className="inline-flex items-center text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  {language === "hi" ? "आवाज़ दर्ज हुई" : "Speech Captured"}
                </span>
              )}
              <span className="text-xs font-mono font-bold text-slate-400">
                [Web Speech API]
              </span>
            </div>

            {transcript && !isListening && (
              <button
                onClick={() => {
                  setTranscript("");
                  setMessages([]);
                  setConversationalResponse(null);
                  setClinicalAnalysis(null);
                  setShowHistoryContext(false);
                  fetch(`${apiUrl}/api/voice/triage-interview/reset`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ session_id: effectiveSessionId }),
                  }).catch(console.error);
                }}
                className="text-xs text-slate-500 hover:text-rose-600 font-bold flex items-center space-x-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{language === "hi" ? "साफ़ व रीसेट करें" : "Clear & Reset"}</span>
              </button>
            )}
          </div>

          <div>
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider block">
              {language === "hi" ? "मरीज़ द्वारा बोला गया विवरण:" : "Captured Patient Statement:"}
            </span>
            <p
              className={`text-lg sm:text-2xl font-black mt-1 leading-snug ${
                transcript ? "text-slate-900" : "text-slate-400 italic"
              }`}
            >
              {transcript || (language === "hi" ? "बोलना शुरू करें..." : "Speak now...")}
            </p>
          </div>

          {/* Conversational Voice Bot 3-Phase Clinical Triage Bubble */}
          {conversationalResponse?.fulfillment_text && (
            <div className="p-4 rounded-2xl bg-teal-50/90 border-2 border-teal-300 text-slate-800 space-y-2 shadow-sm animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center space-x-1.5 text-xs font-black px-2.5 py-0.5 rounded-full bg-teal-600 text-white uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  <span>Clinical Triage Expert</span>
                </span>
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                      (conversationalResponse as any).phase === "phase_1_chief_complaint"
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : (conversationalResponse as any).phase === "phase_2_past_medical_history"
                        ? "bg-indigo-100 text-indigo-900 border-indigo-300"
                        : "bg-emerald-100 text-emerald-900 border-emerald-300"
                    }`}
                  >
                    {(conversationalResponse as any).phase === "phase_1_chief_complaint"
                      ? `Phase 1: Chief Complaint (Q ${(conversationalResponse as any).question_count_in_phase_1 || 1}/3)`
                      : (conversationalResponse as any).phase === "phase_2_past_medical_history"
                      ? "Phase 2: Past Medical History"
                      : "Phase 3: Triage Complete"}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    Strict: 1 Question
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-base sm:text-lg font-black text-teal-950 leading-relaxed flex-1">
                  💬 {conversationalResponse.fulfillment_text}
                </p>

                {/* Real-time Google Cloud TTS Speech Indicator & Controls */}
                <div className="flex items-center space-x-2 shrink-0">
                  {isPlayingAudio || isSpeakingAi ? (
                    <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold animate-pulse border border-emerald-300 shadow-sm">
                      <Volume2 className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                      <span>
                        {isPlayingAudio
                          ? language === "hi"
                            ? "Google Cloud TTS आवाज़ चल रही है..."
                            : "Google Cloud TTS (MP3) Playing..."
                          : language === "hi"
                          ? "आवाज़ में बोला जा रहा है..."
                          : "Speaking Out Loud..."}
                      </span>
                      <button
                        type="button"
                        onClick={stopSpeaking}
                        title={language === "hi" ? "आवाज़ रोकें" : "Stop Speech"}
                        className="ml-1 p-0.5 rounded hover:bg-emerald-200 text-rose-600"
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (lastAudioBase64 || conversationalResponse.audio_base64) {
                          playMp3AudioBuffer(
                            lastAudioBase64 || conversationalResponse.audio_base64!,
                            conversationalResponse.tts_engine,
                            conversationalResponse.tts_voice,
                            conversationalResponse.fulfillment_text
                          );
                        } else if (conversationalResponse.fulfillment_text) {
                          speakAiResponse(conversationalResponse.fulfillment_text, language);
                        }
                      }}
                      className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white hover:bg-teal-100/80 border border-teal-200 text-teal-800 text-xs font-bold transition shadow-xs"
                      title={language === "hi" ? "आवाज़ दोबारा सुनें (MP3)" : "Replay Audio (MP3)"}
                    >
                      <Volume2 className="w-3.5 h-3.5 text-teal-600" />
                      <span>
                        {language === "hi" ? "दोबारा सुनें (MP3)" : "Replay Voice (MP3)"}
                      </span>
                    </button>
                  )}
                  {activeVoiceName && (
                    <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] font-mono text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded border border-teal-200">
                      <Sparkles className="w-2.5 h-2.5 text-teal-600" />
                      <span>
                        {activeVoiceName.length > 32 ? activeVoiceName.slice(0, 30) + "..." : activeVoiceName}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Emergency Red-Flag Alert Banner */}
              {conversationalResponse.is_red_flag && (
                <div className="mt-3 p-4 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-lg border border-red-400 animate-pulse">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-white/20 rounded-xl shrink-0">
                      <AlertTriangle className="w-6 h-6 text-white animate-bounce" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-black text-xs uppercase tracking-wider bg-white text-red-700 px-2 py-0.5 rounded">
                          CRITICAL RED ALERT
                        </span>
                        <span className="text-xs font-bold text-red-100">
                          Casualty / Resuscitation Counter #1
                        </span>
                      </div>
                      <p className="text-sm font-bold leading-relaxed">
                        {conversationalResponse.emergency_instruction ||
                          (language === "hi"
                            ? "कृपया बिना किसी देरी के तुरंत कैजुअल्टी एवं इमरजेंसी ट्राइएज काउंटर 1 पर जाएं।"
                            : "Please proceed immediately to the Casualty / Emergency Triage Counter #1.")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Contextual Touch Quick-Reply Options (Chips) */}
              {conversationalResponse.quick_replies && conversationalResponse.quick_replies.length > 0 && (
                <div className="pt-3 border-t border-teal-200/80 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-800 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      <span>
                        {language === "hi" ? "त्वरित उत्तर विकल्प (Touch to reply):" : "Quick Touch Replies:"}
                      </span>
                    </span>
                    {conversationalResponse.mode && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 capitalize border border-teal-200">
                        {conversationalResponse.mode} mode
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {conversationalResponse.quick_replies.map((chip, chipIdx) => (
                      <button
                        key={chipIdx}
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => {
                          setTranscript(chip);
                          callConversationalVoiceBot(chip);
                        }}
                        className={`px-4 py-2.5 rounded-xl border font-bold text-sm transition-all shadow-xs active:scale-95 flex items-center space-x-1.5 ${
                          conversationalResponse.is_red_flag
                            ? "bg-red-50 hover:bg-red-100 border-red-300 text-red-900"
                            : "bg-white hover:bg-teal-100 border-teal-300 hover:border-teal-500 text-teal-950"
                        }`}
                      >
                        <span>{chip}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat History Context Transcript Accordion */}
              {conversationalResponse?.chat_history_context && conversationalResponse.chat_history_context.length > 0 && (
                <div className="pt-2 border-t border-teal-200/80 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowHistoryContext(!showHistoryContext)}
                    className="w-full flex items-center justify-between text-xs font-bold text-teal-800 hover:text-teal-950 py-1"
                  >
                    <div className="flex items-center space-x-1.5">
                      <History className="w-3.5 h-3.5 text-teal-600" />
                      <span>
                        {language === "hi"
                          ? `चैट हिस्ट्री कॉन्टेक्स्ट (${conversationalResponse.chat_history_context.length} संदेश मेमोरी में सक्रिय)`
                          : `Chat History Context (${conversationalResponse.chat_history_context.length} turns in memory)`}
                      </span>
                    </div>
                    {showHistoryContext ? (
                      <ChevronUp className="w-4 h-4 text-teal-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-teal-600" />
                    )}
                  </button>

                  {showHistoryContext && (
                    <div className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
                      {conversationalResponse.chat_history_context.map((turn, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border ${
                            turn.role === "user"
                              ? "bg-white/90 border-slate-200 text-slate-900"
                              : "bg-teal-100/80 border-teal-300 text-teal-950 font-medium"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                turn.role === "user"
                                  ? "bg-slate-200 text-slate-800"
                                  : "bg-teal-700 text-white"
                              }`}
                            >
                              {turn.role === "user" ? "🧑 Patient" : "🤖 Gemini Triage"}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString() : ""}
                            </span>
                          </div>
                          <p className="leading-snug">{turn.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

                {/* Push Clinical Summary to Doctor Dashboard Action */}
                <div className="pt-3 border-t border-teal-200/80 mt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      stopSpeaking();
                      if (globalSetStep) {
                        globalSetStep("upload");
                      }
                    }}
                    className="w-full py-3.5 px-4 rounded-xl font-black text-sm tracking-wide flex items-center justify-center space-x-2 bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white shadow-md transition active:scale-98"
                  >
                    <span>
                      {language === "hi"
                        ? "अगला कदम: मेडिकल रिपोर्ट या पर्ची अपलोड करें →"
                        : "Next Step: Upload Medical Reports & Prescriptions →"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateClinicalSummary}
                    disabled={isGeneratingSummary}
                    className="w-full py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition disabled:opacity-50"
                  >
                    <Sparkles className={`w-4 h-4 ${isGeneratingSummary ? "animate-spin" : ""}`} />
                    <span>
                      {isGeneratingSummary
                        ? "Gemini 1.5 Pro Synthesizing..."
                        : language === "hi"
                        ? "📋 तुरंत क्लिनिकल सारांश भेजें (Gemini 1.5 Pro)"
                        : "📋 Direct Send Clinical Summary (Gemini 1.5 Pro)"}
                    </span>
                  </button>

                {summarySuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold flex items-center space-x-1.5 text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Clinical Summary Pushed to Doctor Dashboard!</span>
                      </p>
                      <a
                        href="/doctor"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-teal-700 underline hover:text-teal-900 flex items-center space-x-1"
                      >
                        <span>Open Dashboard ↗</span>
                      </a>
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      <strong>Chief Complaint:</strong> {summarySuccess.chief_complaint}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}


          {/* Action to re-trigger Gemini analysis if stopped */}
          {transcript && !isListening && !clinicalAnalysis && !isAnalyzing && (
            <div className="pt-2">
              <button
                onClick={() => analyzeWithGemini(transcript)}
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm sm:text-base uppercase tracking-wider flex items-center justify-center space-x-2 transition ${
                  ultraContrast
                    ? "bg-[#FFFF00] text-black border-2 border-black"
                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>{language === "hi" ? "जेमिनी 3.1 से लक्षणों की जांच करें" : "Analyze Symptoms with Gemini 3.1 Pro"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Text Fallback Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!manualInput.trim()) return;
          const text = manualInput.trim();
          setTranscript(text);
          onVoiceResult(text);
          setManualInput("");
          callConversationalVoiceBot(text);
        }}
        className="w-full max-w-2xl flex items-center gap-2 bg-white/95 rounded-2xl p-2 border border-teal-200 shadow-sm"
      >
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder={
            language === "hi"
              ? "या यहां अपने लक्षण लिखें या प्रश्न का उत्तर दें..."
              : "Or type your symptoms / respond to AI question here..."
          }
          className="flex-1 px-4 py-2.5 rounded-xl text-sm sm:text-base border border-slate-200 focus:outline-none focus:border-teal-500 text-slate-800 placeholder-slate-400"
        />
        <button
          type="submit"
          disabled={!manualInput.trim() || isAnalyzing}
          className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-bold text-sm flex items-center space-x-1.5 transition shadow-sm shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          <span>{language === "hi" ? "भेजें" : "Send"}</span>
        </button>
      </form>

      {/* Quick Test Preset Phrases */}
      <div className="w-full max-w-2xl bg-slate-100/80 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            {language === "hi"
              ? "⚡ त्वरित आवाज़ परीक्षण (माइक के बिना भी टेस्ट करें):"
              : "⚡ Quick Voice Simulator (Test without mic):"}
          </span>
          <span className="text-[11px] font-mono font-semibold text-teal-700">One-Click Triage</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              handleSelectPreset(
                language === "hi"
                  ? "मरीज़ को अचानक छाती में तेज़ दर्द और सांस लेने में गंभीर तकलीफ़ हो रही है।"
                  : "Patient experiencing severe chest pain, shortness of breath and breathlessness for 30 minutes."
              )
            }
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 transition flex items-center space-x-1.5 shadow-sm"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>
              {language === "hi"
                ? "🚨 छाती में दर्द व सांस फूलना (आपातकालीन)"
                : "🚨 Chest Pain & Breathlessness (Emergency)"}
            </span>
          </button>

          <button
            onClick={() =>
              handleSelectPreset(
                language === "hi"
                  ? "मरीज़ को पेट में बहुत तेज़ दर्द हो रहा है।"
                  : "Patient experiencing severe stomach ache and abdominal cramps."
              )
            }
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 transition flex items-center space-x-1.5 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              {language === "hi"
                ? "🎯 पेट दर्द (3-चरण ट्राइएज इंटरव्यू)"
                : "🎯 Stomach Ache (3-Phase Triage Interview)"}
            </span>
          </button>

          <button
            onClick={() =>
              handleSelectPreset(
                language === "hi"
                  ? "मुझे 3 दिन से बुख़ार और सीने में भारीपन है। 5 साल से बीपी और 8 साल से शुगर है। टेलमिसार्टन लेता हूँ।"
                  : "Patient with 3-day history of high fever, chest tightness, chronic hypertension on Telmisartan, and diabetes."
              )
            }
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-300 transition flex items-center space-x-1.5 shadow-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            <span>
              {language === "hi"
                ? "📋 पूरा 3-चरण ट्राइएज + सारांश"
                : "📋 Full 3-Phase Triage + Summary"}
            </span>
          </button>
        </div>
      </div>


      {/* Analyzing Indicator */}
      {isAnalyzing && (
        <div className="flex items-center space-x-3 p-4 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 text-sm font-bold shadow-sm animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
          <span>Analyzing symptoms and triaging with Gemini 3.1 Pro...</span>
        </div>
      )}

      {/* Clinical Symptom Extraction & Triage Card */}
      {clinicalAnalysis && (
        <div
          className={`w-full p-6 sm:p-8 rounded-3xl border-2 transition-all shadow-xl space-y-5 ${
            ultraContrast
              ? "bg-black text-white border-[#FFFF00]"
              : "bg-white text-slate-900 border-teal-300 shadow-[0_12px_40px_rgba(13,148,136,0.12)]"
          }`}
        >
          {/* Card Top: Triage Urgency & Gemini Model Tag */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-teal-600" />
              <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-teal-800 font-mono">
                Gemini 3.1 Pro Clinical Diagnosis
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {clinicalAnalysis.is_emergency ? (
                <span className="inline-flex items-center text-xs font-black px-3 py-1 rounded-full bg-rose-600 text-white uppercase tracking-wider animate-bounce shadow-md">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Emergency Triage
                </span>
              ) : (
                <span
                  className={`inline-flex items-center text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                    clinicalAnalysis.severity_level === "severe"
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Severity: {clinicalAnalysis.severity_level}
                </span>
              )}
            </div>
          </div>

          {/* Patient Chief Complaint */}
          <div>
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider block">
              Chief Medical Complaint
            </span>
            <p className="text-xl sm:text-2xl font-black text-slate-800 mt-0.5">
              {clinicalAnalysis.primary_complaint}
            </p>
            {clinicalAnalysis.duration && (
              <span className="text-xs text-slate-500 font-semibold">
                Duration: <strong className="text-teal-700">{clinicalAnalysis.duration}</strong>
              </span>
            )}
          </div>

          {/* Identified Clinical Symptoms List */}
          <div>
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
              Extracted Clinical Symptoms
            </span>
            <div className="flex flex-wrap gap-2">
              {clinicalAnalysis.symptoms.map((symptom, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-xl bg-teal-50 text-teal-900 border border-teal-200 text-xs sm:text-sm font-bold flex items-center space-x-1.5 shadow-sm"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                  <span>{symptom}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Recommended Department & Vitals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm">
            <div>
              <span className="text-slate-400 uppercase font-semibold text-[11px] block">
                Recommended OPD Clinic
              </span>
              <p className="font-extrabold text-teal-800 text-sm sm:text-base mt-0.5">
                {clinicalAnalysis.recommended_department}
              </p>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-semibold text-[11px] block">
                Vital Signs to Record on Kiosk
              </span>
              <p className="font-bold text-slate-700 mt-0.5">
                {clinicalAnalysis.vital_signs_to_check.join(", ")}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => onConfirmCheckIn(transcript, clinicalAnalysis)}
              className={`w-full sm:flex-1 py-4 px-6 rounded-2xl font-black text-lg sm:text-xl uppercase tracking-wider flex items-center justify-center space-x-3 transition-transform active:scale-95 shadow-md ${
                ultraContrast
                  ? "bg-[#FFFF00] text-black border-4 border-black hover:bg-white"
                  : "bg-teal-600 hover:bg-teal-500 text-white shadow-[0_4px_16px_rgba(13,148,136,0.3)]"
              }`}
            >
              <CheckCircle2 className="w-6 h-6" />
              <span>{t.confirmCheckIn}</span>
            </button>

            <button
              onClick={toggleListening}
              className={`w-full sm:w-auto py-4 px-6 rounded-2xl font-bold text-base uppercase flex items-center justify-center space-x-2 border transition ${
                ultraContrast
                  ? "bg-transparent text-white border-white hover:bg-white hover:text-black"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t.tryAgain}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
