"use client";
import { useEffect } from "react";

export default function AntiSleep() {
  useEffect(() => {
    // Ping the backend every 5 minutes (300,000 ms) to prevent Render from sleeping
    const pingBackend = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        await fetch(`${apiUrl}/api/health`, { method: 'GET', cache: 'no-store' });
        console.log("Anti-sleep ping sent to backend.");
      } catch (e) {
        // Silent catch
      }
    };

    const interval = setInterval(pingBackend, 300000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
