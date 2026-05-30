import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Building2,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { isSupabaseConfigured } from "./lib/env";
import { supabase } from "./lib/supabase";
import {
  createOrganization,
  createShow,
  loadAppContext,
  slugify,
  type AppContext,
} from "./services/supabaseServices";
import type { Organization, Show } from "./types/domain";

type ViewKey = "overview" | "shows" | "billing" | "settings";

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

const navigation: Array<{ key: ViewKey; label: string; icon: typeof Building2 }> = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "shows", label: "Shows", icon: CalendarDays },
  { key: "billing", label: "Billing", icon: CircleDollarSign },
  { key: "settings", label: "Settings", icon: ShieldCheck },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<AppContext | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setContext(null);
      setSelectedOrganizationId("");
      return;
    }

    void refreshContext(session);
  }, [session]);

  useEffect(() => {
    if (!context?.organizations.length) {
      return;
    }

    if (!selectedOrganizationId || !context.organizations.some((organization) => organization.id === selectedOrganizationId)) {
      setSelectedOrganizationId(context.organizations[0].id);
    }
  }, [context, selectedOrganizationId]);

  async function refreshContext(activeSession = session) {
    if (!activeSession?.user) {
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const nextContext = await loadAppContext(activeSession.user);
      setContext(nextContext);
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setContext(null);
    setSession(null);
  }

  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }

  if (loading && !context && !session) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <AuthScreen onNotice={setNotice} notice={notice} />;
  }

  return (
    <Dashboard
      activeView={activeView}
      context={context}
      loading={loading}
      notice={notice}
      selectedOrganizationId={selectedOrganizationId}
      onChangeOrganization={setSelectedOrganizationId}
      onCreateOrganization={async (input) => {
        if (!context?.profile) {
          return;
        }

        await createOrganization(context.profile.id, input);
        setNotice({ tone: "success", message: "Organization created." });
        await refreshContext();
      }}
      onCreateShow={async (input) => {
        await createShow(input);
        setNotice({ tone: "success", message: "Show created." });
        await refreshContext();
      }}
      onRefresh={() => refreshContext()}
      onSignOut={handleSignOut}
      onViewChange={setActiveView}
    />
  );
}

function SetupScreen() {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ClipboardList size={26} />
          </div>
          <div>
            <p className="eyebrow">Horse Show Platform</p>
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

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <RefreshCw className="spin" size={24} />
      <span>Loading Horse Show Platform</span>
    </main>
  );
}

function AuthScreen({ notice, onNotice }: { notice: Notice | null; onNotice: (notice: Notice | null) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ClipboardList size={26} />
          </div>
          <div>
            <p className="eyebrow">Horse Show Platform</p>
            <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
          </div>
        </div>

        <div className="segmented-control" aria-label="Authentication mode">
          <button className={mode === "signin" ? "active" : ""} type="button" onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>

        {notice ? <NoticeBanner notice={notice} /> : null}

        <form className="stack" onSubmit={handleSubmit}>
          <label>
            Email
            <input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
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
            {busy ? "Working" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({
  activeView,
  context,
  loading,
  notice,
  selectedOrganizationId,
  onChangeOrganization,
  onCreateOrganization,
  onCreateShow,
  onRefresh,
  onSignOut,
  onViewChange,
}: {
  activeView: ViewKey;
  context: AppContext | null;
  loading: boolean;
  notice: Notice | null;
  selectedOrganizationId: string;
  onChangeOrganization: (organizationId: string) => void;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<void>;
  onRefresh: () => void;
  onSignOut: () => void;
  onViewChange: (view: ViewKey) => void;
}) {
  const organizations = context?.organizations ?? [];
  const shows = context?.shows ?? [];
  const invoices = context?.invoices ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) ?? organizations[0] ?? null;
  const selectedOrganizationShows = selectedOrganization
    ? shows.filter((show) => show.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationInvoices = selectedOrganization
    ? invoices.filter((invoice) => invoice.organization_id === selectedOrganization.id)
    : [];
  const openShows = selectedOrganizationShows.filter((show) => show.status === "open").length;
  const unpaidBalance = selectedOrganizationInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup compact">
          <div className="brand-mark">
            <ClipboardList size={22} />
          </div>
          <div>
            <strong>Horse Show</strong>
            <span>Platform</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button className={activeView === item.key ? "active" : ""} key={item.key} type="button" onClick={() => onViewChange(item.key)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <button className="ghost-button sidebar-action" type="button" onClick={onSignOut}>
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">MVP Operations</p>
            <h1>{selectedOrganization?.name ?? "Horse Show Platform"}</h1>
          </div>
          <div className="header-actions">
            <select value={selectedOrganization?.id ?? ""} onChange={(event) => onChangeOrganization(event.target.value)}>
              {organizations.length ? (
                organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))
              ) : (
                <option value="">No organization</option>
              )}
            </select>
            <button className="icon-button" title="Refresh" type="button" onClick={onRefresh}>
              <RefreshCw className={loading ? "spin" : ""} size={18} />
            </button>
          </div>
        </header>

        {notice ? <NoticeBanner notice={notice} /> : null}

        {activeView === "overview" ? (
          <OverviewView
            openShows={openShows}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            unpaidBalance={unpaidBalance}
            onCreateOrganization={onCreateOrganization}
          />
        ) : null}

        {activeView === "shows" ? (
          <ShowsView organization={selectedOrganization} shows={selectedOrganizationShows} onCreateShow={onCreateShow} />
        ) : null}

        {activeView === "billing" ? (
          <BillingView currency={selectedOrganization?.currency ?? "CAD"} invoices={selectedOrganizationInvoices} unpaidBalance={unpaidBalance} />
        ) : null}

        {activeView === "settings" ? <SettingsView context={context} organization={selectedOrganization} /> : null}
      </section>
    </main>
  );
}

function OverviewView({
  openShows,
  organization,
  shows,
  unpaidBalance,
  onCreateOrganization,
}: {
  openShows: number;
  organization: Organization | null;
  shows: Show[];
  unpaidBalance: number;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
}) {
  const upcomingShow = useMemo(
    () => shows.filter((show) => show.status !== "archived").sort((a, b) => a.start_date.localeCompare(b.start_date))[0],
    [shows],
  );

  return (
    <div className="content-grid">
      <section className="metric-grid">
        <Metric label="Open shows" value={String(openShows)} />
        <Metric label="Upcoming shows" value={String(shows.filter((show) => show.status !== "archived").length)} />
        <Metric label="Balance due" value={formatCurrency(unpaidBalance, organization?.currency ?? "CAD")} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Operations board</h2>
            <p>{upcomingShow ? `${upcomingShow.name} starts ${formatDate(upcomingShow.start_date)}.` : "No show scheduled yet."}</p>
          </div>
        </div>
        <div className="workflow-strip">
          <WorkflowStep icon={Building2} label="Organization" state={organization ? "Ready" : "Needed"} />
          <WorkflowStep icon={CalendarDays} label="Shows" state={shows.length ? "Ready" : "Next"} />
          <WorkflowStep icon={ClipboardList} label="Entries" state="Schema ready" />
          <WorkflowStep icon={CircleDollarSign} label="Invoices" state="Schema ready" />
        </div>
      </section>

      <OrganizationForm onCreateOrganization={onCreateOrganization} />
    </div>
  );
}

function ShowsView({
  organization,
  shows,
  onCreateShow,
}: {
  organization: Organization | null;
  shows: Show[];
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<void>;
}) {
  return (
    <div className="content-grid">
      <ShowForm organization={organization} onCreateShow={onCreateShow} />

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Shows</h2>
            <p>{shows.length ? `${shows.length} show${shows.length === 1 ? "" : "s"} in this organization.` : "No shows yet."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Name</span>
            <span>Dates</span>
            <span>Status</span>
            <span>Location</span>
          </div>
          {shows.map((show) => (
            <div className="table-row" key={show.id}>
              <strong>{show.name}</strong>
              <span>
                {formatDate(show.start_date)} - {formatDate(show.end_date)}
              </span>
              <span className={`badge ${show.status}`}>{show.status}</span>
              <span>{show.location || "Unassigned"}</span>
            </div>
          ))}
          {!shows.length ? <EmptyState label="Create the first show for this organization." /> : null}
        </div>
      </section>
    </div>
  );
}

function BillingView({ currency, invoices, unpaidBalance }: { currency: string; invoices: AppContext["invoices"]; unpaidBalance: number }) {
  return (
    <div className="content-grid">
      <section className="metric-grid span-2">
        <Metric label="Invoices" value={String(invoices.length)} />
        <Metric label="Open balance" value={formatCurrency(unpaidBalance, currency)} />
        <Metric label="Paid invoices" value={String(invoices.filter((invoice) => invoice.status === "paid").length)} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Recent invoices</h2>
            <p>Draft, sent, partial and paid invoice records.</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Invoice</span>
            <span>Status</span>
            <span>Total</span>
            <span>Balance</span>
          </div>
          {invoices.map((invoice) => (
            <div className="table-row" key={invoice.id}>
              <strong>{invoice.invoice_number}</strong>
              <span className={`badge ${invoice.status}`}>{invoice.status.replace("_", " ")}</span>
              <span>{formatCurrency(invoice.total_amount, currency)}</span>
              <span>{formatCurrency(invoice.balance_due, currency)}</span>
            </div>
          ))}
          {!invoices.length ? <EmptyState label="Invoice records will appear after checkout or manual billing." /> : null}
        </div>
      </section>
    </div>
  );
}

function SettingsView({ context, organization }: { context: AppContext | null; organization: Organization | null }) {
  return (
    <div className="content-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Profile</h2>
            <p>{context?.profile ? `${context.profile.first_name ?? ""} ${context.profile.last_name ?? ""}`.trim() || "Signed in user" : "Loading"}</p>
          </div>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Role type</dt>
            <dd>{context?.profile.type_user ?? "Unset"}</dd>
          </div>
          <div>
            <dt>Profile ID</dt>
            <dd>{context?.profile.id ?? "Pending"}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Organization</h2>
            <p>{organization?.slug ?? "No organization selected"}</p>
          </div>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Currency</dt>
            <dd>{organization?.currency ?? "CAD"}</dd>
          </div>
          <div>
            <dt>Tax rate</dt>
            <dd>{organization ? `${organization.tax_rate}%` : "0%"}</dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>{organization?.subscription_plan ?? "free"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function OrganizationForm({ onCreateOrganization }: { onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void> }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onCreateOrganization({
        name,
        slug: slug || slugify(name),
        primary_contact_email: email,
        timezone: "America/Toronto",
        currency: "CAD",
      });
      setName("");
      setSlug("");
      setEmail("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New organization</h2>
          <p>Tenant root for shows, contacts, entries and billing.</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Slug
          <input placeholder={slugify(name) || "spring-circuit"} value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <label>
          Contact email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          <Plus size={18} />
          Create organization
        </button>
      </form>
    </section>
  );
}

function ShowForm({
  organization,
  onCreateShow,
}: {
  organization: Organization | null;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      await onCreateShow({
        organization_id: organization.id,
        name,
        slug: slug || slugify(name),
        start_date: startDate,
        end_date: endDate,
        location,
        status: "draft",
      });
      setName("");
      setSlug("");
      setLocation("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New show</h2>
          <p>{organization ? organization.name : "Create an organization first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Name
          <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Slug
          <input disabled={!organization} placeholder={slugify(name) || "spring-classic"} value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Start
            <input disabled={!organization} required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            End
            <input disabled={!organization} required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <label>
          Location
          <input disabled={!organization} value={location} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization} type="submit">
          <Plus size={18} />
          Create show
        </button>
      </form>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function WorkflowStep({ icon: Icon, label, state }: { icon: typeof Building2; label: string; state: string }) {
  return (
    <div className="workflow-step">
      <Icon size={20} />
      <div>
        <strong>{label}</strong>
        <span>{state}</span>
      </div>
    </div>
  );
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return <div className={`notice ${notice.tone}`}>{notice.message}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(Number(value || 0));
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error.";
}
