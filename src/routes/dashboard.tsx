import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Flame,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as api from "@/services/api";
import type { Report as ApiReport } from "@/services/api";
import { EmpathyBanner, EmpathyBannerStack, type SymptomKey } from "@/components/empathy-banner";

const PATHWAY_KEY = "maai:pathway";

function logToSymptomKeys(log: {
  siteDescriptors: Record<string, string[]>;
  wholeBody: string[];
  bleedingUnexpected: boolean | null;
  pain: number;
}): SymptomKey[] {
  const keys = new Set<SymptomKey>();
  const sites = Object.keys(log.siteDescriptors);
  if (sites.includes("Pelvis")) keys.add("pelvic-pain");
  if (sites.includes("Lower back")) keys.add("back-pain");
  if (sites.includes("Bowel")) keys.add("bowel");
  if (sites.includes("Bladder")) keys.add("bladder");
  if (sites.includes("During or after sex")) keys.add("pain-during-sex");
  if (log.wholeBody.includes("Fatigue")) keys.add("fatigue");
  if (log.wholeBody.includes("Bloating")) keys.add("bloating");
  if (log.wholeBody.includes("Bleeding") || log.bleedingUnexpected) keys.add("bleeding");
  if (keys.size === 0 && log.pain > 0) keys.add("period-pain");
  return Array.from(keys);
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Daily log · EndoHer" },
      { name: "description", content: "A calm daily check-in for endometriosis. Log today's pain, symptoms, and impact — see your patterns build over time." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

// ---------------- Palette (inline via style so we don't disturb design tokens) ----------------

const C = {
  // Aligned with the landing page palette (parchment / pink / powder / sage / butter)
  bg: "#F3EDE3",       // parchment background
  card: "#FFFFFF",
  text: "#141210",     // charcoal
  muted: "#646059",    // warm grey
  border: "#E8DFD1",
  accent: "#D098E4",   // soft pink (primary)
  deep: "#141210",     // charcoal for text on accent
  light: "#FBE9B8",    // soft butter for highlights
  pink: "#D098E4",
  green: "#9AAB63",    // sage green (bolder for severity dot)
  greenSoft: "#D6E1B4",// sage tint (for backgrounds/chips)
  blue: "#B6CAEB",     // powder blue
  red: "#B8443A",      // deep warm red for severe / flare
  redSoft: "#F4D7D2",  // red tint for backgrounds
  moderate: "#D9A441", // amber/gold for moderate severity
  flareBand: "#FBE9B8",// soft butter band behind confirmed flare episodes
};

// Interpolate the pain-score chip from soft yellow (0) → deep red (10).
function painChipColors(pain: number): { bg: string; fg: string } {
  const t = Math.max(0, Math.min(10, pain)) / 10;
  // yellow #F5C542 → red #B8443A
  const from = { r: 0xf5, g: 0xc5, b: 0x42 };
  const to = { r: 0xb8, g: 0x44, b: 0x3a };
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  const bg = `rgb(${r}, ${g}, ${b})`;
  // Switch to white text once the chip gets dark enough for contrast.
  const fg = t > 0.5 ? "#FFFFFF" : "#141210";
  return { bg, fg };
}

// Map an average pain value (0–10) to the same severity buckets shown in
// the weekly log legend (Mild / Moderate / Severe).
function painSeverityColor(pain: number): string {
  if (pain <= 0) return "#CFC7BA"; // unlogged / no pain
  if (pain < 4) return C.green;
  if (pain < 7) return C.moderate;
  return C.red;
}

// ---------------- Data model ----------------

const PAIN_SITES = [
  { key: "Pelvis", options: ["Cramping", "Stabbing", "Burning", "Dull ache", "Pressure"] },
  { key: "Lower back", options: ["Cramping", "Dull ache", "Radiating to legs", "Stabbing"] },
  { key: "Bowel", options: ["Pain with bowel movements", "Diarrhoea", "Constipation", "Bloating"] },
  { key: "Bladder", options: ["Pain when urinating", "Urgency", "Frequency"] },
  { key: "During or after sex", options: ["Deep pain", "Ache afterwards", "Bleeding afterwards"] },
] as const;

const WHOLE_BODY = ["Bloating", "Nausea", "Fatigue", "Dizziness", "Bleeding"] as const;

const IMPACT_OPTIONS = [
  { label: "No", value: 0 as const },
  { label: "Some things", value: 15 as const },
  { label: "Most things", value: 25 as const },
];

const MED_EFFECT = ["Helped", "Partly", "No effect"] as const;

type MedEffect = (typeof MED_EFFECT)[number] | null;
type Impact = 0 | 15 | 25;

type DailyLog = {
  id: string;
  date: string; // YYYY-MM-DD
  loggedAt: string; // ISO
  pain: number; // 0-10
  siteDescriptors: Record<string, string[]>;
  wholeBody: string[];
  bleedingUnexpected: boolean | null;
  otherSymptoms: string;
  impact: Impact;
  impactChosen: boolean;
  medicationName: string;
  medicationEffect: MedEffect;
  detail: {
    worse: string;
    better: string;
    timing: string;
    pattern: string;
    cycleLink: string;
  };
  burden: number;
};

const LOGS_KEY = "maai:daily-logs:v1";

export function readLogs(): DailyLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DailyLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeLogs(next: DailyLog[]) {
  try {
    window.localStorage.setItem(LOGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

// ---------------- Scoring ----------------

type ScoreBreakdown = {
  pain: number;
  impact: number;
  symptoms: number;
  bleeding: number;
  total: number;
  severity: "No symptoms" | "Mild" | "Moderate" | "Severe";
  symptomCount: number;
};

function calcScore(input: {
  pain: number;
  siteDescriptors: Record<string, string[]>;
  wholeBody: string[];
  bleedingUnexpected: boolean | null;
  impact: Impact;
}): ScoreBreakdown {
  const painPts = input.pain * 5;
  const impactPts = input.pain >= 4 ? input.impact : 0;

  // Symptom points: whole body + bowel/bladder/sex site descriptors count.
  // Pain-character descriptors (cramping, stabbing, burning, dull ache, radiating to legs) do NOT count.
  const painCharacter = new Set([
    "Cramping",
    "Stabbing",
    "Burning",
    "Dull ache",
    "Radiating to legs",
  ]);
  let symptomCount = input.wholeBody.length;
  for (const [, descs] of Object.entries(input.siteDescriptors)) {
    for (const d of descs) {
      if (!painCharacter.has(d)) symptomCount += 1;
    }
  }
  const symptomPts = Math.min(15, symptomCount * 3);
  const bleedingPts = input.bleedingUnexpected ? 10 : 0;

  const total = Math.min(100, painPts + impactPts + symptomPts + bleedingPts);
  const severity: ScoreBreakdown["severity"] =
    total === 0 ? "No symptoms" : total < 25 ? "Mild" : total < 50 ? "Moderate" : "Severe";

  return {
    pain: painPts,
    impact: impactPts,
    symptoms: symptomPts,
    bleeding: bleedingPts,
    total,
    severity,
    symptomCount,
  };
}

function severityColor(s: ScoreBreakdown["severity"]): string {
  if (s === "No symptoms") return C.greenSoft;
  if (s === "Mild") return C.green;
  if (s === "Moderate") return C.light;
  return C.red;
}

// ---------------- Flare logic ----------------

type FlareState =
  | { kind: "locked"; message: string }
  | { kind: "below"; threshold: number; message: string }
  | { kind: "elevated"; threshold: number; message: string }
  | { kind: "confirms"; threshold: number; message: string };

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function computeBaseline(logs: DailyLog[], onDate: string): { baseline: number | null; sample: number } {
  const cutoff = new Date(onDate);
  const start = new Date(cutoff);
  start.setDate(start.getDate() - 30);
  const within = logs.filter((l) => {
    const d = new Date(l.date);
    return d < cutoff && d >= start;
  });
  if (within.length < 14) return { baseline: null, sample: within.length };
  return { baseline: median(within.map((l) => l.burden)), sample: within.length };
}

function flareThreshold(baseline: number | null): number | null {
  if (baseline == null) return null;
  return Math.max(baseline + 15, 50);
}

function evaluateFlare(logs: DailyLog[], todayScore: number, today: string): FlareState {
  const { baseline, sample } = computeBaseline(logs, today);
  if (baseline == null) {
    return {
      kind: "locked",
      message: `Your personal baseline unlocks after 14 logged days (${sample}/14).`,
    };
  }
  const threshold = flareThreshold(baseline)!;
  const elevated = todayScore > threshold;
  if (!elevated) {
    return { kind: "below", threshold, message: "Below your flare threshold." };
  }
  // Was yesterday or day-before elevated (allowing 1-day bridge)?
  const priorElevated = logs.some((l) => {
    if (l.burden <= threshold) return false;
    const diff = daysBetween(l.date, today);
    return diff >= 1 && diff <= 2;
  });
  if (priorElevated) {
    return {
      kind: "confirms",
      threshold,
      message: "Logging this confirms a flare episode.",
    };
  }
  return {
    kind: "elevated",
    threshold,
    message:
      "Above your flare threshold. If tomorrow is also elevated, a flare episode will be confirmed.",
  };
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round(Math.abs(db - da) / 86400000);
}

// Given all logs, determine which log ids belong to a confirmed flare episode.
function flareEpisodeIds(logs: DailyLog[]): { ids: Set<string>; episodes: string[][] } {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const ids = new Set<string>();
  const episodes: string[][] = [];
  let current: DailyLog[] = [];
  const flush = () => {
    if (current.length >= 2) {
      episodes.push(current.map((c) => c.id));
      current.forEach((c) => ids.add(c.id));
    }
    current = [];
  };
  for (const log of sorted) {
    const { baseline } = computeBaseline(sorted, log.date);
    const thr = flareThreshold(baseline);
    if (thr == null || log.burden <= thr) {
      // Allow 1-day gap: check if next log within 2 days would extend
      const last = current[current.length - 1];
      if (last && daysBetween(last.date, log.date) <= 2) {
        continue;
      }
      flush();
      continue;
    }
    if (current.length === 0) {
      current.push(log);
    } else {
      const last = current[current.length - 1];
      if (daysBetween(last.date, log.date) <= 2) current.push(log);
      else {
        flush();
        current.push(log);
      }
    }
  }
  flush();
  return { ids, episodes };
}

// ---------------- Dashboard root ----------------

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function emptyLog(): DailyLog {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    date: todayStr(),
    loggedAt: new Date().toISOString(),
    pain: 0,
    siteDescriptors: {},
    wholeBody: [],
    bleedingUnexpected: null,
    otherSymptoms: "",
    impact: 0,
    impactChosen: false,
    medicationName: "",
    medicationEffect: null,
    detail: { worse: "", better: "", timing: "", pattern: "", cycleLink: "" },
    burden: 0,
  };
}

function Dashboard() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [pathway, setPathway] = useState<"suspected" | "diagnosed" | null>(null);
  const [showPathway, setShowPathway] = useState(false);

  useEffect(() => {
    setLogs(readLogs());
    try {
      const stored = window.localStorage.getItem(PATHWAY_KEY) as
        | "suspected"
        | "diagnosed"
        | null;
      if (stored) setPathway(stored);
      else setShowPathway(true);
    } catch {
      setShowPathway(true);
    }
  }, []);

  function saveLog(entry: DailyLog) {
    setLogs((prev) => {
      const next = [entry, ...prev].slice(0, 365);
      writeLogs(next);
      return next;
    });
  }
  function deleteLog(id: string) {
    setLogs((prev) => {
      const next = prev.filter((l) => l.id !== id);
      writeLogs(next);
      return next;
    });
  }
  function clearLogs() {
    setLogs([]);
    writeLogs([]);
  }

  return (
    <div style={{ background: C.bg, color: C.text }} className="min-h-screen font-[Karla,system-ui,sans-serif]">
        <TopBar current="daily" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {pathway && (
          <div className="mb-4 flex items-center justify-between rounded-full border px-4 py-2 text-xs"
               style={{ borderColor: C.border, background: "#fff", color: C.muted }}>
            <span>
              Pathway:{" "}
              <span style={{ color: C.text, fontWeight: 600 }}>
                {pathway === "diagnosed" ? "Diagnosed endometriosis" : "Suspected endometriosis"}
              </span>
            </span>
            <div className="flex items-center gap-3">
              {pathway === "diagnosed" && (
                <Link to="/diagnosis-profile" className="underline" style={{ color: C.text }}>
                  Edit diagnosis profile
                </Link>
              )}
              <button
                type="button"
                onClick={() => setShowPathway(true)}
                className="underline"
                style={{ color: C.muted }}
              >
                Change
              </button>
            </div>
          </div>
        )}
        <header className="mb-6 sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: C.muted }}>
            Daily log
          </p>
          <h1
            className="mt-2 text-3xl leading-tight sm:text-4xl"
            style={{ fontFamily: "Fraunces, DM Serif Display, Georgia, serif", color: C.text }}
          >
            How has today been?
          </h1>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            A short check-in. Answer what you can, skip what you can't — it all builds your pattern.
          </p>
        </header>

        <section className="mb-8">
          <WeeklyLog logs={logs} onDelete={deleteLog} onClear={clearLogs} />
        </section>

        <DailyLogSection onSave={saveLog} onGeneratedReport={() => setHistoryRefresh((k) => k + 1)} logs={logs} />

        <footer className="mt-12 pb-6 text-center text-xs" style={{ color: C.muted }}>
          <p>EndoHer does not diagnose. Always consult a clinician.</p>
          <p className="mt-1">© 2026 EndoHer. Made with care.</p>
        </footer>
      </main>
      {showPathway && (
        <PathwayModal
          onSuspected={() => {
            try { window.localStorage.setItem(PATHWAY_KEY, "suspected"); } catch { /* ignore */ }
            setPathway("suspected");
            setShowPathway(false);
          }}
          onDiagnosed={() => {
            try { window.localStorage.setItem(PATHWAY_KEY, "diagnosed"); } catch { /* ignore */ }
            setPathway("diagnosed");
            setShowPathway(false);
          }}
          onClose={pathway ? () => setShowPathway(false) : undefined}
        />
      )}
    </div>
  );
}

function PathwayModal({
  onSuspected,
  onDiagnosed,
  onClose,
}: {
  onSuspected: () => void;
  onDiagnosed: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      style={{ background: "rgba(20,18,16,0.45)" }}
      role="dialog"
      aria-modal
    >
      <div
        className="w-full max-w-lg rounded-3xl border p-6 sm:p-8"
        style={{ background: "#fff", borderColor: C.border }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: C.muted }}>
          Before you start
        </p>
        <h2 className="mt-2 text-2xl" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
          Where are you in your endometriosis journey?
        </h2>
        <p className="mt-2 text-sm" style={{ color: C.muted }}>
          This helps EndoHer tailor what you see. You can change it any time.
        </p>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={onSuspected}
            className="rounded-2xl border p-4 text-left active:scale-[0.99] transition-transform"
            style={{ borderColor: C.border, background: "#fff" }}
          >
            <p className="text-base font-semibold" style={{ color: C.text }}>
              I suspect endometriosis
            </p>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              Go straight to daily logging in three quick steps.
            </p>
          </button>
          <Link
            to="/diagnosis-profile"
            onClick={onDiagnosed}
            className="rounded-2xl border p-4 text-left active:scale-[0.99] transition-transform"
            style={{ borderColor: C.accent, background: C.pink + "22" }}
          >
            <p className="text-base font-semibold" style={{ color: C.text }}>
              I'm diagnosed with endometriosis
            </p>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              Add your diagnosis details so tracking and doctor summaries are personalised.
            </p>
          </Link>
        </div>

        {onClose && (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="text-xs underline"
              style={{ color: C.muted }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TopBar({ current }: { current?: "daily" | "summary" } = {}) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{ borderColor: C.border, background: `${C.bg}dd` }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="grid h-9 w-9 place-items-center rounded-2xl text-sm"
            style={{ background: C.accent, color: "#fff", fontFamily: "Fraunces, serif" }}
          >
            M
          </div>
          <span style={{ fontFamily: "Fraunces, serif" }} className="text-lg tracking-tight">
            EndoHer
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            to="/dashboard"
            style={{ color: current === "daily" ? C.text : C.muted, fontWeight: current === "daily" ? 600 : 400 }}
          >
            Daily log
          </Link>
          <Link
            to="/summary"
            style={{ color: current === "summary" ? C.text : C.muted, fontWeight: current === "summary" ? 600 : 400 }}
          >
            Summary
          </Link>
          <Link to="/" className="inline-flex items-center gap-1" style={{ color: C.muted }}>
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------- Daily log 3-step wizard ----------------

function DailyLogSection({
  onSave,
  onGeneratedReport: _onGeneratedReport,
  logs,
}: {
  onSave: (log: DailyLog) => void;
  onGeneratedReport: () => void;
  logs: DailyLog[];
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [log, setLog] = useState<DailyLog>(() => emptyLog());
  const [confirmed, setConfirmed] = useState<DailyLog | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const score = useMemo(
    () =>
      calcScore({
        pain: log.pain,
        siteDescriptors: log.siteDescriptors,
        wholeBody: log.wholeBody,
        bleedingUnexpected: log.bleedingUnexpected,
        impact: log.impactChosen ? log.impact : 0,
      }),
    [log],
  );

  const flare = useMemo(
    () => evaluateFlare(logs, score.total, log.date),
    [logs, score.total, log.date],
  );

  function update(patch: Partial<DailyLog>) {
    setLog((prev) => ({ ...prev, ...patch }));
  }
  function toggleDescriptor(site: string, d: string) {
    setLog((prev) => {
      const current = prev.siteDescriptors[site] ?? [];
      const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
      return { ...prev, siteDescriptors: { ...prev.siteDescriptors, [site]: next } };
    });
  }
  function toggleSite(site: string) {
    setLog((prev) => {
      const has = site in prev.siteDescriptors;
      const next = { ...prev.siteDescriptors };
      if (has) delete next[site];
      else next[site] = [];
      return { ...prev, siteDescriptors: next };
    });
  }
  function toggleWhole(s: string) {
    setLog((prev) => {
      const has = prev.wholeBody.includes(s);
      const nextArr = has ? prev.wholeBody.filter((x) => x !== s) : [...prev.wholeBody, s];
      return {
        ...prev,
        wholeBody: nextArr,
        bleedingUnexpected: s === "Bleeding" && has ? null : prev.bleedingUnexpected,
      };
    });
  }

  function submit() {
    const final: DailyLog = { ...log, burden: score.total, loggedAt: new Date().toISOString() };
    onSave(final);
    setConfirmed(final);
  }

  function startOver() {
    setConfirmed(null);
    setLog(emptyLog());
    setStep(1);
    setShowDetail(false);
  }

  if (confirmed) {
    return <ConfirmationCard log={confirmed} onBack={startOver} />;
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <SoftCard>
          <StepHeader step={step} />
          {step === 1 && (
            <Step1
              pain={log.pain}
              onPain={(v) => update({ pain: v })}
              onContinue={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2
              log={log}
              onToggleSite={toggleSite}
              onToggleDescriptor={toggleDescriptor}
              onToggleWhole={toggleWhole}
              onBleeding={(v) => update({ bleedingUnexpected: v })}
              onOther={(v) => update({ otherSymptoms: v })}
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3
              log={log}
              onImpact={(v) => update({ impact: v, impactChosen: true })}
              onMedName={(v) => update({ medicationName: v })}
              onMedEffect={(v) => update({ medicationEffect: v })}
              onBack={() => setStep(2)}
              onSubmit={submit}
            />
          )}
        </SoftCard>

        <SoftCard>
          <button
            type="button"
            onClick={() => setShowDetail((s) => !s)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <div
                className="text-base"
                style={{ fontFamily: "Fraunces, serif", color: C.text }}
              >
                Add more detail for your report
              </div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                Optional. Won't change your burden score.
              </div>
            </div>
            {showDetail ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {showDetail && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailField label="What made it worse?" value={log.detail.worse}
                onChange={(v) => update({ detail: { ...log.detail, worse: v } })} />
              <DetailField label="What made it better?" value={log.detail.better}
                onChange={(v) => update({ detail: { ...log.detail, better: v } })} />
              <DetailField label="Timing" value={log.detail.timing}
                onChange={(v) => update({ detail: { ...log.detail, timing: v } })} />
              <DetailField label="Pattern" value={log.detail.pattern}
                onChange={(v) => update({ detail: { ...log.detail, pattern: v } })} />
              <div className="sm:col-span-2">
                <DetailField label="Cycle link" value={log.detail.cycleLink}
                  onChange={(v) => update({ detail: { ...log.detail, cycleLink: v } })} />
              </div>
            </div>
          )}
        </SoftCard>
      </div>

      <BurdenPanel score={score} flare={flare} />
    </div>
  );
}

function StepHeader({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
        <span>Step {step} of 3</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-1.5 flex-1 rounded-full transition-all"
            style={{ background: n <= step ? C.accent : C.border }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------- Step 1: pain ----------------

function Step1({
  pain,
  onPain,
  onContinue,
}: {
  pain: number;
  onPain: (n: number) => void;
  onContinue: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const openTip = () => setShowTip(true);
  const closeTip = () => setShowTip(false);
  const pct = Math.max(0, Math.min(100, pain * 10));
  return (
    <div>
      <h2 className="text-2xl leading-snug" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
        Pain during the day
      </h2>
      <p className="mt-2 text-sm" style={{ color: C.muted }}>
        Your overall pain experience across today — not just this moment.
      </p>

      <div className="mt-8 flex items-center gap-5">
        <div className="flex-1">
          <div
            className="relative"
            onPointerEnter={openTip}
            onPointerDown={openTip}
            onPointerLeave={closeTip}
            onPointerUp={closeTip}
            onPointerCancel={closeTip}
            onFocusCapture={openTip}
            onBlurCapture={closeTip}
            onTouchStart={openTip}
            onTouchEnd={closeTip}
          >
            <PainTooltip value={pain} pct={pct} visible={showTip} />
            <Slider
              value={[pain]}
              min={0}
              max={10}
              step={1}
              onValueChange={([v]) => {
                setShowTip(true);
                onPain(v);
              }}
            />
          </div>
          <div className="mt-3 flex justify-between text-xs" style={{ color: C.muted }}>
            <span>No pain</span>
            <span>Worst imaginable</span>
          </div>
        </div>
        {(() => {
          const { bg, fg } = painChipColors(pain);
          return (
            <div
              className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl transition-colors duration-300"
              style={{ background: bg, color: fg, fontFamily: "Fraunces, serif" }}
              aria-label={`Pain rating ${pain} out of 10`}
            >
              <span className="text-4xl">{pain}</span>
            </div>
          );
        })()}
      </div>

      <div className="mt-8 flex justify-end">
        <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
      </div>
    </div>
  );
}

const PAIN_TOOLTIP_MESSAGES: Record<number, string> = {
  0: "No pain today. This is useful information too.",
  1: "Mild discomfort. Small changes can still help show your pattern.",
  2: "Low pain logged. Recording it early helps build your symptom history.",
  3: "Mild to moderate pain. Let's note where it was and what it felt like.",
  4: "Moderate pain. We'll ask a few quick follow-up questions.",
  5: "Noticeable pain. Let's capture the location, symptoms, and what helped.",
  6: "Strong pain. We'll record this clearly in your symptom history.",
  7: "Severe pain. This is a high-burden day, so let's capture the details.",
  8: "Very severe pain. You should not have to explain this from memory later.",
  9: "Extremely severe pain. This is important to record clearly.",
  10: "Worst pain. We'll help you document this for future clinical review.",
};

function PainTooltip({ value, pct, visible }: { value: number; pct: number; visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none absolute left-0 right-0 z-20"
      style={{ top: 0 }}
    >
      <div className="relative h-0">
        <div
          className="absolute"
          style={{
            left: `${pct}%`,
            bottom: 12,
            transform: value <= 1 ? "translateX(0)" : "translateX(-50%)",
            maxWidth: 200,
            width: "max-content",
            opacity: visible ? 0.92 : 0,
            transition: "opacity 180ms ease",
          }}
        >
          <div
            className="rounded-xl border px-3 py-2 shadow-md"
            style={{
              background: "#FFFDF7",
              borderColor: "#E8DFD1",
              color: "#3B1F2B",
              boxShadow: "0 6px 18px rgba(59,31,43,0.12)",
            }}
          >
            <p className="text-center text-[13px] font-semibold leading-tight" style={{ color: "#3B1F2B" }}>
              Pain {value} out of 10
            </p>
            <p className="mt-1 text-center text-[12px] leading-snug" style={{ color: "#5A3B48" }}>
              {PAIN_TOOLTIP_MESSAGES[value]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Step 2: where + what ----------------

function Step2({
  log,
  onToggleSite,
  onToggleDescriptor,
  onToggleWhole,
  onBleeding,
  onOther,
  onBack,
  onContinue,
}: {
  log: DailyLog;
  onToggleSite: (site: string) => void;
  onToggleDescriptor: (site: string, d: string) => void;
  onToggleWhole: (s: string) => void;
  onBleeding: (v: boolean) => void;
  onOther: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const showSites = log.pain > 0;
  const showBleedingFollowUp = log.wholeBody.includes("Bleeding");

  return (
    <div>
      <h2 className="text-2xl leading-snug" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
        Where, and what does it feel like?
      </h2>
      <p className="mt-2 text-sm" style={{ color: C.muted }}>
        Tap what applies. We'll tuck follow-up questions under each choice.
      </p>

      {showSites && (
        <div className="mt-6">
          <SectionLabel>Pain site</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {PAIN_SITES.map((s) => (
              <Chip
                key={s.key}
                selected={s.key in log.siteDescriptors}
                onClick={() => onToggleSite(s.key)}
              >
                {s.key}
              </Chip>
            ))}
          </div>
          <div className="mt-3 space-y-3">
            {PAIN_SITES.map((s) =>
              s.key in log.siteDescriptors ? (
                <NestedCard key={s.key} title={s.key}>
                  <div className="flex flex-wrap gap-2">
                    {s.options.map((opt) => (
                      <Chip
                        key={opt}
                        size="sm"
                        selected={(log.siteDescriptors[s.key] ?? []).includes(opt)}
                        onClick={() => onToggleDescriptor(s.key, opt)}
                      >
                        {opt}
                      </Chip>
                    ))}
                  </div>
                </NestedCard>
              ) : null,
            )}
          </div>
        </div>
      )}

      <div className="mt-6">
        <SectionLabel>Whole body symptoms</SectionLabel>
        <div className="mt-3 flex flex-wrap gap-2">
          {WHOLE_BODY.map((s) => (
            <Chip key={s} selected={log.wholeBody.includes(s)} onClick={() => onToggleWhole(s)}>
              {s}
            </Chip>
          ))}
        </div>
        {showBleedingFollowUp && (
          <NestedCard title="Is this bleeding outside your expected period window?" className="mt-3">
            <div className="flex gap-2">
              <Chip selected={log.bleedingUnexpected === true} onClick={() => onBleeding(true)}>
                Yes
              </Chip>
              <Chip selected={log.bleedingUnexpected === false} onClick={() => onBleeding(false)}>
                No
              </Chip>
            </div>
          </NestedCard>
        )}
      </div>

      <div className="mt-6">
        <SectionLabel>Other symptoms</SectionLabel>
        <Textarea
          value={log.otherSymptoms}
          onChange={(e) => onOther(e.target.value)}
          rows={3}
          placeholder="Anything not listed, for example headaches or spotting."
          className="mt-2 resize-none rounded-2xl"
          style={{ background: "#fff", borderColor: C.border, color: C.text }}
        />
      </div>

      {(() => {
        const keys = logToSymptomKeys(log);
        if (keys.length === 0) return null;
        return (
          <div className="mt-6">
            <EmpathyBanner symptom={keys[0]} />
          </div>
        );
      })()}

      <div className="mt-8 flex justify-between">
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
      </div>
    </div>
  );
}

// ---------------- Step 3: impact + medication ----------------

function Step3({
  log,
  onImpact,
  onMedName,
  onMedEffect,
  onBack,
  onSubmit,
}: {
  log: DailyLog;
  onImpact: (v: Impact) => void;
  onMedName: (v: string) => void;
  onMedEffect: (v: MedEffect) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <h2 className="text-2xl leading-snug" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
        Did symptoms stop you doing anything today?
      </h2>

      <div className="mt-5 flex flex-wrap gap-2">
        {IMPACT_OPTIONS.map((opt) => (
          <Chip
            key={opt.label}
            selected={log.impactChosen && log.impact === opt.value}
            onClick={() => onImpact(opt.value)}
          >
            {opt.label}
          </Chip>
        ))}
      </div>

      <div className="mt-8">
        <h3 className="text-lg" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
          Took any medication for it?
        </h3>
        <Input
          value={log.medicationName}
          onChange={(e) => onMedName(e.target.value)}
          placeholder="Name it, for example ibuprofen 400mg or heat pack."
          className="mt-3 rounded-full"
          style={{ background: "#fff", borderColor: C.border, color: C.text }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {MED_EFFECT.map((e) => (
            <Chip
              key={e}
              selected={log.medicationEffect === e}
              onClick={() => onMedEffect(log.medicationEffect === e ? null : e)}
            >
              {e}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onSubmit}>Log today</PrimaryButton>
      </div>
    </div>
  );
}

// ---------------- Confirmation ----------------

function ConfirmationCard({ log, onBack }: { log: DailyLog; onBack: () => void }) {
  const score = calcScore({
    pain: log.pain,
    siteDescriptors: log.siteDescriptors,
    wholeBody: log.wholeBody,
    bleedingUnexpected: log.bleedingUnexpected,
    impact: log.impactChosen ? log.impact : 0,
  });
  const symptomKeys = logToSymptomKeys(log);
  return (
    <SoftCard>
      <div className="grid place-items-center py-6 text-center">
        <Flower severity={score.severity} size={72} />
        <h2 className="mt-5 text-2xl" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
          Logged, see you tomorrow.
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>
          {new Date(log.loggedAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
        </p>
        <div className="mt-6 flex items-baseline gap-2">
          <span style={{ fontFamily: "Fraunces, serif", color: C.deep }} className="text-5xl">
            {score.total}
          </span>
          <span className="text-sm" style={{ color: C.muted }}>/ 100</span>
        </div>
        <SeverityPill severity={score.severity} />

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <GhostButton onClick={onBack}>Back to daily log</GhostButton>
          <Link
            to="/summary"
            hash="report-preview"
            className="inline-flex items-center rounded-full px-6 py-2 text-sm font-medium"
            style={{ background: C.accent, color: C.deep }}
          >
            View report preview
          </Link>
        </div>

        {symptomKeys.length > 0 && (
          <div className="mt-8 w-full text-left">
            <EmpathyBannerStack symptoms={symptomKeys} />
          </div>
        )}
      </div>
    </SoftCard>
  );
}

// ---------------- Burden panel ----------------

function BurdenPanel({ score, flare }: { score: ScoreBreakdown; flare: FlareState }) {
  return (
    <div className="md:sticky md:top-20">
      <SoftCard>
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: C.muted }}>
          Today's burden score
        </p>
        <div className="mt-3 flex items-center gap-4">
          <Flower severity={score.severity} size={56} />
          <div>
            <div className="flex items-baseline gap-1.5">
              <span
                style={{ fontFamily: "Fraunces, serif", color: C.deep }}
                className="text-4xl leading-none"
              >
                {score.total}
              </span>
              <span className="text-sm" style={{ color: C.muted }}>/ 100</span>
            </div>
            <SeverityPill severity={score.severity} />
          </div>
        </div>

        <div className="mt-5 h-2 w-full overflow-hidden rounded-full" style={{ background: C.border }}>
          <div
            className="h-full transition-all"
            style={{ width: `${score.total}%`, background: C.accent }}
          />
        </div>

        <ul className="mt-5 space-y-2 text-sm" style={{ color: C.text }}>
          <BreakdownRow label={`Pain × 5`} value={score.pain} />
          <BreakdownRow label="Impact" value={score.impact} />
          <BreakdownRow
            label={`Symptoms +3 each (cap 15)`}
            value={score.symptoms}
            hint={`${score.symptomCount} counted`}
          />
          <BreakdownRow label="Unexpected bleeding" value={score.bleeding} />
        </ul>

        <FlareMessage flare={flare} />
      </SoftCard>
    </div>
  );
}

function BreakdownRow({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span style={{ color: C.muted }}>
        {label}
        {hint && <span className="ml-1 text-xs">({hint})</span>}
      </span>
      <span style={{ color: C.text, fontFamily: "Fraunces, serif" }}>+{value}</span>
    </li>
  );
}

function FlareMessage({ flare }: { flare: FlareState }) {
  const bg =
    flare.kind === "confirms"
      ? C.pink
      : flare.kind === "elevated"
        ? C.light
        : flare.kind === "below"
          ? C.green
          : C.blue;
  return (
    <div
      className="mt-5 flex items-start gap-2 rounded-2xl p-3 text-xs"
      style={{ background: bg, color: C.text }}
    >
      <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{flare.message}</span>
    </div>
  );
}

// ---------------- Weekly log ----------------

function WeeklyLog({
  logs,
  onDelete,
  onClear,
}: {
  logs: DailyLog[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [openLog, setOpenLog] = useState<DailyLog | null>(null);
  const flare = useMemo(() => flareEpisodeIds(logs), [logs]);
  const days = useMemo(() => buildWeekDays(logs, weekOffset), [logs, weekOffset]);
  const today = todayStr();
  const todayLogs = logs.filter((l) => l.date === today);
  const todayScore = todayLogs.length ? Math.max(...todayLogs.map((l) => l.burden)) : 0;
  const { baseline } = computeBaseline(logs, today);
  const threshold = flareThreshold(baseline);
  const yesterday = shiftDate(today, -1);
  const yLogs = logs.filter((l) => l.date === yesterday);
  const yPeak = yLogs.length ? Math.max(...yLogs.map((l) => l.burden)) : null;
  const yElevated = threshold != null && yPeak != null && yPeak > threshold;
  const yConfirmed = yElevated && flare.ids.has(yLogs.find((l) => l.burden === yPeak)!.id);

  const rangeLabel = weekLabel(weekOffset);

  return (
    <SoftCard>
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: C.muted }}>
          Weekly log
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="grid h-8 w-8 place-items-center rounded-full border"
            style={{ borderColor: C.border, color: C.text, background: "#fff" }}
            aria-label="Previous week"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold" style={{ color: C.text }}>
            {rangeLabel}
          </span>
          <button
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset >= 0}
            className="grid h-8 w-8 place-items-center rounded-full border disabled:opacity-40"
            style={{ borderColor: C.border, color: C.text, background: "#fff" }}
            aria-label="Next week"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-2 sm:gap-4">
        {days.map((d) => {
          const isToday = d.date === today;
          const log = d.log;
          const isFlare = log ? flare.ids.has(log.id) : false;
          const severity: ScoreBreakdown["severity"] = log
            ? calcScore({
                pain: log.pain,
                siteDescriptors: log.siteDescriptors,
                wholeBody: log.wholeBody,
                bleedingUnexpected: log.bleedingUnexpected,
                impact: log.impactChosen ? log.impact : 0,
              }).severity
            : "No symptoms";
          return (
            <div key={d.date} className="flex flex-col items-center gap-2">
              {log ? (
                <button
                  type="button"
                  onClick={() => setOpenLog(log)}
                  title={`View ${d.label}`}
                  aria-label={`View summary for ${d.label}`}
                  className="rounded-full"
                >
                  <Flower severity={severity} size={48} outlined={isFlare} />
                </button>
              ) : (
                <UnloggedFlower size={48} highlight={isToday} />
              )}
              <span
                className="text-xs"
                style={{
                  color: isToday ? C.deep : C.muted,
                  fontWeight: isToday ? 700 : 500,
                }}
              >
                {isToday ? "today" : d.label}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-5 text-xs"
        style={{ borderColor: C.border, color: C.text }}
      >
        <LegendItem icon={<UnloggedFlower size={20} />}>Unlogged / today</LegendItem>
        <LegendItem icon={<Flower severity="Mild" size={20} />}>Mild</LegendItem>
        <LegendItem icon={<Flower severity="Moderate" size={20} />}>Moderate</LegendItem>
        <LegendItem icon={<Flower severity="Severe" size={20} />}>Severe</LegendItem>
        <LegendItem icon={<Flower severity="Severe" size={20} outlined />}>Flare episode day</LegendItem>
      </div>

      <div
        className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
        style={{ color: C.text }}
      >
        <span>
          <span style={{ color: C.muted }}>Your baseline: </span>
          <span className="font-semibold">{baseline == null ? "—" : Math.round(baseline)}</span>
        </span>
        <span>
          <span style={{ color: C.muted }}>Flare threshold today: </span>
          <span className="font-semibold">{threshold == null ? "—" : Math.round(threshold)}</span>
        </span>
        {yPeak != null && (
          <span>
            <span style={{ color: C.muted }}>Yesterday: </span>
            <span className="font-semibold">
              {yElevated
                ? yConfirmed
                  ? "elevated — confirmed flare"
                  : "elevated — unconfirmed"
                : "below threshold"}
            </span>
          </span>
        )}
        {todayScore > 0 && (
          <span>
            <span style={{ color: C.muted }}>Today's burden: </span>
            <span className="font-semibold">{todayScore}</span>
          </span>
        )}
      </div>

      {logs.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClear}
            className="text-xs underline"
            style={{ color: C.muted }}
          >
            Clear all entries
          </button>
        </div>
      )}

      {openLog && (
        <DaySummaryDialog
          log={openLog}
          isFlare={flare.ids.has(openLog.id)}
          onClose={() => setOpenLog(null)}
          onDelete={(id) => {
            onDelete(id);
            setOpenLog(null);
          }}
        />
      )}
    </SoftCard>
  );
}

function DaySummaryDialog({
  log,
  isFlare,
  onClose,
  onDelete,
}: {
  log: DailyLog;
  isFlare: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const score = calcScore({
    pain: log.pain,
    siteDescriptors: log.siteDescriptors,
    wholeBody: log.wholeBody,
    bleedingUnexpected: log.bleedingUnexpected,
    impact: log.impactChosen ? log.impact : 0,
  });
  const dt = new Date(log.loggedAt);
  const dateLabel = new Date(log.date).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const rows: { k: string; v: React.ReactNode }[] = [];
  const siteEntries = Object.entries(log.siteDescriptors);
  if (siteEntries.length > 0) {
    rows.push({
      k: "Pain sites",
      v: siteEntries
        .map(([s, d]) => (d.length ? `${s} (${d.join(", ")})` : s))
        .join("; "),
    });
  }
  if (log.wholeBody.length) rows.push({ k: "Whole body", v: log.wholeBody.join(", ") });
  if (log.bleedingUnexpected) rows.push({ k: "Bleeding", v: "Outside expected window" });
  if (log.impactChosen) {
    rows.push({
      k: "Impact",
      v:
        log.impact === 0
          ? "Didn't affect activities"
          : log.impact === 15
            ? "Affected some activities"
            : "Affected most activities",
    });
  }
  if (log.medicationName || log.medicationEffect) {
    rows.push({
      k: "Medication",
      v: `${log.medicationName || "—"}${log.medicationEffect ? ` · ${log.medicationEffect}` : ""}`,
    });
  }
  const detailEntries = Object.entries(log.detail).filter(([, v]) => v && v.trim());
  for (const [k, v] of detailEntries) rows.push({ k: prettyDetailKey(k), v });
  if (log.otherSymptoms) rows.push({ k: "Notes", v: log.otherSymptoms });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ background: "rgba(20,18,16,0.45)" }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-3xl border"
        style={{ background: "#fff", borderColor: C.border }}
      >
        <div className="flex items-start justify-between gap-3 p-5" style={{ background: C.bg }}>
          <div className="flex items-center gap-3">
            <Flower severity={score.severity} size={44} outlined={isFlare} />
            <div>
              <div
                className="text-lg leading-tight"
                style={{ fontFamily: "Fraunces, DM Serif Display, Georgia, serif", color: C.text }}
              >
                {dateLabel}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                Logged at{" "}
                {dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: severityColor(score.severity), color: C.text }}
                >
                  {score.severity} · {score.total}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: "#fff", color: C.text, border: `1px solid ${C.border}` }}
                >
                  Pain {log.pain}/10
                </span>
                {isFlare && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: C.deep, color: "#fff" }}
                  >
                    Flare episode
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 text-lg leading-none"
            style={{ color: C.muted }}
          >
            ×
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {rows.length === 0 ? (
            <p className="text-sm italic" style={{ color: C.muted }}>
              No additional details were recorded for this day.
            </p>
          ) : (
            <dl className="divide-y" style={{ borderColor: C.border }}>
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[110px_1fr] gap-3 py-2.5 text-sm"
                  style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}`, color: C.text }}
                >
                  <dt
                    className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: C.muted }}
                  >
                    {r.k}
                  </dt>
                  <dd>{r.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-3 border-t p-4"
          style={{ borderColor: C.border, background: "#fff" }}
        >
          <button
            type="button"
            onClick={() => onDelete(log.id)}
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: C.muted }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete entry
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2 text-sm font-semibold"
            style={{ background: C.accent, color: C.deep }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function prettyDetailKey(k: string): string {
  switch (k) {
    case "worse": return "Made it worse";
    case "better": return "Made it better";
    case "timing": return "Timing";
    case "pattern": return "Pattern";
    case "cycleLink": return "Cycle link";
    default: return k;
  }
}

function LegendItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {icon}
      <span>{children}</span>
    </span>
  );
}

// ---------------- Pain trend line chart ----------------

type TrendRange = "week" | "month" | "year";

export function PainTrendCard({ logs }: { logs: DailyLog[] }) {
  const [range, setRange] = useState<TrendRange>("week");
  const flare = useMemo(() => flareEpisodeIds(logs), [logs]);
  const points = useMemo(() => buildTrendPoints(logs, range, flare.ids), [logs, range, flare.ids]);

  return (
    <SoftCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: C.muted }}
          >
            Pain trend
          </div>
          <h2
            className="mt-1 text-2xl"
            style={{ fontFamily: "Fraunces, serif", color: C.text }}
          >
            Symptom burden
          </h2>
        </div>
        <div
          className="inline-flex rounded-full border p-1 text-xs"
          style={{ borderColor: C.border, background: "#fff" }}
        >
          {(["week", "month", "year"] as TrendRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="rounded-full px-3 py-1 capitalize transition"
              style={{
                background: range === r ? C.accent : "transparent",
                color: range === r ? C.deep : C.muted,
                fontWeight: range === r ? 700 : 500,
              }}
            >
              {r === "week" ? "Weekly" : r === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {points.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed py-10 text-center text-sm"
            style={{ borderColor: C.border, color: C.muted, background: C.bg }}
          >
            No data yet. Your pain trend appears after your first log.
          </div>
        ) : (
          <LineChart points={points} />
        )}
      </div>
    </SoftCard>
  );
}

type TrendPoint = { label: string; value: number | null; flare: boolean };

function buildTrendPoints(
  logs: DailyLog[],
  range: TrendRange,
  flareIds: Set<string>,
): TrendPoint[] {
  if (logs.length === 0) return [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (range === "week") {
    // last 7 days, average pain per day; flare if any log that day is flare
    const out: TrendPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      const matches = logs.filter((l) => l.date === key);
      const value = matches.length
        ? matches.reduce((a, l) => a + l.pain, 0) / matches.length
        : null;
      const flare = matches.some((l) => flareIds.has(l.id));
      out.push({
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        value,
        flare,
      });
    }
    return out;
  }

  if (range === "month") {
    // last 30 days, grouped into ~5 buckets of 6 days
    const out: TrendPoint[] = [];
    for (let bucket = 4; bucket >= 0; bucket--) {
      const end = new Date(now);
      end.setDate(end.getDate() - bucket * 6);
      const start = new Date(end);
      start.setDate(start.getDate() - 5);
      const matches = logs.filter((l) => {
        const ld = new Date(l.date);
        return ld >= start && ld <= end;
      });
      const value = matches.length
        ? matches.reduce((a, l) => a + l.pain, 0) / matches.length
        : null;
      const flare = matches.some((l) => flareIds.has(l.id));
      out.push({
        label: `${start.getDate()}/${start.getMonth() + 1}`,
        value,
        flare,
      });
    }
    return out;
  }

  // year: last 12 months, average pain per month
  const out: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const matches = logs.filter((l) => {
      const ld = new Date(l.date);
      return ld >= d && ld < nextMonth;
    });
    const value = matches.length
      ? matches.reduce((a, l) => a + l.pain, 0) / matches.length
      : null;
    const flare = matches.some((l) => flareIds.has(l.id));
    out.push({
      label: d.toLocaleDateString(undefined, { month: "short" }),
      value,
      flare,
    });
  }
  return out;
}

function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function LineChart({ points }: { points: TrendPoint[] }) {
  const W = 720;
  const H = 220;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = points.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const yFor = (v: number) => padT + innerH - (v / 10) * innerH;
  const xFor = (i: number) => padL + i * stepX;

  // build path skipping nulls
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else {
      const cmd = current.length === 0 ? "M" : "L";
      current.push(`${cmd}${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current.join(" "));

  // Build contiguous flare bands (consecutive indices with flare=true).
  const bands: { start: number; end: number }[] = [];
  {
    let s: number | null = null;
    points.forEach((p, i) => {
      if (p.flare) {
        if (s == null) s = i;
      } else if (s != null) {
        bands.push({ start: s, end: i - 1 });
        s = null;
      }
    });
    if (s != null) bands.push({ start: s, end: points.length - 1 });
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[520px]"
        role="img"
        aria-label="Symptom burden over time"
      >
        {/* flare episode bands */}
        {bands.map((b, i) => {
          const half = stepX / 2 || 12;
          const x = xFor(b.start) - half;
          const w = xFor(b.end) - xFor(b.start) + half * 2;
          return (
            <rect
              key={`band-${i}`}
              x={Math.max(padL, x)}
              y={padT}
              width={Math.min(W - padR - Math.max(padL, x), w)}
              height={innerH}
              fill={C.flareBand}
              opacity={0.7}
              rx={6}
            />
          );
        })}

        {/* y-axis gridlines: 0, 2, 4, 6, 8, 10 */}
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke={C.border}
              strokeWidth={1}
              strokeDasharray={v === 0 ? "0" : "3 4"}
            />
            <text
              x={padL - 8}
              y={yFor(v) + 4}
              fontSize="10"
              textAnchor="end"
              fill={C.muted}
              fontFamily="Karla, sans-serif"
            >
              {v}
            </text>
          </g>
        ))}

        {/* line segments */}
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={C.deep}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* points */}
        {points.map((p, i) =>
          p.value == null ? null : (
            <g key={i}>
              <circle
                cx={xFor(i)}
                cy={yFor(p.value)}
                r={p.flare ? 6 : 4.5}
                fill={painSeverityColor(p.value)}
                stroke={p.flare ? C.deep : "#FFFFFF"}
                strokeWidth={p.flare ? 2 : 1.5}
              />
            </g>
          ),
        )}

        {/* x labels */}
        {points.map((p, i) => (
          <text
            key={`x-${i}`}
            x={xFor(i)}
            y={H - 8}
            fontSize="10"
            textAnchor="middle"
            fill={C.muted}
            fontFamily="Karla, sans-serif"
          >
            {p.label}
          </text>
        ))}
      </svg>

      <div
        className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs"
        style={{ color: C.muted }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.green }} />
          Mild
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.moderate }} />
          Moderate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.red }} />
          Severe
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ background: C.flareBand }} />
          Flare episode
        </span>
      </div>
    </div>
  );
}

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + deltaDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function buildWeekDays(logs: DailyLog[], weekOffset: number) {
  // Week ends "today + 7*weekOffset" so the current week is the last 7 days ending today.
  const end = new Date();
  end.setDate(end.getDate() + weekOffset * 7);
  const days: { date: string; label: string; log: DailyLog | null }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const p = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    const day = d.getDate();
    const matches = logs.filter((l) => l.date === date);
    const log = matches.length
      ? matches.reduce((a, b) => (a.burden >= b.burden ? a : b))
      : null;
    days.push({ date, label: `${weekday} ${day}`, log });
  }
  return days;
}

function weekLabel(weekOffset: number): string {
  if (weekOffset === 0) return "This week";
  if (weekOffset === -1) return "Last week";
  return `${Math.abs(weekOffset)} weeks ago`;
}

function UnloggedFlower({ size = 48, highlight = false }: { size?: number; highlight?: boolean }) {
  const color = highlight ? C.deep : C.muted;
  const petals = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      {petals.map((r) => (
        <g key={r} transform={`rotate(${r} 50 50)`}>
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx="50" cy={30 - i * 5} r={1.5 - i * 0.2} fill={color} opacity={0.7 - i * 0.15} />
          ))}
        </g>
      ))}
      <circle cx="50" cy="50" r="4" fill={color} opacity="0.7" />
    </svg>
  );
}

// ---------------- (legacy) Pattern over time list — no longer rendered ----------------

function _PatternOverTime({
  logs,
  onDelete,
  onClear,
}: {
  logs: DailyLog[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const empty = logs.length === 0;
  const flare = useMemo(() => flareEpisodeIds(logs), [logs]);
  const recurring = useMemo(() => recurringTerms(logs), [logs]);

  return (
    <SoftCard>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h2
            className="truncate text-2xl"
            style={{ fontFamily: "Fraunces, serif", color: C.text }}
          >
            Pattern over time
          </h2>
          <p className="mt-1 text-xs" style={{ color: C.muted }}>
            {empty
              ? "Your saved daily logs will build here."
              : `${logs.length} ${logs.length === 1 ? "log" : "logs"} · saved on this device`}
          </p>
        </div>
        {!empty && (
          <button onClick={onClear} className="shrink-0 text-xs underline" style={{ color: C.muted }}>
            Clear all
          </button>
        )}
      </div>

      {!empty && recurring.length > 0 && (
        <div className="mt-5">
          <SectionLabel>Recurring terms</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {recurring.map(({ term, count }) => (
              <span
                key={term}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
                style={{ background: C.pink, color: C.text }}
              >
                {term}
                <span
                  className="rounded-full px-1.5 text-[10px]"
                  style={{ background: "rgba(0,0,0,0.08)" }}
                >
                  {count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {empty ? (
          <div
            className="rounded-2xl border border-dashed py-10 text-center text-sm"
            style={{ borderColor: C.border, color: C.muted, background: C.bg }}
          >
            No entries yet. Complete a daily log above.
          </div>
        ) : (
          <ol className="space-y-4">
            <AnimatePresence initial={false}>
              {logs.map((log) => (
                <TimelineEntry
                  key={log.id}
                  log={log}
                  isFlare={flare.ids.has(log.id)}
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </SoftCard>
  );
}

function TimelineEntry({
  log,
  isFlare,
  onDelete,
}: {
  log: DailyLog;
  isFlare: boolean;
  onDelete: (id: string) => void;
}) {
  const score = calcScore({
    pain: log.pain,
    siteDescriptors: log.siteDescriptors,
    wholeBody: log.wholeBody,
    bleedingUnexpected: log.bleedingUnexpected,
    impact: log.impactChosen ? log.impact : 0,
  });
  const summary = summarise(log);
  const dt = new Date(log.loggedAt);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="rounded-2xl border p-4"
      style={{ borderColor: C.border, background: "#fff" }}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <Flower severity={score.severity} size={36} outlined={isFlare} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span style={{ fontFamily: "Fraunces, serif", color: C.text }} className="text-base">
              {dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            <span className="text-xs" style={{ color: C.muted }}>
              {dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: severityColor(score.severity), color: C.text }}
            >
              {score.severity} · {score.total}
            </span>
            {isFlare && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "transparent", color: C.deep, border: `1px solid ${C.deep}` }}
              >
                Flare
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.text }}>
            {summary}
          </p>
          {log.otherSymptoms && (
            <p className="mt-1 text-xs italic" style={{ color: C.muted }}>
              Notes: {log.otherSymptoms}
            </p>
          )}
        </div>
        <button
          onClick={() => onDelete(log.id)}
          className="shrink-0 rounded-full p-1.5"
          aria-label="Remove"
          style={{ color: C.muted }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.li>
  );
}

function summarise(log: DailyLog): string {
  const parts: string[] = [];
  parts.push(`Pain ${log.pain} out of 10`);
  const descs: string[] = [];
  for (const [site, ds] of Object.entries(log.siteDescriptors)) {
    if (ds.length === 0) descs.push(site.toLowerCase());
    else descs.push(`${site.toLowerCase()} (${ds.map((d) => d.toLowerCase()).join(", ")})`);
  }
  if (descs.length) parts[0] += ` with ${descs.join("; ")}`;
  if (log.wholeBody.length) {
    parts[0] += (descs.length ? ", " : " with ") + log.wholeBody.map((s) => s.toLowerCase()).join(", ");
  }
  parts[0] += ".";

  const impactStr = log.impactChosen
    ? log.impact === 0
      ? "Symptoms didn't affect activities."
      : log.impact === 15
        ? "Symptoms affected some activities."
        : "Symptoms affected most activities."
    : "";
  if (impactStr) parts.push(impactStr);

  if (log.medicationName && log.medicationEffect) {
    const eff =
      log.medicationEffect === "Helped"
        ? "helped"
        : log.medicationEffect === "Partly"
          ? "partly helped"
          : "had no effect";
    parts.push(`${log.medicationName} ${eff}.`);
  }
  if (log.bleedingUnexpected) parts.push("Bleeding outside expected window.");
  return parts.join(" ");
}

function recurringTerms(logs: DailyLog[]): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (t: string) => counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const l of logs) {
    for (const site of Object.keys(l.siteDescriptors)) {
      const desc = l.siteDescriptors[site];
      if (site === "Pelvis") bump("Pelvic pain");
      else if (site === "Lower back") bump("Lower back pain");
      else if (site === "Bowel" && desc.includes("Pain with bowel movements"))
        bump("Pain with bowel movements");
      else if (site === "Bladder" && desc.includes("Pain when urinating"))
        bump("Pain when urinating");
      else if (site === "During or after sex") bump("Pain with sex");
    }
    for (const s of l.wholeBody) bump(s);
    if (l.bleedingUnexpected) bump("Unexpected bleeding");
  }
  return Array.from(counts.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// ---------------- SOCRATES aggregation ----------------

const PAIN_CHARACTER = new Set([
  "Cramping",
  "Stabbing",
  "Burning",
  "Dull ache",
  "Radiating to legs",
]);

type SocratesRow = { label: string; value: string };

function buildSocrates(logs: DailyLog[]): SocratesRow[] {
  if (logs.length === 0) return [];
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const total = logs.length;

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const topList = (m: Map<string, number>, n = 4) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([term, c]) => `${term} (${c} ${c === 1 ? "day" : "days"})`);

  // Site — count days a site was logged with any descriptor
  const siteCounts = new Map<string, number>();
  for (const l of logs) for (const s of Object.keys(l.siteDescriptors)) bump(siteCounts, s);

  // Character — pain descriptors across all sites
  const charCounts = new Map<string, number>();
  for (const l of logs) {
    const seen = new Set<string>();
    for (const descs of Object.values(l.siteDescriptors)) {
      for (const d of descs) if (PAIN_CHARACTER.has(d) && d !== "Radiating to legs") seen.add(d);
    }
    seen.forEach((d) => bump(charCounts, d));
  }

  // Radiation
  const radiationDays = logs.filter((l) =>
    Object.values(l.siteDescriptors).some((d) => d.includes("Radiating to legs")),
  ).length;

  // Associations — whole-body + non-pain-character site descriptors + bleeding
  const assocCounts = new Map<string, number>();
  for (const l of logs) {
    const seen = new Set<string>();
    for (const s of l.wholeBody) seen.add(s);
    for (const descs of Object.values(l.siteDescriptors)) {
      for (const d of descs) if (!PAIN_CHARACTER.has(d)) seen.add(d);
    }
    if (l.bleedingUnexpected) seen.add("Unexpected bleeding");
    seen.forEach((s) => bump(assocCounts, s));
  }

  // Time course
  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;
  const span = daysBetween(first, last) + 1;
  const { episodes } = flareEpisodeIds(logs);

  // Exacerbating / relieving
  const worse = new Map<string, number>();
  const better = new Map<string, number>();
  for (const l of logs) {
    const w = l.detail.worse.trim();
    const b = l.detail.better.trim();
    if (w) bump(worse, w);
    if (b) bump(better, b);
  }
  const medHelped = logs.filter((l) => l.medicationEffect === "Helped").length;
  const medPartly = logs.filter((l) => l.medicationEffect === "Partly").length;
  const medNone = logs.filter((l) => l.medicationEffect === "No effect").length;

  // Severity — average pain, peak, distribution
  const avgPain = (logs.reduce((a, l) => a + l.pain, 0) / total).toFixed(1);
  const peakPain = Math.max(...logs.map((l) => l.pain));
  const mildDays = logs.filter((l) => l.pain > 0 && l.pain < 4).length;
  const modDays = logs.filter((l) => l.pain >= 4 && l.pain < 7).length;
  const sevDays = logs.filter((l) => l.pain >= 7).length;

  const dash = "Not described";
  const joinOr = (arr: string[]) => (arr.length ? arr.join(", ") : dash);

  const onsetDate = new Date(first).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const timeCourseParts: string[] = [];
  timeCourseParts.push(`${total} of ${span} ${span === 1 ? "day" : "days"} logged in this window`);
  if (episodes.length > 0) {
    timeCourseParts.push(
      `${episodes.length} confirmed flare ${episodes.length === 1 ? "episode" : "episodes"}`,
    );
  }

  const relievingParts: string[] = [];
  if (better.size > 0) relievingParts.push(topList(better, 3).join("; "));
  if (medHelped + medPartly > 0) {
    relievingParts.push(
      `Medication: helped ${medHelped}d, partly ${medPartly}d, no effect ${medNone}d`,
    );
  } else if (medNone > 0) {
    relievingParts.push(`Medication: no effect ${medNone}d`);
  }

  return [
    { label: "Site", value: joinOr(topList(siteCounts)) },
    { label: "Onset", value: `First logged ${onsetDate}; tracked over ${span} ${span === 1 ? "day" : "days"}` },
    { label: "Character", value: joinOr(topList(charCounts)) },
    {
      label: "Radiation",
      value: radiationDays > 0 ? `Radiating to legs on ${radiationDays} ${radiationDays === 1 ? "day" : "days"}` : dash,
    },
    { label: "Associations", value: joinOr(topList(assocCounts, 6)) },
    { label: "Time course", value: timeCourseParts.join("; ") },
    {
      label: "Exacerbating factors",
      value: worse.size > 0 ? topList(worse, 3).join("; ") : dash,
    },
    {
      label: "Relieving factors",
      value: relievingParts.length > 0 ? relievingParts.join(" · ") : dash,
    },
    {
      label: "Severity",
      value: `Average ${avgPain}/10, peak ${peakPain}/10 · Mild ${mildDays}d · Moderate ${modDays}d · Severe ${sevDays}d`,
    },
  ];
}

// ---------------- Report preview ----------------

export function ReportPreviewCard({
  logs,
  onGenerated,
}: {
  logs: DailyLog[];
  onGenerated: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (logs.length === 0) return null;
    const avg = Math.round(logs.reduce((a, l) => a + l.burden, 0) / logs.length);
    const peak = Math.max(...logs.map((l) => l.burden));
    const painDays = logs.filter((l) => l.pain > 0).length;
    const topSymptoms = recurringTerms(logs).slice(0, 5);
    const { ids: flareIds, episodes } = flareEpisodeIds(logs);
    const longest = episodes.reduce((m, e) => Math.max(m, e.length), 0);
    let aboveThreshold = 0;
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    for (const l of sorted) {
      const { baseline } = computeBaseline(sorted, l.date);
      const t = flareThreshold(baseline);
      if (t != null && l.burden > t) aboveThreshold += 1;
    }
    // Average pain (0-10) — closest we have to "reported baseline pain"
    const avgPain = (
      logs.reduce((a, l) => a + l.pain, 0) / logs.length
    ).toFixed(1);

    // Detailed flare episode rows
    const episodeRows = episodes.map((ids) => {
      const entries = sorted.filter((l) => ids.includes(l.id));
      const start = entries[0].date;
      const end = entries[entries.length - 1].date;
      const duration = daysBetween(start, end) + 1;
      const peakScore = Math.max(...entries.map((l) => l.burden));
      return { start, end, duration, peak: peakScore };
    });

    // Safety flags — patient-reported symptoms worth prompt review
    const flagged: string[] = [];
    if (logs.some((l) => l.wholeBody.includes("Dizziness"))) flagged.push("Dizziness");
    if (logs.filter((l) => l.bleedingUnexpected).length >= 2)
      flagged.push("Recurrent unexpected bleeding");
    if (logs.some((l) => l.pain >= 9)) flagged.push("Pain rated 9–10 on one or more days");

    // 14-day trend narrative
    const now = new Date();
    const startThis = new Date(now); startThis.setDate(startThis.getDate() - 6);
    const startPrev = new Date(startThis); startPrev.setDate(startPrev.getDate() - 7);
    const endPrev = new Date(startThis); endPrev.setDate(endPrev.getDate() - 1);
    const inRange = (l: DailyLog, s: Date, e: Date) => {
      const d = new Date(l.date);
      return d >= s && d <= e;
    };
    const thisWeek = logs.filter((l) => inRange(l, startThis, now));
    const prevWeek = logs.filter((l) => inRange(l, startPrev, endPrev));
    const avgOf = (arr: DailyLog[]) =>
      arr.length ? Math.round(arr.reduce((a, l) => a + l.burden, 0) / arr.length) : null;
    const topSymOf = (arr: DailyLog[]) => {
      const c = new Map<string, number>();
      for (const l of arr) for (const s of l.wholeBody) c.set(s, (c.get(s) ?? 0) + 1);
      let top: { term: string; count: number } | null = null;
      for (const [term, count] of c.entries()) {
        if (!top || count > top.count) top = { term, count };
      }
      return top;
    };
    const thisAvg = avgOf(thisWeek);
    const prevAvg = avgOf(prevWeek);
    const trend = {
      thisRange: `${fmtShort(startThis)} to ${fmtShort(now)}`,
      prevRange: `${fmtShort(startPrev)} to ${fmtShort(endPrev)}`,
      thisAvg, prevAvg,
      delta: thisAvg != null && prevAvg != null ? thisAvg - prevAvg : null,
      thisDaysAbove: countAboveThreshold(thisWeek, sorted),
      prevDaysAbove: countAboveThreshold(prevWeek, sorted),
      thisTop: topSymOf(thisWeek),
      prevTop: topSymOf(prevWeek),
      thisCount: thisWeek.length,
      prevCount: prevWeek.length,
    };

    // Burden series (last 30 days) for mini-chart
    const burdenPoints: { date: string; burden: number | null; severity: ScoreBreakdown["severity"] | null; flare: boolean }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = dateKey(d);
      const match = logs.find((l) => l.date === key);
      if (match) {
        const sc = calcScore({
          pain: match.pain,
          siteDescriptors: match.siteDescriptors,
          wholeBody: match.wholeBody,
          bleedingUnexpected: match.bleedingUnexpected,
          impact: match.impactChosen ? match.impact : 0,
        });
        burdenPoints.push({ date: key, burden: match.burden, severity: sc.severity, flare: flareIds.has(match.id) });
      } else {
        burdenPoints.push({ date: key, burden: null, severity: null, flare: false });
      }
    }

    // Overall report dates
    const firstDate = sorted[0].date;
    const lastDate = sorted[sorted.length - 1].date;
    const currentThreshold = flareThreshold(computeBaseline(sorted, dateKey(now)).baseline);

    return {
      avg, peak, painDays, topSymptoms, episodes: episodes.length, longest,
      aboveThreshold, avgPain, episodeRows, flagged, trend, burdenPoints,
      firstDate, lastDate, currentThreshold,
    };
  }, [logs]);

  async function generate() {
    if (logs.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const text = buildReportText(logs);
      const res = await api.processPatientIntake({
        patient_name: "You",
        input_text: text,
      });
      if (res.status === "error") throw new Error("Backend returned error");
      onGenerated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate report");
    } finally {
      setSubmitting(false);
    }
  }

  const serif = "Fraunces, DM Serif Display, Georgia, serif";

  if (!stats) {
    return (
      <SoftCard id="report-preview">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl" style={{ fontFamily: serif, color: C.text }}>
            Summary notes for doctors
          </h2>
          <FileText className="h-5 w-5" style={{ color: C.muted }} />
        </div>
        <div
          className="mt-4 rounded-2xl border border-dashed py-10 text-center text-sm"
          style={{ borderColor: C.border, color: C.muted, background: C.bg }}
        >
          Log at least one day to see your summary notes for doctors.
        </div>
      </SoftCard>
    );
  }

  const today = new Date();
  const generatedOn = today.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const covers = `${new Date(stats.firstDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} – ${new Date(stats.lastDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <SoftCard id="report-preview">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5" style={{ borderBottom: `2px solid ${C.text}` }}>
        <div>
          <div className="flex items-baseline gap-1">
            <h2 className="text-3xl leading-none" style={{ fontFamily: serif, color: C.text }}>
              EndoHer
            </h2>
            <span className="text-2xl leading-none" style={{ color: C.accent, fontFamily: serif }}>.</span>
          </div>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>
            Summary notes for doctors — prepared for clinical review
          </p>
        </div>
        <div className="text-right text-sm" style={{ color: C.muted }}>
          <div>Report generated <span className="font-semibold" style={{ color: C.text }}>{generatedOn}</span></div>
          <div>Covers <span className="font-semibold" style={{ color: C.text }}>{covers}</span></div>
        </div>
      </div>

      {/* Patient tile */}
      <div className="mt-6 rounded-2xl p-5" style={{ background: C.bg }}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <PatientField label="Patient" value="You" />
          <PatientField label="Days logged" value={`${logs.length} / ${daysBetween(stats.firstDate, stats.lastDate) + 1}`} />
          <PatientField label="Report window" value={`${daysBetween(stats.firstDate, stats.lastDate) + 1} days`} />
        </div>
      </div>

      {/* Safety flags */}
      {stats.flagged.length > 0 && (
        <div className="mt-6 rounded-2xl border-2 p-4" style={{ borderColor: C.red, background: C.redSoft }}>
          <div className="text-sm font-semibold" style={{ color: C.red }}>
            ⚠ Patient-reported safety flags — recommend prompt clinical review
          </div>
          <ul className="mt-2 space-y-1 text-sm" style={{ color: C.red }}>
            {stats.flagged.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Snapshot */}
      <ReportSection title="Snapshot" serif={serif}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SnapshotTile value={`${stats.avgPain}/10`} label="Average reported pain" />
          <SnapshotTile value={stats.avg} label="Tracked burden baseline" />
          <SnapshotTile value={stats.episodes} label="Confirmed flare episodes" />
          <SnapshotTile value={`${stats.longest}d`} label="Longest flare episode" />
        </div>
      </ReportSection>

      {/* SOCRATES pain assessment */}
      <ReportSection title="Symptoms & information (SOCRATES)" serif={serif}>
        <p className="mb-3 text-xs italic" style={{ color: C.muted }}>
          Site · Onset · Character · Radiation · Associations · Time course · Exacerbating & relieving · Severity
        </p>
        <dl className="divide-y" style={{ borderColor: C.border }}>
          {buildSocrates(logs).map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[140px_1fr] gap-4 py-3 text-sm"
              style={{ borderTop: `1px solid ${C.border}`, color: C.text }}
            >
              <dt
                className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: C.muted }}
              >
                {row.label}
              </dt>
              <dd
                style={{
                  color: row.value === "Not described" ? C.muted : C.text,
                  fontStyle: row.value === "Not described" ? "italic" : "normal",
                }}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </ReportSection>

      {/* Symptom burden 30d chart */}
      <ReportSection title="Symptom burden — last 30 days" serif={serif}>
        <BurdenMiniChart points={stats.burdenPoints} threshold={stats.currentThreshold} />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: C.muted }}>
          <SwatchLegend color={C.green} label="Mild" />
          <SwatchLegend color={C.light} label="Moderate" />
          <SwatchLegend color={C.red} label="Severe" />
          <SwatchLegend color={C.border} label="Unlogged" hollow />
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-6" style={{ background: C.accent }} />
            Flare threshold (current)
          </span>
        </div>
      </ReportSection>

      {/* Confirmed flare episodes table */}
      <ReportSection title="Confirmed flare episodes" serif={serif}>
        {stats.episodeRows.length === 0 ? (
          <p className="text-sm" style={{ color: C.muted }}>
            No confirmed flare episodes in this report window.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: C.muted }} className="text-xs uppercase tracking-[0.18em]">
                  <th className="py-2 pr-4 font-semibold">Start</th>
                  <th className="py-2 pr-4 font-semibold">End</th>
                  <th className="py-2 pr-4 font-semibold">Duration</th>
                  <th className="py-2 font-semibold">Peak score</th>
                </tr>
              </thead>
              <tbody>
                {stats.episodeRows.map((e, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                    <td className="py-3 pr-4">{new Date(e.start).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="py-3 pr-4">{new Date(e.end).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="py-3 pr-4">{e.duration} {e.duration === 1 ? "day" : "days"}</td>
                    <td className="py-3 font-semibold">{e.peak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      {/* Symptom trend narrative */}
      <ReportSection title="Symptom trend — last 14 days" serif={serif}>
        <p className="text-sm leading-relaxed" style={{ color: C.text }}>
          {stats.trend.thisCount} of the last 7 days were logged this week
          {stats.trend.prevCount > 0 ? `, and ${stats.trend.prevCount} the week before` : ""}.
          {stats.trend.thisAvg != null && stats.trend.prevAvg != null && stats.trend.delta != null && (
            <> Average score is trending {stats.trend.delta > 0 ? "upward" : stats.trend.delta < 0 ? "downward" : "flat"} week-on-week — <strong>{stats.trend.thisAvg}</strong> this week vs <strong>{stats.trend.prevAvg}</strong> the week before.</>
          )}
          {stats.trend.thisAvg == null && " Not enough data this week to compute a weekly average."}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TrendMiniCard
            label={`This week — ${stats.trend.thisRange}`}
            avg={stats.trend.thisAvg}
            delta={stats.trend.delta}
            daysAbove={stats.trend.thisDaysAbove}
            total={stats.trend.thisCount}
            top={stats.trend.thisTop}
          />
          <TrendMiniCard
            label={`Prior week — ${stats.trend.prevRange}`}
            avg={stats.trend.prevAvg}
            delta={null}
            daysAbove={stats.trend.prevDaysAbove}
            total={stats.trend.prevCount}
            top={stats.trend.prevTop}
          />
        </div>
      </ReportSection>

      {/* Most reported symptoms */}
      {stats.topSymptoms.length > 0 && (
        <ReportSection title="Most reported symptoms" serif={serif}>
          <div className="flex flex-wrap gap-2">
            {stats.topSymptoms.map((s) => (
              <span key={s.term} className="rounded-full px-3 py-1 text-xs" style={{ background: C.blue, color: C.text }}>
                {s.term} · {s.count}
              </span>
            ))}
          </div>
        </ReportSection>
      )}

      {/* Disclaimer */}
      <div className="mt-6 border-t pt-4 text-xs leading-relaxed" style={{ borderColor: C.border, color: C.muted }}>
        EndoHer's score and flare thresholds are tracking aids modelled on validated instruments (NRS, EHP-5) — they are not diagnoses or clinically validated cutoffs. This summary reflects patient-reported data only and is intended to support, not replace, clinical assessment.
      </div>

    </SoftCard>
  );
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function countAboveThreshold(entries: DailyLog[], allSorted: DailyLog[]): { count: number; total: number } {
  let count = 0;
  for (const l of entries) {
    const { baseline } = computeBaseline(allSorted, l.date);
    const t = flareThreshold(baseline);
    if (t != null && l.burden > t) count += 1;
  }
  return { count, total: entries.length };
}

function PatientField({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: C.muted }}>
        {label}
      </div>
      <div className="mt-1 text-lg" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
        {value}
      </div>
    </div>
  );
}

function ReportSection({
  title,
  serif,
  children,
}: {
  title: string;
  serif: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h3 className="text-xl" style={{ fontFamily: serif, color: C.text }}>{title}</h3>
      <div className="mt-3 border-t pt-4" style={{ borderColor: C.border }}>
        {children}
      </div>
    </section>
  );
}

function SnapshotTile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: "#fff" }}>
      <div className="text-3xl leading-none" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
        {value}
      </div>
      <div className="mt-2 text-xs" style={{ color: C.muted }}>
        {label}
      </div>
    </div>
  );
}

function SwatchLegend({ color, label, hollow = false }: { color: string; label: string; hollow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: hollow ? "transparent" : color, border: `1.5px solid ${color}` }}
      />
      {label}
    </span>
  );
}

function TrendMiniCard({
  label,
  avg,
  delta,
  daysAbove,
  total,
  top,
}: {
  label: string;
  avg: number | null;
  delta: number | null;
  daysAbove: { count: number; total: number };
  total: number;
  top: { term: string; count: number } | null;
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.bg }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: C.muted }}>
        {label}
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <TrendRow k="Average score">
          {avg == null ? "—" : (
            <>
              <span className="font-semibold">{avg}</span>
              {delta != null && delta !== 0 && (
                <span className="ml-1" style={{ color: delta > 0 ? C.red : C.green }}>
                  ({delta > 0 ? "+" : ""}{delta})
                </span>
              )}
            </>
          )}
        </TrendRow>
        <TrendRow k="Days above typical range">
          <span className="font-semibold">{daysAbove.count}/{total || 7}</span>
        </TrendRow>
        <TrendRow k="Most reported symptom">
          {top ? (
            <span className="font-semibold">{top.term} ({top.count}d)</span>
          ) : (
            <span style={{ color: C.muted }}>—</span>
          )}
        </TrendRow>
      </dl>
    </div>
  );
}

function TrendRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b pb-1.5" style={{ borderColor: C.border, color: C.text }}>
      <dt style={{ color: C.muted }}>{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function BurdenMiniChart({
  points,
  threshold,
}: {
  points: { date: string; burden: number | null; severity: ScoreBreakdown["severity"] | null; flare: boolean }[];
  threshold: number | null;
}) {
  const W = 720;
  const H = 200;
  const padL = 32, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = points.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const yFor = (v: number) => padT + innerH - (v / 100) * innerH;
  const xFor = (i: number) => padL + i * stepX;

  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.burden == null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else {
      const cmd = current.length === 0 ? "M" : "L";
      current.push(`${cmd}${xFor(i).toFixed(1)},${yFor(p.burden).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current.join(" "));

  // flare bands: contiguous runs of p.flare
  const bands: { x1: number; x2: number }[] = [];
  let bstart = -1;
  for (let i = 0; i < n; i++) {
    if (points[i].flare && bstart === -1) bstart = i;
    if ((!points[i].flare || i === n - 1) && bstart !== -1) {
      const end = points[i].flare ? i : i - 1;
      bands.push({ x1: xFor(bstart) - 8, x2: xFor(end) + 8 });
      bstart = -1;
    }
  }

  const dotColor = (sev: ScoreBreakdown["severity"] | null) => {
    if (!sev) return C.border;
    if (sev === "Mild") return C.green;
    if (sev === "Moderate") return C.light;
    return C.red;
  };

  // x-axis labels every ~5 days
  const labelIdx = [0, 7, 14, 21, 29].filter((i) => i < n);

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: C.border, background: "#fff" }}
    >
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label="Symptom burden last 30 days">
          {/* flare bands */}
          {bands.map((b, i) => (
            <rect key={i} x={b.x1} y={padT} width={b.x2 - b.x1} height={innerH} fill={C.light} opacity={0.55} rx={6} />
          ))}
          {/* threshold line */}
          {threshold != null && (
            <line
              x1={padL}
              x2={W - padR}
              y1={yFor(threshold)}
              y2={yFor(threshold)}
              stroke={C.accent}
              strokeWidth={2}
              strokeDasharray="6 5"
            />
          )}
          {/* line */}
          {segments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={C.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {/* points */}
          {points.map((p, i) =>
            p.burden == null ? null : (
              <circle
                key={i}
                cx={xFor(i)}
                cy={yFor(p.burden)}
                r={p.flare ? 5 : 4}
                fill={dotColor(p.severity)}
                stroke={p.flare ? C.text : "none"}
                strokeWidth={p.flare ? 2 : 0}
              />
            ),
          )}
          {/* x labels */}
          {labelIdx.map((i) => {
            const d = new Date(points[i].date);
            return (
              <text key={i} x={xFor(i)} y={H - 8} fontSize="10" textAnchor="middle" fill={C.muted} fontFamily="Karla, sans-serif">
                {d.getDate()}/{d.getMonth() + 1}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function buildReportText(logs: DailyLog[]): string {
  const lines: string[] = [];
  lines.push(`Daily log summary — ${logs.length} logs.`);
  const avg = Math.round(logs.reduce((a, l) => a + l.burden, 0) / logs.length);
  const peak = Math.max(...logs.map((l) => l.burden));
  lines.push(`Average burden ${avg}/100, peak ${peak}/100.`);
  const recent = logs.slice(0, 10);
  lines.push("", "Recent entries:");
  for (const l of recent) {
    lines.push(`- ${l.date}: burden ${l.burden} — ${summarise(l)}`);
  }
  return lines.join("\n");
}

function StatTile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: C.bg }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
        {label}
      </div>
      <div
        className="mt-1 text-2xl"
        style={{ fontFamily: "Fraunces, serif", color: C.text }}
      >
        {value}
      </div>
      {hint && <div className="text-[10px]" style={{ color: C.muted }}>{hint}</div>}
    </div>
  );
}

// ---------------- Report history (server) ----------------

export function ReportHistoryCard({ refreshKey }: { refreshKey: number }) {
  const [reports, setReports] = useState<ApiReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getReports(20)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load history");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function del(id: string) {
    try {
      await api.deleteReport(id);
      setReports((prev) => (prev ? prev.filter((r) => r.id !== id) : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <SoftCard>
      <h2 className="text-2xl" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
        Report history
      </h2>
      <div className="mt-5">
        {error ? (
          <div className="rounded-2xl p-3 text-sm" style={{ background: C.pink, color: C.text }}>
            {error}
          </div>
        ) : reports === null ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl" style={{ background: C.bg }} />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed p-6 text-center text-sm"
            style={{ borderColor: C.border, color: C.muted, background: C.bg }}
          >
            No reports yet. Generate one from the preview above.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: C.border }}>
            {reports.map((r) => {
              const dt = new Date(r.created_at);
              const canOpen = r.status === "complete";
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4"
                >
                  <button
                    onClick={() => canOpen && api.downloadReport(r.id)}
                    disabled={!canOpen}
                    className="min-w-0 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span
                        className="font-semibold"
                        style={{ color: C.text, fontFamily: "Fraunces, serif" }}
                      >
                        {dt.toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="text-sm" style={{ color: C.muted }}>
                        {dt.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {!canOpen && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={{ background: C.light, color: C.text }}
                        >
                          {r.status}
                        </span>
                      )}
                    </div>
                    {canOpen && (
                      <p
                        className="mt-1 inline-flex items-center gap-1 text-xs underline"
                        style={{ color: C.muted }}
                      >
                        <Download className="h-3 w-3" />
                        Open review (PDF)
                      </p>
                    )}
                  </button>
                  <button
                    onClick={() => del(r.id)}
                    aria-label="Delete report"
                    className="shrink-0 rounded-full p-2"
                    style={{ color: C.muted, background: "transparent" }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SoftCard>
  );
}

// ---------------- Shared UI ----------------

function SoftCard({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div
      id={id}
      className="rounded-3xl border p-5 sm:p-6"
      style={{ background: C.card, borderColor: C.border }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase tracking-[0.2em]"
      style={{ color: C.muted }}
    >
      {children}
    </div>
  );
}

function Chip({
  children,
  selected,
  onClick,
  size = "md",
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border transition ${size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm"}`}
      style={{
        borderColor: selected ? C.deep : C.border,
        background: selected ? C.light : "#fff",
        color: selected ? C.deep : C.text,
        fontWeight: selected ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

function NestedCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-3 ${className ?? ""}`}
      style={{ background: C.bg, border: `1px solid ${C.border}` }}
    >
      <div className="text-xs font-semibold" style={{ color: C.text }}>
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-6 active:scale-[0.97] active:brightness-95 transition-transform duration-150"
      style={{ background: C.accent, color: "#000" }}
    >
      {children}
    </Button>
  );
}
function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-5 py-2 text-sm"
      style={{ color: C.muted, background: "transparent" }}
    >
      {children}
    </button>
  );
}

function DetailField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 rounded-full"
        style={{ background: "#fff", borderColor: C.border, color: C.text }}
      />
    </div>
  );
}

function SeverityPill({ severity }: { severity: ScoreBreakdown["severity"] }) {
  return (
    <span
      className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: severityColor(severity), color: C.text }}
    >
      {severity}
    </span>
  );
}

function Flower({
  severity,
  size = 48,
  outlined = false,
}: {
  severity: ScoreBreakdown["severity"];
  size?: number;
  outlined?: boolean;
}) {
  const fill = severityColor(severity);
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      {/* Binary flare ring: a distinct, high-contrast charcoal circle
          around the whole flower so flare days are unmistakable. */}
      {outlined && (
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={C.deep}
          strokeWidth={5}
        />
      )}
      {petals.map((r) => (
        <ellipse
          key={r}
          cx="50"
          cy="28"
          rx="12"
          ry="18"
          fill={fill}
          transform={`rotate(${r} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="10" fill={C.deep} />
    </svg>
  );
}
