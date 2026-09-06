# MediKiosk-SIH

A smart healthcare kiosk full-stack platform built for the Smart India Hackathon (SIH).

## Project Overview

- **Frontend (`/frontend`)**: [Next.js 16+](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/), and [Lucide Icons](https://lucide.dev/). Includes Firebase Client SDK (`firebase`) and interactive telemetry & status UI.
- **Backend (`/backend`)**: [Python FastAPI](https://fastapi.tiangolo.com/) with asynchronous REST endpoints, CORS middleware, [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) for Cloud Firestore integration, and safe local fallback demo mode.
- **Database**: [Google Cloud Firestore (Firebase)](https://firebase.google.com/docs/firestore).

---

## Architecture & Directory Structure

```text
MediKiosk-SIH/
├── frontend/                     # Next.js Frontend Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout
│   │   │   ├── page.tsx          # MediKiosk dashboard with Lucide icons & telemetry console
│   │   │   └── globals.css       # Tailwind CSS styles
│   │   └── lib/
│   │       └── firebase.ts       # Firebase Client SDK initialization & Firestore export
│   ├── .env.local.example        # Frontend environment template
│   ├── .env.local                # Local environment config
│   ├── package.json              # Next.js dependencies (lucide-react, firebase, etc.)
│   └── tsconfig.json             # TypeScript configuration
│
├── backend/                      # Python FastAPI Backend
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py         # Health checks, kiosk status, and Firestore write endpoints
│   │   ├── core/
│   │   │   ├── config.py         # Application settings and environment loaders
│   │   │   └── firebase.py       # Firebase Admin SDK initialization & Firestore db client
│   │   └── main.py               # FastAPI entry point & CORS configuration
│   ├── .venv/                    # Python virtual environment
│   ├── .env.example              # Backend environment template
│   ├── .env                      # Local backend environment config
│   └── requirements.txt          # Backend dependencies (fastapi, uvicorn, firebase-admin)
│
└── README.md                     # Documentation & setup guide
```

---

## Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18+ (tested with v24)
- **Python**: 3.10+ (tested with Python 3.14)

---

### 2. Running the FastAPI Backend

Open a terminal and navigate to `backend/`:

```powershell
cd backend
```

Activate the virtual environment:
- **Windows (PowerShell/CMD)**:
  ```powershell
  .venv\Scripts\activate
  ```
- **macOS / Linux**:
  ```bash
  source .venv/bin/activate
  ```

Start the FastAPI development server:
```powershell
python -m uvicorn app.main:app --reload --port 8000
```

- **API Root**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Swagger Interactive API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

### 3. Running the Next.js Frontend

In a separate terminal, navigate to `frontend/`:

```powershell
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Configuring Firebase Firestore

### Frontend (Client SDK)
1. Go to the [Firebase Console](https://console.firebase.google.com/) and open or create your project.
2. Go to **Project Settings > General > Your Apps > Add Web App**.
3. Copy the configuration credentials into `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

### Backend (Admin SDK)
1. In the Firebase Console, navigate to **Project Settings > Service accounts**.
2. Click **Generate new private key** to download a `.json` file.
3. Save this file inside `backend/` as `serviceAccountKey.json`.
4. Check that `backend/.env` references this file:
   ```env
   FIREBASE_CREDENTIALS_PATH="serviceAccountKey.json"
   FIREBASE_PROJECT_ID="your_project_id"
   ```
> *Note: If credentials are not yet added, the backend will automatically and gracefully run in demo mode without crashing.*

---

## Backend API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service root and link to `/docs` |
| `GET` | `/api/health` | Service health status and Firebase connection readiness |
| `GET` | `/api/kiosk/status` | Real-time kiosk hardware peripherals and system telemetry |
| `POST` | `/api/kiosk/test-db` | Tests writing a vitals record to Firestore |
