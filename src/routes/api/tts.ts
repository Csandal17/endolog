import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return new Response("ElevenLabs not connected", { status: 500 });
        }

        let body: { text?: string; voiceId?: string };
        try {
          body = (await request.json()) as { text?: string; voiceId?: string };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const text = (body.text ?? "").trim();
        if (!text) return new Response("Missing text", { status: 400 });
        if (text.length > 5000) {
          return new Response("Text too long (max 5000 chars)", { status: 400 });
        }
        // Sarah — warm, natural voice; good default for read-back.
        const voiceId = body.voiceId || "EXAVITQu4vr4xnSDxMaL";

        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text,
              // Multilingual so we read back in her own language.
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
          const err = await upstream.text().catch(() => "");
          console.error(`ElevenLabs TTS failed [${upstream.status}]: ${err}`);
          return new Response(err || "TTS failed", { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});