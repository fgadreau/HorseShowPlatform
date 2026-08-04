# Méga robot de tests préproduction

Le robot Playwright crée un utilisateur et une association jetables, utilise les
vrais formulaires HSP, puis supprime uniquement les données de son exécution. Il couvre
actuellement la connexion, la création et l'ouverture
d'un concours, une annonce publique et la saisie de contacts variés.

## Garde-fous

Une exécution avec écriture est refusée sauf si toutes ces conditions sont vraies :

- `E2E_ALLOW_WRITES=true` est explicite;
- l'environnement est `local`, `development`, `staging`, `preview` ou `test`;
- la référence extraite de l'URL Supabase correspond à la référence déclarée;
- la référence courante est différente de la référence PROD;
- le nom de l'association commence par `[E2E]`, son slug par `e2e-` et le compte
  utilise `example.test` avant tout nettoyage.

Le `service-role` demeure uniquement dans le processus Node de test. Il n'est
jamais transmis au navigateur ou à Vite. Il sert à créer le compte jetable,
retrouver l'association exacte et effectuer le nettoyage final. L'association
est créée par la fonction Supabase officielle avec la session de cet utilisateur;
les opérations fonctionnelles suivantes passent par l'interface et les politiques
RLS normales.

Si un processus est interrompu avant le nettoyage final, le lancement suivant
lit l'ancien état E2E et le nettoie de façon ciblée avant de créer un nouveau
`runId`.

## Exécution locale

Pré-requis : Supabase local démarré, migrations et seed appliqués, puis Chromium
Playwright installé une fois.

```bash
npx supabase start
npx supabase db reset
npm run test:e2e:install
npm run test:e2e:local
```

Le lanceur local récupère les clés du Supabase local sans les écrire sur disque.
Il réutilise `VITE_PRODUCTION_SUPABASE_PROJECT_REF` de la configuration du dépôt
pour conserver le garde-fou anti-PROD.

Pour le jeu nocturne plus volumineux :

```bash
npm run test:e2e:local:mega
```

## Exécution en préproduction

Créer `.env.e2e.local` depuis `.env.e2e.example`, ou injecter les mêmes valeurs
depuis le gestionnaire de secrets CI :

```text
E2E_BASE_URL=https://<url-preprod-hsp>
E2E_DEPLOY_ENV=staging
E2E_ALLOW_WRITES=true
E2E_SUPABASE_URL=https://<ref-preprod>.supabase.co
E2E_SUPABASE_PUBLISHABLE_KEY=<clé publique preprod>
E2E_SUPABASE_SERVICE_ROLE_KEY=<secret preprod, serveur seulement>
E2E_SUPABASE_PROJECT_REF=<ref-preprod>
E2E_PRODUCTION_SUPABASE_PROJECT_REF=<ref-prod>
VERCEL_AUTOMATION_BYPASS_SECRET=<secret automation du projet Vercel>
```

Le dernier secret est transmis à Vercel par les en-têtes
`x-vercel-protection-bypass` et `x-vercel-set-bypass-cookie`. Le Preview reste
protégé pour le public; seul le robot autorisé contourne la page SSO.

Puis lancer :

```bash
npm run test:e2e:smoke
npm run test:e2e:mega
```

`smoke` crée trois contacts représentatifs. `mega` en crée 25 par défaut.
`E2E_DATASET_SIZE` permet de choisir de 1 à 100 contacts. Les valeurs sont
reproductibles pour un `runId` et incluent accents, apostrophes, Unicode,
coordonnées réalistes et une longueur limite de champ.

## Rapports et diagnostic

- rapport HTML : `playwright-report/index.html`;
- traces, vidéos et captures en échec : `test-results/e2e`;
- `E2E_KEEP_DATA=true` conserve exceptionnellement le jeu jetable pour inspection.

Lorsque des données sont conservées, supprimer manuellement seulement
l'association `[E2E]` correspondant au `runId`, puis le compte `example.test`.
Ne jamais activer cette option dans l'exécution nocturne.

## Automatisation GitHub

Le workflow `.github/workflows/preprod-e2e.yml` lance un `smoke` à chaque mise à
jour de la branche permanente `preprod`, lance le mode `mega` chaque nuit,
permet un déclenchement manuel `smoke` ou `mega` et expose `workflow_call` pour
être appelé par un autre déploiement. Les variables non sensibles sont
configurées dans GitHub Variables et les clés dans GitHub Secrets. Le rapport
Playwright est téléversé comme artefact même en cas d'échec.

Le déclenchement nocturne est défini sur la branche par défaut `main`, mais sa
cible demeure toujours l'URL et le projet Supabase de `preprod`. Les garde-fous
comparent également la référence Supabase avec celle de PROD avant toute
écriture.
