export const appEnv = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseKey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as
    | string
    | undefined,
};

export const isSupabaseConfigured = Boolean(appEnv.supabaseUrl && appEnv.supabaseKey);
