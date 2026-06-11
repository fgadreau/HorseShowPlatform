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
      backNumbers: "Dossards",
      billing: "Facturation",
      classes: "Horaire",
      entries: "Inscriptions",
      health: "Santé",
      myEntries: "Mes inscriptions",
      myBackNumbers: "Mes dossards",
      myHorses: "Mes chevaux",
      myOverview: "Tableau de bord",
      myProfile: "Mon profil",
      myInvoices: "Mes factures",
      myRiders: "Mes cavaliers",
      myStalls: "Mes réservations",
      mySpace: "Mon espace",
      notifications: "Notifications",
      overview: "Vue d'ensemble",
      people: "Répertoire",
      scoring: "Pointage",
      settings: "Paramètres",
      shows: "Concours",
      stalls: "Réservations",
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
      backNumbers: "Back numbers",
      billing: "Billing",
      classes: "Schedule",
      entries: "Entries",
      health: "Health",
      myEntries: "My entries",
      myBackNumbers: "My back numbers",
      myHorses: "My horses",
      myOverview: "Dashboard",
      myProfile: "My profile",
      myInvoices: "My invoices",
      myRiders: "My riders",
      myStalls: "My reservations",
      mySpace: "My space",
      notifications: "Notifications",
      overview: "Overview",
      people: "Directory",
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
