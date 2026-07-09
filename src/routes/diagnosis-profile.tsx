import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, FileUp, Save } from "lucide-react";

export const Route = createFileRoute("/diagnosis-profile")({
  head: () => ({
    meta: [
      { title: "Your diagnosis profile · Maai" },
      {
        name: "description",
        content:
          "Tell Maai about your endometriosis diagnosis so tracking, treatment response and doctor summaries can be personalised.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiagnosisProfilePage,
});

// ---- storage ----

const STORAGE_KEY = "diagnosisProfile";

type Profile = Record<string, unknown>;

function readProfile(): Profile {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : {};
  } catch {
    return {};
  }
}
function writeProfile(p: Profile) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

// ---- palette (matches dashboard) ----
const C = {
  bg: "#F3EDE3",
  card: "#FFFFFF",
  text: "#141210",
  muted: "#646059",
  border: "#E8DFD1",
  accent: "#D098E4",
  soft: "#F4E4FA",
};

// ---- option lists ----

const HOW_DIAGNOSED = [
  "Symptoms suspected by clinician",
  "Ultrasound",
  "MRI",
  "Laparoscopy",
  "Biopsy or histology",
  "Diagnosed during surgery",
  "Not sure",
];
const DIAGNOSED_BY = [
  "GP",
  "Gynaecologist",
  "Endometriosis specialist",
  "Private clinic",
  "Emergency department",
  "Surgeon",
  "Other",
  "Not sure",
];
const LOCATIONS = [
  "Pelvic peritoneum",
  "Ovary or endometrioma",
  "Bowel",
  "Bladder",
  "Ureter",
  "Uterosacral ligaments",
  "Pouch of Douglas",
  "Rectovaginal area",
  "Abdominal wall or scar",
  "Adenomyosis",
  "Adhesions",
  "Not sure",
];
const STAGES = [
  "Stage 1",
  "Stage 2",
  "Stage 3",
  "Stage 4",
  "Deep endometriosis",
  "Endometrioma",
  "Adenomyosis",
  "Not told",
  "Not sure",
];
const SURGERIES = [
  "No",
  "Diagnostic laparoscopy",
  "Excision",
  "Ablation",
  "Cyst removal",
  "Adhesions removed",
  "Hysterectomy",
  "Ovary or tube removed",
  "Not sure",
];
const SCANS = [
  "Pelvic ultrasound",
  "Transvaginal ultrasound",
  "MRI pelvis",
  "CT",
  "Blood tests",
  "Laparoscopy",
  "Histology",
  "None",
  "Not sure",
];
const CARE_STAGE = [
  "Managing symptoms myself",
  "Waiting for GP",
  "Waiting for gynaecology referral",
  "Waiting for specialist referral",
  "Under gynaecology",
  "Under specialist care",
  "Recently started treatment",
  "Post-surgery recovery",
  "Monitoring recurrence",
  "Trying to conceive",
  "Not under care",
];
const TREATMENTS = [
  "No treatment",
  "NSAIDs",
  "Paracetamol",
  "Hormonal pill",
  "Progesterone-only pill",
  "Mirena or hormonal coil",
  "Implant",
  "Injection",
  "GnRH medication",
  "Add-back HRT",
  "Pelvic physiotherapy",
  "Diet changes",
  "Heat therapy",
  "TENS",
  "Other",
];
const CURRENT_SYMPTOMS = [
  "Period pain",
  "Pelvic pain outside periods",
  "Bowel pain",
  "Bowel symptoms",
  "Bladder symptoms",
  "Pain with sex",
  "Heavy bleeding",
  "Irregular bleeding",
  "Fatigue",
  "Bloating",
  "Nausea",
  "Back pain",
  "Leg pain",
  "Sleep disruption",
  "Missed work or school",
  "Reduced activity",
];
const RECURRENCE = ["Stable", "Slowly returning", "Suddenly worse", "Never improved", "Not sure"];
const FERTILITY = [
  "Not relevant",
  "Trying to conceive",
  "Fertility concerns",
  "Pregnant",
  "Postpartum",
  "Prefer not to say",
];
const DOCS = [
  "Clinic letters",
  "Operation notes",
  "Histology",
  "MRI",
  "Ultrasound",
  "Discharge summary",
  "Medication letters",
  "Referral letters",
];

const TOTAL_STEPS = 4;

function DiagnosisProfilePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [profile, setProfileState] = useState<Profile>({});

  useEffect(() => {
    setProfileState(readProfile());
  }, []);

  const set = (patch: Profile) =>
    setProfileState((prev) => {
      const next = { ...prev, ...patch };
      return next;
    });

  const save = () => {
    writeProfile(profile);
    try {
      window.localStorage.setItem("maai:pathway", "diagnosed");
    } catch {
      /* ignore */
    }
    setSaved(true);
  };

  return (
    <div style={{ background: C.bg, color: C.text }} className="min-h-screen font-[Karla,system-ui,sans-serif]">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm" style={{ color: C.muted }}>
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
          <span className="text-xs" style={{ color: C.muted }}>
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>

        <h1
          className="text-3xl leading-tight sm:text-4xl"
          style={{ fontFamily: "Fraunces, DM Serif Display, Georgia, serif" }}
        >
          Tell us about your diagnosis
        </h1>
        <p className="mt-2 text-sm" style={{ color: C.muted }}>
          Add what you know. You can skip anything you are unsure about. This helps Maai personalise tracking,
          treatment response, recurrence monitoring, and doctor summaries.
        </p>

        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: C.border }}>
          <div
            className="h-full transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%`, background: C.accent }}
          />
        </div>

        <div className="mt-6 rounded-3xl border bg-white p-5 sm:p-7" style={{ borderColor: C.border }}>
          {step === 1 && <Step1 profile={profile} set={set} />}
          {step === 2 && <Step2 profile={profile} set={set} />}
          {step === 3 && <Step3 profile={profile} set={set} />}
          {step === 4 && <Step4 profile={profile} set={set} />}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm active:scale-[0.97] transition-transform"
            style={{ borderColor: C.border, background: "#fff", color: C.text }}
            disabled={step === 1}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
              className="inline-flex items-center gap-1 rounded-full px-5 py-2 text-sm font-medium active:scale-[0.97] transition-transform"
              style={{ background: C.accent, color: "#000" }}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-1 rounded-full px-5 py-2 text-sm font-medium active:scale-[0.97] transition-transform"
              style={{ background: C.accent, color: "#000" }}
            >
              <Save className="h-4 w-4" /> Save diagnosis profile
            </button>
          )}
        </div>

        {saved && (
          <div
            className="mt-6 rounded-2xl border p-4 text-sm"
            style={{ background: C.soft, borderColor: "#E4CBEF", color: C.text }}
          >
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-semibold">Diagnosis profile saved.</p>
                <p className="mt-1" style={{ color: C.muted }}>
                  Maai will use this to personalise your flare tracking, treatment timeline, recurrence
                  monitoring, and doctor summaries.
                </p>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="mt-3 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium active:scale-[0.97] transition-transform"
                  style={{ background: "#000", color: "#fff" }}
                >
                  Go to dashboard <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- shared inputs ----

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg" style={{ fontFamily: "Fraunces, serif" }}>
      {children}
    </h2>
  );
}
function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
      {children}
    </p>
  );
}

function Chips({
  options,
  value,
  onChange,
  multi = true,
}: {
  options: readonly string[];
  value: string[] | string | undefined;
  onChange: (next: string[] | string) => void;
  multi?: boolean;
}) {
  const selected = multi
    ? Array.isArray(value)
      ? value
      : []
    : typeof value === "string"
      ? [value]
      : [];
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSel = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              if (multi) {
                const arr = Array.isArray(value) ? value : [];
                onChange(isSel ? arr.filter((x) => x !== opt) : [...arr, opt]);
              } else {
                onChange(isSel ? "" : opt);
              }
            }}
            className="rounded-full border px-3 py-1.5 text-sm active:scale-[0.97] transition-transform"
            style={{
              background: isSel ? C.accent : "#fff",
              borderColor: isSel ? C.accent : C.border,
              color: isSel ? "#000" : C.text,
              fontWeight: isSel ? 600 : 400,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-2 w-full rounded-full border px-4 py-2 text-sm outline-none"
      style={{ background: "#fff", borderColor: C.border, color: C.text }}
    />
  );
}

function MonthYear({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="month"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="mt-2 w-full rounded-full border px-4 py-2 text-sm outline-none"
      style={{ background: "#fff", borderColor: C.border, color: C.text }}
    />
  );
}

// ---- steps ----

function Step1({ profile, set }: { profile: Profile; set: (p: Profile) => void }) {
  const get = <T,>(k: string): T | undefined => profile[k] as T | undefined;
  return (
    <div>
      <SectionTitle>Diagnosis basics</SectionTitle>

      <Label>How was it diagnosed?</Label>
      <Chips options={HOW_DIAGNOSED} value={get<string[]>("howDiagnosed")} onChange={(v) => set({ howDiagnosed: v })} />

      <Label>Diagnosis date</Label>
      <MonthYear value={get<string>("diagnosisMonth")} onChange={(v) => set({ diagnosisMonth: v })} />
      <div className="mt-2 flex flex-wrap gap-2">
        <Chips
          options={["I do not remember"]}
          multi={false}
          value={get<string>("diagnosisMemory")}
          onChange={(v) => set({ diagnosisMemory: v })}
        />
      </div>

      <Label>Who diagnosed you?</Label>
      <Chips options={DIAGNOSED_BY} value={get<string[]>("diagnosedBy")} onChange={(v) => set({ diagnosedBy: v })} />

      <Label>Clinic name (optional)</Label>
      <TextField value={get<string>("clinicName")} onChange={(v) => set({ clinicName: v })} placeholder="e.g. St Mary's" />

      <Label>Clinician name (optional)</Label>
      <TextField value={get<string>("clinicianName")} onChange={(v) => set({ clinicianName: v })} placeholder="e.g. Dr Patel" />
    </div>
  );
}

function Step2({ profile, set }: { profile: Profile; set: (p: Profile) => void }) {
  const get = <T,>(k: string): T | undefined => profile[k] as T | undefined;
  return (
    <div>
      <SectionTitle>Diagnosis details</SectionTitle>
      <Label>Where was endometriosis found or suspected?</Label>
      <Chips options={LOCATIONS} value={get<string[]>("locations")} onChange={(v) => set({ locations: v })} />

      <Label>Stage or type (optional)</Label>
      <Chips options={STAGES} multi={false} value={get<string>("stage")} onChange={(v) => set({ stage: v })} />
    </div>
  );
}

function Step3({ profile, set }: { profile: Profile; set: (p: Profile) => void }) {
  const get = <T,>(k: string): T | undefined => profile[k] as T | undefined;
  const surgeries = get<string[]>("surgeries") ?? [];
  const hasSurgery = surgeries.some((s) => s !== "No" && s !== "Not sure");
  return (
    <div>
      <SectionTitle>Surgery, scans and care stage</SectionTitle>

      <Label>Surgery history</Label>
      <Chips options={SURGERIES} value={surgeries} onChange={(v) => set({ surgeries: v })} />

      {hasSurgery && (
        <div
          className="mt-4 rounded-2xl border p-4"
          style={{ background: C.soft, borderColor: "#E4CBEF" }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
            Surgery details (optional)
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <MonthYear value={get<string>("surgeryDate")} onChange={(v) => set({ surgeryDate: v })} />
            <TextField value={get<string>("surgeryHospital")} onChange={(v) => set({ surgeryHospital: v })} placeholder="Hospital" />
            <TextField value={get<string>("surgeon")} onChange={(v) => set({ surgeon: v })} placeholder="Surgeon" />
            <TextField value={get<string>("surgeryFound")} onChange={(v) => set({ surgeryFound: v })} placeholder="What was found" />
            <TextField value={get<string>("surgeryTreated")} onChange={(v) => set({ surgeryTreated: v })} placeholder="What was treated" />
            <TextField value={get<string>("surgeryComplications")} onChange={(v) => set({ surgeryComplications: v })} placeholder="Complications" />
            <TextField value={get<string>("surgerySymptomsImproved")} onChange={(v) => set({ surgerySymptomsImproved: v })} placeholder="Symptoms improved" />
            <TextField value={get<string>("surgerySymptomsReturned")} onChange={(v) => set({ surgerySymptomsReturned: v })} placeholder="Symptoms returned" />
          </div>
        </div>
      )}

      <Label>Scan or test history</Label>
      <Chips options={SCANS} value={get<string[]>("scans")} onChange={(v) => set({ scans: v })} />

      <Label>Current care stage</Label>
      <Chips options={CARE_STAGE} multi={false} value={get<string>("careStage")} onChange={(v) => set({ careStage: v })} />
    </div>
  );
}

function Step4({ profile, set }: { profile: Profile; set: (p: Profile) => void }) {
  const get = <T,>(k: string): T | undefined => profile[k] as T | undefined;
  const treatments = get<string[]>("treatments") ?? [];
  const recurrence = get<string>("recurrence");
  const worsening = recurrence === "Slowly returning" || recurrence === "Suddenly worse";
  const treatmentDetails = (get<Record<string, Record<string, string>>>("treatmentDetails") ?? {}) as Record<
    string,
    Record<string, string>
  >;

  const activeTreatments = useMemo(
    () => treatments.filter((t) => t !== "No treatment"),
    [treatments],
  );

  const updateDetail = (name: string, field: string, val: string) => {
    const next = {
      ...treatmentDetails,
      [name]: { ...(treatmentDetails[name] ?? {}), [field]: val },
    };
    set({ treatmentDetails: next });
  };

  return (
    <div>
      <SectionTitle>Treatment and current symptoms</SectionTitle>

      <Label>Current treatments</Label>
      <Chips options={TREATMENTS} value={treatments} onChange={(v) => set({ treatments: v })} />

      {activeTreatments.length > 0 && (
        <div
          className="mt-4 space-y-3 rounded-2xl border p-4"
          style={{ background: C.soft, borderColor: "#E4CBEF" }}
        >
          {activeTreatments.map((name) => (
            <div key={name}>
              <p className="text-sm font-semibold" style={{ color: C.text }}>{name}</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <TextField
                  value={treatmentDetails[name]?.start}
                  onChange={(v) => updateDetail(name, "start", v)}
                  placeholder="Start date"
                />
                <TextField
                  value={treatmentDetails[name]?.dose}
                  onChange={(v) => updateDetail(name, "dose", v)}
                  placeholder="Dose"
                />
                <TextField
                  value={treatmentDetails[name]?.frequency}
                  onChange={(v) => updateDetail(name, "frequency", v)}
                  placeholder="Frequency"
                />
                <TextField
                  value={treatmentDetails[name]?.helping}
                  onChange={(v) => updateDetail(name, "helping", v)}
                  placeholder="Helping status"
                />
                <TextField
                  value={treatmentDetails[name]?.sideEffects}
                  onChange={(v) => updateDetail(name, "sideEffects", v)}
                  placeholder="Side effects"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Label>Current symptoms</Label>
      <Chips
        options={CURRENT_SYMPTOMS}
        value={get<string[]>("currentSymptoms")}
        onChange={(v) => set({ currentSymptoms: v })}
      />

      <Label>Recurrence status</Label>
      <Chips options={RECURRENCE} multi={false} value={recurrence} onChange={(v) => set({ recurrence: v })} />

      {worsening && (
        <div
          className="mt-4 rounded-2xl border p-4"
          style={{ background: C.soft, borderColor: "#E4CBEF" }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: C.muted }}>
            Worsening details (optional)
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <MonthYear value={get<string>("returnedWhen")} onChange={(v) => set({ returnedWhen: v })} />
            <TextField
              value={get<string>("firstReturned")}
              onChange={(v) => set({ firstReturned: v })}
              placeholder="First symptoms to return"
            />
            <TextField
              value={get<string>("similarToBefore")}
              onChange={(v) => set({ similarToBefore: v })}
              placeholder="Similar to before treatment?"
            />
            <TextField
              value={get<string>("worseThanBefore")}
              onChange={(v) => set({ worseThanBefore: v })}
              placeholder="Worse than before treatment?"
            />
          </div>
        </div>
      )}

      <Label>Fertility context (optional)</Label>
      <Chips options={FERTILITY} multi={false} value={get<string>("fertility")} onChange={(v) => set({ fertility: v })} />

      <div className="mt-6 rounded-2xl border p-4" style={{ background: "#fff", borderColor: C.border }}>
        <p className="text-sm font-semibold" style={{ fontFamily: "Fraunces, serif" }}>
          Diagnosis documents
        </p>
        <p className="mt-1 text-xs" style={{ color: C.muted }}>
          Upload placeholders — nothing leaves your device yet.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DOCS.map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed px-3 py-3 text-sm"
              style={{ borderColor: C.border, color: C.muted }}
            >
              <FileUp className="h-4 w-4" />
              <span>{d}</span>
              <input type="file" className="hidden" />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}