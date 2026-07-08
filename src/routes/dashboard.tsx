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
import { Slider } from "@/components/ui/slider";
import { jsPDF } from "jspdf";
import * as api from "@/services/api";
import type { Report as ApiReport, StructuredReport } from "@/services/api";

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

type Stage = "intake" | "normalising" | "generating" | "complete" | "error";

type ReportSection = { title: string; content: string };
type JobStatus = {
  status: Stage;
  stage_label?: string;
  report?: { patient?: Record<string, string>; sections: ReportSection[] };
  pdf_url?: string;
  error?: string;
  terms?: string[];
  report_id?: string;
};

type IntakeForm = {
  patient_name: string;
  dob: string;
  sex: string;
  clinician: string;
  notes: string;
  pain_score: number;
  pain_recorded_at: string; // datetime-local value: YYYY-MM-DDTHH:mm
  socrates: SocratesAnswers;
};

type SocratesAnswers = {
  site: string[];
  site_other: string;
  onset: string;
  cycle_link: string;
  character: string[];
  associated: string[];
  radiation: string[];
  duration: string;
  pattern: string;
  worse: string[];
  better: string[];
  nsaid_relief: string;
};

const emptySocrates: SocratesAnswers = {
  site: [],
  site_other: "",
  onset: "",
  cycle_link: "",
  character: [],
  associated: [],
  radiation: [],
  duration: "",
  pattern: "",
  worse: [],
  better: [],
  nsaid_relief: "",
};

const emptyForm: IntakeForm = {
  patient_name: "",
  dob: "",
  sex: "",
  clinician: "",
  notes: "",
  pain_score: 0,
  pain_recorded_at: "",
  socrates: { ...emptySocrates, site: [], character: [], associated: [], radiation: [], worse: [], better: [] },
};

type LogEntry = {
  id: string;
  submittedAt: string; // ISO
  patientName: string;
  notesExcerpt: string;
  terms: string[];
};

const ENTRIES_KEY = "maai:entries:v1";

function nowLocalDatetime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPainWhen(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function painColor(score: number): string {
  // 0 → green (140°), 10 → red (5°)
  const hue = Math.round(140 - (score / 10) * 135);
  return `hsl(${hue} 65% 45%)`;
}

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
  const [reportId, setReportId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mockTimerRef = useRef<number | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const savedForJobRef = useRef<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Load persisted entries after mount (avoid SSR/hydration mismatch)
  useEffect(() => {
    setEntries(readEntries());
    // Seed pain timestamp with "now" once, client-side, to avoid SSR mismatch.
    setForm((f) => (f.pain_recorded_at ? f : { ...f, pain_recorded_at: nowLocalDatetime() }));
  }, []);

  // When a job completes, persist an entry once.
  useEffect(() => {
    if (!job || job.status !== "complete") return;
    const key = reportId ?? "job";
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
  }, [job, reportId, form]);

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

  const setSocrates = (patch: Partial<SocratesAnswers>) =>
    setForm((f) => ({ ...f, socrates: { ...f.socrates, ...patch } }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_name.trim() || !form.notes.trim()) {
      setError("Name and clinical notes are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    setReportId(null);
    // Kick off a client-side visual walk through the three agents while the
    // API request is in flight — the mock backend replies in < 2s but we
    // want the user to see each stage light up.
    animateStages(setJob, mockTimerRef);

    try {
      const painLine = `Pain (NRS 0–10): ${form.pain_score}/10${
        form.pain_recorded_at ? ` — recorded ${formatPainWhen(form.pain_recorded_at)}` : ""
      }`;
      const socratesText = formatSocrates(form.socrates);
      const res = await api.processPatientIntake({
        patient_name: form.patient_name.trim(),
        dob: form.dob || undefined,
        sex: form.sex || undefined,
        clinician: form.clinician || undefined,
        input_text: `${painLine}${socratesText ? `\n\n${socratesText}` : ""}\n\n${form.notes.trim()}`,
      });
      if (mockTimerRef.current) window.clearTimeout(mockTimerRef.current);
      // Fetch the persisted report so the preview renders the exact bytes
      // that the backend stored (parity with the future FastAPI response).
      const stored = await api.getReport(res.report_id);
      const structured = stored.structured_data;
      if (!structured) throw new Error("Backend did not return structured data");
      setReportId(res.report_id);
      setJob({
        status: "complete",
        stage_label: "Pipeline complete",
        report: toLegacyReport(structured),
        pdf_url: stored.pdf_url ?? `/api/reports/${res.report_id}/pdf`,
        terms: structured.clinical_terms,
        report_id: res.report_id,
      });
      setHistoryRefreshKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      if (mockTimerRef.current) window.clearTimeout(mockTimerRef.current);
      const message = err instanceof Error ? err.message : "Could not reach the intake service.";
      setError(message);
      setJob({ status: "error", error: message });
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    if (mockTimerRef.current) window.clearTimeout(mockTimerRef.current);
    setJob(null);
    setReportId(null);
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
                    onPainScore={(n) => setForm((f) => ({ ...f, pain_score: n }))}
                    onPainDateTime={(v) => setForm((f) => ({ ...f, pain_recorded_at: v }))}
                    onPainDateTimeNow={() =>
                      setForm((f) => ({ ...f, pain_recorded_at: nowLocalDatetime() }))
                    }
                    submit={submit}
                    submitting={submitting}
                    error={error ?? job?.error ?? null}
                    onReset={() =>
                      setForm({ ...emptyForm, pain_recorded_at: nowLocalDatetime() })
                    }
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
            <ReportPreview job={job} form={form} reportId={reportId} />
          </section>
        </div>

        <section className="mt-10">
          <TimelineCard entries={entries} onDelete={deleteEntry} onClear={clearEntries} />
        </section>

        <section className="mt-10">
          <ReportHistoryCard refreshKey={historyRefreshKey} />
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
  onPainScore,
  onPainDateTime,
  onPainDateTimeNow,
  submit,
  submitting,
  error,
  onReset,
}: {
  form: IntakeForm;
  update: (k: keyof IntakeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onPainScore: (n: number) => void;
  onPainDateTime: (v: string) => void;
  onPainDateTimeNow: () => void;
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
          <h2 className="font-serif text-2xl leading-none tracking-tight">My Pain Profile</h2>
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input
              value={form.patient_name}
              onChange={update("patient_name")}
              placeholder="Jane Doe"
              name="name"
              autoComplete="name"
            />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.dob} onChange={update("dob")} autoComplete="bday" />
          </Field>
        </div>

        <PainNrsField
          score={form.pain_score}
          recordedAt={form.pain_recorded_at}
          onScore={onPainScore}
          onDateTime={onPainDateTime}
          onNow={onPainDateTimeNow}
        />

        <Field
          label="What have you been experiencing?"
          required
          hint="In your own words. Maai will map it to clinical terms."
        >
          <Textarea
            value={form.notes}
            onChange={update("notes")}
            placeholder="e.g. sharp cramping on my left side for the last three days, worse at night, waking me up. Bloated most afternoons…"
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

function PainNrsField({
  score,
  recordedAt,
  onScore,
  onDateTime,
  onNow,
}: {
  score: number;
  recordedAt: string;
  onScore: (n: number) => void;
  onDateTime: (v: string) => void;
  onNow: () => void;
}) {
  const swatch = painColor(score);
  const pct = (score / 10) * 100;
  const label =
    score === 0
      ? "No pain"
      : score <= 3
        ? "Mild"
        : score <= 6
          ? "Moderate"
          : score <= 9
            ? "Severe"
            : "Worst ever";
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-medium uppercase tracking-wide text-warm-grey">
            How is your pain right now?
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Numerical Rating Scale (NRS) · 0 = no pain, 10 = worst imaginable pain
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="pain-when">
            When was this pain level?
          </label>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pain-when"
              type="datetime-local"
              value={recordedAt}
              onChange={(e) => onDateTime(e.target.value)}
              className="h-9 w-[13.5rem] pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNow}
            className="h-9 rounded-full text-xs"
          >
            Now
          </Button>
        </div>
      </div>

      <h3 className="mt-6 font-serif text-xl leading-none tracking-tight">Endoscale</h3>
      <div
        className="mt-4"
        role="group"
        aria-labelledby="pain-scale-label"
      >
        <div id="pain-scale-label" className="sr-only">
          Pain intensity from 0 to 10
        </div>
        <div className="relative h-8">
          <div
            className="absolute -top-1 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${pct}%` }}
          >
            <div
              className="grid h-9 w-11 place-items-center rounded-lg text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: swatch }}
              aria-live="polite"
            >
              {score}
            </div>
            <div
              className="h-2 w-2 rotate-45"
              style={{ backgroundColor: swatch, marginTop: -4 }}
            />
          </div>
        </div>

        <div className="relative">
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "linear-gradient(to right, hsl(140 65% 45%), hsl(75 70% 45%), hsl(45 90% 50%), hsl(20 85% 50%), hsl(5 75% 45%))",
            }}
            aria-hidden="true"
          />
          <Slider
            value={[score]}
            min={0}
            max={10}
            step={1}
            onValueChange={(v) => onScore(v[0] ?? 0)}
            aria-label="Pain score from 0 to 10"
            aria-valuetext={`${score} out of 10, ${label}`}
            className="relative [&>[data-orientation=horizontal]]:bg-transparent [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:border-2 [&_[role=slider]]:border-foreground/70 [&_[role=slider]]:bg-background [&_[role=slider]]:shadow"
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>0 · No pain</span>
          <span aria-hidden="true" className="font-medium" style={{ color: swatch }}>
            {label}
          </span>
          <span>10 · Worst ever</span>
        </div>
      </div>
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

function ReportPreview({
  job,
  form,
  reportId,
}: {
  job: JobStatus | null;
  form: IntakeForm;
  reportId: string | null;
}) {
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
            {done && (
              <p className="mt-1 text-xs text-muted-foreground">Structured output from agent 3</p>
            )}
          </div>
        </div>
        {done && <DownloadButton job={job} reportId={reportId} />}
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

function DownloadButton({
  job,
  reportId,
}: {
  job: JobStatus;
  reportId: string | null;
}) {
  const id = reportId ?? job.report_id ?? null;
  return (
    <button
      type="button"
      onClick={() => id && api.downloadReport(id)}
      disabled={!id}
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      title="Fetches the PDF from the backend (mock today, FastAPI later)."
    >
      <Download className="h-4 w-4" />
      Download PDF
    </button>
  );
}

function generateClientPdf(report: JobStatus["report"] | undefined, form: IntakeForm) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Maai · Symptom record", margin, y);
  y += 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(new Date().toLocaleString(), margin, y);
  y += 20;
  doc.setTextColor(20);

  const patient = report?.patient ?? {
    Name: form.patient_name,
    "Date of birth": form.dob,
    Sex: form.sex,
    Clinician: form.clinician,
  };
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Patient", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  for (const [k, v] of Object.entries(patient)) {
    if (!v) continue;
    ensureSpace(16);
    doc.text(`${k}: ${v}`, margin, y);
    y += 14;
  }
  y += 8;

  const sections = report?.sections ?? [
    { title: "Notes", content: form.notes || "(no notes)" },
  ];
  for (const section of sections) {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(section.title, margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(section.content ?? "", maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(14);
      doc.text(line, margin, y);
      y += 14;
    }
    y += 10;
  }

  const safeName = (form.patient_name || "record").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  doc.save(`maai-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
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


// ---------- API adapters ----------

/**
 * Adapt the structured report shape returned by the API service into the
 * section-based shape the existing `RenderedReport` component understands.
 * When the real FastAPI backend returns a schema compatible with
 * `StructuredReport`, this stays; if it returns something else, edit only
 * this function.
 */
function toLegacyReport(s: StructuredReport): JobStatus["report"] {
  const patient: Record<string, string> = {
    Name: s.patient.name,
    DOB: s.patient.dob || "—",
    Sex: s.patient.sex || "—",
    Clinician: s.patient.clinician || "—",
  };
  const bullet = (items: string[]) => items.map((i) => `• ${i}`).join("\n");
  return {
    patient,
    sections: [
      { title: "Patient summary", content: s.patient_summary },
      { title: "Key findings", content: bullet(s.key_findings) },
      { title: "Risk indicators", content: bullet(s.risk_indicators) },
      { title: "Recommendations", content: bullet(s.recommendations) },
      { title: "Follow-up actions", content: bullet(s.follow_up_actions) },
    ],
  };
}

/**
 * Client-side visual stagger through the three agents while the real API
 * request is in flight. Purely cosmetic — the pipeline runs on the server.
 */
function animateStages(
  setJob: (j: JobStatus) => void,
  timerRef: React.MutableRefObject<number | null>,
) {
  const steps: JobStatus[] = [
    { status: "intake", stage_label: "Agent 1 · Intake" },
    { status: "normalising", stage_label: "Agent 2 · Normalisation" },
    { status: "generating", stage_label: "Agent 3 · PDF report" },
  ];
  let i = 0;
  const tick = () => {
    if (i >= steps.length) return;
    setJob(steps[i]);
    i++;
    timerRef.current = window.setTimeout(tick, 650);
  };
  tick();
}

// ---------- Report history (server-backed) ----------

function ReportHistoryCard({ refreshKey }: { refreshKey: number }) {
  const [reports, setReports] = useState<ApiReport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api
      .getReports(20)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Could not load history");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleDelete(id: string) {
    setLoadError(null);
    try {
      await api.deleteReport(id);
      setReports((prev) => (prev ? prev.filter((r) => r.id !== id) : null));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <Card className="rounded-3xl border-border/60 bg-card p-7 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-powder/50 text-charcoal">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-2xl leading-none tracking-tight">
              Report history
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-6">
          {loadError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {loadError}
            </div>
          ) : reports === null ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-stone/40" />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              No reports yet. Submit an intake above to generate the first one.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {reports.map((r) => {
                const s = r.structured_data;
                const title = s?.patient?.name ?? "Patient report";
                const summary = s?.patient_summary ?? "—";
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{title}</span>
                        <StatusPill status={r.status} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {summary}
                      </p>
                      {s?.clinical_terms && s.clinical_terms.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {s.clinical_terms.slice(0, 6).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-pink/25 px-2.5 py-0.5 text-[11px] font-medium text-charcoal"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40"
                        title="Delete report"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => api.downloadReport(r.id)}
                        disabled={r.status !== "complete"}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function StatusPill({ status }: { status: ApiReport["status"] }) {
  const config: Record<ApiReport["status"], { label: string; className: string }> = {
    complete: { label: "Complete", className: "bg-sage/40 text-charcoal" },
    processing: { label: "Processing", className: "bg-butter/50 text-charcoal" },
    pending: { label: "Pending", className: "bg-stone/50 text-charcoal" },
    error: { label: "Error", className: "bg-destructive/15 text-destructive" },
  };
  const c = config[status] ?? config.pending;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.className}`}
    >
      {c.label}
    </span>
  );
}