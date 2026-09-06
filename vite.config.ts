import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function projectRefFromSupabaseUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1] ?? "";
  } catch {
    return "";
  }
}

function validateOnlineEnvironment(env: Record<string, string>) {
  const deployEnvironment = env.VITE_DEPLOY_ENV?.trim().toLowerCase();
  const vercelEnvironment = env.VERCEL_ENV?.trim().toLowerCase();
  const isVercelDeployment = ["preview", "production"].includes(vercelEnvironment);

  if (isVercelDeployment && !deployEnvironment) {
    throw new Error("VITE_DEPLOY_ENV is required for Vercel preview and production deployments.");
  }

  if (!deployEnvironment) {
    return;
  }

  const onlineEnvironments = ["development", "dev", "staging", "preview", "production", "prod"];
  if (!onlineEnvironments.includes(deployEnvironment)) {
    return;
  }

  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const supabaseKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
  const currentProjectRef = env.VITE_SUPABASE_PROJECT_REF?.trim();
  const productionProjectRef = env.VITE_PRODUCTION_SUPABASE_PROJECT_REF?.trim();

  if (!supabaseUrl || !supabaseKey || !currentProjectRef || !productionProjectRef) {
    throw new Error("Online deployments require Supabase URL, public key, current project ref and production project ref.");
  }

  if (projectRefFromSupabaseUrl(supabaseUrl) !== currentProjectRef) {
    throw new Error("VITE_SUPABASE_URL does not match VITE_SUPABASE_PROJECT_REF.");
  }

  const isProduction = ["production", "prod"].includes(deployEnvironment);
  if (isProduction && currentProjectRef !== productionProjectRef) {
    throw new Error("Production deployment is not connected to the production Supabase project.");
  }

  if (!isProduction && currentProjectRef === productionProjectRef) {
    throw new Error("Non-production deployment cannot use the production Supabase project.");
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, ".", ""), ...process.env };
  validateOnlineEnvironment(env as Record<string, string>);
  const localProxy = env.VITE_DEPLOY_ENV === "local" && env.VITE_VET_LOCAL_PROXY === "true";
  if (localProxy && !/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(env.VITE_SUPABASE_URL ?? "")) {
    throw new Error("The pilot development proxy requires Supabase local on port 54321.");
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      allowedHosts: localProxy && env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
        ? [`${env.CODESPACE_NAME}-5173.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`]
        : [],
      proxy: localProxy ? {
        "/__local-supabase": {
          target: "http://127.0.0.1:54321",
          changeOrigin: true,
          ws: true,
          rewrite: (path: string) => path.replace(/^\/__local-supabase/, ""),
        },
        "/__local-vet": {
          target: "http://127.0.0.1:54330",
          rewrite: (path: string) => path.replace(/^\/__local-vet/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              // Preserve origin checks: only translate same-origin browser requests.
              if (req.headers.origin && new URL(req.headers.origin).host === req.headers.host) {
                proxyReq.setHeader("Origin", "http://127.0.0.1:5173");
              }
            });
          },
        },
      } : undefined,
    },
  };
});
