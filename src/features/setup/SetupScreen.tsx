import { Brand } from "../../components/Brand";
import type { Translation } from "../../lib/i18n";

export function SetupScreen({ t }: { t: Translation }) {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <div className="brand-lockup">
          <Brand symbol />
          <div>
            <p className="eyebrow">{t.shell.productName}</p>
            <h1>Environment setup required</h1>
          </div>
        </div>
        <p>
          Add your Supabase project URL and anon key to <code>.env.local</code>, then restart the dev server.
        </p>
        <pre>{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key`}</pre>
      </section>
    </main>
  );
}
