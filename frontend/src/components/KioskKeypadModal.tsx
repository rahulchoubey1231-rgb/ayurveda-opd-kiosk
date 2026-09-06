"use client";

import { useState } from "react";
import { X, Delete, CheckCircle2, Phone, RotateCcw, CreditCard, ShieldCheck } from "lucide-react";
import { Language, translations } from "@/lib/i18n";

interface KioskKeypadModalProps {
  isOpen: boolean;
  language: Language;
  ultraContrast: boolean;
  onClose: () => void;
  onSubmitNumber: (phoneNumber: string) => void;
}

export default function KioskKeypadModal({
  isOpen,
  language,
  ultraContrast,
  onClose,
  onSubmitNumber,
}: KioskKeypadModalProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const t = translations[language].keypadModal;

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (phoneNumber.length < 10) {
      setPhoneNumber((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPhoneNumber("");
  };

  const handleSubmit = () => {
    if (phoneNumber.length === 10) {
      onSubmitNumber(phoneNumber);
      onClose();
    }
  };

  const formatPhone = (val: string) => {
    if (val.length <= 5) return val;
    return `${val.slice(0, 5)} ${val.slice(5)}`;
  };

  const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden space-y-5 ${
          ultraContrast
            ? "bg-black text-white border-[#FFFF00]"
            : "bg-white text-slate-900 border-slate-200/90 shadow-[0_25px_60px_rgba(15,23,42,0.18)]"
        }`}
      >
        {/* Hospital Header Banner */}
        <div
          className={`p-6 border-b flex items-center justify-between ${
            ultraContrast
              ? "bg-[#111111] border-slate-800"
              : "bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-700 text-white"
          }`}
        >
          <div className="flex items-center space-x-3.5">
            <div
              className={`p-3 rounded-2xl ${
                ultraContrast ? "bg-[#FFFF00] text-black" : "bg-white/15 backdrop-blur-md text-white"
              }`}
            >
              <Phone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black">{t.title}</h2>
              <p
                className={`text-xs sm:text-sm font-medium ${
                  ultraContrast ? "text-slate-400" : "text-teal-100"
                }`}
              >
                {t.subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2.5 rounded-xl transition ${
              ultraContrast
                ? "bg-slate-800 hover:bg-slate-700 text-white"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Clinical Display Box */}
          <div
            className={`p-4 rounded-2xl border-2 text-center ${
              ultraContrast
                ? "bg-[#111111] border-[#FFFF00] text-[#FFFF00]"
                : "bg-slate-50 border-teal-200/80 text-teal-800"
            }`}
          >
            <div className="flex items-center justify-center space-x-2 text-sm font-bold text-slate-500 mb-1">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>ABHA / Verified Mobile Check-in (+91)</span>
            </div>
            <div className="text-3xl sm:text-4xl font-mono font-black tracking-widest min-h-[48px] flex items-center justify-center">
              {phoneNumber ? (
                formatPhone(phoneNumber)
              ) : (
                <span className="text-slate-300 font-normal text-2xl sm:text-3xl">
                  {t.placeholder}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 font-semibold">
              {phoneNumber.length}/10 {language === "hi" ? "अंक दर्ज" : "Digits entered"}
            </p>
          </div>

          {/* Hospital Touch Keypad */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {keypadKeys.map((key) => (
              <button
                key={key}
                onClick={() => handleDigit(key)}
                className={`h-16 sm:h-18 rounded-2xl font-black text-2xl sm:text-3xl flex items-center justify-center transition-all duration-150 transform active:scale-95 border ${
                  ultraContrast
                    ? "bg-[#222222] hover:bg-[#FFFF00] hover:text-black text-white border-white"
                    : "bg-slate-50 hover:bg-teal-50 text-slate-800 hover:text-teal-700 border-slate-200 hover:border-teal-300 shadow-sm"
                }`}
              >
                {key}
              </button>
            ))}

            {/* Clear Button */}
            <button
              onClick={handleClear}
              className={`h-16 sm:h-18 rounded-2xl font-bold text-sm sm:text-base flex flex-col items-center justify-center transition active:scale-95 border ${
                ultraContrast
                  ? "bg-transparent text-[#FFFF00] border-[#FFFF00]"
                  : "bg-slate-50 hover:bg-amber-50 text-amber-700 border-slate-200 hover:border-amber-300"
              }`}
            >
              <RotateCcw className="w-5 h-5 mb-0.5" />
              <span>{t.clear}</span>
            </button>

            {/* Zero Key */}
            <button
              onClick={() => handleDigit("0")}
              className={`h-16 sm:h-18 rounded-2xl font-black text-2xl sm:text-3xl flex items-center justify-center transition-all duration-150 transform active:scale-95 border ${
                ultraContrast
                  ? "bg-[#222222] hover:bg-[#FFFF00] hover:text-black text-white border-white"
                  : "bg-slate-50 hover:bg-teal-50 text-slate-800 hover:text-teal-700 border-slate-200 hover:border-teal-300 shadow-sm"
              }`}
            >
              0
            </button>

            {/* Delete / Backspace Button */}
            <button
              onClick={handleDelete}
              className={`h-16 sm:h-18 rounded-2xl font-bold text-sm sm:text-base flex flex-col items-center justify-center transition active:scale-95 border ${
                ultraContrast
                  ? "bg-transparent text-rose-400 border-rose-400"
                  : "bg-slate-50 hover:bg-rose-50 text-rose-600 border-slate-200 hover:border-rose-300"
              }`}
            >
              <Delete className="w-5 h-5 mb-0.5" />
              <span>{t.backspace}</span>
            </button>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              onClick={handleSubmit}
              disabled={phoneNumber.length !== 10}
              className={`w-full py-4 rounded-2xl font-black text-lg sm:text-xl uppercase tracking-wider flex items-center justify-center space-x-2.5 transition active:scale-95 shadow-md disabled:opacity-40 disabled:cursor-not-allowed ${
                ultraContrast
                  ? "bg-[#FFFF00] text-black border-4 border-black hover:bg-white"
                  : "bg-teal-600 hover:bg-teal-500 text-white shadow-[0_4px_16px_rgba(13,148,136,0.3)]"
              }`}
            >
              <CheckCircle2 className="w-6 h-6" />
              <span>{t.submit}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
