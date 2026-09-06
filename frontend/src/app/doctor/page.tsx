"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  User,
  Heart,
  Thermometer,
  Stethoscope,
  FileText,
  Mic,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Copy,
  Printer,
  ArrowLeft,
  Search,
  Check,
  Pill,
  ShieldCheck,
  Clock,
  ChevronRight,
  Database,
  ExternalLink,
  Flame,
  Volume2,
  ClipboardList,
  TestTube,
  FileSpreadsheet,
  Calendar,
  FlaskConical,
  ScanLine,
  BedDouble,
  Layers,
  Edit3,
  Save,
  Lock,
  Unlock,
  CheckCircle2,
  Plus,
  Trash2,
  X,
  Leaf
} from "lucide-react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";

export interface LabValueItem {
  test_name: string;
  result_value: string;
  reference_range?: string;
  status?: string;
}

export interface ClinicalSummaryMedication {
  name: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
}

export interface ExtractedLabValuesAndMedications {
  lab_values: LabValueItem[];
  medications: ClinicalSummaryMedication[];
  summary?: string;
}

export interface ClinicalSummary {
  patient_id?: string;
  patient_name?: string;
  generated_at: string;
  model_version: string;
  chief_complaint: string;
  history_of_present_illness: string;
  past_medical_history: string[];
  extracted_lab_values_medications: ExtractedLabValuesAndMedications;
  raw_markdown?: string;
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

interface SOAPSubjective {
  chief_complaint: string;
  history_of_present_illness: string;
  patient_reported_symptoms: string[];
  pain_level?: string;
  allergies: string[];
  past_medical_history: string[];
}

interface SOAPObjective {
  vital_signs: Record<string, unknown>;
  physical_observations: string;
  diagnostic_and_lab_findings: string[];
  uploaded_documents_summary?: string;
}

interface SOAPAssessment {
  primary_diagnosis: string;
  secondary_diagnoses: string[];
  icd10_codes: string[];
  clinical_impression: string;
  severity_assessment: string;
}

interface SOAPPlan {
  medications: MedicationItem[];
  diagnostic_orders: string[];
  patient_education_and_lifestyle: string[];
  follow_up: string;
  red_flag_warnings: string[];
}

interface ClinicalSOAPNote {
  patient_id: string;
  patient_name: string;
  generated_at: string;
  model_version: string;
  subjective: SOAPSubjective;
  objective: SOAPObjective;
  assessment: SOAPAssessment;
  plan: SOAPPlan;
  raw_markdown?: string;
}

interface VoiceRecord {
  timestamp: string;
  language: string;
  duration_seconds: number;
  text: string;
  translated_text?: string;
  triage_urgency: string;
}

interface UploadedDoc {
  doc_id?: string;
  id?: string;
  title?: string;
  filename?: string;
  date?: string;
  uploaded_at?: string;
  doctor?: string;
  ocr_text?: string;
  raw_ocr_snippet?: string;
  storage_path?: string;
  diagnoses?: DiagnosisItem[];
  medications?: MedicationItem[];
  clinical_summary?: string;
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
  fileUrl?: string;
}

export interface AyurvedaPariksha {
  prakriti?: string;
  agni?: string;
  koshtha?: string;
  nidra?: string;
  dhatu_sarata?: string;
  satmya?: string;
  ahara_vihara?: string;
}

export interface CurrentMedication {
  name: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
}

interface Patient {
  patient_id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  abha_id: string;
  token_number: string;
  triage_priority: string;
  department: string;
  mode?: "allopathy" | "ayurveda";
  is_red_flag?: boolean;
  emr_status?: "DRAFT" | "APPROVED_AND_LOCKED";
  approved_at?: string;
  approved_by?: string;
  abdm_transaction_id?: string;
  doctor_notes?: string;
  chief_complaint?: string;
  hpi_points?: string[];
  current_medications?: CurrentMedication[];
  ayurveda_pariksha?: AyurvedaPariksha;
  checkin_time: string;
  status: string;
  allergies: string[];
  medical_history: string[];
  vitals: {
    blood_pressure?: string;
    heart_rate?: number;
    spo2?: number;
    temperature?: number;
    respiratory_rate?: number;
  };
  voice_history?: VoiceRecord[];
  uploaded_documents?: UploadedDoc[];
  medical_timeline?: MedicalTimelineEntry[];
  soap_note?: ClinicalSOAPNote | null;
  clinical_summary?: ClinicalSummary | null;
}

export default function DoctorDashboardPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [soapNote, setSoapNote] = useState<ClinicalSOAPNote | null>(null);
  const [clinicalSummary, setClinicalSummary] = useState<ClinicalSummary | null>(null);
  const [isLoadingPatients, setIsLoadingPatients] = useState<boolean>(true);
  const [isGeneratingSoap, setIsGeneratingSoap] = useState<boolean>(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"digest" | "soap" | "voice" | "documents">("digest");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedNote, setCopiedNote] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [emergencyAlert, setEmergencyAlert] = useState<any | null>(null);

  // Doctor-in-the-Loop Controls State
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isSavingSummary, setIsSavingSummary] = useState<boolean>(false);
  const [isApprovingEMR, setIsApprovingEMR] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string>("");

  const [editForm, setEditForm] = useState<{
    chief_complaint: string;
    hpi_points: string[];
    allergies: string[];
    medical_history: string[];
    current_medications: CurrentMedication[];
    ayurveda_pariksha: AyurvedaPariksha;
    doctor_notes: string;
  }>({
    chief_complaint: "",
    hpi_points: [],
    allergies: [],
    medical_history: [],
    current_medications: [],
    ayurveda_pariksha: {},
    doctor_notes: "",
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // Document type badge styling helper
  const getTypeBadge = (type?: string) => {
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

  // Populate edit form from patient
  const syncEditFormFromPatient = (p: Patient) => {
    const chief = p.chief_complaint || p.clinical_summary?.chief_complaint || "General Physical Discomfort";
    let hpi = p.hpi_points || [];
    if (hpi.length === 0) {
      if (p.clinical_summary?.history_of_present_illness) {
        hpi = [p.clinical_summary.history_of_present_illness];
      } else if (p.voice_history && p.voice_history.length > 0) {
        hpi = p.voice_history.map((v) => `Patient voice report (${v.language || "hi"}): ${v.translated_text || v.text}`);
      } else {
        hpi = ["Patient presented with acute clinical symptoms via MediKiosk."];
      }
    }

    let meds = p.current_medications || [];
    if (meds.length === 0 && p.clinical_summary?.extracted_lab_values_medications?.medications) {
      meds = p.clinical_summary.extracted_lab_values_medications.medications.map((m) => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        instructions: m.instructions,
      }));
    }

    setEditForm({
      chief_complaint: chief,
      hpi_points: [...hpi],
      allergies: p.allergies ? [...p.allergies] : ["No known drug allergies (NKDA)"],
      medical_history: p.medical_history ? [...p.medical_history] : [],
      current_medications: [...meds],
      ayurveda_pariksha: p.ayurveda_pariksha ? { ...p.ayurveda_pariksha } : {},
      doctor_notes: p.doctor_notes || "",
    });
  };

  // Fetch timeline if selected patient does not have it yet
  useEffect(() => {
    if (selectedPatient && (!selectedPatient.medical_timeline || selectedPatient.medical_timeline.length === 0)) {
      fetch(`${apiUrl}/api/reports/timeline/${selectedPatient.patient_id}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((tl) => {
          if (Array.isArray(tl) && tl.length > 0) {
            setSelectedPatient((prev) => (prev ? { ...prev, medical_timeline: tl } : null));
            setPatients((prev) =>
              prev.map((p) => (p.patient_id === selectedPatient.patient_id ? { ...p, medical_timeline: tl } : p))
            );
          }
        })
        .catch((e) => console.warn("Could not fetch timeline for patient:", e));
    }
  }, [selectedPatient?.patient_id, apiUrl]);

  // Audio Siren generator using Web Audio API
  const playEmergencyTone = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
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
      // Audio context may require user gesture
    }
  };

  // 1. WebSocket Live Emergency Alert Stream
  useEffect(() => {
    const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws";
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "EMERGENCY_RED_ALERT") {
              setEmergencyAlert(data);
              playEmergencyTone();
            }

            if (data.type === "PATIENT_REGISTERED" && data.patient) {
              setPatients((prev) => {
                const idx = prev.findIndex((p) => p.patient_id === data.patient.patient_id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], ...data.patient };
                  return updated;
                }
                return [data.patient, ...prev];
              });
            }

            if (data.type === "TIMELINE_UPDATED" || (data.type === "DOCUMENT_UPLOADED" && data.document)) {
              const targetId = data.session_id;
              const timeline: MedicalTimelineEntry[] = data.medical_timeline || [];
              setPatients((prev) =>
                prev.map((p) => {
                  if (p.patient_id === targetId) {
                    const existingDocs = p.uploaded_documents || [];
                    const nextDocs = data.document ? [...existingDocs, data.document] : existingDocs;
                    return {
                      ...p,
                      uploaded_documents: nextDocs,
                      medical_timeline: timeline.length > 0 ? timeline : p.medical_timeline,
                    };
                  }
                  return p;
                })
              );
              setSelectedPatient((prev) => {
                if (prev && prev.patient_id === targetId) {
                  const existingDocs = prev.uploaded_documents || [];
                  const nextDocs = data.document ? [...existingDocs, data.document] : existingDocs;
                  return {
                    ...prev,
                    uploaded_documents: nextDocs,
                    medical_timeline: timeline.length > 0 ? timeline : prev.medical_timeline,
                  };
                }
                return prev;
              });
            }

            if (data.type === "EMR_APPROVED_AND_LOCKED") {
              setPatients((prev) =>
                prev.map((p) =>
                  p.patient_id === data.patient_id
                    ? {
                        ...p,
                        emr_status: "APPROVED_AND_LOCKED",
                        abdm_transaction_id: data.abdm_transaction_id,
                        approved_at: data.approved_at,
                        approved_by: data.approved_by,
                      }
                    : p
                )
              );
              setSelectedPatient((prev) =>
                prev && prev.patient_id === data.patient_id
                  ? {
                      ...prev,
                      emr_status: "APPROVED_AND_LOCKED",
                      abdm_transaction_id: data.abdm_transaction_id,
                      approved_at: data.approved_at,
                      approved_by: data.approved_by,
                    }
                  : prev
              );
            }
          } catch (e) {
            console.error("WS Parse error:", e);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (err) {
        console.warn("WebSocket initialization warning:", err);
      }
    }

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, [apiUrl]);

  // Real-Time Firebase Firestore onSnapshot Listener
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    try {
      const q = query(collection(db, "patients"));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          setIsFirebaseConnected(true);
          const docs: Patient[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            // Support both field aliases: full_name (kiosk session) and name (legacy)
            const resolvedName = data.full_name || data.name || "Patient";
            // Support both ABHA field aliases
            const resolvedAbha = data.abha_id || data.abha_number || "";
            docs.push({
              patient_id: data.patient_id || data.session_id || docSnap.id,
              name: resolvedName,
              age: data.age || 30,
              gender: data.gender || "Other",
              phone: data.phone || data.mobile || "",
              abha_id: resolvedAbha,
              token_number: data.token_number || `OPD-${docSnap.id.slice(-4)}`,
              triage_priority: data.triage_priority || "Normal OPD",
              department: data.department || "General Medicine OPD (Room 102)",
              mode: (data.mode || data.opd_mode || "allopathy") as "allopathy" | "ayurveda",
              is_red_flag: Boolean(data.is_red_flag),
              emr_status: data.emr_status || "DRAFT",
              approved_at: data.approved_at,
              approved_by: data.approved_by,
              abdm_transaction_id: data.abdm_transaction_id,
              chief_complaint: data.chief_complaint,
              hpi_points: data.hpi_points || [],
              current_medications: data.current_medications || [],
              ayurveda_pariksha: data.ayurveda_pariksha,
              doctor_notes: data.doctor_notes,
              checkin_time: data.created_at || data.checkin_time || new Date().toISOString(),
              status: data.status || "In Queue",
              allergies: data.allergies || ["No known allergies recorded"],
              medical_history: data.medical_history || [],
              vitals: data.vitals || {
                blood_pressure: "120/80 mmHg",
                heart_rate: 74,
                spo2: 98,
                temperature: 98.6,
              },
              voice_history: data.voice_history || data.chat_history || [],
              uploaded_documents: data.uploaded_documents || [],
              medical_timeline: data.medical_timeline || [],
              soap_note: data.soap_note || null,
              clinical_summary: data.clinical_summary || null,
            });
          });

          if (docs.length > 0) {
            setPatients(docs);
            setSelectedPatient((prev) => {
              if (!prev) return docs[0];
              const updated = docs.find((d) => d.patient_id === prev.patient_id);
              return updated || prev;
            });
          }
        },
        (error) => {
          console.warn("Firestore onSnapshot notice:", error);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.warn("Firestore snapshot registration warning:", e);
    }
  }, []);

  // Fetch Patients from Backend / Cache
  useEffect(() => {
    async function loadPatients() {
      setIsLoadingPatients(true);
      try {
        const res = await fetch(`${apiUrl}/api/doctor/patients`);
        if (res.ok) {
          const raw = await res.json();
          const sanitized: Patient[] = (raw as any[]).map((p: any) => ({
            ...p,
            // Resolve field name aliases from kiosk session data
            name: p.full_name || p.name || "Patient",
            abha_id: p.abha_id || p.abha_number || "",
            phone: p.phone || p.mobile || "",
            mode: (p.mode || p.opd_mode || "allopathy") as "allopathy" | "ayurveda",
            is_red_flag: Boolean(p.is_red_flag),
            emr_status: p.emr_status || "DRAFT",
            hpi_points: p.hpi_points || [],
            current_medications: p.current_medications || [],
            voice_history: p.voice_history || p.chat_history || [],
            uploaded_documents: p.uploaded_documents || [],
            medical_timeline: p.medical_timeline || [],
          }));
          setPatients(sanitized);
          if (sanitized.length > 0) {
            const first = sanitized[0];
            setSelectedPatientId(first.patient_id);
            setSelectedPatient(first);
            syncEditFormFromPatient(first);
            if (first.soap_note) setSoapNote(first.soap_note);
            if (first.clinical_summary) setClinicalSummary(first.clinical_summary);
          }
        }
      } catch (err) {
        console.error("Failed to load patient queue:", err);
      } finally {
        setIsLoadingPatients(false);
      }
    }

    async function checkHealth() {
      try {
        const res = await fetch(`${apiUrl}/api/health`);
        if (res.ok) {
          const data = await res.json();
          setIsFirebaseConnected(Boolean(data.firebase_connected));
        }
      } catch (e) {
        console.warn("Backend health check warning:", e);
      }
    }

    loadPatients();
    checkHealth();
  }, [apiUrl]);

  // Handle selecting a patient from queue
  const handleSelectPatient = (patient: Patient) => {
    const safePatient: Patient = {
      ...patient,
      mode: patient.mode || "allopathy",
      is_red_flag: Boolean(patient.is_red_flag),
      emr_status: patient.emr_status || "DRAFT",
      hpi_points: patient.hpi_points || [],
      current_medications: patient.current_medications || [],
      voice_history: patient.voice_history || [],
      uploaded_documents: patient.uploaded_documents || [],
      medical_timeline: patient.medical_timeline || [],
    };
    setSelectedPatientId(safePatient.patient_id);
    setSelectedPatient(safePatient);
    setIsEditMode(false);
    syncEditFormFromPatient(safePatient);
    setSoapNote(safePatient.soap_note || null);
    setClinicalSummary(safePatient.clinical_summary || null);
    setCopiedNote(false);
    setCopiedSummary(false);
  };

  // DOCTOR-IN-THE-LOOP: Save Inline Edits to Backend
  const handleSaveSummary = async () => {
    if (!selectedPatient) return;
    setIsSavingSummary(true);

    try {
      const payload = {
        chief_complaint: editForm.chief_complaint,
        hpi_points: editForm.hpi_points.filter((pt) => pt.trim().length > 0),
        allergies: editForm.allergies.filter((al) => al.trim().length > 0),
        medical_history: editForm.medical_history.filter((mh) => mh.trim().length > 0),
        current_medications: editForm.current_medications.filter((m) => m.name && m.name.trim().length > 0),
        ayurveda_pariksha: editForm.ayurveda_pariksha,
      };

      const res = await fetch(`${apiUrl}/api/doctor/patients/${selectedPatient.patient_id}/summary`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Save failed with status ${res.status}`);
      }

      const updatedPatient: Patient = await res.json();
      setSelectedPatient((prev) => (prev ? { ...prev, ...updatedPatient } : null));
      setPatients((prev) =>
        prev.map((p) => (p.patient_id === selectedPatient.patient_id ? { ...p, ...updatedPatient } : p))
      );
      setIsEditMode(false);
      setSaveSuccessMessage("Clinical summary updated successfully!");
      setTimeout(() => setSaveSuccessMessage(""), 4000);
    } catch (e) {
      console.error("Error saving summary edits:", e);
      alert("Failed to save changes. Please check backend connection.");
    } finally {
      setIsSavingSummary(false);
    }
  };

  // DOCTOR-IN-THE-LOOP: Approve & Send to EMR / ABDM (Locks record)
  const handleApproveEMR = async () => {
    if (!selectedPatient) return;
    if (selectedPatient.emr_status === "APPROVED_AND_LOCKED") return;

    setIsApprovingEMR(true);
    try {
      const payload = {
        doctor_name: "Dr. A. Sharma, MD",
        notes: editForm.doctor_notes || "Clinical findings reviewed, verified, and authorized for electronic health record transfer.",
        clinical_digest: {
          chief_complaint: editForm.chief_complaint || selectedPatient.chief_complaint,
          hpi_points: editForm.hpi_points,
          allergies: editForm.allergies,
          medical_history: editForm.medical_history,
          current_medications: editForm.current_medications,
          ayurveda_pariksha: editForm.ayurveda_pariksha,
          vitals: selectedPatient.vitals,
        },
      };

      const res = await fetch(`${apiUrl}/api/doctor/patients/${selectedPatient.patient_id}/approve-emr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`EMR approval failed with status ${res.status}`);
      }

      const data = await res.json();
      const updated = data.patient || {
        ...selectedPatient,
        emr_status: "APPROVED_AND_LOCKED",
        abdm_transaction_id: data.abdm_transaction_id,
        approved_at: data.approved_at,
        approved_by: data.approved_by,
      };

      setSelectedPatient((prev) => (prev ? { ...prev, ...updated } : null));
      setPatients((prev) =>
        prev.map((p) => (p.patient_id === selectedPatient.patient_id ? { ...p, ...updated } : p))
      );
      setIsEditMode(false);
      setSaveSuccessMessage("Record approved, locked, and transmitted to ABDM / Hospital EMR!");
      setTimeout(() => setSaveSuccessMessage(""), 5000);
    } catch (e) {
      console.error("Error approving EMR:", e);
      alert("Failed to lock and approve record. Please check backend connection.");
    } finally {
      setIsApprovingEMR(false);
    }
  };

  // Generate Clinical Summary with Gemini 1.5 Pro
  const handleGenerateClinicalSummary = async () => {
    if (!selectedPatient) return;
    setIsGeneratingSummary(true);

    try {
      const res = await fetch(`${apiUrl}/generate-clinical-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.patient_id,
          patient_name: selectedPatient.name,
        }),
      });

      if (res.ok) {
        const summary: ClinicalSummary = await res.json();
        setClinicalSummary(summary);
        setSelectedPatient((prev) => (prev ? { ...prev, clinical_summary: summary } : null));
        setPatients((prev) =>
          prev.map((p) => (p.patient_id === selectedPatient.patient_id ? { ...p, clinical_summary: summary } : p))
        );
        syncEditFormFromPatient({ ...selectedPatient, clinical_summary: summary });
      }
    } catch (err) {
      console.error("Error generating Clinical Summary:", err);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Generate SOAP Note with Gemini 3.1 Pro
  const handleGenerateSoap = async () => {
    if (!selectedPatient) return;
    setIsGeneratingSoap(true);

    try {
      const res = await fetch(`${apiUrl}/api/doctor/patients/${selectedPatient.patient_id}/soap-note`, {
        method: "POST",
      });

      if (res.ok) {
        const note: ClinicalSOAPNote = await res.json();
        setSoapNote(note);
        setPatients((prev) =>
          prev.map((p) => (p.patient_id === selectedPatient.patient_id ? { ...p, soap_note: note } : p))
        );
      }
    } catch (err) {
      console.error("Error generating SOAP note:", err);
    } finally {
      setIsGeneratingSoap(false);
    }
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.token_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.patient_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans">
      {/* HEADER */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-600 text-slate-950 shadow-sm">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base tracking-tight text-white">MediKiosk</span>
                <span className="bg-teal-500/20 text-teal-300 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full border border-teal-500/30">
                  Doctor Clinical Workstation
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                AI-Assisted Unified Clinical Digest & OPD Triage Station
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Firebase Status */}
            <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs">
              <span className={`w-2 h-2 rounded-full ${isFirebaseConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span className="text-slate-300 font-mono text-[11px]">
                {isFirebaseConnected ? "Cloud Sync: Online" : "Local Mode"}
              </span>
            </div>

            {/* WebSocket Stream Indicator */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-cyan-400 animate-pulse" : "bg-rose-400"}`} />
              <span className="text-slate-300 font-mono text-[11px]">
                {wsConnected ? "Live Alert Stream: Active" : "WS Reconnecting..."}
              </span>
            </div>

            {/* Doctor Profile */}
            <div className="hidden sm:flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              <div className="w-7 h-7 rounded-full bg-teal-600/30 text-teal-300 flex items-center justify-center font-bold text-xs">
                AS
              </div>
              <div className="text-left text-xs">
                <p className="font-bold text-slate-200">Dr. A. Sharma, MD</p>
                <p className="text-slate-400 text-[10px]">Room 102 • Internal Medicine & AYUSH</p>
              </div>
            </div>

            {/* Link to Patient Kiosk */}
            <Link
              href="/"
              className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Patient Kiosk View</span>
            </Link>
          </div>
        </div>
      </header>

      {/* WEBSOCKET RED EMERGENCY ALERT BANNER */}
      {emergencyAlert && (
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-2xl border-b-4 border-yellow-400 animate-in slide-in-from-top duration-300 z-50 sticky top-[57px]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3.5">
                <div className="p-2.5 bg-white/20 rounded-2xl animate-bounce shrink-0 mt-0.5">
                  <Flame className="w-7 h-7 text-yellow-300" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-yellow-400 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider animate-pulse">
                      🚨 PRIORITY 1 RED ALERT
                    </span>
                    <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">
                      CRITICAL CARDIO-RESPIRATORY DISTRESS
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-red-100 mt-1 font-medium">
                    Patient: <strong className="text-white underline">{emergencyAlert.patient_name}</strong> • Location: <strong>{emergencyAlert.kiosk_location}</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => {
                    const match = patients.find((p) => p.patient_id === emergencyAlert.patient_id);
                    if (match) handleSelectPatient(match);
                    setEmergencyAlert(null);
                  }}
                  className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black text-xs px-4 py-2 rounded-xl shadow-md transition"
                >
                  Review Patient File
                </button>
                <button
                  onClick={() => setEmergencyAlert(null)}
                  className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-2 rounded-xl transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS NOTIFICATION TOAST */}
      {saveSuccessMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 text-white border-2 border-emerald-400 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 animate-in fade-in slide-in-from-bottom duration-300">
          <CheckCircle2 className="w-6 h-6 text-emerald-300 shrink-0" />
          <div>
            <p className="font-extrabold text-sm text-white">Action Completed</p>
            <p className="text-xs text-emerald-200">{saveSuccessMessage}</p>
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: OPD Real-Time Queue (4 cols on lg) */}
        <aside className="lg:col-span-4 flex flex-col space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Activity className="w-4 h-4 text-teal-600" />
                <span>Real-Time OPD Queue</span>
              </h2>
              <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
                {patients.length} Waiting
              </span>
            </div>

            {/* Search Box */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search token, name, or UHID..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
              />
            </div>

            {/* Queue List */}
            {isLoadingPatients ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-600" />
                <p className="text-xs">Loading queue from Firebase...</p>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {searchQuery ? "No matching patients found." : "No patients currently in queue."}
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {filteredPatients.map((p) => {
                  const isSelected = p.patient_id === selectedPatientId;
                  const isRed = Boolean(p.is_red_flag) || p.triage_priority?.toLowerCase().includes("urgent");
                  const isAyurveda = p.mode === "ayurveda" || p.department?.toLowerCase().includes("ayurveda");
                  // Mark as NEW if checked in within last 10 minutes
                  const checkinMs = new Date(p.checkin_time).getTime();
                  const isNew = !isNaN(checkinMs) && (Date.now() - checkinMs) < 10 * 60 * 1000;

                  return (
                    <button
                      key={p.patient_id}
                      onClick={() => handleSelectPatient(p)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col space-y-1.5 relative ${
                        isSelected
                          ? "bg-teal-50/70 border-teal-500 ring-2 ring-teal-500/20 shadow-sm"
                          : "bg-white hover:bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`font-black text-xs px-2 py-0.5 rounded-md ${
                              isSelected ? "bg-teal-600 text-white" : "bg-slate-800 text-white"
                            }`}
                          >
                            {p.token_number || "OPD"}
                          </span>
                          <h3 className="font-bold text-sm text-slate-900 truncate max-w-[120px]">{p.name}</h3>
                          {isNew && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-cyan-500 text-white animate-pulse shrink-0">
                              NEW
                            </span>
                          )}
                        </div>

                        {/* Mode & Red Flag Badges */}
                        <div className="flex items-center space-x-1">
                          {isAyurveda ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-0.5">
                              <Leaf className="w-2.5 h-2.5 text-emerald-600" />
                              <span>Ayu</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">
                              Allo
                            </span>
                          )}

                          {isRed ? (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white animate-pulse">
                              RED
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Normal
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {p.age} Y / {p.gender}
                        </span>
                        {/* Show ABHA number if available, else truncated patient_id */}
                        <span className="font-mono text-[11px] text-teal-600">
                          {p.abha_id ? `ABHA: ${p.abha_id.slice(0, 12)}` : p.patient_id.slice(-10)}
                        </span>
                      </div>

                      {/* Vitals Quick Pill */}
                      <div className="flex items-center space-x-2 pt-1 text-[11px] font-mono text-slate-600 border-t border-slate-100">
                        <span>BP: {p.vitals?.blood_pressure || "120/80"}</span>
                        <span>•</span>
                        <span>SpO2: {p.vitals?.spo2 ? `${p.vitals.spo2}%` : "98%"}</span>
                        <span>•</span>
                        <span>HR: {p.vitals?.heart_rate || 72}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: Unified Clinical Digest & Doctor-in-the-Loop Controls (8 cols on lg) */}
        <main className="lg:col-span-8 flex flex-col space-y-5">
          {selectedPatient ? (
            <>
              {/* PATIENT DEMOGRAPHICS & INTAKE MODE BANNER */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-slate-100">
                  <div className="flex items-start space-x-3.5">
                    <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-teal-600 to-cyan-700 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
                      {selectedPatient.name?.charAt(0) || "P"}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-black text-slate-900">{selectedPatient.name}</h1>
                        <span className="text-xs font-black px-2.5 py-0.5 rounded-md bg-teal-600 text-white shadow-2xs">
                          {selectedPatient.token_number}
                        </span>

                        {/* Intake Mode Badge */}
                        {selectedPatient.mode === "ayurveda" || selectedPatient.department?.toLowerCase().includes("ayurveda") ? (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center space-x-1">
                            <Leaf className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Ayurveda OPD (Room 108)</span>
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-300 flex items-center space-x-1">
                            <Stethoscope className="w-3.5 h-3.5 text-teal-700" />
                            <span>General / Allopathy OPD (Room 102)</span>
                          </span>
                        )}

                        {/* Red-Flag Status Badge */}
                        {selectedPatient.is_red_flag || selectedPatient.triage_priority?.toLowerCase().includes("urgent") ? (
                          <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-rose-600 text-white border border-rose-700 flex items-center space-x-1 animate-pulse shadow-sm">
                            <Flame className="w-3.5 h-3.5 text-yellow-300" />
                            <span>🚨 HIGH PRIORITY TRIAGE (RED FLAG)</span>
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>🟢 Normal Triage / Low Risk</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                        <span>
                          {selectedPatient.age} Years • {selectedPatient.gender}
                        </span>
                        <span>•</span>
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-bold">
                          UHID: {selectedPatient.patient_id}
                        </span>
                        <span>•</span>
                        <span className="font-mono text-slate-600">
                          ABHA: {selectedPatient.abha_id || "91-0000-0000-0000"}
                        </span>
                        <span>•</span>
                        <span>{selectedPatient.phone || "+91 98765 00000"}</span>
                      </p>
                    </div>
                  </div>

                  {/* Secondary Quick Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => window.print()}
                      className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
                      title="Print Clinical File"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Biometric Vitals Telemetry Ribbon */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-rose-100 text-rose-600">
                      <Heart className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Blood Pressure</p>
                      <p className="text-sm font-black text-slate-900 font-mono">
                        {selectedPatient.vitals?.blood_pressure || "120/80 mmHg"}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-red-100 text-red-600">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Heart Rate</p>
                      <p className="text-sm font-black text-slate-900 font-mono">
                        {selectedPatient.vitals?.heart_rate || 74}{" "}
                        <span className="text-[10px] text-slate-500 font-normal">bpm</span>
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-sky-100 text-sky-600">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">SpO2 Oxygen</p>
                      <p className="text-sm font-black text-slate-900 font-mono">
                        {selectedPatient.vitals?.spo2 || 98}%
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                      <Thermometer className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Temperature</p>
                      <p className="text-sm font-black text-slate-900 font-mono">
                        {selectedPatient.vitals?.temperature || 98.6} °F
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* TABS HEADER: Primary is "Unified Clinical Digest" */}
              <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("digest")}
                  className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition-all shrink-0 ${
                    activeTab === "digest"
                      ? "border-teal-600 text-teal-700 bg-teal-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <ClipboardList className="w-4 h-4 text-teal-600" />
                  <span>📋 Unified Clinical Digest</span>
                  <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded font-mono">
                    Doctor View
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("soap")}
                  className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition-all shrink-0 ${
                    activeTab === "soap"
                      ? "border-teal-600 text-teal-700 bg-teal-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span>AI SOAP Note (Gemini 3.1 Pro)</span>
                </button>

                <button
                  onClick={() => setActiveTab("voice")}
                  className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition-all shrink-0 ${
                    activeTab === "voice"
                      ? "border-teal-600 text-teal-700 bg-teal-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Mic className="w-4 h-4 text-slate-600" />
                  <span>Voice History ({selectedPatient.voice_history?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab("documents")}
                  className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition-all shrink-0 ${
                    activeTab === "documents"
                      ? "border-teal-600 text-teal-700 bg-teal-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span>Chronological Timeline ({selectedPatient.medical_timeline?.length || 0})</span>
                </button>
              </div>

              {/* TAB 1: UNIFIED CLINICAL DIGEST (Main Workstation View) */}
              {activeTab === "digest" && (
                <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-sm p-6 space-y-6">
                  {/* DOCTOR-IN-THE-LOOP CONTROL BAR */}
                  <div
                    className={`rounded-2xl p-4 border transition-all ${
                      selectedPatient.emr_status === "APPROVED_AND_LOCKED"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                        : "bg-gradient-to-r from-amber-50 to-indigo-50 border-amber-300 text-slate-900"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start space-x-3">
                        {selectedPatient.emr_status === "APPROVED_AND_LOCKED" ? (
                          <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0 mt-0.5">
                            <Lock className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 mt-0.5">
                            <ShieldCheck className="w-5 h-5" />
                          </div>
                        )}

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {selectedPatient.emr_status === "APPROVED_AND_LOCKED" ? (
                              <span className="font-extrabold text-sm text-emerald-900 flex items-center space-x-1.5">
                                <span>🔒 OFFICIAL RECORD LOCKED & TRANSMITTED TO ABDM / EMR</span>
                              </span>
                            ) : (
                              <span className="font-black text-xs uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-900 tracking-wide">
                                ⚠️ AI-Generated Draft (Doctor Verification Required)
                              </span>
                            )}

                            {selectedPatient.abdm_transaction_id && (
                              <span className="font-mono text-xs bg-white text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-300">
                                {selectedPatient.abdm_transaction_id}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 mt-1">
                            {selectedPatient.emr_status === "APPROVED_AND_LOCKED"
                              ? `Verified and locked by ${selectedPatient.approved_by || "Dr. A. Sharma, MD"} at ${new Date(selectedPatient.approved_at || "").toLocaleString()}. Modifications are restricted.`
                              : "Review AI-synthesized clinical findings, adjust parameters inline if required, and approve to finalize into ABDM/Hospital EMR."}
                          </p>
                        </div>
                      </div>

                      {/* Doctor Actions */}
                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                        {selectedPatient.emr_status !== "APPROVED_AND_LOCKED" && (
                          <>
                            {isEditMode ? (
                              <>
                                <button
                                  type="button"
                                  onClick={handleSaveSummary}
                                  disabled={isSavingSummary}
                                  className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-sm disabled:opacity-50"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>{isSavingSummary ? "Saving..." : "Save Changes"}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    syncEditFormFromPatient(selectedPatient);
                                    setIsEditMode(false);
                                  }}
                                  className="flex items-center space-x-1 text-slate-600 hover:text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Cancel</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setIsEditMode(true)}
                                className="flex items-center space-x-1.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs px-3 py-2 rounded-xl border border-slate-300 shadow-xs transition"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                                <span>Edit Summary</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={handleApproveEMR}
                              disabled={isApprovingEMR}
                              className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md transition disabled:opacity-50"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>{isApprovingEMR ? "Locking & Sending..." : "Approve & Send to EMR / ABDM"}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 1. CHIEF COMPLAINT */}
                  <div className="border border-teal-200 bg-teal-50/40 rounded-2xl p-5 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-teal-100 pb-2">
                      <div className="flex items-center space-x-2 text-teal-950">
                        <span className="w-6 h-6 rounded-lg bg-teal-600 text-white font-black flex items-center justify-center text-xs shadow-xs">
                          1
                        </span>
                        <h3 className="font-extrabold text-sm tracking-tight flex items-center space-x-1.5">
                          <Stethoscope className="w-4 h-4 text-teal-700" />
                          <span>CHIEF COMPLAINT</span>
                        </h3>
                      </div>
                    </div>

                    {isEditMode ? (
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                          Edit Chief Stated Complaint:
                        </label>
                        <textarea
                          rows={2}
                          value={editForm.chief_complaint}
                          onChange={(e) => setEditForm({ ...editForm, chief_complaint: e.target.value })}
                          className="w-full text-sm font-bold p-3 bg-white border border-teal-300 rounded-xl focus:ring-2 focus:ring-teal-500 text-slate-900"
                        />
                      </div>
                    ) : (
                      <div className="bg-white p-4 rounded-xl border border-teal-200/80 shadow-2xs">
                        <p className="text-base font-extrabold text-slate-900 leading-snug">
                          &ldquo;{selectedPatient.chief_complaint || editForm.chief_complaint}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 2. STRUCTURED HPI (BULLET POINTS) */}
                  <div className="border border-indigo-100 bg-indigo-50/25 rounded-2xl p-5 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                      <div className="flex items-center space-x-2 text-indigo-950">
                        <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black flex items-center justify-center text-xs shadow-xs">
                          2
                        </span>
                        <h3 className="font-extrabold text-sm tracking-tight flex items-center space-x-1.5">
                          <Activity className="w-4 h-4 text-indigo-700" />
                          <span>STRUCTURED HISTORY OF PRESENT ILLNESS (HPI)</span>
                        </h3>
                      </div>

                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, hpi_points: [...editForm.hpi_points, ""] })}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add HPI Bullet</span>
                        </button>
                      )}
                    </div>

                    {isEditMode ? (
                      <div className="space-y-2">
                        {editForm.hpi_points.map((pt, idx) => (
                          <div key={idx} className="flex items-center space-x-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                            <input
                              type="text"
                              value={pt}
                              onChange={(e) => {
                                const copy = [...editForm.hpi_points];
                                copy[idx] = e.target.value;
                                setEditForm({ ...editForm, hpi_points: copy });
                              }}
                              className="w-full text-xs p-2 bg-white border border-indigo-200 rounded-lg text-slate-800"
                              placeholder="e.g. Onset, Duration, Severity, Relieving Factors..."
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const copy = editForm.hpi_points.filter((_, i) => i !== idx);
                                setEditForm({ ...editForm, hpi_points: copy });
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-2xs">
                        <ul className="space-y-2 text-xs text-slate-800">
                          {(selectedPatient.hpi_points && selectedPatient.hpi_points.length > 0
                            ? selectedPatient.hpi_points
                            : editForm.hpi_points
                          ).map((point, i) => (
                            <li key={i} className="flex items-start space-x-2.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                              <span className="leading-relaxed">{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* 3. PAST HISTORY, ALLERGIES, & CURRENT MEDICATIONS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 3a. History & Allergies */}
                    <div className="border border-purple-100 bg-purple-50/25 rounded-2xl p-5 space-y-3 shadow-2xs">
                      <div className="flex items-center space-x-2 text-purple-950 border-b border-purple-100 pb-2">
                        <span className="w-6 h-6 rounded-lg bg-purple-600 text-white font-black flex items-center justify-center text-xs shadow-xs">
                          3
                        </span>
                        <h3 className="font-extrabold text-sm tracking-tight flex items-center space-x-1.5">
                          <ShieldCheck className="w-4 h-4 text-purple-700" />
                          <span>PAST HISTORY & ALLERGIES</span>
                        </h3>
                      </div>

                      {/* Allergies */}
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">
                          Documented Allergies:
                        </p>
                        {isEditMode ? (
                          <input
                            type="text"
                            value={editForm.allergies.join(", ")}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                allergies: e.target.value.split(",").map((s) => s.trim()),
                              })
                            }
                            className="w-full text-xs p-2 bg-white border border-purple-200 rounded-lg text-slate-800"
                            placeholder="Comma-separated allergies..."
                          />
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {(selectedPatient.allergies || []).map((al, i) => {
                              const isNKDA = al.toLowerCase().includes("no known") || al.toLowerCase().includes("nkda");
                              return (
                                <span
                                  key={i}
                                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 ${
                                    isNKDA
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : "bg-rose-50 text-rose-800 border-rose-200"
                                  }`}
                                >
                                  <AlertTriangle className={`w-3 h-3 ${isNKDA ? "text-emerald-600" : "text-rose-600"}`} />
                                  <span>{al}</span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Past Medical History */}
                      <div className="pt-2">
                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">
                          Comorbidities & Past Diagnoses:
                        </p>
                        {isEditMode ? (
                          <input
                            type="text"
                            value={editForm.medical_history.join(", ")}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                medical_history: e.target.value.split(",").map((s) => s.trim()),
                              })
                            }
                            className="w-full text-xs p-2 bg-white border border-purple-200 rounded-lg text-slate-800"
                            placeholder="Comma-separated chronic conditions..."
                          />
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {(selectedPatient.medical_history || []).length > 0 ? (
                              selectedPatient.medical_history.map((h, i) => (
                                <span
                                  key={i}
                                  className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-purple-200 text-purple-950"
                                >
                                  {h}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400 italic">None recorded</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3b. Current Medications */}
                    <div className="border border-teal-100 bg-teal-50/25 rounded-2xl p-5 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-teal-100 pb-2">
                        <div className="flex items-center space-x-2 text-teal-950">
                          <span className="w-6 h-6 rounded-lg bg-teal-600 text-white font-black flex items-center justify-center text-xs shadow-xs">
                            4
                          </span>
                          <h3 className="font-extrabold text-sm tracking-tight flex items-center space-x-1.5">
                            <Pill className="w-4 h-4 text-teal-700" />
                            <span>CURRENT MEDICATIONS</span>
                          </h3>
                        </div>

                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditForm({
                                ...editForm,
                                current_medications: [
                                  ...editForm.current_medications,
                                  { name: "", dosage: "", frequency: "Once daily (OD)" },
                                ],
                              })
                            }
                            className="text-xs font-bold text-teal-600 hover:text-teal-800 flex items-center space-x-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Drug</span>
                          </button>
                        )}
                      </div>

                      {isEditMode ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {editForm.current_medications.map((m, idx) => (
                            <div key={idx} className="flex items-center space-x-1.5">
                              <input
                                type="text"
                                value={m.name}
                                onChange={(e) => {
                                  const copy = [...editForm.current_medications];
                                  copy[idx].name = e.target.value;
                                  setEditForm({ ...editForm, current_medications: copy });
                                }}
                                placeholder="Drug Name"
                                className="text-xs p-1.5 bg-white border border-teal-200 rounded flex-1"
                              />
                              <input
                                type="text"
                                value={m.dosage || ""}
                                onChange={(e) => {
                                  const copy = [...editForm.current_medications];
                                  copy[idx].dosage = e.target.value;
                                  setEditForm({ ...editForm, current_medications: copy });
                                }}
                                placeholder="Dose"
                                className="text-xs p-1.5 bg-white border border-teal-200 rounded w-20 font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const copy = editForm.current_medications.filter((_, i) => i !== idx);
                                  setEditForm({ ...editForm, current_medications: copy });
                                }}
                                className="text-slate-400 hover:text-rose-600 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {(selectedPatient.current_medications && selectedPatient.current_medications.length > 0
                            ? selectedPatient.current_medications
                            : editForm.current_medications
                          ).map((med, i) => (
                            <div
                              key={i}
                              className="p-2 rounded-xl bg-white border border-teal-100 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-extrabold text-slate-900">{med.name}</span>
                                {med.dosage && (
                                  <span className="ml-1.5 font-mono text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded font-bold">
                                    {med.dosage}
                                  </span>
                                )}
                                {med.instructions && (
                                  <p className="text-[11px] text-slate-500 mt-0.5">{med.instructions}</p>
                                )}
                              </div>
                              {med.frequency && (
                                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md shrink-0">
                                  {med.frequency}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4. (IF AYURVEDA MODE) DASHAVIDHA PARIKSHA & AHARA-VIHARA INDICATORS */}
                  {(selectedPatient.mode === "ayurveda" || selectedPatient.ayurveda_pariksha) && (
                    <div className="border border-emerald-300 bg-gradient-to-r from-emerald-50/60 to-amber-50/40 rounded-2xl p-5 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                        <div className="flex items-center space-x-2 text-emerald-950">
                          <span className="w-6 h-6 rounded-lg bg-emerald-700 text-white font-black flex items-center justify-center text-xs shadow-xs">
                            🌿
                          </span>
                          <h3 className="font-extrabold text-sm tracking-tight flex items-center space-x-1.5">
                            <Leaf className="w-4 h-4 text-emerald-700" />
                            <span>DASHAVIDHA PARIKSHA & AHARA-VIHARA INDICATORS (AYURVEDA OPD)</span>
                          </h3>
                        </div>

                        <span className="text-[10px] font-bold bg-emerald-200/80 text-emerald-900 px-2.5 py-0.5 rounded-full">
                          Kayachikitsa Protocol
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                            Prakriti (प्रकृति)
                          </p>
                          <p className="text-xs font-black text-slate-900">
                            {selectedPatient.ayurveda_pariksha?.prakriti || editForm.ayurveda_pariksha?.prakriti || "Vata-Pitta (वात-पित्त)"}
                          </p>
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                            Agni (अग्नि - Digestive Fire)
                          </p>
                          <p className="text-xs font-black text-slate-900">
                            {selectedPatient.ayurveda_pariksha?.agni || editForm.ayurveda_pariksha?.agni || "Mandagni (मन्दाग्नि / Sluggish)"}
                          </p>
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                            Koshtha (कोष्ठ - Bowel Nature)
                          </p>
                          <p className="text-xs font-black text-slate-900">
                            {selectedPatient.ayurveda_pariksha?.koshtha || editForm.ayurveda_pariksha?.koshtha || "Krura Koshtha (क्रूर कोष्ठ)"}
                          </p>
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                            Nidra (निद्रा - Sleep Pattern)
                          </p>
                          <p className="text-xs font-black text-slate-900">
                            {selectedPatient.ayurveda_pariksha?.nidra || editForm.ayurveda_pariksha?.nidra || "Khandita Nidra (Disturbed)"}
                          </p>
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1 sm:col-span-2">
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                            Ahara-Vihara (आहार-विहार Lifestyle & Diet)
                          </p>
                          <p className="text-xs font-semibold text-slate-800">
                            {selectedPatient.ayurveda_pariksha?.ahara_vihara || editForm.ayurveda_pariksha?.ahara_vihara || "Vidahi Ahara, Ratrijagarana (Late Night Awakening)"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. CHRONOLOGICAL MEDICAL TIMELINE (VISUAL DATE-WISE CARDS) */}
                  <div className="border border-slate-200 bg-slate-50/50 rounded-2xl p-5 space-y-4 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div className="flex items-center space-x-2 text-slate-900">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 text-white font-black flex items-center justify-center text-xs shadow-xs">
                          5
                        </span>
                        <div>
                          <h3 className="font-extrabold text-sm tracking-tight flex items-center space-x-1.5">
                            <Calendar className="w-4 h-4 text-teal-700" />
                            <span>CHRONOLOGICAL MEDICAL TIMELINE</span>
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Strictly sorted in ascending order (oldest to newest: e.g. 2021 ➔ 2023 ➔ 2024 ➔ 2026)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch(`${apiUrl}/api/reports/demo-sample`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  session_id: selectedPatient.patient_id,
                                  sample_type: "all",
                                }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                if (data.medical_timeline) {
                                  setSelectedPatient((prev) =>
                                    prev ? { ...prev, medical_timeline: data.medical_timeline } : null
                                  );
                                  setPatients((prev) =>
                                    prev.map((p) =>
                                      p.patient_id === selectedPatient.patient_id
                                        ? { ...p, medical_timeline: data.medical_timeline }
                                        : p
                                    )
                                  );
                                }
                              }
                            } catch (e) {
                              console.error("Error loading sample timeline:", e);
                            }
                          }}
                          className="text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white px-3 py-1 rounded-xl shadow-xs transition"
                        >
                          + Demo Historical Timeline
                        </button>
                      </div>
                    </div>

                    {/* Cards */}
                    {selectedPatient.medical_timeline && selectedPatient.medical_timeline.length > 0 ? (
                      <div className="space-y-3">
                        {selectedPatient.medical_timeline.map((entry, idx) => {
                          const badge = getTypeBadge(entry.document_type);
                          return (
                            <div
                              key={entry.id || idx}
                              className={`rounded-xl border border-slate-200 bg-white p-4 shadow-2xs border-l-4 ${badge.accent} space-y-2`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-slate-900 text-white">
                                    {entry.document_year || 2026}
                                  </span>
                                  <span className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{entry.document_date}</span>
                                  </span>
                                </div>
                                <span
                                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center space-x-1.5 ${badge.bg}`}
                                >
                                  {badge.icon}
                                  <span>{entry.document_type}</span>
                                </span>
                              </div>

                              <h4 className="text-sm font-extrabold text-slate-900">{entry.title}</h4>
                              {(entry.doctor_name || entry.hospital_name) && (
                                <p className="text-[11px] text-slate-500">
                                  {entry.doctor_name} {entry.hospital_name && `• ${entry.hospital_name}`}
                                </p>
                              )}

                              {entry.key_findings && entry.key_findings.length > 0 && (
                                <ul className="space-y-1 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                  {entry.key_findings.map((f, fi) => (
                                    <li key={fi} className="flex items-start space-x-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                                      <span>{f}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {entry.fileUrl && (
                                <div className="mt-2">
                                  <a href={entry.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1.5 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border border-teal-200 transition">
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>View Attached Document</span>
                                  </a>
                                </div>
                              )}

                              {entry.extracted_medications && entry.extracted_medications.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {entry.extracted_medications.map((med, mi) => (
                                    <span
                                      key={mi}
                                      className="inline-flex items-center space-x-1 text-[11px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-950 px-2 py-0.5 rounded-md"
                                    >
                                      <Pill className="w-3 h-3 text-indigo-600" />
                                      <span>
                                        {med.name} {med.dosage ? `(${med.dosage})` : ""}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl bg-white">
                        <FileText className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                        <p className="text-xs font-semibold text-slate-600">No medical timeline entries uploaded</p>
                        <p className="text-[11px] text-slate-400">
                          Click &ldquo;+ Demo Historical Timeline&rdquo; to populate records from 2021 to 2026.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: AI SOAP NOTE PANEL */}
              {activeTab === "soap" && (
                <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-sm p-6 space-y-6">
                  {isGeneratingSoap ? (
                    <div className="py-16 text-center space-y-4">
                      <div className="w-12 h-12 rounded-full border-4 border-teal-600 border-t-transparent animate-spin mx-auto" />
                      <h3 className="text-base font-bold text-slate-800">
                        Gemini 3.1 Pro Formulating SOAP Note...
                      </h3>
                    </div>
                  ) : soapNote ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border text-xs">
                        <span className="font-bold">Model: {soapNote.model_version}</span>
                        <span>Generated: {new Date(soapNote.generated_at).toLocaleString()}</span>
                      </div>

                      {/* S */}
                      <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/20 space-y-2">
                        <h4 className="font-black text-sm text-indigo-900">SUBJECTIVE</h4>
                        <p className="text-xs font-bold text-slate-800">Complaint: {soapNote.subjective?.chief_complaint}</p>
                        <p className="text-xs text-slate-700">{soapNote.subjective?.history_of_present_illness}</p>
                      </div>

                      {/* O */}
                      <div className="p-4 rounded-xl border border-cyan-100 bg-cyan-50/20 space-y-2">
                        <h4 className="font-black text-sm text-cyan-900">OBJECTIVE</h4>
                        <p className="text-xs text-slate-700">{soapNote.objective?.physical_observations}</p>
                      </div>

                      {/* A */}
                      <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/20 space-y-2">
                        <h4 className="font-black text-sm text-amber-900">ASSESSMENT</h4>
                        <p className="text-xs font-bold text-slate-900">Primary: {soapNote.assessment?.primary_diagnosis}</p>
                        <p className="text-xs text-slate-700">{soapNote.assessment?.clinical_impression}</p>
                      </div>

                      {/* P */}
                      <div className="p-4 rounded-xl border border-teal-100 bg-teal-50/20 space-y-2">
                        <h4 className="font-black text-sm text-teal-900">PLAN</h4>
                        <p className="text-xs text-slate-700">{soapNote.plan?.follow_up}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center space-y-3">
                      <p className="text-sm font-bold text-slate-700">No SOAP Note generated yet.</p>
                      <button
                        type="button"
                        onClick={handleGenerateSoap}
                        className="bg-teal-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md"
                      >
                        Generate with Gemini 3.1 Pro
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: VOICE HISTORY */}
              {activeTab === "voice" && (
                <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-sm p-6 space-y-4">
                  <h3 className="font-bold text-sm text-slate-800">Verbatim Kiosk Consultation Audio Transcripts</h3>
                  {selectedPatient.voice_history && selectedPatient.voice_history.length > 0 ? (
                    <div className="space-y-3">
                      {selectedPatient.voice_history.map((rec, i) => (
                        <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-mono">{new Date(rec.timestamp).toLocaleTimeString()}</span>
                            <span className="font-bold uppercase bg-slate-200 px-2 py-0.5 rounded text-[10px]">
                              {rec.language || "hi"}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900">&ldquo;{rec.text}&rdquo;</p>
                          {rec.translated_text && (
                            <p className="text-xs text-slate-600 italic">English Translation: {rec.translated_text}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-6 text-center">No voice recordings logged for this patient session.</p>
                  )}
                </div>
              )}

              {/* TAB 4: DOCUMENTS & FULL TIMELINE */}
              {activeTab === "documents" && (
                <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-sm p-6 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="font-bold text-sm text-slate-800">Uploaded Documents & Chronological History</h3>
                    <span className="text-xs bg-teal-100 text-teal-800 font-bold px-2.5 py-0.5 rounded-full">
                      {(selectedPatient.medical_timeline?.length || 0)} Records
                    </span>
                  </div>

                  {selectedPatient.medical_timeline && selectedPatient.medical_timeline.length > 0 ? (
                    <div className="space-y-4">
                      {selectedPatient.medical_timeline.map((item, idx) => {
                        const badge = getTypeBadge(item.document_type);
                        return (
                          <div
                            key={item.id || idx}
                            className={`rounded-xl border border-slate-200 p-4 border-l-4 ${badge.accent} space-y-2`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-black text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                                {item.document_year}
                              </span>
                              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${badge.bg}`}>
                                {item.document_type}
                              </span>
                            </div>
                            <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                            {item.key_findings && (
                              <ul className="space-y-1 text-xs text-slate-700">
                                {item.key_findings.map((f, fi) => (
                                  <li key={fi} className="flex items-start space-x-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                                    <span>{f}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-6 text-center">No historical records available.</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              <User className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold">Select a patient from the queue to review.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
