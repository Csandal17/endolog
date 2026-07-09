import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { readLogs, TopBar, PainTrendCard, ReportHistoryCard } from "./dashboard";
import { supabase } from "@/integrations/supabase/client";

type RangeKey = "7" | "30" | "90" | "all";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

export const Route = createFileRoute("/summary")({
  head: () => ({
    meta: [
      { title: "Summary · EndoHer" },
      { name: "description", content: "Your summary notes for doctors, pain trend, and generated report history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SummaryPage,
});

function SummaryPage() {
  const [logs, setLogs] = useState<ReturnType<typeof readLogs>>([]);
  const [range, setRange] = useState<RangeKey>("30");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLogs(readLogs());
  }, []);

  async function handleDeleteAll() {
    setDeleting(true);
    setMessage(null);
    try {
      try {
        window.localStorage.removeItem("maai:daily-logs:v1");
        window.localStorage.removeItem("maai:pathway");
        window.localStorage.removeItem("diagnosisProfile");
      } catch { /* ignore */ }

      await supabase.from("reports").delete().is("user_id", null);
      await supabase.from("patients").delete().is("user_id", null);

      setLogs([]);
      setRefreshKey((k) => k + 1);
      setConfirming(false);
      setMessage("All records have been deleted.");
    } catch (e) {
      setMessage("Something went wrong deleting your records. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

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
            className="rounded-3xl border p-5 sm:p-6"
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
                Choose which time period to include. The report will use only logs from that
                window.
              </p>
            </div>

            <div className="mt-5">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "#646059" }}
              >
                Time period
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {RANGE_OPTIONS.map((opt) => {
                  const selected = range === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setRange(opt.key)}
                      aria-pressed={selected}
                      className="rounded-full border px-4 py-1.5 text-sm transition"
                      style={{
                        borderColor: selected ? "#141210" : "#E8DFD1",
                        background: selected ? "#FBE9B8" : "#FFFFFF",
                        color: "#141210",
                        fontWeight: selected ? 600 : 500,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Link
                to="/doctor-report"
                search={{ range }}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
                style={{ background: "#D098E4", color: "#141210" }}
              >
                <FileText className="h-4 w-4" />
                Generate report for doctor
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <ReportHistoryCard refreshKey={refreshKey} />
        </section>

        <section className="mt-12">
          <div
            className="rounded-3xl border p-5 sm:p-6"
            style={{ background: "#FFF5F5", borderColor: "#F1C4C4" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                style={{ background: "#F8DADA" }}
                aria-hidden
              >
                <Trash2 className="h-5 w-5" style={{ color: "#B0322C" }} />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  className="text-xl sm:text-2xl"
                  style={{ fontFamily: "Fraunces, DM Serif Display, Georgia, serif", color: "#7A1F1A" }}
                >
                  Delete all records
                </h2>
                <p className="mt-1 text-sm" style={{ color: "#7A1F1A" }}>
                  Permanently remove every daily log, diagnosis profile, generated report and
                  patient entry stored for your account. This cannot be undone.
                </p>

                {message && (
                  <p className="mt-3 text-sm" style={{ color: "#7A1F1A" }}>
                    {message}
                  </p>
                )}

                {!confirming ? (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => { setMessage(null); setConfirming(true); }}
                      className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97]"
                      style={{ background: "#B0322C" }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete all records
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDeleteAll}
                      disabled={deleting}
                      className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-60"
                      style={{ background: "#B0322C" }}
                    >
                      <Trash2 className="h-4 w-4" />
                      {deleting ? "Deleting…" : "Yes, delete everything"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={deleting}
                      className="rounded-full border px-5 py-2.5 text-sm font-semibold"
                      style={{ borderColor: "#E8DFD1", background: "#FFFFFF", color: "#141210" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}