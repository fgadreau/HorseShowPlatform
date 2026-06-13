import type { Organization, PlanTier } from '../types/domain';

export const PLAN_FEATURES = {
  community: [
    'shows',               // Créer/gérer des shows
    'classes',             // Classes et divisions
    'people',              // Gestion des contacts
    'back_numbers',        // Numéros de dos
    'public_pages',        // Horaire et résultats publics
    'stall_booking',       // Réservations stalles + paiement en ligne
    'entries_secretary',   // Saisie inscriptions par la secrétaire (portail rider fermé)
    'notifications',       // Notifications
  ],
  professional: [
    'entries_online',      // Portail d'inscription en ligne pour les riders
    'draw',                // Ordres de passage automatiques
    'stripe_preauth',      // Préautorisations Stripe
    'advanced_fees',       // Frais avancés par division/classe
    'financial_reports',   // Rapports financiers
    'health_documents',    // Vérifications santé chevaux
    'custom_branding',     // Logo, couleurs
    'show_score',          // ShowScore live scoring
    'import_export',       // Import/export données
  ],
  premium: [
    'nrha_integration',        // Rapports et scores officiels NRHA
    'aqha_integration',        // Vérification membres AQHA
    'nsba_integration',        // Vérification membres NSBA
    'membership_verification', // Vérification auto memberships fédérations
    'horse_license_check',     // Vérification licences chevaux
    'eligibility_check',       // Vérification éligibilité divisions
    'official_reports',        // Rapports format fédération
    'api_access',              // Accès API REST
    'live_streaming',          // Overlay OBS / streaming
    'year_end_awards',         // Classements de fin de saison
  ],
} as const;

export type PlanFeature =
  | (typeof PLAN_FEATURES)['community'][number]
  | (typeof PLAN_FEATURES)['professional'][number]
  | (typeof PLAN_FEATURES)['premium'][number];

const PLAN_ORDER: PlanTier[] = ['community', 'professional', 'premium'];

export function isAtLeastPlan(org: Pick<Organization, 'subscription_plan'>, minPlan: PlanTier): boolean {
  const orgIndex = PLAN_ORDER.indexOf(org.subscription_plan as PlanTier);
  const minIndex = PLAN_ORDER.indexOf(minPlan);
  return orgIndex >= minIndex;
}

export function hasPlanFeature(org: Pick<Organization, 'subscription_plan'>, feature: PlanFeature): boolean {
  const orgIndex = PLAN_ORDER.indexOf(org.subscription_plan as PlanTier);

  for (let i = 0; i <= orgIndex; i++) {
    const tier = PLAN_ORDER[i];
    if ((PLAN_FEATURES[tier] as readonly string[]).includes(feature)) {
      return true;
    }
  }

  return false;
}

export function getPlanLabel(plan: PlanTier): string {
  const labels: Record<PlanTier, string> = {
    community: 'Community',
    professional: 'Professional',
    premium: 'Premium',
  };
  return labels[plan];
}
