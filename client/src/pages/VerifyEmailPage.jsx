import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Verification link is incomplete.");
      return;
    }

    api.post("/auth/verify-email", { token })
      .then(() => {
        setStatus("success");
        setMessage("Your email has been verified. You can continue to the dashboard.");
      })
      .catch((err) => {
        const nextMessage = err?.response?.data?.error || "This verification link is invalid or expired.";
        setStatus("error");
        setMessage(nextMessage);
      });
  }, [params]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-gray-200 shadow-xl p-8 text-center">
        <div className="text-4xl mb-4">
          {status === "loading" ? "⏳" : status === "success" ? "✅" : "⚠️"}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Email Verification</h1>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">{message}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            to={status === "success" ? "/dashboard" : "/login"}
            className="rounded-xl bg-indigo-600 text-white font-semibold py-3 hover:bg-indigo-700 transition-colors"
          >
            {status === "success" ? "Go to Dashboard" : "Back to Login"}
          </Link>
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
            Return to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}