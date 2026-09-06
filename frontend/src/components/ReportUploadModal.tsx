"use client";

import { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  FileText,
  Pill,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Eye,
  Calendar,
  User,
  Building2,
} from "lucide-react";
import { Language } from "@/lib/i18n";

export interface DiagnosisItem {
  condition: string;
  icd_code?: string | null;
  status?: string | null;
}

export interface MedicationItem {
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  instructions?: string | null;
}

export interface MedicalReportAnalysis {
  patient_name?: string | null;
  report_date?: string | null;
  doctor_name?: string | null;
  hospital_name?: string | null;
  diagnoses: DiagnosisItem[];
  medications: MedicationItem[];
  clinical_summary: string;
  lifestyle_advice: string[];
  raw_ocr_snippet?: string | null;
}

interface ReportUploadModalProps {
  isOpen: boolean;
  language: Language;
  ultraContrast: boolean;
  onClose: () => void;
  onReportAnalyzed: (report: MedicalReportAnalysis) => void;
}

export default function ReportUploadModal({
  isOpen,
  language,
  ultraContrast,
  onClose,
  onReportAnalyzed,
}: ReportUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [reportResult, setReportResult] = useState<MedicalReportAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setErrorMessage(null);
    setReportResult(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUploadAndAnalyze = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("report_image", selectedFile);

      const res = await fetch(`${apiUrl}/api/reports/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed with status: ${res.status}`);
      }

      const data: MedicalReportAnalysis = await res.json();
      setReportResult(data);
      onReportAnalyzed(data);
    } catch (err: unknown) {
      console.error("Report upload error:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to analyze the medical report. Please verify backend connection."
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/65 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
          ultraContrast
            ? "bg-black text-white border-[#FFFF00]"
            : "bg-white text-slate-900 border-slate-200 shadow-[0_25px_60px_rgba(15,23,42,0.2)]"
        }`}
      >
        {/* Header */}
        <div
          className={`p-5 sm:p-6 border-b flex items-center justify-between ${
            ultraContrast
              ? "bg-[#111111] border-slate-800"
              : "bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-700 text-white"
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`p-3 rounded-2xl ${
                ultraContrast ? "bg-[#FFFF00] text-black" : "bg-white/15 backdrop-blur-md text-white"
              }`}
            >
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black">
                {language === "hi" ? "दवा पर्ची / रिपोर्ट अपलोड" : "Upload Medical Report / Rx"}
              </h2>
              <p
                className={`text-xs sm:text-sm font-medium ${
                  ultraContrast ? "text-slate-400" : "text-teal-100"
                }`}
              >
                Google Cloud Vision OCR + Gemini 3.1 Pro Extraction
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2.5 rounded-xl transition ${
              ultraContrast
                ? "bg-slate-800 hover:bg-slate-700 text-white"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* File Picker Drag & Drop Box */}
          {!reportResult && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-3 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                selectedFile
                  ? "border-teal-500 bg-teal-50/40"
                  : "border-slate-300 hover:border-teal-500 hover:bg-slate-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />

              <div className="flex flex-col items-center space-y-3">
                <div className="p-4 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div>
                  <p className="font-extrabold text-base sm:text-lg text-slate-800">
                    {selectedFile
                      ? selectedFile.name
                      : language === "hi"
                      ? "पर्ची की फ़ोटो चुनें या यहाँ खींचें"
                      : "Tap to select or take photo of medical prescription"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Supports PNG, JPG, JPEG, WEBP</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Trigger Button */}
          {selectedFile && !reportResult && (
            <button
              onClick={handleUploadAndAnalyze}
              disabled={isUploading}
              className="w-full py-4 rounded-2xl font-black text-lg uppercase tracking-wider flex items-center justify-center space-x-2.5 bg-teal-600 hover:bg-teal-500 text-white shadow-md transition disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>
                    {language === "hi"
                      ? "विजन ओसीआर एवं जेमिनी से जांच हो रही है..."
                      : "Scanning with Vision OCR & Gemini 3.1 Pro..."}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>
                    {language === "hi" ? "पर्ची का विश्लेषण करें" : "Analyze Report with Vision & Gemini"}
                  </span>
                </>
              )}
            </button>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-bold flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Analyzed Structured Results: Diagnoses and Medications */}
          {reportResult && (
            <div className="space-y-5 animate-in fade-in">
              {/* Header Info */}
              <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {reportResult.patient_name && (
                  <div>
                    <span className="text-slate-400 font-semibold block uppercase">Patient</span>
                    <span className="font-bold text-slate-800">{reportResult.patient_name}</span>
                  </div>
                )}
                {reportResult.report_date && (
                  <div>
                    <span className="text-slate-400 font-semibold block uppercase">Date</span>
                    <span className="font-bold text-slate-800">{reportResult.report_date}</span>
                  </div>
                )}
                {reportResult.doctor_name && (
                  <div className="col-span-2">
                    <span className="text-slate-400 font-semibold block uppercase">Doctor</span>
                    <span className="font-bold text-teal-800 truncate block">
                      {reportResult.doctor_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Section 1: Diagnoses */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Stethoscope className="w-5 h-5 text-teal-600" />
                  <h3 className="font-black text-lg text-slate-800 uppercase tracking-wide">
                    {language === "hi" ? "पहचानी गई बीमारियाँ (Diagnoses)" : "Clinical Diagnoses"}
                  </h3>
                </div>
                <div className="space-y-2">
                  {reportResult.diagnoses.map((diag, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between shadow-sm"
                    >
                      <div className="flex items-center space-x-2.5">
                        <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-sm sm:text-base text-slate-900 block">
                            {diag.condition}
                          </span>
                          {diag.status && (
                            <span className="text-xs text-slate-500 font-medium">
                              Status: {diag.status}
                            </span>
                          )}
                        </div>
                      </div>
                      {diag.icd_code && (
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-mono text-xs font-bold border">
                          ICD-10: {diag.icd_code}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Medications */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Pill className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-black text-lg text-slate-800 uppercase tracking-wide">
                    {language === "hi" ? "निर्धारित दवाइयाँ (Medications)" : "Prescribed Medications"}
                  </h3>
                </div>
                <div className="space-y-2">
                  {reportResult.medications.map((med, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                          <Pill className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-bold text-sm sm:text-base text-slate-900 block">
                            {med.name} {med.dosage && `(${med.dosage})`}
                          </span>
                          {med.instructions && (
                            <span className="text-xs text-slate-500 font-medium">
                              {med.instructions}
                            </span>
                          )}
                        </div>
                      </div>
                      {med.frequency && (
                        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold text-xs border border-emerald-200 self-start sm:self-auto">
                          {med.frequency}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Clinical Summary */}
              {reportResult.clinical_summary && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm">
                  <span className="text-slate-400 font-bold uppercase text-[11px] block">
                    Clinical Summary
                  </span>
                  <p className="font-medium text-slate-700 mt-1">{reportResult.clinical_summary}</p>
                </div>
              )}

              {/* Done / Close button */}
              <button
                onClick={onClose}
                className="w-full py-3.5 rounded-2xl font-black text-base uppercase tracking-wider bg-teal-600 hover:bg-teal-500 text-white shadow-md transition"
              >
                {language === "hi" ? "स्वीकार करें एवं चेक-इन जारी रखें" : "Accept & Proceed with Check-in"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
