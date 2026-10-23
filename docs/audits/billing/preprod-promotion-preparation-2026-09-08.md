# Préparation de la promotion HSP vers PREPROD — 8 septembre 2026

Statut : audit documentaire uniquement. **La branche n'est pas encore déployable telle quelle pour les services de facturation PREPROD.** Le site est accessible ; les endpoints de paiement et de documents ainsi que les workers restent conçus pour la pile locale.

Complément de la même soirée : [faisabilité Vercel + Supabase, limites, coûts et essais requis](preprod-vercel-supabase-feasibility-2026-09-08.md). Ce complément ajoute des lectures HTTP anonymes : PREPROD redirige vers l'authentification Vercel ; l'accès confirmé par le propriétaire ne vaut pas accès machine. Le périmètre des vérifications ci-dessous décrit la première séance d'audit.

Reprise autorisée des adaptations : [candidat hébergé, validations locales et prérequis de publication](preprod-hosted-candidate-2026-09-08.md).

## Références de reprise

- Worktree persistant : `/workspaces/HorseShowPlatform/.worktrees/billing-hsp-direct`.
- Branche : `feat/billing-hsp-direct-prototype`.
- Code audité et distant vérifié : `8496ff65662f98c9c24338c47800c39dacc5d1a6`.
- Branche distante `preprod`, lue le 8 septembre : `6ca720bbea4317d8644d30b05f628bc45a516241`.
- PREPROD : **https://preprod.horseshowplatform.com**, associé à la branche `preprod` ; adresse, association et accès fonctionnel confirmés par le propriétaire pendant cet audit. Aucun test HTTP ou parcours applicatif distant exécuté aujourd'hui.
- Dernière validation fonctionnelle locale : [rapport du rendu V5 et exemples](review-render-v5/README.md). [Historique du prototype](hsp-direct-prototype-validation.md).

Le commit documentaire contenant ce rapport sera poussé uniquement sur la branche de travail. Son SHA sera communiqué après vérification distante ; le SHA de code ci-dessus reste la référence de l'audit.

## Travail effectué et limites

Lecture des différences Git, des migrations, des serveurs et des scripts, des noms de variables locales, des workflows et de la configuration Vercel/Vite. Lecture des conteneurs, des volumes, de l'historique de migrations local et des métadonnées du bucket local. Un fetch de `preprod` et une lecture des références distantes ont actualisé la comparaison locale.

**Aucune adaptation de code, résolution de conflit, migration, création de compte Stripe, relance de service ou modification PREPROD/PROD n'a été entreprise aujourd'hui.** Seul ce rapport est ajouté. Aucun secret n'a été affiché ou copié dans Git. Aucun workflow de déploiement ou de test distant n'a été déclenché manuellement.

Les paramètres des consoles Stripe, Supabase, Vercel et GitHub n'ont pas été certifiés. L'accès au site confirmé par le propriétaire ne prouve pas encore le fonctionnement de la facturation, des webhooks ou du worker PDF. Les constats sur ces composants proviennent du code, sauf indication explicite de vérification locale.

## Écart avec preprod

`preprod` est un ancêtre direct du code audité : **0 commit propre à preprod, 31 commits propres à la branche HSP**. Aucun conflit de divergence n'est à résoudre à cette référence ; refaire la comparaison avant toute intégration demain.

Le diff comprend 294 fichiers, 13 905 insertions et 56 suppressions, dont de nombreuses pièces de revue. Il introduit notamment les écrans et contrats de facturation, les services locaux Stripe/PDF, les migrations et les tests. `package-lock.json` et les dépendances de `package.json` sont inchangés ; deux commandes de tests SQL/reconstruction sont ajoutées. Les routes `api/`, `vercel.json` et les workflows n'ont pas reçu l'intégration des services billing.

Le contrôle réellement exécuté `node scripts/verify-production-migrations.mjs 6ca720bbea4317d8644d30b05f628bc45a516241 HEAD` réussit : douze nouvelles migrations, historique existant immuable, aucun `TRUNCATE TABLE`. C'est une vérification statique ; ce n'est ni une répétition de migration sur clone PREPROD ni une preuve de compatibilité avec son schéma réel.

## Migrations à préparer, dans l'ordre existant

Toutes se trouvent dans `supabase/migrations/` et sont nouvelles par rapport au SHA preprod audité.

| Migration | Portée et point de vigilance |
| --- | --- |
| `20260906000900_billing_folio_foundation.sql` | Contextes, comptes, frais, paiements, affectations, pièces immuables, outbox, RLS. Garde contre les écritures des anciens parcours dans un contexte adopté. Vérifier les tables `billing_%` déjà présentes sur la cible avant installation des protections. |
| `20260906001000_billing_checkout_server.sql` | Permissions, capacités, fermeture et contrats serveur. L'installation du schéma ne remplace pas une activation contrôlée des concours. |
| `20260906001100_billing_stripe_test.sql` | Configuration sandbox, tentatives et événements durables, idempotence. |
| `20260906001200_billing_ui_contracts.sql` | Contrats de détail de compte et actions permises. |
| `20260906001300_billing_document_pdf.sql` | Présentation figée, bucket privé et artefacts PDF, RPC de worker et de téléchargement. |
| `20260907000100_billing_hsp_prototype.sql` | Politiques HSP du prototype, ajout unique et commandes associées ; conserver les décisions validées. |
| `20260907000200_billing_hsp_direct.sql` | Direct charges, récupération HSP et anomalies fournisseur. |
| `20260907000300_billing_hsp_reporting.sql` | Rapports d'encaissement et rapprochement ; ne pas en déduire de nouvelles règles de remise ou de remboursement. |
| `20260907000400_billing_document_render_v2.sql` | Version de rendu prospective et détail des reçus. |
| `20260907000500_billing_document_render_v3.sql` | Version prospective de pagination. |
| `20260907000600_billing_entry_identity_v4.sql` | Identités métier figées, dossards/blocs/classes et rendu V4 ; pas de reprise automatique des inscriptions historiques. |
| `20260907000700_billing_document_render_v5.sql` | Nouveau rendu V5 et maintien des totaux avec leurs détails ; nouveaux instantanés uniquement. |

La base locale contient effectivement ces douze versions. **L'historique de la base PREPROD reste à inventorier** : la branche Git ne fournit pas son état de déploiement SQL. Comparer versions et contenu, extensions, rôles, fonctions, triggers et politiques Storage avant de calculer la liste réellement manquante. Ne pas renuméroter ni réécrire les anciennes migrations.

L'adoption d'un concours déjà alimenté par les anciens parcours peut être refusée par `BILLING_LEGACY_RECONCILIATION_REQUIRED`. Prévoir un nouveau concours fictif contrôlé pour la qualification ; toute reprise de données existantes demanderait un chantier distinct. Ne pas contourner le garde ni activer en masse les concours. Préserver un compte par payeur et concours, plusieurs paiements, une facture finale unique et une récupération HSP unique.

## Blocages de déploiement et configuration à préparer

### Routes et exécution serveur

`src/services/billingFolio.ts` appelle `/__local-billing/payment`. `DocumentPdf.tsx` appelle `/__local-billing-documents/{status,retry,download}`. Ces chemins dépendent des proxies Vite activés uniquement en environnement local. Le build statique ne les fournit pas. `vercel.json` configure actuellement le serveur vétérinaire, pas les endpoints billing.

`server/billing/local-server.mjs` et `document-server.mjs` n'acceptent que des origines/URL Supabase locales et écoutent sur localhost. **Changer les variables ne suffit pas** : demain, préparer des points d'entrée déployables, les routes front correspondantes et des contrôles explicites de cible PREPROD, d'origine, de JWT et de permissions. Ne pas simplement supprimer les gardes locaux.

Le traitement des événements Stripe repose sur un drain périodique de 15 secondes et un lancement après réponse HTTP ; le worker PDF est appelé toutes les 5 secondes dans le processus local. Choisir l'hébergement de processus persistants, ou concevoir un déclenchement planifié/authentifié adapté au serveur sans état. Une réponse webhook réussie ne garantit pas l'achèvement d'un travail lancé après réponse sur un hébergement serverless.

### Variables et séparation des secrets

| Composant | Variables existantes à renseigner dans le bon périmètre |
| --- | --- |
| Front | `VITE_DEPLOY_ENV=staging`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_REF`, `VITE_PRODUCTION_SUPABASE_PROJECT_REF`. Vérifier que la référence PREPROD diffère de PROD ; ne pas activer `VITE_VET_LOCAL_PROXY`. |
| Paiements serveur | `BILLING_SUPABASE_URL`, `BILLING_WEB_ORIGIN`, `BILLING_SUPABASE_ANON_KEY`, `BILLING_SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Adapter d'abord le serveur aux URL distantes. |
| Documents serveur | `BILLING_PDF_SUPABASE_URL`, `BILLING_PDF_WEB_ORIGIN`, `BILLING_PDF_SUPABASE_ANON_KEY`, `BILLING_PDF_SUPABASE_SERVICE_ROLE_KEY`. Adapter d'abord le serveur et son déclenchement. |

L'origine web attendue pour ces adaptations est `https://preprod.horseshowplatform.com`. Les URL des futurs endpoints restent à décider et ne sont pas réputées disponibles. Garder les clés secrètes Stripe, service-role et secrets de signature exclusivement côté serveur, dans le gestionnaire de secrets. Ne pas recopier les clés Supabase locales dans PREPROD. Le garde Vite connaît `staging`, pas un nouveau libellé inventé `preprod`.

### Stripe sandbox et webhooks

Le code exige des clés de test et rejette les événements live. Les appels REST fixent `Stripe-Version: 2024-06-20`. La configuration SQL doit correspondre à la plateforme et au compte connecté existants. Le mode direct attend notamment `controller.fees.payer=account` et `controller.losses.payments=stripe` ; vérifier également les capacités d'encaissement et exigences de ce compte dans la sandbox choisie. **Aucun compte n'est à recréer pour la promotion par défaut.** Aucun statut actuel Stripe n'a été relu aujourd'hui.

Le lanceur HSP `scripts/billing/hsp-listener-local.mjs` transmet les événements plateforme et Connect vers le même endpoint local, avec les événements PaymentIntent, remboursement, litige et frais d'application. Il compare le secret annoncé par la CLI à celui de l'environnement et masque les valeurs. Les journaux persistants contiennent le marqueur de concordance ; ce constat historique ne remplace pas un contrôle d'un listener actif. L'ancien lanceur `pilot-listener-local.mjs` ne couvre pas tous ces événements : ne pas le prendre comme référence de promotion.

Pour PREPROD, préparer une URL HTTPS joignable par Stripe, avec vérification de signature sur le corps brut, tolérance temporelle, rejouabilité et stockage durable avant traitement. Couvrir les événements des comptes connectés **et** ceux de la plateforme : les frais d'application plateforme ne suivent pas le même routage que les paiements Connect. Événements explicitement couverts par le lanceur HSP :

- `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.requires_action`, `payment_intent.amount_capturable_updated` ;
- `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated` ;
- `application_fee.created`, `application_fee.refunded`.

Le secret CLI n'est pas à présumer identique au secret d'un endpoint Dashboard. Le serveur actuel utilise un secret unique ; si deux destinations sont nécessaires, prévoir explicitement leurs secrets et routages. Vérifier les versions d'événements et la protection d'accès du déploiement : l'accès humain fonctionnel au site ne garantit pas que Stripe peut atteindre le webhook. Ne pas désactiver globalement la protection sans décision sur la route dédiée. Qualifier doublons, désordre, redémarrage, reprise du backlog, signature invalide et absence de seconde récupération HSP.

L'utilitaire `onboarding-local.mjs` est lié à Codespaces, au port 54333 et à un compte sandbox existant ; il ne constitue pas une intégration PREPROD prête. Décider si l'intervention via Dashboard suffit pour cette qualification avant d'étendre cet utilitaire. Aucune acceptation de conditions ni modification de compte effectuée aujourd'hui.

### Worker PDF et Storage

Le worker utilise Chromium/Playwright, les fichiers de rendu historiques 1 à 5 et `public/branding/hsp-logo-aubergine.svg`. Les dépendances existent déjà, mais leur présence dans le bundle serveur billing reste à organiser : la règle Vercel d'inclusion Chromium et la durée configurée visent actuellement `api/vet.js`. Vérifier version Node, binaire Chromium, mémoire, durée, fichiers embarqués et espace d'exécution sur l'hébergement retenu. Local : Node 24.14.0 ; CI : Node 22. La compatibilité déployée n'a pas été testée aujourd'hui.

Le worker réclame un travail avec un bail de 300 secondes, produit FR et EN, téléverse sans écrasement, puis enregistre les empreintes SHA-256 et tailles. Les erreurs sont remises en attente avec délai de 60 secondes. Préserver les contrôles de bail, l'idempotence et la complétion des deux langues ; tester concurrence et reprise après interruption dans l'environnement retenu.

Bucket prévu et vérifié **localement** : `billing-pdfs`, privé, limite de 20 971 520 octets, MIME PDF prévu par migration. Chemin incluant organisation, document, jeton de claim et langue ; `upsert:false`. Les RPC de téléchargement vérifient les permissions et les artefacts sont contrôlés par empreinte. Aucun accès public au bucket à introduire.

Avant migration distante, inventorier le bucket cible, ses politiques et objets existants ; prévoir une sauvegarde cohérente base **et fichiers Storage**. Un dump PostgreSQL ne sauvegarde pas les octets des PDF. Ne pas régénérer ou écraser les documents émis pour les adapter au rendu V5 ; conserver instantanés, montants, taxes, affectations et fichiers historiques.

## CI et effets d'une future promotion

Le workflow de validation utilise Node 22 et les contrôles existants, mais n'intègre pas encore les suites billing spécifiques. Préparer demain les contrôles pertinents et une répétition de migration sur clone isolé avant intégration.

`preprod-e2e.yml` s'exécute notamment lors d'un push sur `preprod`, quotidiennement et sur demande ; il définit **`E2E_ALLOW_WRITES=true`**. Un futur push sur cette branche peut donc provoquer des écritures de tests distantes. Coordonner son calendrier, ses données fictives et ses autorisations avant promotion. Aucun push sur `preprod` aujourd'hui.

Variables de ce workflow à faire vérifier : `PREPROD_HSP_URL` (nouvelle adresse confirmée), `PREPROD_SHOWSCORE_URL`, `PREPROD_SUPABASE_PROJECT_REF`, `PREPROD_SUPABASE_URL`, `PRODUCTION_SUPABASE_PROJECT_REF`. Secrets : `PREPROD_SUPABASE_PUBLISHABLE_KEY`, `PREPROD_SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`. Leur présence et leur valeur dans GitHub n'ont pas été contrôlées. Confirmer également les règles de déploiement effectives et les contrôles requis de PR.

## Plan ordonné pour demain

| Ordre | Travail et responsable | Condition de passage |
| --- | --- | --- |
| 1 | Agent : relire ce rapport, vérifier Git et les services locaux, préserver l'état ; propriétaire : confirmer la cible Supabase et les accès de lecture aux consoles. | SHA distants actualisés, aucune confusion PREPROD/PROD, inventaire réel des migrations et du Storage cible. |
| 2 | Propriétaire : choisir l'hébergement des endpoints et workers, confirmer comptes Stripe sandbox existants, domaines et gestion des secrets. Agent : préciser le contrat de déploiement et les routes. | Choix explicite du mécanisme de drain Stripe/PDF et du périmètre des webhooks ; pas seulement des variables ajoutées à un build statique. |
| 3 | Agent, après reprise de l'implémentation : adapter routes, gardes PREPROD, déclenchements et packaging ; compléter les tests/CI appropriés. | Revue des adaptations, tests ciblés, aucun changement de calcul ni d'historique documentaire. |
| 4 | Agent : répéter les douze migrations manquantes selon inventaire sur un clone isolé sauvegardé, puis tester RLS, permissions et compatibilité des anciens parcours. | Aucune réécriture historique ; stratégie de restauration base + Storage documentée ; activation limitée à un concours fictif admissible. |
| 5 | Propriétaire : valider la fenêtre et autoriser les écritures PREPROD, les secrets/endpoints Stripe et les effets des workflows. Agent : préparer la promotion concrète pour revue. | Aucune opération distante avant cette reprise autorisée ; pas de PROD. |
| 6 | Dans la fenêtre validée : sauvegarder, appliquer les seules migrations requises, installer/configurer les services et workers, puis activer le contexte fictif et le front coordonnés. | API, base, bucket et worker prêts avant ouverture des actions de facturation ; services sains et webhook vérifié sans exposer le secret. |
| 7 | Qualifier réellement PREPROD avec de nouvelles pièces fictives et paiements sandbox, puis publier preuves et SHA déployé. | Plusieurs paiements, facture finale unique, compte fermé encore payable selon permissions, solde nul masqué, frais HSP une fois, doublons webhook, PDF FR/EN et captures mobile/ordinateur, anciennes pièces inchangées. |

En cas d'échec après activation, suspendre les nouvelles actions du contexte concerné et diagnostiquer les traitements durables. Un simple retour du front à un ancien commit ne restaure pas un registre financier ; ne pas supprimer les tables, événements, paiements ou objets PDF pour revenir en arrière. La restauration éventuelle doit tenir compte des événements Stripe déjà reçus et des traitements en cours.

Les interventions du propriétaire portent donc sur l'identification du projet Supabase, le choix d'hébergement, l'accès aux secrets dans les consoles, la vérification des comptes sandbox et des destinations webhook, puis l'autorisation d'une fenêtre de migration/déploiement avec écritures fictives. Aucun secret ne doit être transmis dans la conversation.

## Preuves et état conservé pour fermer Codespaces

Vérifications exécutées aujourd'hui : comparaison Git distante, contrôle statique des migrations réussi, lecture des douze versions dans la base locale, bucket local privé et volumes locaux présents. Aucun nouveau test de paiement ou de rendu n'a été exécuté. Les résultats du rapport V5 sont ceux de la séance précédente : ils distinguent les tests simulés, les contrôles SQL sur clone et les documents/captures produits sur la pile fictive locale ; **ce ne sont pas des validations PREPROD**.

La pile Supabase locale est active lors de l'audit. Volumes nommés : `supabase_db_hsp-vet-local` (`/var/lib/postgresql/data`) et `supabase_storage_hsp-vet-local` (`/var/lib/storage`). Les PID enregistrés dans `.tmp/hsp-direct/runtime-processes.json` ne sont plus actifs ; ne pas réutiliser aveuglément ces PID. Aucun service applicatif n'a été relancé aujourd'hui.

À préserver dans le workspace :

- Worktree HSP et son `.tmp/`, notamment les états des revues V3/V4/V5 et les accès fictifs privés ; ne pas ajouter ces fichiers privés à Git.
- Worktree voisin `billing-pilot`, dont `.env.billing.local`, `.env.billing-pdf.local` et l'installation/configuration CLI Stripe sont des dépendances locales. `.env.local` du worktree HSP est un lien symbolique ; conserver sa cible.
- Fichiers d'onboarding et journaux privés existants ; conserver leur caractère local.
- Dossier `branding/` non suivi du dépôt principal : laissé intact. Aucun SVG ni configuration Stripe modifié. Les autres worktrees ont été laissés en place, y compris la référence ancienne prunable ; aucun nettoyage Git effectué.

Des dumps persistants préexistants sont présents, dont `.tmp/review-v5/before-render-v5.dump`. **Ce dump précède les dernières pièces V5 ; ce n'est pas une sauvegarde complète de l'état courant et il n'inclut pas les fichiers Storage.** Aucun nouvel export complet n'a été effectué dans cette séance documentaire. Le push sauvegarde les fichiers suivis, pas les secrets, fichiers ignorés ou volumes Docker. Conserver le Codespace et ses volumes pour la reprise ; ne pas supprimer/recréer le Codespace ni utiliser `docker volume prune`, `supabase db reset` ou les scripts de reconstruction. Si une suppression est envisagée, faire d'abord une sauvegarde privée cohérente base + Storage + configuration.

**Prochaine étape :** reprendre dans ce worktree sur la branche de travail, actualiser l'inventaire PREPROD et arrêter le choix d'hébergement des services/worker ; ensuite seulement commencer les adaptations autorisées demain. Aucune fusion ni migration distante préparatoire n'a été exécutée aujourd'hui.
