import { Link } from "react-router-dom";
import { useState } from "react";
import BrandLogo from "../components/BrandLogo";

const features = [
  { icon: "⚡", title: "Instant Generation", desc: "Generate complete question papers in under 30 seconds using OpenAI" },
  { icon: "🎯", title: "Board Aligned", desc: "Perfectly aligned with CBSE, ICSE, JEE, and NEET syllabi and patterns" },
  { icon: "📄", title: "PDF Export", desc: "Download professional PDF question papers ready for printing" },
  { icon: "✏️", title: "Edit & Customize", desc: "Edit any question, adjust marks, and reuse templates anytime" },
  { icon: "📊", title: "Analytics", desc: "Track quiz generation history and understand usage patterns" },
  { icon: "🏫", title: "Multi-Teacher", desc: "Institute plan supports multiple teachers under one account" },
];

const steps = [
  { step: "01", title: "Sign Up Free", desc: "Create your account in 30 seconds. No credit card required." },
  { step: "02", title: "Fill the Form", desc: "Select subject, class, board, difficulty, and question type." },
  { step: "03", title: "AI Generates", desc: "Our OpenAI-powered engine instantly creates a complete question paper with answers." },
  { step: "04", title: "Download PDF", desc: "Export as PDF and share with students immediately." },
];

const testimonials = [
  { name: "Priya Sharma", role: "Math Teacher, DPS Delhi", text: "I used to spend 2 hours making a question paper. Now it takes 2 minutes. Incredible!", avatar: "PS" },
  { name: "Rajesh Kumar", role: "Director, Apex Coaching", text: "Our institute generates 50+ papers daily. The JEE alignment is spot-on. Highly recommend!", avatar: "RK" },
  { name: "Anita Verma", role: "Science Teacher, KV Pune", text: "The CBSE pattern questions are exactly what NCERT expects. My students love the clarity.", avatar: "AV" },
];

const faqs = [
  { q: "Is Avantika EduAI aligned with CBSE 2024-25 syllabus?", a: "Yes! Our AI is trained on the latest CBSE, ICSE, JEE, and NEET syllabi and generates questions following current board patterns." },
  { q: "Can I edit questions after generation?", a: "Absolutely. Every generated question can be edited, deleted, or reused. Save as templates for future use." },
  { q: "How many quizzes can I generate on the free plan?", a: "The free plan includes 10 quizzes per month. Upgrade to Pro for unlimited generation." },
  { q: "Is the PDF export professional quality?", a: "Yes. PDFs include school name, watermark, proper formatting, and a separate answer key sheet." },
  { q: "Can multiple teachers use one account?", a: "Institute and School plans support multi-teacher access with separate login credentials." },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandLogo size="sm" />
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-indigo-600 transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-indigo-600 transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-indigo-600 transition-colors">Testimonials</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-1.5">Login</Link>
            <Link to="/signup" className="text-sm bg-indigo-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">Start Free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 bg-gradient-to-b from-indigo-50/50 to-white">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <span className="inline-block text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-4 py-1.5 rounded-full uppercase tracking-wider">
            Trusted by 500+ Schools & Coaching Institutes
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
            AI Powered Question Paper<br />
            <span className="text-indigo-600">Generator for Teachers</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Generate quizzes, assignments and exam papers in seconds.<br />
            CBSE · ICSE · JEE · NEET aligned. Export as PDF instantly.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 text-base">
              Start Free Trial →
            </Link>
            <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 font-semibold px-8 py-3.5 rounded-xl hover:bg-gray-50 transition-all border border-gray-200 text-base">
              ▶ View Demo
            </a>
          </div>
          <p className="text-sm text-gray-400">No credit card required · 10 free quizzes/month</p>

          {/* Hero Visual */}
          <div className="mt-12 max-w-3xl mx-auto rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400"/><div className="w-3 h-3 rounded-full bg-yellow-400"/><div className="w-3 h-3 rounded-full bg-green-400"/></div>
              <span className="text-xs text-gray-400 mx-auto">Avantika EduAI · Quiz Generator</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[["Subject", "Mathematics"], ["Class", "Grade 10"], ["Board", "CBSE"], ["Questions", "10 MCQ"]].map(([label, val]) => (
                  <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className="text-sm font-medium text-gray-800">{val}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {["Q1. What is the value of π to two decimal places? A) 3.12  B) 3.14  C) 3.16  D) 3.18",
                  "Q2. The sum of all angles in a triangle is...  A) 90°  B) 180°  C) 270°  D) 360°",
                ].map((q, i) => (
                  <div key={i} className="text-xs text-left bg-indigo-50 rounded-lg p-3 text-gray-700 font-mono">{q}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-indigo-600 text-white text-xs py-2 rounded-lg text-center font-medium">Download PDF</div>
                <div className="flex-1 bg-white border border-gray-200 text-gray-600 text-xs py-2 rounded-lg text-center font-medium">Save to Library</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-3 gap-4">
          {[
            { title: "For Students", desc: "Practice board-aligned quizzes with instant feedback.", cta: "Try Quiz Practice" },
            { title: "For Teachers", desc: "Generate quizzes, papers, and assignments in minutes.", cta: "Create First Quiz" },
            { title: "For Schools", desc: "Standardize content quality across departments and teachers.", cta: "Talk to Sales" },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-gray-200 p-5 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
              <Link to="/signup" className="inline-flex mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                {item.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Everything teachers need</h2>
            <p className="text-gray-500 mt-2">Powerful tools built specifically for Indian education</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="p-6 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all group">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-1.5">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">How it works</h2>
            <p className="text-gray-500 mt-2">Generate your first question paper in under 2 minutes</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <div key={s.step} className="relative">
                <div className="text-5xl font-black text-indigo-100 mb-3">{s.step}</div>
                <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
                <p className="text-sm text-gray-500">{s.desc}</p>
                {i < steps.length - 1 && <div className="hidden lg:block absolute top-6 left-full w-full h-0.5 bg-indigo-100 -translate-x-4" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Simple, transparent pricing</h2>
            <p className="text-gray-500 mt-2">Start free, upgrade when you need more</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Free", price: "₹0", period: "/month", features: ["10 quizzes/month", "MCQ & Short Answer", "Basic export", "Email support"], cta: "Start Free", highlight: false },
              { name: "Pro Teacher", price: "₹299", period: "/month", features: ["200 quizzes/month", "All question types", "PDF & Word export", "Assignment generator", "Priority support"], cta: "Start Pro", highlight: true },
              { name: "Institute", price: "₹999", period: "/month", features: ["Unlimited quizzes", "Multi-teacher access", "Question paper generator", "Analytics dashboard", "Dedicated support"], cta: "Contact Sales", highlight: false },
            ].map((plan) => (
              <div key={plan.name} className={`rounded-2xl p-6 border ${plan.highlight ? "border-indigo-500 bg-indigo-600 text-white shadow-xl shadow-indigo-200" : "border-gray-200"}`}>
                <div className={`text-sm font-semibold mb-1 ${plan.highlight ? "text-indigo-200" : "text-gray-500"}`}>{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? "text-indigo-200" : "text-gray-400"}`}>{plan.period}</span>
                </div>
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${plan.highlight ? "text-indigo-100" : "text-gray-600"}`}>
                      <span className={plan.highlight ? "text-indigo-200" : "text-indigo-500"}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/signup" className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-all ${plan.highlight ? "bg-white text-indigo-600 hover:bg-indigo-50" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Loved by teachers across India</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex gap-1 mb-3">{"★★★★★".split("").map((s, i) => <span key={i} className="text-yellow-400 text-sm">{s}</span>)}</div>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">{t.avatar}</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Frequently asked questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left font-medium text-gray-900 hover:bg-gray-50 transition-colors"
                >
                  {faq.q}
                  <span className="text-gray-400 ml-4 flex-shrink-0">{openFaq === i ? "−" : "+"}</span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-gray-500 leading-relaxed border-t border-gray-100 pt-3">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 px-4 sm:px-6 bg-indigo-600">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold text-white">Ready to save 10 hours every week?</h2>
          <p className="text-indigo-200">Join 500+ teachers already using Avantika EduAI to create better question papers faster.</p>
          <Link to="/signup" className="inline-block bg-white text-indigo-600 font-bold px-8 py-3.5 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg">
            Start Free Trial — No Credit Card Required
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-8">
          <div>
            <BrandLogo size="sm" className="mb-3 [&_span]:text-gray-200" />
            <p className="text-sm leading-relaxed">AI-powered question paper generator for Indian schools and coaching institutes.</p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3 text-sm">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><a href="#" className="hover:text-white transition-colors">API</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3 text-sm">Boards</h4>
            <ul className="space-y-2 text-sm">
              {["CBSE", "ICSE", "JEE", "NEET", "State Board"].map(b => <li key={b}>{b}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3 text-sm">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">About</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-gray-800 text-center text-xs">
          © 2024 Avantika EduAI. Made with ❤️ for Indian teachers.
        </div>
      </footer>
    </div>
  );
}
