import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/reports/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { requireUserSupabase } = await import("@/lib/supabase-server");
        let supabase;
        try {
          ({ supabase } = await requireUserSupabase(request));
        } catch (e) {
          if (e instanceof Response) return e;
          throw e;
        }
        const { data, error } = await supabase
          .from("reports")
          .select("id, patient_id, status, structured_data, pdf_url, created_at")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Report not found" }, 404);
        return json(data);
      },
      DELETE: async ({ params, request }) => {
        const { requireUserSupabase } = await import("@/lib/supabase-server");
        let supabase;
        try {
          ({ supabase } = await requireUserSupabase(request));
        } catch (e) {
          if (e instanceof Response) return e;
          throw e;
        }
        const { error } = await supabase.from("reports").delete().eq("id", params.id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
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