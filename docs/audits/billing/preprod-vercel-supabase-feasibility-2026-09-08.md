# Pilote billing sur Vercel + Supabase — complément du 8 septembre 2026

Complément au [plan de promotion](preprod-promotion-preparation-2026-09-08.md). Code examiné : `8496ff65662f98c9c24338c47800c39dacc5d1a6`, rapport précédent : `0d0d82409599f948939a5066089d37ed551cbf37`, branche `feat/billing-hsp-direct-prototype`. Recherche et documentation uniquement : aucune adaptation, activation payante, migration, configuration ou déploiement distant.

## Recommandation

**Vercel + Supabase devraient suffire pour notre pilote fictif, avec des adaptations ciblées et un essai technique obligatoire. Aucun troisième hébergeur n'est actuellement démontré indispensable.** Recommandation : API et génération Chromium sur des Functions Node.js Vercel ; registre, files durables et PDF privés sur Supabase ; réveil périodique par **Supabase Cron + pg_net**, visant explicitement PREPROD. Stripe livre directement ses événements HTTPS ; aucun Codespace, listener CLI ou utilisateur connecté n'est requis après cette installation.

Cette conclusion est une faisabilité d'architecture, pas une certification du déploiement existant. Elle suppose un forfait autorisant l'usage, des ressources suffisantes, Supabase actif, des déclenchements authentifiés et des workers bornés/reprenables. Le succès d'un certificat vétérinaire ne démontre ni le traitement autonome des paiements ni la production bilingue et immuable des pièces billing.

**Le forfait Vercel réellement souscrit et l'activation Fluid Compute n'ont pas pu être vérifiés.** Aucun connecteur Vercel, jeton Vercel dans l'environnement, fichier de liaison `.vercel/project.json` trouvé dans les emplacements recherchés, ni session CLI dans les emplacements usuels inspectés. Une confirmation sans secret a été demandée au propriétaire pendant l'audit. Il serait incorrect de déduire Hobby ou Pro de l'URL, du nom de l'équipe, d'une réponse HTTP ou du `maxDuration:60` du dépôt. Les possibilités par forfait ci-dessous sont donc conditionnelles ; le coût marginal réel reste à confirmer dans Billing/Usage.

## Ce qui est vérifié sur le portail vétérinaire

Lecture du code et de l'historique : [api/vet.js](../../../api/vet.js) appelle [hosted.mjs](../../../server/vet/hosted.mjs). [vercel.json](../../../vercel.json) fournit les routes `/api/vet/...`, une durée de 60 secondes et l'inclusion de `node_modules/@sparticuz/chromium/bin/**`. Les commits `a2611bb` et `abe8c03` introduisent cet hébergement et son routage natif. Aucune route billing n'est encore déclarée.

Lectures HTTP anonymes réellement exécutées ce soir sur `https://preprod.horseshowplatform.com/` et `/api/vet/health` : **302 vers `vercel.com/sso-api`**. En suivant la redirection, le 200 obtenu est une page Vercel, pas le portail ni un résultat `health`. L'accès avec la session du propriétaire reste confirmé par lui. Aucun contournement, appel de génération, connexion applicative ou test Stripe distant effectué.

Le code vétérinaire autorise uniquement l'ancienne origine `https://horse-show-platform-git-preprod-felix-gadreau-girard-s-projects.vercel.app`, la branche `preprod` et une référence Supabase PREPROD explicite. Les actions et `browser-check` comparent strictement cette origine. **Le fonctionnement depuis le nouveau domaine ne se déduit pas de l'accès à la page d'accueil** : adapter ultérieurement la liste d'origines et vérifier les parcours vétérinaires. Le SHA du déploiement réellement servi et ses paramètres Functions restent à relever dans Vercel.

| Élément vétérinaire | Réutilisation précise pour billing |
| --- | --- |
| `serverless-browser.mjs` | Déjà importé par les rendus billing, dont V5. Lance Playwright avec le binaire Sparticuz et ses arguments, en retirant `--single-process`. Réutiliser sans remplacer le moteur historique. |
| Inclusion Chromium dans Vercel | Réutiliser le principe pour la fonction PDF billing ; la règle actuelle ne s'applique qu'à `api/vet.js`. Mesurer le bundle propre à billing. |
| Séparation client utilisateur/service-role et garde PREPROD | Réutiliser la structure, adapter origines et variables explicitement ; conserver les RPC de permissions billing. |
| Rendu sans JavaScript externe et fermeture du navigateur | Principe déjà présent dans billing ; conserver l'interdiction des requêtes réseau du document et la fermeture en `finally`. |
| Adaptateur de corps HTTP vétérinaire | **Ne pas copier pour Stripe** : il peut faire `JSON.stringify(req.body)`, ce qui ne préserve pas les octets signés. |
| Certificat vétérinaire | PDF à la demande, limite applicative de 4 MiB, réponse directe. Ce n'est pas un worker billing durable avec deux langues et publication atomique. |
| `preprod-outbox.mjs` vétérinaire | Capture chiffrée de courriels fictifs avec expiration ; ce n'est pas l'outbox de traitements PDF et il ne remplace ni `billing_outbox` ni Storage. |

## Capacités par forfait et limites utiles

| Capacité documentée | Hobby | Pro | Conséquence pour le pilote |
| --- | --- | --- | --- |
| API Node.js et webhooks HTTPS | Oui, sous quotas | Oui, usage facturé | Adaptateur HTTP billing nécessaire dans les deux cas. |
| Durée avec Fluid Compute | Maximum 300 s | Maximum standard 800 s | Nous proposons de rester sous le bail PDF existant de 300 s. |
| Mémoire / CPU | 2 Go / 1 vCPU | 2 Go / 1 vCPU ; jusqu'à 4 Go / 2 vCPU | Démarrer avec un rendu à la fois ; mesurer le pic mémoire. |
| Cron Vercel | Une fois par jour, dans l'heure choisie | Jusqu'à chaque minute | Hobby seul ne donne pas une reprise assez rapide avec son cron natif. |
| Protection Bypass for Automation | Disponible | Disponible | Peut préserver l'accès protégé au site tout en autorisant les machines. |

Sources officielles consultées le 8 septembre : [durées](https://vercel.com/docs/functions/configuring-functions/duration), [mémoire](https://vercel.com/docs/functions/configuring-functions/memory), [fréquence Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation). Les documentations Functions ouvertes sont à jour d'août 2026 ; les anciens extraits de moteur de recherche ne sont pas la référence retenue.

La durée étendue de 1 800 s sur Pro/Enterprise est une **bêta** avec contraintes de runtime ; elle ne résout pas notre bail PDF de 300 s et n'est pas requise par la recommandation. Les plafonds Fluid ne sont pas une preuve de la configuration actuelle : sans confirmation Fluid, ne pas supposer une hausse automatique de la durée de 60 s déclarée pour le vétérinaire. [Configuration officielle de durée](https://vercel.com/docs/functions/configuring-functions/duration).

Hobby est réservé à l'usage personnel non commercial. Le caractère fictif des paiements ne suffit pas à établir l'éligibilité d'un pilote de produit commercial : si cet usage est commercial, prévoir Pro. Ne rien activer avant confirmation du forfait et décision du propriétaire. [Conditions du forfait Hobby](https://vercel.com/docs/plans/hobby).

## API de paiement, documents et signatures Stripe

Les services `stripe.mjs`, les RPC et `downloadDocument` sont réutilisables ; les serveurs localhost et proxies Vite ne le sont pas tels quels. Prévoir des entrées Node distinctes pour paiement, statut/téléchargement, webhook et tâches. Cela évite notamment d'embarquer Chromium dans la réception de paiement. Garder JWT/permissions, origine explicite pour le navigateur, mode sandbox et contrôles de plateforme/compte connecté. Une origine navigateur n'est pas une authentification de worker.

Prévoir deux destinations Stripe sandbox explicites : **plateforme** pour les frais d'application ; **comptes connectés** pour les direct charges, remboursements et litiges. Réutiliser les comptes existants. Le code actuel sait interpréter ces événements mais ne configure qu'un secret de signature ; deux destinations imposent deux secrets et une sélection sûre par endpoint. Les objets connectés se relisent dans le contexte de leur compte, identifié par `event.account`. [Scopes Connect officiels](https://docs.stripe.com/connect/webhooks).

Vercel expose le flux Node ainsi qu'un helper de corps JSON : le handler Stripe devra lire le **corps brut** avant toute désérialisation et tester la signature sur le runtime effectivement déployé. Ne pas reprendre la reconstruction JSON du vétérinaire. [Runtime Node Vercel](https://vercel.com/docs/functions/runtimes/node-js).

Stripe recommande une réponse rapide, exige le corps brut pour la signature et peut livrer en doublon ou dans le désordre. En sandbox, les relances automatiques sont limitées à trois tentatives sur quelques heures ; ne pas les confondre avec les trois jours du mode live. [Webhooks Stripe](https://docs.stripe.com/webhooks).

**Adaptation importante trouvée dans le code :** `receive()` relit aujourd'hui `/account` puis, pour les frais d'application, le frais et la charge chez Stripe **avant** l'insertion durable. Avec des appels pouvant chacun attendre 20 s, ce chemin n'assure pas un accusé rapide. Préparer une réception durable de l'événement authentifié, puis déplacer l'enrichissement/rapprochement au drain ; ne jamais répondre succès avant la persistance requise. Une éventuelle nouvelle table inbox doit suivre les migrations additives et ne modifier aucune écriture financière historique.

## PDF : ressources, fichiers et transport

Les rendus 1–5, leurs modèles et le SVG lu à l'import doivent figurer dans le bundle, avec Chromium, Playwright et les dépendances réellement utilisées. Les tailles locales lues sont environ 69,7 Mo pour Sparticuz, 13,4 Mo pour Playwright et 40,8 Mo pour pdfjs-dist : **ce ne sont pas les tailles du bundle Vercel ni les pics RAM**. Ne pas embarquer les rapports, PDF d'exemples, profils navigateur ou fichiers `.tmp`. La décompression temporaire de Chromium est un détail d'exécution, pas un emplacement persistant des pièces. [Projet officiel Sparticuz](https://github.com/Sparticuz/chromium).

Vercel documente un bundle standard non compressé de 250 Mo ; les fonctions volumineuses jusqu'à 5 Go sont désormais en bêta avec Fluid/Active CPU et, pour un projet existant, une activation spécifique. Ne pas baser le pilote sur cette bêta avant d'avoir mesuré le bundle standard. La limite HTTP corps entrant/sortant est **4,5 Mo**. [Limites Vercel actuelles](https://vercel.com/docs/functions/limitations).

Le worker billing produit FR puis EN, téléverse directement dans le bucket privé `billing-pdfs` avec `upsert:false`, puis valide tailles et SHA-256. Une invocation de worker doit retourner un petit JSON, jamais les deux PDF. Le bucket local accepte jusqu'à 20 MiB par objet : cette limite Storage ne supprime pas celle d'une réponse Vercel.

Les exemples V5 suivis dans Git sont petits : le plus gros PDF lu fait **94 858 octets**. Le téléchargement actuel, qui vérifie empreinte et permission avant réponse, convient à ces exemples après adaptation HTTP ; il faut une réponse FR/EN explicite pour un fichier dépassant la limite, pas une troncature. Pour couvrir des pièces plus grandes, une URL Storage signée de courte durée est possible après autorisation. Cela change la vérification d'intégrité au téléchargement et la révocation durant sa validité : prévoir contrôle SHA-256 côté client avant présentation, durée courte et essai de permissions, plutôt que remplacer silencieusement le contrat actuel. Ne rendre aucun bucket public. [Téléchargements privés et URL signées Supabase](https://supabase.com/docs/guides/storage/serving/downloads).

Un essai doit mesurer à froid/à chaud la paire FR/EN, la RAM, les fichiers effectivement inclus, les appels Storage et les longues factures aux coupures de page. Proposition de budget initial, **non mesuré** : abandon applicatif propre avant 240 s, limite d'invocation inférieure à 300 s avec marge de clôture. Si la paire ne tient pas, étudier une reprise par langue ou un worker dédié ; ne pas simplement augmenter la durée au-delà du bail. Supabase Edge Functions ne sont pas le remplacement direct du moteur Chromium Node : runtime et limites CPU/mémoire diffèrent. [Limites Edge Functions](https://supabase.com/docs/guides/functions/limits).

## Travail autonome et reprise

Recommandation de conception : deux réveils Supabase chaque minute, séparant le drain Stripe et la file PDF. Les tâches continuent même sans visiteur ; le polling de statut de l'écran sert uniquement à informer. Le cron peut ne déclencher Vercel que si du travail est éligible. Supabase Cron accepte des tâches SQL/HTTP ; `pg_net` envoie les appels et Vault garde les secrets hors du code. [Supabase Cron](https://supabase.com/docs/guides/cron), [planification et Vault](https://supabase.com/docs/guides/functions/schedule-functions).

Chaque appel doit viser l'URL PREPROD stable et porter une authentification machine dédiée, plus le bypass Vercel si nécessaire. Régler explicitement le timeout HTTP du déclenchement sur le budget choisi et lire son résultat. `pg_net` conserve ses requêtes/réponses dans des tables non journalisées et ses réponses seulement six heures par défaut : il n'est **pas** la file financière durable. Un appel perdu sera rattrapé par le prochain balayage de `billing_outbox`/inbox, pas par une hypothèse de livraison exactement une fois. [Fonctionnement pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).

Le worker PDF possède déjà `FOR UPDATE SKIP LOCKED`, un jeton, un bail de 300 s, une reprise des baux expirés et un délai de 60 s après erreur. Conserver ces mécanismes et les artefacts immuables. Ils empêchent deux workers de finaliser le même claim ; ils ne limitent pas le nombre total de navigateurs pour des documents différents. Ajouter une borne globale de concurrence dans la base, avec bail, et une limite locale d'instances Chromium. Départ proposé : un document bilingue en traitement à la fois. Une variable en mémoire ne suffit pas entre instances Vercel.

Le drain Stripe lit actuellement jusqu'à 50 événements sans claim exclusif de drain. Les SQL d'idempotence restent utiles, mais il faut une coordination distribuée, un budget de temps et de taille de lot, une reprise avec temporisation et visibilité des anomalies. Ne pas laisser 50 séquences d'appels de 20 s s'accumuler dans une invocation. Prévoir également le balayage des tentatives non terminales/ambiguës lorsqu'un événement n'est jamais arrivé, en réutilisant les contrôles d'idempotence et de rapprochement existants ; aucun deuxième paiement ou frais HSP à créer pour débloquer une tentative.

`waitUntil()` peut accélérer un traitement après réponse, mais s'arrête au timeout de la fonction : ce n'est ni une file durable ni une source de réveil indépendante. Le cron doit suffire à reprendre tout le travail si cette accélération disparaît. [API officielle waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).

Alternative sans Supabase Cron : Vercel Cron sur Pro, **à condition que PREPROD soit le déploiement Production d'un projet Vercel dédié**. Les crons Vercel ciblent l'environnement Production du projet, pas automatiquement une Preview liée à `preprod`. Ne pas changer la branche Production du projet qui sert PROD. [Fonctionnement Vercel Cron](https://vercel.com/docs/cron-jobs).

Même sur Pro, les crons ne réessaient pas automatiquement une invocation échouée et peuvent se chevaucher, manquer un passage ou livrer un doublon. Pro ne remplace donc pas les baux/idempotence et le rattrapage. Authentifier avec `CRON_SECRET` si ce mécanisme est retenu. [Gestion des Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

### Délais proposés, à mesurer ensuite

| Situation | Attente de conception, pas une mesure PREPROD ni un SLA |
| --- | --- |
| Réception webhook | Accusé après persistance, cible de quelques secondes ; enrichissement différé. |
| Événement/PDF sans backlog, cadence 60 s | 0–60 s avant lancement + temps de traitement ; viser un PDF bilingue disponible sous 1–2 minutes si rendu inférieur à 60 s. |
| Erreur PDF prise en charge | 60 s de délai existant + 0–60 s de balayage + rendu suivant. |
| Processus tué sans clôture | Reprise après expiration du bail, soit jusqu'à environ 5–6 minutes depuis la prise du claim + nouveau rendu. |
| Backlog de N documents, un départ par minute et un seul worker | Ordre de grandeur N minutes si chaque paire prend moins d'une minute ; plus long sinon. Adapter la capacité après mesure. |
| Projet suspendu, quotas épuisés ou protection bloquante | Aucun délai garanti avant rétablissement. Une alerte d'âge du plus ancien travail et de dernier succès est nécessaire. |

## Protection PREPROD

Le 302 anonyme mesuré bloque une livraison Stripe directe sans disposition particulière. Conserver la protection générale et préparer le bypass pour les machines. Supabase peut envoyer `x-vercel-protection-bypass` en header, en plus de l'authentification propre du worker. Stripe peut utiliser le paramètre de requête documenté par Vercel lorsque les headers ne sont pas configurables. Ce secret donne accès à tout le projet : URL conservée uniquement dans la destination Stripe/gestionnaire de secrets, jamais dans les rapports, logs publics ou le front ; rotation et redaction à tester. Le bypass ne remplace pas la signature Stripe et n'écarte pas toutes les mitigations DDoS. [Bypass officiel Vercel](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

Les « Deployment Protection Exceptions » sont des exceptions par **domaine**, pas une simple règle de chemin webhook ; elles exigent Enterprise ou Pro avec l'add-on Advanced Deployment Protection. Cet achat n'est pas nécessaire pour la solution avec bypass. Si le propriétaire refuse un secret en URL Stripe, envisager un petit endpoint public dédié dans un projet Vercel séparé, toujours protégé par signature, plutôt que déprotéger le portail entier. [Exceptions officielles](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions).

Tester les déclenchements sans cookies ni session navigateur, sans redirection, et avec des paramètres de requête : les routes locales qui comparent `req.url` exactement devront parser le chemin. Le nouveau domaine, les gardes d'origine, les secrets et les protections sont des points de validation distincts.

## Coûts et changement éventuel de forfait

- **Vercel Pro**, si nécessaire ou déjà souscrit : tarif publié de 20 USD/mois, un siège de déploiement et 20 USD de crédit d'usage inclus ; sièges supplémentaires à 20 USD/mois. Le coût marginal n'est pas un nouvel abonnement si l'équipe paie déjà Pro. [Forfait Pro](https://vercel.com/docs/plans/pro-plan).
- **Vercel compute** : CPU actif, mémoire provisionnée et invocations. Hobby inclut 4 h CPU, 360 Go-h et un million d'invocations mensuelles. À Montréal, tarifs Pro publiés : 0,147 USD/h CPU, 0,0122 USD/Go-h ; exemple officiel d'invocations à 0,60 USD/million. Région réelle et consommation actuelle inconnues. [Tarifs Fluid Compute](https://vercel.com/docs/functions/usage-and-pricing).
- **Illustration calculée, pas un devis** : 1 000 documents bilingues, chacun 20 s CPU et 30 s d'exécution à 2 Go, donnent 5,56 h CPU et 16,67 Go-h, soit environ **1,02 USD de compute PDF** aux tarifs Montréal, avant crédit, réseau, retries, appels de statut et autres services. Ce scénario dépasserait les 4 h CPU Hobby. Deux réveils par minute pendant 30 jours représentent 86 400 invocations, environ 0,052 USD d'invocations seules sur Pro, plus leur compute ; filtrer les files vides réduit les appels.
- **Supabase** : Free inclut notamment 500 Mo de base, 1 Go Storage et 5 Go de sortie ; pause annoncée après une semaine d'inactivité. Ne pas promettre un service continu avec un projet suspendable ni utiliser un cron comme garantie contre cette pause. Pro commence à 25 USD/mois avec le premier projet ; projets supplémentaires à partir de 10 USD/mois, selon compute et usage. Aucun nouveau projet nécessaire par principe si PREPROD existe déjà. Forfait Supabase réel non lu ce soir. [Tarifs Supabase](https://supabase.com/pricing).
- **Stripe sandbox** : les transactions fictives ne déplacent pas de fonds. Les coûts réels à budgéter ici sont ceux de l'hébergement et de l'exploitation, sans introduire de frais réels ni changer les règles HSP. [Tests Stripe](https://docs.stripe.com/testing).

Ni Redis, ni un service Chromium facturé séparément, ni un ordonnanceur tiers ne sont nécessaires à la proposition initiale. L'usage de Supabase Cron consomme des ressources de la base existante ; ce n'est pas une promesse de capacité gratuite illimitée. Confirmer Billing, Usage, alertes/plafonds de dépense et forfait Supabase avant décision. Aucune activation effectuée.

## Alternative uniquement si l'essai Vercel échoue

Si les rendus dépassent de manière répétée la mémoire ou la durée retenue malgré un traitement séquentiel, le repli le plus simple serait **un seul Background Worker Render** en conteneur Node/Chromium, qui interroge les files Supabase et téléverse dans le Storage existant. Conserver API/webhooks sur Vercel et ne pas ajouter de base/Redis. Un worker Render tourne en continu et ne reçoit pas de trafic entrant ; les baux et la reprise restent à notre charge. [Workers Render](https://render.com/docs/background-workers).

Prévoir une instance `1c-2g` (1 CPU, 2 Go, ancien nom Standard) comme point de départ à tester ; 512 Mo n'est pas une capacité Chromium validée. Le tarif effectif et les frais du workspace sont **à confirmer** : la page de prix consultée n'a pas exposé son tableau chiffré dans la réponse lisible, donc aucun prix mensuel Render n'est certifié ici. Ce serait un service payant supplémentaire à administrer, sans bénéfice démontré pour notre faible volume avant essai Vercel. [Plans Render](https://render.com/docs/compute-plans), [tarification](https://render.com/pricing).

## Étapes de reprise et preuves manquantes

1. Propriétaire : relever le forfait **de l'équipe qui possède le projet**, Fluid/Active CPU, runtime Node, durée/mémoire effectives, région, environnement Vercel du domaine PREPROD et quotas Supabase. Aucun secret à envoyer dans la conversation. Ces informations peuvent confirmer ou modifier la branche Hobby/Pro de cette recommandation.
2. Après reprise autorisée : préparer les adaptateurs et le déclenchement Supabase, borner la concurrence, rendre la réception Stripe durable/rapide et préserver l'intégrité des téléchargements. Conserver les versions de rendu et les pièces existantes.
3. Essai technique isolé autorisé ultérieurement : taille du bundle, Chromium à froid, FR/EN volumineux, mémoire/durée, téléchargements au-delà de 4,5 Mo, signatures réelles plateforme/Connect, permissions et nouvelle origine vétérinaire. Mesurer et publier les résultats, sans extrapoler depuis le certificat vétérinaire.
4. Qualification sans Codespaces/CLI/visiteur : créer de nouvelles pièces fictives, fermer les clients, observer les deux files jusqu'à complétion ; interrompre un worker, simuler un réveil perdu et une erreur Storage, rejouer les événements ; vérifier reprise, doublons, facture unique et récupération HSP unique. Les tests de panne sont à simuler sur environnement isolé, pas à provoquer en PROD.

**Livraison de ce soir : documentation uniquement.** Les preuves nouvelles sont la lecture du code, des tailles de fichiers, des sources officielles et les GET anonymes sans effet métier. Aucun test de génération ou de file distante n'a été exécuté. Reprise dans `/workspaces/HorseShowPlatform/.worktrees/billing-hsp-direct`, branche `feat/billing-hsp-direct-prototype`, au commit documentaire poussé contenant ce complément. Prochaine action : confirmer le forfait et les paramètres effectifs, puis préparer l'essai technique avant toute promotion.
