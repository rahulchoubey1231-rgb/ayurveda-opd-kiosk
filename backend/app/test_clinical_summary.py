import json
import urllib.request
import urllib.error

url = "http://127.0.0.1:8000/generate-clinical-summary"
payload = {
    "patient_id": "UHID-2026-08941",
    "patient_name": "Rameshwar Dayal",
    "chat_history": [
        {
            "role": "user",
            "text": "Doctor sahab, mujhe 3 din se bahut tez bukhar hai aur pichle do din se seene mein dard aur saans lene mein takleef ho rahi hai.",
            "timestamp": "2026-09-04T07:07:15Z"
        },
        {
            "role": "model",
            "text": "Dard chhati mein kis taraf hai aur kya dard peeth ya baazu ki taraf jata hai?",
            "timestamp": "2026-09-04T07:07:25Z"
        },
        {
            "role": "user",
            "text": "Seene ke beech mein bhari pan hai, aur chalne par saans phoolti hai. Peeth mein nahi jata.",
            "timestamp": "2026-09-04T07:07:40Z"
        },
        {
            "role": "model",
            "text": "Kya aapko pehle se sugar, BP ya kisi dawai se allergy hai?",
            "timestamp": "2026-09-04T07:07:50Z"
        },
        {
            "role": "user",
            "text": "Haan, mujhe 5 saal se BP aur 8 saal se diabetes hai. Telmisartan aur Metformin leta hoon. Kisi dawai se allergy nahi hai.",
            "timestamp": "2026-09-04T07:08:05Z"
        },
        {
            "role": "model",
            "text": "Dhanyawad. Aap kripya kiosk par apna blood pressure aur oxygen check karein aur room 102 mein jayein.",
            "timestamp": "2026-09-04T07:08:15Z"
        }
    ],
    "ocr_text": "AIIMS NEW DELHI - OUTPATIENT PRESCRIPTION\nDate: 02-Sep-2026\nPatient: Rameshwar Dayal (68/M)\nDiagnosis: Essential Systemic Hypertension, Type 2 Diabetes Mellitus\nLabs: Fasting Blood Sugar: 168 mg/dL (Normal: 70-100 mg/dL), HbA1c: 8.2% (Normal: < 5.7%), SpO2: 95%, Blood Pressure: 148/94 mmHg\nRx:\n1. Tab. Telmisartan 40mg OD - Once daily in the morning after breakfast\n2. Tab. Metformin HCl 500mg BD - Twice daily after meals\n3. Syp. Ambroxol 30mg TID for cough\nReview after 30 days."
}

data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(
    url,
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=30) as response:
        status = response.getcode()
        body = response.read().decode("utf-8")
        parsed = json.loads(body)
        print("=== STATUS ===", status)
        print("=== CLINICAL SUMMARY JSON KEYS ===", list(parsed.keys()))
        print("\n1. Chief Complaint:\n", parsed.get("chief_complaint"))
        print("\n2. History of Present Illness (HPI):\n", parsed.get("history_of_present_illness"))
        print("\n3. Past Medical History:\n", parsed.get("past_medical_history"))
        print("\n4. Extracted Lab Values / Medications:\n", json.dumps(parsed.get("extracted_lab_values_medications"), indent=2))
        print("\n=== Model Version ===", parsed.get("model_version"))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.read().decode("utf-8"))
except Exception as e:
    print("General Error:", e)
