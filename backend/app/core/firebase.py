import os
import logging
from pathlib import Path
from typing import Optional
import firebase_admin
from firebase_admin import credentials, firestore
from app.core.config import settings

logger = logging.getLogger("medikiosk.firebase")
_firestore_db = None
_is_initialized = False

def initialize_firebase() -> bool:
    """
    Initializes the Firebase Admin SDK using a service account key or application default credentials.
    Gracefully falls back to mock/uninitialized mode if credentials are not yet supplied.
    """
    global _firestore_db, _is_initialized
    
    if _is_initialized and _firestore_db is not None:
        return True

    # 1. Check custom path from settings / .env
    cred_path = settings.FIREBASE_CREDENTIALS_PATH
    if cred_path:
        full_path = Path(cred_path)
        if not full_path.is_absolute():
            # Relative to backend directory
            full_path = Path(__file__).resolve().parent.parent.parent / cred_path
        
        if full_path.exists():
            try:
                cred = credentials.Certificate(str(full_path))
                firebase_admin.initialize_app(cred, {
                    "projectId": settings.FIREBASE_PROJECT_ID or None
                } if settings.FIREBASE_PROJECT_ID else None)
                _firestore_db = firestore.client()
                _is_initialized = True
                logger.info("Firebase Admin initialized successfully using service account: %s", full_path)
                return True
            except Exception as e:
                logger.error("Failed to initialize Firebase with certificate at %s: %s", full_path, e)
        else:
            logger.warning("Firebase credentials path '%s' not found. Backend running in demo mode without live Firebase.", full_path)

    # 2. Check GOOGLE_APPLICATION_CREDENTIALS or default credentials
    if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        try:
            firebase_admin.initialize_app()
            _firestore_db = firestore.client()
            _is_initialized = True
            logger.info("Firebase Admin initialized successfully using GOOGLE_APPLICATION_CREDENTIALS.")
            return True
        except Exception as e:
            logger.error("Failed to initialize Firebase with GOOGLE_APPLICATION_CREDENTIALS: %s", e)

    logger.info("Firebase credentials not configured yet. Set FIREBASE_CREDENTIALS_PATH in backend/.env.")
    return False

def get_firestore_client():
    """
    Returns the Firestore client instance, or None if Firebase is not yet configured.
    """
    global _firestore_db
    if not _is_initialized:
        initialize_firebase()
    return _firestore_db

def is_firebase_initialized() -> bool:
    return _is_initialized
