import { useState } from "react";
import type { FormEvent } from "react";
import { ClipboardList, UserRound } from "lucide-react";
import type { Locale, Translation } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import { errorMessage } from "../../lib/display";
import { LanguageToggle, NoticeBanner } from "../../components/ui";
import type { Notice } from "../../types/ui";

const localLoginAccounts = [
  {
    email: "phase1.org-a-admin@example.test",
    label: "Admin association",
    password: "phase1-password",
  },
  {
    email: "phase1.org-a-secretary@example.test",
    label: "Secrétaire",
    password: "phase1-password",
  },
  {
    email: "phase1.org-a-owner@example.test",
    label: "Exposant",
    password: "phase1-password",
  },
];

function isLocalHostname() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function AuthScreen({
  locale,
  notice,
  t,
  onLocaleChange,
  onNotice,
}: {
  locale: Locale;
  notice: Notice | null;
  t: Translation;
  onLocaleChange: (locale: Locale) => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const showLocalLogin = isLocalHostname();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setBusy(true);
    onNotice(null);

    try {
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        throw result.error;
      }

      if (mode === "signup" && !result.data.session) {
        onNotice({ tone: "info", message: "Account created. Check your email if confirmation is enabled." });
      }
    } catch (error) {
      onNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleLocalSignIn(account: (typeof localLoginAccounts)[number]) {
    if (!supabase) {
      return;
    }

    setMode("signin");
    setEmail(account.email);
    setPassword(account.password);
    setBusy(true);
    onNotice(null);

    try {
      const result = await supabase.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });

      if (result.error) {
        throw result.error;
      }
    } catch (error) {
      onNotice({
        tone: "error",
        message: `${errorMessage(error)}. If this is a fresh local database, run the Supabase seed first.`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ClipboardList size={26} />
          </div>
          <div>
            <p className="eyebrow">{t.shell.productName}</p>
            <h1>{mode === "signin" ? t.auth.signIn : t.auth.createAccount}</h1>
          </div>
        </div>

        <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />

        <div className="segmented-control" aria-label="Authentication mode">
          <button className={mode === "signin" ? "active" : ""} type="button" onClick={() => setMode("signin")}>
            {t.auth.signIn}
          </button>
          <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>
            {t.auth.createAccount}
          </button>
        </div>

        {notice ? <NoticeBanner notice={notice} /> : null}

        <form className="stack" onSubmit={handleSubmit}>
          <label>
            {t.auth.email}
            <input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            {t.auth.password}
            <input
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            <UserRound size={18} />
            {busy ? t.auth.working : mode === "signin" ? t.auth.signIn : t.auth.createAccount}
          </button>
        </form>

        {showLocalLogin ? (
          <section className="local-login-panel">
            <div>
              <strong>Accès local</strong>
              <span>Comptes de test créés par le seed Supabase.</span>
            </div>
            <div className="local-login-grid">
              {localLoginAccounts.map((account) => (
                <button className="ghost-button" disabled={busy || !supabase} key={account.email} type="button" onClick={() => handleLocalSignIn(account)}>
                  {account.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
