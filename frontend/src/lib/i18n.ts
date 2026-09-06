export type Language = "en" | "hi";

export interface Translation {
  appTitle: string;
  hospitalName: string;
  appSubtitle: string;
  accreditationBadge: string;
  kioskId: string;
  kioskLocation: string;
  liveStatus: {
    queueNormal: string;
    doctorOnDuty: string;
    emergencyActive: string;
  };
  welcomeMessage: string;
  voiceInstruction: string;
  micIdle: string;
  micListening: string;
  micProcessing: string;
  micSuccess: string;
  transcriptLabel: string;
  confirmCheckIn: string;
  tryAgain: string;
  voicePromptSpoken: string;
  voicePromptSuccessSpoken: string;
  listenToGuide: string;
  highContrastLabel: string;
  fontSizeLabel: string;
  quickActionsTitle: string;
  actions: {
    abhaCheckIn: { title: string; desc: string; badge: string; wait: string };
    newPatient: { title: string; desc: string; badge: string; wait: string };
    doctorConsult: { title: string; desc: string; badge: string; wait: string };
    pharmacy: { title: string; desc: string; badge: string; wait: string };
    uploadReport: { title: string; desc: string; badge: string; wait: string };
    emergencyHelp: { title: string; desc: string; badge: string; wait: string };
  };
  keypadModal: {
    title: string;
    subtitle: string;
    placeholder: string;
    submit: string;
    cancel: string;
    clear: string;
    backspace: string;
  };
  ticketModal: {
    title: string;
    subtitle: string;
    hospitalHeader: string;
    tokenNumber: string;
    patientName: string;
    department: string;
    doctorAssigned: string;
    estimatedWait: string;
    queueAhead: string;
    printSlip: string;
    close: string;
  };
  staffMode: string;
  kioskOnline: string;
}

export const translations: Record<Language, Translation> = {
  en: {
    appTitle: "MediKiosk Hospital Terminal",
    hospitalName: "National Healthcare Institute • Smart Kiosk",
    appSubtitle: "Ayushman Bharat Digital Mission (ABHA) • Ministry of Health & Family Welfare",
    accreditationBadge: "NABH Accredited • Public Health Booth",
    kioskId: "TERMINAL #04",
    kioskLocation: "Main OPD Concourse, Ground Floor",
    liveStatus: {
      queueNormal: "OPD Queue Status: Normal (Avg Wait ~8 mins)",
      doctorOnDuty: "CMO on Duty: Dr. A. Sharma (Room 102)",
      emergencyActive: "Emergency & Casualty 24x7 Active",
    },
    welcomeMessage: "Self Check-in & Patient Registration",
    voiceInstruction: "Speak your Name, Mobile Number, or ABHA Health ID into the microphone below.",
    micIdle: "PRESS TO SPEAK",
    micListening: "LISTENING... PLEASE SPEAK",
    micProcessing: "ANALYZING VOICE INPUT...",
    micSuccess: "VOICE DETAILS CAPTURED",
    transcriptLabel: "Captured Patient Details:",
    confirmCheckIn: "CONFIRM & GENERATE OPD TOKEN",
    tryAgain: "SPEAK AGAIN",
    voicePromptSpoken: "Welcome to the Hospital Patient Check-in. Please press the large microphone in the center and clearly state your name, phone number, or symptoms.",
    voicePromptSuccessSpoken: "Thank you. Your details have been captured. Please tap confirm check in to generate your official OPD token slip.",
    listenToGuide: "Audio Guidance",
    highContrastLabel: "High Contrast",
    fontSizeLabel: "Text Size",
    quickActionsTitle: "Or select your hospital service directly:",
    actions: {
      abhaCheckIn: {
        title: "ABHA / Mobile Check-in",
        desc: "Check-in using your 10-digit phone number or ABHA ID",
        badge: "DIGITAL HEALTH",
        wait: "~5 mins wait",
      },
      newPatient: {
        title: "New OPD Registration",
        desc: "First time at this hospital? Register and get your patient card",
        badge: "NEW PATIENT",
        wait: "~8 mins wait",
      },
      doctorConsult: {
        title: "Doctor Consultation",
        desc: "Consult General Physician, Cardiologist, Orthopedic, or Pediatrician",
        badge: "GENERAL OPD",
        wait: "~10 mins wait",
      },
      pharmacy: {
        title: "Jan Aushadhi Pharmacy",
        desc: "Collect free prescribed medications from the hospital dispensary",
        badge: "DISPENSARY",
        wait: "~3 mins wait",
      },
      uploadReport: {
        title: "Upload Prescription / Report",
        desc: "Scan prescription with Vision OCR & extract medications with Gemini",
        badge: "AI VISION OCR",
        wait: "INSTANT SCAN",
      },
      emergencyHelp: {
        title: "Emergency / Trauma Care",
        desc: "Critical injury, severe pain, breathing difficulty, or chest pain",
        badge: "PRIORITY 1",
        wait: "IMMEDIATE (0 MIN)",
      },
    },
    keypadModal: {
      title: "Patient Phone / ABHA Number",
      subtitle: "Enter your 10-digit mobile number using the hospital touch pad.",
      placeholder: "e.g. 98765 43210",
      submit: "Verify & Print Token",
      cancel: "Cancel",
      clear: "Clear All",
      backspace: "Delete",
    },
    ticketModal: {
      title: "OPD Registration Token Issued",
      subtitle: "Please collect your printed slip below and proceed to the waiting concourse.",
      hospitalHeader: "NATIONAL HEALTHCARE INSTITUTE • OUTPATIENT DEPARTMENT",
      tokenNumber: "OPD TOKEN NUMBER",
      patientName: "Patient Name / ID",
      department: "Clinic / Room No.",
      doctorAssigned: "Attending Specialist",
      estimatedWait: "Est. Wait Time",
      queueAhead: "Patients Ahead",
      printSlip: "Print Official Slip",
      close: "Finish & Return to Home",
    },
    staffMode: "Staff & Hardware Telemetry",
    kioskOnline: "Kiosk Terminal Online",
  },
  hi: {
    appTitle: "मेडीकियोस्क अस्पताल टर्मिनल",
    hospitalName: "राष्ट्रीय स्वास्थ्य संस्थान • स्मार्ट कियोस्क",
    appSubtitle: "आयुष्मान भारत डिजिटल मिशन (ABHA) • स्वास्थ्य एवं परिवार कल्याण मंत्रालय",
    accreditationBadge: "NABH मान्यता प्राप्त • सार्वजनिक स्वास्थ्य केंद्र",
    kioskId: "टर्मिनल #04",
    kioskLocation: "मुख्य ओपीडी ब्लॉक, भूतल",
    liveStatus: {
      queueNormal: "ओपीडी कतार स्थिति: सामान्य (औसत प्रतीक्षा ~8 मिनट)",
      doctorOnDuty: "ड्यूटी पर मुख्य चिकित्सा अधिकारी: डॉ. ए. शर्मा (कमरा 102)",
      emergencyActive: "आपातकालीन एवं ट्रॉमा सेवा 24x7 सक्रिय",
    },
    welcomeMessage: "मरीज़ स्वयं चेक-इन एवं ओपीडी पंजीकरण",
    voiceInstruction: "नीचे दिए गए माइक्रोफ़ोन में अपना नाम, मोबाइल नंबर या बीमारी साफ़-साफ़ बोलें।",
    micIdle: "बोलने के लिए दबाएं",
    micListening: "सुन रहे हैं... कृपया बोलें",
    micProcessing: "आवाज़ की जांच हो रही है...",
    micSuccess: "मरीज़ की जानकारी दर्ज हुई",
    transcriptLabel: "दर्ज किया गया विवरण:",
    confirmCheckIn: "पुष्टि करें और ओपीडी टोकन लें",
    tryAgain: "फिर से बोलें",
    voicePromptSpoken: "अस्पताल मरीज़ चेक-इन में आपका स्वागत है। कृपया बीच में दिए गए बड़े माइक बटन को दबाएं और अपना नाम, फ़ोन नंबर या समस्या बताएं।",
    voicePromptSuccessSpoken: "धन्यवाद। आपकी जानकारी दर्ज हो गई है। कृपया ओपीडी टोकन पर्ची प्राप्त करने के लिए पुष्टि करें बटन दबाएं।",
    listenToGuide: "ऑडियो निर्देश",
    highContrastLabel: "हाई कंट्रास्ट",
    fontSizeLabel: "अक्षर आकार",
    quickActionsTitle: "या सीधे अपनी वांछित अस्पताल सेवा चुनें:",
    actions: {
      abhaCheckIn: {
        title: "आभा / फ़ोन नंबर से चेक-इन",
        desc: "अपने 10 अंकों के मोबाइल नंबर या आभा आईडी से तुरंत चेक-इन करें",
        badge: "डिजिटल हेल्थ",
        wait: "~5 मिनट प्रतीक्षा",
      },
      newPatient: {
        title: "नया ओपीडी पंजीकरण",
        desc: "अस्पताल में पहली बार आए हैं? नई मरीज़ पर्ची बनवाएं",
        badge: "नया मरीज़",
        wait: "~8 मिनट प्रतीक्षा",
      },
      doctorConsult: {
        title: "डॉक्टर परामर्श ओपीडी",
        desc: "सामान्य रोग, हृदय, हड्डी या बाल रोग विशेषज्ञ डॉक्टर से परामर्श",
        badge: "ओपीडी परामर्श",
        wait: "~10 मिनट प्रतीक्षा",
      },
      pharmacy: {
        title: "जन औषधि दवा वितरण",
        desc: "अस्पताल दवा काउंटर से डॉक्टर द्वारा लिखी गई मुफ़्त दवाएं प्राप्त करें",
        badge: "दवा काउंटर",
        wait: "~3 मिनट प्रतीक्षा",
      },
      uploadReport: {
        title: "दवा पर्ची / रिपोर्ट अपलोड करें",
        desc: "विजन ओसीआर से पर्ची स्कैन करें और जेमिनी से दवाइयाँ व बीमारी निकालें",
        badge: "एआई विजन ओसीआर",
        wait: "तुरंत स्कैन",
      },
      emergencyHelp: {
        title: "आपातकालीन / ट्रॉमा केयर",
        desc: "गंभीर चोट, असहनीय दर्द, सांस लेने में तकलीफ़ या छाती में दर्द",
        badge: "प्राथमिकता 1",
        wait: "तत्काल (0 मिनट)",
      },
    },
    keypadModal: {
      title: "मोबाइल नंबर / आभा आईडी",
      subtitle: "10 अंकों का मोबाइल नंबर दर्ज करने के लिए टच कीपैड का उपयोग करें।",
      placeholder: "उदा. 98765 43210",
      submit: "सत्यापित करें और टोकन लें",
      cancel: "रद्द करें",
      clear: "सब साफ़ करें",
      backspace: "मिटाएं",
    },
    ticketModal: {
      title: "ओपीडी टोकन पर्ची जारी",
      subtitle: "कृपया नीचे से अपनी मुद्रित पर्ची प्राप्त करें और प्रतीक्षालय में जाएं।",
      hospitalHeader: "राष्ट्रीय स्वास्थ्य संस्थान • बाह्य रोगी विभाग (OPD)",
      tokenNumber: "ओपीडी टोकन नंबर",
      patientName: "मरीज़ का नाम / आईडी",
      department: "विभाग / कमरा नंबर",
      doctorAssigned: "उपस्थित डॉक्टर",
      estimatedWait: "संभावित प्रतीक्षा समय",
      queueAhead: "आगे कुल मरीज़",
      printSlip: "पर्ची प्रिंट करें",
      close: "समाप्त करें और मुख्य पृष्ठ पर जाएं",
    },
    staffMode: "स्टाफ़ और हार्डवेयर स्थिति",
    kioskOnline: "कियोस्क टर्मिनल सक्रिय है",
  },
};
