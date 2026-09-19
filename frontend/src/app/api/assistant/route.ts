import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) : {};
    
    const message = body.message || body.user_message || body.query;
    const history = body.history || body.conversation_history || body.messages || [];
    const apiKey = (process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "").trim();

    const chatHistory = Array.isArray(history)
      ? history.map((h: any) => ({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.content || h.text || h.parts?.[0]?.text || "" }],
        })).filter((h: any) => h.parts[0].text !== "")
      : [];

    const userMessageCount = chatHistory.filter((h: any) => h.role === "user").length + 1;

    // DETERMINISTIC TRIAGE STATE MACHINE
    
    // STAGE 2: DURATION
    if (userMessageCount === 2) {
      return NextResponse.json({
        reply: "यह समस्या आपको कितने समय से हो रही है?",
        options: ["आज सुबह से", "2-3 दिनों से", "1 सप्ताह से", "काफ़ी लंबे समय से"],
        isCompleted: false,
        recommendedDept: "Kayachikitsa",
        currentStep: 2
      });
    }

    // STAGE 3: SEVERITY
    if (userMessageCount === 3) {
      return NextResponse.json({
        reply: "तकलीफ की तीव्रता कैसी है और क्या यह लगातार बनी रहती है?",
        options: ["हल्की / सहन करने लायक", "मध्यम", "काफ़ी तेज़ / गंभीर", "आती-जाती रहती है"],
        isCompleted: false,
        recommendedDept: "Kayachikitsa",
        currentStep: 3
      });
    }

    // STAGE 4: ASSOCIATED SYMPTOMS / COMPLETION
    if (userMessageCount >= 4) {
      return NextResponse.json({
        reply: "आपकी सभी बातें रिकॉर्ड कर ली गई हैं। यदि आपके पास पुरानी कोई बीमारी की हिस्ट्री या डॉक्टर की पर्ची/रिपोर्ट है, तो कृपया नीचे दिए गए बटन से अपलोड करें।",
        options: ["हाँ, पुरानी रिपोर्ट अपलोड करें", "नहीं, सीधे टोकन लें"],
        isCompleted: true,
        recommendedDept: "कायचिकित्सा (Kayachikitsa / General Medicine)",
        currentStep: 4
      });
    }

    if (!apiKey) {
        return NextResponse.json({
            reply: "क्या आप मुझे अपनी मुख्य समस्या के बारे में और बता सकते हैं?",
            options: ["मुझे बुखार है", "मेरे पेट में दर्द है", "मुझे सर्दी-खांसी है", "शरीर में दर्द है"],
            isCompleted: false,
            currentStep: 1
          });
    }

    // STAGE 1 (or any fallback): Use Gemini to acknowledge the complaint
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
      systemInstruction: `You are an AI Clinical Triage Doctor for an Ayurveda Hospital. 
Acknowledge the user's primary complaint empathetically in short simple Hindi.
DO NOT ask about duration or severity yet. Just ask them to briefly explain their main trouble if they haven't.

Return EXACTLY valid JSON:
{
  "reply": "Empathetic acknowledgment in Hindi",
  "options": ["हाँ", "नहीं", "थोड़ा बहुत", "मुझे समझ नहीं आ रहा"],
  "isCompleted": false,
  "recommendedDept": "Kayachikitsa",
  "currentStep": 1
}`
    });

    if (chatHistory.length > 0 && chatHistory[0].role === "model") {
      chatHistory.unshift({
        role: "user",
        parts: [{ text: "नमस्ते" }],
      });
    }

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(message || "नमस्ते, मैं ओपीडी में डॉक्टर से मिलने आया हूँ");
    const cleanJson = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanJson);
    data.currentStep = 1;

    return NextResponse.json(data);

  } catch (err: any) {
    console.error("Triage Error:", err);
    // Bulletproof deterministic fallback based on assumed history length 1 (since if parsing failed, we likely are at step 1 or it couldn't parse json)
    return NextResponse.json({
      reply: "क्या आप मुझे अपनी मुख्य समस्या के बारे में और बता सकते हैं?",
      options: ["मुझे बुखार है", "मेरे पेट में दर्द है", "मुझे सर्दी-खांसी है", "शरीर में दर्द है"],
      isCompleted: false,
      currentStep: 1
    });
  }
}
