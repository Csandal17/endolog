// Accessibility read-back: streams a TTS rendering of a stored report.
// The PDF report includes a link to this URL when the patient opted in.
import { createFileRoute } from "@tanstack/react-router";
import type { StructuredReport } from "@/services/api";

export const Route = createFileRoute("/api/reports/$id/audio")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) return new Response("Audio read-back unavailable", { status: 503 });

        const { getServerSupabase } = await import("@/lib/supabase-server");
        const supabase = getServerSupabase();
        const { data, error } = await supabase
          .from("reports")
          .select("id, structured_data")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) return new Response("Report not found", { status: 404 });
        const report = data.structured_data as unknown as StructuredReport | null;
        if (!report) return new Response("Report not ready", { status: 409 });

        const script = buildScript(report).slice(0, 4800);

        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: script,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.55,
                similarity_boost: 0.75,
                style: 0.25,
                use_speaker_boost: true,
              },
            }),
          },
        );
        if (!upstream.ok) {
          const body = await upstream.text().catch(() => "");
          return new Response(body || "TTS failed", { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "private, max-age=0, must-revalidate",
            "Content-Disposition": `inline; filename="maai-report-${data.id}.mp3"`,
          },
        });
      },
    },
  },
});

function buildScript(r: StructuredReport): string {
  const parts: string[] = [];
  parts.push(`Read-back of clinical record for ${r.patient.name}.`);
  parts.push(r.patient_summary);
  const s = r.socrates;
  const socratesLines = [
    s.site && `Site: ${s.site}.`,
    s.onset && `Onset: ${s.onset}.`,
    s.character && `Character: ${s.character}.`,
    s.radiation && `Radiation: ${s.radiation}.`,
    s.associations && `Associations: ${s.associations}.`,
    s.time_course && `Time course: ${s.time_course}.`,
    s.exacerbating_relieving && `Exacerbating or relieving factors: ${s.exacerbating_relieving}.`,
    s.severity && `Severity: ${s.severity}.`,
  ].filter(Boolean) as string[];
  if (socratesLines.length) {
    parts.push("SOCRATES assessment.");
    parts.push(socratesLines.join(" "));
  }
  if (r.key_findings.length) parts.push(`Key findings. ${r.key_findings.join(". ")}.`);
  if (r.risk_indicators.length) parts.push(`Risk indicators. ${r.risk_indicators.join(". ")}.`);
  if (r.recommendations.length) parts.push(`Recommendations. ${r.recommendations.join(". ")}.`);
  if (r.follow_up_actions.length) parts.push(`Follow-up. ${r.follow_up_actions.join(". ")}.`);
  parts.push("End of read-back.");
  return parts.join(" \n");
}