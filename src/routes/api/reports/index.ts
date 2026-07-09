import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/reports/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
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
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(data ?? []), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});