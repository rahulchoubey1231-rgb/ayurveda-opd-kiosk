"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRequirePatientSession } from "@/context/PatientSessionContext";
import { Mic, MicOff, ArrowRight, ArrowLeft, RefreshCw, Volume2, VolumeX, MessageCircle, ChevronDown, Sparkles, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function TriagePage() {
  const router = useRouter();
  const { session, isReady } = useRequirePatientSession("/login");

  const [isListening, setIsListening] = useState<boolean>(false);
  const [isAiResponding, setIsAiResponding] = useState<boolean>(false);
  const [currentAiQuestion, setCurrentAiQuestion] = useState<string>("");
  const [quickReplies, setQuickReplies] = useState<string[]>([
    "तेज़ बुख़ार (High Fever)",
    "खांसी एवं जुकाम (Cough & Cold)",
    "पेट दर्द (Abdominal Pain)",
    "चक्कर आना / कमज़ोरी (Dizziness)",
  ]);
  const [isRedFlagModalOpen, setIsRedFlagModalOpen] = useState<boolean>(false);
  const [redFlagMessage, setRedFlagMessage] = useState<string>("");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [textInput, setTextInput] = useState<string>("");
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [userTurnsCount, setUserTurnsCount] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // Calculate strict step progression for the UI (1 to 4 max)
  const currentStep = Math.min(4, Math.floor((session?.conversation_history?.length || 0) / 2) + 1);

  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [initError, setInitError] = useState<string>("");

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll history
  useEffect(() => {
    if (showHistory && historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.conversation_history, showHistory]);

  // Text-to-Speech Helper
  const speakText = (text: string) => {
    if (isMuted || !synthRef.current || !session) return;
    try {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = session.language === "hi" ? "hi-IN" : "en-IN";
      
      const voices = synthRef.current.getVoices();
      if (voices.length > 0) {
        const preferredVoice = voices.find(v => v.lang.includes(utterance.lang) || v.name.toLowerCase().includes(session.language === "hi" ? "hindi" : "english"));
        if (preferredVoice) utterance.voice = preferredVoice;
      }
      
      utterance.rate = 0.95;
      synthRef.current.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const nextMuted = !prev;
      if (nextMuted && synthRef.current) {
        // Immediately silence any ongoing speech
        synthRef.current.cancel();
      }
      return nextMuted;
    });
  };

  // Play Emergency Buzzer Tone
  const playEmergencyTone = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      osc.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.9);
    } catch {
      // Ignore audio errors
    }
  };

  const endSessionAndClear = () => {
    if (!session) return;
    if (window.confirm(session.language === "hi" ? "क्या आप वाकई रद्द करना चाहते हैं?" : "Are you sure you want to cancel?")) {
      session.clearSession();
      router.push("/");
    }
  };

  // Initial Greeting with API call, Try/Catch, and Timeout
  const initializeEngine = async () => {
    if (!isReady || !session || !session.full_name) return;

    if (session.conversation_history.length > 0) {
      // Restore latest question from history
      const lastModelTurn = [...session.conversation_history].reverse().find((t: any) => t.role === "model");
      if (lastModelTurn) setCurrentAiQuestion(lastModelTurn.text);
      setUserTurnsCount(session.conversation_history.filter((t: any) => t.role === "user").length);
      return;
    }

    setIsInitializing(true);
    setInitError("");

    const localGreeting = session.language === "hi"
      ? `नमस्ते ${session.full_name}, मैं आपका AI मेडिकल असिस्टेंट हूँ। आपको आज क्या स्वास्थ्य समस्या हो रही है?`
      : `Hello ${session.full_name}, I am your AI Medical Assistant. What health issues are you facing today?`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000); // 7-second safety timeout

      const res = await fetch(`${apiUrl}/api/voice/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: session.full_name,
          language: session.language
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const data = await res.json();
      const greeting = data.greeting || localGreeting;

      setCurrentAiQuestion(greeting);
      session.appendConversationTurn("model", greeting);
      speakText(greeting);
    } catch (err: any) {
      console.warn("API connection failed. Falling back to local greeting:", err);
      // Fallback
      setCurrentAiQuestion(localGreeting);
      session.appendConversationTurn("model", localGreeting);
      speakText(localGreeting);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    initializeEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, session?.full_name, session?.language]);

  // Speech Recognition & Synthesis Setup
  useEffect(() => {
    if (typeof window === "undefined" || !session) return;
    
    // Initialize Speech Synthesis
    synthRef.current = window.speechSynthesis;
    // Preload voices to fix Chrome bugs
    if (synthRef.current.onvoiceschanged !== undefined) {
      synthRef.current.onvoiceschanged = () => synthRef.current?.getVoices();
    }
    synthRef.current.getVoices();

    // Initialize Speech Recognition
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = session.language === "hi" ? "hi-IN" : "en-IN";

      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onerror = (e: any) => {
        console.warn("Speech recognition notice:", e);
        setIsListening(false);
      };
      rec.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript;
        if (transcript.trim()) handleSendPatientTurn(transcript.trim());
      };
      recognitionRef.current = rec;
    }
  }, [session?.language]);

  const toggleListening = () => {
    if (!recognitionRef.current || !session) {
      alert("Speech recognition not supported. Please type your symptoms below.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.lang = session.language === "hi" ? "hi-IN" : "en-IN";
        recognitionRef.current.start();
      } catch (e) {
        console.warn("Could not start recognition:", e);
      }
    }
  };

  // Process Patient Answer via Backend Gemini Clinical Engine
  const handleSendPatientTurn = async (userText: string) => {
    if (!userText.trim() || isAiResponding || !session) return;

    if (userText.includes("सीधे आगे बढ़ें") || userText === "नहीं, सीधे आगे बढ़ें") {
      router.push("/token-slip");
      return;
    }
    if (userText.includes("रिपोर्ट अपलोड") || userText.includes("अपलोड करें") || userText === "हाँ, पुरानी रिपोर्ट अपलोड करें") {
      router.push("/upload-records");
      return;
    }

    session.appendConversationTurn("user", userText);
    setTextInput("");
    setIsAiResponding(true);
    setUserTurnsCount((prev) => prev + 1);

    // Build the full history including this new user turn
    try {
      const res = await fetch(`/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Primary expected field name by backend
          user_message: userText,
          query: userText,
          session_id: session.session_id,
          language_code: session.language === "hi" ? "hi-IN" : "en-IN",
          patient_name: session.full_name,
          mode: session.opd_mode,
          // Send the history without the current user text, 
          // since the backend will process userText as the active prompt
          messages: session.conversation_history,
          conversation_history: session.conversation_history,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiReply =
          data.reply ||
          data.fulfillment_text ||
          data.response ||
          data.message ||
          (session.language === "hi"
            ? "कृपया मुझे अपने लक्षणों के बारे में और बताएं।"
            : "Please tell me more about your symptoms.");
        
        setCurrentAiQuestion(aiReply);
        session.appendConversationTurn("model", aiReply);
        speakText(aiReply);

        if (data.isCompleted) setIsCompleted(true);
          
        // Clear previous buttons and update with new options
        setQuickReplies([]); // Reset first
        if (Array.isArray(data.options) && data.options.length > 0) {
          setQuickReplies(data.options);
        } else if (Array.isArray(data.quick_replies) && data.quick_replies.length > 0) {
          setQuickReplies(data.quick_replies);
        }

        if (data.is_red_flag) {
          playEmergencyTone();
          setRedFlagMessage(
            data.emergency_instruction ||
              "⚠️ EMERGENCY: Critical symptoms detected. Please report to the Emergency/Triage Room immediately. Staff has been notified."
          );
          setIsRedFlagModalOpen(true);
        }
      } else {
        const fallbackReply =
          session.language === "hi"
            ? "मुझे खेद है, मैं अभी समझ नहीं पाया। क्या आप बता सकते हैं कि यह समस्या कब से है?"
            : "I'm sorry, I couldn't process that. How long have you had this problem?";
        setCurrentAiQuestion(fallbackReply);
        session.appendConversationTurn("model", fallbackReply);
        speakText(fallbackReply);
      }
    } catch (err) {
      console.error("Clinical bot error:", err);
      const fallbackReply =
        session.language === "hi"
          ? "सर्वर से संपर्क टूट गया है। कृपया रिसेप्शन से संपर्क करें।"
          : "Connection lost. Please contact the reception.";
      setCurrentAiQuestion(fallbackReply);
      session.appendConversationTurn("model", fallbackReply);
      speakText(fallbackReply);
    } finally {
      setIsAiResponding(false);
    }
  };

  if (!isReady || !session?.full_name) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Validating patient session...</p>
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Connecting to MediKiosk AI Clinical Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header & Patient Ribbon */}
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <span className="text-white font-black text-xs">MK</span>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-widest uppercase text-white/90">
                Medi<span className="text-teal-400">Kiosk</span>
              </h1>
              <p className="text-[10px] text-teal-500/80 font-bold uppercase tracking-widest">
                AI Clinical Engine
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Triage Section */}
      <main className="max-w-3xl mx-auto px-4 py-6 w-full flex-1 flex flex-col">
        {/* Step Indicator */}
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
          <span>Step {currentStep} of 4: Adaptive Voice + Touch Triage</span>
          <span className="text-teal-400 font-mono">SOCRATES Clinical Protocol</span>
        </div>

        {/* Action Header */}
        <div className="flex items-center justify-between mb-2">
          <Link
            href="/opd-modes"
            className="flex items-center space-x-2 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-semibold">
              {session.language === "hi" ? "पीछे (Back)" : "Back"}
            </span>
          </Link>
          <div className="flex space-x-3">
            <button
              onClick={toggleMute}
              className="p-2 rounded-full bg-slate-900 border border-white/10 text-slate-300 hover:text-white transition"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button
              onClick={endSessionAndClear}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition"
            >
              <X className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">
                {session.language === "hi" ? "रद्द करें" : "Cancel"}
              </span>
            </button>
          </div>
        </div>

        {/* Patient Identification Card */}
        <div className="flex items-center space-x-3 p-3 rounded-2xl bg-slate-900/60 border border-white/5 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-black text-white shadow-lg">
            {session.full_name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{session.full_name}</p>
            <p className="text-xs text-slate-400 capitalize">
              {session.gender} • {session.age} yrs • {session.opd_mode}
            </p>
          </div>
        </div>

        {/* AI Question Showcase */}
        <motion.div
          key={currentAiQuestion}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-3xl bg-slate-900/90 border border-teal-500/30 shadow-2xl relative overflow-hidden my-4"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-500" />
          <div className="flex items-center space-x-2 mb-3">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30 text-[11px] font-black uppercase tracking-wider flex items-center space-x-1">
              <Sparkles className="w-3 h-3" />
              <span>AI Doctor Assistant</span>
            </span>
            {isAiResponding && (
              <span className="text-xs text-slate-400 animate-pulse flex items-center space-x-1">
                <RefreshCw className="w-3 h-3 animate-spin text-teal-400" />
                <span>Thinking...</span>
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white leading-relaxed">
            {currentAiQuestion ||
              (session.language === "hi"
                ? `नमस्ते ${session.full_name}, आज आपको क्या समस्या है?`
                : `Hello ${session.full_name}, what health issues are you facing today?`)}
          </h3>
        </motion.div>

        {/* Compact Mic Button with Active Pulse */}
        <div className="flex flex-col items-center justify-center mt-2 mb-4 space-y-3">
          <div className="relative flex items-center justify-center">
            {isListening && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute w-24 h-24 rounded-full bg-teal-500/30"
                />
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.7, 0.2, 0.7] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="absolute w-20 h-20 rounded-full bg-teal-400/40"
                />
              </>
            )}
            <button
              onClick={toggleListening}
              disabled={isAiResponding}
              className={`h-16 w-16 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 active:scale-95 relative z-10 disabled:opacity-60 ${
                isListening
                  ? "bg-rose-600 text-white shadow-rose-600/40 animate-pulse ring-4 ring-rose-400/50"
                  : "bg-gradient-to-tr from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 shadow-teal-500/30"
              }`}
              aria-label="Toggle Microphone"
            >
              {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
            </button>
          </div>
          <p className="text-xs sm:text-sm font-extrabold text-slate-300">
            {isListening ? (
              <span className="text-rose-400 font-black animate-pulse">
                {session.language === "hi" ? "सुन रहा हूँ... बोलिए" : "Listening... Speak now"}
              </span>
            ) : (
              <span className="opacity-80">
                {session.language === "hi" ? "बोलने के लिए माइक दबाएं" : "Tap Mic to Speak"}
              </span>
            )}
          </p>
        </div>

        {/* Dynamic Quick-Reply Touch Chips */}
        {!isCompleted && (
          <div className="space-y-2 my-2">
            <p className="text-xs uppercase font-extrabold tracking-wider text-slate-400 text-center flex items-center justify-center space-x-2">
              <span>{session.language === "hi" ? "या त्वरित उत्तर चुनें:" : "Or select a quick answer:"}</span>
              {isAiResponding && <RefreshCw className="w-3 h-3 animate-spin text-teal-400" />}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {quickReplies.map((chip, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleSendPatientTurn(chip)}
                  disabled={isAiResponding}
                  className="px-4 py-2.5 rounded-2xl bg-slate-900/80 hover:bg-teal-950/80 border border-teal-500/30 text-teal-200 text-xs sm:text-sm font-black transition shadow-md active:border-teal-400 disabled:opacity-50"
                >
                  {chip}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Manual Text Input */}
        <div className="flex items-center space-x-2 my-2 max-w-xl mx-auto w-full">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendPatientTurn(textInput)}
            placeholder={session.language === "hi" ? "कीबोर्ड से भी लक्षण लिखें..." : "Type symptoms here..."}
            disabled={isAiResponding}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm bg-slate-900 border border-white/15 text-white focus:border-teal-400 focus:ring-1 focus:ring-teal-500/20 disabled:opacity-50"
          />
          <button
            onClick={() => handleSendPatientTurn(textInput)}
            disabled={!textInput.trim() || isAiResponding}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm transition"
          >
            {session.language === "hi" ? "भेजें" : "Send"}
          </button>
        </div>

        {/* Conversation History Toggle */}
        {session && session.conversation_history && session.conversation_history.length > 1 && (
          <div className="mt-3 max-w-xl mx-auto w-full">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-slate-900/60 border border-white/10 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              <span className="flex items-center space-x-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-teal-400" />
                <span>
                  {session.language === "hi"
                    ? `बातचीत देखें (${session.conversation_history.length} संदेश)`
                    : `View conversation (${session.conversation_history.length} messages)`}
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${showHistory ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-2 p-3 rounded-xl bg-slate-900/60 border border-white/10">
                    {session.conversation_history.map((turn: any, idx: number) => (
                      <div
                        key={idx}
                        className={`text-xs rounded-xl px-3 py-2 ${
                          turn.role === "user"
                            ? "bg-teal-950/80 text-teal-200 ml-6 text-right"
                            : "bg-slate-800/80 text-slate-300 mr-6"
                        }`}
                      >
                        <span className="font-bold text-[10px] uppercase tracking-wider block mb-0.5 opacity-60">
                          {turn.role === "user" ? session.full_name : "AI Doctor"}
                        </span>
                        {turn.text}
                      </div>
                    ))}
                    <div ref={historyEndRef} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Primary Proceed Action: Upload Past Medical Records */}
        <div
          className={`pt-6 border-t border-white/10 mt-4 flex flex-col items-center space-y-2 transition-all duration-300 ${
            isCompleted ? "opacity-100" : "opacity-40 pointer-events-none"
          }`}
        >
          {!isCompleted && (
            <p className="text-xs text-slate-500 text-center animate-pulse">
              {session.language === "hi"
                ? "आगे बढ़ने के लिए कृपया AI के सवालों का जवाब दें।"
                : "Please complete the triage questions to continue."}
            </p>
          )}
          <motion.button
            whileHover={{ scale: isCompleted ? 1.02 : 1 }}
            whileTap={{ scale: isCompleted ? 0.98 : 1 }}
            onClick={() => router.push("/upload-records")}
            className="w-full max-w-md py-4 px-6 rounded-2xl font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center space-x-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-xl shadow-emerald-500/20 transition"
          >
            <ArrowRight className="w-5 h-5" />
            <span>
              {session.language === "hi"
                ? "पुराने रिकॉर्ड अपलोड करें →"
                : "Upload Past Medical Records →"}
            </span>
          </motion.button>
        </div>
      </main>

      {/* EMERGENCY RED-FLAG MODAL */}
      <AnimatePresence>
        {isRedFlagModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-rose-950 border-4 border-rose-500 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-center space-y-5 shadow-2xl shadow-rose-500/50 relative"
            >
              <div className="w-20 h-20 rounded-full bg-rose-600 text-white flex items-center justify-center mx-auto animate-bounce shadow-lg shadow-rose-600/50">
                <AlertTriangle className="w-12 h-12" />
              </div>
              <div>
                <span className="text-xs font-mono font-black uppercase tracking-widest bg-rose-500 text-black px-3 py-1 rounded-full">
                  HIGH PRIORITY EMERGENCY TRIAGE
                </span>
                <h3 className="text-2xl sm:text-3xl font-black text-white mt-3 leading-tight">
                  ⚠️ EMERGENCY ALERT
                </h3>
                <p className="text-sm text-rose-200 mt-2">
                  Please report to the Emergency/Triage Room immediately. Staff has been notified.
                </p>
              </div>
              <p className="text-sm text-rose-200 leading-relaxed font-medium bg-rose-900/60 p-4 rounded-2xl border border-rose-400/40 text-left">
                {redFlagMessage}
              </p>
              <button
                onClick={() => setIsRedFlagModalOpen(false)}
                className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-100 text-rose-950 font-black text-base uppercase tracking-wider transition shadow-lg"
              >
                I Understand / Staff Notified
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
