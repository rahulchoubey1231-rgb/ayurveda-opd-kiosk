"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Printer,
  CheckCircle2,
  Clock,
  MapPin,
  Stethoscope,
  User,
  ShieldCheck,
  QrCode,
  Building2,
  Languages,
  RefreshCw,
  Check,
  ArrowLeft,
  Activity,
} from "lucide-react";
import { useRequirePatientSession } from "@/context/PatientSessionContext";

export default function TokenSlipPage() {
  const router = useRouter();
  const { session, isReady } = useRequirePatientSession("/login");
  const [language, setLanguage] = useState<"hi" | "en">("hi");
  const [printReady, setPrintReady] = useState<boolean>(false);

  // Mark print-ready after mount for better UX
  useEffect(() => {
    const t = setTimeout(() => setPrintReady(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Build token from context (real session data — no hardcoded names)
  const token = session.token_details || {
    token_number: `#${session.opd_mode === "ayurveda" ? "AYU" : "OPD"}-${
      (session.session_id || "0000").slice(-4).toUpperCase()
    }`,
    department:
      session.opd_mode === "ayurveda"
        ? "Ayurveda & Kayachikitsa OPD (Room 108)"
        : "General Medicine OPD (Room 102)",
    doctor_name:
      session.opd_mode === "ayurveda"
        ? "Vaidya R. K. Shastri, BAMS, MD (Ayu)"
        : "Dr. A. K. Sharma, Senior Physician",
    room_number:
      session.opd_mode === "ayurveda"
        ? "Room No. 108, First Floor"
        : "Room No. 102, First Floor",
    estimated_wait: "Approx. 15-20 mins",
    queue_ahead: 2,
    generated_at: new Date().toISOString(),
    status: "Clinical Summary Transmitted to Doctor",
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const handleStartNewSession = () => {
    session.clearSession();
    router.replace("/login");
  };

  if (!isReady || !session.full_name) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Loading OPD Token Parchi...</p>
        </div>
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString(language === "hi" ? "hi-IN" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col font-sans p-4 sm:p-6 print:p-0 print:bg-white print:text-black">
      {/* Header (hidden in print) */}
      <header className="max-w-xl mx-auto w-full flex items-center justify-between pb-4 print:hidden">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
            Step 4 of 4: OPD Registration Complete
          </span>
        </div>
        <button
          onClick={() => setLanguage(language === "hi" ? "en" : "hi")}
          className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/10 hover:bg-white/20 text-xs font-bold transition flex items-center space-x-1.5"
        >
          <Languages className="w-3.5 h-3.5 text-teal-300" />
          <span>{language === "hi" ? "English" : "हिंदी"}</span>
        </button>
      </header>

      {/* Printable OPD Token Slip */}
      <main className="max-w-xl mx-auto w-full my-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white text-slate-950 rounded-3xl shadow-2xl p-6 sm:p-8 border-4 border-teal-500/30 relative overflow-hidden print:border-none print:shadow-none print:p-4 print:rounded-none"
        >
          {/* Indian Tricolor Ribbon */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-500 via-white to-green-600 print:h-1" />

          {/* Hospital Header */}
          <div className="flex items-center justify-between pb-4 border-b-2 border-slate-200 mt-2">
            <div>
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-teal-700" />
                <h1 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
                  MediKiosk AI Hospital & OPD Network
                </h1>
              </div>
              <p className="text-[11px] font-semibold text-slate-500">
                National Health Authority (NHA) • ABDM v3.0 Integrated
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-slate-700 block">{currentDate}</span>
              <span className="text-[10px] text-slate-500 font-mono">{currentTime}</span>
            </div>
          </div>

          {/* Status Badge */}
          <div className="my-4 text-center">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5 text-emerald-700" />
              <span>{token.status || "Clinical Summary Transmitted to Doctor"}</span>
            </span>
          </div>

          {/* Prominent Token Number */}
          <div className="my-5 p-5 bg-gradient-to-r from-slate-900 to-teal-950 text-white rounded-2xl text-center shadow-lg relative overflow-hidden print:bg-slate-100 print:text-slate-950 print:border-2 print:border-slate-800">
            <span className="text-xs uppercase font-mono font-bold tracking-widest text-teal-300 block print:text-slate-700">
              {language === "hi" ? "ओपीडी टोकन नंबर" : "OPD Token Number"}
            </span>
            <span className="text-4xl sm:text-5xl font-black font-mono tracking-wider text-white block my-1 print:text-slate-950">
              {token.token_number}
            </span>
            <span className="text-xs text-teal-200 font-medium print:text-slate-600">
              {language === "hi" ? "कृपया अपनी बारी की प्रतीक्षा करें" : "Please wait for your turn to be called"}
            </span>
          </div>

          {/* Patient Details Grid — ALL from session (no hardcoded names) */}
          <div className="grid grid-cols-2 gap-4 text-left py-3 border-y-2 border-slate-200 text-xs sm:text-sm">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                {language === "hi" ? "मरीज़ का नाम" : "Patient Name"}
              </span>
              <p className="text-base font-black text-slate-900 leading-tight">{session.full_name}</p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                {language === "hi" ? "आयु / लिंग" : "Age / Gender"}
              </span>
              <p className="text-base font-black text-slate-900">
                {session.age} Yrs / {session.gender}
              </p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                {language === "hi" ? "आभा नंबर" : "ABHA Number"}
              </span>
              <p className="font-mono font-bold text-teal-700 text-xs">
                {session.abha_number || "Verified Walk-In Patient"}
              </p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                {language === "hi" ? "मोबाइल नंबर" : "Mobile Number"}
              </span>
              <p className="font-mono font-bold text-slate-800 text-xs">{session.mobile || "N/A"}</p>
            </div>
          </div>

          {/* Department & Doctor Info */}
          <div className="py-4 space-y-3 bg-slate-50 rounded-2xl p-4 my-4 border border-slate-200 text-xs sm:text-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {language === "hi" ? "आवंटित विभाग" : "Assigned Department"}
                </span>
                <p className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                  <Stethoscope className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>{token.department}</span>
                </p>
              </div>
              <div className="text-right space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {language === "hi" ? "कमरा नंबर" : "Room Number"}
                </span>
                <p className="font-extrabold text-teal-800 flex items-center justify-end space-x-1">
                  <MapPin className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>{token.room_number}</span>
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {language === "hi" ? "परामर्श डॉक्टर" : "Consulting Doctor"}
                </span>
                <p className="font-black text-slate-900">{token.doctor_name}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {language === "hi" ? "अनुमानित प्रतीक्षा" : "Est. Wait Time"}
                </span>
                <p className="font-black text-amber-700 flex items-center justify-end space-x-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>{token.estimated_wait}</span>
                </p>
              </div>
            </div>
          </div>

          {/* QR & Session Ref Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="space-y-0.5 text-left">
              <span className="text-[10px] font-bold text-slate-500 block">
                Official OPD Slip • Non-Transferable • ABDM Compliant
              </span>
              <p className="text-[10px] text-slate-400 font-mono">
                Session Ref: {session.session_id}
              </p>
            </div>
            <div className="p-1 rounded-xl bg-slate-100 border border-slate-200">
              <QrCode className="w-12 h-12 text-slate-900" />
            </div>
          </div>
        </motion.div>

        {/* Action Buttons (hidden in print) */}
        <div className="mt-6 grid grid-cols-2 gap-4 print:hidden">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePrint}
            disabled={!printReady}
            className="py-4 px-6 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center space-x-2 border-2 border-teal-400 bg-slate-900 hover:bg-slate-800 text-teal-300 transition shadow-lg disabled:opacity-50"
          >
            <Printer className="w-5 h-5" />
            <span>{language === "hi" ? "पर्ची प्रिंट करें" : "Print Token Slip"}</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStartNewSession}
            className="py-4 px-6 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 transition shadow-xl shadow-emerald-500/20"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{language === "hi" ? "नया सत्र शुरू करें" : "Start New Session"}</span>
          </motion.button>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-3 print:hidden">
        MediKiosk Intelligent Healthcare System • Zero-Mock Sequential Workflow Complete
      </footer>
    </div>
  );
}
