import asyncio
import json
import urllib.request
import urllib.error
import websockets
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws/alerts"

def test_endpoint(name, url, method="GET", headers=None, data=None):
    print(f"\n--- Testing [{name}]: {method} {url} ---")
    headers = headers or {}
    req_data = None
    if data:
        if isinstance(data, dict):
            req_data = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif isinstance(data, bytes):
            req_data = data

    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
            cors_origin = resp.headers.get("Access-Control-Allow-Origin", "None")
            print(f"Status: {status} OK | CORS Header: {cors_origin}")
            try:
                parsed = json.loads(body)
                print("Response Sample:", json.dumps(parsed, indent=2)[:350], "...")
                return True, parsed
            except Exception:
                print("Response Text:", body[:300])
                return True, body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        print(f"FAILED with HTTP {e.code}: {e.reason}")
        print("Error Body:", err_body[:400])
        return False, e.code
    except Exception as e:
        print(f"FAILED with exception: {e}")
        return False, str(e)

def test_cors_preflight(url):
    print(f"\n--- Testing CORS Preflight OPTIONS {url} ---")
    req = urllib.request.Request(
        url,
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type"
        },
        method="OPTIONS"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Preflight Status: {resp.status}")
            print(f"Allow-Origin: {resp.headers.get('Access-Control-Allow-Origin')}")
            print(f"Allow-Methods: {resp.headers.get('Access-Control-Allow-Methods')}")
            return True
    except Exception as e:
        print(f"Preflight FAILED: {e}")
        return False

def test_report_upload():
    print(f"\n--- Testing Multipart Report Upload: POST {BASE_URL}/api/reports/upload ---")
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    file_bytes = b"Sample simulated prescription image bytes with doctor note"
    part1 = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="report_image"; filename="prescription.jpg"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8")
    part2 = f"\r\n--{boundary}--\r\n".encode("utf-8")
    multipart_body = part1 + file_bytes + part2

    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Origin": "http://localhost:3000"
    }

    req = urllib.request.Request(
        f"{BASE_URL}/api/reports/upload",
        data=multipart_body,
        headers=headers,
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            print(f"Upload Status: {status} OK")
            print(f"Extracted Diagnoses: {[d.get('condition') for d in data.get('diagnoses', [])]}")
            print(f"Extracted Medications: {[m.get('name') for m in data.get('medications', [])]}")
            return True
    except Exception as e:
        print(f"Upload FAILED: {e}")
        return False

async def test_websocket_stream():
    print(f"\n--- Testing WebSocket Emergency & Clinical Broadcasts {WS_URL} ---")
    try:
        async with websockets.connect(WS_URL) as ws:
            print("WebSocket Connected! Sending trigger-emergency-test...")
            req = urllib.request.Request(
                f"{BASE_URL}/api/voice/trigger-emergency-test",
                data=json.dumps({
                    "patient_name": "Rameshwar Dayal",
                    "patient_id": "UHID-2026-08941",
                    "voice_transcript": "Chest pain and breathlessness severe attack"
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req) as resp:
                print(f"Trigger Status: {resp.status}")

            # Wait for WS message
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(msg)
            print(f"Received WS Message Type: {data.get('type')}")
            print(f"Patient in Alert: {data.get('patient_name')} ({data.get('patient_id')})")
            return True
    except Exception as e:
        print(f"WebSocket Test FAILED: {e}")
        return False

def main():
    print("=================================================================")
    print("      MEDIKIOSK FULL SYSTEM DIAGNOSTIC (BACKEND & FLOWS)         ")
    print("=================================================================")

    # 1. Health
    test_endpoint("Health Check", f"{BASE_URL}/api/health")

    # 2. CORS Preflights
    test_cors_preflight(f"{BASE_URL}/generate-clinical-summary")
    test_cors_preflight(f"{BASE_URL}/api/voice/conversational-bot")

    # 3. Report Upload & Parse
    test_report_upload()
    test_endpoint(
        "Report Parse Text",
        f"{BASE_URL}/api/reports/parse-text",
        method="POST",
        data={"text": "Patient Rameshwar Dayal. Diagnosed with Hypertension and Diabetes. Tab Telmisartan 40mg once daily."}
    )

    # 4. Voice Bot Hindi & English
    test_endpoint(
        "Conversational Voice Bot (Hindi)",
        f"{BASE_URL}/api/voice/conversational-bot",
        method="POST",
        data={"query": "मेरे पेट में बहुत दर्द है", "session_id": "diag-session-01", "language_code": "hi-IN"}
    )
    test_endpoint(
        "Conversational Voice Bot (English)",
        f"{BASE_URL}/api/voice/conversational-bot",
        method="POST",
        data={"query": "I have high fever and shivering since two days", "session_id": "diag-session-02", "language_code": "en-IN"}
    )

    # 5. Doctor Patients Queue
    test_endpoint("Doctor Patients List", f"{BASE_URL}/api/doctor/patients")
    test_endpoint("Doctor Single Patient", f"{BASE_URL}/api/doctor/patients/UHID-2026-08941")

    # 6. SOAP Note Generation
    test_endpoint(
        "Generate SOAP Note",
        f"{BASE_URL}/api/doctor/patients/UHID-2026-08941/soap-note",
        method="POST"
    )

    # 7. Generate Clinical Summary
    test_endpoint(
        "Generate Clinical Summary",
        f"{BASE_URL}/generate-clinical-summary",
        method="POST",
        data={
            "patient_id": "UHID-2026-08941",
            "patient_name": "Rameshwar Dayal",
            "chat_history": [
                {"role": "user", "text": "I have chest heaviness and fever for 3 days", "timestamp": "2026-09-04T07:07:15Z"},
                {"role": "model", "text": "Does it spread to your shoulder?", "timestamp": "2026-09-04T07:07:25Z"}
            ],
            "ocr_text": "AIIMS Prescription. Hypertension. Tab Telmisartan 40mg OD."
        }
    )

    # 8. WebSocket test
    asyncio.run(test_websocket_stream())

    print("\n=================================================================")
    print("                   DIAGNOSTIC TEST COMPLETE                      ")
    print("=================================================================")

if __name__ == "__main__":
    main()
