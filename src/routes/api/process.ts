import { createFileRoute } from "@tanstack/react-router";

type Body = {
  patient_name?: string;
  dob?: string;
  sex?: string;
  clinician?: string;
  input_text?: string;
};

export const Route = createFileRoute("/api/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const fail = (step: string, error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[api/process] ${step} failed`, error);
          return json({ error: message, step }, 500);
        };

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch (error) {
          console.error("[api/process] invalid JSON body", error);
          return json({ error: "Invalid JSON body", step: "parse_request_body" }, 400);
        }

        const input_text = (body.input_text ?? "").trim();
        const patient_name = (body.patient_name ?? "").trim();
        if (!input_text) return json({ error: "input_text is required" }, 400);
        if (!patient_name) return json({ error: "patient_name is required" }, 400);

        let runPipeline: typeof import("@/lib/mock-agents.server").runPipeline;
        let getServerSupabase: typeof import("@/lib/supabase-server").getServerSupabase;
        try {
          [{ runPipeline }, { getServerSupabase }] = await Promise.all([
            import("@/lib/mock-agents.server"),
            import("@/lib/supabase-server"),
          ]);
        } catch (error) {
          return fail("load_server_modules", error);
        }

        let supabase: ReturnType<typeof getServerSupabase>;
        try {
          supabase = getServerSupabase();
        } catch (error) {
          return fail("create_database_client", error);
        }

        let patient: { id: string } | null = null;
        try {
          const result = await supabase.from("patients").insert({ input_text }).select("id").single();
          patient = result.data;
          if (result.error || !patient) {
            return json(
              { error: result.error?.message ?? "Failed to persist patient", step: "insert_patient" },
              500,
            );
          }
        } catch (error) {
          return fail("insert_patient", error);
        }

        try {
          const { stages, report } = await runPipeline({
            patient_name,
            dob: body.dob,
            sex: body.sex,
            clinician: body.clinician,
            input_text,
          });

          const { data: reportRow, error: reportError } = await supabase
            .from("reports")
            .insert({
              patient_id: patient.id,
              status: "complete",
              structured_data: report,
              pdf_url: null,
            })
            .select("id")
            .single();
          if (reportError || !reportRow) {
            return json(
              { error: reportError?.message ?? "Failed to persist report", step: "insert_report" },
              500,
            );
          }

          const pdf_url = `/api/reports/${reportRow.id}/pdf`;
          const { error: pdfUrlError } = await supabase.from("reports").update({ pdf_url }).eq("id", reportRow.id);
          if (pdfUrlError) {
            return json({ error: pdfUrlError.message, step: "update_report_pdf_url" }, 500);
          }

          return json({
            job_id: reportRow.id,
            status: "complete" as const,
            stages,
            report_id: reportRow.id,
          });
        } catch (err) {
          console.error("[api/process] pipeline failed", err);
          const { error: errorReportError } = await supabase.from("reports").insert({
            patient_id: patient.id,
            status: "error",
            structured_data: null,
          });
          if (errorReportError) console.error("[api/process] insert_error_report failed", errorReportError);
          const message = err instanceof Error ? err.message : "Pipeline failed";
          return json({ error: message, step: "run_pipeline" }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}