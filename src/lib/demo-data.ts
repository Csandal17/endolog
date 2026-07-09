// ============================================================================
// Demo data seeding for presentations
// ----------------------------------------------------------------------------
// Populates localStorage with ~45 days of realistic daily logs so the weekly
// heat-map, pain trend, flare detection, summary, and doctor-report pages all
// have rich content to show live during a demo. Also seeds a diagnosis
// profile and pathway. Safe to call repeatedly — it overwrites.
// ============================================================================

const LOGS_KEY = "maai:daily-logs:v1";
const PATHWAY_KEY = "maai:pathway";
const DIAGNOSIS_KEY = "diagnosisProfile";

type Impact = 0 | 15 | 25;
type MedEffect = "Helped" | "Partly" | "No effect" | null;

type DailyLog = {
  id: string;
  date: string;
  loggedAt: string;
  pain: number;
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

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function calcBurden(pain: number, impact: Impact, siteDescriptors: Record<string, string[]>, wholeBody: string[], bleeding: boolean | null): number {
  const painPts = pain * 5;
  const impactPts = pain >= 4 ? impact : 0;
  const painCharacter = new Set(["Cramping", "Stabbing", "Burning", "Dull ache", "Radiating to legs"]);
  let symptomCount = wholeBody.length;
  for (const descs of Object.values(siteDescriptors)) {
    for (const d of descs) if (!painCharacter.has(d)) symptomCount += 1;
  }
  const symptomPts = Math.min(15, symptomCount * 3);
  const bleedingPts = bleeding ? 10 : 0;
  return Math.min(100, painPts + impactPts + symptomPts + bleedingPts);
}

// A realistic ~45 day arc: baseline low-moderate, one confirmed flare episode
// around days 12–14 (mid-cycle ovulation pain), and a strong menstrual flare
// around days 2–5 (recent period). Two days are deliberately skipped to make
// the heat-map look human.
type Template = {
  ago: number;
  pain: number;
  impact: Impact;
  sites: Record<string, string[]>;
  whole: string[];
  bleeding: boolean | null;
  note?: string;
  med?: { name: string; effect: MedEffect };
  detail?: Partial<DailyLog["detail"]>;
};

const TEMPLATES: Template[] = [
  // Recent menstrual flare (days 1–5)
  { ago: 1, pain: 8, impact: 25, sites: { Pelvis: ["Cramping", "Stabbing"], "Lower back": ["Dull ache", "Radiating to legs"], Bowel: ["Pain with bowel movements"] }, whole: ["Bloating", "Fatigue", "Nausea", "Bleeding"], bleeding: false, med: { name: "Ibuprofen 400mg", effect: "Partly" }, note: "Had to work from bed most of the day.", detail: { worse: "Sitting for long, standing up quickly", better: "Hot water bottle, curled up", timing: "Worst in the morning", pattern: "Day 2 of period", cycleLink: "Yes — period" } },
  { ago: 2, pain: 9, impact: 25, sites: { Pelvis: ["Cramping", "Stabbing", "Pressure"], "Lower back": ["Cramping", "Radiating to legs"], Bowel: ["Pain with bowel movements", "Diarrhoea"] }, whole: ["Bloating", "Fatigue", "Nausea", "Bleeding"], bleeding: false, med: { name: "Ibuprofen 400mg + Paracetamol 1g", effect: "Partly" }, note: "Cancelled evening plans. Woke up twice from pain.", detail: { worse: "Movement, cold", better: "Heat, lying still", timing: "All day, peaks evening", pattern: "Peak menstrual pain", cycleLink: "Yes — period" } },
  { ago: 3, pain: 7, impact: 15, sites: { Pelvis: ["Cramping"], "Lower back": ["Dull ache"] }, whole: ["Bloating", "Fatigue", "Bleeding"], bleeding: false, med: { name: "Ibuprofen 400mg", effect: "Helped" }, detail: { worse: "Long sitting", better: "Heat pad", timing: "Morning and evening", pattern: "Period tapering", cycleLink: "Yes — period" } },
  { ago: 4, pain: 5, impact: 15, sites: { Pelvis: ["Cramping"], Bowel: ["Bloating"] }, whole: ["Fatigue", "Bleeding"], bleeding: false, med: { name: "Ibuprofen 200mg", effect: "Helped" } },
  { ago: 5, pain: 4, impact: 15, sites: { Pelvis: ["Dull ache"] }, whole: ["Fatigue", "Bleeding"], bleeding: false, med: { name: "None", effect: null } },

  // Follicular phase — quieter days
  { ago: 6, pain: 2, impact: 0, sites: {}, whole: ["Fatigue"], bleeding: false },
  { ago: 7, pain: 1, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 8, pain: 3, impact: 0, sites: { "Lower back": ["Dull ache"] }, whole: [], bleeding: false, note: "Long day at work — probably posture." },
  { ago: 9, pain: 2, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 10, pain: 1, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 11, pain: 2, impact: 0, sites: {}, whole: ["Fatigue"], bleeding: false },

  // Ovulation flare (days 12–14) — confirmed episode
  { ago: 12, pain: 6, impact: 15, sites: { Pelvis: ["Stabbing", "Pressure"], "During or after sex": ["Deep pain"] }, whole: ["Bloating"], bleeding: true, note: "Sharp one-sided pain — right side. Some spotting.", detail: { worse: "Sudden movement, intercourse", better: "Rest", timing: "Sudden onset midday", pattern: "Mid-cycle", cycleLink: "Mid-cycle (ovulation window)" } },
  { ago: 13, pain: 7, impact: 25, sites: { Pelvis: ["Stabbing", "Pressure"], "Lower back": ["Dull ache"], Bladder: ["Frequency", "Urgency"] }, whole: ["Bloating", "Fatigue"], bleeding: true, med: { name: "Paracetamol 1g", effect: "Partly" }, note: "Still sharp on the right. Struggled to concentrate." },
  { ago: 14, pain: 5, impact: 15, sites: { Pelvis: ["Pressure"], Bladder: ["Frequency"] }, whole: ["Bloating"], bleeding: false },

  // Recovery — mostly quiet
  { ago: 15, pain: 2, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 16, pain: 3, impact: 0, sites: { "Lower back": ["Dull ache"] }, whole: [], bleeding: false },
  // ago:17 skipped intentionally
  { ago: 18, pain: 1, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 19, pain: 2, impact: 0, sites: {}, whole: ["Fatigue"], bleeding: false },
  { ago: 20, pain: 4, impact: 15, sites: { Pelvis: ["Cramping"], Bowel: ["Bloating", "Constipation"] }, whole: ["Bloating"], bleeding: false, note: "Bowels felt sluggish today." },
  { ago: 21, pain: 3, impact: 0, sites: { Bowel: ["Bloating"] }, whole: ["Bloating"], bleeding: false },
  { ago: 22, pain: 2, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 23, pain: 1, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 24, pain: 2, impact: 0, sites: {}, whole: ["Fatigue"], bleeding: false },
  { ago: 25, pain: 3, impact: 0, sites: { "Lower back": ["Dull ache"] }, whole: [], bleeding: false },

  // Previous cycle — menstrual flare (days 28–32)
  { ago: 28, pain: 4, impact: 15, sites: { Pelvis: ["Cramping"] }, whole: ["Fatigue"], bleeding: false, note: "PMS-y — period expected soon." },
  { ago: 29, pain: 7, impact: 25, sites: { Pelvis: ["Cramping", "Stabbing"], "Lower back": ["Cramping"] }, whole: ["Bloating", "Fatigue", "Bleeding"], bleeding: false, med: { name: "Ibuprofen 400mg", effect: "Partly" }, detail: { worse: "Standing", better: "Heat, lying down", timing: "Constant", pattern: "Day 1 of period", cycleLink: "Yes — period" } },
  { ago: 30, pain: 8, impact: 25, sites: { Pelvis: ["Cramping", "Stabbing", "Pressure"], "Lower back": ["Cramping"], Bowel: ["Pain with bowel movements"] }, whole: ["Bloating", "Fatigue", "Nausea", "Bleeding"], bleeding: false, med: { name: "Ibuprofen 400mg + Paracetamol 1g", effect: "Partly" }, note: "Worst day of the cycle." },
  { ago: 31, pain: 6, impact: 15, sites: { Pelvis: ["Cramping"], "Lower back": ["Dull ache"] }, whole: ["Fatigue", "Bleeding"], bleeding: false, med: { name: "Ibuprofen 400mg", effect: "Helped" } },
  { ago: 32, pain: 4, impact: 15, sites: { Pelvis: ["Dull ache"] }, whole: ["Bleeding"], bleeding: false },
  { ago: 33, pain: 2, impact: 0, sites: {}, whole: ["Bleeding"], bleeding: false },
  { ago: 34, pain: 1, impact: 0, sites: {}, whole: [], bleeding: false },

  { ago: 35, pain: 2, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 36, pain: 1, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 37, pain: 3, impact: 0, sites: { "Lower back": ["Dull ache"] }, whole: [], bleeding: false },
  // ago:38 skipped
  { ago: 39, pain: 2, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 40, pain: 1, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 41, pain: 2, impact: 0, sites: {}, whole: ["Fatigue"], bleeding: false },
  { ago: 42, pain: 3, impact: 0, sites: { Pelvis: ["Dull ache"] }, whole: [], bleeding: false },
  { ago: 43, pain: 2, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 44, pain: 1, impact: 0, sites: {}, whole: [], bleeding: false },
  { ago: 45, pain: 2, impact: 0, sites: {}, whole: [], bleeding: false },
];

function toLog(t: Template): DailyLog {
  const d = daysAgo(t.ago);
  const burden = calcBurden(t.pain, t.impact, t.sites, t.whole, t.bleeding);
  return {
    id: `demo-${t.ago}-${Math.random().toString(36).slice(2, 6)}`,
    date: dateStr(d),
    loggedAt: d.toISOString(),
    pain: t.pain,
    siteDescriptors: t.sites,
    wholeBody: t.whole,
    bleedingUnexpected: t.whole.includes("Bleeding") ? (t.bleeding ?? false) : null,
    otherSymptoms: t.note ?? "",
    impact: t.impact,
    impactChosen: t.impact > 0 || t.pain >= 4,
    medicationName: t.med?.name ?? "",
    medicationEffect: t.med?.effect ?? null,
    detail: {
      worse: t.detail?.worse ?? "",
      better: t.detail?.better ?? "",
      timing: t.detail?.timing ?? "",
      pattern: t.detail?.pattern ?? "",
      cycleLink: t.detail?.cycleLink ?? "",
    },
    burden,
  };
}

export function seedDemoData() {
  const logs = TEMPLATES.map(toLog).sort((a, b) => b.date.localeCompare(a.date));
  window.localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  window.localStorage.setItem(PATHWAY_KEY, "diagnosed");
  window.localStorage.setItem(
    DIAGNOSIS_KEY,
    JSON.stringify({
      completed: true,
      confirmedBy: "Laparoscopy — Dr. Ayesha Khan, Gynaecology",
      diagnosisDate: "2024-03-14",
      stage: "Stage II (moderate) — endometrial deposits on left ovary and pouch of Douglas",
      medicationPrescribed: "Combined oral contraceptive (continuous), Ibuprofen 400mg PRN, Paracetamol 1g PRN",
      surgeries: "Diagnostic laparoscopy with excision — March 2024",
      knownSideEffects: "Mild nausea on higher-dose ibuprofen; low mood on hormonal treatment for the first 6 weeks.",
      allergies: "Penicillin (rash)",
      notes: "9 years from first GP visit to diagnosis. Cycle length ~29 days. Ovulation pain typically right side.",
    }),
  );
}

export function clearDemoData() {
  window.localStorage.removeItem(LOGS_KEY);
  window.localStorage.removeItem(PATHWAY_KEY);
  window.localStorage.removeItem(DIAGNOSIS_KEY);
}