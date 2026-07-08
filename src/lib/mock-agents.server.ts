// ============================================================================
// Mock three-agent pipeline (server-only).
// ----------------------------------------------------------------------------
// This file simulates the production Anthropic-powered pipeline. When the
// real Python FastAPI backend replaces this layer, `/api/process` will simply
// forward to it — this module can be deleted without touching UI code.
// ============================================================================

import type { AgentStage, StructuredReport } from "@/services/api";

export type IntakeInput = {
  patient_name: string;
  dob?: string;
  sex?: string;
  clinician?: string;
  input_text: string;
};

const TERM_MATCHERS: { pattern: RegExp; term: string }[] = [
  { pattern: /cramp|period pain|menstrual pain/i, term: "Dysmenorrhea" },
  { pattern: /pelvi|lower abdomen|low(er)? belly/i, term: "Pelvic pain" },
  { pattern: /bloat|swollen|distend/i, term: "Bloating" },
  { pattern: /nausea|sick to stomach|vomit/i, term: "Nausea" },
  { pattern: /fatigue|exhaust|drained|tired/i, term: "Fatigue" },
  { pattern: /heavy bleed|clots|flooding/i, term: "Heavy menstrual bleeding" },
  { pattern: /spotting|between periods|irregular bleed/i, term: "Intermenstrual bleeding" },
  { pattern: /pain during sex|dyspareunia|painful intercourse/i, term: "Dyspareunia" },
  { pattern: /pain(ful)? (when )?(peeing|urinating)|burning wee/i, term: "Dysuria" },
  { pattern: /pain(ful)? (during|when)? ?(bowel|poo|stool|defec)/i, term: "Dyschezia" },
  { pattern: /woke|waking|night sweat|insomnia/i, term: "Sleep disruption" },
  { pattern: /back pain|lower back/i, term: "Lower back pain" },
  { pattern: /mood|anxious|low mood|depress/i, term: "Mood change" },
  { pattern: /chest (pain|tight)|breath/i, term: "Chest pain" },
  { pattern: /headache|migraine/i, term: "Headache" },
];

const RISK_MATCHERS: { pattern: RegExp; risk: string }[] = [
  { pattern: /chest (pain|tight)|shortness of breath/i, risk: "Possible cardiovascular symptom — needs urgent review" },
  { pattern: /heavy bleed|clots|flooding/i, risk: "Menorrhagia — anaemia screening indicated" },
  { pattern: /woke|waking|night/i, risk: "Symptoms disrupting sleep — quality-of-life impact" },
  { pattern: /9 (year|month)|years to diagnos/i, risk: "Diagnostic delay documented in patient history" },
];

// -------------------- SOCRATES heuristic extraction --------------------
// Site · Onset · Character · Radiation · Associations · Time course ·
// Exacerbating/relieving · Severity. Pure string heuristics — good enough
// for the mock; the real backend will replace this with the LLM output.
function extractSocrates(text: string): StructuredReport["socrates"] {
  const t = text.toLowerCase();
  const first = (patterns: RegExp[]): string | null => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[0].trim().replace(/\s+/g, " ");
    }
    return null;
  };
  const site = first([
    /(left|right|lower|upper|mid)[- ](abdomen|belly|back|chest|pelvis|side)/i,
    /(pelvic|abdominal|chest|back|head|leg|arm|joint) (pain|ache|discomfort)/i,
  ]);
  const onset = first([
    /(sudden(ly)?|gradual(ly)?|since (yesterday|last night|this morning|\w+ ago)|started \w+ ago|for the (last|past) [^.,;]+)/i,
  ]);
  const character = first([
    /(sharp|dull|throbbing|burning|stabbing|cramping|aching|pressure|tight(ness)?|shooting|colicky) [^.,;]{0,40}/i,
  ]);
  const radiation = first([
    /(radiat\w+|spread\w+|shoots?) (to|down|into|towards?) [^.,;]+/i,
  ]);
  const associations = first([
    /(with|and|also|along with) (nausea|vomiting|fever|chills|dizziness|shortness of breath|bloating|fatigue|bleeding|sweating)[^.,;]*/i,
  ]);
  const time_course = first([
    /(constant|intermittent|comes and goes|worse (at night|in the morning|after eating)|lasts? [^.,;]+|every (day|week|month)|for [0-9]+ (days?|weeks?|months?|years?))/i,
  ]);
  const exacerbating_relieving = first([
    /(worse (with|when|after|on)|better (with|when|after)|relieved by|eased by|triggered by) [^.,;]+/i,
  ]);
  const severityWord = first([/(mild|moderate|severe|excruciating|unbearable)/i]);
  const severityScale = t.match(/(\d{1,2})\s*(?:\/|out of)\s*10/);
  const severity = severityScale
    ? `${severityScale[1]}/10${severityWord ? ` (${severityWord})` : ""}`
    : severityWord;
  return {
    site,
    onset,
    character,
    radiation,
    associations,
    time_course,
    exacerbating_relieving,
    severity,
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function extractTerms(text: string): string[] {
  const matched = TERM_MATCHERS.filter(({ pattern }) => pattern.test(text)).map((m) => m.term);
  return Array.from(new Set(matched));
}

function extractRisks(text: string): string[] {
  const matched = RISK_MATCHERS.filter(({ pattern }) => pattern.test(text)).map((m) => m.risk);
  if (!matched.length) return ["No acute red-flag symptoms identified in this submission"];
  return Array.from(new Set(matched));
}

function summarise(input: IntakeInput): string {
  const name = input.patient_name || "Patient";
  const excerpt = input.input_text.trim().replace(/\s+/g, " ").slice(0, 240);
  return `${name} reports: ${excerpt}${input.input_text.length > 240 ? "…" : ""}`;
}

// -------------------- Agent 1: Intake --------------------
async function runIntakeAgent(input: IntakeInput) {
  const start = Date.now();
  await delay(350);
  if (!input.input_text.trim()) throw new Error("Intake Agent: input_text is empty");
  return {
    duration_ms: Date.now() - start,
    normalized_text: input.input_text.trim(),
  };
}

// -------------------- Agent 2: Normalisation --------------------
async function runNormalisationAgent(input: IntakeInput, normalized_text: string) {
  const start = Date.now();
  await delay(550);
  const terms = extractTerms(normalized_text);
  const risks = extractRisks(normalized_text);
  const socrates = extractSocrates(normalized_text);
  return {
    duration_ms: Date.now() - start,
    structured: {
      patient_summary: summarise(input),
      key_findings: terms.length
        ? terms.map((t) => `Reported symptom consistent with ${t.toLowerCase()}`)
        : ["No standard clinical terms extracted — review raw notes with clinician"],
      risk_indicators: risks,
      recommendations: [
        "Bring this record to your next clinician appointment",
        terms.length
          ? "Ask specifically about further investigation of the terms above"
          : "Consider expanding the free-text notes at your next log entry",
        "Track symptom recurrence to build a pattern over time",
      ],
      follow_up_actions: [
        "Log any new or changed symptoms within 7 days",
        "Request written summary from clinician after the appointment",
        "Return here to update the record",
      ],
      clinical_terms: terms,
      socrates,
    },
  };
}

// -------------------- Agent 3: PDF Report --------------------
async function runPdfReportAgent(input: IntakeInput, structured: Omit<StructuredReport, "generated_at" | "patient">) {
  const start = Date.now();
  await delay(500);
  const generated_at = new Date().toISOString();
  const report: StructuredReport = {
    ...structured,
    generated_at,
    patient: {
      name: input.patient_name || "Patient",
      dob: input.dob,
      sex: input.sex,
      clinician: input.clinician,
    },
  };
  return { duration_ms: Date.now() - start, report };
}

// -------------------- Orchestration --------------------
export async function runPipeline(input: IntakeInput): Promise<{
  stages: AgentStage[];
  report: StructuredReport;
}> {
  const stages: AgentStage[] = [
    { name: "Intake Agent", status: "pending" },
    { name: "Normalisation Agent", status: "pending" },
    { name: "PDF Report Agent", status: "pending" },
  ];

  const intake = await runIntakeAgent(input);
  stages[0] = { name: "Intake Agent", status: "complete", duration_ms: intake.duration_ms };

  const norm = await runNormalisationAgent(input, intake.normalized_text);
  stages[1] = {
    name: "Normalisation Agent",
    status: "complete",
    duration_ms: norm.duration_ms,
    detail: `${norm.structured.clinical_terms.length} clinical term(s) extracted`,
  };

  const pdf = await runPdfReportAgent(input, norm.structured);
  stages[2] = {
    name: "PDF Report Agent",
    status: "complete",
    duration_ms: pdf.duration_ms,
    detail: "Report ready to download",
  };

  return { stages, report: pdf.report };
}