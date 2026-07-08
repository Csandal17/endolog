import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Sparkles,
  Stethoscope,
  UserRound,
  AlertCircle,
  Clock,
  Trash2,
  Mic,
  Square,
  Volume2,
  Pause,
  Play,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Log a symptom · Maai" },
      { name: "description", content: "Log what you've been experiencing in your own words. Maai maps it to clinical terms so you have a clear record for every appointment." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

type Stage = "intake" | "normalising" | "generating" | "complete" | "error";

type ReportSection = { title: string; content: string };
type JobStatus = {
  status: Stage;
  stage_label?: string;
  report?: { patient?: Record<string, string>; sections: ReportSection[] };
  pdf_url?: string;
  error?: string;
  terms?: string[];
};

type IntakeForm = {
  patient_name: string;
  dob: string;
  sex: string;
  clinician: string;
  notes: string;
};

const emptyForm: IntakeForm = {
  patient_name: "",
  dob: "",
  sex: "",
  clinician: "",
  notes: "",
};

type LogEntry = {
  id: string;
  submittedAt: string; // ISO
  patientName: string;
  notesExcerpt: string;
  terms: string[];
};

const ENTRIES_KEY = "maai:entries:v1";

function readEntries(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(next: LogEntry[]) {
  try {
    window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy mode */
  }
}

function Dashboard() {
  const [form, setForm] = useState<IntakeForm>(emptyForm);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mockTimerRef = useRef<number | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const savedForJobRef = useRef<string | null>(null);

  // Load persisted entries after mount (avoid SSR/hydration mismatch)
  useEffect(() => {
    setEntries(readEntries());
  }, []);

  // When a job completes, persist an entry once.
  useEffect(() => {
    if (!job || job.status !== "complete") return;
    const key = jobId ?? "job";
    if (savedForJobRef.current === key) return;
    savedForJobRef.current = key;
    const terms = deriveTerms(job, form);
    const entry: LogEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      submittedAt: new Date().toISOString(),
      patientName: form.patient_name || "You",
      notesExcerpt: (form.notes || "").trim().slice(0, 220),
      terms,
    };
    setEntries((prev) => {
      const next = [entry, ...prev].slice(0, 100);
      writeEntries(next);
      return next;
    });
  }, [job, jobId, form]);

  function deleteEntry(id: string) {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeEntries(next);
      return next;
    });
  }

  function clearEntries() {
    setEntries([]);
    writeEntries([]);
  }

  useEffect(() => () => {
    if (mockTimerRef.current) window.clearTimeout(mockTimerRef.current);
  }, []);

  const update = (k: keyof IntakeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_name.trim() || !form.notes.trim()) {
      setError("Patient name and clinical notes are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    setJob({ status: "intake", stage_label: "Receiving intake" });

    try {
      if (!API_BASE) {
        // Demo fallback — simulate the three-agent pipeline
        runMockPipeline(form, setJob);
        setJobId("demo-job");
        setSubmitting(false);
        return;
      }
      const res = await fetch(`${API_BASE}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Intake failed (${res.status})`);
      const data = (await res.json()) as { job_id: string };
      setJobId(data.job_id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setJob({ status: "error", error: "Could not reach the intake service." });
    } finally {
      setSubmitting(false);
    }
  }

  // Poll status when a real jobId is set
  useEffect(() => {
    if (!jobId || jobId === "demo-job" || !API_BASE) return;
    let cancelled = false;
    let timeout: number;
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = (await res.json()) as JobStatus;
        if (cancelled) return;
        setJob(data);
        if (data.status !== "complete" && data.status !== "error") {
          timeout = window.setTimeout(tick, 1500);
        }
      } catch (err) {
        if (cancelled) return;
        setJob({ status: "error", error: err instanceof Error ? err.message : "Polling failed" });
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [jobId]);

  function reset() {
    if (mockTimerRef.current) window.clearTimeout(mockTimerRef.current);
    setJob(null);
    setJobId(null);
    setError(null);
  }

  const stage: Stage = job?.status ?? "intake";
  const showForm = !job || job.status === "error";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <Header />

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_1fr]">
          <section>
            <AnimatePresence mode="wait">
              {showForm ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <IntakeCard
                    form={form}
                    update={update}
                    submit={submit}
                    submitting={submitting}
                    error={error ?? job?.error ?? null}
                    onReset={() => setForm(emptyForm)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <ProgressCard stage={stage} label={job?.stage_label} onReset={reset} />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <section>
            <ReportPreview job={job} form={form} />
          </section>
        </div>

        <section className="mt-10">
          <TimelineCard entries={entries} onDelete={deleteEntry} onClear={clearEntries} />
        </section>
      </main>
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <span className="font-serif text-base leading-none">M</span>
          </div>
          <span className="font-serif text-xl tracking-tight">Maai</span>
          <Badge className="ml-2 rounded-full bg-butter/40 text-charcoal hover:bg-butter/40">
            Your log
          </Badge>
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to site
        </Link>
      </div>
    </header>
  );
}

function Header() {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-warm-grey">
        Clinical intake
      </p>
      <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
        Turn free-text notes into a structured report.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Submit patient information below. Our three-agent pipeline intakes, normalises against
        clinical schemas, and produces a downloadable PDF report.
      </p>
    </div>
  );
}

function IntakeCard({
  form,
  update,
  submit,
  submitting,
  error,
  onReset,
}: {
  form: IntakeForm;
  update: (k: keyof IntakeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  submit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string | null;
  onReset: () => void;
}) {
  return (
    <Card className="rounded-3xl border-border/60 bg-card p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-pink/30 text-charcoal">
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-serif text-2xl leading-none tracking-tight">Patient intake</h2>
          <p className="mt-1 text-xs text-muted-foreground">Agent 1 · free-text collection</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Patient name" required>
            <Input value={form.patient_name} onChange={update("patient_name")} placeholder="Jane Doe" />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.dob} onChange={update("dob")} />
          </Field>
          <Field label="Sex at birth">
            <Input value={form.sex} onChange={update("sex")} placeholder="Female / Male / Other" />
          </Field>
          <Field label="Clinician">
            <Input value={form.clinician} onChange={update("clinician")} placeholder="Dr. A. Osei" />
          </Field>
        </div>

        <Field
          label="What have you been experiencing?"
          required
          hint="In your own words, in any language. Speak it or type it — Maai will map it to clinical terms."
        >
          <div className="space-y-2">
            <Textarea
              value={form.notes}
              onChange={update("notes")}
              placeholder="e.g. sharp cramping on my left side for the last three days, worse at night, waking me up. Bloated most afternoons…"
              rows={9}
              className="resize-none"
            />
            <VoiceControls
              text={form.notes}
              onTranscript={(t) =>
                update("notes")({
                  target: { value: form.notes ? `${form.notes.trim()} ${t}`.trim() : t },
                } as unknown as React.ChangeEvent<HTMLTextAreaElement>)
              }
            />
          </div>
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onReset}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear form
          </button>
          <Button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                Generate report
                <ArrowRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs font-medium uppercase tracking-wide text-warm-grey">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </Label>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const STAGES: { id: Stage; title: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "intake", title: "Intake", desc: "Reading patient information", icon: UserRound },
  { id: "normalising", title: "Normalisation", desc: "Structuring with clinical schemas", icon: Sparkles },
  { id: "generating", title: "PDF generation", desc: "Composing formatted report", icon: FileText },
];

function ProgressCard({
  stage,
  label,
  onReset,
}: {
  stage: Stage;
  label?: string;
  onReset: () => void;
}) {
  const activeIdx = stage === "complete" ? STAGES.length : STAGES.findIndex((s) => s.id === stage);
  const isError = stage === "error";
  const done = stage === "complete";

  return (
    <Card className="rounded-3xl border-border/60 bg-card p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-powder/50 text-charcoal">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-serif text-2xl leading-none tracking-tight">
            {done ? "Report ready" : isError ? "Something went wrong" : "Processing"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {label ?? (done ? "All three agents completed" : "Three-agent clinical pipeline")}
          </p>
        </div>
      </div>

      <ol className="mt-8 space-y-4">
        {STAGES.map((s, i) => {
          const isDone = i < activeIdx;
          const isActive = i === activeIdx && !done && !isError;
          const Icon = s.icon;
          return (
            <li key={s.id} className="flex items-start gap-4">
              <div
                className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
                  isDone
                    ? "bg-sage/30 text-charcoal"
                    : isActive
                    ? "bg-pink/40 text-charcoal"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-foreground">
                    Agent {i + 1} · {s.title}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {isDone ? "Done" : isActive ? "Working" : "Waiting"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.desc}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: isDone ? "100%" : isActive ? "70%" : "0%",
                    }}
                    transition={{ duration: isActive ? 1.6 : 0.4, ease: "easeOut" }}
                    className="h-full bg-primary"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {(done || isError) && (
        <div className="mt-8">
          <Button
            variant="outline"
            onClick={onReset}
            className="rounded-full border-border/60"
          >
            Start a new intake
          </Button>
        </div>
      )}
    </Card>
  );
}

function ReportPreview({ job, form }: { job: JobStatus | null; form: IntakeForm }) {
  const empty = !job;
  const done = job?.status === "complete";
  const report = job?.report;

  return (
    <Card className="sticky top-24 rounded-3xl border-border/60 bg-card p-7 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-butter/50 text-charcoal">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-2xl leading-none tracking-tight">Report preview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {done ? "Structured output from agent 3" : "Populates as the pipeline runs"}
            </p>
          </div>
        </div>
        {done && <DownloadButton job={job} />}
      </div>

      <div className="mt-6 rounded-2xl border border-border/60 bg-parchment p-6 shadow-inner">
        {empty ? (
          <EmptyPreview />
        ) : done && report ? (
          <RenderedReport report={report} form={form} />
        ) : job?.status === "error" ? (
          <div className="py-10 text-center text-sm text-destructive">
            {job.error ?? "The pipeline failed."}
          </div>
        ) : (
          <SkeletonPreview />
        )}
      </div>
    </Card>
  );
}

function DownloadButton({ job }: { job: JobStatus }) {
  const href = job.pdf_url
    ? job.pdf_url.startsWith("http")
      ? job.pdf_url
      : `${API_BASE}${job.pdf_url}`
    : null;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Download className="h-4 w-4" />
        Download PDF
      </a>
    );
  }
  return (
    <button
      onClick={() => alert("Demo mode — connect VITE_API_BASE_URL to enable PDF download.")}
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      <Download className="h-4 w-4" />
      Download PDF
    </button>
  );
}

function EmptyPreview() {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-pink/30 text-charcoal">
        <FileText className="h-5 w-5" />
      </div>
      <p className="mt-4 font-serif text-lg">Your report will appear here</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Submit the intake form to start the pipeline.
      </p>
    </div>
  );
}

function SkeletonPreview() {
  return (
    <div className="space-y-4">
      {[80, 60, 90, 70, 50, 85].map((w, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }}
          className="h-3 rounded-full bg-stone/60"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

function RenderedReport({
  report,
  form,
}: {
  report: { patient?: Record<string, string>; sections: ReportSection[] };
  form: IntakeForm;
}) {
  const patient = report.patient ?? {
    Name: form.patient_name || "—",
    DOB: form.dob || "—",
    Sex: form.sex || "—",
    Clinician: form.clinician || "—",
  };
  return (
    <article className="space-y-6 text-charcoal">
      <header className="border-b border-stone/40 pb-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-warm-grey">
          Intelly clinical report
        </div>
        <h3 className="mt-1 font-serif text-2xl leading-tight">
          {patient.Name || patient.name || "Patient report"}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-warm-grey">
          {Object.entries(patient).map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="font-medium">{k}:</dt>
              <dd>{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </header>
      {report.sections.map((s) => (
        <section key={s.title}>
          <h4 className="font-serif text-base uppercase tracking-wide text-charcoal">
            {s.title}
          </h4>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-charcoal/85">
            {s.content}
          </p>
        </section>
      ))}
    </article>
  );
}

// ---------- Demo pipeline (used when no VITE_API_BASE_URL is configured) ----------
function runMockPipeline(form: IntakeForm, set: (j: JobStatus) => void) {
  const steps: JobStatus[] = [
    { status: "intake", stage_label: "Agent 1 · reading patient information" },
    { status: "normalising", stage_label: "Agent 2 · normalising with Anthropic" },
    { status: "generating", stage_label: "Agent 3 · composing PDF with fpdf2" },
  ];
  let i = 0;
  const tick = () => {
    if (i < steps.length) {
      set(steps[i]);
      i++;
      window.setTimeout(tick, 1600);
    } else {
      set({
        status: "complete",
        stage_label: "Pipeline complete",
        report: buildMockReport(form),
      });
    }
  };
  window.setTimeout(tick, 400);
}

function buildMockReport(form: IntakeForm) {
  const name = form.patient_name || "Patient";
  return {
    patient: {
      Name: name,
      DOB: form.dob || "—",
      Sex: form.sex || "—",
      Clinician: form.clinician || "—",
      "Report ID": `INT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    },
    sections: [
      {
        title: "Presenting complaint",
        content:
          form.notes.slice(0, 220) ||
          "Intermittent chest tightness for three days, worse on exertion.",
      },
      {
        title: "History",
        content:
          "Hypertension on amlodipine 5mg daily. No prior cardiac events. Non-smoker. Occasional alcohol use.",
      },
      {
        title: "Examination",
        content:
          "BP 148/92 mmHg. HR 88 bpm, regular. Chest clear to auscultation. Heart sounds normal, no murmurs. No peripheral oedema.",
      },
      {
        title: "Assessment",
        content:
          "Suspected exertional angina in a patient with poorly controlled hypertension. Cardiovascular risk stratification indicated.",
      },
      {
        title: "Plan",
        content:
          "1. ECG and troponin today.\n2. Optimise antihypertensive therapy — review amlodipine dose.\n3. Refer to cardiology for exercise tolerance testing.\n4. Safety-net advice provided regarding chest pain red flags.",
      },
    ],
  };
}

// ---------- Timeline ----------

const KEYWORD_TERMS: { pattern: RegExp; term: string }[] = [
  { pattern: /cramp|period pain|menstrual pain/i, term: "Dysmenorrhea" },
  { pattern: /pelvi|lower abdomen|low(er)? belly/i, term: "Pelvic pain" },
  { pattern: /left side|left-sided|left flank/i, term: "Left-sided pain" },
  { pattern: /right side|right-sided|right flank/i, term: "Right-sided pain" },
  { pattern: /bloat|swollen|distend/i, term: "Bloating" },
  { pattern: /nausea|sick to stomach|vomit/i, term: "Nausea" },
  { pattern: /fatigue|exhaust|drained|tired/i, term: "Fatigue" },
  { pattern: /heavy bleed|clots|flooding/i, term: "Heavy menstrual bleeding" },
  { pattern: /spotting|between periods|irregular bleed/i, term: "Intermenstrual bleeding" },
  { pattern: /pain during sex|dyspareunia|painful intercourse/i, term: "Dyspareunia" },
  { pattern: /pain(ful)? (when )?(peeing|urinating)|burning wee/i, term: "Dysuria" },
  { pattern: /pain(ful)? (during|when)? ?(bowel|poo|stool|defec)/i, term: "Dyschezia" },
  { pattern: /woke|waking|night sweat|insomnia/i, term: "Sleep disruption" },
  { pattern: /headache|migraine/i, term: "Headache" },
  { pattern: /back pain|lower back/i, term: "Lower back pain" },
  { pattern: /leg pain|radiat/i, term: "Radiating leg pain" },
  { pattern: /mood|anxious|low mood|depress/i, term: "Mood change" },
];

function deriveTerms(job: JobStatus, form: IntakeForm): string[] {
  if (job.terms && job.terms.length) return dedupe(job.terms).slice(0, 6);
  const notes = form.notes || "";
  const matched = KEYWORD_TERMS.filter(({ pattern }) => pattern.test(notes)).map((k) => k.term);
  if (matched.length) return dedupe(matched).slice(0, 6);
  // Fall back to report section titles if available (real backend)
  if (job.report?.sections?.length) {
    return dedupe(job.report.sections.map((s) => s.title)).slice(0, 6);
  }
  return ["Symptom logged"];
}

function dedupe<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function TimelineCard({
  entries,
  onDelete,
  onClear,
}: {
  entries: LogEntry[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const empty = entries.length === 0;
  const topTerms = computeTopTerms(entries).slice(0, 6);

  return (
    <Card className="rounded-3xl border-border/60 bg-card p-7 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sage/40 text-charcoal">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-2xl leading-none tracking-tight">Pattern over time</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {empty
                ? "Your logged entries and mapped clinical terms will appear here."
                : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} · saved on this device`}
            </p>
          </div>
        </div>
        {!empty && (
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {!empty && topTerms.length > 0 && (
        <div className="mt-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-warm-grey">
            Recurring terms
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {topTerms.map(({ term, count }) => (
              <span
                key={term}
                className="inline-flex items-center gap-1.5 rounded-full bg-pink/25 px-3 py-1 text-xs font-medium text-charcoal"
              >
                {term}
                <span className="rounded-full bg-charcoal/10 px-1.5 text-[10px]">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        {empty ? (
          <TimelineEmpty />
        ) : (
          <ol className="relative space-y-6 border-l border-stone/60 pl-6">
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                <TimelineEntry key={entry.id} entry={entry} onDelete={onDelete} />
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </Card>
  );
}

function TimelineEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-parchment/60 py-12 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-powder/40 text-charcoal">
        <Clock className="h-4 w-4" />
      </div>
      <p className="mt-4 font-serif text-lg text-charcoal">No entries yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Submit an intake above — it will appear here with the clinical terms Maai extracted.
      </p>
    </div>
  );
}

function TimelineEntry({
  entry,
  onDelete,
}: {
  entry: LogEntry;
  onDelete: (id: string) => void;
}) {
  const date = new Date(entry.submittedAt);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="relative"
    >
      <span
        aria-hidden
        className="absolute -left-[31px] top-1.5 grid h-4 w-4 place-items-center rounded-full border-2 border-background bg-primary"
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-base text-charcoal">{formatDate(date)}</span>
          <span className="text-xs text-warm-grey">{formatTime(date)}</span>
        </div>
        <button
          onClick={() => onDelete(entry.id)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
          aria-label="Delete entry"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      </div>
      {entry.notesExcerpt && (
        <p className="mt-2 rounded-2xl border border-border/60 bg-parchment px-4 py-3 text-sm leading-relaxed text-charcoal">
          &ldquo;{entry.notesExcerpt}
          {entry.notesExcerpt.length >= 220 ? "…" : ""}&rdquo;
        </p>
      )}
      {entry.terms.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.terms.map((t, i) => (
            <span
              key={`${entry.id}-${t}`}
              className="rounded-full px-3 py-1 text-xs font-medium text-charcoal"
              style={{
                background: `color-mix(in oklab, var(--color-${TINT_ROTATION[i % TINT_ROTATION.length]}) 45%, transparent)`,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </motion.li>
  );
}

const TINT_ROTATION = ["pink", "powder", "butter", "sage"] as const;

function computeTopTerms(entries: LogEntry[]): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    for (const term of e.terms) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count);
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ---------- Voice controls (ElevenLabs STT + TTS) ----------

function VoiceControls({
  text,
  onTranscript,
}: {
  text: string;
  onTranscript: (t: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [playback, setPlayback] = useState<"idle" | "playing" | "paused">("idle");
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [status, setStatus] = useState("");
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [micPermission, setMicPermission] = useState<
    "unknown" | "prompt" | "granted" | "denied" | "unsupported"
  >("unknown");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const cachedForRef = useRef<string | null>(null);
  const lastAnnouncedRef = useRef(0);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioRef.current?.pause();
    };
  }, []);

  // Query mic permission state on mount so we can show the right prompt.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermission("unsupported");
      return;
    }
    const perms = (navigator as Navigator & {
      permissions?: {
        query: (d: { name: PermissionName }) => Promise<PermissionStatus>;
      };
    }).permissions;
    if (!perms?.query) {
      setMicPermission("prompt");
      return;
    }
    let status: PermissionStatus | null = null;
    perms
      .query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        setMicPermission(s.state as "granted" | "denied" | "prompt");
        s.onchange = () => setMicPermission(s.state as "granted" | "denied" | "prompt");
      })
      .catch(() => setMicPermission("prompt"));
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  // Invalidate cached audio when the text changes so a re-generated read-back
  // matches the latest notes.
  useEffect(() => {
    if (cachedForRef.current !== null && cachedForRef.current !== text.trim()) {
      stopPlayback();
      cachedForRef.current = null;
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      audioRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Keep the live playback rate in sync with the selector.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicPermission("granted");
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 1024) {
          setError("That recording was too short — please try again.");
          setStatus("Recording was too short.");
          return;
        }
        await transcribe(blob, type);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setStatus("Recording. Speak in your own language.");
    } catch (err) {
      console.error(err);
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      if (denied) setMicPermission("denied");
      setError(
        denied
          ? "Microphone access is blocked. Enable it in your browser's site settings for this page, then try again."
          : "Microphone unavailable. Check that a mic is connected.",
      );
      setStatus(denied ? "Microphone access denied." : "Microphone unavailable.");
    }
  }

  async function requestMicAccess() {
    setError(null);
    setStatus("Requesting microphone access…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop — this call is only to trigger the permission prompt.
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
      setStatus("Microphone access granted. You can now dictate.");
    } catch (err) {
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      if (denied) setMicPermission("denied");
      setError(
        denied
          ? "Microphone access is blocked. Enable it in your browser's site settings for this page, then try again."
          : "Microphone unavailable. Check that a mic is connected.",
      );
      setStatus(denied ? "Microphone access denied." : "Microphone unavailable.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    setStatus("Transcribing your recording.");
  }

  async function transcribe(blob: Blob, mime: string) {
    setTranscribing(true);
    setError(null);
    try {
      const ext = mime.includes("mp4") ? "mp4" : mime.includes("mpeg") ? "mp3" : "webm";
      const fd = new FormData();
      fd.append("file", blob, `recording.${ext}`);
      const res = await fetch("/api/stt", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text().catch(() => `Transcription failed (${res.status})`));
      const data = (await res.json()) as { text: string };
      const t = (data.text || "").trim();
      if (!t) {
        setError("No speech detected — please try again.");
        setStatus("No speech detected.");
        return;
      }
      onTranscript(t);
      setStatus("Transcript added to your notes.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not transcribe audio.");
      setStatus("Transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }

  function stopPlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlayback("idle");
  }

  async function playOrPause() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Write or dictate something first, then Maai can read it back.");
      setStatus("Nothing to read back yet.");
      return;
    }

    // Pause an in-flight playback.
    if (playback === "playing" && audioRef.current) {
      audioRef.current.pause();
      setPlayback("paused");
      setStatus("Read-back paused.");
      return;
    }

    // Resume from a paused position without re-generating audio.
    if (
      playback === "paused" &&
      audioRef.current &&
      cachedForRef.current === trimmed
    ) {
      audioRef.current.playbackRate = rate;
      await audioRef.current.play();
      setPlayback("playing");
      setStatus("Read-back resumed.");
      return;
    }

    // Reuse cached audio (e.g. after stop) if the text hasn't changed.
    if (audioRef.current && cachedForRef.current === trimmed) {
      audioRef.current.currentTime = 0;
      audioRef.current.playbackRate = rate;
      await audioRef.current.play();
      setPlayback("playing");
      setStatus("Playing read-back.");
      return;
    }

    setError(null);
    setLoadingAudio(true);
    setStatus("Preparing read-back.");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed.slice(0, 5000) }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `Read-back failed (${res.status})`));
      const blob = await res.blob();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audio.playbackRate = rate;
      audio.onplay = () => {
        setPlayback("playing");
      };
      audio.onpause = () => {
        // Distinguish pause from natural end via currentTime + duration.
        if (audio.ended) return;
        setPlayback((p) => (p === "playing" ? "paused" : p));
      };
      audio.onended = () => {
        setPlayback("idle");
        setStatus("Read-back finished.");
      };
      audioRef.current = audio;
      cachedForRef.current = trimmed;
      await audio.play();
      setStatus("Playing read-back.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not read the record back.");
      setStatus("Read-back failed.");
    } finally {
      setLoadingAudio(false);
    }
  }

  const busy = recording || transcribing;
  const playing = playback === "playing";
  const paused = playback === "paused";
  const hasAudio = playing || paused;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        disabled={transcribing}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
          recording
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-pink/25 text-charcoal hover:bg-pink/40"
        } disabled:opacity-60`}
        aria-pressed={recording}
        aria-label={recording ? "Stop recording" : "Dictate with your voice"}
      >
        {transcribing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Transcribing…
          </>
        ) : recording ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground" />
            </span>
            <Square className="h-3.5 w-3.5" />
            Stop & transcribe
          </>
        ) : (
          <>
            <Mic className="h-3.5 w-3.5" />
            Dictate in your language
          </>
        )}
      </button>

      <div
        className="inline-flex items-center gap-1 rounded-full bg-powder/50 p-1 text-charcoal"
        role="group"
        aria-label="Read-back playback controls"
      >
        <button
          type="button"
          onClick={playOrPause}
          disabled={busy || loadingAudio}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium hover:bg-powder/60 disabled:opacity-60"
          aria-label={
            playing
              ? "Pause read-back"
              : paused
                ? "Resume read-back"
                : "Listen to your record"
          }
          aria-pressed={playing}
        >
          {loadingAudio ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Preparing…
            </>
          ) : playing ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              Pause
            </>
          ) : paused ? (
            <>
              <Play className="h-3.5 w-3.5" />
              Resume
            </>
          ) : (
            <>
              <Volume2 className="h-3.5 w-3.5" />
              Listen to your record
            </>
          )}
        </button>
        {hasAudio && (
          <button
            type="button"
            onClick={() => {
              stopPlayback();
              setStatus("Read-back stopped.");
            }}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium hover:bg-powder/60"
            aria-label="Stop read-back"
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        )}
      </div>

      <div className="inline-flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5 text-warm-grey" aria-hidden />
        <label htmlFor="tts-rate" className="sr-only">
          Playback speed
        </label>
        <select
          id="tts-rate"
          value={rate}
          onChange={(e) => {
            const next = Number(e.target.value);
            setRate(next);
            setStatus(`Playback speed set to ${next.toFixed(2)} times normal.`);
          }}
          className="rounded-full border border-border/60 bg-background px-2 py-1 text-xs font-medium text-charcoal focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value={0.75}>0.75×</option>
          <option value={1}>1× (normal)</option>
          <option value={1.25}>1.25×</option>
          <option value={1.5}>1.5×</option>
        </select>
      </div>

      <span className="text-[11px] text-muted-foreground">
        Read-back is optional — a confirmation step before you hand it over.
      </span>

      {/* Polite live region for screen readers. Visually hidden but announced. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </div>

      {error && (
        <div className="basis-full text-[11px] text-destructive" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}