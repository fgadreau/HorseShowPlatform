import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthScreen } from "./features/auth/AuthScreen";
import { Dashboard } from "./features/dashboard/Dashboard";
import { LoadingScreen } from "./features/setup/LoadingScreen";
import { SetupScreen } from "./features/setup/SetupScreen";
import { isSupabaseConfigured } from "./lib/env";
import { errorMessage } from "./lib/display";
import { getInitialLocale, saveLocale, translations } from "./lib/i18n";
import type { Locale } from "./lib/i18n";
import { supabase } from "./lib/supabase";
import {
  createClass,
  createClassTemplate,
  createClassTemplateDivision,
  createContact,
  createDivision,
  createEntry,
  createHorse,
  createOrganization,
  createShow,
  createStallBooking,
  createStallOption,
  deleteEntry,
  deleteHorse,
  deleteStallBooking,
  loadAppContext,
  prepareShowScoreClassSetup,
  setOrganizationExternalMembershipRequirement,
  updateClass,
  updateClassTemplate,
  updateClassTemplateDivision,
  updateContact,
  updateDivision,
  updateEntry,
  updateHorse,
  updateShow,
  updateStallBooking,
  updateStallOption,
  type AppContext,
} from "./services/supabaseServices";
import type { Notice, ViewKey } from "./types/ui";

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
        const show = await createShow(input);
        setNotice({ tone: "success", message: "Show created." });
        await refreshContext();
        return show;
      }}
      onUpdateShow={async (id, input) => {
        await updateShow(id, input);
        setNotice({ tone: "success", message: "Show updated." });
        await refreshContext();
      }}
      onCreateContact={async (input) => {
        const contact = await createContact(input);
        setNotice({ tone: "success", message: "Contact created." });
        await refreshContext();
        return contact;
      }}
      onUpdateContact={async (id, input) => {
        await updateContact(id, input);
        setNotice({ tone: "success", message: "Contact updated." });
        await refreshContext();
      }}
      onCreateHorse={async (input) => {
        await createHorse(input);
        setNotice({ tone: "success", message: "Horse created." });
        await refreshContext();
      }}
      onUpdateHorse={async (id, input) => {
        await updateHorse(id, input);
        setNotice({ tone: "success", message: "Horse updated." });
        await refreshContext();
      }}
      onDeleteHorse={async (id) => {
        await deleteHorse(id);
        setNotice({ tone: "success", message: "Horse and related test data deleted." });
        await refreshContext();
      }}
      onCreateClass={async (input) => {
        const classRecord = await createClass(input);
        setNotice({ tone: "success", message: "Class created." });
        await refreshContext();
        return classRecord;
      }}
      onCreateClassTemplate={async (input) => {
        await createClassTemplate(input);
        setNotice({ tone: "success", message: "Class preset created." });
        await refreshContext();
      }}
      onUpdateClassTemplate={async (id, input) => {
        await updateClassTemplate(id, input);
        setNotice({ tone: "success", message: "Class preset updated." });
        await refreshContext();
      }}
      onCreateClassTemplateDivision={async (input) => {
        await createClassTemplateDivision(input);
        setNotice({ tone: "success", message: "Preset division created." });
        await refreshContext();
      }}
      onUpdateClassTemplateDivision={async (id, input) => {
        await updateClassTemplateDivision(id, input);
        setNotice({ tone: "success", message: "Preset division updated." });
        await refreshContext();
      }}
      onUpdateClass={async (id, input) => {
        await updateClass(id, input);
        setNotice({ tone: "success", message: "Class updated." });
        await refreshContext();
      }}
      onCreateDivision={async (input) => {
        await createDivision(input);
        setNotice({ tone: "success", message: "Division created." });
        await refreshContext();
      }}
      onUpdateDivision={async (id, input) => {
        await updateDivision(id, input);
        setNotice({ tone: "success", message: "Division updated." });
        await refreshContext();
      }}
      onCreateEntry={async (input) => {
        await createEntry(input);
        setNotice({ tone: "success", message: "Entry draft created and invoice draft updated." });
        await refreshContext();
      }}
      onUpdateEntry={async (id, input) => {
        await updateEntry(id, input);
        setNotice({ tone: "success", message: "Entry and invoice draft updated." });
        await refreshContext();
      }}
      onDeleteEntry={async (id) => {
        await deleteEntry(id);
        setNotice({ tone: "success", message: "Entry deleted and invoice draft updated." });
        await refreshContext();
      }}
      onCreateStallOption={async (input) => {
        await createStallOption(input);
        setNotice({ tone: "success", message: "Stall option created." });
        await refreshContext();
      }}
      onUpdateStallOption={async (id, input) => {
        await updateStallOption(id, input);
        setNotice({ tone: "success", message: "Stall option updated." });
        await refreshContext();
      }}
      onCreateStallBooking={async (input) => {
        await createStallBooking(input);
        setNotice({ tone: "success", message: "Reservation created and invoice draft updated." });
        await refreshContext();
      }}
      onUpdateStallBooking={async (id, input) => {
        await updateStallBooking(id, input);
        setNotice({ tone: "success", message: "Reservation and invoice draft updated." });
        await refreshContext();
      }}
      onDeleteStallBooking={async (id) => {
        await deleteStallBooking(id);
        setNotice({ tone: "success", message: "Reservation deleted and invoice draft updated." });
        await refreshContext();
      }}
      onPrepareShowScoreClass={async (classRecord) => {
        if (!context) {
          return;
        }

        try {
          const setup = await prepareShowScoreClassSetup({
            classRecord,
            contacts: context.contacts,
            divisions: context.divisions,
            entries: context.entries,
            horses: context.horses,
          });
          setNotice({ tone: "success", message: `ShowScore setup prepared with ${setup.runs.length} run${setup.runs.length === 1 ? "" : "s"}.` });
          await refreshContext();
        } catch (error) {
          setNotice({ tone: "error", message: errorMessage(error) });
        }
      }}
      onRefresh={() => refreshContext()}
      onSignOut={handleSignOut}
      onSetExternalMembershipRequirement={async (input) => {
        await setOrganizationExternalMembershipRequirement(input);
        setNotice({ tone: "success", message: "Membership requirement updated." });
        await refreshContext();
      }}
      onViewChange={setActiveView}
    />
  );
}
