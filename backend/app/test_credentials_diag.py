import os
import sys
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("diag")

print("=================================================================")
print("=== MEDIKIOSK VOICE BOT CREDENTIAL & SERVICE DIAGNOSTIC CHECK ===")
print("=================================================================")

# 1. Check environment variables
cred_env = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
print(f"1. os.getenv('GOOGLE_APPLICATION_CREDENTIALS'): {cred_env!r}")

# 2. Check .env file
backend_dir = Path(__file__).resolve().parent.parent
env_file = backend_dir / ".env"
print(f"2. backend/.env file exists: {env_file.exists()} (path: {env_file})")

if env_file.exists():
    with open(env_file, "r", encoding="utf-8") as f:
        env_lines = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    print(f"   Variables in .env: {[l.split('=')[0] for l in env_lines]}")

# 3. Test Google Cloud Speech Client
print("\n--- Testing Google Cloud SpeechClient Initialization ---")
try:
    from google.cloud import speech
    client = speech.SpeechClient()
    print("SUCCESS: Google Cloud SpeechClient initialized successfully.")
except Exception as e:
    import traceback
    print("FAILED: SpeechClient initialization raised:")
    traceback.print_exc(file=sys.stdout)

# 4. Test Dialogflow SessionsClient
print("\n--- Testing Dialogflow SessionsClient Initialization ---")
try:
    from google.cloud import dialogflow_v2 as dialogflow
    df_client = dialogflow.SessionsClient()
    print("SUCCESS: Dialogflow SessionsClient initialized successfully.")
except Exception as e:
    import traceback
    print("FAILED: Dialogflow SessionsClient initialization raised:")
    traceback.print_exc(file=sys.stdout)

print("\n=================================================================")
