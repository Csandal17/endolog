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

// ---------- Reassurance banner data ----------

interface BannerContent {
  stat: string;
  message: string;
}

type BannerData = { key: string; stat: string; message: string } | null;

function getPainBanner(score: number): BannerContent {
  if (score === 0) {
    return {
      stat: "80% of women experience some form of pelvic discomfort in their lifetime.",
      message: "Taking a moment to check in with your body is a gentle act of self-care. Whatever you feel today is valid.",
    };
  }
  if (score <= 3) {
    return {
      stat: "Around 1 in 2 women experience mild to moderate pelvic pain during their cycle.",
      message: "Even mild signals from your body deserve attention. You're doing something kind by noticing and naming what you feel.",
    };
  }
  if (score <= 6) {
    return {
      stat: "Chronic pelvic pain affects roughly 1 in 6 women — it is one of the most common reasons women seek care.",
      message: "Moderate pain can be exhausting, and it's okay to acknowledge that. Tracking it helps you advocate for yourself with confidence.",
    };
  }
  if (score <= 9) {
    return {
      stat: "Severe period pain is experienced by up to 1 in 10 women — many say it took years to feel truly heard.",
      message: "Severe pain is not something you should have to endure in silence. Your experience is real, and you deserve thorough care and answers.",
    };
  }
  return {
    stat: "About 1 in 10 women live with pain so intense it disrupts daily life — yet it is still under-recognised in medicine.",
    message: "If you are in this much pain, please reach out to a clinician as soon as you can. You are not being dramatic. You are not alone.",
  };
}

const CHECKBOX_BANNERS: Record<string, BannerContent> = {
  Pelvis: {
    stat: "Pelvic pain is one of the most common reasons women visit a GP — it's incredibly common.",
    message: "Naming where it hurts is a powerful first step. You're building a clear story to share with your clinician.",
  },
  "Lower back": {
    stat: "Lower back pain is reported by up to 70% of women with pelvic conditions — the two are often linked.",
    message: "It can be so easy to dismiss back pain as 'just stress.' You're allowed to connect it to the bigger picture.",
  },
  "Lower abdomen (left)": {
    stat: "Left-sided abdominal pain has a wide range of causes, many of them treatable.",
    message: "Noticing the exact side helps your clinician build a much clearer picture. You're doing great.",
  },
  "Lower abdomen (right)": {
    stat: "Right-sided pain is one of the most documented locations in women's health assessments.",
    message: "Being precise about location gives your care team valuable information. Every detail you share matters.",
  },
  Legs: {
    stat: "Leg pain can be a referred symptom from pelvic conditions — it's more common than many realise.",
    message: "Pain that travels is real pain. You're not imagining the connection — and now it's on the record.",
  },
  "Rectum/back passage": {
    stat: "Bowel-related pelvic pain is experienced by many women, though it's rarely talked about openly.",
    message: "This can feel awkward to mention, but it's important clinical information. You're being brave and thorough.",
  },
  "Sudden — came on quickly": {
    stat: "Sudden-onset pain accounts for a significant portion of urgent women's health presentations.",
    message: "A quick change in how you feel can feel alarming. Trusting that instinct and logging it is exactly the right thing to do.",
  },
  "Gradual — built up slowly": {
    stat: "Gradual symptoms are how many long-term conditions first present — slow change is still meaningful change.",
    message: "It can be hard to notice something that creeps up. The fact that you're reflecting on it now shows real self-awareness.",
  },
  "In the days before my period": {
    stat: "Premenstrual symptoms affect up to 90% of women at some point — you are far from alone in this.",
    message: "The days before a period can feel heavy in so many ways. Noticing the pattern is a real gift to your future self.",
  },
  "During my period": {
    stat: "Period pain is the leading cause of missed school and work for women worldwide.",
    message: "Pain during your period is common, but that doesn't mean you have to accept it without support. You deserve relief.",
  },
  "In the days after my period": {
    stat: "Post-menstrual symptoms are reported by many women and are a recognised part of the cycle for some.",
    message: "Noticing what happens after bleeding stops is just as important. You're seeing the whole picture, not just the obvious part.",
  },
  "Around ovulation (mid-cycle)": {
    stat: "Ovulation pain, or 'mittelschmerz', is experienced by about 1 in 5 women.",
    message: "Mid-cycle sensations are easy to overlook. Logging them now gives your clinician a fuller understanding of your cycle.",
  },
  "No link to my cycle": {
    stat: "Pain that isn't cycle-linked is equally important to investigate — it deserves the same careful attention.",
    message: "Ruling out a cycle link is just as valuable as finding one. You're helping your clinician focus on the right questions.",
  },
  "I'm not sure": {
    stat: "Uncertainty is completely normal — most women say they haven't tracked symptoms closely before.",
    message: "You don't need to have all the answers right now. Starting to track is already a huge step forward.",
  },
  Cramping: {
    stat: "Cramping is the most commonly described period pain symptom across all age groups.",
    message: "That gripping, wave-like sensation is real and physical. Describing it as cramping gives your clinician a clear signal.",
  },
  Sharp: {
    stat: "Sharp, stabbing pain is one of the most distressing symptom types women report — and it's always worth investigating.",
    message: "Sharp pain can feel scary. Naming it precisely helps your care team understand the urgency and nature of what you're feeling.",
  },
  Stabbing: {
    stat: "Stabbing pain is a well-documented descriptor in endometriosis and adenomyosis assessments.",
    message: "That sudden, piercing quality matters. You're not exaggerating — you're describing something very real.",
  },
  Burning: {
    stat: "Burning sensations are commonly associated with nerve-related or inflammatory pelvic conditions.",
    message: "Burning is a specific and important symptom. Trust the word that fits what you feel.",
  },
  "Dull ache": {
    stat: "A persistent dull ache is how many women first notice something isn't quite right — it's often the earliest sign.",
    message: "Dull aches are easy to push through, but they deserve attention too. You are allowed to take this seriously.",
  },
  Throbbing: {
    stat: "Throbbing pain is frequently described in vascular and inflammatory pelvic conditions.",
    message: "That pulsing, rhythmic quality is a meaningful clinical detail. You're doing so well at describing your experience.",
  },
  Nausea: {
    stat: "Nausea alongside pelvic pain is reported by about 1 in 3 women with endometriosis.",
    message: "Feeling sick on top of everything else is really hard. It's not 'just stress' — it's a real symptom that belongs in your record.",
  },
  Bloating: {
    stat: "Bloating is one of the top three symptoms women with pelvic conditions report — it's extremely common.",
    message: "That uncomfortable, swollen feeling is more than just inconvenient. It matters, and you're right to include it.",
  },
  Fatigue: {
    stat: "Fatigue is reported by up to 80% of women living with chronic pelvic pain — it is a real, physical symptom.",
    message: "Being tired all the time is not a character flaw. It's a signal from your body that deserves just as much care as the pain itself.",
  },
  Dizziness: {
    stat: "Dizziness with pelvic pain can be linked to blood loss, hormonal shifts, or pain response — it's always worth noting.",
    message: "That lightheaded, unsteady feeling is not something to brush off. You're being smart to log it alongside everything else.",
  },
  "Pain when passing a bowel motion": {
    stat: "Pain during bowel movements is a recognised symptom in endometriosis and other pelvic conditions.",
    message: "This can feel embarrassing to mention, but it's one of the most helpful details you can share. You are being so thorough.",
  },
  "Pain when passing urine": {
    stat: "Urinary pain is common in many pelvic and bladder conditions — it's a symptom clinicians ask about for good reason.",
    message: "Burning or pain when peeing is a clear signal. You're not overthinking it — you're paying attention to what your body needs.",
  },
  "Heavy bleeding": {
    stat: "Heavy menstrual bleeding affects up to 1 in 3 women and is one of the most under-reported symptoms.",
    message: "If your bleeding feels like too much, trust that instinct. 'Heavy' is personal, and your experience is the only definition that matters.",
  },
  "Down the legs": {
    stat: "Leg radiation is a documented feature of several pelvic conditions, including endometriosis.",
    message: "Pain that travels down your legs is real and valid. You are not making this up — it's a recognised clinical pattern.",
  },
  "Towards the rectum/back passage": {
    stat: "Rectal pain radiation is a key symptom in deep infiltrating endometriosis assessments.",
    message: "This is one of the most specific symptoms you can report. Being open about it will help your clinician enormously.",
  },
  "Towards the vagina": {
    stat: "Vaginal pain radiation is commonly described in pelvic congestion and inflammatory conditions.",
    message: "It takes courage to name this. Your openness is helping build a complete and honest clinical picture.",
  },
  "Doesn't spread anywhere else": {
    stat: "Localised pain is just as medically significant as pain that spreads — location itself tells a story.",
    message: "Knowing that the pain stays in one place is valuable information. Every detail you notice is worth recording.",
  },
  Minutes: {
    stat: "Brief episodes of pelvic pain are common and can still be part of a meaningful pattern.",
    message: "Even pain that comes and goes quickly is worth noting. Patterns build over time, and every entry counts.",
  },
  Hours: {
    stat: "Pain lasting hours is one of the most commonly logged durations in women's symptom diaries.",
    message: "Hours of discomfort is a significant chunk of your day. You deserve care that takes that time seriously.",
  },
  Days: {
    stat: "Multi-day pelvic pain is a hallmark symptom of several common gynaecological conditions.",
    message: "When pain stretches across days, it affects everything. Acknowledging that impact is a brave and necessary step.",
  },
  "Constant, doesn't go away": {
    stat: "Chronic daily pelvic pain affects millions of women — constant pain is never something to ignore.",
    message: "Living with unrelenting pain is exhausting beyond words. Please keep advocating for yourself — you deserve answers and relief.",
  },
  "It's constant": {
    stat: "Constant pain is one of the strongest indicators that a symptom deserves thorough investigation.",
    message: "A pain that never lets up wears on more than just your body. You are allowed to want — and demand — answers.",
  },
  "It comes and goes": {
    stat: "Intermittent pain is how many conditions first present — the pattern is just as important as the intensity.",
    message: "Coming-and-going pain can be frustratingly easy to dismiss. Logging it gives you proof, and that proof is powerful.",
  },
  "Moving around": {
    stat: "Pain worsened by movement is a key diagnostic clue and is documented across many pelvic conditions.",
    message: "Noticing what makes it worse is real detective work. You're building a detailed, useful record.",
  },
  Sex: {
    stat: "Pain during sex is reported by up to 1 in 10 women — it is far more common than conversations suggest.",
    message: "This can feel deeply personal to share, but it's one of the most important symptoms to bring to your clinician. You are not alone in this.",
  },
  "Bowel movements": {
    stat: "Bowel-related pain is a well-documented symptom in pelvic assessment — it's a standard, important question.",
    message: "There's no shame in this. Clinicians ask about it because it matters. You're answering with honesty and strength.",
  },
  "Passing urine": {
    stat: "Urinary pain is one of the most common accompaniments to pelvic conditions in women.",
    message: "Pain when peeing is your body sending a clear signal. Trust it, and know that help is available.",
  },
  Exercise: {
    stat: "Exercise-triggered pelvic pain is increasingly recognised in sports medicine and women's health.",
    message: "Wanting to move your body but being held back by pain is frustrating. You're not weak — your body is asking for support.",
  },
  Rest: {
    stat: "Finding relief in rest is one of the most common self-management strategies women report.",
    message: "Rest is not laziness — it's a valid and important part of managing how you feel. Give yourself permission to slow down.",
  },
  "Heat (e.g. hot water bottle)": {
    stat: "Heat therapy is one of the oldest and most widely used comfort measures for pelvic pain.",
    message: "That gentle warmth is more than a comfort — it's a recognised, effective way to soothe cramping and tension. You know your body.",
  },
  "Painkillers (NSAIDs, e.g. ibuprofen)": {
    stat: "NSAIDs are the most commonly recommended first-line treatment for period pain worldwide.",
    message: "Reaching for pain relief is not weakness — it's self-care. You're allowed to seek comfort and support.",
  },
  "Hormonal contraception": {
    stat: "Hormonal treatments help many women manage cyclical symptoms — they are a well-established option.",
    message: "Finding what works for your body is a journey, not a failure. Every option you explore is a step toward understanding yourself better.",
  },
  "Haven't tried NSAIDs": {
    stat: "Many women haven't tried NSAIDs yet — it's completely okay to be at the beginning of your management journey.",
    message: "You don't need to have tried everything already. Starting to track and explore options is exactly where many women begin.",
  },
  "No relief at all": {
    stat: "When standard pain relief doesn't work, it's a strong signal that your symptoms deserve deeper investigation.",
    message: "If ibuprofen doesn't touch the pain, that's important information — not a failure on your part. Your clinician needs to know this.",
  },
  "Some relief, but pain continues": {
    stat: "Partial relief is one of the most common experiences — it tells your care team that something is working, but not enough.",
    message: "Some help is still help, but you deserve more than 'a bit better.' Keep pushing for answers that fully address what you feel.",
  },
  "Fully relieved": {
    stat: "Complete relief with NSAIDs is a useful diagnostic clue — it helps narrow down the type of pain you're experiencing.",
    message: "Full relief is wonderful news, and it's also medically useful. Your care team will value knowing this works for you.",
  },
};

function ReassuranceBanner({
  stat,
  message,
  onDismiss,
}: {
  stat: string;
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-powder/60 bg-powder/20 p-5"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-powder/60">
          <Sparkles className="h-4 w-4 text-charcoal" />
        </div>
        <div>
          <p className="text-sm font-semibold text-charcoal">{stat}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-warm-grey">{message}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        )}
      </div>
    </motion.div>
  );
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

  const [banner, setBanner] = useState<BannerData>(null);

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
                    setSocrates={setSocrates}
                    onPainScore={(n) => setForm((f) => ({ ...f, pain_score: n }))}
                    onPainDateTime={(v) => setForm((f) => ({ ...f, pain_recorded_at: v }))}
                    onPainDateTimeNow={() =>
                      setForm((f) => ({ ...f, pain_recorded_at: nowLocalDatetime() }))
                    }
                    submit={submit}
                    submitting={submitting}
                    error={error ?? job?.error ?? null}
                    onReset={() =>
                      setForm({
                        ...emptyForm,
                        pain_recorded_at: nowLocalDatetime(),
                        socrates: { ...emptySocrates },
                      })
                    }
                    banner={banner}
                    onShowBanner={(b) => setBanner({ key: `${Date.now()}`, ...b })}
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

      <footer className="border-t border-border/40 bg-background">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-muted-foreground">
          <p>Maai does not diagnose. Always consult a clinician.</p>
          <p className="mt-1">© 2026 Maai. Made with care.</p>
        </div>
      </footer>
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
        YOUR LOG
      </p>
      <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
        Tell us how you've been.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Describe it in your own words, however feels natural. Maai turns it into a clear record
        you can bring to your next appointment.
      </p>
    </div>
  );
}

function IntakeCard({
  form,
  update,
  setSocrates,
  onPainScore,
  onPainDateTime,
  onPainDateTimeNow,
  submit,
  submitting,
  error,
  onReset,
  banner,
  onShowBanner,
}: {
  form: IntakeForm;
  update: (k: keyof IntakeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setSocrates: (patch: Partial<SocratesAnswers>) => void;
  onPainScore: (n: number) => void;
  onPainDateTime: (v: string) => void;
  onPainDateTimeNow: () => void;
  submit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string | null;
  onReset: () => void;
  banner: BannerData;
  onShowBanner: (b: BannerContent) => void;
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
          onShowBanner={onShowBanner}
        />

        <SocratesFields
          answers={form.socrates}
          onChange={setSocrates}
          onShowBanner={onShowBanner}
        />

        <AnimatePresence>
          {banner?.stat && (
            <ReassuranceBanner
              key={banner.key}
              stat={banner.stat}
              message={banner.message}
              onDismiss={() => onShowBanner({ stat: "", message: "" })}
            />
          )}
        </AnimatePresence>

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
  onShowBanner,
}: {
  score: number;
  recordedAt: string;
  onScore: (n: number) => void;
  onDateTime: (v: string) => void;
  onNow: () => void;
  onShowBanner?: (b: BannerContent) => void;
}) {
  const initialScoreRef = useRef(score);
  const prevScoreRef = useRef(score);
  useEffect(() => {
    if (score !== prevScoreRef.current) {
      prevScoreRef.current = score;
      if (score !== initialScoreRef.current && onShowBanner) {
        onShowBanner(getPainBanner(score));
      }
    }
  }, [score, onShowBanner]);
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
          {score > 0 && (
            <span aria-hidden="true" className="font-medium" style={{ color: swatch }}>
              {label}
            </span>
          )}
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

// ============================================================
// SOCRATES questionnaire
// ============================================================

const SOCRATES_SECTIONS = {
  site: [
    "Pelvis",
    "Lower back",
    "Lower abdomen (left)",
    "Lower abdomen (right)",
    "Legs",
    "Rectum/back passage",
  ],
  onset: ["Sudden — came on quickly", "Gradual — built up slowly"],
  cycle_link: [
    "In the days before my period",
    "During my period",
    "In the days after my period",
    "Around ovulation (mid-cycle)",
    "No link to my cycle",
    "I'm not sure",
  ],
  character: ["Cramping", "Sharp", "Stabbing", "Burning", "Dull ache", "Throbbing"],
  associated: [
    "Nausea",
    "Bloating",
    "Fatigue",
    "Dizziness",
    "Pain when passing a bowel motion",
    "Pain when passing urine",
    "Heavy bleeding",
  ],
  radiation: [
    "Lower back",
    "Down the legs",
    "Towards the rectum/back passage",
    "Towards the vagina",
    "Doesn't spread anywhere else",
  ],
  duration: ["Minutes", "Hours", "Days", "Constant, doesn't go away"],
  pattern: ["It's constant", "It comes and goes"],
  worse: ["Moving around", "Sex", "Bowel movements", "Passing urine", "Exercise"],
  better: ["Rest", "Heat (e.g. hot water bottle)", "Painkillers (NSAIDs, e.g. ibuprofen)", "Hormonal contraception"],
  nsaid_relief: ["Haven't tried NSAIDs", "No relief at all", "Some relief, but pain continues", "Fully relieved"],
} as const;

function formatSocrates(a: SocratesAnswers): string {
  const lines: string[] = [];
  const push = (label: string, value: string | string[]) => {
    const v = Array.isArray(value) ? value.join(", ") : value;
    if (v && v.trim()) lines.push(`- ${label}: ${v}`);
  };
  const siteAll = [...a.site, ...(a.site_other.trim() ? [a.site_other.trim()] : [])];
  push("Site", siteAll);
  push("Onset", a.onset);
  push("Cycle link", a.cycle_link);
  push("Character", a.character);
  push("Associated symptoms", a.associated);
  push("Radiation", a.radiation);
  push("Duration", a.duration);
  push("Pattern", a.pattern);
  push("Worse with", a.worse);
  push("Better with", a.better);
  push("NSAID response", a.nsaid_relief);
  return lines.length ? `SOCRATES:\n${lines.join("\n")}` : "";
}

function SocratesFields({
  answers,
  onChange,
  onShowBanner,
}: {
  answers: SocratesAnswers;
  onChange: (patch: Partial<SocratesAnswers>) => void;
  onShowBanner?: (b: BannerContent) => void;
}) {
  const toggle = (key: keyof SocratesAnswers, value: string) => {
    const arr = answers[key] as string[];
    const isChecking = !arr.includes(value);
    const next = isChecking ? [...arr, value] : arr.filter((v) => v !== value);
    onChange({ [key]: next } as Partial<SocratesAnswers>);
    if (isChecking && onShowBanner) {
      const content = CHECKBOX_BANNERS[value];
      if (content) onShowBanner(content);
    }
  };
  const set = (key: keyof SocratesAnswers, value: string) => {
    // toggle-off if same option clicked again
    const current = answers[key] as string;
    const isSelecting = current !== value && value !== "";
    onChange({ [key]: current === value ? "" : value } as Partial<SocratesAnswers>);
    if (isSelecting && onShowBanner) {
      const content = CHECKBOX_BANNERS[value];
      if (content) onShowBanner(content);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-border/60 bg-muted/30 p-5">
      <div>
        <h3 className="font-serif text-xl leading-none tracking-tight">Log a symptom</h3>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Answer as best you can — you can skip anything that doesn't apply.
        </p>
      </div>

      <SocratesGroup title="Site — where is the pain?">
        {SOCRATES_SECTIONS.site.map((opt) => (
          <PillOption
            key={opt}
            type="check"
            label={opt}
            selected={answers.site.includes(opt)}
            onClick={() => toggle("site", opt)}
          />
        ))}
        <div className="pt-2">
          <Label className="text-[11px] font-medium uppercase tracking-wide text-warm-grey">
            Other site (optional)
          </Label>
          <Input
            className="mt-1.5 rounded-full bg-background"
            value={answers.site_other}
            onChange={(e) => onChange({ site_other: e.target.value })}
            placeholder="e.g. shoulder tip pain"
          />
        </div>
      </SocratesGroup>

      <SocratesGroup title="Onset — how did it start?">
        {SOCRATES_SECTIONS.onset.map((opt) => (
          <PillOption
            key={opt}
            type="radio"
            label={opt}
            selected={answers.onset === opt}
            onClick={() => set("onset", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="Onset — link to your cycle?">
        {SOCRATES_SECTIONS.cycle_link.map((opt) => (
          <PillOption
            key={opt}
            type="radio"
            label={opt}
            selected={answers.cycle_link === opt}
            onClick={() => set("cycle_link", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="Character — what does it feel like?">
        {SOCRATES_SECTIONS.character.map((opt) => (
          <PillOption
            key={opt}
            type="check"
            label={opt}
            selected={answers.character.includes(opt)}
            onClick={() => toggle("character", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="Anything else alongside the pain?">
        {SOCRATES_SECTIONS.associated.map((opt) => (
          <PillOption
            key={opt}
            type="check"
            label={opt}
            selected={answers.associated.includes(opt)}
            onClick={() => toggle("associated", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="Radiation — where does it spread to?">
        {SOCRATES_SECTIONS.radiation.map((opt) => (
          <PillOption
            key={opt}
            type="check"
            label={opt}
            selected={answers.radiation.includes(opt)}
            onClick={() => toggle("radiation", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="Timing — how long does it last?">
        {SOCRATES_SECTIONS.duration.map((opt) => (
          <PillOption
            key={opt}
            type="radio"
            label={opt}
            selected={answers.duration === opt}
            onClick={() => set("duration", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="Timing — pattern">
        {SOCRATES_SECTIONS.pattern.map((opt) => (
          <PillOption
            key={opt}
            type="radio"
            label={opt}
            selected={answers.pattern === opt}
            onClick={() => set("pattern", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="What makes it worse?">
        {SOCRATES_SECTIONS.worse.map((opt) => (
          <PillOption
            key={opt}
            type="check"
            label={opt}
            selected={answers.worse.includes(opt)}
            onClick={() => toggle("worse", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="What makes it better?">
        {SOCRATES_SECTIONS.better.map((opt) => (
          <PillOption
            key={opt}
            type="check"
            label={opt}
            selected={answers.better.includes(opt)}
            onClick={() => toggle("better", opt)}
          />
        ))}
      </SocratesGroup>

      <SocratesGroup title="If you've taken NSAIDs (e.g. ibuprofen), did they help?">
        {SOCRATES_SECTIONS.nsaid_relief.map((opt) => (
          <PillOption
            key={opt}
            type="radio"
            label={opt}
            selected={answers.nsaid_relief === opt}
            onClick={() => set("nsaid_relief", opt)}
          />
        ))}
      </SocratesGroup>
    </div>
  );
}

function SocratesGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-charcoal">{title}</h4>
      <div className="mt-2.5 space-y-2">{children}</div>
    </div>
  );
}

function PillOption({
  type,
  label,
  selected,
  onClick,
}: {
  type: "check" | "radio";
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={type === "radio" ? "radio" : "checkbox"}
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-full border px-4 py-2.5 text-left text-sm transition ${
        selected
          ? "border-primary bg-pink/30 text-charcoal"
          : "border-border/60 bg-background text-charcoal hover:border-primary/40"
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-5 w-5 shrink-0 place-items-center ${
          type === "radio" ? "rounded-full" : "rounded"
        } border ${selected ? "border-primary bg-background" : "border-warm-grey/60 bg-background"}`}
      >
        {selected &&
          (type === "radio" ? (
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          ))}
      </span>
      <span>{label}</span>
    </button>
  );
}