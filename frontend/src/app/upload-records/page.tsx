"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Pill,
  Stethoscope,
  BedDouble,
  FlaskConical,
  ScanLine,
  RefreshCw,
  Clock,
  User,
  Languages,
  Sparkles,
  Send,
  X,
  Camera
} from "lucide-react";
import { useRequirePatientSession, MedicalTimelineEntry } from "@/context/PatientSessionContext";

export default function UploadRecordsPage() {
  const router = useRouter();
  const { session, isReady } = useRequirePatientSession("/login");

  // Fix 3: Hydration mismatch guard
  const [mounted, setMounted] = useState(false);
  
  // Use session language directly to sync with active session
  const language = session.language || "hi";

  useEffect(() => {
    setMounted(true);
  }, []);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<boolean>(false);
  
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [latestExtraction, setLatestExtraction] = useState<MedicalTimelineEntry | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Fix 1: Network / Endpoint routing
  const getApiUrl = () => {
    if (typeof window !== "undefined") {
      if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        return `http://${window.location.hostname}:8000`;
      }
    }
    return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  };
  const apiUrl = getApiUrl();

  const getTypeBadge = (type?: string) => {
    switch (type) {
      case "Discharge Summary":
        return {
          bg: "bg-amber-500/10 border-amber-500/30 text-amber-300",
          icon: <BedDouble className="w-3.5 h-3.5 text-amber-400" />,
        };
      case "Blood Report":
      case "Lab Report":
        return {
          bg: "bg-rose-500/10 border-rose-500/30 text-rose-300",
          icon: <FlaskConical className="w-3.5 h-3.5 text-rose-400" />,
        };
      case "Imaging":
        return {
          bg: "bg-purple-500/10 border-purple-500/30 text-purple-300",
          icon: <ScanLine className="w-3.5 h-3.5 text-purple-400" />,
        };
      default:
        return {
          bg: "bg-teal-500/10 border-teal-500/30 text-teal-300",
          icon: <Stethoscope className="w-3.5 h-3.5 text-teal-400" />,
        };
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploadError(null);
    setUploadSuccess(null);
    setLatestExtraction(null);
    setIsUploading(true);
    
    setScanStatus(language === "hi" ? "OCR के साथ दस्तावेज़ स्कैन किया जा रहा है..." : "Scanning document text with OCR...");

    const formData = new FormData();
    formData.append("image", file);
    formData.append("session_id", session.session_id);
    formData.append("patient_name", session.full_name);
    
    const progressTimeout = setTimeout(() => {
        setScanStatus(language === "hi" ? "मेडिकल डेटा का विश्लेषण किया जा रहा है..." : "Analyzing medical entities...");
    }, 2000);

    try {
      const res = await fetch("/api/ocr/scan", {
        method: "POST",
        body: formData,
      });
      
      clearTimeout(progressTimeout);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to process medical document OCR.");
      }

      const parsedData = await res.json();
      const parsed = parsedData.document || parsedData;
      
      const docDate = parsed.document_date || new Date().toISOString().slice(0, 10);
      const docYearMatch = docDate.match(/\d{4}/);
      const docYear = docYearMatch ? parseInt(docYearMatch[0]) : new Date().getFullYear();
      
      const docType = parsed.document_type || "Prescription";
      const docTitle = parsed.hospital_or_doctor 
        ? `${docType} from ${parsed.hospital_or_doctor}`
        : `${docType} (${docYear})`;

      const entry: MedicalTimelineEntry = {
        id: `DOC-${Date.now()}`,
        document_date: docDate,
        document_year: docYear,
        document_type: docType,
        title: docTitle,
        key_findings: parsed.key_findings ? (Array.isArray(parsed.key_findings) ? parsed.key_findings : [parsed.key_findings]) : [],
        extracted_medications: parsed.medications || [],
        diagnoses: [],
        clinical_summary: parsed.summary || "",
        doctor_name: parsed.hospital_or_doctor,
        hospital_name: parsed.hospital_or_doctor,
        storage_path: `patients/${session.session_id}/reports/${file.name}`,
        fileUrl: parsed.fileUrl,
        raw_ocr_snippet: "Extracted Document",
        uploaded_at: new Date().toISOString(),
      };
      
      session.addMedicalTimelineEntry(entry);
      setLatestExtraction(entry);

      setUploadSuccess(
        language === "hi"
          ? `दस्तावेज़ सफलतापूर्वक प्रोसेस हुआ: ${file.name}`
          : `Document successfully extracted and indexed: ${file.name}`
      );
    } catch (err: any) {
      clearTimeout(progressTimeout);
      // Fix 1: Graceful offline mode for fetch failures
      if (err.name === "TypeError" || err.message.includes("Failed to fetch")) {
        setUploadError(language === "hi" ? "सर्वर से कनेक्ट नहीं हो सका। कृपया नेटवर्क जांचें (ऑफ़लाइन मोड)।" : "Network error: Unable to connect to the AI clinical engine.");
      } else {
        setUploadError(err.message || (language === "hi" ? "दस्तावेज़ स्कैन विफल रहा।" : "Failed to extract medical report."));
      }
    } finally {
      setIsUploading(false);
      setScanStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleInjectSample = async () => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await fetch(`${apiUrl}/api/reports/demo-sample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id, sample_type: "all" }),
      });

      if (!res.ok) throw new Error("Failed to load sample data");

      const data = await res.json();
      if (data.medical_timeline && Array.isArray(data.medical_timeline)) {
        session.setMedicalTimeline(data.medical_timeline);
        setUploadSuccess(
          language === "hi"
            ? "4 ऐतिहासिक मेडिकल रिपोर्ट्स टाइमलाइन में जोड़ी गईं।"
            : "Loaded 4 past medical records into chronological timeline."
        );
      }
    } catch (err: any) {
      if (err.name === "TypeError" || err.message.includes("Failed to fetch")) {
        setUploadError(language === "hi" ? "सर्वर से कनेक्ट नहीं हो सका।" : "Network error.");
      } else {
        setUploadError(language === "hi" ? "डेटा लोड करने में विफल।" : "Failed to load sample data.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitAndSendToDoctor = async () => {
    setIsDispatching(true);
    setUploadError(null);

    try {
      const res = await fetch(`${apiUrl}/api/doctor/generate-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.session_id,
          patient_id: session.session_id,
          full_name: session.full_name,
          age: Number(session.age) || 30,
          gender: session.gender,
          mobile: session.mobile,
          abha_number: session.abha_number,
          opd_mode: session.opd_mode,
          chat_history: session.conversation_history,
          conversation_history: session.conversation_history,
          medical_timeline: session.medical_timeline.map(({ fileUrl, ...rest }) => rest),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Doctor dispatch failed.");
      }

      const data = await res.json();
      if (data.soap_note || data.summary) {
        session.setSoapSummary(data.soap_note || data.summary);
      }

      const tokenDetails = data.token_details || {
        token_number: `#${session.opd_mode === "ayurveda" ? "AYU" : "OPD"}-${session.session_id.slice(-4).toUpperCase()}`,
        department:
          session.opd_mode === "ayurveda"
            ? "Ayurveda & Kayachikitsa OPD (Room 108)"
            : "General Medicine OPD (Room 102)",
        doctor_name:
          session.opd_mode === "ayurveda"
            ? "Vaidya R. K. Shastri, BAMS, MD (Ayu)"
            : "Dr. A. K. Sharma, Senior Physician",
        room_number:
          session.opd_mode === "ayurveda" ? "Room No. 108, First Floor" : "Room No. 102, First Floor",
        estimated_wait: "Approx. 15-20 mins",
        queue_ahead: 2,
        generated_at: new Date().toISOString(),
        status: "Clinical Summary Transmitted to Doctor",
      };

      session.setTokenDetails(tokenDetails);
      setDispatchSuccess(true);
      setTimeout(() => router.push("/token-slip"), 1800);
    } catch (err: any) {
      if (err.name === "TypeError" || err.message.includes("Failed to fetch")) {
        setUploadError(language === "hi" ? "सर्वर से कनेक्ट नहीं हो सका।" : "Network error: Unable to dispatch to doctor.");
      } else {
        setUploadError(err.message || "Failed to transmit clinical digest to Doctor Dashboard.");
      }
      setIsDispatching(false);
    }
  };

  if (!mounted || !isReady || !session.full_name) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Validating patient session...</p>
        </div>
      </div>
    );
  }

  if (dispatchSuccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-5 max-w-md"
        >
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-4 border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-14 h-14" />
          </div>
          <h2 className="text-2xl font-black text-white">
            {language === "hi" ? "डॉक्टर को भेजा गया!" : "Dispatched to Doctor!"}
          </h2>
          <p className="text-emerald-200">
            {language === "hi"
              ? "आपका नैदानिक सारांश और मेडिकल रिकॉर्ड डॉक्टर को भेज दिए गए हैं। कृपया अपनी ओपीडी टोकन पर्ची लें।"
              : "Your clinical summary and medical records have been transmitted. Please collect your OPD token slip."}
          </p>
        </motion.div>
      </div>
    );
  }

  // Language Dictionary (Fix 2)
  const T = {
    stepLabel: language === "hi" ? "चरण 3/4: मेडिकल दस्तावेज़ स्कैनिंग" : "Step 3 of 4: Medical Document OCR & Timeline",
    headerTitle: language === "hi" ? `${session.full_name}, कृपया अपने पिछले नुस्खे या लैब रिपोर्ट अपलोड करें (वैकल्पिक)` : `${session.full_name}, Upload Past Prescriptions or Lab Reports (Optional)`,
    headerSubtitle: language === "hi" ? "हमारी AI प्रणाली रिपोर्ट स्कैन करके स्वचालित रूप से वर्षवार टाइमलाइन तैयार करेगी।" : "Our AI engine will extract dates, medicines, and findings into a chronological timeline.",
    btnCapture: language === "hi" ? "कैमरा से कैप्चर करें" : "Capture from Camera",
    btnCaptureSub: language === "hi" ? "नुस्खे की तुरंत फोटो लें" : "Instant photo of prescription",
    btnUpload: language === "hi" ? "फ़ाइल अपलोड करें" : "Upload Image",
    btnUploadSub: language === "hi" ? "गैलरी या फ़ाइलों से चुनें" : "From gallery or files",
    ocrPreview: language === "hi" ? "OCR द्वारा निकाला गया परिणाम" : "OCR Extracted Result",
    medDetected: language === "hi" ? "पहचानी गई दवाएँ:" : "Medications Detected:",
    loadSampleBtn: language === "hi" ? "नमूना रिकॉर्ड लोड करें (2021 — 2026)" : "Load Sample Clinical Timeline (2021 — 2026)",
    loadSampleText: language === "hi" ? "या पहले से निकाले गए मेडिकल रिकॉर्ड का परीक्षण करें:" : "Or test with pre-extracted clinical records:",
    timelineTitle: language === "hi" ? "कालानुक्रमिक मेडिकल टाइमलाइन" : "Chronological Medical Timeline",
    timelineSub: language === "hi" ? "सॉर्ट किया गया: सबसे पुराना — सबसे नया" : "Sorted: Oldest — Newest",
    timelineEmpty: language === "hi" ? "अभी तक कोई रिपोर्ट अपलोड नहीं की गई। आप आगे बढ़ सकते हैं।" : "No past reports uploaded yet. You can upload above or skip and proceed directly.",
    clinicalFindings: language === "hi" ? "क्लिनिकल निष्कर्ष" : "Clinical Findings",
    prescribedRegimen: language === "hi" ? "निर्धारित दवाइयां" : "Prescribed Regimen",
    btnBack: language === "hi" ? "वापस जाएँ" : "Back",
    btnReviewToken: language === "hi" ? "रिव्यू करें और टोकन लें" : "Review & Get Token",
    generatingSoap: language === "hi" ? "सारांश बन रहा है..." : "Generating SOAP Digest...",
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans flex flex-col">
      <header className="border-b border-white/10 bg-slate-950 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center shadow-md">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black text-white">{session.full_name}</h2>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-mono">
                  {session.age}Y • {session.gender}
                </span>
              </div>
              <p className="text-xs text-teal-400 font-mono">
                {session.opd_mode === "ayurveda"
                  ? "🌿 Ayurveda OPD (Room 108)"
                  : "🏥 General Medicine OPD (Room 102)"}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => session.setLanguage(language === "hi" ? "en" : "hi")}
              className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/10 hover:bg-white/20 text-xs font-bold transition flex items-center space-x-1.5"
            >
              <Languages className="w-3.5 h-3.5 text-teal-300" />
              <span suppressHydrationWarning>{language === "hi" ? "English" : "हिंदी"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 w-full flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-3">
            <span suppressHydrationWarning>{T.stepLabel}</span>
            <span className="text-teal-400 font-mono">
              Session: {session.session_id.slice(-8)}
            </span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight" suppressHydrationWarning>
              {T.headerTitle}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1" suppressHydrationWarning>
              {T.headerSubtitle}
            </p>
          </div>

          {/* API Error Toast Disabled */}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <input
              type="file"
              ref={cameraInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileUpload(e.target.files[0]).catch(console.error);
                }
              }}
              accept="image/*"
              capture="environment"
              className="hidden"
            />
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUploading}
              className={`flex items-center justify-center space-x-3 p-6 rounded-3xl border-2 transition duration-200 ${
                isUploading
                  ? "border-teal-900 bg-teal-950/20 text-teal-700 cursor-not-allowed"
                  : "border-teal-500/50 bg-teal-900/20 hover:bg-teal-900/40 text-teal-300"
              }`}
            >
              <Camera className="w-8 h-8" />
              <div className="text-left">
                <h3 className="font-bold" suppressHydrationWarning>{T.btnCapture}</h3>
                <p className="text-xs opacity-70" suppressHydrationWarning>{T.btnCaptureSub}</p>
              </div>
            </button>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileUpload(e.target.files[0]).catch(console.error);
                }
              }}
              accept="image/*,application/pdf"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`flex items-center justify-center space-x-3 p-6 rounded-3xl border-2 transition duration-200 ${
                isUploading
                  ? "border-slate-800 bg-slate-900/50 text-slate-700 cursor-not-allowed"
                  : "border-white/20 bg-slate-900/60 hover:bg-slate-900/90 hover:border-teal-400/80 text-white"
              }`}
            >
              <UploadCloud className="w-8 h-8" />
              <div className="text-left">
                <h3 className="font-bold" suppressHydrationWarning>{T.btnUpload}</h3>
                <p className="text-xs opacity-70" suppressHydrationWarning>{T.btnUploadSub}</p>
              </div>
            </button>
          </div>
          
          {isUploading && (
              <div className="flex flex-col items-center justify-center p-6 bg-slate-900/50 rounded-2xl border border-teal-500/30 mb-6 animate-pulse">
                <RefreshCw className="w-8 h-8 text-teal-400 animate-spin mb-3" />
                <p className="text-teal-300 font-bold" suppressHydrationWarning>{scanStatus}</p>
              </div>
          )}
          
          {latestExtraction && !isUploading && (
              <div className="mb-6 p-5 bg-teal-950/20 border border-teal-500/30 rounded-3xl shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 bg-teal-500/20 rounded-bl-3xl">
                    <Sparkles className="w-5 h-5 text-teal-400" />
                </div>
                <h3 className="text-teal-400 font-bold mb-1 text-sm uppercase tracking-wider" suppressHydrationWarning>{T.ocrPreview}</h3>
                <div className="flex items-center space-x-2 mb-3">
                  <div className={`p-1.5 rounded-md ${getTypeBadge(latestExtraction.document_type).bg}`}>
                    {getTypeBadge(latestExtraction.document_type).icon}
                  </div>
                  <div>
                    <p className="text-white font-bold">{latestExtraction.title}</p>
                    <p className="text-xs text-slate-400">Date: {latestExtraction.document_date}</p>
                  </div>
                </div>

                {latestExtraction.clinical_summary && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-900/50 border border-white/5">
                    <p className="text-[11px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                      {language === "hi" ? "सारांश" : "Summary"}
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {latestExtraction.clinical_summary}
                    </p>
                  </div>
                )}
                
                {latestExtraction.extracted_medications && latestExtraction.extracted_medications.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-400 mb-1" suppressHydrationWarning>{T.medDetected}</p>
                    <div className="flex flex-wrap gap-2">
                        {latestExtraction.extracted_medications.map((m: any, i: number) => (
                            <span key={i} className="inline-flex items-center space-x-1 bg-slate-900 border border-white/10 px-2 py-1 rounded-md text-xs text-slate-300">
                                <Pill className="w-3 h-3 text-teal-400" />
                                <span>{m.name || m}</span>
                            </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
          )}

          <div className="flex items-center justify-between pt-3 text-xs text-slate-400">
            <span suppressHydrationWarning>{T.loadSampleText}</span>
            <button
              onClick={handleInjectSample}
              disabled={isUploading}
              className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-400/30 text-teal-300 font-bold transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span suppressHydrationWarning>{T.loadSampleBtn}</span>
            </button>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase font-black tracking-wider text-slate-300 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-teal-400" />
                <span suppressHydrationWarning>
                  {T.timelineTitle} ({session.medical_timeline.length})
                </span>
              </h3>
              <span className="text-[11px] text-teal-400 font-mono" suppressHydrationWarning>{T.timelineSub}</span>
            </div>

            {session.medical_timeline.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-900/40 border border-white/10 text-center text-slate-500 text-xs" suppressHydrationWarning>
                {T.timelineEmpty}
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-teal-500 before:via-cyan-500 before:to-emerald-500">
                {session.medical_timeline.map((item, idx) => {
                  const badge = getTypeBadge(item.document_type);
                  return (
                    <div key={item.id || idx} className="relative">
                      <div className="absolute -left-[28px] top-1.5 w-3 h-3 rounded-full bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.5)] border-2 border-slate-950" />
                      <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-teal-500/30 transition shadow-sm group">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center space-x-2.5">
                            <div className={`p-1.5 rounded-xl border ${badge.bg}`}>{badge.icon}</div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h4 className="text-sm font-bold text-white leading-none">
                                  {item.title}
                                </h4>
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                                  {item.document_year}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                <Calendar className="w-3 h-3 inline mr-1" />
                                {item.document_date}
                              </p>
                            </div>
                          </div>
                        </div>

                        {item.key_findings && item.key_findings.length > 0 && (
                          <div className="mt-3 bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                            <p className="text-xs font-bold text-slate-300 mb-1.5 flex items-center space-x-1">
                              <FileText className="w-3.5 h-3.5 text-teal-400" />
                              <span suppressHydrationWarning>{T.clinicalFindings}</span>
                            </p>
                            <ul className="space-y-1">
                              {item.key_findings.map((finding: string, i: number) => (
                                <li key={i} className="text-xs text-slate-400 flex items-start space-x-1.5 leading-relaxed">
                                  <span className="text-teal-500 mt-0.5">•</span>
                                  <span>{finding}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {item.clinical_summary && (
                          <div className="mt-3 p-3 rounded-xl bg-teal-950/20 border border-teal-500/20">
                            <p className="text-[11px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                              {language === "hi" ? "सारांश" : "Summary"}
                            </p>
                            <p className="text-xs text-teal-100 leading-relaxed">
                              {item.clinical_summary}
                            </p>
                          </div>
                        )}
                        
                        {item.extracted_medications && item.extracted_medications.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2" suppressHydrationWarning>
                              {T.prescribedRegimen}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {item.extracted_medications.map((med: any, i: number) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-teal-500/10 border border-teal-500/20 text-teal-200 text-[11px]"
                                >
                                  <Pill className="w-3 h-3 text-teal-400" />
                                  <span>
                                    <strong className="text-teal-100">{med.name || med}</strong>
                                    {med.dosage && <span className="opacity-70 ml-1">{med.dosage}</span>}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="p-4 bg-slate-950/80 backdrop-blur-md border-t border-white/10 sticky bottom-0 z-20 shadow-2xl">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() => router.back()}
            disabled={isUploading || isDispatching}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-slate-300 bg-slate-900 border border-white/10 hover:bg-slate-800 transition disabled:opacity-50"
            suppressHydrationWarning
          >
            {T.btnBack}
          </button>
          
          <button
            onClick={handleSubmitAndSendToDoctor}
            disabled={isUploading || isDispatching}
            className="w-full flex-1 py-3.5 px-6 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center space-x-2 transition shadow-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white disabled:opacity-50"
          >
            {isDispatching ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span suppressHydrationWarning>{T.generatingSoap}</span>
              </>
            ) : (
              <>
                <span suppressHydrationWarning>{T.btnReviewToken}</span>
                <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
