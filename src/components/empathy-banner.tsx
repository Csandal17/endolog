import type { ReactNode } from "react";
import {
  HeartPulse,
  Flame,
  Droplets,
  Bed,
  Sparkles,
  Toilet,
  Wind,
  Activity,
  type LucideIcon,
} from "lucide-react";

export type SymptomKey =
  | "pelvic-pain"
  | "period-pain"
  | "fatigue"
  | "pain-during-sex"
  | "bowel"
  | "bladder"
  | "bleeding"
  | "bloating"
  | "back-pain"
  | "general";

type Entry = {
  icon: LucideIcon;
  headline: string;
  subtext: string;
  source: string;
};

const LOOKUP: Record<SymptomKey, Entry> = {
  "pelvic-pain": {
    icon: HeartPulse,
    headline: "You are not alone — around 1 in 10 women live with pelvic pain from endometriosis.",
    subtext:
      "Pelvic pain like yours often gets dismissed as ordinary period cramps. Logging it, day by day, gives your pain a paper trail.",
    source: "Endometriosis UK, 2024",
  },
  "period-pain": {
    icon: Flame,
    headline: "You are not alone — 4 in 5 people with endometriosis describe severe period pain.",
    subtext:
      "Period pain that stops you living your life isn't 'just how it is'. Each entry helps a clinician see the pattern.",
    source: "NICE guideline NG73, updated 2023",
  },
  fatigue: {
    icon: Bed,
    headline: "You are not alone — over 50% of people with endometriosis report chronic fatigue.",
    subtext:
      "Fatigue is one of the most under-recognised endo symptoms. Tracking it makes it visible instead of invisible.",
    source: "Human Reproduction, 2023",
  },
  "pain-during-sex": {
    icon: Sparkles,
    headline: "You are not alone — half of people with endometriosis experience pain during or after sex.",
    subtext:
      "This symptom is deeply personal and often unspoken. Your entries help name what has been hard to describe.",
    source: "World Endometriosis Society, 2022",
  },
  bowel: {
    icon: Toilet,
    headline: "You are not alone — up to 1 in 3 people with endometriosis have bowel symptoms.",
    subtext:
      "Bowel pain and changes are often mislabelled as IBS. Recording them here builds a clearer story over time.",
    source: "BMJ Best Practice, 2024",
  },
  bladder: {
    icon: Droplets,
    headline: "You are not alone — bladder pain and urgency affect around 1 in 5 people with endometriosis.",
    subtext:
      "These symptoms are easy to overlook in a short appointment. Your log gives them the space they need.",
    source: "European Society of Human Reproduction, 2022",
  },
  bleeding: {
    icon: Droplets,
    headline: "You are not alone — heavy or irregular bleeding is one of the most common endo signs.",
    subtext:
      "Bleeding outside your expected window matters. Marking it here helps a clinician spot the rhythm.",
    source: "NHS, 2024",
  },
  bloating: {
    icon: Wind,
    headline: "You are not alone — 'endo belly' bloating affects the majority of people with endometriosis.",
    subtext:
      "Bloating can feel invisible to others. Each note you leave here is one they can't dismiss.",
    source: "Journal of Endometriosis, 2023",
  },
  "back-pain": {
    icon: Activity,
    headline: "You are not alone — lower back pain is reported by many people during endo flares.",
    subtext:
      "Back pain doesn't always get linked back to endometriosis. Your history here helps make the connection.",
    source: "Endometriosis Foundation of America, 2023",
  },
  general: {
    icon: HeartPulse,
    headline: "You are not alone — millions live with endometriosis worldwide.",
    subtext:
      "Whatever today felt like, logging it helps you build a record that speaks for you next time you're in a clinic.",
    source: "WHO, 2023",
  },
};

export function getEmpathyEntry(key: SymptomKey): Entry {
  return LOOKUP[key] ?? LOOKUP.general;
}

export function EmpathyBanner({
  symptom,
  headline,
  subtext,
  source,
  icon,
}: {
  symptom: SymptomKey;
  headline?: string;
  subtext?: string;
  source?: string;
  icon?: LucideIcon;
}) {
  const entry = getEmpathyEntry(symptom);
  const Icon = icon ?? entry.icon;
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border p-[14px] pl-4"
      style={{
        background: "#FFFDF8",
        borderColor: "#F0E2C8",
        fontFamily: "Nunito, Karla, system-ui, sans-serif",
      }}
    >
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
        style={{ background: "#FAEEDA" }}
        aria-hidden
      >
        <Icon className="h-4 w-4" style={{ color: "#633806" }} />
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-snug" style={{ color: "#633806" }}>
          {headline ?? entry.headline}
        </p>
        <p className="mt-1 text-[13px] leading-snug" style={{ color: "#7A6A5A" }}>
          {subtext ?? entry.subtext}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "#A2988A" }}>
          Source: {source ?? entry.source}
        </p>
      </div>
    </div>
  );
}

export function EmpathyBannerStack({
  symptoms,
  children,
}: {
  symptoms: SymptomKey[];
  children?: ReactNode;
}) {
  const unique = Array.from(new Set(symptoms));
  const list = unique.length ? unique : (["general"] as SymptomKey[]);
  return (
    <div className="flex flex-col gap-3">
      {list.map((k) => (
        <EmpathyBanner key={k} symptom={k} />
      ))}
      {children}
    </div>
  );
}