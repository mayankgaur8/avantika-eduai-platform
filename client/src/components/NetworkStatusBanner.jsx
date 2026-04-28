import { useEffect, useState } from "react";

function getNetworkInfo() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return { slow: false, type: "unknown" };

  const slow = ["slow-2g", "2g", "3g"].includes(conn.effectiveType) || conn.saveData;
  return { slow, type: conn.effectiveType || "unknown" };
}

export default function NetworkStatusBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [slow, setSlow] = useState(getNetworkInfo().slow);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const onConnectionChange = () => setSlow(getNetworkInfo().slow);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    conn?.addEventListener?.("change", onConnectionChange);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      conn?.removeEventListener?.("change", onConnectionChange);
    };
  }, []);

  if (!offline && !slow) return null;

  return (
    <div className={`fixed top-0 inset-x-0 z-[60] text-white text-xs sm:text-sm py-2 px-4 text-center ${offline ? "bg-red-600" : "bg-amber-500"}`}>
      {offline
        ? "You are offline. Some features are unavailable until connection is restored."
        : "Slow network detected... requests may take longer than usual."}
    </div>
  );
}
