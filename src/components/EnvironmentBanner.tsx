import { appEnv, getDeployEnvironmentLabel, supabaseConfigurationError } from "../lib/env";

export function EnvironmentBanner() {
  const label = getDeployEnvironmentLabel();

  if (!label && !supabaseConfigurationError) {
    return null;
  }

  return (
    <aside
      className={`environment-banner${supabaseConfigurationError ? " environment-banner-error" : ""}`}
      role={supabaseConfigurationError ? "alert" : "status"}
    >
      <strong>{supabaseConfigurationError ? "CONFIGURATION BLOQUÉE" : label}</strong>
      <span>
        {supabaseConfigurationError
          ? supabaseConfigurationError
          : `Environnement de test${appEnv.supabaseProjectRef ? ` · ${appEnv.supabaseProjectRef}` : ""}`}
      </span>
    </aside>
  );
}
