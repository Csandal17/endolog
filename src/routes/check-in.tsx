import { createFileRoute } from "@tanstack/react-router";
import { CheckInProvider, useCheckIn } from "@/lib/check-in-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/check-in")({
  head: () => ({
    meta: [
      { title: "Daily check-in · Maai" },
      { name: "description", content: "Log today's symptoms and see your burden score update in real time." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckInPage,
});

const TOTAL_STEPS = 5;

function CheckInPage() {
  return (
    <CheckInProvider>
      <div className="min-h-screen bg-background px-4 py-8 md:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <h1 className="font-serif text-3xl text-foreground md:text-4xl">Daily check-in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A few gentle questions to capture what today felt like.
            </p>
          </header>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
            <WizardShell />
            <BurdenPanel />
          </div>
        </div>
      </div>
    </CheckInProvider>
  );
}

function WizardShell() {
  const [step, setStep] = useState(1);
  const { dayRecord } = useCheckIn();

  return (
    <Card className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {step} of {TOTAL_STEPS}
        </span>
        <span>{dayRecord.date}</span>
      </div>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {step === 1 ? (
        <StepPain onContinue={() => setStep(2)} />
      ) : (
        <>
          <div className="min-h-[320px] rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Step {step} content coming soon.
          </div>
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))}>
              Back
            </Button>
            <Button
              onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
              disabled={step === TOTAL_STEPS}
            >
              Continue
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function StepPain({ onContinue }: { onContinue: () => void }) {
  const { dayRecord, setDayRecord } = useCheckIn();
  const [touched, setTouched] = useState(false);
  return (
    <div>
      <h2 className="font-serif text-2xl text-foreground">Pain during the day</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your overall pain experience across today — not just this moment.
      </p>

      <div className="mt-8 flex items-center gap-6">
        <div className="flex-1">
          <Slider
            value={[dayRecord.pain]}
            min={0}
            max={10}
            step={1}
            onValueChange={([v]) => {
              setTouched(true);
              setDayRecord((prev) => ({ ...prev, pain: v }));
            }}
          />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span>No pain</span>
            <span>Worst imaginable</span>
          </div>
        </div>
        <div className="w-20 text-right">
          <span className="font-serif text-5xl text-foreground">{dayRecord.pain}</span>
          <span className="ml-1 text-sm text-muted-foreground">/10</span>
        </div>
      </div>

      {touched ? <ReassuranceBanner kind="pain" value={dayRecord.pain} /> : null}

      <div className="mt-8 flex justify-end">
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}

type BannerContent = { stat: string; message: string };

function painBanner(v: number): BannerContent {
  if (v === 0)
    return {
      stat: "Around 1 in 10 women live with pelvic pain — pain-free days matter just as much to track.",
      message:
        "So glad today felt gentle on your body. Logging the calm days helps your future self see the whole picture. 🌿",
    };
  if (v <= 3)
    return {
      stat: "Roughly 60% of women with endometriosis describe most days as 'mild but present' background pain.",
      message:
        "Even quieter pain deserves to be noticed. You're not overreacting by naming it — you're taking care of yourself. 💛",
    };
  if (v <= 6)
    return {
      stat: "Studies show moderate pelvic pain lasts an average of 7 years before diagnosis. You're not imagining it.",
      message:
        "This kind of day is heavy, and you're still showing up for yourself. That takes real strength. We're with you. 🤍",
    };
  if (v <= 8)
    return {
      stat: "More than 70% of women with endometriosis report pain this severe at some point in a typical month.",
      message:
        "You are so far from alone in this. Please be gentle with yourself tonight — rest is productive too. 🌸",
    };
  return {
    stat: "1 in 3 women with endo describe pain that reaches this level. Your experience is real, and it is valid.",
    message:
      "We're so sorry today has hurt this much. Thank you for still logging — every entry helps you be believed. You are held. 💗",
  };
}

function ReassuranceBanner({
  kind,
  value,
}: {
  kind: "pain";
  value: number;
}) {
  const content = kind === "pain" ? painBanner(value) : painBanner(value);
  return (
    <div
      className="mt-8 rounded-2xl border p-5 sm:p-6"
      style={{
        background: "#FBE9B8",
        borderColor: "#E8DFD1",
        color: "#141210",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#F5B8DB" }}
        >
          <Heart className="h-4 w-4" style={{ color: "#141210" }} />
        </div>
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "#646059" }}
          >
            You're not alone
          </p>
          <p
            className="mt-1 text-base leading-snug sm:text-lg"
            style={{ fontFamily: "Fraunces, DM Serif Display, Georgia, serif" }}
          >
            {content.message}
          </p>
          <p className="mt-2 text-sm" style={{ color: "#646059" }}>
            {content.stat}
          </p>
        </div>
      </div>
    </div>
  );
}

function BurdenPanel() {
  const { dayRecord } = useCheckIn();
  return (
    <Card className="h-fit p-6 md:sticky md:top-8">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Today's burden score</p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-serif text-5xl text-foreground">{dayRecord.burdenScore}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${dayRecord.burdenScore}%` }}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Your score will update as you answer each step.
      </p>
    </Card>
  );
}