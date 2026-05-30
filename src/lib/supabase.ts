import { createClient } from "@supabase/supabase-js";
import { appEnv, isSupabaseConfigured } from "./env";

export const supabase = isSupabaseConfigured
  ? createClient(appEnv.supabaseUrl!, appEnv.supabaseKey!, {
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
