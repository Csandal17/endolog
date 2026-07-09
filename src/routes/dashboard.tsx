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

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Daily log · Maai" },
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
  accent: "#F5B8DB",   // soft pink (primary)
  deep: "#141210",     // charcoal for text on accent
  light: "#FBE9B8",    // soft butter for highlights
  pink: "#F5B8DB",
  green: "#D6E1B4",    // sage tint
  blue: "#B6CAEB",     // powder blue
};

// ---------------- Data model ----------------

const PAIN_SITES = [
  { key: "Pelvis", options: ["Cramping", "Stabbing", "Burning", "Dull ache"] },
  { key: "Lower back", options: ["Cramping", "Dull ache", "Radiating to legs"] },
  { key: "Bowel", options: ["Pain with bowel movements", "Diarrhoea", "Constipation"] },
  { key: "Bladder", options: ["Pain when urinating", "Urgency", "Frequency"] },
  { key: "During or after sex", options: ["Deep pain", "Ache afterwards"] },
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
  if (s === "No symptoms") return C.green;
  if (s === "Mild") return C.blue;
  if (s === "Moderate") return C.light;
  return C.pink;
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

  useEffect(() => {
    setLogs(readLogs());
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
          <p>Maai does not diagnose. Always consult a clinician.</p>
          <p className="mt-1">© 2026 Maai. Made with care.</p>
        </footer>
      </main>
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
            Maai
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
          <Slider
            value={[pain]}
            min={0}
            max={10}
            step={1}
            onValueChange={([v]) => onPain(v)}
          />
          <div className="mt-3 flex justify-between text-xs" style={{ color: C.muted }}>
            <span>No pain</span>
            <span>Worst imaginable</span>
          </div>
        </div>
        <div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl"
          style={{ background: C.light, color: C.deep, fontFamily: "Fraunces, serif" }}
        >
          <span className="text-4xl">{pain}</span>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
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
          <PrimaryButton
            onClick={() => {
              const el = document.getElementById("report-preview");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            View report preview
          </PrimaryButton>
        </div>
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
                  onClick={() => onDelete(log.id)}
                  title={`Remove ${d.label}`}
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
    </SoftCard>
  );
}

function LegendItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {icon}
      <span>{children}</span>
    </span>
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
    const impactCounts = { 0: 0, 15: 0, 25: 0 } as Record<number, number>;
    logs.forEach((l) => {
      if (l.impactChosen) impactCounts[l.impact] += 1;
    });
    const medCounts: Record<string, number> = {};
    logs.forEach((l) => {
      if (l.medicationEffect) medCounts[l.medicationEffect] = (medCounts[l.medicationEffect] ?? 0) + 1;
    });

    const { episodes } = flareEpisodeIds(logs);
    const longest = episodes.reduce((m, e) => Math.max(m, e.length), 0);
    let aboveThreshold = 0;
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    for (const l of sorted) {
      const { baseline } = computeBaseline(sorted, l.date);
      const t = flareThreshold(baseline);
      if (t != null && l.burden > t) aboveThreshold += 1;
    }

    return { avg, peak, painDays, topSymptoms, impactCounts, medCounts, episodes: episodes.length, longest, aboveThreshold };
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

  return (
    <SoftCard id="report-preview">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl" style={{ fontFamily: "Fraunces, serif", color: C.text }}>
          Report preview
        </h2>
        <FileText className="h-5 w-5" style={{ color: C.muted }} />
      </div>

      {!stats ? (
        <div
          className="mt-4 rounded-2xl border border-dashed py-10 text-center text-sm"
          style={{ borderColor: C.border, color: C.muted, background: C.bg }}
        >
          Log at least one day to see your clinician-friendly summary.
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Logged days" value={logs.length} />
            <StatTile label="Average burden" value={stats.avg} />
            <StatTile label="Peak burden" value={stats.peak} />
            <StatTile label="Pain days" value={stats.painDays} />
            <StatTile label="Flare episodes" value={stats.episodes} />
            <StatTile label="Longest flare" value={`${stats.longest}d`} />
            <StatTile label="Days above threshold" value={stats.aboveThreshold} />
            <StatTile
              label="Impact"
              value={`${stats.impactCounts[0] || 0}/${stats.impactCounts[15] || 0}/${stats.impactCounts[25] || 0}`}
              hint="none / some / most"
            />
          </div>

          <div className="mt-5">
            <SectionLabel>Most common symptoms</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {stats.topSymptoms.map((s) => (
                <span
                  key={s.term}
                  className="rounded-full px-3 py-1 text-xs"
                  style={{ background: C.blue, color: C.text }}
                >
                  {s.term} · {s.count}
                </span>
              ))}
            </div>
          </div>

          {Object.keys(stats.medCounts).length > 0 && (
            <div className="mt-5">
              <SectionLabel>Medication response</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(stats.medCounts).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded-full px-3 py-1 text-xs"
                    style={{ background: C.green, color: C.text }}
                  >
                    {k} · {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <SectionLabel>Recent pattern</SectionLabel>
            <ul className="mt-2 space-y-1 text-sm" style={{ color: C.text }}>
              {logs.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <span style={{ color: C.muted }}>
                    {new Date(l.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}:
                  </span>{" "}
                  burden {l.burden}, {summarise(l)}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl p-3 text-sm" style={{ background: C.pink, color: C.text }}>
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <PrimaryButton onClick={generate} disabled={submitting}>
              {submitting ? "Generating…" : "Generate report"}
            </PrimaryButton>
          </div>
        </>
      )}
    </SoftCard>
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
              const s = r.structured_data;
              const title = s?.patient?.name ?? "Patient report";
              const summary = s?.patient_summary ?? "—";
              return (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-4 sm:flex sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold" style={{ color: C.text }}>{title}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          background: r.status === "complete" ? C.green : C.light,
                          color: C.text,
                        }}
                      >
                        {r.status}
                      </span>
                      <span className="text-xs" style={{ color: C.muted }}>
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm" style={{ color: C.muted }}>{summary}</p>
                    {s?.clinical_terms && s.clinical_terms.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.clinical_terms.slice(0, 6).map((t) => (
                          <span
                            key={t}
                            className="rounded-full px-2 py-0.5 text-[11px]"
                            style={{ background: C.pink, color: C.text }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => del(r.id)}
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs"
                      style={{ borderColor: C.border, color: C.muted, background: "#fff" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                    <button
                      onClick={() => api.downloadReport(r.id)}
                      disabled={r.status !== "complete"}
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs disabled:opacity-50"
                      style={{ borderColor: C.border, color: C.text, background: "#fff" }}
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
      className="rounded-full px-6"
      style={{ background: C.accent, color: "#fff" }}
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
  const stroke = outlined ? C.deep : "transparent";
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      {petals.map((r) => (
        <ellipse
          key={r}
          cx="50"
          cy="28"
          rx="12"
          ry="18"
          fill={outlined ? "#fff" : fill}
          stroke={outlined ? stroke : "none"}
          strokeWidth={outlined ? 2 : 0}
          transform={`rotate(${r} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="10" fill={outlined ? "#fff" : C.deep} stroke={outlined ? stroke : "none"} strokeWidth={outlined ? 2 : 0} />
    </svg>
  );
}
