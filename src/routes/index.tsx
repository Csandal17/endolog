import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Activity,
  HeartPulse,
  Sparkles,
  ShieldCheck,
  LineChart,
  MessageCircleHeart,
  ArrowRight,
  Check,
  Star,
  Moon,
  Droplets,
  Footprints,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import heroMockup from "@/assets/hero-mockup.jpg";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <TrustBar />
      <Features />
      <Insights />
      <Testimonial />
      <Pricing />
      <CTA />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="#" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <HeartPulse className="h-5 w-5" />
          </div>
          <span className="font-serif text-xl tracking-tight">Intelly</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#insights" className="hover:text-foreground">Insights</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#story" className="hover:text-foreground">Story</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="hidden sm:inline-flex">Sign in</Button>
          <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            Get the app
            <ArrowRight className="ml-1 h-4 w-4" />
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
            "radial-gradient(1200px 500px at 15% 10%, color-mix(in oklab, var(--color-teal) 18%, transparent), transparent), radial-gradient(900px 400px at 90% 20%, color-mix(in oklab, var(--color-blue-accent) 22%, transparent), transparent)",
        }}
      />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <Badge className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-primary hover:bg-primary/5">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            New · AI-guided daily check-in
          </Badge>
          <h1 className="mt-6 font-serif text-5xl leading-[1.05] tracking-tight text-charcoal sm:text-6xl lg:text-7xl">
            Healthcare, <em className="text-primary">gently</em> intelligent.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Intelly listens to your vitals, understands your rhythm, and turns everyday
            data into calm, considered guidance — so you can take care of yourself
            without the noise.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" className="rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">
              Start free for 30 days
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="rounded-full border-primary/20 bg-background px-6">
              See a live demo
            </Button>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              HIPAA-ready
            </div>
            <div className="flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-coral text-coral" />
              4.9 · App Store
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
          className="relative"
        >
          <div className="relative mx-auto max-w-md">
            <div
              className="absolute -inset-6 -z-10 rounded-[3rem] opacity-70 blur-3xl"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in oklab, var(--color-teal) 40%, transparent), color-mix(in oklab, var(--color-blue-accent) 40%, transparent))",
              }}
            />
            <img
              src={heroMockup}
              alt="Intelly app dashboard shown on a phone against a parchment backdrop"
              className="w-full rounded-[2rem] shadow-2xl ring-1 ring-black/5"
            />
            <FloatingStat
              className="absolute -left-6 top-10 hidden sm:flex"
              icon={<HeartPulse className="h-4 w-4 text-coral" />}
              label="Resting HR"
              value="62 bpm"
            />
            <FloatingStat
              className="absolute -right-4 bottom-16 hidden sm:flex"
              icon={<Moon className="h-4 w-4 text-primary" />}
              label="Sleep score"
              value="87"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FloatingStat({
  icon,
  label,
  value,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.6 }}
      className={`flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-lg ${className}`}
    >
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted">{icon}</div>
      <div className="text-left">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-serif text-lg leading-none">{value}</div>
      </div>
    </motion.div>
  );
}

function TrustBar() {
  const names = ["Mayo Clinic", "Kaiser", "Cleveland Health", "Aetna", "Oura", "WHOOP"];
  return (
    <section className="border-y border-border/60 bg-secondary/50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6 py-6 text-sm uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-xs">Trusted by teams at</span>
        {names.map((n) => (
          <span key={n} className="font-medium">{n}</span>
        ))}
      </div>
    </section>
  );
}

const features = [
  {
    icon: LineChart,
    title: "Vitals, in context",
    body: "Heart rate, HRV, SpO₂ and sleep — plotted on one timeline so patterns stop hiding.",
    tint: "teal",
  },
  {
    icon: Sparkles,
    title: "Insights that whisper",
    body: "Daily nudges written by clinicians and shaped by AI. No dashboards screaming at you.",
    tint: "blue",
  },
  {
    icon: ShieldCheck,
    title: "Yours, encrypted",
    body: "End-to-end encryption, HIPAA-ready storage, and a delete-everything button that means it.",
    tint: "sage",
  },
  {
    icon: MessageCircleHeart,
    title: "Talk to a human",
    body: "Care team messaging built in — hand off from AI to a nurse in one tap when it matters.",
    tint: "coral",
  },
  {
    icon: Activity,
    title: "Connects to everything",
    body: "Apple Health, Google Fit, Oura, Dexcom, Withings. If it measures you, we probably speak to it.",
    tint: "teal",
  },
  {
    icon: Footprints,
    title: "Gentle habits",
    body: "Streaks without shame. Intelly celebrates progress, not perfection.",
    tint: "blue",
  },
] as const;

function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Why Intelly</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          The quiet layer between you and your health data.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Six things we built with clinicians, patients, and one long list of pet peeves about
          existing health apps.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: i * 0.05, duration: 0.5 }}
          >
            <Card className="group h-full rounded-3xl border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div
                className="grid h-11 w-11 place-items-center rounded-2xl"
                style={{
                  background: `color-mix(in oklab, var(--color-${f.tint}) 18%, transparent)`,
                  color: `var(--color-${f.tint})`,
                }}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-serif text-2xl tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Insights() {
  return (
    <section id="insights" className="bg-secondary/40 py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Daily insights</p>
          <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            A morning brief for your body.
          </h2>
          <p className="mt-4 max-w-lg text-muted-foreground">
            Every day at 7am, Intelly stitches together your sleep, recovery, glucose and
            movement into a short, plain-language summary. No graphs unless you ask.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              "HRV is trending up — your recovery window is wide today.",
              "You slept 7h 12m. Deep sleep is above your 30-day average.",
              "Try a 20-minute walk after lunch to soften your glucose curve.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-foreground/80">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <InsightTile icon={<HeartPulse className="h-4 w-4" />} label="Resting HR" value="62" unit="bpm" trend="-3 vs last wk" tint="coral" tall />
          <InsightTile icon={<Moon className="h-4 w-4" />} label="Sleep" value="7:12" unit="hrs" trend="87 score" tint="teal" />
          <InsightTile icon={<Droplets className="h-4 w-4" />} label="Hydration" value="1.9" unit="L" trend="On track" tint="blue" />
          <InsightTile icon={<Footprints className="h-4 w-4" />} label="Steps" value="8,412" unit="today" trend="+12%" tint="sage" tall />
        </div>
      </div>
    </section>
  );
}

function InsightTile({
  icon,
  label,
  value,
  unit,
  trend,
  tint,
  tall,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  trend: string;
  tint: "teal" | "blue" | "coral" | "sage";
  tall?: boolean;
}) {
  return (
    <Card
      className={`rounded-3xl border-border/60 bg-card p-6 shadow-sm ${tall ? "row-span-2" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{
            background: `color-mix(in oklab, var(--color-${tint}) 18%, transparent)`,
            color: `var(--color-${tint})`,
          }}
        >
          {icon}
        </div>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{trend}</span>
      </div>
      <div className="mt-6 font-serif text-4xl leading-none tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {unit} · {label}
      </div>
      {tall && (
        <svg viewBox="0 0 120 40" className="mt-6 h-14 w-full text-primary" fill="none">
          <path
            d="M0 30 C 15 10, 30 35, 45 22 S 75 5, 90 18 S 115 12, 120 20"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </Card>
  );
}

function Testimonial() {
  return (
    <section id="story" className="mx-auto max-w-4xl px-6 py-24 text-center">
      <div className="flex justify-center gap-1 text-coral">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-coral" />
        ))}
      </div>
      <blockquote className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        “Intelly is the first health app I haven't muted. It feels like a thoughtful friend
        who happens to have read all my labs.”
      </blockquote>
      <div className="mt-6 text-sm text-muted-foreground">
        Dr. Amara Osei · Family physician, Toronto
      </div>
    </section>
  );
}

const plans = [
  {
    name: "Everyday",
    price: "$0",
    period: "forever",
    tag: "Start here",
    features: ["Daily insights", "Vitals timeline", "3 device integrations", "Community support"],
    cta: "Download free",
    highlight: false,
  },
  {
    name: "Intelly Plus",
    price: "$9",
    period: "per month",
    tag: "Most loved",
    features: [
      "Everything in Everyday",
      "Unlimited integrations",
      "AI care assistant",
      "Weekly clinician review",
      "Family sharing (up to 4)",
    ],
    cta: "Try free for 30 days",
    highlight: true,
  },
  {
    name: "Care Team",
    price: "$29",
    period: "per month",
    tag: "For families",
    features: [
      "Everything in Plus",
      "Dedicated nurse messaging",
      "Lab result explanations",
      "Appointment prep briefs",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Pricing</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          Simple plans. No dark patterns.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Cancel any time. Your data is yours to export or delete, always.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {plans.map((p) => (
          <Card
            key={p.name}
            className={`relative rounded-3xl p-8 shadow-sm ${
              p.highlight
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 bg-card"
            }`}
          >
            {p.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-coral px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                {p.tag}
              </div>
            )}
            <div className="text-sm uppercase tracking-[0.18em] opacity-80">{p.name}</div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-serif text-5xl tracking-tight">{p.price}</span>
              <span className="text-sm opacity-70">/ {p.period}</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className={`mt-0.5 h-4 w-4 ${p.highlight ? "text-primary-foreground" : "text-primary"}`} />
                  <span className={p.highlight ? "opacity-90" : "text-foreground/80"}>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className={`mt-8 w-full rounded-full ${
                p.highlight
                  ? "bg-background text-foreground hover:bg-background/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {p.cta}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <div
        className="relative overflow-hidden rounded-[2.5rem] px-10 py-16 text-center text-primary-foreground sm:px-16 sm:py-20"
        style={{
          background:
            "linear-gradient(135deg, var(--color-teal), color-mix(in oklab, var(--color-blue-accent) 70%, var(--color-teal)))",
        }}
      >
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <h2 className="relative font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          Your health, quieter and clearer.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-primary-foreground/80">
          Join 240,000 people who wake up to a calmer inbox for their body.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="rounded-full bg-background px-6 text-foreground hover:bg-background/90">
            Get Intelly free
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" className="rounded-full border-white/30 bg-transparent px-6 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">
            Book a demo
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-14 text-sm md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
              <HeartPulse className="h-4 w-4" />
            </div>
            <span className="font-serif text-lg">Intelly</span>
          </div>
          <p className="mt-3 max-w-xs text-muted-foreground">
            A calm, insight-driven healthcare companion.
          </p>
        </div>
        {[
          { title: "Product", items: ["Features", "Insights", "Integrations", "Pricing"] },
          { title: "Company", items: ["About", "Clinicians", "Careers", "Press"] },
          { title: "Legal", items: ["Privacy", "Terms", "Security", "HIPAA"] },
        ].map((c) => (
          <div key={c.title}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">{c.title}</div>
            <ul className="mt-4 space-y-2 text-muted-foreground">
              {c.items.map((i) => (
                <li key={i}><a href="#" className="hover:text-foreground">{i}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Intelly Health, Inc.</span>
          <span>Made with care. Not a substitute for medical advice.</span>
        </div>
      </div>
    </footer>
  );
}
