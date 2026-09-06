"use client";

import React, { useState } from "react";
import {
  User,
  Phone,
  Calendar,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  HeartPulse,
  Activity,
  CheckCircle2,
  Lock,
  Stethoscope,
  Leaf,
} from "lucide-react";
import { useKioskSession } from "@/context/KioskSessionContext";

interface KioskWelcomeStepProps {
  ultraContrast?: boolean;
  onContinue?: () => void;
}

export default function KioskWelcomeStep({
  ultraContrast = false,
  onContinue,
}: KioskWelcomeStepProps) {
  const { initializeSession, isInitializing, patientLanguage, consultationMode } = useKioskSession();

  const [name, setName] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [mobile, setMobile] = useState<string>("");
  const [abhaId, setAbhaId] = useState<string>("");
  const [idType, setIdType] = useState<"mobile" | "abha">("mobile");
  const [gender, setGender] = useState<string>("Male");
  const [selectedMode, setSelectedMode] = useState<"allopathy" | "ayurveda">(consultationMode || "allopathy");
  const [selectedLang, setSelectedLang] = useState<"hi" | "en">(patientLanguage || "hi");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isHindi = selectedLang === "hi";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = name.trim();
    const cleanAge = parseInt(age.trim(), 10);
    const cleanMobile = mobile.replace(/\D/g, "");
    const cleanAbha = abhaId.trim();

    if (!cleanName || cleanName.length < 2) {
      setErrorMessage(
        isHindi
          ? "कृपया अपना पूरा नाम दर्ज करें (कम से कम 2 अक्षर)।"
          : "Please enter your full name (at least 2 characters)."
      );
      return;
    }

    if (isNaN(cleanAge) || cleanAge < 1 || cleanAge > 125) {
      setErrorMessage(
        isHindi
          ? "कृपया सही आयु (1 से 120 वर्ष) दर्ज करें।"
          : "Please enter a valid age between 1 and 120."
      );
      return;
    }

    if (idType === "mobile") {
      if (cleanMobile.length !== 10) {
        setErrorMessage(
          isHindi
            ? "कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।"
            : "Please enter a valid 10-digit mobile number."
        );
        return;
      }
    } else {
      if (cleanAbha.length < 6) {
        setErrorMessage(
          isHindi
            ? "कृपया सही 14 अंकों का आभा नंबर या आभा पता दर्ज करें (उदा. 91-4829-1092-4412 या rahul@abdm)।"
            : "Please enter a valid 14-digit ABHA Number or ABHA Address (e.g. 91-4829-1092-4412 or user@abdm)."
        );
        return;
      }
    }

    try {
      await initializeSession({
        name: cleanName,
        age: cleanAge,
        mobile: idType === "mobile" ? cleanMobile : cleanAbha,
        abhaId: idType === "abha" ? cleanAbha : (cleanAbha || undefined),
        gender,
        language: selectedLang,
        mode: selectedMode,
      });
      if (onContinue) {
        onContinue();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Session initialization failed. Please retry.");
    }
  };

  // Quick fill sample for fast demo testing
  const handleQuickDemoFill = () => {
    setName("Rahul Sharma");
    setAge("28");
    setMobile("9876543210");
    setAbhaId("91-4829-1092-4412");
    setGender("Male");
  };

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header Banner */}
      <div className="text-center space-y-3 mb-8">
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs sm:text-sm font-bold shadow-xs">
          <Sparkles className="w-4 h-4 text-teal-600 animate-pulse" />
          <span>
            {isHindi
              ? "कदम 1: स्वागत एवं मरीज़ डेटा प्रविष्टि"
              : "Step 1: Welcome & Patient Data Initialization"}
          </span>
        </div>
        <h1
          className={`text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight ${
            ultraContrast ? "text-[#FFFF00]" : "text-slate-900"
          }`}
        >
          {isHindi ? "आयुष्मान डिजिटल ओपीडी कियोस्क" : "Ayushman Digital OPD Kiosk"}
        </h1>
        <p
          className={`text-base sm:text-lg font-medium max-w-2xl mx-auto ${
            ultraContrast ? "text-white" : "text-slate-600"
          }`}
        >
          {isHindi
            ? "कृपया परामर्श शुरू करने के लिए अपना नाम, उम्र और मोबाइल नंबर दर्ज करें।"
            : "Please enter your Name, Age, and Mobile Number to initialize your personalized AI triage consultation."}
        </p>
      </div>

      {/* Main Registration Card */}
      <div
        className={`rounded-3xl border shadow-xl overflow-hidden ${
          ultraContrast
            ? "bg-black text-white border-[#FFFF00]"
            : "bg-white text-slate-900 border-slate-200/80 shadow-[0_20px_50px_rgba(15,23,42,0.08)]"
        }`}
      >
        {/* Card Header Strip */}
        <div
          className={`p-6 border-b flex flex-wrap items-center justify-between gap-4 ${
            ultraContrast
              ? "bg-[#111111] border-slate-800"
              : "bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-700 text-white"
          }`}
        >
          <div className="flex items-center space-x-3.5">
            <div
              className={`p-3 rounded-2xl ${
                ultraContrast
                  ? "bg-[#FFFF00] text-black"
                  : "bg-white/15 backdrop-blur-md text-white"
              }`}
            >
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">
                {isHindi ? "नया मरीज़ पंजीकरण" : "Patient Check-in & Intake"}
              </h2>
              <p className="text-xs font-medium text-teal-100">
                {isHindi
                  ? "सुरक्षित फ़ायरबेस क्लाउड सत्र • एनडीएचएम / आभा संगत"
                  : "Secure Firebase Cloud Session • NDHM / ABHA Compliant"}
              </p>
            </div>
          </div>

          {/* Language Toggle in Card */}
          <div className="flex items-center space-x-1.5 bg-black/20 backdrop-blur-md p-1 rounded-xl border border-white/20">
            <button
              type="button"
              onClick={() => setSelectedLang("hi")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition ${
                selectedLang === "hi"
                  ? "bg-white text-teal-900 shadow-sm"
                  : "text-white/80 hover:text-white"
              }`}
            >
              हिंदी
            </button>
            <button
              type="button"
              onClick={() => setSelectedLang("en")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition ${
                selectedLang === "en"
                  ? "bg-white text-teal-900 shadow-sm"
                  : "text-white/80 hover:text-white"
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-10 space-y-6">
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center space-x-3 animate-in fade-in">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Field 1: Name */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold flex items-center space-x-2 text-slate-700">
                <User className="w-4 h-4 text-teal-600" />
                <span>{isHindi ? "मरीज़ का पूरा नाम *" : "Patient Full Name *"}</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isHindi ? "उदा. राहुल शर्मा" : "e.g. Rahul Sharma"}
                  className={`w-full px-4 py-4 rounded-2xl border text-lg font-bold transition focus:outline-none focus:ring-2 ${
                    ultraContrast
                      ? "bg-black text-[#FFFF00] border-[#FFFF00] focus:ring-[#FFFF00]"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-teal-600 focus:bg-white"
                  }`}
                />
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {isHindi
                  ? "एआई वॉइस डॉक्टर आपको इसी नाम से संबोधित करेगा।"
                  : "The AI Voice Triage Bot will address you personally by this name."}
              </p>
            </div>

            {/* Field 2: Age */}
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center space-x-2 text-slate-700">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>{isHindi ? "आयु (वर्ष) *" : "Age (Years) *"}</span>
              </label>
              <input
                type="number"
                required
                min={1}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder={isHindi ? "उदा. 28" : "e.g. 28"}
                className={`w-full px-4 py-4 rounded-2xl border text-lg font-bold transition focus:outline-none focus:ring-2 ${
                  ultraContrast
                    ? "bg-black text-[#FFFF00] border-[#FFFF00] focus:ring-[#FFFF00]"
                    : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-teal-600 focus:bg-white"
                }`}
              />
            </div>

            {/* Field 3: Gender */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">
                {isHindi ? "लिंग *" : "Gender *"}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {["Male", "Female", "Other"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`py-4 px-2 rounded-2xl border text-sm font-black transition ${
                      gender === g
                        ? ultraContrast
                          ? "bg-[#FFFF00] text-black border-black shadow-md"
                          : "bg-teal-600 text-white border-teal-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {isHindi
                      ? g === "Male"
                        ? "पुरुष"
                        : g === "Female"
                        ? "महिला"
                        : "अन्य"
                      : g}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 4: Mobile / ABHA Identifier */}
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold flex items-center space-x-2 text-slate-700">
                  <Phone className="w-4 h-4 text-teal-600" />
                  <span>
                    {isHindi ? "मोबाइल नंबर अथवा आभा आईडी (Mobile / ABHA) *" : "Mobile Number or ABHA ID *"}
                  </span>
                </label>
                {/* Mode switch between Mobile and ABHA ID */}
                <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setIdType("mobile")}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      idType === "mobile"
                        ? "bg-teal-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {isHindi ? "📱 10-अंकीय मोबाइल" : "📱 Mobile No."}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdType("abha")}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      idType === "abha"
                        ? "bg-teal-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {isHindi ? "🆔 आभा (ABHA ID)" : "🆔 ABHA ID"}
                  </button>
                </div>
              </div>

              {idType === "mobile" ? (
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-slate-500 font-mono font-bold text-base">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                    placeholder="98765 43210"
                    className={`w-full pl-16 pr-4 py-4 rounded-2xl border text-lg font-mono font-bold tracking-wider transition focus:outline-none focus:ring-2 ${
                      ultraContrast
                        ? "bg-black text-[#FFFF00] border-[#FFFF00] focus:ring-[#FFFF00]"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-teal-600 focus:bg-white"
                    }`}
                  />
                </div>
              ) : (
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    value={abhaId}
                    onChange={(e) => setAbhaId(e.target.value)}
                    placeholder={isHindi ? "उदा. 91-4829-1092-4412 या rahul@abdm" : "e.g. 91-4829-1092-4412 or rahul@abdm"}
                    className={`w-full px-4 py-4 rounded-2xl border text-lg font-mono font-bold tracking-wider transition focus:outline-none focus:ring-2 ${
                      ultraContrast
                        ? "bg-black text-[#FFFF00] border-[#FFFF00] focus:ring-[#FFFF00]"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-teal-600 focus:bg-white"
                    }`}
                  />
                </div>
              )}

              <p className="text-xs text-slate-500 font-medium">
                {idType === "mobile"
                  ? isHindi
                    ? "ओपीडी टोकन और डॉक्टर पर्ची इस नंबर पर एसएमएस द्वारा भेजी जाएगी।"
                    : "OPD Token and Prescription summary will be linked to this mobile number."
                  : isHindi
                  ? "राष्ट्रीय स्वास्थ्य प्राधिकरण (NHA) एवं आयुष्मान भारत डिजिटल मिशन (ABDM) से जुड़ाव।"
                  : "National Health Authority (NHA) & Ayushman Bharat Digital Mission (ABDM) linked."}
              </p>
            </div>

            {/* Field 5: OPD Mode Selection (General / Allopathy OPD vs. Ayurveda OPD) */}
            <div className="space-y-3 md:col-span-2 pt-2">
              <label className="text-sm font-bold flex items-center justify-between text-slate-700">
                <span className="flex items-center space-x-2">
                  <Stethoscope className="w-4 h-4 text-teal-600" />
                  <span>{isHindi ? "ओपीडी परामर्श पद्धति (OPD Mode Selection) *" : "OPD Mode Selection *"}</span>
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  {selectedMode === "ayurveda" ? "Ayurveda OPD" : "General / Allopathy OPD"}
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* General / Allopathy OPD Card */}
                <button
                  type="button"
                  onClick={() => setSelectedMode("allopathy")}
                  className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                    selectedMode === "allopathy"
                      ? ultraContrast
                        ? "bg-[#FFFF00] text-black border-black ring-2 ring-black"
                        : "bg-teal-50/70 border-teal-600 ring-2 ring-teal-600/30 text-slate-900 shadow-sm"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className={`p-2 rounded-xl ${selectedMode === "allopathy" ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                        <Stethoscope className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-black text-base flex items-center space-x-1.5">
                          <span>{isHindi ? "जनरल / एलोपैथी ओपीडी" : "General / Allopathy OPD"}</span>
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Allopathy</span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          {isHindi ? "कमरा 102 - सामान्य चिकित्सा ओपीडी" : "Room 102 - General Medicine OPD"}
                        </p>
                      </div>
                    </div>
                    {selectedMode === "allopathy" && (
                      <CheckCircle2 className="w-5 h-5 text-teal-600" />
                    )}
                  </div>
                  <p className="text-xs mt-3 text-slate-600 leading-relaxed font-medium">
                    {isHindi
                      ? "लक्षणों की शुरुआत, अवधि, तीव्रता (HPI) एवं पूर्व एलर्जी पर आधारित क्लीनिकल परामर्श।"
                      : "Clinical HPI (Onset, Duration, Severity, Aggravating factors, PMH & Allergies)."}
                  </p>
                </button>

                {/* Ayurveda OPD Card */}
                <button
                  type="button"
                  onClick={() => setSelectedMode("ayurveda")}
                  className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                    selectedMode === "ayurveda"
                      ? ultraContrast
                        ? "bg-[#FFFF00] text-black border-black ring-2 ring-black"
                        : "bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-600/30 text-slate-900 shadow-sm"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className={`p-2 rounded-xl ${selectedMode === "ayurveda" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                        <Leaf className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-black text-base flex items-center space-x-1.5">
                          <span>{isHindi ? "आयुर्वेद ओपीडी" : "Ayurveda OPD"}</span>
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">AYUSH</span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          {isHindi ? "कमरा 108 - कायचिकित्सा ओपीडी" : "Room 108 - Kayachikitsa OPD"}
                        </p>
                      </div>
                    </div>
                    {selectedMode === "ayurveda" && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    )}
                  </div>
                  <p className="text-xs mt-3 text-slate-600 leading-relaxed font-medium">
                    {isHindi
                      ? "दशविध परीक्षा, अग्नि, कोष्ठ, निद्रा, आहार-विहार एवं प्रकृति का समग्र आयुर्वेदिक विश्लेषण।"
                      : "Dashavidha Pariksha & Ahara-Vihara (Prakriti, Agni, Koshtha, Sleep, Digestion & Diet)."}
                  </p>
                </button>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleQuickDemoFill}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 underline flex items-center space-x-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isHindi ? "डेमो परीक्षण डेटा भरें (राहुल शर्मा)" : "Fill Demo Data (Rahul Sharma)"}
              </span>
            </button>

            <button
              type="submit"
              disabled={isInitializing}
              className={`w-full sm:w-auto px-8 py-4 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center space-x-3 transition-all shadow-lg active:scale-98 ${
                ultraContrast
                  ? "bg-[#FFFF00] text-black hover:bg-yellow-300 border border-black"
                  : "bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white shadow-teal-700/25"
              } ${isInitializing ? "opacity-75 cursor-wait" : ""}`}
            >
              {isInitializing ? (
                <>
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>
                    {isHindi ? "सत्र शुरू हो रहा है..." : "Initializing Session..."}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {isHindi
                      ? "अगला: एआई वॉइस ट्राइएज शुरू करें"
                      : "Next: Start AI Voice Triage"}
                  </span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Security & Compliance Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div className="flex items-center space-x-2">
            <Lock className="w-3.5 h-3.5 text-teal-600" />
            <span>
              {isHindi
                ? "256-बिट एन्क्रिप्टेड फ़ायरबेस सत्र"
                : "256-Bit Encrypted Firestore Session Storage"}
            </span>
          </div>
          <span className="font-mono">ABDM / NHA Certified</span>
        </div>
      </div>
    </div>
  );
}
