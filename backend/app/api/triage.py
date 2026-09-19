from fastapi import APIRouter, Request, HTTPException
import os
import json
import logging
import google.generativeai as genai
from pydantic import BaseModel
from typing import List, Optional, Any

router = APIRouter()
logger = logging.getLogger("medikiosk.triage")

class Message(BaseModel):
    role: str
    content: str = ""

class TriageRequest(BaseModel):
    query: str = ""
    user_message: str = ""
    message: str = ""
    history: List[Message] = []
    messages: List[Message] = []
    conversation_history: List[Message] = []
    language_code: str = "hi-IN"

@router.post("/chat")
async def triage_chat(req: TriageRequest):
    try:
        message = req.message or req.user_message or req.query
        history = req.history or req.conversation_history or req.messages
        
        # Prepare chat history for gemini
        chat_history = []
        for h in history:
            role = "user" if h.role == "user" else "model"
            content = h.content
            if content:
                chat_history.append({"role": role, "parts": [{"text": content}]})
        
        user_message_count = sum(1 for h in chat_history if h["role"] == "user") + 1
        
        # STAGE 2: DURATION
        if user_message_count == 2:
            return {
                "reply": "यह समस्या आपको कितने समय से हो रही है?",
                "options": ["आज सुबह से", "2-3 दिनों से", "1 सप्ताह से", "काफ़ी लंबे समय से"],
                "isCompleted": False,
                "recommendedDept": "Kayachikitsa",
                "currentStep": 2
            }
            
        # STAGE 3: SEVERITY
        if user_message_count == 3:
            return {
                "reply": "तकलीफ की तीव्रता कैसी है और क्या यह लगातार बनी रहती है?",
                "options": ["हल्की / सहन करने लायक", "मध्यम", "काफ़ी तेज़ / गंभीर", "आती-जाती रहती है"],
                "isCompleted": False,
                "recommendedDept": "Kayachikitsa",
                "currentStep": 3
            }
            
        # STAGE 4: ASSOCIATED SYMPTOMS / COMPLETION
        if user_message_count >= 4:
            return {
                "reply": "आपकी सभी बातें रिकॉर्ड कर ली गई हैं। यदि आपके पास पुरानी कोई बीमारी की हिस्ट्री या डॉक्टर की पर्ची/रिपोर्ट है, तो कृपया नीचे दिए गए बटन से अपलोड करें।",
                "options": ["हाँ, पुरानी रिपोर्ट अपलोड करें", "नहीं, सीधे टोकन लें"],
                "isCompleted": True,
                "recommendedDept": "कायचिकित्सा (Kayachikitsa / General Medicine)",
                "currentStep": 4
            }
            
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return {
                "reply": "क्या आप मुझे अपनी मुख्य समस्या के बारे में और बता सकते हैं?",
                "options": ["मुझे बुखार है", "मेरे पेट में दर्द है", "मुझे सर्दी-खांसी है", "शरीर में दर्द है"],
                "isCompleted": False,
                "currentStep": 1
            }
            
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction="""You are an AI Clinical Triage Doctor for an Ayurveda Hospital. 
Acknowledge the user's primary complaint empathetically in short simple Hindi.
DO NOT ask about duration or severity yet. Just ask them to briefly explain their main trouble if they haven't.

Return EXACTLY valid JSON:
{
  "reply": "Empathetic acknowledgment in Hindi",
  "options": ["हाँ", "नहीं", "थोड़ा बहुत", "मुझे समझ नहीं आ रहा"],
  "isCompleted": false,
  "recommendedDept": "Kayachikitsa",
  "currentStep": 1
}"""
        )
        
        if len(chat_history) > 0 and chat_history[0]["role"] == "model":
            chat_history.insert(0, {"role": "user", "parts": [{"text": "नमस्ते"}]})
            
        chat = model.start_chat(history=chat_history)
        result = chat.send_message(message or "नमस्ते, मैं ओपीडी में डॉक्टर से मिलने आया हूँ")
        
        clean_json = result.text.replace('```json', '').replace('```', '').strip()
        data = json.loads(clean_json)
        data["currentStep"] = 1
        return data
        
    except Exception as e:
        logger.error(f"Triage Error: {e}")
        return {
            "reply": "क्या आप मुझे अपनी मुख्य समस्या के बारे में और बता सकते हैं?",
            "options": ["मुझे बुखार है", "मेरे पेट में दर्द है", "मुझे सर्दी-खांसी है", "शरीर में दर्द है"],
            "isCompleted": False,
            "currentStep": 1
        }
