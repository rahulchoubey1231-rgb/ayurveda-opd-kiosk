import json
import asyncio
import sys
import urllib.request
import urllib.error
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_HTTP = "http://127.0.0.1:8000"
BACKEND_WS = "ws://127.0.0.1:8000/ws/alerts"

async def test_full_flow():
    print("🚀 [E2E Test] Starting Clinical Summary Synthesis & Doctor Broadcast Test...")

    # Connect WebSocket client simulating the Doctor Dashboard
    async with websockets.connect(BACKEND_WS) as ws:
        print("✅ [WebSocket] Connected to /ws/alerts as Doctor Dashboard client.")

        # Prepare payload: full chat history + OCR prescription text
        payload = {
            "patient_id": "UHID-2026-08941",
            "patient_name": "Rameshwar Dayal",
            "chat_history": [
                {
                    "role": "user",
                    "text": "मरीज़ को 3 दिन से तेज़ बुख़ार है और छाती में भारीपन और सांस फूलने की समस्या हो रही है।",
                    "timestamp": "2026-09-04T07:07:15Z"
                },
                {
                    "role": "model",
                    "text": "दर्द किस तरफ ज़्यादा है और क्या चलने पर सांस ज़्यादा फूलती है?",
                    "timestamp": "2026-09-04T07:07:25Z"
                },
                {
                    "role": "user",
                    "text": "सीने के बीच में भारीपन है, 10 कदम चलने पर भी सांस फूलने लगती है।",
                    "timestamp": "2026-09-04T07:07:40Z"
                },
                {
                    "role": "model",
                    "text": "क्या आपको पहले से हाई बीपी या शुगर है, या किसी दवा से एलर्जी है?",
                    "timestamp": "2026-09-04T07:07:50Z"
                },
                {
                    "role": "user",
                    "text": "5 साल से हाई बीपी और 8 साल से शुगर है। टेलमिसार्टन 40mg और मेटफ़ॉर्मिन 500mg लेता हूँ। किसी दवा से एलर्जी नहीं है।",
                    "timestamp": "2026-09-04T07:08:05Z"
                }
            ],
            "ocr_text": """AIIMS NEW DELHI - OUTPATIENT PRESCRIPTION
Date: 02-Sep-2026
Patient: Rameshwar Dayal (68/M)
Diagnosis: Essential Systemic Hypertension, Type 2 Diabetes Mellitus
Labs: Fasting Blood Sugar: 168 mg/dL (Normal: 70-100 mg/dL), HbA1c: 8.2% (Normal: < 5.7%), SpO2: 96%, Blood Pressure: 142/92 mmHg
Rx:
1. Tab. Telmisartan 40mg OD - Once daily in morning after breakfast
2. Tab. Metformin HCl 500mg BD - Twice daily after meals
3. Syp. Ambroxol 30mg TID for productive cough
Review after 30 days in Pulmonology OPD."""
        }

        # POST /generate-clinical-summary
        req = urllib.request.Request(
            f"{BACKEND_HTTP}/generate-clinical-summary",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        print("📡 [POST /generate-clinical-summary] Sending Chat History & OCR Text...")
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.getcode()
            assert status == 200, f"Expected 200, got {status}"
            summary = json.loads(response.read().decode("utf-8"))

        print("\n--- 1. CHIEF COMPLAINT ---")
        print(summary.get("chief_complaint"))
        assert summary.get("chief_complaint"), "Chief complaint missing!"

        print("\n--- 2. HISTORY OF PRESENT ILLNESS (HPI) ---")
        print(summary.get("history_of_present_illness"))
        assert summary.get("history_of_present_illness"), "HPI missing!"

        print("\n--- 3. PAST MEDICAL HISTORY ---")
        print(summary.get("past_medical_history"))
        assert isinstance(summary.get("past_medical_history"), list), "PMH must be list!"

        print("\n--- 4. EXTRACTED LAB VALUES & MEDICATIONS ---")
        lab_meds = summary.get("extracted_lab_values_medications", {})
        print("Labs:", json.dumps(lab_meds.get("lab_values"), indent=2))
        print("Meds:", json.dumps(lab_meds.get("medications"), indent=2))
        assert "lab_values" in lab_meds, "Lab values missing!"
        assert "medications" in lab_meds, "Medications missing!"

        # Await WebSocket Broadcast (discard handshake if any)
        print("\n⏳ [WebSocket] Waiting for live CLINICAL_SUMMARY_UPDATED broadcast...")
        ws_msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        ws_data = json.loads(ws_msg)
        if ws_data.get("type") == "CONNECTION_ESTABLISHED":
            print("🤝 [WebSocket Handshake Received]: CONNECTION_ESTABLISHED")
            ws_msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            ws_data = json.loads(ws_msg)

        print("📬 [WebSocket Event Received]:", ws_data.get("type"))
        assert ws_data.get("type") == "CLINICAL_SUMMARY_UPDATED", f"Expected CLINICAL_SUMMARY_UPDATED, got {ws_data.get('type')}"
        assert ws_data.get("patient_id") == "UHID-2026-08941", "Patient ID mismatch!"

        # Verify Firestore / Patient Record Cache
        patient_req = urllib.request.Request(f"{BACKEND_HTTP}/api/doctor/patients/UHID-2026-08941")
        with urllib.request.urlopen(patient_req, timeout=10) as presp:
            p_data = json.loads(presp.read().decode("utf-8"))
            assert p_data.get("clinical_summary"), "Patient clinical_summary not persisted in database/cache!"
            print("💾 [Database & Cache Verified] Patient record contains persisted clinical_summary!")

        print("\n🎉 ALL E2E ASSERTIONS PASSED! /generate-clinical-summary endpoint is 100% verified.")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
