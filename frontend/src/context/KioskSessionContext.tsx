"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type KioskStep = "welcome" | "triage" | "upload" | "complete";

export interface ChatMessage {
  role: "user" | "model" | "assistant";
  text: string;
  timestamp: string;
}

export interface UploadedDocRecord {
  id: string;
  filename: string;
  session_id: string;
  storage_path: string;
  file_type?: string;
  file_size?: number;
  uploaded_at: string;
  diagnoses?: Array<{ condition: string; icd_code?: string; status?: string }>;
  medications?: Array<{ name: string; dosage?: string; frequency?: string; instructions?: string }>;
  clinical_summary?: string;
  raw_ocr_snippet?: string;
  preview_url?: string;
}

export interface MedicalTimelineEntry {
  id: string;
  document_date: string;
  document_year: number;
  document_type: "Prescription" | "Blood Report" | "Imaging" | "Discharge Summary" | "Lab Report" | "Other";
  title: string;
  key_findings: string[];
  extracted_medications: Array<{ name: string; dosage?: string; frequency?: string; instructions?: string }>;
  diagnoses?: Array<{ condition: string; icd_code?: string; status?: string }>;
  doctor_name?: string;
  hospital_name?: string;
  clinical_summary?: string;
  storage_path?: string;
  raw_ocr_snippet?: string;
  uploaded_at?: string;
}

export interface KioskSessionState {
  sessionId: string;
  patientName: string;
  patientAge: number | string;
  patientMobile: string;
  patientAbhaId?: string;
  patientGender: string;
  patientLanguage: "hi" | "en";
  consultationMode: "allopathy" | "ayurveda";
  tokenNumber: string;
  currentStep: KioskStep;
  chatHistory: ChatMessage[];
  uploadedDocuments: UploadedDocRecord[];
  medicalTimeline: MedicalTimelineEntry[];
  clinicalSummary: any | null;
  isInitializing: boolean;
  isGeneratingSummary: boolean;
  error: string | null;

  // Actions
  initializeSession: (data: {
    name: string;
    age: number;
    mobile: string;
    abhaId?: string;
    gender?: string;
    language?: "hi" | "en";
    mode?: "allopathy" | "ayurveda";
  }) => Promise<string>;
  setConsultationMode: (mode: "allopathy" | "ayurveda") => void;
  setStep: (step: KioskStep) => void;
  appendChatTurn: (role: "user" | "model", text: string) => void;
  addUploadedDocument: (doc: UploadedDocRecord) => void;
  addTimelineEntry: (entry: MedicalTimelineEntry) => void;
  setMedicalTimeline: React.Dispatch<React.SetStateAction<MedicalTimelineEntry[]>>;
  completeCheckIn: () => Promise<any>;
  resetSession: () => void;
}

const KioskSessionContext = createContext<KioskSessionState | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export function KioskSessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [patientName, setPatientName] = useState<string>("");
  const [patientAge, setPatientAge] = useState<number | string>("");
  const [patientMobile, setPatientMobile] = useState<string>("");
  const [patientAbhaId, setPatientAbhaId] = useState<string>("");
  const [patientGender, setPatientGender] = useState<string>("Male");
  const [patientLanguage, setPatientLanguage] = useState<"hi" | "en">("hi");
  const [consultationMode, setConsultationMode] = useState<"allopathy" | "ayurveda">("allopathy");
  const [tokenNumber, setTokenNumber] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<KioskStep>("welcome");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocRecord[]>([]);
  const [medicalTimeline, setMedicalTimeline] = useState<MedicalTimelineEntry[]>([]);
  const [clinicalSummary, setClinicalSummary] = useState<any | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session from localStorage if available
  useEffect(() => {
    try {
      const savedSession = sessionStorage.getItem("medikiosk_active_session");
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed.sessionId) {
          setSessionId(parsed.sessionId);
          setPatientName(parsed.patientName || "");
          setPatientAge(parsed.patientAge || "");
          setPatientMobile(parsed.patientMobile || "");
          setPatientAbhaId(parsed.patientAbhaId || "");
          setPatientGender(parsed.patientGender || "Male");
          setPatientLanguage(parsed.patientLanguage || "hi");
          setConsultationMode(parsed.consultationMode || "allopathy");
          setTokenNumber(parsed.tokenNumber || "");
          setCurrentStep(parsed.currentStep || "welcome");
          setChatHistory(parsed.chatHistory || []);
          setUploadedDocuments(parsed.uploadedDocuments || []);
          setMedicalTimeline(parsed.medicalTimeline || []);
          setClinicalSummary(parsed.clinicalSummary || null);
        }
      }
    } catch (e) {
      console.warn("Could not restore session from storage:", e);
    }
  }, []);

  // Sync to sessionStorage
  useEffect(() => {
    if (sessionId) {
      try {
        sessionStorage.setItem(
          "medikiosk_active_session",
          JSON.stringify({
            sessionId,
            patientName,
            patientAge,
            patientMobile,
            patientAbhaId,
            patientGender,
            patientLanguage,
            consultationMode,
            tokenNumber,
            currentStep,
            chatHistory,
            uploadedDocuments,
            medicalTimeline,
            clinicalSummary,
          })
        );
      } catch (e) {
        console.warn("Could not save session to storage:", e);
      }
    }
  }, [
    sessionId,
    patientName,
    patientAge,
    patientMobile,
    patientAbhaId,
    patientGender,
    patientLanguage,
    consultationMode,
    tokenNumber,
    currentStep,
    chatHistory,
    uploadedDocuments,
    medicalTimeline,
    clinicalSummary,
  ]);

  const initializeSession = async (data: {
    name: string;
    age: number;
    mobile: string;
    abhaId?: string;
    gender?: string;
    language?: "hi" | "en";
    mode?: "allopathy" | "ayurveda";
  }): Promise<string> => {
    setIsInitializing(true);
    setError(null);

    const effectiveName = data.name.trim();
    const effectiveAge = Number(data.age);
    const effectiveMobile = data.mobile.trim();
    const effectiveAbhaId = data.abhaId ? data.abhaId.trim() : (effectiveMobile.includes("-") || effectiveMobile.includes("@") ? effectiveMobile : "");
    const effectiveGender = data.gender || "Male";
    const effectiveLang = data.language || patientLanguage || "hi";
    const effectiveMode = data.mode || consultationMode || "allopathy";

    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: effectiveName,
          age: effectiveAge,
          mobile: effectiveMobile,
          abha_id: effectiveAbhaId || undefined,
          gender: effectiveGender,
          language: effectiveLang,
          mode: effectiveMode,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned ${res.status}`);
      }

      const resData = await res.json();
      const newSessionId = resData.session_id;
      const newToken = resData.token_number || `OPD-${newSessionId.slice(-4)}`;

      setSessionId(newSessionId);
      setPatientName(effectiveName);
      setPatientAge(effectiveAge);
      setPatientMobile(effectiveMobile);
      setPatientAbhaId(effectiveAbhaId);
      setPatientGender(effectiveGender);
      setPatientLanguage(effectiveLang);
      setConsultationMode(effectiveMode);
      setTokenNumber(newToken);
      setChatHistory([]);
      setUploadedDocuments([]);
      setMedicalTimeline([]);
      setClinicalSummary(null);
      setCurrentStep("triage");

      return newSessionId;
    } catch (err: any) {
      console.error("Failed to initialize patient session:", err);
      // Fallback offline session generation
      const fallbackId = `SES-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const fallbackToken = `OPD-${fallbackId.slice(-4)}`;

      setSessionId(fallbackId);
      setPatientName(effectiveName);
      setPatientAge(effectiveAge);
      setPatientMobile(effectiveMobile);
      setPatientAbhaId(effectiveAbhaId);
      setPatientGender(effectiveGender);
      setPatientLanguage(effectiveLang);
      setConsultationMode(effectiveMode);
      setTokenNumber(fallbackToken);
      setChatHistory([]);
      setUploadedDocuments([]);
      setMedicalTimeline([]);
      setClinicalSummary(null);
      setCurrentStep("triage");
      return fallbackId;
    } finally {
      setIsInitializing(false);
    }
  };

  const setStep = (step: KioskStep) => {
    setCurrentStep(step);
    // Optionally notify backend of step change
    if (sessionId) {
      fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: step }),
      }).catch((e) => console.warn("Could not patch session step:", e));
    }
  };

  const appendChatTurn = (role: "user" | "model", text: string) => {
    const newTurn: ChatMessage = {
      role,
      text,
      timestamp: new Date().toISOString(),
    };
    setChatHistory((prev) => [...prev, newTurn]);
  };

  const addUploadedDocument = (doc: UploadedDocRecord) => {
    setUploadedDocuments((prev) => [...prev, doc]);
  };

  const addTimelineEntry = (entry: MedicalTimelineEntry) => {
    setMedicalTimeline((prev) => {
      const next = [...prev.filter((item) => item.id !== entry.id), entry];
      return next.sort((a, b) => {
        const yrA = a.document_year || 2026;
        const yrB = b.document_year || 2026;
        if (yrA !== yrB) return yrA - yrB;
        return new Date(a.document_date).getTime() - new Date(b.document_date).getTime();
      });
    });
  };

  const completeCheckIn = async () => {
    setIsGeneratingSummary(true);
    try {
      // 1. Collect all OCR text from uploaded documents
      const combinedOcr = uploadedDocuments
        .map((d) => d.raw_ocr_snippet || d.clinical_summary || "")
        .filter(Boolean)
        .join("\n\n");

      // 2. Call /generate-clinical-summary
      const summaryRes = await fetch(`${API_BASE_URL}/generate-clinical-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          patient_id: sessionId,
          patient_name: patientName,
          chat_history: chatHistory,
          ocr_text: combinedOcr,
        }),
      });

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setClinicalSummary(summaryData);
      }

      // 3. Mark session complete
      await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_step: "completed",
          status: "Ready for Doctor Consultation",
        }),
      }).catch((e) => console.warn("Failed to mark session complete:", e));

      setCurrentStep("complete");
      return true;
    } catch (err) {
      console.error("Error finalizing checkin:", err);
      setCurrentStep("complete");
      return false;
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const resetSession = () => {
    sessionStorage.removeItem("medikiosk_active_session");
    setSessionId("");
    setPatientName("");
    setPatientAge("");
    setPatientMobile("");
    setPatientGender("Male");
    setConsultationMode("allopathy");
    setTokenNumber("");
    setCurrentStep("welcome");
    setChatHistory([]);
    setUploadedDocuments([]);
    setMedicalTimeline([]);
    setClinicalSummary(null);
    setError(null);
  };

  return (
    <KioskSessionContext.Provider
      value={{
        sessionId,
        patientName,
        patientAge,
        patientMobile,
        patientAbhaId,
        patientGender,
        patientLanguage,
        consultationMode,
        tokenNumber,
        currentStep,
        chatHistory,
        uploadedDocuments,
        medicalTimeline,
        clinicalSummary,
        isInitializing,
        isGeneratingSummary,
        error,
        initializeSession,
        setConsultationMode,
        setStep,
        appendChatTurn,
        addUploadedDocument,
        addTimelineEntry,
        setMedicalTimeline,
        completeCheckIn,
        resetSession,
      }}
    >
      {children}
    </KioskSessionContext.Provider>
  );
}

export function useKioskSession(): KioskSessionState {
  const context = useContext(KioskSessionContext);
  if (!context) {
    throw new Error("useKioskSession must be used within a KioskSessionProvider");
  }
  return context;
}
