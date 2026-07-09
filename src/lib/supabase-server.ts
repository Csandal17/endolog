// Server-only Supabase client for the mock backend routes. Requires a
// Supabase user access token on every request so RLS enforces per-user
// ownership of patients/reports.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AuthedSupabase = { supabase: SupabaseClient; userId: string };

function newClient(url: string, key: string, accessToken: string): SupabaseClient {
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export async function requireUserSupabase(request: Request): Promise<AuthedSupabase> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw jsonError("Server misconfigured: missing Supabase credentials", 500);
  }
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) throw jsonError("Sign in required", 401);

  const supabase = newClient(url, key, token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw jsonError("Invalid or expired session", 401);
  return { supabase, userId: data.user.id };
}

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}