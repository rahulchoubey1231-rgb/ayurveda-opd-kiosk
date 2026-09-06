"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AbhaLoginScreen, { AbhaPatientProfile } from "@/components/AbhaLoginScreen";
import { usePatientSession } from "@/context/PatientSessionContext";

export default function LoginPage() {
  const router = useRouter();
  const { initializeSession } = usePatientSession();
  const [language, setLanguage] = useState<"hi" | "en">("hi");
  const [ultraContrast, setUltraContrast] = useState<boolean>(false);

  const handleLoginSuccess = async (patient: AbhaPatientProfile) => {
    // CRITICAL RULE: Only real patient data – zero fallbacks to hardcoded names.
    if (!patient.name || patient.name.trim().length === 0) {
      console.error("Login aborted: patient name is empty.");
      return;
    }

    const opdMode = patient.opd_mode || "allopathy";

    await initializeSession({
      full_name: patient.name.trim(),
      age: patient.age,
      gender: patient.gender,
      mobile: patient.mobile,
      abha_number: patient.abhaNumber,
      opd_mode: opdMode,
    });

    router.push("/triage");
  };

  return (
    <AbhaLoginScreen
      onLoginSuccess={handleLoginSuccess}
      ultraContrast={ultraContrast}
      onToggleContrast={() => setUltraContrast(!ultraContrast)}
      language={language}
      onToggleLanguage={() => setLanguage(language === "hi" ? "en" : "hi")}
    />
  );
}
