import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowRight,
  Sparkles,
  Clock,
  ShieldCheck,
  Stethoscope,
  NotebookPen,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Statistics />
      <HowItWorks />
      <QuietPromise />
      <Testimonial />
      <CTA />
      <Footer />
    </div>
  );
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground">
        <span className="font-serif text-base leading-none">M</span>
      </div>
      <span className="font-serif text-2xl tracking-tight text-charcoal">EndoHer</span>
    </Link>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Wordmark />
        <nav className="hidden items-center gap-8 text-sm text-warm-grey md:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#why" className="hover:text-foreground">Why EndoHer</a>
          <a href="#story" className="hover:text-foreground">Story</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="hidden sm:inline-flex" asChild>
            <Link to="/dashboard">Sign in</Link>
          </Button>
          <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90" asChild>
            <Link to="/dashboard">
              Start logging
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 460px at 12% 8%, color-mix(in oklab, var(--color-pink) 32%, transparent), transparent), radial-gradient(900px 380px at 92% 18%, color-mix(in oklab, var(--color-powder) 40%, transparent), transparent)",
        }}
      />
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <Badge className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-charcoal hover:bg-primary/15">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            The AI health advocate for endometriosis
          </Badge>
          <h1 className="mt-6 font-serif text-5xl leading-[1.02] tracking-tight text-charcoal sm:text-6xl lg:text-[68px]">
            <span className="block">You know</span>
            <span className="block">
              <span className="text-pink">your body</span> best
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-warm-grey">
            Keep a timeline of your symptoms so every appointment starts with the full picture.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" className="rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90" asChild>
              <Link to="/dashboard">
                Start a log
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-full border-border bg-background px-6" asChild>
              <a href="#how">How EndoHer listens</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-warm-grey">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Your words stay yours
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
          className="relative"
        >
          <LogPreview />
        </motion.div>
      </div>
    </section>
  );
}

function LogPreview() {
  const pain = 6;
  const pct = pain * 10;
  return (
    <div className="relative mx-auto max-w-md">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[3rem] opacity-70 blur-3xl"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--color-pink) 55%, transparent), color-mix(in oklab, var(--color-powder) 55%, transparent))",
        }}
      />
      <Card className="rounded-[2rem] border-border/60 bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between text-xs text-warm-grey">
          <span className="font-medium uppercase tracking-[0.2em]">Today's check-in</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Step 1 of 3
          </span>
        </div>

        <h3 className="mt-4 font-serif text-2xl leading-snug tracking-tight text-charcoal">
          Pain during the day
        </h3>
        <p className="mt-1 text-sm text-warm-grey">
          Your overall pain experience across today, not just this moment.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <div className="flex-1">
            <div className="relative h-2 w-full rounded-full bg-stone/60">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
              <div
                className="absolute -top-1.5 h-5 w-5 rounded-full border-2 border-primary bg-background shadow-sm"
                style={{ left: `calc(${pct}% - 10px)` }}
              />
            </div>
            <div className="mt-3 flex justify-between text-[11px] text-warm-grey">
              <span>No pain</span>
              <span>Worst imaginable</span>
            </div>
          </div>
          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-charcoal"
            style={{ background: "color-mix(in oklab, var(--color-pink) 55%, transparent)", fontFamily: "Fraunces, serif" }}
            aria-label={`Pain rating ${pain} out of 10`}
          >
            <span className="text-3xl leading-none">{pain}</span>
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-warm-grey">
            Pain site
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "Pelvis", active: true },
              { label: "Lower back", active: true },
              { label: "Abdomen", active: false },
              { label: "Legs", active: false },
            ].map((c) => (
              <span
                key={c.label}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={
                  c.active
                    ? {
                        background: "color-mix(in oklab, var(--color-pink) 45%, transparent)",
                        borderColor: "color-mix(in oklab, var(--color-pink) 70%, transparent)",
                        color: "var(--color-charcoal)",
                      }
                    : {
                        background: "transparent",
                        borderColor: "color-mix(in oklab, var(--color-stone) 80%, transparent)",
                        color: "var(--color-warm-grey)",
                      }
                }
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <span className="inline-flex items-center gap-1 rounded-full bg-charcoal px-4 py-2 text-xs font-semibold text-background">
            Continue
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Card>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="absolute -left-6 top-10 hidden items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-lg sm:flex"
      >
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-sage/40">
          <NotebookPen className="h-4 w-4 text-charcoal" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-warm-grey">Ready for</div>
          <div className="font-serif text-base leading-none text-charcoal">Your GP visit</div>
        </div>
      </motion.div>
    </div>
  );
}

function PatternStrip() {
  // Six weeks of severity dots, purely illustrative
  const weeks = [
    [1, 2, 1, 0, 0, 0, 0],
    [0, 1, 2, 3, 2, 1, 0],
    [0, 0, 1, 1, 0, 0, 0],
    [1, 2, 3, 3, 2, 1, 1],
    [0, 1, 1, 0, 0, 0, 0],
    [1, 2, 3, 3, 3, 2, 1],
  ];
  const color = (n: number) => {
    if (n === 0) return "color-mix(in oklab, var(--color-stone) 25%, transparent)";
    if (n === 1) return "color-mix(in oklab, var(--color-pink) 40%, transparent)";
    if (n === 2) return "color-mix(in oklab, var(--color-pink) 65%, transparent)";
    return "var(--color-pink)";
  };
  return (
    <div className="mt-3 grid grid-cols-7 gap-1.5">
      {weeks.flat().map((n, i) => (
        <span
          key={i}
          className="h-3.5 w-full rounded-[4px]"
          style={{ background: color(n) }}
        />
      ))}
    </div>
  );
}

function Statistics() {
  return (
    <section id="why" className="border-y border-border/40 bg-secondary/40">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-warm-grey">Why EndoHer exists</p>
          <h2 className="mt-3 font-serif text-3xl leading-tight tracking-tight text-charcoal sm:text-4xl">
            Endometriosis is hard to name, and easy to dismiss.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            headline="9 yrs 4 mo"
            body="Average time to diagnose endometriosis in the UK."
            tint="pink"
          />
          <StatCard
            headline="11 years"
            body="Average wait for women from ethnically diverse communities."
            tint="powder"
          />
          <StatCard
            headline="83%"
            body="Of women were told by a practitioner they were making a fuss about nothing."
            tint="butter"
          />
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-relaxed text-warm-grey">
          Almost half visited their GP ten or more times before anyone joined the dots.
          EndoHer helps you be harder to dismiss.
        </p>
      </div>
    </section>
  );
}

function StatCard({ headline, body, tint }: { headline: string; body: string; tint: "pink" | "powder" | "butter" | "sage" }) {
  return (
    <Card className="rounded-3xl border-border/60 bg-card p-7 shadow-sm">
      <div
        className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal"
        style={{ background: `color-mix(in oklab, var(--color-${tint}) 45%, transparent)` }}
      >
        Data point
      </div>
      <div className="mt-5 font-serif text-4xl leading-none tracking-tight text-charcoal">
        {headline}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-warm-grey">{body}</p>
    </Card>
  );
}

const steps = [
  {
    icon: NotebookPen,
    title: "Describe your symptoms, we translate it clinically",
    body: "Say how you feel. We map it to vocabulary a doctor recognises.",
    tint: "pink",
  },
  {
    icon: Sparkles,
    title: "Be reminded to get clinician support",
    body: "Once your symptom severity & frequency crosses the clinical threshold, we send you a reminder to book the GP.",
    tint: "powder",
  },
  {
    icon: Stethoscope,
    title: "The full picture, at every visit",
    body: "Over weeks the pattern builds into a summary of trends. The clinician interprets and acts on it right away.",
    tint: "sage",
  },
] as const;

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-warm-grey">How EndoHer listens</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-charcoal sm:text-5xl">
          The meaningful interval between things.
        </h2>
        <p className="mt-4 text-warm-grey">
          Three small acts, repeated. That's the whole app.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: i * 0.06, duration: 0.5 }}
          >
            <Card className="group h-full rounded-3xl border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3">
                <div
                  className="grid h-11 w-11 place-items-center rounded-2xl text-charcoal"
                  style={{ background: `color-mix(in oklab, var(--color-${s.tint}) 45%, transparent)` }}
                >
                  <s.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-grey">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="mt-5 font-serif text-2xl leading-snug tracking-tight text-charcoal">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-warm-grey">{s.body}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function QuietPromise() {
  const promises = [
    "EndoHer never draws conclusions.",
    "EndoHer never replaces your clinician.",
    "Your words are yours, export or delete, always.",
    "Log in the language your body speaks.",
  ];
  return (
    <section className="bg-secondary/40 py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-warm-grey">A quiet promise</p>
          <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-charcoal sm:text-5xl">
            A record, never a diagnosis.
          </h2>
          <p className="mt-4 max-w-lg text-warm-grey">
            EndoHer maps your words to clinical terms a doctor recognises, never replacing them,
            never drawing conclusions. The clinician interprets. EndoHer helps you be heard.
          </p>
        </div>
        <ul className="space-y-3">
          {promises.map((p, i) => (
            <motion.li
              key={p}
              initial={{ opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-5 py-4 text-sm text-charcoal shadow-sm"
            >
              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-pink/40">
                <span className="h-2 w-2 rounded-full bg-primary" />
              </span>
              <span>{p}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section id="story" className="mx-auto max-w-4xl px-6 py-24 text-center">
      <Quote className="mx-auto h-8 w-8 text-primary" />
      <blockquote className="mt-6 font-serif text-3xl leading-tight tracking-tight text-charcoal sm:text-4xl">
        “For the first time I walked into an appointment with the words for what I'd been
        living with. My GP paused, read the page, and said, okay. Let's look at this
        properly.”
      </blockquote>
      <div className="mt-6 text-sm text-warm-grey">
        Anonymous · EndoHer user, 14 months to diagnosis
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div
        className="relative overflow-hidden rounded-[2.5rem] px-10 py-16 text-charcoal sm:px-16 sm:py-20"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--color-pink) 55%, var(--color-parchment)), color-mix(in oklab, var(--color-powder) 55%, var(--color-parchment)))",
        }}
      >
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-butter/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-sage/25 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Start your record today.
          </h2>
          <p className="mt-4 text-charcoal/80">
            A sentence is enough. Come back tomorrow and the day after. In a few weeks,
            the pattern will speak for you.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="rounded-full bg-charcoal px-6 text-background hover:bg-charcoal/90" asChild>
              <Link to="/dashboard">
                Start logging
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-full border-charcoal/20 bg-transparent px-6 text-charcoal hover:bg-white/40 hover:text-charcoal" asChild>
              <a href="#how">See how it works</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-14 text-sm md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <Wordmark />
          <p className="mt-3 max-w-xs text-warm-grey">
            The AI health advocate for endometriosis. Not a substitute for medical advice.
          </p>
        </div>
        {[
          { title: "Product", items: ["How it works", "Languages", "Privacy"] },
          { title: "For clinicians", items: ["The EndoHer record", "Research", "Contact"] },
          { title: "Legal", items: ["Privacy", "Terms", "Data & you"] },
        ].map((c) => (
          <div key={c.title}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal">{c.title}</div>
            <ul className="mt-4 space-y-2 text-warm-grey">
              {c.items.map((i) => (
                <li key={i}><a href="#" className="hover:text-foreground">{i}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-warm-grey">
          <span>© {new Date().getFullYear()} EndoHer. Made with care.</span>
          <span>EndoHer does not diagnose. Always consult a clinician.</span>
        </div>
      </div>
    </footer>
  );
}