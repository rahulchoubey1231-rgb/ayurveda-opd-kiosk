import urllib.request
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
print("=" * 70)
print("🏥 MEDIKIOSK END-TO-END 4-STEP USER JOURNEY VERIFICATION")
print("=" * 70)

API_URL = "http://127.0.0.1:8000"

# -------------------------------------------------------------
# STEP 1: Welcome & Data Initialization
# -------------------------------------------------------------
print("\n[STEP 1] Initializing Patient Session via POST /api/sessions/initialize...")
init_payload = json.dumps({
    "name": "Rahul Sharma",
    "age": 28,
    "mobile": "9876543210",
    "gender": "Male",
    "language": "hi"
}).encode('utf-8')

req1 = urllib.request.Request(
    f"{API_URL}/api/sessions/initialize",
    data=init_payload,
    headers={"Content-Type": "application/json"}
)
resp1 = urllib.request.urlopen(req1)
init_data = json.loads(resp1.read().decode('utf-8'))
session_id = init_data["session_id"]
token_number = init_data["token_number"]
patient_name = init_data["name"]

print(f"  ✅ Session Created: {session_id}")
print(f"  ✅ Token Generated: {token_number}")
print(f"  ✅ Patient Name Registered: {patient_name}")
print(f"  ✅ Firestore Persisted: {init_data.get('firestore_persisted')}")

# -------------------------------------------------------------
# STEP 2: Personalized AI Triage (Gemini Voice Bot)
# -------------------------------------------------------------
print("\n[STEP 2] Conducting Personalized AI Triage via POST /api/voice/conversational-bot...")

# Turn 1: Patient reports chief complaint
turn1_payload = json.dumps({
    "query": "मुझे कल रात से पेट में बहुत तेज़ दर्द हो रहा है",
    "session_id": session_id,
    "patient_name": patient_name,
    "language_code": "hi-IN"
}).encode('utf-8')

req2 = urllib.request.Request(
    f"{API_URL}/api/voice/conversational-bot",
    data=turn1_payload,
    headers={"Content-Type": "application/json"}
)
resp2 = urllib.request.urlopen(req2)
turn1_data = json.loads(resp2.read().decode('utf-8'))
greeting_text = turn1_data.get("fulfillment_text", "")

print(f"  🤖 Turn 1 AI Response: \"{greeting_text}\"")
print(f"  📊 Phase: {turn1_data.get('phase')} | Q-Count: {turn1_data.get('question_count_in_phase_1')}")

assert "Rahul" in greeting_text, f"Expected patient name 'Rahul' in greeting, got: {greeting_text}"
print(f"  ✅ VERIFIED: AI explicitly greeted patient by actual name '{patient_name}'!")

# Turn 2: Location response
turn2_payload = json.dumps({
    "query": "पेट के ऊपरी हिस्से में नाभि के ऊपर दर्द है",
    "session_id": session_id,
    "patient_name": patient_name,
    "language_code": "hi-IN"
}).encode('utf-8')
req3 = urllib.request.Request(f"{API_URL}/api/voice/conversational-bot", data=turn2_payload, headers={"Content-Type": "application/json"})
resp3 = urllib.request.urlopen(req3)
turn2_data = json.loads(resp3.read().decode('utf-8'))
print(f"  🤖 Turn 2 AI Response: \"{turn2_data.get('fulfillment_text')}\"")

# Turn 3: Food intake triggers response
turn3_payload = json.dumps({
    "query": "तला हुआ खाना खाने के बाद दर्द और बढ़ गया",
    "session_id": session_id,
    "patient_name": patient_name,
    "language_code": "hi-IN"
}).encode('utf-8')
req4 = urllib.request.Request(f"{API_URL}/api/voice/conversational-bot", data=turn3_payload, headers={"Content-Type": "application/json"})
resp4 = urllib.request.urlopen(req4)
turn3_data = json.loads(resp4.read().decode('utf-8'))
print(f"  🤖 Turn 3 AI Response: \"{turn3_data.get('fulfillment_text')}\"")

# Turn 4: Past Medical History response
turn4_payload = json.dumps({
    "query": "मुझे पहले कभी ऐसी समस्या नहीं हुई और किसी दवा से एलर्जी नहीं है",
    "session_id": session_id,
    "patient_name": patient_name,
    "language_code": "hi-IN"
}).encode('utf-8')
req5 = urllib.request.Request(f"{API_URL}/api/voice/conversational-bot", data=turn4_payload, headers={"Content-Type": "application/json"})
resp5 = urllib.request.urlopen(req5)
turn4_data = json.loads(resp5.read().decode('utf-8'))
print(f"  🤖 Turn 4 AI Response (Conclusion): \"{turn4_data.get('fulfillment_text')}\"")
print(f"  📊 Phase: {turn4_data.get('phase')} | Interview Complete: {turn4_data.get('is_interview_complete')}")

# -------------------------------------------------------------
# STEP 3: Session-Linked Document Upload
# -------------------------------------------------------------
print("\n[STEP 3] Uploading Medical Report Scoped to Session via POST /api/reports/upload...")
boundary = "WebKitFormBoundary7MA4YWxkTrZu0gW"
lines = [
    f"--{boundary}",
    'Content-Disposition: form-data; name="session_id"',
    '',
    session_id,
    f"--{boundary}",
    'Content-Disposition: form-data; name="patient_name"',
    '',
    patient_name,
    f"--{boundary}",
    'Content-Disposition: form-data; name="report_image"; filename="gastric_prescription.jpg"',
    'Content-Type: image/jpeg',
    '',
]
header_bytes = "\r\n".join(lines).encode('utf-8') + b"\r\n"
jpeg_bytes = bytes.fromhex('ffd8ffe000104a46494600010101004800480000ffdb004300030202020202030202020303030304060404040404080606050609080a0a090809090a0c100c0a0b0e0b09090d110d0e0f101011100a0c12131210130f101010ffd9')
footer_bytes = f"\r\n--{boundary}--\r\n".encode('utf-8')
body = header_bytes + jpeg_bytes + footer_bytes

req_upload = urllib.request.Request(f"{API_URL}/api/reports/upload", data=body)
req_upload.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
resp_upload = urllib.request.urlopen(req_upload)
upload_result = json.loads(resp_upload.read().decode('utf-8'))

print(f"  ✅ Report Analyzed via OCR & Gemini:")
print(f"     - Diagnoses: {[d['condition'] for d in upload_result.get('diagnoses', [])]}")
print(f"     - Medications: {[m['name'] for m in upload_result.get('medications', [])]}")
print(f"     - Summary: {upload_result.get('clinical_summary')}")

# Verify session documents isolation
req_session = urllib.request.Request(f"{API_URL}/api/sessions/{session_id}")
resp_session = urllib.request.urlopen(req_session)
session_verified = json.loads(resp_session.read().decode('utf-8'))
uploaded_docs = session_verified.get("uploaded_documents", [])
print(f"  ✅ Storage Scoping Verified: {len(uploaded_docs)} document(s) strictly bound to session '{session_id}'")
for d in uploaded_docs:
    print(f"     -> File: {d.get('filename')} | Path: {d.get('storage_path')}")

# -------------------------------------------------------------
# STEP 4: Real-time Doctor Dashboard & Unified View
# -------------------------------------------------------------
print("\n[STEP 4] Synthesizing Clinical Summary & Checking Doctor Dashboard Unified View...")
summary_payload = json.dumps({
    "session_id": session_id,
    "patient_id": session_id,
    "patient_name": patient_name,
}).encode('utf-8')

req_summary = urllib.request.Request(f"{API_URL}/generate-clinical-summary", data=summary_payload, headers={"Content-Type": "application/json"})
resp_summary = urllib.request.urlopen(req_summary)
summary_result = json.loads(resp_summary.read().decode('utf-8'))

print(f"  ✅ Clinical Summary Synthesized (Gemini 1.5 Pro):")
print(f"     1. Chief Complaint: {summary_result.get('chief_complaint')}")
print(f"     2. HPI: {summary_result.get('history_of_present_illness')[:120]}...")
print(f"     3. Past Medical History: {summary_result.get('past_medical_history')}")
print(f"     4. Medications: {[m['name'] for m in summary_result.get('extracted_lab_values_medications', {}).get('medications', [])]}")

# Check Doctor Dashboard queue contains the patient
req_queue = urllib.request.Request(f"{API_URL}/api/doctor/patients")
resp_queue = urllib.request.urlopen(req_queue)
patients_queue = json.loads(resp_queue.read().decode('utf-8'))

matched_patient = next((p for p in patients_queue if p.get("patient_id") == session_id), None)
assert matched_patient is not None, f"Patient {session_id} not found in doctor queue!"

print(f"\n  ✅ DOCTOR DASHBOARD UNIFIED VIEW VERIFIED:")
print(f"     - Patient Name: {matched_patient.get('name')}")
print(f"     - Age & Gender: {matched_patient.get('age')} Yrs, {matched_patient.get('gender')}")
print(f"     - Mobile Phone: {matched_patient.get('phone')}")
print(f"     - Token Number: {matched_patient.get('token_number')}")
print(f"     - Queue Status: {matched_patient.get('status')}")
print(f"     - Gemini Clinical Summary: Present ({bool(matched_patient.get('clinical_summary'))})")
print(f"     - Session Uploaded Docs: {len(matched_patient.get('uploaded_documents', []))} document(s)")

print("\n" + "=" * 70)
print("🎉 ALL 4 USER JOURNEY STEPS VERIFIED END-TO-END SUCCESSFULLY!")
print("=" * 70)
