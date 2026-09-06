# Worker vétérinaire PREPROD : rôle, hébergement et activation

## Diagnostic du code déployé avant adaptation

Le commit PREPROD `b6c011ddc8fdeaa05e2cf1dc2485a272531329e3` exposait une application Vite statique. `startLocalServer()` écoutait uniquement `127.0.0.1:54330`, refusait les bases non locales et utilisait un Chromium installé dans le Codespace. L’interface refusait les appels worker depuis un domaine hébergé. Il ne suffisait donc pas de régler une variable Vercel : aucun endpoint serveur déployable n’existait.

| Fonction | Dépendance technique directe | Condition en amont |
|---|---|---|
| OMVQ | Playwright + Chromium, accès HTTPS au formulaire public, RPC serveur pour enregistrer le résultat | Accès clinique et option OMVQ activés ; aucun résultat positif supposé |
| Autorisation/signature | Node pour jeton aléatoire/hachage et accès RPC restreint ; pas de navigateur serveur pour dessiner | Vérification OMVQ fraîche et consentement réel du vétérinaire |
| Émission et historique | RPC PostgreSQL existantes, sans Chromium ni appel worker à l’émission | OMVQ frais + autorisation valable pour le compte personnel ; simulation exclue de la conformité |
| PDF | Chromium pour imprimer l’HTML signé | Certificat émis et signature intègre |
| Courriels | Transport d’envoi ou capture privée de test ; Chromium seulement pour joindre le PDF | Lien d’autorisation créé ou certificat émis |
| QR / vérification | Page HSP et RPC publique minimale ; aucun worker à la consultation | Numéro d’un certificat émis |

Les signatures et instantanés restent dans les tables privées Supabase. Le PDF est régénéré à la demande. Le PDF joint à un courriel de test est conservé chiffré pendant 24 heures dans la boîte de test ; aucun bucket public n’est créé. Pas de cron nécessaire pour vérifier OMVQ : recherche ciblée à la demande, cache positif configurable, verrou global de 65 secondes, limite existante de 30 demandes par utilisateur/heure et temporisation navigateur de 45 secondes. Les messages expirés sont inaccessibles immédiatement et supprimés lors de la capture suivante.

## Solution retenue, sans nouvel abonnement

Une fonction Node Vercel `/api/vet/[action]` utilise `playwright-core@1.62.1` et `@sparticuz/chromium@149.0.0`. Les deux packages représentent environ 81 Mo installés ; le navigateur est embarqué dans le déploiement, sans téléchargement tiers à chaque requête. La fonction est limitée à 60 secondes et au PREPROD exact (branche, environnement et référence Supabase). Les requêtes mutantes exigent l’origine PREPROD exacte. La simulation locale n’est jamais exposée par cette API.

L’accès aux secrets n’est pas requis pour livrer le code par PR. Il faut une permission Vercel permettant de modifier les variables du projet et de redéployer pour l’activation. Un rôle de propriétaire de toute l’équipe n’est pas intrinsèquement nécessaire. Le jeton GitHub de cette session permet le déploiement Git, mais n’est pas un jeton d’administration Vercel. Les paramètres privés du plan et les secrets ne sont pas visibles dans cette session.

La documentation officielle Vercel indique 250 Mo par fonction standard, 2 Go de mémoire sur Hobby et 4 Go maximum sur Pro/Enterprise, 4,5 Mo par requête/réponse et jusqu’à 300 secondes sur Hobby avec Fluid Compute. Notre limite de 60 secondes évite de nécessiter ces durées étendues. Le PDF est plafonné à 4 Mio et la boîte chiffrée à moins de 4 millions de caractères par message. Aucun opt-in aux fonctions de 5 Go n’est demandé.

Supabase Edge Functions ne convient pas à ce binaire embarqué : 256 Mo de mémoire, 2 secondes de CPU par requête et bundle de 20 Mo via CLI. L’exemple officiel Puppeteer utilise un navigateur distant ; cela ajouterait un service dont nous n’avons pas besoin pour cette solution.

Coût : aucun abonnement supplémentaire souscrit. La consommation s’ajoute au plan Vercel existant ; son plan/crédit restant n’est pas observable ici. Illustration indicative à `iad1` : 1 000 appels de 30 secondes à 2 Go avec 10 secondes de CPU actif chacun coûtent environ 0,53 USD de calcul hors crédits, transfert et stockage (0,128 USD/h CPU + 0,0106 USD/Go-h mémoire). Un parcours comprend plusieurs appels ; cette estimation n’est pas une facture garantie. Une limite de dépense existante doit rester en place.

Sources officielles consultées le 6 septembre 2026 :
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/functions/usage-and-pricing
- https://vercel.com/docs/environment-variables
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/functions/examples/screenshots
- https://github.com/Sparticuz/chromium (exemple Playwright)

## Variables et actions dans Vercel

Projet : **horse-show-platform**, équipe **felix-gadreau-girard-s-projects**.

1. Ouvrir **Settings → Environment Variables → Add Environment Variable**. Sélectionner **Preview**, puis limiter chaque ajout à la branche **preprod**. Ne rien ajouter à Production ni à toutes les branches Preview.
2. Ajouter les paramètres suivants :

| Nom | Source / valeur à régler | Secret |
|---|---|---|
| `VET_SUPABASE_SERVICE_ROLE_KEY` | Supabase **Horse Show Platform PREPROD**, référence `qaguotdproxamgudnnsd` → Project Settings → API Keys → clé serveur `service_role` (ou nouvelle clé secrète serveur) | Oui, jamais `VITE_` |
| `VET_PREPROD_OUTBOX_KEY` | Nouvelle clé aléatoire de 32 octets encodée en base64 ; par exemple générer avec `openssl rand -base64 32` dans votre terminal puis la saisir directement dans Vercel | Oui, jamais dans la conversation |
| `VET_WORKER_ENABLED` | `true` | Non |
| `VET_OMVQ_ENABLED` | `true` | Non |

`VITE_DEPLOY_ENV=staging`, `VITE_SUPABASE_PROJECT_REF=qaguotdproxamgudnnsd`, `VITE_SUPABASE_URL` et la clé publique HSP existante sont réutilisés. L’origine de signature et du QR est fixée à `https://horse-show-platform-git-preprod-felix-gadreau-girard-s-projects.vercel.app`. `VERCEL_GIT_COMMIT_REF` est fourni par Vercel. Aucun token OMVQ, clé Resend ou mot de passe SMTP n’est requis.

3. Dans **Deployments**, choisir le dernier déploiement de **preprod**, puis **Redeploy**. Vérifier que la branche et l’environnement sont PREPROD/Preview ; ne pas utiliser « Promote to Production ».
4. Ouvrir `/api/vet/health` sur l’origine PREPROD. Il affiche seulement `ready`, `omvq`, `mail`, les flags et les noms des variables absentes. Aucune valeur secrète. La clé de boîte absente bloque uniquement la capture des courriels, pas la signature sur appareil ou le PDF.
5. Se connecter à `/vet` avec le compte administrateur PREPROD et cliquer sur **Tester le navigateur PREPROD**. Ce diagnostic ne contacte pas l’OMVQ et fonctionne avant même l’ajout de la clé serveur, grâce à la clé publique et au rôle administrateur existants.
6. Dans **Administration HSP — émetteurs et accès**, autoriser OMVQ et enregistrer la configuration lorsque le diagnostic est réussi. L’émission exige toujours une véritable autorisation préalable ; ne pas faire signer un test en prétendant être le vétérinaire.
7. Dans GitHub → **Actions → Veterinary PREPROD verification → Run workflow**, choisir **preprod**. Le scénario attend les services, utilise une recherche réelle ciblée pour 4887 et capture les courriels uniquement dans HSP. Si la recherche est indisponible ou divergente, il échoue sans fabriquer une preuve positive.

La protection Vercel des previews demeure en place. Un vétérinaire testant un lien sans compte HSP doit néanmoins avoir accès au déploiement PREPROD protégé. Ne pas ajouter le secret d’automatisation Vercel aux QR/liens personnels ; les tests automatisés utilisent ce secret uniquement dans l’en-tête vers l’origine PREPROD.

## Courriels de test et consentement

La boîte privée apparaît dans le portail. Elle contient uniquement les messages créés par le compte connecté dans sa clinique active. Les liens et pièces jointes sont chiffrés avec AES-256-GCM et une donnée associée liée à l’identifiant du message ; aucun jeton de signature n’est stocké en clair. Les RPC de signature conservent uniquement son SHA-256. Une rotation de la clé rend les anciens messages illisibles : vider/laisser expirer cette boîte de test avant rotation ; les certificats et signatures canoniques restent intacts.

Le scénario automatisé peut tester la chaîne technique d’émission avec un mandat explicitement TEST, après une vraie vérification OMVQ. Ce certificat demeure TEST et ne donne jamais un état vaccinal reconnu. La signature/autorisation réelle d’un vétérinaire ne peut pas être remplacée par le robot : c’est une validation humaine distincte. Aucune donnée OMVQ simulée n’est écrite en PREPROD.

## Arrêt et récupération

Couper `VET_OMVQ_ENABLED` puis redéployer arrête les nouvelles recherches serveur ; désactiver OMVQ dans l’administration HSP arrête aussi l’émission. `VET_WORKER_ENABLED=false` neutralise toutes les opérations worker sauf le diagnostic administrateur en lecture seule. Les brouillons et certificats restent conservés. La migration `20260906000800_vet_preprod_worker.sql` ajoute seulement le verrou, la boîte privée et les statuts de capture ; aucune identité, signature ou preuve de test n’est insérée.
