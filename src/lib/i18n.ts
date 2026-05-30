export type Locale = "fr" | "en";

export function getInitialLocale(): Locale {
  const saved = localStorage.getItem("horseshow.locale");

  if (saved === "fr" || saved === "en") {
    return saved;
  }

  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function saveLocale(locale: Locale) {
  localStorage.setItem("horseshow.locale", locale);
}

export const translations = {
  fr: {
    auth: {
      createAccount: "Créer un compte",
      email: "Courriel",
      password: "Mot de passe",
      signIn: "Connexion",
      working: "En cours",
    },
    common: {
      noOrganization: "Aucune association",
      refresh: "Rafraîchir",
      signOut: "Déconnexion",
    },
    nav: {
      association: "Association",
      billing: "Facturation",
      classes: "Classes",
      entries: "Inscriptions",
      myEntries: "Mes inscriptions",
      myHorses: "Mes chevaux",
      myInvoices: "Mes factures",
      myRiders: "Mes cavaliers",
      mySpace: "Mon espace",
      overview: "Vue d'ensemble",
      people: "Contacts",
      scoring: "Scoring",
      settings: "Paramètres",
      shows: "Shows",
    },
    shell: {
      associationOnly: "Visible aux admins et secrétaires de l'association.",
      productName: "Horse Show Platform",
      workspace: "Opérations MVP",
    },
  },
  en: {
    auth: {
      createAccount: "Create account",
      email: "Email",
      password: "Password",
      signIn: "Sign in",
      working: "Working",
    },
    common: {
      noOrganization: "No organization",
      refresh: "Refresh",
      signOut: "Sign out",
    },
    nav: {
      association: "Association",
      billing: "Billing",
      classes: "Classes",
      entries: "Entries",
      myEntries: "My entries",
      myHorses: "My horses",
      myInvoices: "My invoices",
      myRiders: "My riders",
      mySpace: "My space",
      overview: "Overview",
      people: "People",
      scoring: "Scoring",
      settings: "Settings",
      shows: "Shows",
    },
    shell: {
      associationOnly: "Visible to association admins and secretaries.",
      productName: "Horse Show Platform",
      workspace: "MVP Operations",
    },
  },
} as const;

export type Translation = (typeof translations)[Locale];
