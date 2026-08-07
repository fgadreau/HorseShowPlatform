import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthScreen } from "./features/auth/AuthScreen";
import { LoadingScreen } from "./features/setup/LoadingScreen";
import { SetupScreen } from "./features/setup/SetupScreen";
import { LandingPage } from "./features/shows/LandingPage";
import { PublicShowPage } from "./features/shows/PublicShowPage";
import { isSupabaseConfigured } from "./lib/env";
import { errorMessage } from "./lib/display";
import { getInitialLocale, saveLocale, translations } from "./lib/i18n";
import type { Locale } from "./lib/i18n";
import { supabase } from "./lib/supabase";
import {
  cancelManualSale,
  createBlock,
  createBlockTemplate,
  createClassTemplate,
  createBackNumberRange,
  claimHorseBackNumber,
  createContact,
  createContactOrganizationMembership,
  createClass,
  createEntry,
  createHorse,
  createUploadedHorseHealthDocument,
  createOrganization,
  createOrganizationHealthDocumentReview,
  createOrganizationMembershipType,
  createOrganizationProduct,
  createManualSale,
  createShow,
  createSlate,
  createShowAnnouncement,
  deleteShowAnnouncement,
  deleteSlate,
  createStallBooking,
  createStallOption,
  deleteBlock,
  deleteBlockTemplate,
  deleteClassTemplate,
  deleteBackNumber,
  deleteEntry,
  deleteContact,
  deleteClass,
  deleteHorse,
  deleteStallBooking,
  loadAppContext,
  linkContactToDirectory,
  linkHorseToDirectory,
  prepareShowScoreClassSetup,
  savePayoutCalculationDraft,
  saveShowScorePaidWarmup,
  deleteShowScorePaidWarmup,
  assignBackNumber,
  assignNextBackNumber,
  releaseBackNumber,
  replaceNrhaRiderRankings,
  setOrganizationExternalCredentialRequirement,
  setOrganizationHealthPolicy,
  updateBlock,
  updateBlockTemplate,
  updateClassTemplate,
  updateBackNumberStatus,
  updateContact,
  updateClass,
  updateEntry,
  updateHorse,
  updateOrganizationHealthSettings,
  updateOrganizationMembershipType,
  updateOrganizationProduct,
  updatePayoutAwardPayee,
  updatePayoutCalculationStatus,
  updateShow,
  updateSlate,
  updateShowScorePaidWarmup,
  updateStallBooking,
  updateStallOption,
  updateUserProfile,
  unlinkContactFromDirectory,
  unlinkHorseFromDirectory,
  verifyGvlCogginsDocument,
  verifyNrhaEligibility,
  verifyNrhaHorse,
  verifyNrhaMember,
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
  const [contextLoadError, setContextLoadError] = useState("");
  const [showAuth, setShowAuth] = useState(false);
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
      setContextLoadError("");
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
      setSelectedOrganizationId(context.loadedOrganizationId ?? context.organizations[0].id);
    }
  }, [context, selectedOrganizationId]);

  async function refreshContext(activeSession = session, organizationId = selectedOrganizationId) {
    if (!activeSession?.user) {
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const nextContext = await loadAppContext(activeSession.user, organizationId || undefined);
      setContext(nextContext);
      setContextLoadError("");
    } catch (error) {
      const message = errorMessage(error);
      setContext(null);
      setContextLoadError(message);
      setNotice({ tone: "error", message });
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
    setContextLoadError("");
    setSession(null);
  }

  if (!isSupabaseConfigured) {
    return <SetupScreen t={t} />;
  }

  if (loading && !context && !session) {
    return <LoadingScreen />;
  }

  if (!session) {
    if (showAuth) {
      return <AuthScreen locale={locale} t={t} onLocaleChange={handleLocaleChange} onNotice={setNotice} notice={notice} />;
    }
    return <LandingPage onSignIn={() => setShowAuth(true)} />;
  }

  if (!loading && !context && contextLoadError) {
    return (
      <DataLoadErrorScreen
        error={contextLoadError}
        locale={locale}
        onRetry={() => void refreshContext(session)}
        onSignOut={() => void handleSignOut()}
      />
    );
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
      onChangeOrganization={(organizationId) => {
        setSelectedOrganizationId(organizationId);
        void refreshContext(session, organizationId);
      }}
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
      onCreateOrganizationMembershipType={async (input) => {
        await createOrganizationMembershipType(input);
        setNotice({ tone: "success", message: "Carte de membre créée." });
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
      onCreateSlate={async (input) => {
        await createSlate(input);
        setNotice({ tone: "success", message: "Slate créée." });
        await refreshContext();
      }}
      onUpdateSlate={async (id, input) => {
        await updateSlate(id, input);
        setNotice({ tone: "success", message: "Slate mise à jour." });
        await refreshContext();
      }}
      onDeleteSlate={async (id) => {
        await deleteSlate(id);
        setNotice({ tone: "success", message: "Slate supprimée; ses blocs sont maintenant sans slate." });
        await refreshContext();
      }}
      onCreateContact={async (input) => {
        const contact = await createContact(input);
        setNotice({ tone: "success", message: "Contact created." });
        await refreshContext();
        return contact;
      }}
      onCreateContactOrganizationMembership={async (input) => {
        const membership = await createContactOrganizationMembership(input);
        setNotice({ tone: "success", message: "Carte de membre vendue et facture draft mise à jour." });
        await refreshContext();
        return membership;
      }}
      onLinkContactToDirectory={async (input) => {
        await linkContactToDirectory(input);
        setNotice({ tone: "success", message: "Contact ajouté au répertoire." });
        await refreshContext();
      }}
      onUnlinkContactFromDirectory={async (organizationDisciplineId, contactId) => {
        await unlinkContactFromDirectory(organizationDisciplineId, contactId);
        setNotice({ tone: "success", message: "Contact retiré du répertoire; sa fiche globale est conservée." });
        await refreshContext();
      }}
      onLinkHorseToDirectory={async (input) => {
        await linkHorseToDirectory(input);
        setNotice({ tone: "success", message: "Cheval ajouté au répertoire." });
        await refreshContext();
      }}
      onUnlinkHorseFromDirectory={async (organizationDisciplineId, horseId) => {
        await unlinkHorseFromDirectory(organizationDisciplineId, horseId);
        setNotice({ tone: "success", message: "Cheval retiré du répertoire; sa fiche globale est conservée." });
        await refreshContext();
      }}
      onCreateManualSale={async (input) => {
        const sale = await createManualSale(input);
        setNotice({ tone: "success", message: "Vente ajoutée et facture draft mise à jour." });
        await refreshContext();
        return sale;
      }}
      onCancelManualSale={async (id) => {
        await cancelManualSale(id);
        setNotice({ tone: "success", message: "Vente annulée et facture recalculée." });
        await refreshContext();
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
          message: document.document_category === "registration"
            ? "Document d'enregistrement ajoute au cheval."
            : document.document_type === "combo_vaccine"
              ? "Certificat de vaccin ajoute pour revision."
              : "Document sante ajoute pour revision.",
        });
        await refreshContext();
        return document;
      }}
      onUpdateHorse={async (id, input) => {
        await updateHorse(id, input);
        setNotice({ tone: "success", message: "Horse updated." });
        await refreshContext();
      }}
      onReviewOrganizationHealthDocuments={async (inputs) => {
        for (const input of inputs) {
          await createOrganizationHealthDocumentReview(input);
        }
        setNotice({ tone: "success", message: "Révision de l'association enregistrée." });
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
      onVerifyNrhaEligibility={async (input) => verifyNrhaEligibility(input)}
      onVerifyNrhaHorse={async (input) => verifyNrhaHorse(input)}
      onVerifyNrhaMember={async (input) => verifyNrhaMember(input)}
      onDeleteHorse={async (id) => {
        await deleteHorse(id);
        setNotice({ tone: "success", message: "Horse and related test data deleted." });
        await refreshContext();
      }}
	      onCreateBlock={async (input) => {
	        const block = await createBlock(input);
	        setNotice({ tone: "success", message: "Bloc créé." });
	        await refreshContext();
	        return block;
	      }}
	      onCreateBlockTemplate={async (input) => {
	        await createBlockTemplate(input);
	        setNotice({ tone: "success", message: "Bloc preset créé." });
	        await refreshContext();
	      }}
	      onDeleteBlockTemplate={async (id) => {
	        await deleteBlockTemplate(id);
	        setNotice({ tone: "success", message: "Bloc preset supprimé." });
	        await refreshContext();
	      }}
	      onUpdateBlockTemplate={async (id, input) => {
	        await updateBlockTemplate(id, input);
	        setNotice({ tone: "success", message: "Bloc preset mis à jour." });
	        await refreshContext();
	      }}
	      onCreateClassTemplate={async (input) => {
	        await createClassTemplate(input);
	        setNotice({ tone: "success", message: "Classe de bloc preset créée." });
	        await refreshContext();
	      }}
	      onDeleteClassTemplate={async (id) => {
	        await deleteClassTemplate(id);
	        setNotice({ tone: "success", message: "Classe de bloc preset supprimée." });
	        await refreshContext();
	      }}
	      onUpdateClassTemplate={async (id, input) => {
	        await updateClassTemplate(id, input);
	        setNotice({ tone: "success", message: "Classe de bloc preset mise à jour." });
	        await refreshContext();
	      }}
	      onDeleteBlock={async (id) => {
	        await deleteBlock(id);
	        setNotice({ tone: "success", message: "Bloc supprimé." });
	        await refreshContext();
	      }}
	      onUpdateBlock={async (id, input) => {
	        await updateBlock(id, input);
	        setNotice({ tone: "success", message: "Bloc mis à jour." });
	        await refreshContext();
	      }}
	      onCreateClass={async (input) => {
	        await createClass(input);
	        setNotice({ tone: "success", message: "Classe créée." });
	        await refreshContext();
	      }}
	      onDeleteClass={async (id) => {
	        await deleteClass(id);
	        setNotice({ tone: "success", message: "Classe supprimée." });
	        await refreshContext();
	      }}
	      onUpdateClass={async (id, input) => {
	        await updateClass(id, input);
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
      onPrepareShowScoreClass={async (block) => {
        if (!context) {
          return;
        }

        try {
          const setup = await prepareShowScoreClassSetup({
            classRecord: block,
            contacts: context.contacts,
            classes: context.classes,
            entries: context.entries,
            horses: context.horses,
          });
          setNotice({ tone: "success", message: `ShowScore setup prepared with ${setup.runs.length} run${setup.runs.length === 1 ? "" : "s"}.` });
          await refreshContext();
        } catch (error) {
          setNotice({ tone: "error", message: errorMessage(error) });
        }
      }}
      onSavePayoutCalculationDraft={async (input) => {
        try {
          await savePayoutCalculationDraft(input);
          setNotice({ tone: "success", message: "Calcul de bourse sauvegardé en draft." });
          await refreshContext();
        } catch (error) {
          setNotice({ tone: "error", message: errorMessage(error) });
          throw error;
        }
      }}
      onUpdatePayoutAwardPayee={async (id, input) => {
        try {
          await updatePayoutAwardPayee(id, input);
          setNotice({ tone: "info", message: "Payee mis à jour." });
          await refreshContext();
        } catch (error) {
          setNotice({ tone: "error", message: errorMessage(error) });
          throw error;
        }
      }}
      onUpdatePayoutCalculationStatus={async (id, status) => {
        try {
          await updatePayoutCalculationStatus(id, status);
          setNotice({ tone: "success", message: status === "published" ? "Résultats et payouts publiés." : "Calcul marqué révisé." });
          await refreshContext();
        } catch (error) {
          setNotice({ tone: "error", message: errorMessage(error) });
          throw error;
        }
      }}
      onSaveShowScorePaidWarmup={async (input) => {
        try {
          const warmup = await saveShowScorePaidWarmup(input);
          setNotice({ tone: "success", message: `Paid warm up créé avec ${warmup.entries.length} inscription${warmup.entries.length === 1 ? "" : "s"}.` });
          await refreshContext();
        } catch (error) {
          setNotice({ tone: "error", message: errorMessage(error) });
        }
      }}
      onDeleteShowScorePaidWarmup={async (id) => {
        await deleteShowScorePaidWarmup(id);
        setNotice({ tone: "success", message: "Paid warm up supprimé." });
        await refreshContext();
      }}
      onReplaceNrhaRiderRankings={async (input) => {
        await replaceNrhaRiderRankings(input);
        setNotice({ tone: "success", message: "Liste NRHA importée." });
        await refreshContext();
      }}
      onRefresh={() => refreshContext()}
      onSignOut={handleSignOut}
      onSetExternalMembershipRequirement={async (input) => {
        await setOrganizationExternalCredentialRequirement(input);
        setNotice({ tone: "success", message: "Membership requirement updated." });
        await refreshContext();
      }}
      onSetOrganizationHealthPolicy={async (input) => {
        await setOrganizationHealthPolicy(input);
        setNotice({ tone: "success", message: "Politique de santé mise à jour." });
        await refreshContext();
      }}
      onUpdateOrganizationHealthSettings={async (id, input) => {
        await updateOrganizationHealthSettings(id, input);
        setNotice({ tone: "success", message: "Reglages de l'association mis a jour." });
        await refreshContext();
      }}
      onCreateOrganizationProduct={async (input) => {
        await createOrganizationProduct(input);
        setNotice({ tone: "success", message: "Produit créé." });
        await refreshContext();
      }}
      onUpdateOrganizationProduct={async (id, input) => {
        await updateOrganizationProduct(id, input);
        setNotice({ tone: "success", message: "Produit mis à jour." });
        await refreshContext();
      }}
      onUpdateOrganizationMembershipType={async (id, input) => {
        await updateOrganizationMembershipType(id, input);
        setNotice({ tone: "success", message: "Carte de membre mise à jour." });
        await refreshContext();
      }}
      onUpdateShowScorePaidWarmup={async (id, input) => {
        try {
          const warmup = await updateShowScorePaidWarmup(id, input);
          setNotice({ tone: "success", message: `Paid warm up mis à jour avec ${warmup.entries.length} inscription${warmup.entries.length === 1 ? "" : "s"}.` });
          await refreshContext();
        } catch (error) {
          setNotice({ tone: "error", message: errorMessage(error) });
        }
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

function DataLoadErrorScreen({
  error,
  locale,
  onRetry,
  onSignOut,
}: {
  error: string;
  locale: Locale;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <p className="eyebrow">Horse Show Platform</p>
        <h1>{locale === "fr" ? "Données non chargées" : "Data did not load"}</h1>
        <p>
          {locale === "fr"
            ? "L'app est ouverte, mais la lecture des données Supabase a échoué pour cette session."
            : "The app opened, but Supabase data failed to load for this session."}
        </p>
        <pre>{error}</pre>
        <div className="row-actions">
          <button className="primary-button" type="button" onClick={onRetry}>
            {locale === "fr" ? "Réessayer" : "Retry"}
          </button>
          <button className="ghost-button" type="button" onClick={onSignOut}>
            {locale === "fr" ? "Déconnexion" : "Sign out"}
          </button>
        </div>
      </section>
    </main>
  );
}
