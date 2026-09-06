# Tranche 1C — PDF et worker documentaire : reconstruction et validation

Date : 6 septembre 2026. Branche : `feat/billing-document-pdf-worker`.
Base approuvée : `ddf30ee98d048b8bacce426e9f32127e4ec1c64e`.
Code reconstruit sauvegardé : `3db3d6ec0ede5e14d747eeb72f2e459a86406128`.
Worktree persistant : `/workspaces/HorseShowPlatform/.worktrees/billing-1c`.

**Reconstruction et validations locales terminées; qualification intégrée persistante encore incomplète.** Ce rapport concerne exclusivement le code reconstruit et les exécutions de cette session. Il ne reprend aucun résultat de la copie perdue dans `/tmp`. Le transport HTTP Supabase Storage et Stripe test ne sont pas qualifiés sur la pile persistante.

## Récupération et sauvegardes

Recherche bornée, avant toute suppression : `git stash list`, `git fsck --full --no-reflogs --unreachable`, inspection ciblée des blobs/arbres pour les signatures 1C et de l'historique local VS Code. Aucun stash; 163 blobs, 97 arbres et 37 commits non référencés, sans signature 1C; l'unique historique d'éditeur retrouvé concerne les paramètres. Aucun objet ni référence nettoyé. Le worktree a été créé avec `git worktree add --force` dans le projet persistant.

Sauvegardes autorisées, uniquement sur la branche 1C :

- `9d3cbac` : migration additive, moteur de rendu, worker et serveur local;
- `a410fba` : consultation/téléchargement et tests exécutables;
- `3db3d6e` : correctifs de l'adaptateur de test, présentation et conservation des instantanés.

Aucune fusion, PR, migration distante, configuration de secret ou modification de PREPROD/PROD. Les pushes Git de sauvegarde constituent les seules écritures distantes effectuées.

## Périmètre du diff

Une migration nouvelle : `supabase/migrations/20260906001300_billing_document_pdf.sql`. Aucune migration antérieure modifiée, aucun historique réécrit, aucune activation d'association.

Serveur : `server/billing/pdf.mjs`, `document-worker.mjs`, `document-server.mjs`.
Interface commune : `src/features/finance/DocumentPdf.tsx`, adaptation de `DocumentView.tsx` et passage explicite du périmètre personnel dans `AccountDetail.tsx`.
Configuration applicative : ajout du seul proxy documentaire local dans `vite.config.ts`, avant le préfixe Stripe existant. Aucun fichier de configuration Stripe ni secret modifié.
Tests : `supabase/tests/billing_document_pdf.sql`, `scripts/billing/pdf-fixtures.mjs`, `pdf-render.test.mjs`, `pdf-worker.test.mjs`, `pdf-integration.mjs`, adaptations de `test-sql-local.mjs` et `finance-browser.mjs`.
Rapport : le présent fichier. Les contrats approuvés restent inchangés.

Les trois SVG non suivis restent dans le worktree principal, intacts et exclus des commits. Le renderer lit seulement le logo déjà suivi dans `public/branding/`. PDF, PNG, ZIP, résultats machine, journaux et patch restent sous `.tmp/`, ignoré par Git dans le worktree persistant. Aucun artefact temporaire suivi.

## Données structurées et pièces immuables

La table append-only `billing_charge_presentation` associe à chaque nouveau frais documenté une présentation explicite, sans parser une description :

- `section` : `entry`, `reservation`, `other`;
- inscriptions : cheval déjà porté par le frais, `block_id`, `occurrence_id`, `block_label`, `class_id`, `class_label`, `fee_kind` (`entry`, `judge_class`, `judge_block`);
- réservations : `reservation_id`, période/durée facultatives;
- autres achats : désignation, quantité et montants enregistrés du frais.

`add_documented_billing_sale` est une enveloppe transactionnelle de la commande 1A existante : mêmes permissions, verrous, prix du contexte, fiscalité et idempotence. Elle refuse les champs de présentation inconnus, les structures incomplètes et une reprise à métadonnées différentes. Elle ne permet pas d'ajouter ces données à un frais déjà inclus dans une pièce émise. Pas d'interface de saisie de métadonnées métier dans ce lot; les futurs adaptateurs d'inscription/réservation les fourniront.

`billing_snapshot` conserve la projection publique de 1A.6 et y ajoute la présentation disponible par frais. Sans métadonnées, la ligne conserve exactement son contenu précédent et est rendue dans les achats/services, sans regroupement inventé. Les documents déjà produits ne sont jamais enrichis rétroactivement. Bénéficiaires, chevaux, année, coordonnées et taxes viennent exclusivement de l'instantané du document remis au worker.

Les frais ne sont ni tarifés ni recalculés par le PDF. Les additions utilisent les montants décimaux enregistrés, convertis en cents contrôlés : cohérence ligne/taxes/compte/paiements/solde exigée. Aucun taux fiscal historique n'est reconstitué. Un montant incohérent fait échouer le rendu, sans modifier la pièce.

## Rendu des trois documents

- Relevé du compte : date UTC explicite, numéro du compte, aucun numéro de facture.
- Reçu de paiement : numéro du reçu, paiement précis, montant, moyen, référence, date et affectations; cohérence des affectations contrôlée.
- Facture finale : numéro unique déjà attribué à la fermeture, frais et coordonnées figés. Un encaissement ultérieur produit un autre reçu sans changer cette facture.

Les inscriptions sont groupées par `(cheval, bloc, occurrence)` : deux chevaux au même bloc restent distincts, de même que deux occurrences pour un même cheval. Frais de juges par classe dans leur colonne; frais de juges uniques au bloc sur leur ligne, une seule fois. Les totaux de bloc et sous-totaux de section sont purement visuels et ne s'ajoutent jamais de nouveau aux frais.

Réservations et achats partagent colonnes monétaires alignées, désignation, quantité, prix unitaire et montant avant taxes. Le détail des taxes ou la raison d'exemption reste visible. Le récapitulatif donne frais avant taxes, chaque taxe, total des taxes, total du compte, paiements reçus et solde à la date du document.

FR/EN, A4, identité HSP aubergine, coordonnées association/payeur et entreprise facultative. Chaque page porte **DÉMONSTRATION — sans valeur comptable ou fiscale**; anglais accompagné de sa traduction. Les noms/libellés métier enregistrés ne sont pas traduits ou inventés par le moteur.

Pagination Chromium explicite : en-tête et colonnes répétés, aucun titre de groupe sans ligne, continuation identifiée, total de bloc unique. Une ligne seule trop haute provoque un échec explicite plutôt qu'un contenu tronqué. Les dates sont affichées en UTC, sans deviner un fuseau absent des instantanés.

Le navigateur réutilise `server/vet/serverless-browser.mjs` sans modifier le worker vétérinaire. Ressources externes bloquées, aucune donnée réseau nécessaire au rendu, valeurs échappées/insérées en texte. Le PDF ne lit ni contacts ni chevaux ni coordonnées courantes.

## Worker, stockage et permissions

Le worker utilise `billing_claim_document` et ses baux de 300 secondes, son `SKIP LOCKED`, puis `billing_finish_document` et le journal existants. Scrutation locale toutes les cinq secondes; reprise après échec avec délai de 60 secondes. Une reprise manuelle autorisée respecte ce délai et les baux, sans réémettre le document.

`billing_pdf_source` ne remet l'instantané expurgé qu'au worker possédant le jeton encore valide. FR et EN sont rendus puis téléversés dans le bucket privé `billing-pdfs`, sans upsert, sous `association/document/jeton/langue.pdf`. `billing_pdf_complete` publie atomiquement les deux manifestes (chemin, SHA-256, taille) et termine le job sous verrou. Un ancien worker ne peut pas publier avec un bail périmé. Une réponse de fin perdue n'entraîne ni nouveau numéro ni nouvelle pièce.

`billing_pdf_artifacts` est immuable, RLS activée, sans lecture/écriture directe pour le navigateur. Une policy restrictive bloque l'accès direct aux objets de ce bucket, même en présence de policies permissives générales. Les nouvelles fonctions ont un `search_path` fixé et des droits d'exécution explicitement révoqués puis accordés au rôle prévu.

`billing_pdf_status(document, personal)` vérifie le périmètre administratif ou l'identité réelle du payeur; un administrateur dans Mes comptes ne reçoit aucun privilège administratif implicite. Elle ne révèle ni chemin privé, ni journal, ni erreur interne. Les fonctions source/manifeste/fichier sont réservées à `service_role`.

Le téléchargement passe par le serveur : session vérifiée, droits contrôlés avant accès au stockage puis à nouveau après lecture, taille/empreinte vérifiées, réponse privée `no-store`. Aucune URL publique ou URL signée durable. Les états de l'interface proviennent de l'outbox : attente, traitement, échec, disponible; serveur inaccessible présenté comme indisponible. Une ancienne sortie sans manifeste PDF est explicitement indisponible.

Une panne après upload partiel peut laisser un objet privé orphelin. Il n'est jamais publié; sa purge et la politique de rétention sont à définir séparément. Le worker ne supprime aucun objet automatiquement. La clé de service demeure strictement côté serveur.

## Commandes et résultats de cette reconstruction

Toutes les commandes exécutées depuis le worktree persistant. Les lanceurs SQL refusent arguments de connexion distante et Docker non local; leurs bases/volumes jetables sont supprimés par le lanceur, jamais la base de développement. Les répertoires temporaires du bootstrap Supabase ne contiennent pas le travail source.

| Commande | Exécution | Résultat |
| --- | --- | --- |
| `node scripts/billing/test-sql-local.mjs` | Copie de la base locale, migrations additives, suites 1A/1A.6/Stripe SQL, réservations et nominations legacy, sessions concurrentes | 219 assertions, 96 rejets attendus, 32 contrôles du lanceur; `complete=true` |
| `node scripts/billing/test-sql-local.mjs --fresh` | Bootstrap système Supabase, toutes migrations triées, seed, mêmes suites | 147 migrations + seed; 219 assertions, 96 rejets attendus, 33 contrôles du lanceur; `complete=true` |
| `node scripts/billing/pdf-worker.test.mjs` | RPC/stockage simulés | 5 tests réussis |
| `node scripts/billing/pdf-render.test.mjs` | Chromium et lecture/rastérisation pdfjs réels | 76 contrôles réussis, 6 PDF |
| `node scripts/billing/recovery.test.mjs` | Reprises applicatives simulées | 46 tests réussis |
| `node scripts/billing/stripe-service.test.mjs` | Fournisseur Stripe simulé | 20 tests réussis, aucun appel Stripe réel |
| `node scripts/billing/navigation.test.mjs` | Contrats de navigation | 15 tests réussis |
| `node scripts/billing/finance-browser.mjs` | React/Chromium réels, RPC/Stripe/API documentaire simulés, téléchargement de vrais octets PDF | 22 parcours réussis; `complete=true` |
| `npm run build` | TypeScript et Vite | Réussi; avertissements de taille de chunks et import vétérinaire statique/dynamique |
| `node --check` sur les 9 fichiers `.mjs` ajoutés/modifiés; `git diff --check` | Syntaxe et whitespace | Réussis |

Le complément SQL documentaire ajoute **19 assertions et 9 rejets attendus** aux **200 assertions et 87 rejets attendus** de la base. Le lanceur ajoute cinq contrôles intégrés hors de ce compteur : panne réelle du renderer, deux sessions worker réellement concurrentes, stabilité du nombre de pièces, téléchargement hash-vérifié par le payeur réel, refus d'un non-payeur réel. L'adaptateur de stockage de ces cinq contrôles utilise des fichiers locaux privés; il ne valide pas le transport HTTP Supabase Storage.

Les tests protègent notamment : reprise exacte et conflit de présentation, absence de numéro de facture sur le relevé, données cheval/occurrence, contrôle d'accès réel, bucket privé, lecture directe interdite, bail unique, double completion idempotente, deux manifestes uniques, journal d'échec, immutabilité des manifestes et des trois pièces après modification des sources, paiement après clôture et nouvelle réception sans réécriture de facture.

Le premier essai intégré a échoué à cause du validateur de chemins de l'adaptateur de test, qui rejetait `fr.pdf`; corrigé puis rejoué. Le premier parcours navigateur a expiré pendant l'optimisation initiale Vite; un rejeu avec cache initialisé a réussi. Ces exécutions partielles ne sont pas présentées comme des validations complètes. Les résultats machine finaux portent leur propre `complete` et `failure`.

## PDF et captures pour revue visuelle

Fichiers sous `.tmp/billing-pdf/`, exclus du commit, dans le worktree persistant :

| Pièce | FR | EN | Pages par langue |
| --- | --- | --- | --- |
| Relevé du compte | `statement-fr.pdf` | `statement-en.pdf` | 2 |
| Reçu de paiement | `receipt-fr.pdf` | `receipt-en.pdf` | 2 |
| Facture finale mixte | `invoice-fr.pdf` | `invoice-en.pdf` | 3 |

Archive : `.tmp/billing-pdf/hsp-1c-six-pdf.zip`. Diff complet depuis la base : `.tmp/billing-tests/review.patch`. Empreintes et résultats PDF : `.tmp/billing-pdf/results.json` et `SHA256SUMS`.

Les exemples sont entièrement fictifs. La facture longue contient deux chevaux, trois groupes distincts du bloc 12, un bloc long de 38 classes, stalle simulée, camping, achat et service gratuit. Frais avant taxes : 1 400,00 CAD; taxe fictive : 70,00; total : 1 470,00; paiement fictif : 50,00; solde : 1 420,00. Cette facture illustre une fermeture par le personnel avec solde dû permise par le socle, pas une dérogation au checkout autonome à zéro.

Rastérisations : `invoice-fr-1.png`, `invoice-fr-2.png`, `invoice-en-3.png`, `receipt-fr-1.png`, ainsi que premières/dernières pages de chaque langue/type. Inspection visuelle des colonnes, identités, continuation, totaux et mentions fictives. Capture mobile : `.tmp/billing-ui/pdf-mobile.png`; captures de l'administration, du payeur et du menu contextuel dans ce même dossier.

## Ouvrir et qualifier localement

Les six fichiers PDF peuvent être ouverts directement, sans clé Stripe ni serveur. Pour régénérer les exemples : `node scripts/billing/pdf-render.test.mjs`. Pour revoir les parcours automatisés : `node scripts/billing/finance-browser.mjs`.

Le raccordement HTTP complet exige une pile **locale isolée** portant la migration 1C et ses fixtures; il n'a pas été appliqué à la pile persistante en cours de configuration Stripe. Aucun reset de cette pile n'est autorisé par ce rapport.

Variables du serveur documentaire, dans un fichier local ignoré tel que `.env.billing-pdf.local`, à renseigner ultérieurement sans les committer :

| Variable | Rôle |
| --- | --- |
| `BILLING_PDF_SUPABASE_URL` | URL HTTP loopback, défaut `http://127.0.0.1:54321` |
| `BILLING_PDF_SUPABASE_ANON_KEY` | Clé publique locale pour le client portant le JWT de session |
| `BILLING_PDF_SUPABASE_SERVICE_ROLE_KEY` | Secret serveur local pour outbox et stockage; jamais variable `VITE_*` |
| `BILLING_PDF_WEB_ORIGIN` | Origine autorisée, défaut `http://127.0.0.1:5173` |

Démarrage futur : `node --env-file=.env.billing-pdf.local server/billing/document-server.mjs` (écoute loopback 54332). Interface : `npm run dev -- --port 5174` pour ne pas occuper le port Stripe en cours d'utilisation. Le proxy Vite existant exige `VITE_DEPLOY_ENV=local`, `VITE_VET_LOCAL_PROXY=true`, `VITE_SUPABASE_URL=http://127.0.0.1:54321` et une clé publique locale; il traduit l'origine même site vers 5173 pour le serveur local. Aucun de ces fichiers de configuration n'a été créé ou modifié ici.

Finance, Comptes du concours et Mes comptes utilisent le même détail et le même composant PDF. Sélectionner une pièce existante, consulter son état, reprendre un rendu échoué lorsque le délai le permet, puis consulter/télécharger FR ou EN. Ne pas créer une nouvelle facture pour obtenir un fichier.

## Limites et prochaine qualification

- **Supabase Storage HTTP non qualifié sur la pile persistante** : SDK d'upload/download branché; schéma/RLS testés sur PostgreSQL réel; transport remplacé par mocks ou fichiers privés dans les tests exécutés.
- **Stripe test non qualifié réellement ici** : aucune clé configurée, aucun PaymentIntent ni webhook réel lancé, aucun argent réel. Les suites Stripe citées sont simulées ou SQL locales.
- HTTP documentaire complet, JWT Supabase + Storage + UI en continu restent à qualifier ensemble dans l'environnement isolé approuvé. Ce rapport n'autorise aucun déploiement.
- Raccordement aux vraies inscriptions/réservations distinct du lot documentaire. Les références de groupes de ces exemples sont fictives et ne confirment aucun service réel.
- Purge des uploads orphelins, observabilité opérationnelle, stratégie de rétention, déploiement du worker et volumes importants restent à préparer. Les erreurs publiques ne contiennent pas de détails internes.
- Dates UTC explicites; politique de fuseau métier et traduction des libellés sources non inférées. Une ligne anormalement haute échoue explicitement plutôt que d'être tronquée.

Références officielles vérifiées : [Playwright `page.pdf`](https://playwright.dev/docs/api/class-page#page-pdf), [Supabase uploads sans écrasement](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [accès aux fichiers privés](https://supabase.com/docs/guides/storage/serving/downloads).
