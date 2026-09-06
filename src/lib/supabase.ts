import { createClient } from "@supabase/supabase-js";
import { appEnv, isSupabaseConfigured } from "./env";

// Codespaces browsers reach the local database through the development server.
const supabaseUrl = import.meta.env.DEV && import.meta.env.VITE_DEPLOY_ENV === "local" && import.meta.env.VITE_VET_LOCAL_PROXY === "true"
  ? `${window.location.origin}/__local-supabase`
  : appEnv.supabaseUrl;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, appEnv.supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  return supabase;
}
