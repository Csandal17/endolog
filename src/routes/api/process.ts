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
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const input_text = (body.input_text ?? "").trim();
        const patient_name = (body.patient_name ?? "").trim();
        if (!input_text) return json({ error: "input_text is required" }, 400);
        if (!patient_name) return json({ error: "patient_name is required" }, 400);

        const [{ runPipeline }, { getServerSupabase }] = await Promise.all([
          import("@/lib/mock-agents.server"),
          import("@/lib/supabase-server"),
        ]);
        const supabase = getServerSupabase();

        const { data: patient, error: patientError } = await supabase
          .from("patients")
          .insert({ input_text })
          .select("id")
          .single();
        if (patientError || !patient) {
          return json({ error: patientError?.message ?? "Failed to persist patient" }, 500);
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
            return json({ error: reportError?.message ?? "Failed to persist report" }, 500);
          }

          const pdf_url = `/api/reports/${reportRow.id}/pdf`;
          await supabase.from("reports").update({ pdf_url }).eq("id", reportRow.id);

          return json({
            job_id: reportRow.id,
            status: "complete" as const,
            stages,
            report_id: reportRow.id,
          });
        } catch (err) {
          await supabase.from("reports").insert({
            patient_id: patient.id,
            status: "error",
            structured_data: null,
          });
          const message = err instanceof Error ? err.message : "Pipeline failed";
          return json({ error: message }, 500);
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