import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File | null;
    const patientName = formData.get("patient_name") as string | null;

    if (!image) {
      return NextResponse.json({ detail: "No image file provided." }, { status: 400 });
    }

    // Read image buffer and convert to base64
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const mimeType = image.type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    // Return immediate success with mock extraction data, but preserving the image data
    return NextResponse.json({
      success: true,
      document: {
        id: "doc_" + Date.now(),
        document_date: new Date().toISOString().split('T')[0],
        document_type: "पूर्व पर्ची / लैब रिपोर्ट (Attached Record)",
        hospital_or_doctor: "अपलोड किया गया दस्तावेज़",
        fileUrl: dataUrl,
        summary: "मरीज़ द्वारा अपलोड किया गया मेडिकल दस्तावेज़ (डॉक्टर समीक्षा हेतु)",
        medications: [],
        key_findings: ["दस्तावेज़ डॉक्टर डैशबोर्ड पर देखने के लिए उपलब्ध है"]
      }
    });

  } catch (err: any) {
    console.error("OCR Bypass Route Error:", err);
    return NextResponse.json(
      { error: "Internal server error processing the document." },
      { status: 500 }
    );
  }
}
