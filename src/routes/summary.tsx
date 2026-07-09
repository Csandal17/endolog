import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { readLogs, TopBar, PainTrendCard, ReportPreviewCard, ReportHistoryCard } from "./dashboard";

export const Route = createFileRoute("/summary")({
  head: () => ({
    meta: [
      { title: "Summary · Maai" },
      { name: "description", content: "Your summary notes for doctors, pain trend, and generated report history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SummaryPage,
});

function SummaryPage() {
  const [logs, setLogs] = useState<ReturnType<typeof readLogs>>([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setLogs(readLogs());
  }, []);

  return (
    <div
      style={{ background: "#F3EDE3", color: "#141210" }}
      className="min-h-screen font-[Karla,system-ui,sans-serif]"
    >
      <TopBar current="summary" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: "#646059" }}
          >
            Summary
          </p>
          <h1
            className="mt-2 text-3xl leading-tight sm:text-4xl"
            style={{ fontFamily: "Fraunces, DM Serif Display, Georgia, serif" }}
          >
            Your report and history.
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#646059" }}>
            Summary notes for doctors, pain trend over time, and every report you've generated.
          </p>
        </header>

        <section>
          <PainTrendCard logs={logs} />
        </section>

        <section className="mt-8">
          <div
            className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border p-5 sm:p-6"
            style={{ background: "#FFFFFF", borderColor: "#E8DFD1" }}
          >
            <div className="min-w-0">
              <h2
                className="text-xl sm:text-2xl"
                style={{ fontFamily: "Fraunces, DM Serif Display, Georgia, serif" }}
              >
                Generate a report for your doctor
              </h2>
              <p className="mt-1 text-sm" style={{ color: "#646059" }}>
                A print-ready summary of your patterns, flare episodes and trends — ready to bring
                to your appointment.
              </p>
            </div>
            <Link
              to="/doctor-report"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ background: "#F5B8DB", color: "#141210" }}
            >
              <FileText className="h-4 w-4" />
              Generate report for doctor
            </Link>
          </div>
        </section>

        <section className="mt-8">
          <ReportPreviewCard logs={logs} onGenerated={() => setRefresh((k) => k + 1)} />
        </section>

        <section className="mt-8">
          <ReportHistoryCard refreshKey={refresh} />
        </section>
      </main>
    </div>
  );
}