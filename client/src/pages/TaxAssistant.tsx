import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
type TaxPeriod = { id: number; taxYear: number; filingDeadline: string; extensionDeadline: string; status: string; notes: string | null };
type TaxQuestion = { id: number; questionKey: string; category: string; questionText: string; helpText: string | null; inputType: string; options: Array<{ value: string; label: string; helpText?: string }> | null; isRequired: boolean; dependsOnKey: string | null; dependsOnVal: string | null; sortOrder: number; appliesToIndividual: boolean; appliesToBusiness: boolean };
type FederalForm = { id: number; formNumber: string; title: string; description: string; category: string; subcategory: string | null; whoFiles: string; providedBy: string | null; filingMethods: string[]; irsUrl: string | null; instructionsUrl: string | null };
type RequiredForm = { formSource: string; formNumber: string; priority: string; note: string | null; formDetails?: FederalForm };
type Session = { id: string; taxYear: number; entityType: string; answers: Record<string, string>; requiredForms: RequiredForm[] | null; status: string };

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
  ["DC","District of Columbia"],
];

const PRIORITY_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  required: { bg: "bg-red-900/40", text: "text-red-300", label: "Required" },
  likely:   { bg: "bg-yellow-900/40", text: "text-yellow-300", label: "Likely Needed" },
  maybe:    { bg: "bg-blue-900/40",  text: "text-blue-300",  label: "May Apply" },
};

const CATEGORY_COLORS: Record<string, string> = {
  individual:    "text-cyan-300",
  business:      "text-purple-300",
  employer:      "text-orange-300",
  informational: "text-gray-300",
  payment:       "text-green-300",
};

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Question {current} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FormCard({ form, index }: { form: RequiredForm; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const badge = PRIORITY_BADGE[form.priority] ?? PRIORITY_BADGE.maybe;
  const details = form.formDetails as FederalForm | undefined;
  const catColor = details ? (CATEGORY_COLORS[details.category] ?? "text-gray-300") : "text-gray-300";

  return (
    <div data-testid={`form-card-${index}`} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 hover:border-gray-500 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span data-testid={`form-number-${index}`} className="font-mono font-semibold text-white text-sm">
              {form.formSource === "state" ? "📋 " : "🏛️ "}{form.formNumber}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.bg} ${badge.text} font-medium`}>
              {badge.label}
            </span>
            {details && (
              <span className={`text-xs ${catColor} capitalize`}>{details.category}</span>
            )}
          </div>
          {details && (
            <p className="text-gray-200 text-sm font-medium">{details.title}</p>
          )}
          {form.note && (
            <p className="text-gray-400 text-xs mt-1">{form.note}</p>
          )}
        </div>
        <button
          data-testid={`form-expand-${index}`}
          onClick={() => setExpanded(e => !e)}
          className="text-gray-400 hover:text-white text-lg flex-shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && details && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
          <p className="text-gray-300 text-sm">{details.description}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
            <span><strong className="text-gray-300">Filed by:</strong> {details.whoFiles}</span>
            {details.providedBy && <span><strong className="text-gray-300">Sent by:</strong> {details.providedBy}</span>}
            {details.filingMethods.length > 0 && (
              <span><strong className="text-gray-300">Methods:</strong> {details.filingMethods.join(", ")}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {details.irsUrl && (
              <a href={details.irsUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs bg-blue-900/40 text-blue-300 px-3 py-1 rounded-lg hover:bg-blue-800/60 transition">
                IRS Form Page ↗
              </a>
            )}
            {details.instructionsUrl && details.instructionsUrl !== details.irsUrl && (
              <a href={details.instructionsUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs bg-cyan-900/40 text-cyan-300 px-3 py-1 rounded-lg hover:bg-cyan-800/60 transition">
                IRS Instructions ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilingInstructions({ forms, answers }: { forms: RequiredForm[]; answers: Record<string, string> }) {
  const canEfile = forms.some(f => f.formDetails && (f.formDetails as FederalForm).filingMethods.includes("efile"));
  const hasMailOnly = forms.some(f => f.formDetails && (f.formDetails as FederalForm).filingMethods.length === 1 && (f.formDetails as FederalForm).filingMethods[0] === "mail");
  const stateCode = answers.state_of_residence;

  return (
    <div className="space-y-4 mt-6">
      <h3 className="text-lg font-semibold text-white">How to File</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* E-File */}
        <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border border-green-700/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">💻</span>
            <h4 className="font-semibold text-green-300">E-Filing (Recommended)</h4>
          </div>
          <ul className="text-gray-300 text-sm space-y-1.5">
            <li>• Use <strong>IRS Free File</strong> (free.irs.gov) if income ≤ $79,000</li>
            <li>• Or use tax software: TurboTax, H&amp;R Block, TaxAct, FreeTaxUSA</li>
            <li>• Faster refunds — typically 21 days or less</li>
            <li>• Immediate confirmation of receipt</li>
            {canEfile && <li>• ✓ Your forms support e-filing</li>}
            {stateCode && <li>• File both federal AND {stateCode} returns electronically</li>}
          </ul>
        </div>
        {/* Mail */}
        <div className="bg-gradient-to-br from-yellow-900/30 to-amber-900/20 border border-yellow-700/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">✉️</span>
            <h4 className="font-semibold text-yellow-300">Paper Mail Filing</h4>
          </div>
          <ul className="text-gray-300 text-sm space-y-1.5">
            <li>• Print and mail to the IRS address for your state</li>
            <li>• Use certified mail with return receipt for tracking</li>
            <li>• Processing takes 6–8 weeks (longer in peak season)</li>
            <li>• Staple all W-2s and attachments to the front of Form 1040</li>
            {hasMailOnly && <li>• ⚠️ Some of your forms are mail-only</li>}
            <li>• Check IRS.gov for the correct mailing address by state</li>
          </ul>
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">📅</span>
          <h4 className="font-semibold text-blue-300">Key Deadlines</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-300">
          <div className="text-center p-2 bg-blue-900/30 rounded-lg">
            <div className="font-semibold text-white">April 15</div>
            <div className="text-xs text-gray-400">Filing &amp; payment deadline</div>
          </div>
          <div className="text-center p-2 bg-blue-900/30 rounded-lg">
            <div className="font-semibold text-white">April 15</div>
            <div className="text-xs text-gray-400">Extension request (Form 4868)</div>
          </div>
          <div className="text-center p-2 bg-blue-900/30 rounded-lg">
            <div className="font-semibold text-white">October 15</div>
            <div className="text-xs text-gray-400">Extended filing deadline</div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-sm text-gray-400">
        <strong className="text-gray-300">⚠️ Disclaimer:</strong> This tool provides general guidance only. Tax laws change annually and individual situations vary. Consult a licensed CPA, Enrolled Agent, or tax attorney for personalized advice.
        <a href="https://www.irs.gov" target="_blank" rel="noopener noreferrer" className="ml-1 text-cyan-400 hover:underline">IRS.gov ↗</a>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type Stage = "intro" | "questionnaire" | "results" | "browse";

export default function TaxAssistant() {
  const [stage, setStage] = useState<Stage>("intro");
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [browseCategory, setBrowseCategory] = useState<string>("all");
  const [browseStateCode, setBrowseStateCode] = useState<string>("CA");
  const [selectedTab, setSelectedTab] = useState<"federal" | "state" | "rates">("federal");
  const queryClient = useQueryClient();

  // ── Data Queries ────────────────────────────────────────────────────────────
  const { data: periods = [] } = useQuery<TaxPeriod[]>({
    queryKey: ["/api/tax/periods"],
    queryFn: () => apiFetch("/api/tax/periods"),
  });

  const { data: questions = [] } = useQuery<TaxQuestion[]>({
    queryKey: ["/api/tax/questions"],
    queryFn: () => apiFetch("/api/tax/questions"),
    enabled: stage === "questionnaire" || stage === "results",
  });

  const { data: federalForms = [] } = useQuery<FederalForm[]>({
    queryKey: ["/api/tax/forms/federal"],
    queryFn: () => apiFetch("/api/tax/forms/federal"),
    enabled: stage === "browse",
  });

  const { data: stateForms = [] } = useQuery<FederalForm[]>({
    queryKey: ["/api/tax/forms/state", browseStateCode],
    queryFn: () => apiFetch(`/api/tax/forms/state?code=${browseStateCode}`),
    enabled: stage === "browse" && selectedTab === "state",
  });

  const activePeriod = periods.find(p => p.status === "active") ?? periods[0];

  // ── Filtered questions based on entity type ─────────────────────────────────
  const entityType = answers.entity_type ?? "individual";
  const visibleQuestions = useMemo(() => {
    return questions.filter(q => {
      if (entityType === "individual" && !q.appliesToIndividual) return false;
      if (entityType === "business" && !q.appliesToBusiness) return false;
      if (q.dependsOnKey && q.dependsOnVal) {
        const parentVal = answers[q.dependsOnKey];
        if (!parentVal || parentVal !== q.dependsOnVal) return false;
      }
      return true;
    });
  }, [questions, answers, entityType]);

  const currentQuestion = visibleQuestions[currentQuestionIndex] ?? null;

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createSessionMutation = useMutation({
    mutationFn: async () => apiFetch<Session>("/api/tax/sessions", {
      method: "POST",
      body: JSON.stringify({ taxYear: activePeriod?.taxYear }),
    }),
    onSuccess: (s) => {
      setSession(s);
      setAnswers({});
      setCurrentQuestionIndex(0);
      setStage("questionnaire");
    },
  });

  const saveAnswersMutation = useMutation({
    mutationFn: async (a: Record<string, string>) =>
      apiFetch<Session>(`/api/tax/sessions/${session!.id}/answers`, {
        method: "PATCH",
        body: JSON.stringify({ answers: a }),
      }),
  });

  const completeSessionMutation = useMutation({
    mutationFn: async () =>
      apiFetch<Session>(`/api/tax/sessions/${session!.id}/complete`, { method: "POST" }),
    onSuccess: (completed) => {
      setSession(completed);
      setStage("results");
    },
  });

  // ── Answer handling ─────────────────────────────────────────────────────────
  function handleAnswer(value: string) {
    const key = currentQuestion!.questionKey;
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);
    saveAnswersMutation.mutate(newAnswers);

    // Advance to next question or complete
    const nextIndex = currentQuestionIndex + 1;
    // Rebuild visible after new answer to account for dependency changes
    const nextVisible = questions.filter(q => {
      const et = newAnswers.entity_type ?? "individual";
      if (et === "individual" && !q.appliesToIndividual) return false;
      if (et === "business" && !q.appliesToBusiness) return false;
      if (q.dependsOnKey && q.dependsOnVal) {
        const pv = newAnswers[q.dependsOnKey];
        if (!pv || pv !== q.dependsOnVal) return false;
      }
      return true;
    });

    if (nextIndex >= nextVisible.length) {
      // All visible questions answered — complete
      saveAnswersMutation.mutate(newAnswers); // ensure saved
      setTimeout(() => completeSessionMutation.mutate(), 300);
    } else {
      setCurrentQuestionIndex(nextIndex);
    }
  }

  function handleBack() {
    if (currentQuestionIndex > 0) setCurrentQuestionIndex(i => i - 1);
  }

  // ── Required forms grouped ───────────────────────────────────────────────────
  const requiredForms = (session?.requiredForms as RequiredForm[] | null) ?? [];
  const formsByPriority = {
    required: requiredForms.filter(f => f.priority === "required"),
    likely:   requiredForms.filter(f => f.priority === "likely"),
    maybe:    requiredForms.filter(f => f.priority === "maybe"),
  };

  const filteredFederal = browseCategory === "all"
    ? federalForms
    : federalForms.filter(f => f.category === browseCategory);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white text-sm transition">← Home</Link>
            <span className="text-gray-600">|</span>
            <div className="flex items-center gap-2">
              <span className="text-xl">🏛️</span>
              <span className="font-bold text-white">Tax Assistant</span>
            </div>
          </div>
          {activePeriod && (
            <div className="text-xs text-gray-400 hidden sm:block">
              Tax Year <span className="text-cyan-400 font-semibold">{activePeriod.taxYear}</span>
              {" · "}File by <span className="text-white">{activePeriod.filingDeadline}</span>
            </div>
          )}
          <div className="flex gap-2">
            <button data-testid="nav-questionnaire" onClick={() => { setStage("intro"); }}
              className={`text-xs px-3 py-1.5 rounded-lg transition ${stage === "intro" || stage === "questionnaire" || stage === "results" ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              Questionnaire
            </button>
            <button data-testid="nav-browse" onClick={() => setStage("browse")}
              className={`text-xs px-3 py-1.5 rounded-lg transition ${stage === "browse" ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              Browse Forms
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* ── INTRO ─────────────────────────────────────────────────────────── */}
        {stage === "intro" && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <div className="text-6xl">🏛️</div>
              <h1 className="text-4xl font-bold text-white">Tax Form Assistant</h1>
              <p className="text-gray-400 text-lg">
                Answer a few questions and we'll tell you exactly which federal and state tax forms you need — with instructions for filing by mail or e-file.
              </p>
            </div>

            {activePeriod && (
              <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border border-cyan-700/40 rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📅</span>
                  <h2 className="text-xl font-semibold text-cyan-300">Tax Year {activePeriod.taxYear}</h2>
                  <span className="text-xs bg-green-800/60 text-green-300 px-2 py-0.5 rounded-full capitalize">{activePeriod.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-900/40 rounded-xl p-3 text-center">
                    <div className="text-gray-400 text-xs mb-1">Filing Deadline</div>
                    <div className="font-semibold text-white">{activePeriod.filingDeadline}</div>
                  </div>
                  <div className="bg-gray-900/40 rounded-xl p-3 text-center">
                    <div className="text-gray-400 text-xs mb-1">Extension Deadline</div>
                    <div className="font-semibold text-white">{activePeriod.extensionDeadline}</div>
                  </div>
                </div>
                {activePeriod.notes && <p className="text-gray-400 text-sm">{activePeriod.notes}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              {[
                { icon: "📝", title: "Answer Questions", desc: "~5 minutes to complete the personalized questionnaire" },
                { icon: "📋", title: "Get Your Forms", desc: "See exactly which federal and state forms you need" },
                { icon: "✉️", title: "Filing Instructions", desc: "Mail or e-file guidance with IRS links and deadlines" },
              ].map((item, i) => (
                <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <div className="font-semibold text-white text-sm mb-1">{item.title}</div>
                  <div className="text-gray-400 text-xs">{item.desc}</div>
                </div>
              ))}
            </div>

            <div className="text-center space-y-3">
              <button data-testid="btn-start-questionnaire"
                onClick={() => createSessionMutation.mutate()}
                disabled={createSessionMutation.isPending}
                className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-2xl text-lg hover:from-cyan-400 hover:to-blue-500 transition disabled:opacity-50">
                {createSessionMutation.isPending ? "Starting…" : "Start My Tax Assessment →"}
              </button>
              <div className="text-gray-500 text-sm">or</div>
              <button data-testid="btn-browse-forms" onClick={() => setStage("browse")}
                className="text-cyan-400 hover:text-cyan-300 text-sm underline underline-offset-2 transition">
                Browse all forms & rate tables →
              </button>
            </div>

            {periods.length > 1 && (
              <div className="mt-8">
                <h3 className="text-gray-400 text-sm font-semibold mb-3">All Tax Periods on File</h3>
                <div className="space-y-2">
                  {periods.map(p => (
                    <div key={p.id} data-testid={`period-row-${p.taxYear}`}
                      className="flex items-center justify-between bg-gray-800/40 border border-gray-700 rounded-xl px-4 py-2 text-sm">
                      <span className="font-semibold text-white">Tax Year {p.taxYear}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400">{p.filingDeadline}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          p.status === "active" ? "bg-green-800/60 text-green-300" :
                          p.status === "upcoming" ? "bg-blue-800/60 text-blue-300" :
                          "bg-gray-700/60 text-gray-400"}`}>{p.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── QUESTIONNAIRE ─────────────────────────────────────────────────── */}
        {stage === "questionnaire" && currentQuestion && (
          <div className="max-w-2xl mx-auto space-y-6">
            <ProgressBar current={currentQuestionIndex + 1} total={visibleQuestions.length} />

            <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-6 space-y-5">
              {/* Category badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-gray-500 font-semibold">{currentQuestion.category}</span>
                {currentQuestion.isRequired && <span className="text-xs text-red-400">• Required</span>}
              </div>

              <h2 data-testid="question-text" className="text-xl font-semibold text-white leading-snug">
                {currentQuestion.questionText}
              </h2>

              {currentQuestion.helpText && (
                <p className="text-gray-400 text-sm border-l-2 border-gray-600 pl-3">{currentQuestion.helpText}</p>
              )}

              {/* Input rendering */}
              <div className="space-y-2 pt-1">
                {/* Yes/No */}
                {currentQuestion.inputType === "yes_no" && (
                  <div className="flex gap-3">
                    {[{ v: "yes", l: "Yes" }, { v: "no", l: "No" }].map(opt => (
                      <button key={opt.v} data-testid={`option-${opt.v}`}
                        onClick={() => handleAnswer(opt.v)}
                        className={`flex-1 py-3 rounded-xl font-semibold border-2 transition text-lg
                          ${answers[currentQuestion.questionKey] === opt.v
                            ? "border-cyan-500 bg-cyan-900/40 text-cyan-300"
                            : "border-gray-600 bg-gray-700/40 text-gray-200 hover:border-gray-400"}`}>
                        {opt.v === "yes" ? "✓ Yes" : "✗ No"}
                      </button>
                    ))}
                  </div>
                )}

                {/* Single choice */}
                {currentQuestion.inputType === "single_choice" && currentQuestion.options && (
                  <div className="space-y-2">
                    {currentQuestion.options.map(opt => (
                      <button key={opt.value} data-testid={`option-${opt.value}`}
                        onClick={() => handleAnswer(opt.value)}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition
                          ${answers[currentQuestion.questionKey] === opt.value
                            ? "border-cyan-500 bg-cyan-900/40 text-cyan-200"
                            : "border-gray-600 bg-gray-700/40 text-gray-200 hover:border-gray-500 hover:bg-gray-700/60"}`}>
                        <div className="font-medium">{opt.label}</div>
                        {opt.helpText && <div className="text-xs text-gray-400 mt-0.5">{opt.helpText}</div>}
                      </button>
                    ))}
                  </div>
                )}

                {/* State select */}
                {currentQuestion.inputType === "state_select" && (
                  <div className="space-y-3">
                    <select data-testid="state-select"
                      value={answers[currentQuestion.questionKey] ?? ""}
                      onChange={e => setAnswers(a => ({ ...a, [currentQuestion.questionKey]: e.target.value }))}
                      className="w-full bg-gray-700 border-2 border-gray-600 rounded-xl px-4 py-3 text-white focus:border-cyan-500 focus:outline-none">
                      <option value="">— Select your state —</option>
                      {US_STATES.map(([code, name]) => (
                        <option key={code} value={code}>{name} ({code})</option>
                      ))}
                    </select>
                    <button data-testid="btn-confirm-state"
                      onClick={() => { if (answers[currentQuestion.questionKey]) handleAnswer(answers[currentQuestion.questionKey]); }}
                      disabled={!answers[currentQuestion.questionKey]}
                      className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold rounded-xl transition">
                      Confirm State →
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <button data-testid="btn-back"
                onClick={handleBack}
                disabled={currentQuestionIndex === 0}
                className="px-5 py-2 bg-gray-700 text-gray-200 rounded-xl hover:bg-gray-600 disabled:opacity-40 transition text-sm">
                ← Back
              </button>
              <button data-testid="btn-skip"
                onClick={() => {
                  const nextIndex = currentQuestionIndex + 1;
                  if (nextIndex >= visibleQuestions.length) completeSessionMutation.mutate();
                  else setCurrentQuestionIndex(nextIndex);
                }}
                className="px-5 py-2 bg-gray-700/60 text-gray-400 rounded-xl hover:bg-gray-700 transition text-sm">
                Skip →
              </button>
            </div>

            {completeSessionMutation.isPending && (
              <div className="text-center text-gray-400 text-sm animate-pulse">Analyzing your answers…</div>
            )}
          </div>
        )}

        {/* Questionnaire complete but computing */}
        {stage === "questionnaire" && !currentQuestion && (
          <div className="max-w-2xl mx-auto text-center py-20 space-y-4">
            <div className="text-5xl animate-pulse">⚙️</div>
            <p className="text-gray-300 text-lg">Computing your required forms…</p>
          </div>
        )}

        {/* ── RESULTS ───────────────────────────────────────────────────────── */}
        {stage === "results" && session && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">Your Tax Form Checklist</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Tax Year {session.taxYear} · {requiredForms.length} form{requiredForms.length !== 1 ? "s" : ""} identified
                </p>
              </div>
              <div className="flex gap-2">
                <button data-testid="btn-restart" onClick={() => { setStage("intro"); setSession(null); setAnswers({}); }}
                  className="px-4 py-2 bg-gray-700 text-gray-200 rounded-xl hover:bg-gray-600 transition text-sm">
                  Start Over
                </button>
                <button data-testid="btn-browse-from-results" onClick={() => setStage("browse")}
                  className="px-4 py-2 bg-purple-800/60 text-purple-200 rounded-xl hover:bg-purple-700/60 transition text-sm">
                  Browse All Forms
                </button>
              </div>
            </div>

            {/* Summary badges */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Required", count: formsByPriority.required.length, color: "bg-red-900/40 text-red-300 border border-red-700/40" },
                { label: "Likely Needed", count: formsByPriority.likely.length, color: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40" },
                { label: "May Apply", count: formsByPriority.maybe.length, color: "bg-blue-900/40 text-blue-300 border border-blue-700/40" },
              ].map(b => (
                <div key={b.label} className={`${b.color} rounded-xl px-4 py-2 text-center`}>
                  <div className="text-2xl font-bold">{b.count}</div>
                  <div className="text-xs">{b.label}</div>
                </div>
              ))}
            </div>

            {/* Forms list */}
            {requiredForms.length === 0 ? (
              <div className="text-center py-10 text-gray-400">No forms identified. Please restart and answer more questions.</div>
            ) : (
              <div className="space-y-6">
                {(["required", "likely", "maybe"] as const).map(priority => (
                  formsByPriority[priority].length > 0 && (
                    <div key={priority}>
                      <h3 className={`text-sm font-semibold uppercase tracking-widest mb-3 ${PRIORITY_BADGE[priority].text}`}>
                        {PRIORITY_BADGE[priority].label} ({formsByPriority[priority].length})
                      </h3>
                      <div className="space-y-3">
                        {formsByPriority[priority].map((form, i) => (
                          <FormCard key={`${priority}-${i}`} form={form} index={i} />
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            <FilingInstructions forms={requiredForms} answers={answers} />
          </div>
        )}

        {/* ── BROWSE ────────────────────────────────────────────────────────── */}
        {stage === "browse" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Browse Tax Forms &amp; Rates</h2>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-800/60 rounded-xl p-1 w-fit">
              {(["federal", "state", "rates"] as const).map(tab => (
                <button key={tab} data-testid={`tab-${tab}`}
                  onClick={() => setSelectedTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${selectedTab === tab ? "bg-cyan-600 text-white" : "text-gray-400 hover:text-white"}`}>
                  {tab === "federal" ? "🏛️ Federal Forms" : tab === "state" ? "📋 State Forms" : "📊 Tax Rates"}
                </button>
              ))}
            </div>

            {/* Federal Forms */}
            {selectedTab === "federal" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {["all", "individual", "business", "employer", "informational", "payment"].map(cat => (
                    <button key={cat} data-testid={`cat-filter-${cat}`}
                      onClick={() => setBrowseCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${browseCategory === cat ? "bg-cyan-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                <p className="text-gray-500 text-sm">{filteredFederal.length} form{filteredFederal.length !== 1 ? "s" : ""}</p>
                <div className="space-y-3">
                  {filteredFederal.map((form, i) => (
                    <FormCard key={form.id} form={{ formSource: "federal", formNumber: form.formNumber, priority: "maybe", note: null, formDetails: form }} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* State Forms */}
            {selectedTab === "state" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-300 font-medium">State:</label>
                  <select data-testid="browse-state-select"
                    value={browseStateCode}
                    onChange={e => setBrowseStateCode(e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
                    {US_STATES.map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-3">
                  {stateForms.length === 0 ? (
                    <div className="text-gray-400 text-sm py-8 text-center">No forms found for this state.</div>
                  ) : stateForms.map((form, i) => (
                    <div key={i} data-testid={`state-form-${i}`} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">📋</div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-semibold text-white">{(form as any).formNumber}</span>
                            {!(form as any).hasIncomeTax && (
                              <span className="text-xs bg-green-800/40 text-green-300 px-2 py-0.5 rounded-full">No Income Tax</span>
                            )}
                          </div>
                          <p className="text-gray-200 font-medium text-sm">{form.title}</p>
                          <p className="text-gray-400 text-xs mt-1">{form.description}</p>
                          {(form as any).stateWebUrl && (
                            <a href={(form as any).stateWebUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-cyan-400 hover:underline mt-1 inline-block">State Tax Website ↗</a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rates */}
            {selectedTab === "rates" && <RatesBrowser activePeriod={activePeriod} />}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Rates Browser ─────────────────────────────────────────────────────────────
type TaxRatesData = { taxYear: number; brackets: Array<{ filingStatus: string; rate: number; incomeFrom: string; incomeTo: string | null }>; standardDeductions: Array<{ filingStatus: string; baseAmount: string; age65Addition: string }>; specialRates: Array<{ rateType: string; rate: number; description: string; wageBase: string | null; thresholdFrom: string | null }> };

function RatesBrowser({ activePeriod }: { activePeriod: TaxPeriod | undefined }) {
  const [selectedYear, setSelectedYear] = useState<number>(activePeriod?.taxYear ?? 2024);
  const [selectedStatus, setSelectedStatus] = useState("single");

  const { data: rates } = useQuery<TaxRatesData>({
    queryKey: ["/api/tax/rates", selectedYear, selectedStatus],
    queryFn: () => apiFetch(`/api/tax/rates/${selectedYear}?filingStatus=${selectedStatus}`),
    enabled: !!selectedYear,
  });

  const STATUS_LABELS: Record<string, string> = { single: "Single", mfj: "Married Filing Jointly", mfs: "Married Filing Separately", hoh: "Head of Household", qw: "Qualifying Widow(er)" };
  const formatCurrency = (s: string | null) => s ? `$${parseInt(s).toLocaleString()}` : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-300">Tax Year:</label>
          <select data-testid="rate-year-select" value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:border-cyan-500 focus:outline-none">
            {[activePeriod?.taxYear ?? 2024, (activePeriod?.taxYear ?? 2024) - 1].filter(Boolean).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-300">Filing Status:</label>
          <select data-testid="rate-status-select" value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:border-cyan-500 focus:outline-none">
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {rates && (
        <div className="space-y-6">
          {/* Tax brackets */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">
              {selectedYear} Federal Tax Brackets — {STATUS_LABELS[selectedStatus]}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-800">
                    <th className="text-left px-4 py-2.5 text-gray-300 border-b border-gray-700">Tax Rate</th>
                    <th className="text-left px-4 py-2.5 text-gray-300 border-b border-gray-700">Income Range</th>
                    <th className="text-left px-4 py-2.5 text-gray-300 border-b border-gray-700">Tax on Income Above Base</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.brackets.map((b, i) => (
                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/40 transition">
                      <td className="px-4 py-2.5">
                        <span className="font-bold text-cyan-300">{(b.rate * 100).toFixed(0)}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-200">
                        {formatCurrency(b.incomeFrom)} – {b.incomeTo ? formatCurrency(b.incomeTo) : "No limit"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">
                        {(b.rate * 100).toFixed(0)}% of amount over {formatCurrency(b.incomeFrom)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Standard deductions */}
          {rates.standardDeductions.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">{selectedYear} Standard Deductions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rates.standardDeductions.map((d, i) => (
                  <div key={i} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1">{STATUS_LABELS[d.filingStatus] ?? d.filingStatus}</div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(d.baseAmount)}</div>
                    {parseFloat(d.age65Addition) > 0 && (
                      <div className="text-xs text-cyan-400 mt-1">+{formatCurrency(d.age65Addition)} if age 65+</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Special rates (FICA, SE, capital gains, etc.) */}
          {rates.specialRates.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Special &amp; Other Tax Rates</h3>
              <div className="space-y-2">
                {rates.specialRates.filter(r => !r.rateType.startsWith("amt_exempt")).map((r, i) => (
                  <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-200 text-sm">{r.description}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {r.wageBase && <span className="text-gray-400 text-xs">Wage base: {formatCurrency(r.wageBase)}</span>}
                      {r.thresholdFrom && <span className="text-gray-400 text-xs">Above: {formatCurrency(r.thresholdFrom)}</span>}
                      {r.rate > 0 && <span className="font-bold text-cyan-300">{(r.rate * 100).toFixed(2).replace(/\.?0+$/, "")}%</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!rates && <div className="text-gray-400 text-center py-8 text-sm">Loading rate tables…</div>}
    </div>
  );
}
