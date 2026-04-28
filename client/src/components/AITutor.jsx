import { useState, useRef, useEffect } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const PLAN_RANK = { free: 0, pro: 1, premium: 2, teacher: 3, institute: 4, school: 4 };

/**
 * AI Tutor floating chat widget for CAT practice.
 *
 * Props:
 *   question   — current question text
 *   context    — passage/data context (optional)
 *   section    — "QA" | "LRDI" | "VARC"
 */
export default function AITutor({ question, context, section }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  const isPremium = (PLAN_RANK[user?.plan] ?? 0) >= PLAN_RANK["premium"];

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Reset conversation when question changes
  useEffect(() => {
    setMessages([]);
  }, [question]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!message.trim() || loading) return;

    const userMsg = message.trim();
    setMessage("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await api.post("/cat/tutor", {
        question: question || "General CAT question",
        context,
        section,
        message: userMsg,
      });
      const d = res.data.data;
      setMessages(prev => [...prev, { role: "tutor", data: d }]);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "PLAN_REQUIRED") {
        toast.error("AI Tutor requires Premium plan. Upgrade at Subscription.");
        setOpen(false);
      } else {
        const msg = err.normalized?.message || "AI Tutor is busy. Please retry.";
        setMessages(prev => [...prev, { role: "error", text: msg }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "Explain this solution step by step",
    "What is the shortcut trick?",
    "What concept is tested here?",
  ];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-4 sm:right-6 z-50 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-2xl shadow-xl transition-all text-sm font-semibold"
        title="Ask AI Tutor"
      >
        🤖 AI Tutor
        {!isPremium && <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">Premium</span>}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 sm:right-6 z-50 w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-indigo-100 flex flex-col" style={{ maxHeight: "70vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 rounded-t-2xl text-white">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <div>
            <p className="text-sm font-bold">AI Tutor</p>
            <p className="text-xs text-indigo-200">{section || "CAT"} Expert</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-xl leading-none">×</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {messages.length === 0 && (
          <div className="text-center py-4 text-gray-400 text-xs">
            <p className="text-2xl mb-2">🎓</p>
            <p>Ask me anything about this question!</p>
            <div className="mt-3 space-y-1.5">
              {quickPrompts.map(p => (
                <button
                  key={p}
                  onClick={() => { setMessage(p); }}
                  className="block w-full text-left text-xs bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl hover:bg-indigo-100 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%]">
                  {msg.text}
                </div>
              </div>
            );
          }
          if (msg.role === "error") {
            return (
              <div key={i} className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl">
                {msg.text}
              </div>
            );
          }
          const d = msg.data || {};
          return (
            <div key={i} className="space-y-2">
              {d.explanation && (
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 leading-relaxed">
                  <p className="font-semibold text-gray-900 mb-1">Step-by-Step</p>
                  {d.explanation}
                </div>
              )}
              {d.shortcut && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-800">
                  ⚡ <strong>Shortcut:</strong> {d.shortcut}
                </div>
              )}
              {d.concept && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-800">
                  💡 <strong>Concept:</strong> {d.concept}
                </div>
              )}
              {d.tips?.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-xs text-green-800 space-y-1">
                  <p className="font-semibold">Tips:</p>
                  {d.tips.map((t, j) => <p key={j}>• {t}</p>)}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            AI Tutor is thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="border-t border-gray-100 p-3 flex gap-2">
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={isPremium ? "Ask your doubt…" : "Premium required"}
          disabled={!isPremium || loading}
          className="flex-1 text-xs px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={!isPremium || !message.trim() || loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-2 rounded-xl disabled:opacity-50 transition-colors font-semibold"
        >
          Ask
        </button>
      </form>

      {!isPremium && (
        <div className="px-3 pb-3">
          <a
            href="/dashboard/subscription"
            className="block text-center text-xs bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2 rounded-xl font-semibold hover:opacity-90 transition"
          >
            Upgrade to Premium to unlock AI Tutor →
          </a>
        </div>
      )}
    </div>
  );
}
