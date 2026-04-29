import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Link } from "react-router-dom";
import api from "../../../api/client";
import toast from "react-hot-toast";

const SECTION_COLORS = {
  VARC: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  LRDI: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  QA:   { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" },
};

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Pre-test screen ──────────────────────────────────────────────────────────

function PreTest({ onStart, loading, error }) {
  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link to="/dashboard/cat" className="hover:text-gray-600">← CAT Prep</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Mock Test</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 space-y-5">
        <div className="text-center">
          <div className="text-5xl mb-3">⏱️</div>
          <h1 className="text-xl font-bold text-gray-900">CAT Mock Test</h1>
          <p className="text-sm text-gray-500 mt-1">AI-generated full simulation</p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "Sections", value: "3" },
            { label: "Questions", value: "24" },
            { label: "Duration", value: "120 min" },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-3">
              <div className="text-lg font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800">Before you begin:</p>
          {[
            "You will have 120 minutes total (40 min/section).",
            "Marking: +3 for correct, −1 for wrong, 0 for unattempted.",
            "You can navigate between questions within a section.",
            "Once you submit, answers are revealed with explanations.",
            "The test generates fresh AI questions each time.",
          ].map((line, i) => (
            <p key={i} className="text-xs text-amber-700 flex gap-1.5">
              <span className="flex-shrink-0">•</span>{line}
            </p>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{error}</div>
        )}

        <button
          onClick={onStart}
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating Test (30–60s)…</>
          ) : (
            "Start Mock Test →"
          )}
        </button>
        {loading && (
          <p className="text-center text-xs text-gray-400">
            Building 3 sections in parallel… This takes 30–60 seconds.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Results screen ───────────────────────────────────────────────────────────

function Results({ result, questions }) {
  const [expandedId, setExpandedId] = useState(null);
  const statusColor = { correct: "text-green-600", wrong: "text-red-500", unattempted: "text-gray-400" };
  const statusBg = { correct: "bg-green-50 border-green-200", wrong: "bg-red-50 border-red-200", unattempted: "bg-gray-50 border-gray-200" };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Score card */}
      <div className="bg-gradient-to-br from-slate-800 to-indigo-900 rounded-2xl p-5 sm:p-7 text-white">
        <h2 className="text-lg font-bold mb-4">Test Complete 🎉</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Total Score", value: `${result.total_score}/${result.max_score}` },
            { label: "Est. Percentile", value: `~${result.percentile_estimate}th` },
            { label: "Accuracy", value: `${result.accuracy_percent}%` },
            { label: "Time Taken", value: formatTime(result.time_taken_seconds) },
          ].map(s => (
            <div key={s.label} className="bg-white/10 rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs text-slate-300 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(result.section_scores).map(([sec, s]) => (
            <div key={sec} className="bg-white/10 rounded-xl p-3">
              <div className="text-xs font-bold text-slate-300 mb-1">{sec}</div>
              <div className="text-base font-bold">{s.score}/{s.max_score}</div>
              <div className="text-xs text-slate-300">{s.correct}✓ {s.wrong}✗ {s.unattempted}—</div>
            </div>
          ))}
        </div>
      </div>

      {/* Question-wise review */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Detailed Review</h3>
        <div className="space-y-2">
          {result.question_results.map((qr, i) => {
            const q = questions.find(q => q.id === qr.id);
            const c = SECTION_COLORS[qr.section];
            return (
              <div key={qr.id} className={`bg-white rounded-xl border ${statusBg[qr.status]} p-3`}>
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-xs font-bold flex items-center justify-center text-gray-600">
                      {i + 1}
                    </span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>{qr.section}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 leading-snug line-clamp-2">{q?.question}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs font-semibold ${statusColor[qr.status]}`}>
                        {qr.status === "correct" ? "✓ Correct" : qr.status === "wrong" ? "✗ Wrong" : "— Skipped"}
                      </span>
                      {qr.given_answer && <span className="text-xs text-gray-400">You: {qr.given_answer}</span>}
                      <span className="text-xs text-gray-400">Ans: {qr.correct_answer}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedId(expandedId === qr.id ? null : qr.id)}
                    className="flex-shrink-0 text-xs text-indigo-600 hover:underline"
                  >
                    {expandedId === qr.id ? "Hide" : "Explain"}
                  </button>
                </div>
                {expandedId === qr.id && (
                  <div className="mt-3 space-y-2 pl-9">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-gray-700">
                      <strong>Explanation:</strong> {qr.explanation}
                    </div>
                    {qr.shortcut && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                        ⚡ <strong>Shortcut:</strong> {qr.shortcut}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 pb-4">
        <Link to="/dashboard/cat" className="flex-1 text-center border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors">
          ← Back to CAT Hub
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Take Another Mock
        </button>
      </div>
    </div>
  );
}

// ── Main test screen ─────────────────────────────────────────────────────────

const SECTION_DURATION = 40 * 60; // 40 min per section

// Question palette status: unattempted | visited | answered | marked
function getQStatus(qId, answers, visited, marked) {
  if (marked.has(qId)) return "marked";
  if (answers[qId])    return "answered";
  if (visited.has(qId)) return "visited";
  return "unattempted";
}

const Q_PALETTE_STYLE = {
  unattempted: "bg-white text-gray-500 border border-gray-200",
  visited:     "bg-orange-50 text-orange-600 border border-orange-300",
  answered:    "bg-green-100 text-green-700 border border-green-400",
  marked:      "bg-purple-100 text-purple-700 border border-purple-400",
};

// ── Submit Summary Modal ─────────────────────────────────────────────────────

function SubmitModal({ sections, questions, answers, marked, onConfirm, onCancel, submitting }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Submit Test?</h3>
        <div className="space-y-2">
          {sections.map(s => {
            const qs = s.question_ids.map(id => questions.find(q => q.id === id)).filter(Boolean);
            const answered = s.question_ids.filter(id => answers[id]).length;
            const markedCount = s.question_ids.filter(id => marked.has(id)).length;
            const unanswered = qs.length - answered;
            return (
              <div key={s.name} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-700 w-14">{s.name}</span>
                <div className="flex gap-3 text-xs">
                  <span className="text-green-600 font-medium">{answered} answered</span>
                  {unanswered > 0 && <span className="text-gray-400">{unanswered} skipped</span>}
                  {markedCount > 0 && <span className="text-purple-600">{markedCount} marked</span>}
                </div>
              </div>
            );
          })}
        </div>
        {marked.size > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ {marked.size} question{marked.size > 1 ? "s" : ""} marked for review will be submitted as-is.
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Continue Test
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting
              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
              : "Submit Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CATMockTest() {
  const [phase, setPhase] = useState("pre"); // pre | test | submitting | results
  const [testData, setTestData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [visited, setVisited] = useState(new Set());   // question ids visited
  const [marked, setMarked] = useState(new Set());     // marked for review
  const [currentSection, setCurrentSection] = useState(0);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  // Per-section timers (each section 40 min)
  const [sectionTimers, setSectionTimers] = useState([SECTION_DURATION, SECTION_DURATION, SECTION_DURATION]);
  const [sectionLocked, setSectionLocked] = useState([false, false, false]);
  const [startTime, setStartTime] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const submitRef = useRef(null); // avoid stale closure in timer

  // Anti-copy: disable right-click and copy/paste during test
  useEffect(() => {
    if (phase !== "test") return;
    const prevent = (e) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
    };
  }, [phase]);

  // Per-section countdown
  useEffect(() => {
    if (phase !== "test") return;
    timerRef.current = setInterval(() => {
      setSectionTimers(prev => {
        const next = [...prev];
        if (next[currentSection] <= 1) {
          // Lock this section and auto-advance
          setSectionLocked(sl => {
            const nsl = [...sl];
            nsl[currentSection] = true;
            return nsl;
          });
          next[currentSection] = 0;
          // Move to next unlocked section, or submit
          const nextSection = currentSection + 1;
          if (nextSection < 3) {
            setCurrentSection(nextSection);
            setCurrentQIndex(0);
          } else {
            // All sections done — auto-submit
            submitRef.current?.();
          }
        } else {
          next[currentSection] -= 1;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, currentSection]);

  const startTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/cat/mock/start", {}, { timeout: 120000 });
      setTestData(res.data.data);
      setSectionTimers([SECTION_DURATION, SECTION_DURATION, SECTION_DURATION]);
      setSectionLocked([false, false, false]);
      setStartTime(Date.now());
      setPhase("test");
      toast.success("Mock test started! Good luck 🎯");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to generate mock test. Please retry.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = useCallback(async () => {
    if (phase === "submitting" || phase === "results") return;
    clearInterval(timerRef.current);
    setPhase("submitting");
    const timeTaken = startTime ? Math.floor((Date.now() - startTime) / 1000) : 7200;
    try {
      const res = await api.post("/cat/mock/submit", {
        attempt_id: testData.attempt_id,
        answers,
        time_taken_seconds: timeTaken,
      });
      setResult(res.data.data);
      setPhase("results");
    } catch (err) {
      toast.error("Submit failed. Please try again.");
      setPhase("test");
    }
  }, [phase, answers, testData, startTime]);

  // Keep submit ref current
  useEffect(() => { submitRef.current = handleSubmit; }, [handleSubmit]);

  if (phase === "pre") return <PreTest onStart={startTest} loading={loading} error={error} />;
  if (phase === "results") return <Results result={result} questions={testData?.questions || []} />;

  const sections = testData?.config?.sections || [];

  const section = sections[currentSection];
  const sectionQIds = section?.question_ids || [];
  const sectionQs = sectionQIds.map(id => testData.questions.find(q => q.id === id)).filter(Boolean);
  const currentQ = sectionQs[currentQIndex];
  const sectionAnsCount = sectionQIds.filter(id => answers[id]).length;
  const totalAns = Object.keys(answers).length;
  const totalQs = testData?.questions?.length || 0;
  const c = SECTION_COLORS[section?.name] || SECTION_COLORS.QA;
  const timeLeft = sectionTimers[currentSection];
  const timerWarning = timeLeft < 120; // last 2 min of section

  // Mark question as visited when displayed
  useEffect(() => {
    if (currentQ) {
      setVisited(prev => new Set(prev).add(currentQ.id));
    }
  }, [currentQ?.id]);

  const toggleMark = () => {
    if (!currentQ) return;
    setMarked(prev => {
      const n = new Set(prev);
      n.has(currentQ.id) ? n.delete(currentQ.id) : n.add(currentQ.id);
      return n;
    });
  };

  const switchSection = (i) => {
    if (sectionLocked[i]) { toast.error("This section's time has ended and is now locked."); return; }
    setCurrentSection(i);
    setCurrentQIndex(0);
  };

  return (
    <Fragment>
    {showSubmitModal && (
      <SubmitModal
        sections={sections}
        questions={testData?.questions || []}
        answers={answers}
        marked={marked}
        submitting={phase === "submitting"}
        onConfirm={() => { setShowSubmitModal(false); handleSubmit(); }}
        onCancel={() => setShowSubmitModal(false)}
      />
    )}
    <div className="max-w-3xl mx-auto space-y-3">
      {/* Top bar: section timer + section tabs + submit */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-4 flex flex-wrap items-center gap-3">
        <div className={`text-lg font-mono font-bold tabular-nums flex-shrink-0 ${timerWarning ? "text-red-600 animate-pulse" : "text-gray-900"}`}>
          {timerWarning && "⚠️ "}{formatTime(timeLeft)}
        </div>
        <div className="flex gap-1 flex-1 overflow-x-auto">
          {sections.map((s, i) => {
            const sc = SECTION_COLORS[s.name];
            const locked = sectionLocked[i];
            return (
              <button
                key={s.name}
                onClick={() => switchSection(i)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  locked
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : i === currentSection
                    ? `${sc.bg} ${sc.text} ${sc.border}`
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:border-indigo-200"
                }`}
              >
                {locked ? "🔒" : null} {s.name}
                <span className="ml-1 opacity-60">
                  {s.question_ids.filter(id => answers[id]).length}/{s.question_ids.length}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowSubmitModal(true)}
          disabled={phase === "submitting"}
          className="flex-shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
        >
          {phase === "submitting" ? "Submitting…" : "Submit Test"}
        </button>
      </div>

      {/* Question palette */}
      <div className={`${c.bg} rounded-xl border ${c.border} p-3`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-600">{section?.label}</p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-400 inline-block" /> Answered
            <span className="w-3 h-3 rounded bg-orange-50 border border-orange-300 inline-block" /> Visited
            <span className="w-3 h-3 rounded bg-purple-100 border border-purple-400 inline-block" /> Marked
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sectionQs.map((q, i) => {
            const status = getQStatus(q.id, answers, visited, marked);
            return (
              <button
                key={q.id}
                onClick={() => setCurrentQIndex(i)}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                  i === currentQIndex ? "ring-2 ring-indigo-500 ring-offset-1 " : ""
                }${Q_PALETTE_STYLE[status]}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2">{sectionAnsCount}/{sectionQs.length} answered · {marked.size} marked for review</p>
      </div>

      {/* Current question */}
      {currentQ && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          {currentQ.group_context && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-sm text-gray-700 leading-relaxed max-h-44 overflow-y-auto select-none">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                {currentQ.question_group || "Passage / Data"}
              </p>
              {currentQ.group_context}
            </div>
          )}

          <div className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
              {currentQIndex + 1}
            </span>
            <div className="flex-1">
              <p className="text-gray-900 font-medium text-sm leading-relaxed mb-4 select-none">
                {currentQ.question}
              </p>
              <div className="space-y-2">
                {currentQ.options?.map((opt, j) => {
                  const letter = opt.charAt(0);
                  const isSelected = answers[currentQ.id] === letter;
                  return (
                    <button
                      key={j}
                      onClick={() => setAnswers(prev => {
                        const next = { ...prev };
                        if (isSelected) delete next[currentQ.id];
                        else next[currentQ.id] = letter;
                        return next;
                      })}
                      className={`w-full text-left text-sm px-4 py-3 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600 font-medium"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {currentQ.time_estimate_seconds && (
                <p className="text-xs text-gray-400 mt-3">⏱ ~{currentQ.time_estimate_seconds}s · +{currentQ.marks} / −{currentQ.negative_marks}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom nav */}
      <div className="sticky bottom-4 bg-white/90 backdrop-blur rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
        <button
          disabled={currentQIndex === 0}
          onClick={() => setCurrentQIndex(i => i - 1)}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          ← Prev
        </button>

        <button
          onClick={toggleMark}
          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            currentQ && marked.has(currentQ.id)
              ? "bg-purple-100 text-purple-700 border-purple-300"
              : "bg-gray-50 text-gray-500 border-gray-200 hover:border-purple-300"
          }`}
        >
          {currentQ && marked.has(currentQ.id) ? "🔖 Marked" : "🔖 Mark"}
        </button>

        <span className="text-xs text-gray-400 font-mono">
          {currentQIndex + 1}/{sectionQs.length}
        </span>

        {currentQIndex < sectionQs.length - 1 ? (
          <button
            onClick={() => setCurrentQIndex(i => i + 1)}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Next →
          </button>
        ) : currentSection < sections.length - 1 ? (
          <button
            onClick={() => switchSection(currentSection + 1)}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Next Section →
          </button>
        ) : (
          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
          >
            Submit →
          </button>
        )}
      </div>
    </div>
    </Fragment>
  );
}
