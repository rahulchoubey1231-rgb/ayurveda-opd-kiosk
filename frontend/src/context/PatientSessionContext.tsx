"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface ConversationTurn {
  role: "user" | "model" | "assistant";
  text: string;
  timestamp: string;
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
  fileUrl?: string;
  raw_ocr_snippet?: string;
  uploaded_at?: string;
}

export interface TokenDetails {
  token_number: string;
  department: string;
  doctor_name: string;
  room_number: string;
  estimated_wait: string;
  queue_ahead: number;
  generated_at: string;
  status: string;
}

export interface PatientSessionState {
  session_id: string;
  abha_number: string;
  full_name: string;
  age: number | string;
  gender: string;
  mobile: string;
  opd_mode: "allopathy" | "ayurveda";
  language: "hi" | "en";
  conversation_history: ConversationTurn[];
  medical_timeline: MedicalTimelineEntry[];
  soap_summary: Record<string, any> | null;
  token_details: TokenDetails | null;

  // Actions
  initializeSession: (data: {
    full_name: string;
    age: number | string;
    gender: string;
    mobile: string;
    abha_number?: string;
    opd_mode?: "allopathy" | "ayurveda";
    language?: "hi" | "en";
    session_id?: string;
  }) => Promise<string>;
  setOpdMode: (mode: "allopathy" | "ayurveda") => void;
  setLanguage: (lang: "hi" | "en") => void;
  appendConversationTurn: (role: "user" | "model" | "assistant", text: string) => void;
  addMedicalTimelineEntry: (entry: MedicalTimelineEntry) => void;
  setMedicalTimeline: React.Dispatch<React.SetStateAction<MedicalTimelineEntry[]>>;
  setSoapSummary: (summary: Record<string, any> | null) => void;
  setTokenDetails: (token: TokenDetails | null) => void;
  updateSession: (updates: Partial<PatientSessionState>) => void;
  clearSession: () => void;
  isSessionActive: boolean;
}

const STORAGE_KEY = "medikiosk_patient_session";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const PatientSessionContext = createContext<PatientSessionState | undefined>(undefined);

export function PatientSessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [abhaNumber, setAbhaNumber] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [age, setAge] = useState<number | string>("");
  const [gender, setGender] = useState<string>("Male");
  const [mobile, setMobile] = useState<string>("");
  const [opdMode, setOpdModeState] = useState<"allopathy" | "ayurveda">("allopathy");
  const [language, setLanguageState] = useState<"hi" | "en">("hi");
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [medicalTimeline, setMedicalTimeline] = useState<MedicalTimelineEntry[]>([]);
  const [soapSummary, setSoapSummary] = useState<Record<string, any> | null>(null);
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 1. Restore from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.full_name && parsed.session_id) {
          setSessionId(parsed.session_id || "");
          setAbhaNumber(parsed.abha_number || "");
          setFullName(parsed.full_name || "");
          setAge(parsed.age || "");
          setGender(parsed.gender || "Male");
          setMobile(parsed.mobile || "");
          setOpdModeState(parsed.opd_mode || "allopathy");
          setLanguageState(parsed.language || "hi");
          setConversationHistory(parsed.conversation_history || []);
          setMedicalTimeline(parsed.medical_timeline || []);
          setSoapSummary(parsed.soap_summary || null);
          setTokenDetails(parsed.token_details || null);
        }
      }
    } catch (e) {
      console.warn("Could not parse saved patient session:", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // 2. Persist to localStorage whenever session data changes
  useEffect(() => {
    if (!isLoaded) return;
    if (sessionId && fullName) {
      try {
        const sessionPayload = {
          session_id: sessionId,
          abha_number: abhaNumber,
          full_name: fullName,
          age,
          gender,
          mobile,
          opd_mode: opdMode,
          language,
          conversation_history: conversationHistory,
          medical_timeline: medicalTimeline,
          soap_summary: soapSummary,
          token_details: tokenDetails,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionPayload));
      } catch (err) {
        console.warn("Could not save patient session to localStorage:", err);
      }
    }
  }, [
    isLoaded,
    sessionId,
    abhaNumber,
    fullName,
    age,
    gender,
    mobile,
    opdMode,
    language,
    conversationHistory,
    medicalTimeline,
    soapSummary,
    tokenDetails,
  ]);

  // Initialize a new or active patient session
  const initializeSession = useCallback(
    async (data: {
      full_name: string;
      age: number | string;
      gender: string;
      mobile: string;
      abha_number?: string;
      opd_mode?: "allopathy" | "ayurveda";
      language?: "hi" | "en";
      session_id?: string;
    }): Promise<string> => {
      const validName = data.full_name.trim();
      const validAge = Number(data.age) || 30;
      const validMobile = data.mobile.trim();
      const validAbha = data.abha_number?.trim() || "";
      const validGender = data.gender || "Male";
      const validMode = data.opd_mode || "allopathy";
      const validLang = data.language || "hi";
      const newSessionId =
        data.session_id ||
        `SES-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      setSessionId(newSessionId);
      setFullName(validName);
      setAge(validAge);
      setGender(validGender);
      setMobile(validMobile);
      setAbhaNumber(validAbha);
      setOpdModeState(validMode);
      setLanguageState(validLang);
      setConversationHistory([]);
      setMedicalTimeline([]);
      setSoapSummary(null);
      setTokenDetails(null);

      // Persist to backend and Firestore
      try {
        await fetch(`${API_BASE_URL}/api/sessions/initialize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: validName,
            full_name: validName,
            age: validAge,
            gender: validGender,
            mobile: validMobile,
            abha_id: validAbha || undefined,
            abha_number: validAbha || undefined,
            session_id: newSessionId,
            mode: validMode,
            opd_mode: validMode,
            language: validLang === "en" ? "en-IN" : "hi-IN",
          }),
        });
      } catch (err) {
        console.warn("Backend session initialization warning:", err);
      }

      return newSessionId;
    },
    []
  );

  const setOpdMode = useCallback((mode: "allopathy" | "ayurveda") => {
    setOpdModeState(mode);
  }, []);

  const setLanguage = useCallback((lang: "hi" | "en") => {
    setLanguageState(lang);
  }, []);

  const appendConversationTurn = useCallback(
    (role: "user" | "model" | "assistant", text: string) => {
      setConversationHistory((prev) => [
        ...prev,
        {
          role,
          text,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    []
  );

  const addMedicalTimelineEntry = useCallback((entry: MedicalTimelineEntry) => {
    setMedicalTimeline((prev) => {
      const filtered = prev.filter((item) => item.id !== entry.id);
      const updated = [...filtered, entry];
      return updated.sort((a, b) => {
        const yrA = a.document_year || 2026;
        const yrB = b.document_year || 2026;
        if (yrA !== yrB) return yrA - yrB;
        return new Date(a.document_date).getTime() - new Date(b.document_date).getTime();
      });
    });
  }, []);

  const updateSession = useCallback((updates: Partial<PatientSessionState>) => {
    if (updates.full_name !== undefined) setFullName(updates.full_name);
    if (updates.age !== undefined) setAge(updates.age);
    if (updates.gender !== undefined) setGender(updates.gender);
    if (updates.mobile !== undefined) setMobile(updates.mobile);
    if (updates.abha_number !== undefined) setAbhaNumber(updates.abha_number);
    if (updates.opd_mode !== undefined) setOpdModeState(updates.opd_mode);
    if (updates.language !== undefined) setLanguageState(updates.language);
    if (updates.conversation_history !== undefined) setConversationHistory(updates.conversation_history);
    if (updates.medical_timeline !== undefined) setMedicalTimeline(updates.medical_timeline);
    if (updates.soap_summary !== undefined) setSoapSummary(updates.soap_summary);
    if (updates.token_details !== undefined) setTokenDetails(updates.token_details);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSessionId("");
    setAbhaNumber("");
    setFullName("");
    setAge("");
    setGender("Male");
    setMobile("");
    setOpdModeState("allopathy");
    setLanguageState("hi");
    setConversationHistory([]);
    setMedicalTimeline([]);
    setSoapSummary(null);
    setTokenDetails(null);
  }, []);

  const isSessionActive = Boolean(sessionId && fullName.trim().length > 0);

  return (
    <PatientSessionContext.Provider
      value={{
        session_id: sessionId,
        abha_number: abhaNumber,
        full_name: fullName,
        age,
        gender,
        mobile,
        opd_mode: opdMode,
        language,
        conversation_history: conversationHistory,
        medical_timeline: medicalTimeline,
        soap_summary: soapSummary,
        token_details: tokenDetails,
        initializeSession,
        setOpdMode,
        setLanguage,
        appendConversationTurn,
        addMedicalTimelineEntry,
        setMedicalTimeline,
        setSoapSummary,
        setTokenDetails,
        updateSession,
        clearSession,
        isSessionActive,
      }}
    >
      {children}
    </PatientSessionContext.Provider>
  );
}

export function usePatientSession(): PatientSessionState {
  const context = useContext(PatientSessionContext);
  if (!context) {
    throw new Error("usePatientSession must be used within a PatientSessionProvider");
  }
  return context;
}

/**
 * Route Guard: Redirects back to /login if no authentic patient session exists.
 * CRITICAL RULE: Zero fallback to hardcoded mock names like 'John Doe' or 'Ramesh'.
 */
export function useRequirePatientSession(redirectPath = "/login") {
  const session = usePatientSession();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      router.replace(redirectPath);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.full_name || !parsed.session_id) {
        router.replace(redirectPath);
      } else {
        setIsReady(true);
      }
    } catch {
      router.replace(redirectPath);
    }
  }, [router, redirectPath]);

  return { session, isReady };
}
