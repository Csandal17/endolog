import { createFileRoute } from "@tanstack/react-router";
import { CheckInProvider, useCheckIn } from "@/lib/check-in-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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

      <div className="min-h-[320px] rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Step {step} content coming soon.
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          Back
        </Button>
        <Button
          onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
          disabled={step === TOTAL_STEPS}
        >
          Continue
        </Button>
      </div>
    </Card>
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