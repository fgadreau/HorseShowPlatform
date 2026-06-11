import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthScreen } from "./features/auth/AuthScreen";
import { LoadingScreen } from "./features/setup/LoadingScreen";
import { SetupScreen } from "./features/setup/SetupScreen";
import { PublicShowPage } from "./features/shows/PublicShowPage";
import { isSupabaseConfigured } from "./lib/env";
import { errorMessage } from "./lib/display";
import { getInitialLocale, saveLocale, translations } from "./lib/i18n";
import type { Locale } from "./lib/i18n";
import { supabase } from "./lib/supabase";
import {
  createClass,
  createClassTemplate,
  createClassTemplateDivision,
  createBackNumberRange,
  claimHorseBackNumber,
  createContact,
  createDivision,
  createEntry,
  createHorse,
  createUploadedHorseHealthDocument,
  createOrganization,
  createShow,
  createShowAnnouncement,
  deleteShowAnnouncement,
  createStallBooking,
  createStallOption,
  deleteClass,
  deleteClassTemplate,
  deleteClassTemplateDivision,
  deleteBackNumber,
  deleteEntry,
  deleteContact,
  deleteDivision,
  deleteHorse,
  deleteStallBooking,
  loadAppContext,
  prepareShowScoreClassSetup,
  assignBackNumber,
  assignNextBackNumber,
  releaseBackNumber,
  reviewHorseHealthDocument,
  setOrganizationExternalMembershipRequirement,
  updateClass,
  updateClassTemplate,
  updateClassTemplateDivision,
  updateBackNumberStatus,
  updateContact,
  updateDivision,
  updateEntry,
  updateHorse,
  updateOrganizationHealthSettings,
  updateShow,
  updateStallBooking,
  updateStallOption,
  updateUserProfile,
  verifyGvlCogginsDocument,
  type AppContext,
} from "./services/supabaseServices";
import type { Notice, ViewKey } from "./types/ui";

const Dashboard = lazy(() => import("./features/dashboard/Dashboard").then((module) => ({ default: module.Dashboard })));

function matchPublicShowSlug() {
  const match = window.location.pathname.match(/^\/shows\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

export default function App() {
  const publicShowSlug = matchPublicShowSlug();

  if (publicShowSlug) {
    return <PublicShowPage slug={publicShowSlug} />;
  }

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
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");
    const authError = url.searchParams.get("error_description") || hashParams.get("error_description") || url.searchParams.get("error") || hashParams.get("error");

    if (!authError) {
      return;
    }

    setNotice({ tone: "error", message: authError.replace(/\+/g, " ") });
    window.history.replaceState({}, document.title, `${url.origin}${url.pathname}`);
  }, []);

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
    <Suspense fallback={<LoadingScreen />}>
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
      onCreateBackNumberRange={async (input) => {
        const created = await createBackNumberRange(input);
        setNotice({
          tone: "success",
          message: created.length ? `${created.length} dossard${created.length === 1 ? "" : "s"} ajoute${created.length === 1 ? "" : "s"}.` : "Aucun nouveau dossard a ajouter dans cette plage.",
        });
        await refreshContext();
      }}
      onAssignBackNumber={async (input) => {
        const assignment = await assignBackNumber(input);
        setNotice({ tone: "success", message: `Dossard ${assignment.number} assigne.` });
        await refreshContext();
      }}
      onClaimHorseBackNumber={async (input) => {
        const assignment = await claimHorseBackNumber(input);
        setNotice({ tone: "success", message: `Dossard ${assignment.number} ajoute a ton cheval.` });
        await refreshContext();
      }}
      onAssignNextBackNumber={async (input) => {
        const assignment = await assignNextBackNumber(input);
        setNotice({ tone: "success", message: `Dossard ${assignment.number} assigne.` });
        await refreshContext();
      }}
      onReleaseBackNumber={async (id) => {
        const assignment = await releaseBackNumber(id);
        setNotice({ tone: "success", message: `Dossard ${assignment.number} libere.` });
        await refreshContext();
      }}
      onUpdateBackNumberStatus={async (id, status) => {
        const backNumber = await updateBackNumberStatus(id, status);
        setNotice({ tone: "success", message: `Dossard ${backNumber.number} mis a jour.` });
        await refreshContext();
      }}
      onDeleteBackNumber={async (id) => {
        await deleteBackNumber(id);
        setNotice({ tone: "success", message: "Dossard supprime." });
        await refreshContext();
      }}
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
      onCreateShowAnnouncement={async (input) => {
        await createShowAnnouncement(input);
        setNotice({ tone: "success", message: "Annonce publiée." });
        await refreshContext();
      }}
      onDeleteShowAnnouncement={async (id) => {
        await deleteShowAnnouncement(id);
        setNotice({ tone: "success", message: "Annonce supprimée." });
        await refreshContext();
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
      onDeleteContact={async (id) => {
        await deleteContact(id);
        setNotice({ tone: "success", message: "Contact deleted." });
        await refreshContext();
      }}
      onUpdateContact={async (id, input) => {
        await updateContact(id, input);
        setNotice({ tone: "success", message: "Contact updated." });
        await refreshContext();
      }}
      onCreateHorse={async (input) => {
        const horse = await createHorse(input);
        setNotice({ tone: "success", message: "Horse created." });
        await refreshContext();
        return horse;
      }}
      onCreateHorseHealthDocument={async (input) => {
        const document = await createUploadedHorseHealthDocument(input);
        setNotice({
          tone: "info",
          message: document.document_type === "combo_vaccine" ? "Certificat de vaccin ajoute pour revision." : "Document sante ajoute pour revision.",
        });
        await refreshContext();
        return document;
      }}
      onUpdateHorse={async (id, input) => {
        await updateHorse(id, input);
        setNotice({ tone: "success", message: "Horse updated." });
        await refreshContext();
      }}
      onReviewHorseHealthDocument={async (id, input) => {
        const document = await reviewHorseHealthDocument(id, input);
        setNotice({
          tone: document.status === "rejected" ? "info" : "success",
          message: document.status === "rejected" ? "Document sante refuse." : "Document sante approuve.",
        });
        await refreshContext();
      }}
      onVerifyGvlCogginsDocument={async (input) => {
        const document = await verifyGvlCogginsDocument(input);
        setNotice({
          tone: document.status === "verified" ? "success" : "info",
          message: document.status === "verified" ? "Coggins GVL verifie." : "Coggins GVL enregistre pour revision manuelle.",
        });
        await refreshContext();
        return document;
      }}
      onDeleteHorse={async (id) => {
        await deleteHorse(id);
        setNotice({ tone: "success", message: "Horse and related test data deleted." });
        await refreshContext();
      }}
	      onCreateClass={async (input) => {
	        const classRecord = await createClass(input);
	        setNotice({ tone: "success", message: "Bloc créé." });
	        await refreshContext();
	        return classRecord;
	      }}
	      onCreateClassTemplate={async (input) => {
	        await createClassTemplate(input);
	        setNotice({ tone: "success", message: "Bloc preset créé." });
	        await refreshContext();
	      }}
	      onDeleteClassTemplate={async (id) => {
	        await deleteClassTemplate(id);
	        setNotice({ tone: "success", message: "Bloc preset supprimé." });
	        await refreshContext();
	      }}
	      onUpdateClassTemplate={async (id, input) => {
	        await updateClassTemplate(id, input);
	        setNotice({ tone: "success", message: "Bloc preset mis à jour." });
	        await refreshContext();
	      }}
	      onCreateClassTemplateDivision={async (input) => {
	        await createClassTemplateDivision(input);
	        setNotice({ tone: "success", message: "Classe de bloc preset créée." });
	        await refreshContext();
	      }}
	      onDeleteClassTemplateDivision={async (id) => {
	        await deleteClassTemplateDivision(id);
	        setNotice({ tone: "success", message: "Classe de bloc preset supprimée." });
	        await refreshContext();
	      }}
	      onUpdateClassTemplateDivision={async (id, input) => {
	        await updateClassTemplateDivision(id, input);
	        setNotice({ tone: "success", message: "Classe de bloc preset mise à jour." });
	        await refreshContext();
	      }}
	      onDeleteClass={async (id) => {
	        await deleteClass(id);
	        setNotice({ tone: "success", message: "Bloc supprimé." });
	        await refreshContext();
	      }}
	      onUpdateClass={async (id, input) => {
	        await updateClass(id, input);
	        setNotice({ tone: "success", message: "Bloc mis à jour." });
	        await refreshContext();
	      }}
	      onCreateDivision={async (input) => {
	        await createDivision(input);
	        setNotice({ tone: "success", message: "Classe créée." });
	        await refreshContext();
	      }}
	      onDeleteDivision={async (id) => {
	        await deleteDivision(id);
	        setNotice({ tone: "success", message: "Classe supprimée." });
	        await refreshContext();
	      }}
	      onUpdateDivision={async (id, input) => {
	        await updateDivision(id, input);
	        setNotice({ tone: "success", message: "Classe mise à jour." });
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
      onUpdateOrganizationHealthSettings={async (id, input) => {
        await updateOrganizationHealthSettings(id, input);
        setNotice({ tone: "success", message: "Reglages de l'association mis a jour." });
        await refreshContext();
      }}
      onUpdateUserProfile={async (id, input) => {
        await updateUserProfile(id, input);
        setNotice({ tone: "success", message: "Profil mis à jour." });
        await refreshContext();
      }}
      onViewChange={setActiveView}
    />
    </Suspense>
  );
}
