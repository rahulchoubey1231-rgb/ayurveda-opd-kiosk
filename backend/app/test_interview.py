import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
base_url = 'http://127.0.0.1:8000'


def run_test_scenario(lang_code, session_id, turns, label):
    print(f"\n======================================================================")
    print(f"=== {label} ===")
    print(f"======================================================================")

    # Reset session first
    reset_req = urllib.request.Request(
        f"{base_url}/api/voice/triage-interview/reset",
        data=json.dumps({"session_id": session_id}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(reset_req) as resp:
        reset_res = json.loads(resp.read().decode())
        print(f"🔄 Reset Response: {reset_res}")
        assert reset_res.get("chat_history_context") == [], "History context should be empty after reset"

    for i, user_msg in enumerate(turns, 1):
        print(f"\n--- Turn {i} ---")
        print(f"Patient: \"{user_msg}\"")
        payload = json.dumps({
            "query": user_msg,
            "session_id": session_id,
            "language_code": lang_code,
            "patient_name": "Rameshwar Dayal"
        }).encode()
        req = urllib.request.Request(
            f"{base_url}/api/voice/conversational-bot",
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            history = data.get("chat_history_context", [])
            print(f"AI Clinical Triage Expert:")
            print(f"  Phase: {data.get('phase')}")
            print(f"  Phase 1 Question Count: {data.get('question_count_in_phase_1')}")
            print(f"  Strict One-Question Rule Confirmed: {data.get('is_single_question_confirmed')}")
            print(f"  AI Question / Response: \"{data.get('fulfillment_text')}\"")
            print(f"  Interview Complete: {data.get('is_interview_complete')}")
            print(f"  Chat History Context Length: {len(history)} messages")

            # Assertions on Chat History Context
            expected_len = i * 2
            assert len(history) == expected_len, f"Expected {expected_len} items in chat_history_context, got {len(history)}"
            # Check last 2 entries
            user_entry = history[-2]
            model_entry = history[-1]
            assert user_entry["role"] == "user", f"Expected user role, got {user_entry['role']}"
            assert user_entry["text"] == user_msg, f"Expected user text '{user_msg}', got '{user_entry['text']}'"
            assert "timestamp" in user_entry, "User entry missing timestamp"
            assert model_entry["role"] == "model", f"Expected model role, got {model_entry['role']}"
            assert model_entry["text"] == data.get("fulfillment_text"), "Model entry text does not match fulfillment_text"
            assert "timestamp" in model_entry, "Model entry missing timestamp"

    # Verify dedicated context inspection endpoint
    print(f"\n🔍 Testing GET /api/voice/triage-interview/context/{session_id} ...")
    ctx_req = urllib.request.Request(f"{base_url}/api/voice/triage-interview/context/{session_id}")
    with urllib.request.urlopen(ctx_req) as resp:
        ctx_data = json.loads(resp.read().decode())
        assert ctx_data.get("success") is True
        assert ctx_data.get("session_id") == session_id
        assert len(ctx_data.get("chat_history_context", [])) == len(turns) * 2
        print(f"✅ Verified Chat History Context endpoint: {ctx_data.get('total_messages')} messages verified in session.")
        print(f"📜 Complete Chat History Context Flow:")
        for idx, entry in enumerate(ctx_data.get("chat_history_context", []), 1):
            role_tag = "🧑 USER" if entry["role"] == "user" else "🤖 AI  "
            print(f"   [{idx:02d}] {role_tag} ({entry['timestamp'][:19]}): {entry['text']}")


# Scenario 1: English Stomach Ache (Location -> Duration -> Food Intake -> PMH -> Conclusion)
en_turns = [
    "I have a stomach ache",
    "The pain is on the lower right side of my stomach",
    "It has been hurting since yesterday evening",
    "Yes, it became much worse right after eating dinner",
    "No drug allergies, but I have high blood pressure and take daily BP tablets"
]
run_test_scenario("en-IN", "test-session-en-001", en_turns, "ENGLISH STOMACH ACHE TRIAGE INTERVIEW")

# Scenario 2: Hindi Stomach Ache (स्थान -> अवधि -> भोजन -> पुरानी बीमारी -> निष्कर्ष)
hi_turns = [
    "मुझे बहुत तेज़ पेट में दर्द है",
    "दर्द पेट के निचले हिस्से में दाईं तरफ हो रहा है",
    "यह दर्द कल रात से हो रहा है",
    "हां, रात को मसालेदार खाना खाने के बाद दर्द और बढ़ गया था",
    "मुझे कोई एलर्जी नहीं है, लेकिन शुगर (डायबिटीज) की पुरानी बीमारी है"
]
run_test_scenario("hi-IN", "test-session-hi-001", hi_turns, "HINDI STOMACH ACHE TRIAGE INTERVIEW")

