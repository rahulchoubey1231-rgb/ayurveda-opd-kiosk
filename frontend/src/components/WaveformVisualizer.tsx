"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  Radio,
  Sparkles,
  Activity,
  Zap,
} from "lucide-react";
import { Language } from "@/lib/i18n";

export type VisualizerMode = "idle" | "listening" | "speaking";

export interface WaveformVisualizerProps {
  mode: VisualizerMode;
  onToggleListening: () => void;
  onStopSpeaking?: () => void;
  language: Language;
  ultraContrast: boolean;
  activeVoiceName?: string;
  errorMessage?: string | null;
  quickReplies?: string[];
  onSelectQuickReply?: (chip: string) => void;
  isAnalyzing?: boolean;
}

// 28 frequency equalizer bars with natural speech acoustic curve weighting
const NUM_BARS = 28;

export default function WaveformVisualizer({
  mode,
  onToggleListening,
  onStopSpeaking,
  language,
  ultraContrast,
  activeVoiceName,
  errorMessage,
  quickReplies,
  onSelectQuickReply,
  isAnalyzing,
}: WaveformVisualizerProps) {
  // Generates symmetric acoustic distribution (low on edges, peak in middle vocal range)
  const barConfigs = useMemo(() => {
    return Array.from({ length: NUM_BARS }, (_, i) => {
      // Bell curve multiplier (0.35 at edges to 1.0 at center)
      const centerDist = Math.abs(i - (NUM_BARS - 1) / 2) / ((NUM_BARS - 1) / 2);
      const acousticWeight = 1 - Math.pow(centerDist, 1.8) * 0.65;
      return {
        index: i,
        acousticWeight,
        delay: (i % 6) * 0.08,
      };
    });
  }, []);

  // Mode-specific themes and metadata
  const theme = useMemo(() => {
    switch (mode) {
      case "listening":
        return {
          title: language === "hi" ? "माइक्रोफ़ोन सक्रिय" : "MICROPHONE ACTIVE",
          subtitle:
            language === "hi"
              ? "आपकी आवाज़ सुनी जा रही है • बोलना जारी रखें"
              : "Listening to your voice • Keep speaking naturally",
          statusPill: language === "hi" ? "लाइव रिकॉर्डिंग" : "LIVE CAPTURE",
          statusColor: "bg-rose-600 text-white border-rose-400",
          orbGradient: ultraContrast
            ? "bg-red-600 text-white border-white ring-red-400"
            : "bg-gradient-to-br from-rose-500 via-red-600 to-amber-600 text-white shadow-[0_20px_60px_rgba(225,29,72,0.45)] ring-rose-200/80 border-white",
          haloColor: ultraContrast ? "bg-red-500" : "bg-rose-500",
          barGradient: ultraContrast
            ? "bg-[#FFFF00]"
            : "bg-gradient-to-t from-rose-500 via-red-500 to-amber-400",
          badgeBg: ultraContrast ? "bg-black border-red-500 text-white" : "bg-rose-50 border-rose-300 text-rose-900",
          telemetryText: language === "hi" ? "ध्वनि आवृत्ति: 48 kHz • 16-bit PCM" : "Voice Telemetry: 48 kHz • 16-bit PCM",
        };
      case "speaking":
        return {
          title: language === "hi" ? "एआई सहायक बोल रहा है" : "AI ASSISTANT SPEAKING",
          subtitle:
            language === "hi"
              ? "Google Cloud TTS आवाज़ में क्लिनिकल निर्देश दिए जा रहे हैं"
              : "Delivering clinical triage guidance via Google Cloud TTS",
          statusPill: language === "hi" ? "आवाज़ चल रही है (TTS)" : "TTS AUDIO ACTIVE",
          statusColor: "bg-indigo-600 text-white border-indigo-400",
          orbGradient: ultraContrast
            ? "bg-purple-600 text-white border-white ring-purple-300"
            : "bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-500 text-white shadow-[0_20px_60px_rgba(99,102,241,0.45)] ring-indigo-200/80 border-white",
          haloColor: ultraContrast ? "bg-purple-500" : "bg-indigo-500",
          barGradient: ultraContrast
            ? "bg-[#FFFF00]"
            : "bg-gradient-to-t from-indigo-500 via-purple-500 to-cyan-400",
          badgeBg: ultraContrast ? "bg-black border-indigo-500 text-white" : "bg-indigo-50 border-indigo-300 text-indigo-900",
          telemetryText: activeVoiceName || "Google Cloud Neural2-A (MP3 Audio Buffer)",
        };
      case "idle":
      default:
        return {
          title: language === "hi" ? "सिस्टम तैयार है" : "SYSTEM READY",
          subtitle:
            language === "hi"
              ? "बोलना शुरू करने के लिए केंद्र में टैप करें"
              : "Tap center button to speak your health concern",
          statusPill: language === "hi" ? "तैयार (स्टैंडबाय)" : "STANDBY READY",
          statusColor: "bg-teal-600 text-white border-teal-400",
          orbGradient: ultraContrast
            ? "bg-[#FFFF00] text-black border-black ring-yellow-400"
            : "bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-700 hover:from-teal-400 hover:to-cyan-600 text-white shadow-[0_20px_60px_rgba(13,148,136,0.35)] ring-teal-100/90 border-white",
          haloColor: ultraContrast ? "bg-yellow-400" : "bg-teal-400",
          barGradient: ultraContrast
            ? "bg-[#FFFF00]"
            : "bg-gradient-to-t from-teal-500 via-teal-400 to-cyan-300",
          badgeBg: ultraContrast ? "bg-black border-[#FFFF00] text-white" : "bg-teal-50 border-teal-200 text-teal-900",
          telemetryText: language === "hi" ? "भाषा: हिन्दी (hi-IN) एवं English" : "Language: English & Hindi (Dual Engine)",
        };
    }
  }, [mode, language, ultraContrast, activeVoiceName]);

  const handleOrbClick = () => {
    if (mode === "speaking" && onStopSpeaking) {
      onStopSpeaking();
    } else {
      onToggleListening();
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center select-none">
      {/* 1. Dynamic Mode & State Header Ribbon */}
      <motion.div
        layout
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-4 flex flex-col items-center text-center space-y-2"
      >
        <div className="flex items-center space-x-2.5">
          <span
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border shadow-sm ${theme.statusColor}`}
          >
            {mode === "listening" ? (
              <Radio className="w-3.5 h-3.5 animate-ping text-white" />
            ) : mode === "speaking" ? (
              <Volume2 className="w-3.5 h-3.5 animate-bounce text-white" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-white" />
            )}
            <span>{theme.statusPill}</span>
          </span>

          <span
            className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border shadow-xs ${theme.badgeBg}`}
          >
            {mode === "listening"
              ? "Mic: ON"
              : mode === "speaking"
              ? "TTS: PLAYING"
              : "AI: IDLE"}
          </span>
        </div>

        <div>
          <h2
            className={`text-xl sm:text-2xl font-black tracking-tight ${
              ultraContrast ? "text-[#FFFF00]" : "text-slate-900"
            }`}
          >
            {theme.title}
          </h2>
          <p
            className={`text-xs sm:text-sm font-semibold max-w-md ${
              ultraContrast ? "text-slate-300" : "text-slate-500"
            }`}
          >
            {theme.subtitle}
          </p>
        </div>
      </motion.div>

      {/* 2. Main Center Waveform Visualizer Console */}
      <div
        className={`relative w-full max-w-xl rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center transition-all duration-300 border-2 overflow-hidden shadow-xl ${
          ultraContrast
            ? "bg-black border-[#FFFF00]"
            : mode === "listening"
            ? "bg-gradient-to-b from-rose-50/90 via-white to-white border-rose-200 shadow-rose-900/5"
            : mode === "speaking"
            ? "bg-gradient-to-b from-indigo-50/90 via-white to-white border-indigo-200 shadow-indigo-900/5"
            : "bg-gradient-to-b from-teal-50/80 via-white to-white border-teal-200/90 shadow-teal-900/5"
        }`}
      >
        {/* Ambient Radial Background Glow */}
        <div
          className={`absolute inset-0 pointer-events-none opacity-25 blur-3xl transition-colors duration-700 ${
            mode === "listening"
              ? "bg-rose-500"
              : mode === "speaking"
              ? "bg-indigo-500"
              : "bg-teal-400"
          }`}
        />

        {/* Dynamic Acoustic Equalizer Waveform Bars (Positioned Horizontally) */}
        <div className="w-full flex items-center justify-center gap-1 sm:gap-1.5 h-12 sm:h-14 z-0 mb-2 px-2">
          {barConfigs.map((bar) => {
            // Compute dynamic height ranges based on mode and acoustic bell curve
            const minH = mode === "idle" ? 4 : mode === "listening" ? 8 : 6;
            const maxH =
              mode === "idle"
                ? 10 + bar.acousticWeight * 8
                : mode === "listening"
                ? 16 + bar.acousticWeight * 26
                : 12 + bar.acousticWeight * 18;

            // Duration: Listening reacts rapidly; Speaking is musical and fluid; Idle is a calm breath
            const animDuration =
              mode === "idle" ? 2.2 : mode === "listening" ? 0.35 + (bar.index % 4) * 0.08 : 0.85 + (bar.index % 3) * 0.15;

            return (
              <motion.div
                key={bar.index}
                className={`w-1.5 sm:w-2.5 rounded-full transition-colors duration-500 ${theme.barGradient}`}
                initial={{ height: minH }}
                animate={{
                  height: [
                    minH,
                    maxH * (0.6 + ((bar.index * 7) % 5) * 0.1),
                    maxH,
                    minH + 2,
                  ],
                  opacity: mode === "idle" ? [0.45, 0.75, 0.45] : [0.75, 1, 0.85],
                }}
                transition={{
                  duration: animDuration,
                  repeat: Infinity,
                  repeatType: "mirror",
                  ease: "easeInOut",
                  delay: bar.delay,
                }}
              />
            );
          })}
        </div>

        {/* Center Tactile Orb Button with Pulsing Radar Halo Rings */}
        <div className="relative flex flex-col items-center justify-center my-2 z-10">
          <div className="relative flex items-center justify-center">
            {/* Radar Echo Rings (Strict h-16 w-16 active pulses) */}
            <AnimatePresence>
              {mode === "listening" ? (
                <>
                  <motion.span
                    key="listen-ring-1"
                    initial={{ scale: 0.9, opacity: 0.7 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                    className={`absolute inline-flex h-16 w-16 rounded-full ${theme.haloColor} pointer-events-none blur-xs`}
                  />
                  <motion.span
                    key="listen-ring-2"
                    initial={{ scale: 0.95, opacity: 0.9 }}
                    animate={{ scale: 1.35, opacity: 0 }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                    className={`absolute inline-flex h-16 w-16 rounded-full ${theme.haloColor} pointer-events-none`}
                  />
                </>
              ) : mode === "speaking" ? (
                <>
                  <motion.span
                    key="speak-ring-1"
                    initial={{ scale: 0.9, opacity: 0.6 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                    className={`absolute inline-flex h-16 w-16 rounded-full ${theme.haloColor} pointer-events-none blur-xs`}
                  />
                  <motion.span
                    key="speak-ring-2"
                    initial={{ scale: 0.95, opacity: 0.8 }}
                    animate={{ scale: 1.25, opacity: 0.15 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                    className={`absolute inline-flex h-16 w-16 rounded-full ${theme.haloColor} pointer-events-none`}
                  />
                </>
              ) : (
                <motion.span
                  key="idle-ring"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.55, 0.3] }}
                  transition={{ duration: 3.0, repeat: Infinity, ease: "easeInOut" }}
                  className={`absolute inline-flex h-16 w-16 rounded-full ${theme.haloColor} pointer-events-none blur-xs`}
                />
              )}
            </AnimatePresence>

            {/* Main Interactive Push-Button Orb (Standard h-16 w-16) */}
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.93 }}
              onClick={handleOrbClick}
              aria-label={
                mode === "listening"
                  ? language === "hi"
                    ? "रिकॉर्डिंग रोकें"
                    : "Stop Listening"
                  : mode === "speaking"
                  ? language === "hi"
                    ? "आवाज़ रोकें"
                    : "Stop Audio Playback"
                  : language === "hi"
                  ? "बोलना शुरू करें"
                  : "Start Speaking"
              }
              className={`relative z-20 flex items-center justify-center rounded-full border-4 ring-4 transition-all duration-300 cursor-pointer h-16 w-16 shadow-lg ${theme.orbGradient}`}
            >
              <AnimatePresence mode="wait">
                {mode === "listening" ? (
                  <motion.div
                    key="orb-listening"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center justify-center"
                  >
                    <Square className="w-6 h-6 text-white fill-white animate-pulse" />
                  </motion.div>
                ) : mode === "speaking" ? (
                  <motion.div
                    key="orb-speaking"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center justify-center"
                  >
                    <Volume2 className="w-6 h-6 text-white animate-pulse" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="orb-idle"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center justify-center"
                  >
                    <Mic className="w-7 h-7 text-white" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* Compact Clickable Label & Mode Pill directly beneath Button */}
          <div className="mt-2.5 flex flex-col items-center space-y-1 text-center">
            <span
              className={`font-black text-xs uppercase tracking-wider ${
                ultraContrast ? "text-[#FFFF00]" : "text-slate-800"
              }`}
            >
              {mode === "listening"
                ? language === "hi"
                  ? "रोकने के लिए टैप करें"
                  : "Tap to Stop Listening"
                : mode === "speaking"
                ? language === "hi"
                  ? "आवाज़ रोकने के लिए टैप करें"
                  : "AI Speaking • Tap to Mute"
                : language === "hi"
                ? "बोलने के लिए टैप करें"
                : "Tap to Speak"}
            </span>
            <span
              className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                mode === "listening"
                  ? "bg-rose-100 text-rose-800 border-rose-300 animate-pulse"
                  : mode === "speaking"
                  ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                  : "bg-teal-50 text-teal-800 border-teal-200"
              }`}
            >
              {mode === "listening"
                ? language === "hi"
                  ? "माइक्रोफ़ोन सक्रिय • लाइव रिकॉर्डिंग"
                  : "Microphone Active • Live Listening"
                : mode === "speaking"
                ? language === "hi"
                  ? "Google Cloud TTS आवाज़ चल रही है"
                  : "Google Cloud TTS Audio Playing"
                : language === "hi"
                ? "आवाज़ या टच द्वारा उत्तर दें"
                : "Voice + Touch Dual Input"}
            </span>
          </div>

          {/* Dual-Mode Quick-Reply Options (Touch Chips) Below Microphone */}
          {quickReplies && quickReplies.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full mt-3 pt-3 border-t border-slate-200/80 z-20 flex flex-col items-center"
            >
              <div className="flex items-center space-x-1.5 mb-2 text-xs font-black text-slate-700">
                <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-pulse" />
                <span>
                  {language === "hi"
                    ? "टच विकल्प (उत्तर देने के लिए टैप करें):"
                    : "Touch Options (Tap to Answer):"}
                </span>
              </div>
              <div className="w-full flex flex-wrap items-center justify-center gap-2">
                {quickReplies.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => onSelectQuickReply && onSelectQuickReply(chip)}
                    className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black border-2 transition-all shadow-xs active:scale-95 flex items-center space-x-1.5 ${
                      ultraContrast
                        ? "bg-black text-[#FFFF00] border-[#FFFF00] hover:bg-yellow-950"
                        : "bg-white hover:bg-teal-50 border-teal-300 hover:border-teal-500 text-teal-950 hover:shadow-md"
                    } ${isAnalyzing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span>{chip}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* 3. Bottom Live Acoustic Telemetry Ribbon */}
        <div
          className={`w-full mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs font-mono ${
            ultraContrast
              ? "border-slate-800 text-[#FFFF00]"
              : "border-slate-200/80 text-slate-500"
          }`}
        >
          <div className="flex items-center space-x-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                mode === "listening"
                  ? "bg-rose-500 animate-ping"
                  : mode === "speaking"
                  ? "bg-indigo-500 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <span className="font-bold text-[11px]">{theme.telemetryText}</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
              <Zap className="w-3 h-3 text-amber-500" />
              <span>
                {mode === "listening"
                  ? "Acoustic DSP: ACTIVE"
                  : mode === "speaking"
                  ? "Audio Output: MP3 BUFFER"
                  : "Dual-Channel Mic Ready"}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
