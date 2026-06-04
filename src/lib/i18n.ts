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
      accountType: "Type de compte",
      accountTypes: {
        admin: "Administrateur",
        agent: "Agent",
        owner: "Propriétaire",
        secretary: "Secrétaire",
      },
      checkEmail: "Compte créé. Vérifie ton courriel si la confirmation est activée.",
      createAccount: "Créer un compte",
      email: "Courriel",
      firstName: "Prénom",
      lastName: "Nom",
      password: "Mot de passe",
      phone: "Téléphone",
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
      health: "Santé",
      myEntries: "Mes inscriptions",
      myHorses: "Mes chevaux",
      myInvoices: "Mes factures",
      myRiders: "Mes cavaliers",
      myStalls: "Mes reservations",
      mySpace: "Mon espace",
      overview: "Vue d'ensemble",
      people: "Contacts",
      scoring: "Scoring",
      settings: "Paramètres",
      shows: "Shows",
      stalls: "Reservations",
    },
    shell: {
      associationOnly: "Visible aux admins et secrétaires de l'association.",
      productName: "Horse Show Platform",
      workspace: "Opérations MVP",
    },
  },
  en: {
    auth: {
      accountType: "Account type",
      accountTypes: {
        admin: "Administrator",
        agent: "Agent",
        owner: "Owner",
        secretary: "Secretary",
      },
      checkEmail: "Account created. Check your email if confirmation is enabled.",
      createAccount: "Create account",
      email: "Email",
      firstName: "First name",
      lastName: "Last name",
      password: "Password",
      phone: "Phone",
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
      health: "Health",
      myEntries: "My entries",
      myHorses: "My horses",
      myInvoices: "My invoices",
      myRiders: "My riders",
      myStalls: "My reservations",
      mySpace: "My space",
      overview: "Overview",
      people: "People",
      scoring: "Scoring",
      settings: "Settings",
      shows: "Shows",
      stalls: "Reservations",
    },
    shell: {
      associationOnly: "Visible to association admins and secretaries.",
      productName: "Horse Show Platform",
      workspace: "MVP Operations",
    },
  },
} as const;

export type Translation = (typeof translations)[Locale];
