import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger("medikiosk.credentials")

def check_google_credentials() -> Dict[str, Any]:
    """
    Validates GOOGLE_APPLICATION_CREDENTIALS configuration.
    Checks environment variable, settings, file existence, and JSON validity.
    Returns diagnostic details and logs error if credentials cannot be loaded.
    """
    raw_path = settings.GOOGLE_APPLICATION_CREDENTIALS or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    
    status: Dict[str, Any] = {
        "is_configured": False,
        "env_variable_set": bool(raw_path),
        "raw_path": raw_path,
        "resolved_path": None,
        "file_exists": False,
        "is_valid_json": False,
        "client_email": None,
        "project_id": None,
        "error_message": None,
    }

    if not raw_path:
        err_msg = (
            "GOOGLE_APPLICATION_CREDENTIALS is not set in environment or backend/.env. "
            "Google Cloud Speech-to-Text and Dialogflow API authentication will fail with DefaultCredentialsError."
        )
        logger.error("❌ [Credentials Check] %s", err_msg)
        status["error_message"] = err_msg
        return status

    # Check relative to backend directory or absolute
    backend_dir = Path(__file__).resolve().parent.parent.parent
    candidate_paths = [
        Path(raw_path),
        backend_dir / raw_path,
        backend_dir.parent / raw_path,
    ]

    resolved: Optional[Path] = None
    for p in candidate_paths:
        if p.exists() and p.is_file():
            resolved = p.resolve()
            break

    if not resolved:
        err_msg = (
            f"GOOGLE_APPLICATION_CREDENTIALS was set to '{raw_path}', but the file does not exist on disk. "
            f"Looked in: {[str(p) for p in candidate_paths]}"
        )
        logger.error("❌ [Credentials Check] %s", err_msg)
        status["error_message"] = err_msg
        return status

    status["file_exists"] = True
    status["resolved_path"] = str(resolved)
    # Ensure standard env var is updated with absolute path for google libraries
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(resolved)

    # Validate JSON content
    try:
        with open(resolved, "r", encoding="utf-8") as f:
            cred_data = json.load(f)
        status["is_valid_json"] = True
        status["project_id"] = cred_data.get("project_id")
        status["client_email"] = cred_data.get("client_email")
        cred_type = cred_data.get("type")

        if cred_type != "service_account":
            err_msg = f"Credentials file '{resolved}' has invalid type '{cred_type}', expected 'service_account'."
            logger.error("❌ [Credentials Check] %s", err_msg)
            status["error_message"] = err_msg
            return status

        status["is_configured"] = True
        logger.info(
            "✅ [Credentials Check] GOOGLE_APPLICATION_CREDENTIALS verified successfully: project_id='%s', client_email='%s', path='%s'",
            status["project_id"], status["client_email"], resolved
        )
        return status
    except json.JSONDecodeError as jde:
        err_msg = f"Failed to parse credentials file '{resolved}' as JSON: {jde}"
        logger.error("❌ [Credentials Check] %s", err_msg, exc_info=True)
        status["error_message"] = err_msg
        return status
    except Exception as ex:
        err_msg = f"Unexpected error reading credentials file '{resolved}': {ex}"
        logger.error("❌ [Credentials Check] %s", err_msg, exc_info=True)
        status["error_message"] = err_msg
        return status
