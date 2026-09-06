import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.firebase import initialize_firebase
from app.core.websocket_manager import ws_manager
from app.api.routes import router as api_router
from app.api.voice_routes import router as voice_router
from app.api.report_routes import router as report_router
from app.api.session_routes import router as session_router
from app.api.doctor_routes import (
    router as doctor_router,
    handle_generate_clinical_summary,
    GenerateClinicalSummaryRequest,
    handle_generate_summary,
    GenerateSummaryRequest,
)
from app.services.gemini_service import ClinicalSummary



logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("medikiosk.api")

from app.core.credentials_check import check_google_credentials

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: attempt to initialize Firebase and check Google Cloud credentials
    logger.info("Initializing %s...", settings.PROJECT_NAME)
    firebase_connected = initialize_firebase()
    if firebase_connected:
        logger.info("Firebase connected and ready.")
    else:
        logger.warning("Firebase not connected. Check your credentials in backend/.env.")

    # Check Google Cloud Speech & Dialogflow credentials
    cred_diag = check_google_credentials()
    if not cred_diag.get("is_configured"):
        logger.error(
            "❌ [Startup Check] GOOGLE_APPLICATION_CREDENTIALS not loaded: %s",
            cred_diag.get("error_message")
        )
    else:
        logger.info(
            "✅ [Startup Check] GOOGLE_APPLICATION_CREDENTIALS verified for project '%s'.",
            cred_diag.get("project_id")
        )

    yield
    # Shutdown
    logger.info("Shutting down %s...", settings.PROJECT_NAME)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root endpoint
@app.get("/")
def read_root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "docs_url": "/docs",
        "api_health": "/api/health",
        "voice_triage": "/api/voice/analyze-symptoms",
        "report_ocr_upload": "/api/reports/upload",
        "websocket_alerts": "/ws/alerts",
        "generate_clinical_summary": "/generate-clinical-summary"
    }

# Include API routes
app.include_router(api_router, prefix="/api")
app.include_router(session_router, prefix="/api/sessions", tags=["Patient Sessions & Intake"])
app.include_router(voice_router, prefix="/api/voice", tags=["Voice & Clinical Triage"])
app.include_router(report_router, prefix="/api/reports", tags=["Medical Report OCR & Analysis"])
app.include_router(doctor_router, prefix="/api/doctor", tags=["Doctor Dashboard & SOAP Triage"])

from app.api.ocr_routes import router as ocr_router
app.include_router(ocr_router, prefix="/api/ocr", tags=["Local OCR Scanning"])

# Dedicated Root Endpoint for /generate-clinical-summary
@app.post("/generate-clinical-summary", response_model=ClinicalSummary, tags=["Doctor Dashboard & SOAP Triage"])
async def generate_clinical_summary_root(request: GenerateClinicalSummaryRequest) -> ClinicalSummary:
    """
    Root Endpoint /generate-clinical-summary:
    When the voice conversation concludes, takes the full 'Chat History' and 'OCR Text from uploaded reports'.
    Synthesizes both using Gemini 1.5 Pro into a strictly formatted JSON response containing:
    1. Chief Complaint
    2. History of Present Illness (HPI)
    3. Past Medical History
    4. Extracted Lab Values / Medications
    Pushes this JSON to Firebase and live WebSocket so it instantly displays on the Doctor Dashboard UI.
    """
    return await handle_generate_clinical_summary(request)

# Dedicated Root Endpoint for /generate-summary
@app.post("/generate-summary", tags=["Doctor Dashboard & SOAP Triage"])
async def generate_summary_root(request: GenerateSummaryRequest):
    """
    Root Endpoint /generate-summary:
    Compiles conversation history + extracted OCR reports into a standardized SOAP note,
    pushes to Firestore queue for Doctor Dashboard, and generates OPD token details.
    """
    return await handle_generate_summary(request)

# WebSocket Live Alert Stream
@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    """
    Real-time WebSocket connection for doctor dashboards and monitoring terminals.
    Receives instant RED EMERGENCY ALERTS triggered by patient voice transcripts
    or severe triage indicators.
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning("WebSocket client disconnected or error: %s", e)
        ws_manager.disconnect(websocket)



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
