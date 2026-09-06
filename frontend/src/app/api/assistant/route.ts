import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message || body.user_message || body.query;
    const history = body.history || body.conversation_history || body.messages;
    const apiKey = (process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "").trim();

    if (!apiKey) {
      return NextResponse.json({ error: "API Key missing" }, { status: 500 });
    }

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
        reply: "यह समस्या कितने समय से है?",
        options: ["आज सुबह से", "2-3 दिनों से", "1 सप्ताह से", "1 महीने से अधिक"],
        isCompleted: false,
        recommendedDept: "Kayachikitsa"
      });
    }

    // STAGE 3: SEVERITY & NATURE
    if (userMessageCount === 3) {
      return NextResponse.json({
        reply: "तकलीफ कितनी तेज है और क्या यह लगातार बनी रहती है?",
        options: ["हल्की / सहन करने लायक", "मध्यम", "काफी तेज़ / गंभीर", "आती-जाती रहती है"],
        isCompleted: false,
        recommendedDept: "Kayachikitsa"
      });
    }

    // STAGE 4: COMPLETION
    if (userMessageCount >= 4) {
      return NextResponse.json({
        reply: "आपकी सभी बातें रिकॉर्ड कर ली गई हैं। यदि आपके पास पुरानी कोई बीमारी की हिस्ट्री या डॉक्टर की पर्ची/रिपोर्ट है, तो कृपया नीचे दिए गए बटन से अपलोड करें।",
        options: ["हाँ, पुरानी रिपोर्ट अपलोड करें", "नहीं, सीधे आगे बढ़ें"],
        isCompleted: true,
        recommendedDept: "Kayachikitsa"
      });
    }

    // STAGE 1 (or any fallback): Use Gemini to acknowledge the complaint
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      generationConfig: { responseMimeType: "application/json" },
      systemInstruction: `You are an AI Clinical Triage Doctor for an Ayurveda Hospital. 
Acknowledge the user's primary complaint empathetically in short simple Hindi/Hinglish.
DO NOT ask about duration or severity yet. Just ask them to briefly explain their main trouble if they haven't.

Return EXACTLY valid JSON:
{
  "reply": "Empathetic acknowledgment in Hindi",
  "options": ["तेज़ बुख़ार", "खांसी एवं जुकाम", "पेट में दर्द", "सिरदर्द या चक्कर"],
  "isCompleted": false,
  "recommendedDept": "Kayachikitsa"
}`
    });

    if (chatHistory.length > 0 && chatHistory[0].role === "model") {
      chatHistory.unshift({
        role: "user",
        parts: [{ text: "नमस्ते" }],
      });
    }

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(message || "नमस्ते, मुझे OPD सलाह की आवश्यकता है।");
    const cleanJson = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanJson);

    return NextResponse.json(data);

  } catch (err: any) {
    console.error("Triage Error:", err);
    // Bulletproof fallback so it doesn't loop
    return NextResponse.json({
      reply: "तकनीकी त्रुटि। कृपया आगे बढ़ने के लिए विकल्प चुनें।",
      options: ["आज सुबह से", "2-3 दिनों से", "1 सप्ताह से", "काफी लंबे समय से"],
      isCompleted: false
    });
  }
}
