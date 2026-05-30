import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Building2,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Globe2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  UserRound,
} from "lucide-react";
import { isSupabaseConfigured } from "./lib/env";
import { getInitialLocale, saveLocale, translations } from "./lib/i18n";
import type { Locale, Translation } from "./lib/i18n";
import { supabase } from "./lib/supabase";
import {
  createClass,
  createContact,
  createDivision,
  createEntry,
  createHorse,
  createOrganization,
  createShow,
  loadAppContext,
  slugify,
  type AppContext,
} from "./services/supabaseServices";
import type { ClassRecord, Contact, Division, Entry, Horse, Organization, Show } from "./types/domain";

type ViewKey =
  | "overview"
  | "shows"
  | "people"
  | "classes"
  | "entries"
  | "billing"
  | "settings"
  | "my-horses"
  | "my-riders"
  | "my-entries"
  | "my-invoices";

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

type NavItem = {
  icon: typeof Building2;
  key: ViewKey;
  labelKey: keyof Translation["nav"];
};

const associationNavigation: NavItem[] = [
  { key: "overview", labelKey: "overview", icon: Building2 },
  { key: "shows", labelKey: "shows", icon: CalendarDays },
  { key: "people", labelKey: "people", icon: Users },
  { key: "classes", labelKey: "classes", icon: BookOpen },
  { key: "entries", labelKey: "entries", icon: ClipboardList },
  { key: "billing", labelKey: "billing", icon: CircleDollarSign },
  { key: "settings", labelKey: "settings", icon: ShieldCheck },
];

const personalNavigation: NavItem[] = [
  { key: "my-horses", labelKey: "myHorses", icon: ClipboardList },
  { key: "my-riders", labelKey: "myRiders", icon: Users },
  { key: "my-entries", labelKey: "myEntries", icon: CalendarDays },
  { key: "my-invoices", labelKey: "myInvoices", icon: CircleDollarSign },
];

const associationViewKeys = new Set<ViewKey>(associationNavigation.map((item) => item.key));

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<AppContext | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState<Notice | null>(null);
  const t = translations[locale];

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    saveLocale(nextLocale);
  }

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
    return <SetupScreen t={t} />;
  }

  if (loading && !context && !session) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <AuthScreen locale={locale} t={t} onLocaleChange={handleLocaleChange} onNotice={setNotice} notice={notice} />;
  }

  return (
    <Dashboard
      activeView={activeView}
      context={context}
      loading={loading}
      locale={locale}
      notice={notice}
      selectedOrganizationId={selectedOrganizationId}
      t={t}
      onChangeOrganization={setSelectedOrganizationId}
      onLocaleChange={handleLocaleChange}
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
      onCreateContact={async (input) => {
        await createContact(input);
        setNotice({ tone: "success", message: "Contact created." });
        await refreshContext();
      }}
      onCreateHorse={async (input) => {
        await createHorse(input);
        setNotice({ tone: "success", message: "Horse created." });
        await refreshContext();
      }}
      onCreateClass={async (input) => {
        await createClass(input);
        setNotice({ tone: "success", message: "Class created." });
        await refreshContext();
      }}
      onCreateDivision={async (input) => {
        await createDivision(input);
        setNotice({ tone: "success", message: "Division created." });
        await refreshContext();
      }}
      onCreateEntry={async (input) => {
        await createEntry(input);
        setNotice({ tone: "success", message: "Entry draft created." });
        await refreshContext();
      }}
      onRefresh={() => refreshContext()}
      onSignOut={handleSignOut}
      onViewChange={setActiveView}
    />
  );
}

function SetupScreen({ t }: { t: Translation }) {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ClipboardList size={26} />
          </div>
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

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <RefreshCw className="spin" size={24} />
      <span>Loading Horse Show Platform</span>
    </main>
  );
}

function AuthScreen({
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
      </section>
    </main>
  );
}

function Dashboard({
  activeView,
  context,
  loading,
  locale,
  notice,
  selectedOrganizationId,
  t,
  onChangeOrganization,
  onCreateClass,
  onCreateContact,
  onCreateDivision,
  onCreateEntry,
  onCreateHorse,
  onCreateOrganization,
  onCreateShow,
  onLocaleChange,
  onRefresh,
  onSignOut,
  onViewChange,
}: {
  activeView: ViewKey;
  context: AppContext | null;
  loading: boolean;
  locale: Locale;
  notice: Notice | null;
  selectedOrganizationId: string;
  t: Translation;
  onChangeOrganization: (organizationId: string) => void;
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<void>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
  onCreateShow: (input: Parameters<typeof createShow>[0]) => Promise<void>;
  onLocaleChange: (locale: Locale) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onViewChange: (view: ViewKey) => void;
}) {
  const organizations = context?.organizations ?? [];
  const organizationMembers = context?.organizationMembers ?? [];
  const shows = context?.shows ?? [];
  const contacts = context?.contacts ?? [];
  const horses = context?.horses ?? [];
  const classes = context?.classes ?? [];
  const divisions = context?.divisions ?? [];
  const entries = context?.entries ?? [];
  const invoices = context?.invoices ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) ?? organizations[0] ?? null;
  const selectedMembership = selectedOrganization
    ? organizationMembers.find((member) => member.organization_id === selectedOrganization.id && member.user_id === context?.profile.id)
    : null;
  const canManageAssociation = selectedMembership?.role === "admin" || selectedMembership?.role === "secretary";
  const effectiveView = canManageAssociation || !associationViewKeys.has(activeView) ? activeView : "my-horses";
  const selectedOrganizationShows = selectedOrganization
    ? shows.filter((show) => show.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationInvoices = selectedOrganization
    ? invoices.filter((invoice) => invoice.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationContacts = selectedOrganization
    ? contacts.filter((contact) => contact.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationHorses = selectedOrganization
    ? horses.filter((horse) => horse.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationClasses = selectedOrganization
    ? classes.filter((classRecord) => classRecord.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationDivisions = selectedOrganization
    ? divisions.filter((division) => division.organization_id === selectedOrganization.id)
    : [];
  const selectedOrganizationEntries = selectedOrganization
    ? entries.filter((entry) => entry.organization_id === selectedOrganization.id)
    : [];
  const personalContacts = selectedOrganizationContacts.filter((contact) => contact.linked_user_id === context?.profile.id);
  const personalContactIds = new Set(personalContacts.map((contact) => contact.id));
  const personalHorses = selectedOrganizationHorses.filter((horse) => personalContactIds.has(horse.primary_owner_contact_id));
  const personalHorseIds = new Set(personalHorses.map((horse) => horse.id));
  const personalEntries = selectedOrganizationEntries.filter(
    (entry) =>
      personalHorseIds.has(entry.horse_id) ||
      personalContactIds.has(entry.owner_contact_id) ||
      personalContactIds.has(entry.payer_contact_id) ||
      (entry.rider_contact_id ? personalContactIds.has(entry.rider_contact_id) : false),
  );
  const personalInvoices = selectedOrganizationInvoices.filter((invoice) => personalContactIds.has(invoice.payer_contact_id));
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
          {canManageAssociation ? (
            <NavigationSection activeView={effectiveView} items={associationNavigation} label={t.nav.association} t={t} onViewChange={onViewChange} />
          ) : null}
          <NavigationSection activeView={effectiveView} items={personalNavigation} label={t.nav.mySpace} t={t} onViewChange={onViewChange} />
        </nav>

        <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />

        <button className="ghost-button sidebar-action" type="button" onClick={onSignOut}>
          <LogOut size={18} />
          {t.common.signOut}
        </button>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{t.shell.workspace}</p>
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
                <option value="">{t.common.noOrganization}</option>
              )}
            </select>
            <button className="icon-button" title={t.common.refresh} type="button" onClick={onRefresh}>
              <RefreshCw className={loading ? "spin" : ""} size={18} />
            </button>
          </div>
        </header>

        {notice ? <NoticeBanner notice={notice} /> : null}

        {effectiveView === "overview" ? (
          <OverviewView
            openShows={openShows}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            contacts={selectedOrganizationContacts}
            horses={selectedOrganizationHorses}
            entries={selectedOrganizationEntries}
            unpaidBalance={unpaidBalance}
            onCreateOrganization={onCreateOrganization}
          />
        ) : null}

        {effectiveView === "shows" ? (
          <ShowsView organization={selectedOrganization} shows={selectedOrganizationShows} onCreateShow={onCreateShow} />
        ) : null}

        {effectiveView === "people" ? (
          <PeopleView
            contacts={selectedOrganizationContacts}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
          />
        ) : null}

        {effectiveView === "classes" ? (
          <ClassesView
            classes={selectedOrganizationClasses}
            divisions={selectedOrganizationDivisions}
            organization={selectedOrganization}
            shows={selectedOrganizationShows}
            onCreateClass={onCreateClass}
            onCreateDivision={onCreateDivision}
          />
        ) : null}

        {effectiveView === "entries" ? (
          <EntriesView
            classes={selectedOrganizationClasses}
            contacts={selectedOrganizationContacts}
            divisions={selectedOrganizationDivisions}
            entries={selectedOrganizationEntries}
            horses={selectedOrganizationHorses}
            organization={selectedOrganization}
            profileId={context?.profile.id ?? ""}
            shows={selectedOrganizationShows}
            onCreateEntry={onCreateEntry}
          />
        ) : null}

        {effectiveView === "billing" ? (
          <BillingView currency={selectedOrganization?.currency ?? "CAD"} invoices={selectedOrganizationInvoices} unpaidBalance={unpaidBalance} />
        ) : null}

        {effectiveView === "my-horses" ? <MyHorsesView contacts={selectedOrganizationContacts} horses={personalHorses} /> : null}

        {effectiveView === "my-riders" ? <MyContactsView contacts={personalContacts} /> : null}

        {effectiveView === "my-entries" ? (
          <MyEntriesView classes={selectedOrganizationClasses} contacts={selectedOrganizationContacts} divisions={selectedOrganizationDivisions} entries={personalEntries} horses={selectedOrganizationHorses} />
        ) : null}

        {effectiveView === "my-invoices" ? (
          <BillingView currency={selectedOrganization?.currency ?? "CAD"} invoices={personalInvoices} unpaidBalance={personalInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0)} />
        ) : null}

        {effectiveView === "settings" ? <SettingsView context={context} organization={selectedOrganization} /> : null}
      </section>
    </main>
  );
}

function NavigationSection({
  activeView,
  items,
  label,
  t,
  onViewChange,
}: {
  activeView: ViewKey;
  items: NavItem[];
  label: string;
  t: Translation;
  onViewChange: (view: ViewKey) => void;
}) {
  return (
    <div className="nav-section">
      <span>{label}</span>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button className={activeView === item.key ? "active" : ""} key={item.key} type="button" onClick={() => onViewChange(item.key)}>
            <Icon size={18} />
            {t.nav[item.labelKey]}
          </button>
        );
      })}
    </div>
  );
}

function LanguageToggle({ locale, onLocaleChange }: { locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  return (
    <div className="language-toggle" aria-label="Language">
      <Globe2 size={16} />
      <button className={locale === "fr" ? "active" : ""} type="button" onClick={() => onLocaleChange("fr")}>
        FR
      </button>
      <button className={locale === "en" ? "active" : ""} type="button" onClick={() => onLocaleChange("en")}>
        EN
      </button>
    </div>
  );
}

function OverviewView({
  openShows,
  organization,
  shows,
  contacts,
  horses,
  entries,
  unpaidBalance,
  onCreateOrganization,
}: {
  openShows: number;
  organization: Organization | null;
  shows: Show[];
  contacts: Contact[];
  horses: Horse[];
  entries: Entry[];
  unpaidBalance: number;
  onCreateOrganization: (input: Parameters<typeof createOrganization>[1]) => Promise<void>;
}) {
  const upcomingShow = useMemo(
    () => shows.filter((show) => show.status !== "archived").sort((a, b) => a.start_date.localeCompare(b.start_date))[0],
    [shows],
  );

  return (
    <div className="content-grid">
      <section className="metric-grid span-2">
        <Metric label="Open shows" value={String(openShows)} />
        <Metric label="Contacts" value={String(contacts.length)} />
        <Metric label="Horses" value={String(horses.length)} />
        <Metric label="Draft entries" value={String(entries.filter((entry) => entry.status === "draft").length)} />
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

function PeopleView({
  contacts,
  horses,
  organization,
  onCreateContact,
  onCreateHorse,
}: {
  contacts: Contact[];
  horses: Horse[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
}) {
  return (
    <div className="content-grid">
      <ContactForm organization={organization} onCreateContact={onCreateContact} />
      <HorseForm contacts={contacts} organization={organization} onCreateHorse={onCreateHorse} />

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Contacts</h2>
            <p>{contacts.length ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"} ready for entries.` : "Owners, agents, riders and payers."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Name</span>
            <span>Type</span>
            <span>Email</span>
            <span>Barn</span>
          </div>
          {contacts.map((contact) => (
            <div className="table-row" key={contact.id}>
              <strong>{contactLabel(contact)}</strong>
              <span className="badge">{contact.type}</span>
              <span>{contact.email || "No email"}</span>
              <span>{contact.barn_name || "None"}</span>
            </div>
          ))}
          {!contacts.length ? <EmptyState label="Create an owner or rider contact first." /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Horses</h2>
            <p>{horses.length ? `${horses.length} horse${horses.length === 1 ? "" : "s"} in the organization.` : "Horses connect owners to entries."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Name</span>
            <span>Owner</span>
            <span>Gender</span>
            <span>Registration</span>
          </div>
          {horses.map((horse) => (
            <div className="table-row" key={horse.id}>
              <strong>{horse.name}</strong>
              <span>{contactLabel(findById(contacts, horse.primary_owner_contact_id))}</span>
              <span>{horse.gender || "Unset"}</span>
              <span>{horse.registration_number || "None"}</span>
            </div>
          ))}
          {!horses.length ? <EmptyState label="Create a horse after adding an owner contact." /> : null}
        </div>
      </section>
    </div>
  );
}

function ClassesView({
  classes,
  divisions,
  organization,
  shows,
  onCreateClass,
  onCreateDivision,
}: {
  classes: ClassRecord[];
  divisions: Division[];
  organization: Organization | null;
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
}) {
  return (
    <div className="content-grid">
      <ClassForm organization={organization} shows={shows} onCreateClass={onCreateClass} />
      <DivisionForm classes={classes} organization={organization} shows={shows} onCreateDivision={onCreateDivision} />

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Class book</h2>
            <p>{classes.length ? `${classes.length} class${classes.length === 1 ? "" : "es"} configured.` : "Classes and divisions define what people can enter."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Class</span>
            <span>Show</span>
            <span>Fee</span>
            <span>Divisions</span>
          </div>
          {classes.map((classRecord) => {
            const classDivisions = divisions.filter((division) => division.class_id === classRecord.id);
            return (
              <div className="table-row" key={classRecord.id}>
                <strong>{classRecord.name}</strong>
                <span>{showLabel(findById(shows, classRecord.show_id))}</span>
                <span>{classRecord.entry_fee == null ? "No fee" : formatCurrency(classRecord.entry_fee, organization?.currency ?? "CAD")}</span>
                <span>{classDivisions.length ? classDivisions.map((division) => division.name).join(", ") : "None"}</span>
              </div>
            );
          })}
          {!classes.length ? <EmptyState label="Create the first class for a show." /> : null}
        </div>
      </section>
    </div>
  );
}

function EntriesView({
  classes,
  contacts,
  divisions,
  entries,
  horses,
  organization,
  profileId,
  shows,
  onCreateEntry,
}: {
  classes: ClassRecord[];
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
}) {
  return (
    <div className="content-grid">
      <EntryForm
        classes={classes}
        contacts={contacts}
        divisions={divisions}
        horses={horses}
        organization={organization}
        profileId={profileId}
        shows={shows}
        onCreateEntry={onCreateEntry}
      />

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Entries</h2>
            <p>{entries.length ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"} created.` : "Draft entries appear here before checkout."}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Horse</span>
            <span>Division</span>
            <span>Owner</span>
            <span>Status</span>
          </div>
          {entries.map((entry) => (
            <div className="table-row" key={entry.id}>
              <strong>{horseLabel(findById(horses, entry.horse_id))}</strong>
              <span>{divisionLabel(findById(divisions, entry.division_id), classes)}</span>
              <span>{contactLabel(findById(contacts, entry.owner_contact_id))}</span>
              <span className={`badge ${entry.status}`}>{entry.status.replace("_", " ")}</span>
            </div>
          ))}
          {!entries.length ? <EmptyState label="Create a draft entry after adding contacts, horses, classes and divisions." /> : null}
        </div>
      </section>
    </div>
  );
}

function MyHorsesView({ contacts, horses }: { contacts: Contact[]; horses: Horse[] }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Mes chevaux</h2>
          <p>Chevaux liés à mon profil utilisateur.</p>
        </div>
      </div>
      <div className="table">
        <div className="table-row table-head">
          <span>Nom</span>
          <span>Owner</span>
          <span>Genre</span>
          <span>Enregistrement</span>
        </div>
        {horses.map((horse) => (
          <div className="table-row" key={horse.id}>
            <strong>{horse.name}</strong>
            <span>{contactLabel(findById(contacts, horse.primary_owner_contact_id))}</span>
            <span>{horse.gender || "Unset"}</span>
            <span>{horse.registration_number || "None"}</span>
          </div>
        ))}
        {!horses.length ? <EmptyState label="Aucun cheval lié à ton profil pour l'instant." /> : null}
      </div>
    </section>
  );
}

function MyContactsView({ contacts }: { contacts: Contact[] }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Mes cavaliers</h2>
          <p>Contacts liés à mon compte.</p>
        </div>
      </div>
      <div className="table">
        <div className="table-row table-head">
          <span>Nom</span>
          <span>Type</span>
          <span>Email</span>
          <span>Barn</span>
        </div>
        {contacts.map((contact) => (
          <div className="table-row" key={contact.id}>
            <strong>{contactLabel(contact)}</strong>
            <span className="badge">{contact.type}</span>
            <span>{contact.email || "No email"}</span>
            <span>{contact.barn_name || "None"}</span>
          </div>
        ))}
        {!contacts.length ? <EmptyState label="Aucun contact n'est encore lié à ton profil." /> : null}
      </div>
    </section>
  );
}

function MyEntriesView({
  classes,
  contacts,
  divisions,
  entries,
  horses,
}: {
  classes: ClassRecord[];
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Mes inscriptions</h2>
          <p>Inscriptions liées à mes chevaux ou contacts.</p>
        </div>
      </div>
      <div className="table">
        <div className="table-row table-head">
          <span>Cheval</span>
          <span>Division</span>
          <span>Owner</span>
          <span>Statut</span>
        </div>
        {entries.map((entry) => (
          <div className="table-row" key={entry.id}>
            <strong>{horseLabel(findById(horses, entry.horse_id))}</strong>
            <span>{divisionLabel(findById(divisions, entry.division_id), classes)}</span>
            <span>{contactLabel(findById(contacts, entry.owner_contact_id))}</span>
            <span className={`badge ${entry.status}`}>{entry.status.replace("_", " ")}</span>
          </div>
        ))}
        {!entries.length ? <EmptyState label="Aucune inscription liée à ton profil pour l'instant." /> : null}
      </div>
    </section>
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

function ContactForm({
  organization,
  onCreateContact,
}: {
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<void>;
}) {
  const [type, setType] = useState<Contact["type"]>("owner");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [barnName, setBarnName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      await onCreateContact({
        organization_id: organization.id,
        type,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        barn_name: barnName,
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setBarnName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New contact</h2>
          <p>{organization ? organization.name : "Create an organization first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Type
          <select disabled={!organization} value={type} onChange={(event) => setType(event.target.value as Contact["type"])}>
            <option value="owner">Owner</option>
            <option value="agent">Agent</option>
            <option value="rider">Rider</option>
            <option value="payer">Payer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            First name
            <input disabled={!organization} required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label>
            Last name
            <input disabled={!organization} required value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <label>
          Email
          <input disabled={!organization} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Phone
            <input disabled={!organization} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label>
            Barn
            <input disabled={!organization} value={barnName} onChange={(event) => setBarnName(event.target.value)} />
          </label>
        </div>
        <button className="primary-button" disabled={busy || !organization} type="submit">
          <Plus size={18} />
          Create contact
        </button>
      </form>
    </section>
  );
}

function HorseForm({
  contacts,
  organization,
  onCreateHorse,
}: {
  contacts: Contact[];
  organization: Organization | null;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<void>;
}) {
  const ownerContacts = contacts.filter((contact) => ["owner", "agent", "payer"].includes(contact.type));
  const [name, setName] = useState("");
  const [ownerContactId, setOwnerContactId] = useState("");
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedOwnerId = ownerContactId || ownerContacts[0]?.id || "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedOwnerId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateHorse({
        organization_id: organization.id,
        name,
        primary_owner_contact_id: selectedOwnerId,
        breed,
        gender: gender || null,
        registration_number: registrationNumber,
      });
      setName("");
      setBreed("");
      setGender("");
      setRegistrationNumber("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New horse</h2>
          <p>{ownerContacts.length ? "Connect a horse to an owner." : "Create an owner contact first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Horse name
          <input disabled={!organization || !ownerContacts.length} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Owner
          <select disabled={!organization || !ownerContacts.length} value={selectedOwnerId} onChange={(event) => setOwnerContactId(event.target.value)}>
            {ownerContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contactLabel(contact)}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Breed
            <input disabled={!organization || !ownerContacts.length} value={breed} onChange={(event) => setBreed(event.target.value)} />
          </label>
          <label>
            Gender
            <select disabled={!organization || !ownerContacts.length} value={gender} onChange={(event) => setGender(event.target.value as "" | NonNullable<Horse["gender"]>)}>
              <option value="">Unset</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="G">G</option>
            </select>
          </label>
        </div>
        <label>
          Registration
          <input disabled={!organization || !ownerContacts.length} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !ownerContacts.length} type="submit">
          <Plus size={18} />
          Create horse
        </button>
      </form>
    </section>
  );
}

function ClassForm({
  organization,
  shows,
  onCreateClass,
}: {
  organization: Organization | null;
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedShowId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateClass({
        organization_id: organization.id,
        show_id: selectedShowId,
        name,
        code,
        entry_fee: numericValue(entryFee),
      });
      setName("");
      setCode("");
      setEntryFee("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New class</h2>
          <p>{shows.length ? "Create classes for a show." : "Create a show first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Show
          <select disabled={!organization || !shows.length} value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class name
          <input disabled={!organization || !shows.length} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input disabled={!organization || !shows.length} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            Entry fee
            <input disabled={!organization || !shows.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
        </div>
        <button className="primary-button" disabled={busy || !organization || !shows.length} type="submit">
          <Plus size={18} />
          Create class
        </button>
      </form>
    </section>
  );
}

function DivisionForm({
  classes,
  organization,
  shows,
  onCreateDivision,
}: {
  classes: ClassRecord[];
  organization: Organization | null;
  shows: Show[];
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
}) {
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedClass = findById(classes, classId) ?? classes[0] ?? null;
  const selectedShow = selectedClass ? findById(shows, selectedClass.show_id) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedClass) {
      return;
    }

    setBusy(true);

    try {
      await onCreateDivision({
        organization_id: organization.id,
        show_id: selectedClass.show_id,
        class_id: selectedClass.id,
        name,
        entry_fee: numericValue(entryFee),
      });
      setName("");
      setEntryFee("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New division</h2>
          <p>{selectedShow ? selectedShow.name : "Create a class first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Class
          <select disabled={!organization || !classes.length} value={selectedClass?.id ?? ""} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((classRecord) => (
              <option key={classRecord.id} value={classRecord.id}>
                {classRecord.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Division name
          <input disabled={!organization || !classes.length} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Fee override
          <input disabled={!organization || !classes.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !classes.length} type="submit">
          <Plus size={18} />
          Create division
        </button>
      </form>
    </section>
  );
}

function EntryForm({
  classes,
  contacts,
  divisions,
  horses,
  organization,
  profileId,
  shows,
  onCreateEntry,
}: {
  classes: ClassRecord[];
  contacts: Contact[];
  divisions: Division[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [horseId, setHorseId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [payerContactId, setPayerContactId] = useState("");
  const [riderContactId, setRiderContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const availableDivisions = selectedShowId ? divisions.filter((division) => division.show_id === selectedShowId) : divisions;
  const selectedHorse = findById(horses, horseId) ?? horses[0] ?? null;
  const selectedDivision = findById(availableDivisions, divisionId) ?? availableDivisions[0] ?? null;
  const selectedClass = selectedDivision ? findById(classes, selectedDivision.class_id) : null;
  const selectedPayerId = payerContactId || selectedHorse?.primary_owner_contact_id || contacts[0]?.id || "";
  const canCreate = Boolean(organization && profileId && selectedShowId && selectedHorse && selectedDivision && selectedPayerId);
  const baseFee = selectedDivision?.entry_fee ?? selectedClass?.entry_fee ?? undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !profileId || !selectedHorse || !selectedDivision || !selectedShowId || !selectedPayerId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateEntry({
        organization_id: organization.id,
        show_id: selectedShowId,
        horse_id: selectedHorse.id,
        division_id: selectedDivision.id,
        created_by_user_id: profileId,
        owner_contact_id: selectedHorse.primary_owner_contact_id,
        rider_contact_id: riderContactId || undefined,
        payer_contact_id: selectedPayerId,
        base_fee: baseFee,
      });
      setRiderContactId("");
      setPayerContactId("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>New draft entry</h2>
          <p>{canCreate ? "Draft now, checkout later." : "Add a show, horse and division first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Show
          <select disabled={!shows.length} value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Horse
          <select disabled={!horses.length} value={selectedHorse?.id ?? ""} onChange={(event) => setHorseId(event.target.value)}>
            {horses.map((horse) => (
              <option key={horse.id} value={horse.id}>
                {horse.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Division
          <select disabled={!availableDivisions.length} value={selectedDivision?.id ?? ""} onChange={(event) => setDivisionId(event.target.value)}>
            {availableDivisions.map((division) => (
              <option key={division.id} value={division.id}>
                {divisionLabel(division, classes)}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Rider
            <select disabled={!contacts.length} value={riderContactId} onChange={(event) => setRiderContactId(event.target.value)}>
              <option value="">None</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contactLabel(contact)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payer
            <select disabled={!contacts.length} value={selectedPayerId} onChange={(event) => setPayerContactId(event.target.value)}>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contactLabel(contact)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary-button" disabled={busy || !canCreate} type="submit">
          <Plus size={18} />
          Create draft entry
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

function findById<T extends { id: string }>(items: T[], id: string | null | undefined) {
  if (!id) {
    return undefined;
  }

  return items.find((item) => item.id === id);
}

function contactLabel(contact: Contact | undefined) {
  if (!contact) {
    return "Unknown contact";
  }

  return `${contact.first_name} ${contact.last_name}`.trim();
}

function horseLabel(horse: Horse | undefined) {
  return horse?.name ?? "Unknown horse";
}

function showLabel(show: Show | undefined) {
  return show?.name ?? "Unknown show";
}

function divisionLabel(division: Division | undefined, classes: ClassRecord[]) {
  if (!division) {
    return "Unknown division";
  }

  const classRecord = findById(classes, division.class_id);
  return classRecord ? `${classRecord.name} / ${division.name}` : division.name;
}

function numericValue(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
