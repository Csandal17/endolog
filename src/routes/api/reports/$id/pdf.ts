import { createFileRoute } from "@tanstack/react-router";
import type { StructuredReport } from "@/services/api";

export const Route = createFileRoute("/api/reports/$id/pdf")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getServerSupabase } = await import("@/lib/supabase-server");
        const supabase = getServerSupabase();
        const { data, error } = await supabase
          .from("reports")
          .select("id, structured_data, created_at")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) return new Response("Report not found", { status: 404 });
        const structured = data.structured_data as unknown as StructuredReport | null;
        if (!structured) {
          return new Response("Report is not ready", { status: 409 });
        }

        const { renderReportPdf } = await import("@/lib/pdf-report.server");
        const pdfBytes = renderReportPdf(structured);
        const filename = `maai-report-${data.id}.pdf`;
        return new Response(pdfBytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "private, max-age=0, must-revalidate",
          },
        });
      },
    },
  },
});