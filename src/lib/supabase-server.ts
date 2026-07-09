// Server-only Supabase client for the mock backend routes. Uses the
// publishable key; our demo tables have permissive RLS so anon reads/writes
// succeed. Swap to `supabaseAdmin` later if we tighten policies.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | undefined;

export function getServerSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY — Lovable Cloud not connected on the server.",
    );
  }
  _client = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        if (
          (key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) &&
          headers.get("Authorization") === `Bearer ${key}`
        ) {
          headers.delete("Authorization");
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
  return _client;
}