# Méga robot de tests préproduction

Le robot Playwright crée un utilisateur et une association jetables, utilise les
vrais formulaires HSP et ShowScore, puis supprime uniquement les données de son
exécution. Il couvre le parcours métier complet : création du concours, contacts,
bloc et classe, inscriptions, ordre de passage, saisie annonceur, approbation du
secrétariat, championnat, calcul des bourses et publication des résultats.

La classe testée est configurée comme une vraie classe sanctionnée : frais
d'inscription et de juge, argent ajouté, trophée, retenue de l'organisateur,
redevance à l'association sanctionneuse, critères d'admissibilité et grille de
répartition des prix. Le robot vérifie les montants dans l'interface et dans la
base avant et après le retour de ShowScore vers HSP.

Pour rendre les inscriptions réellement admissibles, chaque cavalier reçoit un
cheval distinct avec un Coggins et un vaccin combiné approuvés ainsi qu'une
validation d'identité. Le robot ne contourne donc pas les contrôles de santé et
d'identification nécessaires avant la sortie de l'ordre de passage.

Les deux meilleurs scores sont à égalité afin de vérifier le partage des deux
premières parts de la bourse. À partir de cinq cavaliers, le robot ajoute aussi
un `No score` et un `Scratch`. Ces inscriptions demeurent dans les revenus de la
classe, mais elles ne sont pas ajoutées aux lignes actives du championnat. Les
23 résultats scorés du mode méga sont importés et le robot vérifie les 10 équipes
qui reçoivent effectivement des points selon la règle AQR.

Dans ShowScore, la gestion du show et de ses blocs forme une seule page. Le
robot confirme que les blocs de la journée active sont déjà présents sous les
onglets, que le lien intermédiaire `Ouvrir les blocs` a disparu et que les
anciennes URL de journée redirigent vers cette page canonique. Il change aussi
de journée dans cette gestion unifiée, l'annonceur, les scribes, le secrétariat,
l'horaire et le suivi du temps. Un marqueur navigateur confirme ces changements
dans la page courante, sans rechargement complet, puis le robot revient à la
journée contenant la classe avant de poursuivre le parcours. Dans la gestion
du show, il confirme aussi que la barre compacte de la journée active conserve
les actions `Modifier` et `Supprimer`.

Le même parcours garde cinq écrans publics ShowScore ouverts sans session
utilisateur : TV générale, TV filtrée sur l'arène du bloc, TV du manège principal
en mode compétition, TV livestream et source navigateur OBS. Le robot configure
et téléverse un petit MP4 réel pour le manège principal, vérifie sa lecture, puis
nettoie aussi ce média jetable. Il ouvre les trois vues TV principales par leurs
codes courts afin de vérifier les redirections publiques.

Tous les écrans sont validés en 1920 × 1080. Les TV générale, d'arène et de
compétition doivent afficher le cavalier en piste, le premier score, le `No score`,
le `Scratch` et l'état final du bloc. La TV livestream doit afficher son état
d'attente programmé; un vrai différé YouTube de cinq minutes nécessite un direct
externe avec DVR et demeure donc hors du jeu jetable. Un marqueur navigateur
prouve que les mises à jour arrivent sans rechargement de page. Le robot vérifie
aussi que le fond racine OBS est transparent et joint des captures de chaque vue
au rapport Playwright. Cette couverture valide les pages qui alimentent les
appareils; elle ne prétend pas tester les panneaux TV physiques, le logiciel OBS
installé ni l'encodage vidéo de l'ordinateur de diffusion.

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
E2E_SHOWSCORE_URL=https://<url-preprod-showscore>
E2E_DEPLOY_ENV=staging
E2E_ALLOW_WRITES=true
E2E_SUPABASE_URL=https://<ref-preprod>.supabase.co
E2E_SUPABASE_PUBLISHABLE_KEY=<clé publique preprod>
E2E_SUPABASE_SERVICE_ROLE_KEY=<secret preprod, serveur seulement>
E2E_SUPABASE_PROJECT_REF=<ref-preprod>
E2E_PRODUCTION_SUPABASE_PROJECT_REF=<ref-prod>
VERCEL_AUTOMATION_BYPASS_SECRET=<secret automation du projet Vercel>
SHOWSCORE_VERCEL_AUTOMATION_BYPASS_SECRET=<optionnel si ShowScore est protégé>
```

Le dernier secret est transmis à Vercel par les en-têtes
`x-vercel-protection-bypass` et `x-vercel-set-bypass-cookie`. Le Preview reste
protégé pour le public; seul le robot autorisé contourne la page SSO.

Puis lancer :

```bash
npm run test:e2e:smoke
npm run test:e2e:mega
```

`smoke` fait traverser le parcours à trois cavaliers représentatifs. `mega` en
fait traverser 25 par défaut. Chaque cavalier possède son contact, son cheval,
ses documents, son inscription, son passage ShowScore et son résultat HSP.
`E2E_DATASET_SIZE` permet de choisir de 1 à 100 cavaliers. Les valeurs sont
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
