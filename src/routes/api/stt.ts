import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return new Response("ElevenLabs not connected", { status: 500 });
        }

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
          return new Response("Expected multipart/form-data", { status: 400 });
        }

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return new Response("Missing audio file", { status: 400 });
        }
        // 25 MiB safety cap.
        if (file.size > 25 * 1024 * 1024) {
          return new Response("Audio file too large", { status: 413 });
        }

        const upstreamForm = new FormData();
        upstreamForm.append("file", file, file.name || "recording.webm");
        upstreamForm.append("model_id", "scribe_v2");
        // Let ElevenLabs auto-detect the language so she can speak in her own.
        upstreamForm.append("diarize", "false");
        upstreamForm.append("tag_audio_events", "false");

        const upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body: upstreamForm,
        });

        if (!upstream.ok) {
          const err = await upstream.text().catch(() => "");
          console.error(`ElevenLabs STT failed [${upstream.status}]: ${err}`);
          return new Response(err || "Transcription failed", { status: upstream.status });
        }

        const data = (await upstream.json()) as { text?: string };
        return Response.json({ text: data.text ?? "" });
      },
    },
  },
});