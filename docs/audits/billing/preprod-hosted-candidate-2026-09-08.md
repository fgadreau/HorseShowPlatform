# Candidat d'essai hébergé — 8 septembre 2026

Branche dédiée : `feat/billing-preprod-hosted-pilot`, dans le worktree persistant `/workspaces/HorseShowPlatform/.worktrees/billing-hsp-direct`. Base documentaire : `b6059c9806a146bb62597949075e6e6d54ab446c`. Complète les rapports de [préparation](preprod-promotion-preparation-2026-09-08.md) et de [faisabilité](preprod-vercel-supabase-feasibility-2026-09-08.md).

**État : adaptations et validations locales préparées ; essai distant non exécuté et non autorisé.** Aucun changement de calcul, taxe, paiement, affectation ou règle HSP. Les rendus 1–5, PDF historiques et SVG ne sont pas modifiés ; aucune nouvelle version de rendu n'est nécessaire pour ce changement d'hébergement.

## Situation vérifiée et inconnues

- Fetch des deux branches effectué : `preprod` reste à `6ca720bbea4317d8644d30b05f628bc45a516241`. Au départ, 0 commit propre à preprod et 33 propres à la branche HSP ; pas de conflit de divergence, aucune fusion effectuée.
- Hobby est le forfait **rapporté par le propriétaire d'après sa capture**. Aucun accès Vercel authentifié disponible pour confirmer Billing, Fluid Compute, mémoire, runtime et région effectifs. Le candidat utilise un budget de fonction de 240 s : Fluid Compute doit être confirmé avant l'essai Hobby. Aucune activation effectuée.
- L'hôte PostgreSQL direct du projet PREPROD identifié dans le code (`qaguotdproxamgudnnsd`) n'a pas été joignable depuis le conteneur local. La tentative utilisait `default_transaction_read_only=on`, un timeout et le mot de passe déjà disponible sans l'afficher. Aucun résultat SQL distant obtenu : **migrations, bucket, politiques, extensions et données PREPROD restent non certifiés**. Les paramètres publics du pooler ont été demandés ; ne pas inventer son hôte/région.
- GitHub renvoie 403 pour la lecture des variables et des noms de secrets de l'environnement `preprod`. Aucun secret demandé dans la conversation, affiché ou ajouté à Git.
- Les GET anonymes du domaine PREPROD et de `/api/vet/health` renvoient 302 vers `vercel.com/sso-api`. L'accès humain avec session ne valide pas l'accès machine. Aucun bypass utilisé dans cet audit.
- Portail vétérinaire : réutilisation effective de `server/vet/serverless-browser.mjs`, déjà importé par billing, et du principe de packaging `api/vet.js`. Son serveur reste orienté requête utilisateur et ancienne origine `vercel.app` ; ses actions depuis le nouveau domaine sont à vérifier. Aucun changement vétérinaire introduit dans ce candidat.

## Adaptations réalisées

| Route proposée sur le domaine PREPROD | Authentification / comportement |
| --- | --- |
| `POST /api/billing/payment` | Session Supabase + origine exacte PREPROD + permissions financières existantes + compte/tentative appartenant au contexte fictif autorisé. |
| `POST /api/billing/webhook-platform` | Secret de signature plateforme distinct ; frais d'application sandbox. Corps brut authentifié, données minimales persistées avant ACK, sans appel Stripe préalable. |
| `POST /api/billing/webhook-connect` | Secret Connect distinct ; compte connecté configuré explicitement, événements sandbox autorisés uniquement. |
| `POST /api/billing/run-stripe` | Secret machine applicatif ; un travail par invocation, verrou global à bail. Enrichissement Stripe puis synchronisation financière existante, reprises différées. |
| `POST /api/billing-documents/run-pdf` | Secret machine ; un document bilingue par invocation, verrou global à bail, réutilisation du worker et des artefacts existants. |
| `POST /api/billing-documents/status` | Session, origine, contexte et permissions documentaires. Aucun lancement de Chromium. |
| `POST /api/billing-documents/retry` | Mêmes contrôles ; retourne l'état de la file, sans contourner le délai de reprise ni lancer un deuxième worker. |
| `POST /api/billing-documents/download` | Mêmes contrôles, vérification SHA-256 et taille, seconde vérification des droits avant remise des octets ; limite applicative de 4 MiB. |

Les proxies locaux restent utilisés en `VITE_DEPLOY_ENV=local`. Le build staging utilise les nouvelles routes. Les paramètres de requête du bypass sont compatibles avec le parsing des routes ; le corps JSON reconstruit du serveur vétérinaire n'est pas réutilisé pour les signatures Stripe.

`BILLING_HOSTED_ENABLED` désactive les handlers par défaut. Le serveur impose la référence Supabase PREPROD, l'origine `https://preprod.horseshowplatform.com`, l'environnement `staging`, une référence PROD distincte et une branche autorisée (`preprod` ou cette branche dédiée). Les opérations sont limitées à `BILLING_PILOT_CONTEXT_ID`. Les clés service-role restent côté serveur ; un header Vercel de bypass seul ne permet pas d'exécuter le worker ni de consulter un PDF.

La nouvelle migration ajoute uniquement une inbox opérationnelle à contenu minimal, deux verrous à bail et le suivi de rapprochement des tentatives. Les tables sont privées, RLS activée, sans privilèges navigateur ; seules les RPC prévues sont accordées à `service_role`. Les données persistées ne contiennent ni signature, ni clé Stripe, ni `client_secret`. Les identifiants et relations financières existants restent l'autorité pour la synchronisation.

### Durée, concurrence et reprise

- Budget HTTP des Functions : 240 s ; appels externes bornés par un signal global de 220 s, en plus des délais Stripe existants. Le navigateur est fermé à l'expiration de son budget ; le budget de rendu des deux langues est partagé à partir du début du travail.
- Un seul worker Stripe et un seul worker PDF obtiennent leur verrou global. Les verrous expirent après 300 s ; le jeton empêche un ancien worker de libérer ou clôturer un verrou réattribué. Les claims PDF existants, eux aussi de 300 s, restent en vigueur.
- Une seule entrée inbox ou tentative par invocation Stripe ; une seule paire FR/EN par invocation PDF. Pas de `setInterval` en Function, pas de promesse non attendue après réponse et pas de dépendance à une visite utilisateur.
- Une erreur inbox garde l'événement, avec temporisation croissante de 60 s à 3 600 s. Une tentative non résolue est relue périodiquement lorsqu'aucun événement éligible n'attend ; une tentative en anomalie reste à rapprocher explicitement. Sous backlog continu d'événements, cette réconciliation de secours peut attendre : débit volontairement limité pour le pilote, à surveiller avant élargissement.
- Erreur PDF : mécanisme existant, délai de 60 s ; interruption brutale : reprise après expiration du bail. Publication FR/EN seulement après succès des deux uploads, `upsert:false`, objets distincts par claim, jamais d'écrasement d'une pièce émise. Un upload partiel peut rester orphelin : aucun nettoyage destructif automatique ajouté.
- Le clic « Reprendre » informe de l'état courant ; la reprise effective appartient au déclenchement périodique, y compris navigateur fermé.

À cadence d'une minute et sans backlog : attente de lancement de 0–60 s par étape, puis traitement. La production du PDF après réception d'un paiement peut traverser deux étapes périodiques ; ne pas promettre une disponibilité immédiate. Cible d'essai : une paire déjà en file sous 1–2 minutes si son rendu prend moins d'une minute. Après crash, environ 5–6 minutes depuis le claim, plus le nouveau traitement. Ces délais sont des budgets de conception, pas des mesures Vercel ni un SLA.

## Migrations nécessaires : ne pas les présumer installées

L'essai réutilise le vrai moteur de facturation : **les migrations billing sont nécessaires**. L'inbox seule ne suffit ni aux paiements ni aux instantanés/artefacts PDF. Les douze migrations décrites dans le rapport de préparation, de `20260906000900_billing_folio_foundation.sql` à `20260907000700_billing_document_render_v5.sql`, précèdent la nouvelle :

`supabase/migrations/20260908000100_billing_hosted_pilot.sql`.

Treize migrations billing potentielles au total ; la liste réellement manquante dépend de l'inventaire distant. Aucune ancienne migration réécrite. Le script [preprod-inventory.sql](../../../scripts/billing/preprod-inventory.sql) est prêt pour le SQL Editor PREPROD : transaction read-only, historique de migrations, tables, bucket, nombre d'objets, politiques Storage, extensions et privilèges des RPC. Il ne lit ni Vault ni données clients. Comparer ensuite l'historique et le schéma aux fichiers du dépôt ; un numéro déjà appliqué n'autorise pas à rejouer ou réparer aveuglément une migration.

La nouvelle migration ne crée **aucun cron**, aucun secret et aucun compte Stripe. Avant application autorisée, sauvegarder base et objets Storage séparément. Ne pas lancer les scripts `*-local.mjs` contre PREPROD, copier le dump local vers PREPROD, ni exécuter un reset.

## Réglages distants exacts à revoir avant toute activation

Les étapes ci-dessous sont un protocole futur, **non exécuté**. Les valeurs marquées « à relever » sont des prérequis bloquants ; ce rapport ne prétend pas que la configuration distante est complète.

### 1. Consoles et cible

Dans Vercel, ouvrir l'équipe qui possède le domaine PREPROD : Billing (forfait), projet → Functions (Fluid/Active CPU, Node, mémoire/région), Environments/Git (branche et type de déploiement), Deployment Protection (bypass machine). Confirmer Hobby et Fluid avant de retenir les 240 s. Aucun besoin identifié de l'option payante d'exception par domaine ni des Functions volumineuses en bêta.

Dans Supabase, sélectionner le projet PREPROD correspondant à la référence ci-dessus, ouvrir Connect → Session pooler pour l'accès read-only ou exécuter le script d'inventaire dans SQL Editor. Vérifier également le forfait, le risque de pause, Storage → `billing-pdfs` et Integrations → GitHub. Ne rien modifier pendant cette vérification.

### 2. Données fictives et configuration financière

Après inventaire et autorisation distante, préparer un nouveau concours fictif admissible, un payeur de test avec lien métier explicite et les produits/fournisseurs du prototype validé. Conserver la configuration de taxes fictives et de mandat déjà revue ; ne pas adopter un concours historique alimenté par les anciens parcours. La création des fixtures PREPROD n'est pas automatisée par une migration.

Les opérations existantes à utiliser sont `billing_create_context`, `billing_set_capabilities`, la configuration HSP déjà validée et `billing_stripe_configure_direct` pour une organisation encore admissible. Cette dernière refuse une organisation déjà configurée ou possédant des tentatives : inventorier d'abord `billing_stripe_accounts` et réutiliser la configuration concordante si elle existe, sans recréer un compte Stripe ni forcer un UPDATE. Les UUID des acteurs, de l'organisation et du nouveau contexte doivent être relevés/validés sur PREPROD avant de produire le jeu de commandes d'initialisation définitif. Les fichiers `hsp-fixture-local.mjs` et les fixtures locales restent des références de données, pas des commandes de déploiement distant.

Le pilote sera limité au UUID de ce contexte via `BILLING_PILOT_CONTEXT_ID`. Les nouveaux paiements, reçus, relevés et facture seront créés par les RPC/parcours métier existants. Ne pas insérer directement des écritures financières pour fabriquer un résultat d'essai.

### 3. Variables Vercel, dans le seul périmètre PREPROD

| Variable | Valeur / provenance |
| --- | --- |
| `VITE_DEPLOY_ENV` | `staging` |
| `VITE_SUPABASE_URL` | `https://qaguotdproxamgudnnsd.supabase.co` |
| `VITE_SUPABASE_PROJECT_REF` | `qaguotdproxamgudnnsd` |
| `VITE_PRODUCTION_SUPABASE_PROJECT_REF` | Référence PROD existante distincte, à confirmer ; aucune connexion PROD requise. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY` | Clé publique du projet PREPROD. |
| `BILLING_HOSTED_ENABLED` | Absent/`false` pendant préparation ; `true` seulement après autorisation et prérequis. |
| `BILLING_SUPABASE_URL` | Même URL PREPROD ci-dessus. |
| `BILLING_WEB_ORIGIN` | `https://preprod.horseshowplatform.com` |
| `BILLING_SUPABASE_ANON_KEY` | Clé publique PREPROD pour les clients avec JWT utilisateur. |
| `BILLING_SUPABASE_SERVICE_ROLE_KEY` | Secret serveur PREPROD, jamais une variable `VITE_*`. |
| `BILLING_PILOT_CONTEXT_ID` | UUID du seul contexte fictif validé. |
| `BILLING_WORKER_SECRET` | Secret machine aléatoire d'au moins 32 caractères ; distinct du bypass Vercel. |
| `STRIPE_SECRET_KEY` | Clé `sk_test_…` de la sandbox existante. |
| `STRIPE_PUBLISHABLE_KEY` | Clé `pk_test_…` de cette même sandbox. |
| `BILLING_STRIPE_CONNECTED_ACCOUNT` | Identifiant public `acct_…` existant, concordant avec la configuration SQL. |
| `STRIPE_WEBHOOK_SECRET_PLATFORM` | Secret de la nouvelle destination plateforme ; pas celui de la CLI. |
| `STRIPE_WEBHOOK_SECRET_CONNECT` | Secret de la destination Connect ; obligatoirement distinct du précédent. |

`VERCEL_GIT_COMMIT_REF` est fourni par Vercel, pas saisi pour contourner le garde. Les anciennes variables locales `BILLING_PDF_*` restent locales : les nouvelles routes hébergées utilisent les variables serveur communes ci-dessus. Le secret de bypass Vercel n'est pas nécessaire au handler : Vercel le contrôle avant le routage ; il est nécessaire aux appelants machine. Ne pas modifier les variables vétérinaires ni l'environnement PROD.

### 4. Destinations Stripe sandbox

Dans la sandbox existante, Workbench → Webhooks / Event destinations, préparer deux destinations HTTPS avec la version d'événement compatible avec les appels actuels (`2024-06-20`, à confirmer dans Workbench) :

- **Your account** → `/api/billing/webhook-platform` : `application_fee.created`, `application_fee.refunded`.
- **Connected accounts** → `/api/billing/webhook-connect` : `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.requires_action`, `payment_intent.amount_capturable_updated`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`.

Copier chaque secret de signature directement vers sa variable serveur, sans l'afficher dans un rapport. Vérifier plateforme/compte existants et contrôleurs du mode direct ; aucune création de compte ni acceptation de conditions par cet essai.

Conserver Deployment Protection. Le mécanisme documenté Vercel accepte le bypass en query parameter pour Stripe et en header pour Supabase. Conserver l'URL Stripe complète uniquement dans la console/gestionnaire de secrets ; redacter paramètres et signatures des journaux. Ne pas ajouter de cookie ni de redirection à la livraison. L'absence de bypass doit bloquer à la protection Vercel ; avec bypass mais mauvaise signature, le handler doit refuser. [Bypass officiel](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

### 5. Supabase Cron, Vault et Storage

Après autorisation : activer si nécessaire les extensions `pg_cron`, `pg_net` et Vault dans le projet PREPROD. Dans Vault, créer exactement une entrée `hsp_billing_worker_secret` égale à `BILLING_WORKER_SECRET` et une entrée `hsp_billing_vercel_bypass` contenant le bypass de ce projet Vercel. Ne pas copier les clés service-role ou Stripe dans le cron.

Le fichier [preprod-schedule.sql](../../../scripts/billing/preprod-schedule.sql), séparé des migrations automatiques, prépare deux tâches nommées `hsp-billing-stripe-preprod` et `hsp-billing-pdf-preprod`, chaque minute, POST `{}` vers les routes machine, timeout de 230 000 ms. Les headers sont construits à partir de Vault ; aucune valeur secrète n'est inscrite dans le fichier ou la définition SQL du cron. **Ce script de planification n'a pas été exécuté**, même localement ; ses appels réels à Vercel et le timeout `pg_net` restent à qualifier. [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).

Bucket `billing-pdfs` : privé, MIME `application/pdf`, plafond prévu par migration de 20 MiB. Les objets seront écrits par service-role, jamais exposés publiquement. Le pilote limite les téléchargements via Vercel à 4 MiB ; au-delà il refuse explicitement et conserve l'artefact. La prise en charge par URL signée de pièces plus grandes n'est pas introduite dans cet essai minimal.

Consulter `cron.job_run_details` et les résultats HTTP sans afficher les headers/commandes contenant des secrets. Surveiller `billing_hosted_inbox` (âge, tentatives, erreur), `billing_hosted_lanes` (dernier début/fin et bail) et `billing_outbox` (en attente, échecs, baux expirés). Un cron marqué réussi peut seulement indiquer l'envoi HTTP : vérifier ensuite la complétion durable, pas uniquement le retour de `net.http_post`.

## Effets automatiques : blocage de publication identifié

Le dernier commit documentaire a produit un déploiement **Vercel Preview** réussi : preuve lue dans les statuts et déploiements GitHub. Le candidat ajoute `git.deploymentEnabled["feat/billing-preprod-hosted-pilot"]=false` dans `vercel.json`, conformément à la [configuration officielle Vercel](https://vercel.com/docs/project-configuration/git-configuration). Cette règle concerne uniquement la branche dédiée ; elle ne modifie pas la configuration distante ni le comportement des autres branches. Aucun déploiement manuel lancé.

Les workflows E2E et vétérinaires qui écrivent en PREPROD ciblent un push `preprod` ou un déclenchement explicite, pas le push de cette branche ni une simple PR. `validate.yml` exécutera les contrôles locaux sur PR, dont désormais la suite billing sans credentials distants. Les crons déjà présents dans GitHub restent indépendants ; aucun workflow n'a été déclenché manuellement.

**Supabase constitue un blocage distinct** : le contrôle du SHA documentaire indique « This git branch is not associated with any Supabase Branch. You can open a PR to create a new branch. » Une PR récente vers preprod a été ignorée uniquement faute de changements dans `supabase/`. Notre diff contient des migrations. La [documentation de l'intégration GitHub Supabase](https://supabase.com/docs/guides/deployment/branching/github-integration) décrit la création automatique de branches et l'application de migrations. Le statut brouillon ne constitue pas une garantie documentée de désactivation.

Il faut donc confirmer en lecture seule **Project Settings → Integrations → GitHub → Automatic branching**, ainsi que le projet associé et les éventuelles règles de branche, avant le push/PR. Aucune désactivation distante n'est autorisée à ce stade ; elle ne sera pas faite sans accord. Le code et le texte de PR sont préparés localement. Tant que ce contrôle n'est pas confirmé, ne pas déclencher la publication susceptible de créer une base ou d'appliquer des migrations distantes. Ce point peut être levé par une preuve de configuration compatible, sans changer l'implémentation.

### Complément : écran PREPROD et autres liens Supabase

Vérification en lecture seule du 8 septembre, après les indications du propriétaire. Aucun push, PR, changement de console ni accès aux données PROD effectué.

- **PREPROD `qaguotdproxamgudnnsd`** : le propriétaire rapporte le formulaire GitHub avec le bouton « Enable integration », dépôt sélectionné, répertoire `.`, branche `main`, options Deploy to production / Automatic branching / Supabase changes only vertes et limite 3. La documentation situe ce bouton à la dernière étape d'installation. Cela indique vraisemblablement un formulaire non activé ; ce n'est pas une lecture authentifiée de l'état enregistré. Les options vertes ne prouvent pas une configuration active.
- **`main`** : l'API GitHub confirme que c'est la branche par défaut du dépôt. La valeur proposée est cohérente avec ce défaut, mais son origine exacte dans le formulaire n'a pas été vérifiée dans le code du dashboard. Le nom commercial « PREPROD » ne configure pas le suivi Git. Le champ production branch désigne la branche de déploiement du projet Supabase concerné, pas nécessairement l'environnement métier PROD. Ne pas activer ce formulaire ni enregistrer `main` pour résoudre le blocage.
- **Autre projet lié, `srzzituovoxkvvlaesxa`** : le contrôle Supabase du SHA documentaire et celui de `preprod` pointent tous deux vers ce projet, identifié comme PROD par `.env.staging.example`. Le [contrôle GitHub 101903714551](https://github.com/fgadreau/HorseShowPlatform/runs/101903714551) est ignoré faute de branche Supabase associée et invite à ouvrir une PR. Cela établit un lien observé au moment du contrôle, sans certifier les réglages actuels de l'intégration.
- **Previews historiques réellement exécutées** : le [commentaire Supabase de la PR 53](https://github.com/fgadreau/HorseShowPlatform/pull/53#issuecomment-5552182829) identifie `smxamercakeblaqzzcaw` comme Preview Branch et marque les migrations réussies le 5 septembre. Le [commentaire de la PR 52](https://github.com/fgadreau/HorseShowPlatform/pull/52#issuecomment-5546959058) fait de même pour `akpmkzhhklyrxxgerztc` le 4 septembre. Ces références sont des previews historiques, pas deux projets permanents confirmés ; leur existence actuelle et leur parent exact restent à inventorier. Aucun de ces succès ne prouve une migration du projet PROD lui-même.
- **Limite d'accès** : GitHub refuse l'inventaire des hooks du dépôt (HTTP 403, permissions du jeton). Aucun accès authentifié à la gestion Supabase n'est disponible ici pour lister exhaustivement les connexions. Ce refus de lecture vient de GitHub, pas d'un rejet d'approbation de publication.

**Conclusion : l'absence de migration automatique ne peut pas être confirmée.** Les anciennes previews apportent une preuve positive d'exécution distante de migrations par cette intégration. Le candidat modifie `supabase/` avec treize nouvelles migrations par rapport à preprod ; ni le filtre « Supabase changes only », ni une PR brouillon ne garantissent l'absence de déclenchement. La publication conditionnelle reste suspendue.

Pour lever ce point sans rien changer : ouvrir **Supabase → Organization Settings → Integrations → GitHub**, relever toutes les connexions vers `fgadreau/HorseShowPlatform` (dans chaque organisation concernée), puis **Configure connection** pour consulter les réglages enregistrés de chaque projet : référence, état actif, branche de production, Automatic branching, règles de branches et Supabase changes only. Priorité au projet `srzzituovoxkvvlaesxa`. Relever aussi les branches persistantes déjà associées. Aucune clé ni valeur secrète nécessaire. Ne pas cliquer Enable, Save, Disconnect ni modifier une option. Une intégration encore automatique nécessiterait une décision séparée avant publication ; aucune désactivation n'est autorisée implicitement.

Sources officielles consultées : [installation, branches et migrations automatiques](https://supabase.com/docs/guides/deployment/branching/github-integration), [inventaire des connexions au niveau organisation](https://supabase.com/docs/guides/troubleshooting/managing-or-disconnecting-github-oauth-connections-e3dc3b).

Code conservé dans le commit local `e87b06da518de1a880faecd666de21538e62f934`. `git ls-remote` confirme toujours la base documentaire distante `b6059c9806a146bb62597949075e6e6d54ab446c` et `preprod` à `6ca720bbea4317d8644d30b05f628bc45a516241` ; la branche dédiée n'existe pas encore sur origin. Le présent complément est documentaire ; les validations applicatives ci-dessous n'ont pas été répétées sans changement de code.

### Décision sur le push seul après confirmation du propriétaire

Le propriétaire confirme en lecture seule : une seule connexion GitHub dans l'organisation, **Horse Show Platform → fgadreau/HorseShowPlatform**, pour PROD `srzzituovoxkvvlaesxa`. Intégration active (« Disable integration »), Deploy to production actif sur `main`, Automatic branching actif, limite 50, Supabase changes only actif. PREPROD affiche explicitement « GitHub — No repository connected » et « Enable integration ». Son sélecteur `main — PRODUCTION` désigne sa branche Supabase principale, pas une liaison GitHub. Ces observations remplacent l'incertitude précédente sur les écrans ; les deux projets restent distincts et PREPROD sans intégration GitHub.

**Push seul non exécuté ; PR reportée.** La documentation officielle [Syncing GitHub branches / Migrations](https://supabase.com/docs/guides/deployment/branching/github-integration) indique que la création d'une nouvelle branche GitHub peut créer une branche Supabase, puis exécuter les migrations. Le premier push publierait précisément une nouvelle branche contenant des changements dans `supabase/`. Le filtre Supabase changes only ne l'exclut donc pas. L'absence de PR n'est pas une garantie ; les contrôles historiques ignorés n'invalident pas ce déclencheur documenté. Il ne s'agit pas d'affirmer qu'un push feature appliquerait directement les migrations à la base principale PROD : ce chemin suit `main`. Le risque ici est la création et la migration automatiques d'une preview rattachée au projet PROD, également interdites par le périmètre.

Relecture des six workflows locaux : aucun ne cible le push de `feat/billing-preprod-hosted-pilot`. `validate.yml` cible les PR et quatre autres branches ; E2E et smoke vétérinaire ciblent `preprod` ; les workflows de migration/rehearsal/capacité exigent un déclenchement explicite. Le cron E2E existant reste indépendant de ce push. Côté Vercel, `git.deploymentEnabled` contient déjà cette branche avec `false`, conformément à la [configuration officielle](https://vercel.com/docs/project-configuration/git-configuration) : le mécanisme Git documenté doit ignorer son déploiement. Aucun essai par publication n'a été utilisé pour vérifier les intégrations.

**Modification minimale proposée, non effectuée :** désactiver uniquement Automatic branching dans la connexion GitHub du projet PROD, après autorisation distincte du propriétaire. Conserver Deploy to production sur `main`, le dépôt associé et PREPROD sans connexion. Avant publication, confirmer le réglage enregistré et l'absence de branche Supabase déjà associée au nom candidat ; garder Automatic branching désactivé pendant la revue et les pushes. Une réactivation devra être revue séparément pour ne pas réintroduire le déclencheur. Cette proposition change une automatisation du projet PROD et n'est donc pas couverte par l'autorisation actuelle. Aucun changement de code ou réglage Vercel ne neutralise cette intégration Supabase externe.

Sans modification d'intégration, la revue peut commencer avec ce rapport local et l'archive Git persistante ; un dépôt de revue privé non connecté serait une alternative plus lourde, à préparer seulement après autorisation et vérification de ses intégrations. Ne pas déplacer les migrations pour tromper le filtre, ne pas utiliser un tag ou un push d'essai comme contournement non vérifié.

Le code reste celui de `e87b06da518de1a880faecd666de21538e62f934` ; ce complément est documentaire, sans nouveau test applicatif nécessaire. Aucun push, PR, déploiement, migration distante ou modification d'intégration effectué.

## Validations exécutées

| Validation | Résultat et portée |
| --- | --- |
| Suite `node --test scripts/billing/*.test.mjs` | 118 tests réussis à la première passe, incluant les 10 premiers nouveaux tests hosted et les régressions PDF avec Chromium réel. |
| `node --test scripts/billing/hosted.test.mjs` après complément | 12/12 réussis : ajout d'un timeout navigateur et du parcours signé → traitement → erreur de confirmation HSP → reprise, avec fournisseur et stockage simulés. Ces 12 tests incluent les 10 précédents ; ne pas additionner les chiffres comme des tests distincts. |
| Build local puis build staging à clé publique factice | TypeScript/Vite réussis, nouvelles routes front incluses ; pas de connexion PREPROD pendant compilation. Avertissements existants de taille de chunks/import vétérinaire. |
| `npm run test:billing:rebuild` | **Nouvelle instance locale isolée**, pas de reset d'une base existante. 155 migrations rejouées depuis les schémas système, 219 assertions et 96 rejets attendus, tests de concurrence et assertions hosted SQL réussis. Répertoire de travail déplacé de `/tmp` vers `.tmp/billing-tests/` persistant. |
| `npm run test:billing:sql` final | Clone local isolé, migration hosted appliquée, mêmes 219 assertions/96 rejets attendus, 36 vérifications de scénario. Intégration supplémentaire : deux requêtes HTTP signées concurrentes → une inbox PostgreSQL avant les ACK ; concurrence réelle des claims ; route machine → Chromium FR/EN et deux artefacts SQL. |
| Transport Storage de ces intégrations | Adaptateur de fichiers privés local, explicitement **pas** Supabase Storage HTTP hébergé. Les deux fichiers sont nouveaux dans `.tmp/billing-hosted/integration/`. |
| Packaging local NFT 1.11.0 + inclusions déclarées | API paiement : 1 221 873 octets ; API documents : 147 363 226 octets estimés. Rendus historiques 1–5 et SVG présents, aucun `.env` ni fichier `.tmp` embarqué. Sous 250 MiB ; estimation locale, pas un build Vercel déployé. |
| Préservation | Aucun diff PDF/SVG depuis le SHA documentaire ; anciennes migrations inchangées, pas de fichier de secret modifié. Worktrees et volumes du pilote conservés. |

Le premier essai du nouveau test SQL a échoué sur un identifiant fictif contenant un underscore interdit ; la fixture a été corrigée, puis le rejeu depuis zéro et le test sur clone ont réussi. Le packaging signale huit dépendances non résolues sur des chemins optionnels (OpenTelemetry, BiDi, Electron et extensions natives Playwright). Le chargement et Chromium local réussissent ; vérifier le bundle déployé lors de l'essai, sans considérer ces avertissements comme une certification de packaging. Le traceur est installé uniquement dans `.tmp/hosted-tools`, aucune dépendance applicative ajoutée. Reproduction : [check-hosted-package.mjs](../../../scripts/billing/check-hosted-package.mjs).

Preuves locales récupérables : `.tmp/billing-tests/rebuild-results.json`, `.tmp/billing-tests/results.json`, `.tmp/billing-hosted/integration-results.json`, `.tmp/billing-hosted/package-results.json`. Les jeux de tests éphémères seuls ont été supprimés après contrôle ; aucune base existante réinitialisée. Les PDF et données du pilote initial restent en place.

## Protocole de l'essai distant à autoriser séparément

1. Valider les prérequis ci-dessus, inventorier/sauvegarder PREPROD, approuver la liste exacte de migrations manquantes et les commandes de fixture adaptées aux identités PREPROD. Faire relire les variables et scopes sans leurs valeurs secrètes. Autoriser explicitement déploiement, migrations, fixtures, destinations et planification ; pas de fusion préalable obligatoire.
2. Déployer le candidat autorisé sur la cible PREPROD choisie, vérifier SHA, runtime, taille réelle des Functions, fichiers Chromium/SVG et origine. Vérifier la concordance des secrets de signature par succès/échec, jamais par affichage. Le garde doit refuser toute cible PROD et toute activation hors du contexte fictif.
3. Créer une vente et plusieurs paiements sandbox par les parcours existants, garder les identifiants des événements, tentatives et pièces. Rejouer une livraison via Workbench : une entrée durable, un crédit par paiement, une récupération HSP unique, une facture finale unique par compte.
4. Fermer les clients et Codespaces, ne lancer aucun listener CLI. Observer ensuite via consoles que les tâches planifiées ont traité les événements, généré FR/EN et enregistré exactement deux artefacts par document dans le bucket privé. Télécharger avec utilisateur autorisé et refuser un autre payeur ; contrôler empreintes et multiplicité des lignes PDF.
5. Tester d'abord les interruptions sur la base isolée. Pour un exercice hébergé, limiter l'incident au worker du contexte fictif et obtenir son autorisation : erreur Storage contrôlée, bail non clôturé puis expiration, appel cron manqué, reprise sans clic. Ne pas couper un projet partagé ni toucher PROD. Vérifier qu'un ancien claim ne publie pas après reprise et qu'aucun paiement/frais HSP ne se duplique.
6. Mesurer durées à froid/à chaud, mémoire, débit, attente maximum, délai après échec et taille des réponses. Le scénario doit rester sous le budget ; sinon arrêter l'extension du pilote et revoir le découpage ou l'hébergement avant tout achat.

## Coûts et décision de reprise

Hobby avec Fluid peut techniquement héberger cet essai borné, sous quotas. L'usage commercial n'est pas couvert par Hobby simplement parce que les paiements sont fictifs : confirmer l'éligibilité ; Pro commence à 20 USD/mois si nécessaire. Supabase Cron remplace le cron natif Vercel quotidien de Hobby, mais consomme la base et les appels Functions. Le forfait Supabase et sa possibilité de pause restent à vérifier ; Pro commence à 25 USD/mois, projets supplémentaires selon compute. Aucun troisième hébergeur ni option payante activé. [Hobby](https://vercel.com/docs/plans/hobby), [Pro](https://vercel.com/docs/plans/pro-plan), [Supabase](https://supabase.com/pricing).

**Prochaine étape :** confirmer Automatic branching Supabase pour permettre la publication documentaire/code et la PR brouillon sans migration automatique ; terminer l'inventaire distant et la confirmation Fluid. Le candidat est validé localement pour revue, mais ne doit pas être présenté comme un pilote déjà qualifié ou une configuration distante prête sans ces prérequis.

## Levée du blocage pour le push seul

Le propriétaire a désactivé et enregistré Automatic branching sur l'unique connexion GitHub du projet PROD ; Deploy to production reste sur `main`, PREPROD sans intégration. La recherche exacte `feat/billing-preprod-hosted-pilot` dans le sélecteur Supabase retourne « No branches found ». Cette recherche porte sur le nom et ne constitue pas un inventaire exhaustif des associations GitHub ; aucun accès authentifié à cet inventaire n'est disponible dans cette session.

Les contrôles locaux et GitHub confirment que la branche candidate n'a pas encore été publiée et qu'aucun déploiement GitHub ne lui est associé. Aucun workflow du dépôt ne cible son push, et `vercel.json` désactive son déploiement Git Vercel. En combinant ces éléments avec la désactivation confirmée de la création automatique, le push seul est retenu comme autorisé et raisonnablement sûr. Cette décision ne prétend pas certifier un inventaire Supabase inaccessible. Aucun réglage supplémentaire n'est modifié ; ni PR, ni fusion, ni migration distante ne sont autorisées par cette publication. Les contrôles GitHub après publication doivent vérifier le SHA et les effets observables ; ils ne remplacent pas un audit SQL distant.

Premier push effectué : `852d6093af091879004003e8095abad75cfcb459`, SHA vérifié par `git ls-remote`. Le contrôle Supabase Preview est terminé avec la conclusion **skipped**, et sa sortie confirme explicitement l’absence d’association à une branche Supabase. À la consultation après push : zéro exécution GitHub Actions, aucun déploiement GitHub pour ce SHA et aucun statut Vercel publié. Aucune PR créée. Ces observations confirment le comportement attendu pour ce push ; aucun inventaire SQL distant n’a été exécuté. Ce complément documentaire est publié sur la même branche, sous les mêmes conditions.
