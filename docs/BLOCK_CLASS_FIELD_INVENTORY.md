# Inventaire F1 — Blocs, classes et templates

## Statut

Inventaire technique préparatoire à la reconstruction SQL. Aucun changement de schéma ou de données n'est inclus dans ce document.

Les adaptations et non-régressions ShowScore correspondantes sont suivies dans `docs/SHOWSCORE_REBUILD_IMPACT_REGISTER.md`.

## 1. Conclusion principale

Le modèle actuel utilise :

- `classes` pour les blocs d'horaire, mais cette table contient également plusieurs champs métier de classe;
- `divisions` pour les vraies classes;
- `class_templates` pour les modèles de blocs, avec plusieurs champs de classe;
- `class_template_divisions` pour les modèles des vraies classes.

La reconstruction est donc une redistribution des responsabilités et des dépendances. Ce n'est pas un échange mécanique de noms de tables.

## 2. Modèle cible confirmé

```text
shows
└── slates
    └── blocks
        └── classes

block_templates
└── class_templates
```

- La slate porte l'identité du concours technique.
- Le bloc porte l'horaire, le regroupement des passages, le pattern commun, l'affectation des juges et, lorsque configuré ainsi, la fermeture des inscriptions.
- La classe porte la discipline, les frais, les règles, l'admissibilité et les paramètres financiers.
- Un modèle de bloc possède directement plusieurs modèles de classes.
- Le terme produit et SQL `division` disparaît du modèle final.

## 3. Matrice de la table SQL actuelle `classes`

Cette table représente principalement les blocs actuels.

| Champ actuel | Destination cible | Décision |
| --- | --- | --- |
| `id` | `blocks.id` | Conserver comme identité de bloc dans le nouveau seed |
| `organization_id` | `blocks.organization_id` | Conserver pour RLS, validé contre le concours |
| `show_id` | `blocks.show_id` | Conserver |
| `name` | `blocks.name` | Conserver comme nom du bloc |
| `code` | `classes.code` | Retirer du bloc; le code officiel appartient à la classe |
| `description` | `classes.description` ou `blocks.notes` | Ne pas migrer automatiquement; utiliser le bon champ selon le nouveau formulaire |
| `min_entries` | `classes.minimum_entries` | Déplacer au niveau classe |
| `entry_fee` | `classes.entry_fee` | Supprimer le fallback bloc; chaque classe porte son frais effectif |
| `payment_method` | Supprimer ou politique de concours | Colonne non utilisée par le frontend; ne pas recopier sans besoin confirmé |
| `class_block_id` | Supprimer | Colonne morte, sans FK et sans usage actif identifié |
| `show_day_id` | `blocks.show_day_id` | Conserver au niveau bloc |
| `scheduled_time` | `blocks.scheduled_time` | Conserver au niveau bloc |
| `estimated_duration` | `blocks.estimated_duration` | Conserver comme donnée d'horaire si le nouveau formulaire l'utilise |
| `ring_number` | `blocks.arena` | Remplacer le numéro rigide par l'arène structurée ou libellée |
| `arena` | `blocks.arena` | Conserver au niveau bloc |
| `status` | `blocks.schedule_status` et `classes.entry_status` | Scinder l'état d'exécution du bloc et l'état des inscriptions de classe |
| `is_public` | Visibilités explicites bloc/classe/résultats | Scinder l'affichage du bloc dans l'horaire, l'affichage et l'ouverture de la classe, et la publication des résultats |
| `requires_membership` | `classes.eligibility_rules` | Déplacer dans les règles d'admissibilité de classe |
| `requires_coggins` | Supprimer | Code mort; remplacé par la politique de santé d'association |
| `requires_health_cert` | Supprimer | Code mort; remplacé par la politique de santé d'association |
| `notes` | `blocks.notes` | Conserver pour les notes d'horaire; les notes de classe restent sur la classe |
| `pattern` | `blocks.pattern` | Un bloc possède un seul pattern; toutes ses classes l'utilisent et des blocs exécutés concurremment doivent avoir le même pattern |
| `custom_pattern` | `blocks.custom_pattern` | Même décision que `pattern`; comparer aussi la définition personnalisée lors de la validation de concurrence |
| `judge_name` | Affectation de juge au bloc | Remplacer le texte par une relation de rôle/affectation, avec snapshot d'affichage si requis |
| `sort_order` | `blocks.sort_order` | Conserver au niveau bloc |
| `legacy_showscore_class_id` | Supprimer | Données fictives; remplacer les adaptateurs ShowScore par des références `block_id` |
| `class_template_id` | `blocks.block_template_id` | Renommer selon le vrai concept |
| `block_label` | `blocks.display_label` ou fusion avec `name` | Éviter deux libellés sans distinction produit claire |
| `sanctioning_body_codes` | `class_governing_bodies` | Supprimer du bloc et remplacer le texte par des FK sur chaque classe |
| `back_number_policy` | Association + surcharge de classe | Valeur générale de l'association; surcharge nullable sur la classe |
| `eligibility_rules` | `classes.eligibility_rules` | Supprimer du bloc; chaque classe porte ses règles |
| `nrha_slate_number` | `slates.technical_number` | Déplacer à la slate, sans nom de champ limité à NRHA |
| `entries_close_at` | `shows.entries_close_at` ou `blocks.entries_close_at` | Le concours choisit le mode `show` ou `block`; aucune échéance propre à la classe |
| `late_entries_allowed` | Politique d'association + configuration de concours | Le concours hérite de la valeur générale de l'association et peut la préciser; aucune surcharge de classe |
| `late_entry_fee_percent` | Politique d'association + configuration de concours | Même portée que l'autorisation des inscriptions tardives; le calcul utilise l'échéance effective du concours ou du bloc |
| `draw_prepared_at` | `blocks.draw_prepared_at` | Le draw opérationnel est préparé pour le bloc de passages |
| `schedule_start_mode` | `blocks.schedule_start_mode` | Conserver au niveau bloc |
| `is_event_block` | `blocks.block_type` | Remplacer le booléen par `competition`, `paid_warmup`, `event`, `break` ou `ceremony` |
| `user_id` | Supprimer après adaptation ShowScore | Colonne de compatibilité; utiliser les identités et audits HSP normaux |
| `created_at`, `updated_at` | `blocks` | Conserver; ajouter les auteurs si requis |

## 4. Matrice de la table SQL actuelle `divisions`

Cette table représente les vraies classes actuelles.

| Champ actuel | Destination cible | Décision |
| --- | --- | --- |
| `id` | `classes.id` | Conserver comme identité conceptuelle de classe dans le nouveau seed |
| `organization_id` | `classes.organization_id` | Conserver pour RLS avec contrainte de cohérence |
| `show_id` | `classes.show_id` | Conserver pour requêtes et RLS, validé via le bloc |
| `class_id` | `classes.block_id` | Renommer vers le vrai parent |
| `name` | `classes.name` | Conserver |
| `level` | `classes.level` | Conserver |
| `code` | `classes.code` | Conserver comme code officiel ou maison |
| `is_split_results` | Configuration de résultats de classe ou supprimer | Aucun usage applicatif actif trouvé; ne conserver que si le workflow résultats le requiert |
| `is_split_classes` | Supprimer ou règle explicite de regroupement | Aucun usage applicatif actif trouvé |
| `entry_fee` | `classes.entry_fee` | Conserver comme frais effectif |
| `min_age`, `max_age` | `classes.eligibility_rules` | Convertir en règles structurées plutôt que conserver deux chemins |
| `notes` | `classes.notes` | Conserver |
| `class_template_division_id` | `classes.class_template_id` | Renommer selon le modèle cible |
| `sanctioning_body_codes` | `class_governing_bodies` | Remplacer les codes texte par une table de liaison |
| `eligibility_rules` | `classes.eligibility_rules` | Conserver au niveau classe |
| `judge_fee` | `classes.judge_fee` | Conserver; la facturation continue à regrouper correctement par bloc |
| `payout_schedule_type` | `classes.payout_schedule_type` | Conserver |
| `added_money` | `classes.added_money` | Conserver |
| `retainage_percent` | `classes.retainage_percent` | Conserver |
| `trophy_or_plaque_fee` | `classes.trophy_or_plaque_fee` | Conserver |
| `sanctioning_fee_percent` | `classes.sanctioning_fee_percent` | Conserver |
| `payout_rules` | `classes.payout_rules` | Conserver |
| `payout_notes` | `classes.payout_notes` | Conserver |
| `created_at`, `updated_at` | `classes` | Conserver |

## 5. Matrice des templates actuels

### Table actuelle `class_templates` → future `block_templates`

| Champ actuel | Destination cible | Décision |
| --- | --- | --- |
| `id`, `organization_id` | `block_templates` | Conserver conceptuellement |
| `name` | `block_templates.name` | Conserver |
| `code` | `block_templates.code` facultatif | Code interne de preset seulement, jamais code officiel de classe |
| `block_label` | `block_templates.display_label` | Conserver seulement si distinct du nom |
| `category` | `block_templates.category` | Conserver |
| `default_pattern` | `block_templates.pattern` | Conserver au niveau du modèle de bloc puisqu'un seul pattern s'applique à toutes ses classes |
| `default_entry_fee` | Enfants `class_templates.default_entry_fee` | Supprimer le fallback du parent |
| `sanctioning_body_codes` | Liaisons des classes modèles | Supprimer du modèle de bloc |
| `back_number_policy` | Surcharge des classes modèles | Supprimer du modèle de bloc |
| `eligibility_rules` | Enfants `class_templates.eligibility_rules` | Supprimer du modèle de bloc |
| `sort_order`, `is_active`, `notes` | `block_templates` | Conserver |
| `created_at`, `updated_at` | `block_templates` | Conserver |

### Table actuelle `class_template_divisions` → future `class_templates`

| Champ actuel | Destination cible | Décision |
| --- | --- | --- |
| `id` | `class_templates.id` | Conserver conceptuellement |
| `organization_id` | `class_templates.organization_id` | Conserver pour RLS, validé contre le parent |
| `class_template_id` | `class_templates.block_template_id` | Renommer vers le vrai parent |
| `name`, `code`, `level` | `class_templates` | Conserver |
| `default_entry_fee`, `default_judge_fee` | `class_templates` | Conserver |
| tous les champs `default_payout_*` | `class_templates` | Conserver |
| `sanctioning_body_codes` | `class_template_governing_bodies` | Remplacer par des FK |
| `eligibility_rules` | `class_templates.eligibility_rules` | Conserver |
| `sort_order`, `notes` | `class_templates` | Conserver |
| nouveau `organization_discipline_id` | `class_templates` | Obligatoire dans le modèle cible |
| nouvelle surcharge de numéro | `class_templates.back_number_policy_override` | Nullable; héritage de l'association par défaut |
| `created_at`, `updated_at` | `class_templates` | Conserver |

La relation demeure volontairement un-à-plusieurs. Aucun `block_template_classes` many-to-many n'est prévu au MVP.

## 6. Changements de références obligatoires

| Référence actuelle | Référence cible |
| --- | --- |
| `entries.division_id` | `entries.class_id` |
| `divisions.class_id` | `classes.block_id` |
| `payout_calculations.division_id` | `payout_calculations.class_id` |
| `entry_results.division_id` | `entry_results.class_id` |
| `class_template_divisions.class_template_id` | `class_templates.block_template_id` |
| blocs actuels `class_template_id` | `blocks.block_template_id` |
| setups/sessions ShowScore `class_id` qui pointent au bloc | `block_id` |

Les fonctions de facturation qui joignent actuellement classe-parent et division-enfant deviennent plus simples : l'inscription lit ses frais directement depuis la classe et utilise `class.block_id` pour les regroupements facturés une seule fois par bloc.

`block_run_class_entries` ne contient aucun `division_id` : sa clé relie seulement un passage de bloc à une inscription. La dépendance à la classe se trouve dans `sync_entry_results_for_scored_run()`, qui lit actuellement `entries.division_id` pour écrire `entry_results.division_id`. Cette fonction doit être réécrite pour utiliser `entries.class_id` et `entry_results.class_id`.

## 7. Inventaire SQL touché

### Schéma, contraintes et RLS

- `0001_initial_schema.sql`
- `0003_show_score_alignment.sql`
- `0004_phase1_rls_hardening.sql`
- `0015_class_program_templates.sql`
- `0016_nrha_slate_numbers.sql`
- `0017_aqr_house_sanctioning_body.sql`
- `0018_entry_judge_fees_by_block.sql`
- `0025_global_people_external_memberships.sql`
- `0034_division_payout_settings.sql`
- `0035_entry_deadlines_late_fees_draw.sql`
- `0036_entry_program_draw_rules.sql`
- `0039_back_number_management.sql`
- `0040_user_back_number_claims.sql`
- `0045_class_schedule_start_mode.sql`
- `0046_schedule_event_blocks.sql`
- `0050_showscore_compatibility.sql`
- `0051_showscore_public_access.sql`
- `0058_showscore_timing_functions.sql`
- `0059_showscore_app_events.sql`
- `0060_showscore_remaining_compat_columns.sql`
- `0061_showscore_public_visibility_policies.sql`
- `0063_showscore_scored_runs_results.sql`
- `0064_results_payouts.sql`
- `0065_aqr_audit_import_batches.sql`
- `0066_showscore_scoring_session_scribe_rls.sql`

### Facturation et mutations dépendantes

- `0008_entry_invoices.sql`
- `0038_invoice_program_nomenclature.sql`
- `0043_short_invoice_numbers.sql`
- `0076_entry_invoice_late_fees.sql`

Ces fichiers ne seront pas réécrits rétroactivement pendant la première passe. La migration destructive finale doit remplacer leurs fonctions actives par des versions utilisant `blocks` et `classes`, puis les tests confirmeront qu'aucune fonction héritée ne demeure active.

Fonctions à réécrire explicitement :

- `sync_entry_results_for_scored_run()` vers `entries.class_id` et `entry_results.class_id`;
- `claim_horse_back_number()` vers `directory_horses` et `directory_contacts`, sans fallback sur `horses.organization_id`, `contacts.organization_id` ou les anciennes tables de liens.

## 8. Inventaire applicatif touché

### Noyau de types et services

- `src/types/domain.ts`
- `src/services/supabaseServices.ts`
- `src/services/showScoreAdapters.ts`
- `src/App.tsx`

### Programme et templates

- `src/features/classes/ClassesView.tsx`
- `src/features/classes/ClassForm.tsx` → futur formulaire de bloc
- `src/features/classes/ClassEditForm.tsx` → futur formulaire de bloc
- `src/features/classes/DivisionForm.tsx` → futur formulaire de classe
- `src/features/classes/DivisionEditForm.tsx` → futur formulaire de classe
- `src/features/classes/EventBlockForm.tsx` → bloc avec `block_type`
- `src/features/classes/ClassTemplateForm.tsx` → modèle de bloc
- `src/features/classes/ClassTemplateEditForm.tsx` → modèle de bloc
- `src/features/classes/ClassTemplateDivisionForm.tsx` → modèle de classe
- `src/features/classes/ClassTemplateDivisionEditForm.tsx` → modèle de classe
- `src/features/classes/classUtils.tsx`
- `src/features/classes/SanctioningFields.tsx`
- `src/features/classes/PayoutSettingsFields.tsx`
- `src/features/classes/ShowScorePatternSelect.tsx`
- `src/features/classes/showScorePatterns.ts`
- `src/features/classes/PaidWarmupForm.tsx`

### Inscriptions, affichage et règles

- `src/features/entries/EntryForm.tsx`
- `src/features/entries/EntryEditForm.tsx`
- `src/features/entries/EntriesView.tsx`
- `src/features/entries/MyEntriesView.tsx`
- `src/features/entries/NrhaEligibilityCheck.tsx`
- `src/features/entries/entryDisplay.ts`
- `src/features/backNumbers/BackNumbersView.tsx`
- `src/features/results/ResultsView.tsx`
- `src/features/scoring/ScoringView.tsx`
- `src/features/shows/PublicShowPage.tsx`
- `src/features/shows/ShowAssistant.tsx`
- `src/features/shows/ShowsView.tsx`
- `src/features/dashboard/Dashboard.tsx`
- `src/features/dashboard/ClientDashboardView.tsx`
- `src/features/dashboard/shared.tsx`
- `src/features/overview/OverviewView.tsx`
- `src/lib/aqrAuditImport.ts`
- `src/lib/display.ts`
- `src/lib/payouts.ts`
- `src/utils/planFeatures.ts`
- `src/styles.css`

### Tests, seeds et documentation

- `supabase/seed.sql`
- `supabase/seed_draw_test_program.sql`
- `supabase/tests/aqr_audit_import_cleanup.sql`
- `supabase/tests/results_payouts.sql`
- `scripts/draw-test-program.ts`
- `scripts/payout-test-program.ts`
- `docs/PRODUCT_MODEL.md`
- `docs/SHOWSCORE_ALIGNMENT.md`
- `docs/SHOW_READINESS_AND_CLASS_FINANCE.md`
- `docs/PHASE1_VALIDATION.md`

## 9. Comportements à préserver explicitement

- Un bloc peut contenir plusieurs classes.
- Les classes d'un bloc peuvent partager les mêmes passages et le même draw.
- Les frais de juge peuvent être facturés une seule fois par cheval/cavalier/bloc selon la règle actuelle.
- Les résultats et payouts demeurent calculés par classe.
- Un bloc sans classe peut représenter un événement, une pause ou une cérémonie.
- Les paid warmups demeurent visibles dans l'horaire sans être confondus avec une classe ordinaire.
- Les blocs concurrents et leurs setups ShowScore demeurent possibles.
- Les classes NRHA utilisent leur code, leur type et leur admissibilité propres.
- Les dates limites et frais tardifs continuent d'alimenter la facture.
- Les templates créent un bloc et ses classes enfants dans une seule opération cohérente.

## 10. Nettoyages confirmés

- Supprimer `class_block_id`.
- Remplacer `is_event_block` par `blocks.block_type`.
- Supprimer `requires_coggins` et `requires_health_cert`.
- Supprimer `payment_method` du niveau bloc tant qu'aucun besoin produit n'est confirmé.
- Supprimer les fallbacks de frais, sanctions et admissibilité du bloc vers la classe.
- Supprimer `legacy_showscore_class_id` et `user_id` après adaptation du module ShowScore.
- Remplacer tous les noms de types, variables, fonctions et colonnes contenant `division`.
- Remplacer les codes de sanctionnement texte par des FK.

## 11. Décisions produit confirmées

1. Un bloc possède un seul pattern. Toutes les classes du bloc l'utilisent. Des blocs exécutés concurremment doivent également avoir le même pattern; une configuration incompatible est refusée.
2. Un warmup payant est un bloc de type `paid_warmup`, avec son comportement spécialisé.
3. Les réservations et les inscriptions ont des échéances distinctes. La politique générale appartient à l'association. Pour chaque concours, la fermeture des inscriptions peut être configurée pour le concours complet ou par bloc — normalement la veille à 18 h. La fermeture des réservations est indépendante et s'applique aux produits comme les boxes, tack rooms, ripe, foin et tapis. Les classes n'ont pas leur propre échéance.
4. La visibilité du bloc dans l'horaire, la visibilité/ouverture de la classe et la publication des résultats sont trois états séparés.
5. Les juges sont affectés au bloc. Les frais de juge et autres paramètres financiers demeurent sur les classes.

## 12. Critères de sortie F1

- Chaque colonne actuelle possède une destination ou une décision de suppression.
- Les quatre composants de templates sont inclus.
- Les fonctions SQL de facturation, draw, résultats et RLS sont recensées.
- Les dépendances ShowScore sont explicitement mappées vers `block_id` et `class_id`.
- Les comportements à préserver sont documentés.
- Les cinq décisions produit ont été tranchées et intégrées à la matrice.
- La matrice est approuvée avant toute migration destructive.

## 13. Consigne de revue Claude

> Examine `docs/BLOCK_CLASS_FIELD_INVENTORY.md` en lecture seule. Compare chaque matrice aux 76 migrations, aux types TypeScript, à `supabaseServices.ts` et aux composants listés. Cherche les colonnes oubliées, les responsabilités mal placées, les fonctions SQL non recensées, les comportements perdus et les noms hérités qui survivraient. Distingue les erreurs factuelles des extensions de portée facultatives. Ne modifie aucun fichier.
