import { createFileRoute } from "@tanstack/react-router";
import { CheckInProvider, useCheckIn } from "@/lib/check-in-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/check-in")({
  head: () => ({
    meta: [
      { title: "Daily check-in · EndoHer" },
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [thumbPct, setThumbPct] = useState(dayRecord.pain * 10);

  useEffect(() => {
    setThumbPct(dayRecord.pain * 10);
  }, [dayRecord.pain]);

  const openTip = () => setShowTip(true);
  const closeTip = () => setShowTip(false);

  return (
    <div>
      <h2 className="font-serif text-2xl text-foreground">Pain during the day</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your overall pain experience across today — not just this moment.
      </p>

      <div className="mt-8 flex items-center gap-6">
        <div className="flex-1">
          <div
            ref={trackRef}
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
            <PainTooltip value={dayRecord.pain} pct={thumbPct} visible={showTip} />
            <Slider
              value={[dayRecord.pain]}
              min={0}
              max={10}
              step={1}
              onValueChange={([v]) => {
                setShowTip(true);
                setDayRecord((prev) => ({ ...prev, pain: v }));
              }}
            />
          </div>
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

      <div className="mt-8 flex justify-end">
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}

const PAIN_MESSAGES: Record<number, string> = {
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

function PainTooltip({
  value,
  pct,
  visible,
}: {
  value: number;
  pct: number;
  visible: boolean;
}) {
  const clampedPct = Math.max(0, Math.min(100, pct));
  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none absolute left-0 right-0 z-20"
      style={{ top: -12, transform: "translateY(-100%)" }}
    >
      <div className="relative h-0">
        <div
          className="absolute"
          style={{
            left: `${clampedPct}%`,
            transform: "translateX(-50%)",
            maxWidth: 240,
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
            <p
              className="text-[13px] font-semibold leading-tight"
              style={{ color: "#3B1F2B" }}
            >
              Pain {value} out of 10
            </p>
            <p className="mt-1 text-[12px] leading-snug" style={{ color: "#5A3B48" }}>
              {PAIN_MESSAGES[value]}
            </p>
          </div>
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