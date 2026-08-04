# Préproduction HSP et ShowScore

## Décision

La production Supabase actuelle demeure inchangée jusqu'à ce que la refonte ait
réussi une répétition complète sur une base isolée. HorseShowPlatform est la
source canonique de toutes les migrations du schéma partagé. ShowScore ne pousse
plus de changement SQL directement sur ce projet.

## Environnements

| Environnement | Branche Git | HSP | ShowScore | Supabase |
| --- | --- | --- | --- | --- |
| Local | branche de travail | localhost | localhost | Supabase local |
| Préproduction | `staging` | URL Preview/Préprod HSP | URL Preview/Préprod ShowScore | projet PREPROD partagé |
| Production | `main` | domaines publics HSP | domaines publics ShowScore | projet PROD actuel |

Les deux applications d'un environnement doivent toujours pointer vers le même
projet Supabase. Elles ne partagent toutefois aucune base, aucun compte Auth,
aucun Storage ni aucun secret entre PREPROD et PROD.

## Garde-fous de compilation

Les quatre variables suivantes sont obligatoires sur tout déploiement en ligne :

```text
VITE_DEPLOY_ENV=staging|production
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
VITE_SUPABASE_PROJECT_REF=<project-ref courant>
VITE_PRODUCTION_SUPABASE_PROJECT_REF=<project-ref PROD>
```

La compilation échoue si :

- Vercel crée un Preview ou une Production sans `VITE_DEPLOY_ENV`;
- l'URL ne correspond pas à `VITE_SUPABASE_PROJECT_REF`;
- une préproduction pointe vers le projet PROD;
- une production pointe vers un autre projet que PROD.

Une bannière persistante identifie les environnements hors production, y
compris les pages publiques et les écrans TV.

## Règles de sécurité

1. Aucun `supabase db push`, script SQL ou Table Editor sur PROD pendant la
   remise à niveau.
2. Aucun secret PROD dans PREPROD : Stripe test seulement, envois de courriel
   désactivés ou limités, webhooks et Edge Functions séparés.
3. Aucun jeu de données réel dans la préproduction permanente. Utiliser le seed
   canonique et des comptes `example.test`.
4. Toute répétition créée depuis PROD est temporaire, privée, sans services
   sortants et anonymisée avant l'accès fonctionnel.
5. Les changements de schéma sont créés et révisés dans
   `supabase/migrations`; les scripts SQL manuels ShowScore doivent être
   réconciliés dans cette chaîne.
6. Le déploiement PROD exigera une approbation manuelle et une sauvegarde prise
   immédiatement avant la fenêtre de migration.

## État du schéma PREPROD

Le projet `Horse Show Platform PREPROD` (`qaguotdproxamgudnnsd`) a été
initialisé le 4 août 2026. Il contient le schéma uniquement, sans copie des
données de PROD.

L'historique canonique applique maintenant :

1. la base HSP `0001` à `0076`;
2. les trois migrations ShowScore datées du 26 au 30 juillet 2026;
3. le chantier HSP redaté du 1er août 2026, dans son ordre d'origine.

Le reset local complet, le dry-run, le déploiement PREPROD, la concordance de
l'historique distant et les tests SQL ciblés ShowScore/blocs/classes ont réussi.
L'API REST PREPROD répond et la table `blocks` est vide, comme attendu.

## Blocage maintenu pour PROD

Ne pas appliquer le chantier daté du 1er août 2026 à PROD. La migration
`20260801000200_blocks_classes_core_rebuild.sql` contient encore un
`truncate table public.organizations cascade`. Cette opération était acceptable
uniquement pour initialiser la PREPROD vide.

Avant le déploiement PROD, il faut :

1. remplacer la reconstruction destructive par une séquence création,
   backfill, validation et bascule qui conserve les données;
2. réinitialiser PREPROD depuis cette séquence finale et refaire les tests;
3. adapter ShowScore à `blocks`, `block_id`, `show_score_block_setups` et
   `block_result_publications`;
4. réussir la répétition sur une copie temporaire, privée et anonymisée de PROD.

## Validation avant production

La préproduction doit valider au minimum :

- création d'association, utilisateurs et rôles;
- programme bloc/classe et inscriptions partagées;
- warmups payants;
- setup, draw, juge, scribe et annonceur;
- realtime public, écrans TV et OBS;
- scoresheets et Storage;
- publication des résultats et championnats;
- contrôles RLS inter-associations;
- comparaison des comptes et relations avant/après sur une répétition de la
  migration.

Le robot Playwright décrit dans [E2E_TEST_ROBOT.md](E2E_TEST_ROBOT.md) fournit
le smoke test à appeler après déploiement et automatise le jeu de données variées nocturne. Il doit
être vert en mode `mega` avant toute répétition finale vers PROD.

La production ne reçoit aucune migration tant que tous ces contrôles ne sont
pas verts et que les deux applications de préproduction n'utilisent pas le même
commit de contrat.
