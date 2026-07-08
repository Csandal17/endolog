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

        <Field label="Clinical notes" required hint="Anything relevant — symptoms, history, meds, observations.">
          <Textarea
            value={form.notes}
            onChange={update("notes")}
            placeholder="e.g. 54yo presenting with 3-day intermittent chest tightness, worse on exertion. Hx of hypertension, on amlodipine 5mg. BP 148/92, HR 88 regular. No radiation, no diaphoresis…"
            rows={9}
            className="resize-none"
          />
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