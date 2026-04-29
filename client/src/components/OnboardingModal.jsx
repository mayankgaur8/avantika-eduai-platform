import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const STEPS = ["goal", "level", "weakAreas", "examDate"];

const GOALS = [
  { value: "CAT", label: "CAT / MBA Entrance", icon: "🎯", desc: "Preparing for CAT, XAT, SNAP, MAT" },
  { value: "School", label: "School Student", icon: "📚", desc: "CBSE / ICSE / State Board preparation" },
  { value: "Teacher", label: "Teacher / Educator", icon: "🏫", desc: "Creating quizzes and assignments" },
];

const LEVELS = [
  { value: "Beginner", label: "Beginner", icon: "🌱", desc: "Just starting out" },
  { value: "Intermediate", label: "Intermediate", icon: "📈", desc: "Comfortable with basics" },
  { value: "Advanced", label: "Advanced", icon: "🔥", desc: "Strong foundation, aiming high" },
];

const WEAK_AREAS = [
  { value: "QA", label: "Quantitative Aptitude", icon: "🔢" },
  { value: "LRDI", label: "Logical Reasoning & DI", icon: "🧩" },
  { value: "VARC", label: "Verbal Ability & RC", icon: "📖" },
];

const STEP_META = {
  goal:     { title: "What's your goal?", subtitle: "We'll personalise your experience around this." },
  level:    { title: "What's your current level?", subtitle: "This helps us set the right difficulty." },
  weakAreas:{ title: "Any weak areas?", subtitle: "Select all that apply — we'll prioritise these." },
  examDate: { title: "When is your exam?", subtitle: "We'll build a day-by-day plan around this date." },
};

function StepDots({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current ? "w-6 bg-indigo-600" : i < current ? "w-3 bg-indigo-300" : "w-3 bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingModal() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    goal: "",
    level: "",
    weakAreas: [],
    examDate: "",
  });
  const [saving, setSaving] = useState(false);

  if (!user || user.onboarding_completed) return null;

  const nextDestination = useMemo(() => {
    const selectedGoal = form.goal || user.goal;
    if (selectedGoal === "CAT") return "/dashboard/cat";
    if (selectedGoal === "Teacher") return "/dashboard/quiz";
    if (selectedGoal === "School") return "/dashboard/assignment";
    return "/dashboard";
  }, [form.goal, user.goal]);

  const currentStep = STEPS[step];
  const meta = STEP_META[currentStep];
  const today = new Date().toISOString().split("T")[0];

  const canAdvance = () => {
    if (currentStep === "goal")     return !!form.goal;
    if (currentStep === "level")    return !!form.level;
    if (currentStep === "weakAreas") return true; // optional
    if (currentStep === "examDate") return true;  // optional
    return true;
  };

  const toggleWeakArea = (v) => {
    setForm(f => ({
      ...f,
      weakAreas: f.weakAreas.includes(v)
        ? f.weakAreas.filter(a => a !== v)
        : [...f.weakAreas, v],
    }));
  };

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
      return;
    }
    // Final step — save
    setSaving(true);
    try {
      await updateProfile({
        goal: form.goal || null,
        level: form.level || null,
        weak_areas: form.weakAreas.length ? form.weakAreas : null,
        target_exam_date: form.examDate || null,
      });
      toast.success("Welcome! Your profile is set up.");
      navigate(nextDestination, { replace: true });
    } catch {
      toast.error("Couldn't save preferences — you can update them later.");
      // Mark onboarding complete locally to unblock the user
      await updateProfile({ goal: form.goal || "CAT" });
      navigate(nextDestination, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await updateProfile({ goal: form.goal || "CAT" });
      navigate(nextDestination, { replace: true });
    } catch { /* best-effort */ } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-2xl p-5 text-white text-center">
          <p className="text-xs font-bold tracking-widest uppercase text-indigo-200 mb-1">
            Quick Setup — Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-xl font-bold">{meta.title}</h2>
          <p className="text-sm text-indigo-200 mt-1">{meta.subtitle}</p>
        </div>

        <div className="p-5 sm:p-6">
          <StepDots current={step} />

          {/* Step: Goal */}
          {currentStep === "goal" && (
            <div className="space-y-2.5">
              {GOALS.map(g => (
                <button
                  key={g.value}
                  onClick={() => setForm(f => ({ ...f, goal: g.value }))}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    form.goal === g.value
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-100 hover:border-indigo-200 bg-gray-50"
                  }`}
                >
                  <span className="text-2xl flex-shrink-0">{g.icon}</span>
                  <div>
                    <p className={`font-semibold text-sm ${form.goal === g.value ? "text-indigo-700" : "text-gray-800"}`}>{g.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{g.desc}</p>
                  </div>
                  {form.goal === g.value && <span className="ml-auto text-indigo-500 text-lg">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Step: Level */}
          {currentStep === "level" && (
            <div className="space-y-2.5">
              {LEVELS.map(l => (
                <button
                  key={l.value}
                  onClick={() => setForm(f => ({ ...f, level: l.value }))}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    form.level === l.value
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-100 hover:border-indigo-200 bg-gray-50"
                  }`}
                >
                  <span className="text-2xl flex-shrink-0">{l.icon}</span>
                  <div>
                    <p className={`font-semibold text-sm ${form.level === l.value ? "text-indigo-700" : "text-gray-800"}`}>{l.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{l.desc}</p>
                  </div>
                  {form.level === l.value && <span className="ml-auto text-indigo-500 text-lg">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Step: Weak areas */}
          {currentStep === "weakAreas" && (
            <div className="space-y-2.5">
              {WEAK_AREAS.map(a => {
                const selected = form.weakAreas.includes(a.value);
                return (
                  <button
                    key={a.value}
                    onClick={() => toggleWeakArea(a.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      selected
                        ? "border-red-400 bg-red-50"
                        : "border-gray-100 hover:border-red-200 bg-gray-50"
                    }`}
                  >
                    <span className="text-2xl flex-shrink-0">{a.icon}</span>
                    <p className={`font-semibold text-sm ${selected ? "text-red-700" : "text-gray-800"}`}>{a.label}</p>
                    {selected && <span className="ml-auto text-red-500 text-lg">✓</span>}
                  </button>
                );
              })}
              <p className="text-xs text-gray-400 text-center pt-1">
                {form.weakAreas.length === 0 ? "None selected — that's fine!" : `${form.weakAreas.length} selected`}
              </p>
            </div>
          )}

          {/* Step: Exam date */}
          {currentStep === "examDate" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target exam / test date
                </label>
                <input
                  type="date"
                  min={today}
                  value={form.examDate}
                  onChange={e => setForm(f => ({ ...f, examDate: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <p className="text-xs text-gray-400 text-center">
                Optional — you can set this later in your study plan
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                ← Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={saving || !canAdvance()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                : step === STEPS.length - 1 ? "Let's Go! →" : "Next →"
              }
            </button>
          </div>

          <button
            onClick={handleSkip}
            disabled={saving}
            className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
          >
            Skip for now and continue to your workspace
          </button>
        </div>
      </div>
    </div>
  );
}
