"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Pill,
  Stethoscope,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Lock,
  Calendar,
  Clock,
  Activity,
  FileCheck,
  History,
  Layers,
  FlaskConical,
  ScanLine,
  BedDouble,
  FileSpreadsheet,
} from "lucide-react";
import {
  useKioskSession,
  UploadedDocRecord,
  MedicalTimelineEntry,
} from "@/context/KioskSessionContext";

interface KioskDocumentUploadStepProps {
  ultraContrast?: boolean;
  onComplete?: () => void;
}

interface DiagnosisItem {
  condition: string;
  icd_code?: string;
  status?: string;
}

interface MedicationItem {
  name: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
}

interface MedicalReportAnalysis {
  patient_name?: string;
  document_date?: string;
  document_year?: number;
  document_type?: "Prescription" | "Blood Report" | "Imaging" | "Discharge Summary" | "Lab Report" | "Other";
  title?: string;
  report_date?: string;
  doctor_name?: string;
  hospital_name?: string;
  key_findings?: string[];
  diagnoses: DiagnosisItem[];
  medications: MedicationItem[];
  clinical_summary: string;
  lifestyle_advice?: string[];
  raw_ocr_snippet?: string;
  medical_timeline?: MedicalTimelineEntry[];
}

export default function KioskDocumentUploadStep({
  ultraContrast = false,
  onComplete,
}: KioskDocumentUploadStepProps) {
  const {
    sessionId,
    patientName,
    tokenNumber,
    patientLanguage,
    uploadedDocuments,
    addUploadedDocument,
    medicalTimeline,
    setMedicalTimeline,
    completeCheckIn,
    isGeneratingSummary,
  } = useKioskSession();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isInjectingDemo, setIsInjectingDemo] = useState<string | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<MedicalReportAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isHindi = patientLanguage === "hi";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // Fetch initial timeline if available for this session
  useEffect(() => {
    if (sessionId) {
      fetch(`${apiUrl}/api/reports/timeline/${sessionId}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setMedicalTimeline(data);
          }
        })
        .catch((e) => console.warn("Could not load initial timeline:", e));
    }
  }, [sessionId, apiUrl, setMedicalTimeline]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setErrorMessage(null);
    setLatestAnalysis(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUploadAndAnalyze = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("report_image", selectedFile);
      formData.append("session_id", sessionId);
      formData.append("patient_name", patientName || "Patient");

      const res = await fetch(`${apiUrl}/api/reports/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Upload failed with status: ${res.status}`);
      }

      const data: MedicalReportAnalysis = await res.json();
      setLatestAnalysis(data);

      if (data.medical_timeline && Array.isArray(data.medical_timeline)) {
        setMedicalTimeline(data.medical_timeline);
      }

      const docRecord: UploadedDocRecord = {
        id: `DOC-${Date.now()}`,
        filename: selectedFile.name,
        session_id: sessionId,
        storage_path: `sessions/${sessionId}/reports/${selectedFile.name}`,
        file_type: selectedFile.type,
        file_size: selectedFile.size,
        uploaded_at: new Date().toISOString(),
        diagnoses: data.diagnoses,
        medications: data.medications,
        clinical_summary: data.clinical_summary,
        raw_ocr_snippet: data.raw_ocr_snippet,
        preview_url: previewUrl || undefined,
      };

      addUploadedDocument(docRecord);
    } catch (err: any) {
      console.error("Report upload error:", err);
      setErrorMessage(
        err.message ||
          (isHindi
            ? "दस्तावेज़ विश्लेषण विफल रहा। कृपया पुनः प्रयास करें।"
            : "Failed to analyze document. Please verify and retry.")
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleInjectDemoSample = async (
    sampleType: "discharge_2021" | "blood_2023" | "imaging_2024" | "prescription_2026" | "all"
  ) => {
    setIsInjectingDemo(sampleType);
    setErrorMessage(null);
    try {
      const res = await fetch(`${apiUrl}/api/reports/demo-sample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId || "UHID-2026-DEMO",
          sample_type: sampleType,
        }),
      });

      if (!res.ok) {
        throw new Error(`Demo sample injection failed: ${res.status}`);
      }

      const data = await res.json();
      if (data.medical_timeline && Array.isArray(data.medical_timeline)) {
        setMedicalTimeline(data.medical_timeline);
      }
    } catch (e: any) {
      console.error("Error injecting demo document:", e);
      setErrorMessage(e.message || "Failed to load demo document.");
    } finally {
      setIsInjectingDemo(null);
    }
  };

  const handleFinalCheckin = async () => {
    await completeCheckIn();
    if (onComplete) {
      onComplete();
    }
  };

  // Helper for document type badge styling
  const getTypeBadge = (type: string) => {
    switch (type) {
      case "Discharge Summary":
        return {
          bg: "bg-amber-50 border-amber-200 text-amber-900",
          tag: "bg-amber-100 text-amber-800",
          icon: <BedDouble className="w-3.5 h-3.5 text-amber-700" />,
          accent: "border-l-amber-500",
        };
      case "Blood Report":
      case "Lab Report":
        return {
          bg: "bg-rose-50 border-rose-200 text-rose-900",
          tag: "bg-rose-100 text-rose-800",
          icon: <FlaskConical className="w-3.5 h-3.5 text-rose-700" />,
          accent: "border-l-rose-500",
        };
      case "Imaging":
        return {
          bg: "bg-purple-50 border-purple-200 text-purple-900",
          tag: "bg-purple-100 text-purple-800",
          icon: <ScanLine className="w-3.5 h-3.5 text-purple-700" />,
          accent: "border-l-purple-500",
        };
      default:
        return {
          bg: "bg-blue-50 border-blue-200 text-blue-900",
          tag: "bg-blue-100 text-blue-800",
          icon: <Stethoscope className="w-3.5 h-3.5 text-blue-700" />,
          accent: "border-l-blue-500",
        };
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Dynamic Header with Patient's Actual Name */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs sm:text-sm font-bold shadow-xs">
          <Sparkles className="w-4 h-4 text-teal-600 animate-pulse" />
          <span>
            {isHindi
              ? "कदम 3: मेडिकल दस्तावेज़ एवं क्रोनोलॉजिकल टाइमलाइन"
              : "Step 3: Medical Document OCR & Chronological Timeline"}
          </span>
        </div>

        {/* Dynamic Greeting Title */}
        <h1
          className={`text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight ${
            ultraContrast ? "text-[#FFFF00]" : "text-slate-900"
          }`}
        >
          {isHindi
            ? `${patientName || "मरीज़"}, कृपया अपनी पुरानी पर्ची या रिपोर्ट अपलोड करें`
            : `${patientName || "Patient"}, please upload your past reports`}
        </h1>

        <p
          className={`text-base sm:text-lg font-medium max-w-2xl mx-auto ${
            ultraContrast ? "text-white" : "text-slate-600"
          }`}
        >
          {isHindi
            ? "डिस्चार्ज समरी, ब्लड रिपोर्ट, एक्स-रे या पुरानी पर्ची अपलोड करें। एआई तारीख के अनुसार टाइमलाइन बनाएगा।"
            : "Upload prescriptions, discharge summaries, blood tests, or imaging. Extracted findings are sorted in ascending chronological order."}
        </p>

        {/* Session Isolation Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
          <span className="font-mono font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center space-x-1.5">
            <Lock className="w-3 h-3 text-teal-600" />
            <span>Session: {sessionId || "Active"}</span>
          </span>
          {tokenNumber && (
            <span className="font-mono font-bold px-3 py-1 rounded-full bg-teal-100 text-teal-900 border border-teal-200">
              Token: {tokenNumber}
            </span>
          )}
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Firestore `medical_timeline` Synced</span>
          </span>
        </div>
      </div>

      {/* Quick Test Demo Samples Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-teal-50 via-cyan-50 to-indigo-50 border border-teal-200/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-teal-700" />
            <span className="text-xs font-black uppercase tracking-wider text-teal-950">
              {isHindi ? "त्वरित डेमो परीक्षण (1-क्लिक सैम्पल):" : "Quick Test Presets (1-Click Evaluation):"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleInjectDemoSample("all")}
            disabled={isInjectingDemo !== null}
            className="px-3 py-1 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition active:scale-98 disabled:opacity-50"
          >
            {isInjectingDemo === "all" ? "Loading All..." : isHindi ? "सभी 4 रिकॉर्ड्स जोड़ें (2021-2026)" : "Load All 4 Historical Records"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => handleInjectDemoSample("discharge_2021")}
            disabled={isInjectingDemo !== null}
            className="p-2.5 rounded-xl bg-white/90 hover:bg-amber-50 border border-amber-200 text-left transition text-xs shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">
                2021
              </span>
              <BedDouble className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <p className="font-black text-slate-800 mt-1 truncate">Discharge Summary</p>
            <p className="text-[10px] text-slate-500">Appendectomy post-op</p>
          </button>

          <button
            type="button"
            onClick={() => handleInjectDemoSample("blood_2023")}
            disabled={isInjectingDemo !== null}
            className="p-2.5 rounded-xl bg-white/90 hover:bg-rose-50 border border-rose-200 text-left transition text-xs shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">
                2023
              </span>
              <FlaskConical className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <p className="font-black text-slate-800 mt-1 truncate">Blood Report</p>
            <p className="text-[10px] text-slate-500">HbA1c & Lipid Panel</p>
          </button>

          <button
            type="button"
            onClick={() => handleInjectDemoSample("imaging_2024")}
            disabled={isInjectingDemo !== null}
            className="p-2.5 rounded-xl bg-white/90 hover:bg-purple-50 border border-purple-200 text-left transition text-xs shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded text-[10px]">
                2024
              </span>
              <ScanLine className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <p className="font-black text-slate-800 mt-1 truncate">Chest Imaging</p>
            <p className="text-[10px] text-slate-500">PA Radiography</p>
          </button>

          <button
            type="button"
            onClick={() => handleInjectDemoSample("prescription_2026")}
            disabled={isInjectingDemo !== null}
            className="p-2.5 rounded-xl bg-white/90 hover:bg-blue-50 border border-blue-200 text-left transition text-xs shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded text-[10px]">
                2026
              </span>
              <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <p className="font-black text-slate-800 mt-1 truncate">Prescription</p>
            <p className="text-[10px] text-slate-500">AIIMS Medicine OPD</p>
          </button>
        </div>
      </div>

      {/* Main Upload Card */}
      <div
        className={`rounded-3xl border shadow-xl overflow-hidden ${
          ultraContrast
            ? "bg-black text-white border-[#FFFF00]"
            : "bg-white text-slate-900 border-slate-200/80 shadow-[0_20px_50px_rgba(15,23,42,0.08)]"
        }`}
      >
        <div className="p-6 sm:p-10 space-y-6">
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all ${
              isDragOver
                ? "border-teal-500 bg-teal-50/50 scale-[1.01]"
                : ultraContrast
                ? "border-[#FFFF00] bg-[#111111] hover:bg-[#1a1a1a]"
                : "border-slate-300 hover:border-teal-400 bg-slate-50/70 hover:bg-teal-50/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />

            <div className="space-y-3 max-w-md mx-auto">
              <div
                className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center shadow-md ${
                  ultraContrast
                    ? "bg-[#FFFF00] text-black"
                    : "bg-gradient-to-tr from-teal-500 to-cyan-600 text-white"
                }`}
              >
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <p className="text-base sm:text-lg font-black text-slate-900">
                  {selectedFile
                    ? selectedFile.name
                    : isHindi
                    ? "दस्तावेज़ की फोटो यहां खींचें या टच करें"
                    : "Drag & drop document or click to browse"}
                </p>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {isHindi
                    ? "PNG, JPG, WEBP, PDF (अधिकतम 10MB) • गूगल क्लाउड विज़न OCR एवं जेमिनी 3.1 प्रो"
                    : "PNG, JPG, WEBP, PDF (Max 10MB) • Google Cloud Vision OCR & Gemini 3.1 Pro"}
                </p>
              </div>

              {selectedFile && (
                <div className="inline-flex items-center space-x-2 text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-full border border-teal-200">
                  <FileCheck className="w-4 h-4 text-teal-600" />
                  <span>{(selectedFile.size / 1024).toFixed(1)} KB Ready for Extraction</span>
                </div>
              )}
            </div>
          </div>

          {/* Action to Analyze Document */}
          {selectedFile && !latestAnalysis && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={handleUploadAndAnalyze}
                disabled={isUploading}
                className={`px-8 py-3.5 rounded-2xl font-black text-sm sm:text-base flex items-center space-x-3 transition-all shadow-lg active:scale-98 ${
                  ultraContrast
                    ? "bg-[#FFFF00] text-black hover:bg-yellow-300"
                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-teal-700/25"
                } ${isUploading ? "opacity-75 cursor-wait" : ""}`}
              >
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>
                      {isHindi
                        ? "विज़न OCR एवं जेमिनी विश्लेषण चल रहा है..."
                        : "Running Cloud Vision OCR & Timeline Extraction..."}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>
                      {isHindi
                        ? "दवाइयां और निष्कर्ष निकालें (OCR)"
                        : "Extract Date, Type, Findings & Medications"}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Extracted Structured Results from current upload */}
          {latestAnalysis && (
            <div className="space-y-4 p-5 rounded-2xl border border-teal-200 bg-teal-50/40 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-teal-200 pb-3">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">
                    {isHindi ? "सफलतापूर्वक निकाला गया डेटा" : "Successfully Extracted Medical Event"}
                  </h3>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-mono font-bold text-teal-900 bg-teal-100 px-2.5 py-0.5 rounded-full">
                    {latestAnalysis.document_type} ({latestAnalysis.document_year || 2026})
                  </span>
                </div>
              </div>

              {/* Key Findings */}
              {latestAnalysis.key_findings && latestAnalysis.key_findings.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-teal-600" />
                    <span>{isHindi ? "प्रमुख निष्कर्ष" : "Key Findings"}</span>
                  </span>
                  <ul className="space-y-1">
                    {latestAnalysis.key_findings.map((finding, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-slate-800 bg-white p-2 rounded-lg border border-teal-100 flex items-start space-x-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Prescribed Medications */}
              {latestAnalysis.medications && latestAnalysis.medications.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center space-x-1.5">
                    <Pill className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{isHindi ? "निकाली गई दवाइयां" : "Extracted Medications"}</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {latestAnalysis.medications.map((m, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl bg-white border border-indigo-100 text-xs shadow-2xs space-y-0.5"
                      >
                        <p className="font-black text-indigo-950">{m.name}</p>
                        <p className="text-slate-500 text-[11px]">
                          {m.dosage} • {m.frequency} {m.instructions ? `• ${m.instructions}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CHRONOLOGICAL MEDICAL TIMELINE (ASCENDING ORDER) */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-teal-700" />
                <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                  {isHindi
                    ? `कालानुक्रमिक मेडिकल टाइमलाइन (${medicalTimeline.length} दस्तावेज़)`
                    : `Chronological Medical Timeline (${medicalTimeline.length} Documents)`}
                </h3>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Sorted Ascending: Oldest ➔ Newest</span>
              </span>
            </div>

            {medicalTimeline.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2">
                <History className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">
                  {isHindi ? "अभी तक कोई मेडिकल टाइमलाइन रिकॉर्ड नहीं है" : "No timeline records yet"}
                </p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {isHindi
                    ? "ऊपर दिए गए 1-क्लिक सैम्पल बटन दबाएं या अपना पर्चा अपलोड करें।"
                    : "Upload a document above or click any of the 4 Quick Test presets to build the patient timeline."}
                </p>
              </div>
            ) : (
              <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-0.5 before:bg-gradient-to-b before:from-amber-400 via-rose-400 to-teal-500">
                {medicalTimeline.map((item, index) => {
                  const badge = getTypeBadge(item.document_type);
                  return (
                    <div
                      key={item.id || index}
                      className={`relative rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm border-l-4 ${badge.accent} space-y-3 transition-all hover:shadow-md`}
                    >
                      {/* Timeline dot */}
                      <span className="absolute -left-[27px] sm:-left-[35px] top-5 w-4 h-4 rounded-full border-2 border-white bg-teal-600 shadow-sm flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      </span>

                      {/* Header: Date, Year, Type */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-slate-900 text-white shadow-xs">
                            {item.document_year || 2026}
                          </span>
                          <span className="text-xs font-bold text-slate-600 flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{item.document_date}</span>
                          </span>
                        </div>

                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center space-x-1.5 ${badge.bg}`}
                        >
                          {badge.icon}
                          <span>{item.document_type}</span>
                        </span>
                      </div>

                      {/* Document Title */}
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-slate-900">
                          {item.title}
                        </h4>
                        {(item.doctor_name || item.hospital_name) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {item.doctor_name} {item.hospital_name && `• ${item.hospital_name}`}
                          </p>
                        )}
                      </div>

                      {/* Key Findings */}
                      {item.key_findings && item.key_findings.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                            Key Findings / Clinical Notes:
                          </p>
                          <ul className="space-y-1 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            {item.key_findings.map((f, fi) => (
                              <li key={fi} className="flex items-start space-x-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Extracted Medications */}
                      {item.extracted_medications && item.extracted_medications.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                            Extracted Medications:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {item.extracted_medications.map((med, mi) => (
                              <span
                                key={mi}
                                className="inline-flex items-center space-x-1 text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-950 px-2.5 py-1 rounded-lg"
                              >
                                <Pill className="w-3 h-3 text-indigo-600" />
                                <span>
                                  {med.name} {med.dosage ? `(${med.dosage})` : ""} {med.frequency ? `• ${med.frequency}` : ""}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Diagnoses */}
                      {item.diagnoses && item.diagnoses.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {item.diagnoses.map((diag, di) => (
                            <span
                              key={di}
                              className="text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-800 px-2 py-0.5 rounded-md"
                            >
                              {diag.condition} {diag.icd_code ? `[${diag.icd_code}]` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Completion Actions */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => handleFinalCheckin()}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 underline"
            >
              {isHindi
                ? "कोई और रिपोर्ट नहीं है? सीधे चेक-इन पूरा करें →"
                : "Done with uploads? Skip to complete check-in →"}
            </button>

            <button
              type="button"
              onClick={handleFinalCheckin}
              disabled={isGeneratingSummary}
              className={`w-full sm:w-auto px-8 py-4 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center space-x-3 transition-all shadow-lg active:scale-98 ${
                ultraContrast
                  ? "bg-[#FFFF00] text-black hover:bg-yellow-300"
                  : "bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white shadow-teal-700/25"
              } ${isGeneratingSummary ? "opacity-75 cursor-wait" : ""}`}
            >
              {isGeneratingSummary ? (
                <>
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>
                    {isHindi
                      ? "जेमिनी 1.5 प्रो क्लिनिकल समरी बना रहा है..."
                      : "Synthesizing Clinical Summary (Gemini 1.5 Pro)..."}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {isHindi
                      ? "चेक-इन पूरा करें एवं डॉक्टर को भेजें"
                      : "Complete Check-in & Send to Doctor"}
                  </span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
