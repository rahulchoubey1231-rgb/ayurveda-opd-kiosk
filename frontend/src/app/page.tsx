"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePatientSession } from "@/context/PatientSessionContext";

export default function RootKioskPage() {
  const router = useRouter();
  const { isSessionActive, full_name, session_id } = usePatientSession();

  useEffect(() => {
    // If patient session is active and has authentic name, proceed to triage
    if (isSessionActive && full_name && session_id) {
      router.replace("/triage");
    } else {
      // Default entry point is intelligent ABHA Auth & Registration
      router.replace("/login");
    }
  }, [isSessionActive, full_name, session_id, router]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Connecting to MediKiosk AI Clinical Engine...</p>
      </div>
    </div>
  );
}
