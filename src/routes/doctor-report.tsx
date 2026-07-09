import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { readLogs, ReportPreviewCard } from "./dashboard";

export const Route = createFileRoute("/doctor-report")({
  head: () => ({
    meta: [
      { title: "Doctor report · Maai" },
      { name: "description", content: "A print-ready symptom summary prepared for clinical review." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DoctorReportPage,
});

function DoctorReportPage() {
  const [logs, setLogs] = useState<ReturnType<typeof readLogs>>([]);
  useEffect(() => {
    setLogs(readLogs());
  }, []);

  return (
    <div
      style={{ background: "#F3EDE3", color: "#141210" }}
      className="min-h-screen font-[Karla,system-ui,sans-serif]"
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          @page { size: A4; margin: 16mm 14mm; }
        }
      `}</style>

      <div className="no-print mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link
          to="/summary"
          className="inline-flex items-center gap-1 text-sm"
          style={{ color: "#646059" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to summary
        </Link>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs sm:block" style={{ color: "#646059" }}>
            Preview — use Print to save as PDF for your appointment.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold"
            style={{ background: "#F5B8DB", color: "#141210" }}
          >
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <ReportPreviewCard logs={logs} onGenerated={() => {}} />
      </main>
    </div>
  );
}