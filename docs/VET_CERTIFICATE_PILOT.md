# Portail pilote de certificats vétérinaires

Pilote local mis à jour le 6 septembre 2026, branche `feat/vet-vaccination-certificates-pilot-2026-09-05`.
Départ vérifié : `preprod` et `origin/preprod` identiques à `ecd9d59e1ed3ead0aca5dc17b79ac51d3a579e6a`, worktree propre, après `git fetch origin preprod`.
Aucun push, aucune PR, aucun déploiement, aucune migration PREPROD/PROD.

## Ce qui est disponible

- `/vet` en local, ou interface sélectionnée lorsque le domaine commence par `vet.`. Aucun nouveau domaine configuré.
- Connexion Supabase HSP existante, sans inscription vétérinaire publique.
- Administration HSP : création/autorisation/suspension des émetteurs, attribution/retrait d'accès par courriel d'un compte HSP déjà existant.
- Liste de vétérinaires responsables sans compte Auth ; chaque employé agit sous son propre compte.
- Brouillons, plusieurs administrations, couverture indépendante influenza/EHV-1/EHV-4, recherche et création centrales contrôlées.
- Émission atomique/idempotente avec signature automatique autorisée, numéro public court, UUID interne conservé, instantané immuable, auteur initial et utilisateur émetteur distincts.
- Autorisation préalable du vétérinaire liée au compte personnel de l’utilisateur qui la demande et à la clinique ; aucun lien avec l’appareil utilisé ensuite.
- PDF signé, dates françaises (Québec), QR de vérification du statut, envois exclusivement capturés dans Mailpit.
- Suppression des brouillons avec confirmation et audit ; aucun effacement de certificat émis.
- Correction par nouveau brouillon ; remplacement seulement à l'émission de la correction ; révocation avec motif réservée à l'administrateur HSP.
- Historique de vaccinations conservé, conformité à la demande selon la date, sources et raisons, exclusion des preuves révoquées/remplacées.
- Consultation de l'historique certifié dans le formulaire HSP du cheval via une projection sans coordonnées personnelles.
- Adaptateur OMVQ navigateur, cache positif, fraîcheur configurable, worker HTTP **local uniquement**.

## Préparer Supabase local

Docker et les dépendances npm du dépôt sont nécessaires. Ne pas utiliser de projet lié à une base distante.
Le workdir temporaire sépare les outils locaux du dépôt. Les commandes ci-dessous ne ciblent que ce workdir et `--local`.

Première initialisation, uniquement si `/tmp/hsp-vet-local/supabase/config.toml` n'existe pas :

```bash
mkdir -p /tmp/hsp-vet-local
./node_modules/.bin/supabase init --workdir /tmp/hsp-vet-local
```

Copier les migrations versionnées et le seed local, puis démarrer :

```bash
cp -R supabase/migrations /tmp/hsp-vet-local/supabase/
cp supabase/seed.sql /tmp/hsp-vet-local/supabase/seed.sql
./node_modules/.bin/supabase start --workdir /tmp/hsp-vet-local -x studio,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor
```

Si cette pile locale existe déjà, ajouter les nouvelles migrations sans effacer les essais en cours :

```bash
./node_modules/.bin/supabase migration up --local --workdir /tmp/hsp-vet-local
```

Ces exclusions suffisent au pilote. Elles ne constituent pas une validation des services Storage, GVL/NRHA ou Realtime en fonctionnement distant.
La CLI peut afficher « branch main » pour son workdir temporaire ; la branche Git du dépôt HSP reste la branche de fonctionnalité.

## Tester le parcours à la main

Terminal frontend :

```bash
VET_LOCAL_WORKDIR=/tmp/hsp-vet-local npm run vet:local -- dev
```

Ouvrir **http://127.0.0.1:5173/vet**.
Les lanceurs obtiennent leurs clés avec `supabase status` dans le workdir local et refusent une URL de base non loopback. Ils n'écrivent aucun fichier de secrets.

1. Compte administrateur du seed local : `phase1.platform@example.test`, mot de passe `phase1-password`.
2. Ouvrir « Administration HSP », créer un émetteur avec ses coordonnées.
3. Accorder l'accès à `phase1.org-a-secretary@example.test` (même mot de passe local).
4. Autoriser OMVQ/émission dans la configuration et choisir la fraîcheur maximale (défaut proposé : 24 h ; plage 1–168 h).
5. Se déconnecter, puis utiliser le compte secrétaire.
6. Ajouter un vétérinaire responsable : aucun compte de ce vétérinaire n'est requis.
7. Créer un brouillon et saisir les coordonnées fournies par le propriétaire/agent.
8. Dans « Rechercher le cheval dans HSP », saisir le nom du cheval et du propriétaire ; enregistrement et micropuce sont facultatifs. Aucune association n’est demandée. Cliquer « Rechercher le cheval », puis « Sélectionner ce cheval » si une fiche correspond.
9. Après la recherche seulement, « Créer ce cheval dans HSP » reprend les données saisies. Le courriel du propriétaire est facultatif pour la création ; au moins un courriel propriétaire/agent est obligatoire pour l’émission. Le serveur refait la recherche, demande une confirmation motivée pour un homonyme et refuse de dupliquer une micropuce ou un enregistrement existant. Un propriétaire identifié par un courriel unique et un nom concordant est réutilisé. Le cheval est créé et rattaché atomiquement, sans perdre les vaccins déjà saisis.
10. Ajouter les administrations, produits, lots, dates et maladies.
11. Vérifier OMVQ. Depuis le compte personnel qui émettra les certificats, demander l’autorisation préalable : le vétérinaire lit le mandat et signe sur l’appareil de la clinique, ou ouvre son lien personnel à usage unique reçu dans Mailpit, sans compte HSP. Le mandat identifie la clinique ET le compte autorisé. Il ne doit être recueilli qu’une fois pendant sa validité ; un autre compte doit avoir son propre mandat. Cliquer ensuite « Émettre le certificat » : vérification, signature automatique, émission et historique vaccinal sont atomiques.
12. Télécharger le PDF, puis envoyer au propriétaire/agent dans Mailpit. Consulter le QR ou `/vet/verify/NUMERO` pour le statut sans coordonnées personnelles. Une correction crée un brouillon et une nouvelle signature automatique à l’émission, sous réserve du mandat toujours actif. « Supprimer le brouillon » ne supprime ni le cheval ni les certificats émis. La révocation nécessite le compte administrateur et un motif non vide, même court.

Un compte HSP ordinaire, par exemple `phase1.org-a-owner@example.test`, ne reçoit aucun droit vétérinaire sans attribution explicite.

## Worker OMVQ local et interrupteurs

Playwright est déjà une dépendance de développement HSP : aucune dépendance npm lourde ni aucun service externe n'a été ajouté.
Installer son navigateur local si nécessaire :

```bash
./node_modules/.bin/playwright install chromium --only-shell
```

Puis, dans un deuxième terminal :

```bash
VET_LOCAL_WORKDIR=/tmp/hsp-vet-local VET_OMVQ_ENABLED=true npm run vet:local -- worker
```

Dans l'environnement de développement de cette livraison, le navigateur existe déjà sous `/tmp/hsp-omvq-browser` : ajouter `PLAYWRIGHT_BROWSERS_PATH=/tmp/hsp-omvq-browser` aux commandes de worker/tests navigateur.

- Le worker écoute uniquement `127.0.0.1:54330` ; origine autorisée par défaut : `http://127.0.0.1:5173` (`VET_WEB_ORIGIN` configurable, loopback obligatoire).
- `VET_OMVQ_ENABLED` doit être exactement `true` ; la configuration en base doit aussi autoriser OMVQ.
- La désactivation en base bloque les nouvelles émissions, même avec une preuve en cache ; elle n'invalide pas les certificats déjà émis.
- Le worker valide le JWT, appelle une RPC d'autorisation sous l'identité de l'utilisateur, utilise un cache positif frais et enregistre le résultat via une RPC exclusivement serveur.
- Une seule recherche navigateur simultanée, intervalle minimal 30 secondes, 30 demandes par utilisateur/heure. Pas de boucle de retry externe.
- La dernière tentative non positive empêche de réutiliser une ancienne preuve positive.
- Seuls nom, permis, statut, date, méthode et résultat sont conservés, avec les références métier nécessaires. Pas de HTML, capture, HAR, cookies ou coordonnées de la fiche OMVQ.
- Les préfixes `Dr`/`Dre` et suffixe `m.v.` sont retirés pour la comparaison ; les accents décomposables, espaces et casse sont normalisés. Le nom complet, le permis exact et le statut Actif restent nécessaires. La recherche des chevaux/propriétaires conserve sa comparaison initiale.
- Le pilote reconnaît strictement le format de permis régulier observé. Tout autre format ou statut inconnu est ambigu et ne valide rien.
- Aucune requête interne ZK reconstruite : ouverture normale, saisie du permis, bouton Rechercher, lecture des trois champs dans une fiche unique.

## Compatibilité Vercel et décisions restantes

L'application actuelle est une SPA Vite déployée statiquement. Le code Playwright n'entre pas dans le bundle frontend ; le worker n'est pas une route Vercel déployée.
Les limites documentées des fonctions Vercel (taille standard décompressée 250 Mo, runtime/mémoire/durée) ne prouvent pas que le binaire Chromium existant fonctionnera dans le projet hébergé. Aucun nouveau service n'est nécessaire pour la tranche locale.

Avant une version hébergée, choix à approuver : empaquetage d'un navigateur compatible dans une fonction Node Vercel, ou service de navigateur distinct. Il faudra valider runtime, poids, démarrage, quotas et coûts avant ajout. L'exécution distante reste désactivée et non validée.
Sources consultées : https://vercel.com/docs/functions/limitations ; https://www.omvq.qc.ca/conditions-utilisation.html ; https://omvq.connexence.com/robots.txt.
L'autorisation utilisateur du pilote ciblé est appliquée ; la clarification de la réutilisation avec l'OMVQ reste une étape avant exploitation élargie.

À confirmer avant usage réel : forme d'attestation/signature vétérinaire, fraîcheur retenue, règles d'événement et conservation des audits.

## Modèle et sécurité

`20260905000100_vet_certificate_pilot.sql` introduit les émetteurs, membres, praticiens, paramètres, vérifications, certificats, administrations par maladie, audit et sélections temporaires. Toutes les tables ont une RLS. Les clients n'ont aucun droit d'écriture directe ; les fonctions sensibles ont un `search_path` vide et des droits d'exécution explicites.

`20260905000200_vet_vaccination_compliance.sql` conserve l'évaluateur documentaire d'origine sous `evaluate_document_health_compliance`, compose les preuves vétérinaires avec le moteur public existant, et ajoute les projections de santé/historique. Les RPC et triggers d'inscriptions/réservations gardent leurs points d'entrée.

La clinique ne devient pas une association HSP. Les nouveaux chevaux et propriétaires ont des créateurs/liaisons utilisateur nuls ; l'audit vétérinaire conserve l'auteur. Un jeton de sélection est lié à l'acteur, la clinique et un instantané, avec expiration de dix minutes. Il ne confère aucun accès général au propriétaire ni aux autres chevaux/documents.

Un trigger central empêche les nouveaux doublons d'identifiants forts, avec verrou transactionnel : association + numéro pour les enregistrements, numéro global pour les micropuces. Les collisions historiques ne sont pas fusionnées. Le rapprochement nom/propriétaire est exact et confirmé humainement ; un même cheval sans identifiant fort peut encore être dupliqué en présence d'une identité propriétaire différente : revue manuelle requise.

## Limites volontaires de cette tranche

- Pas d’envoi de courriel réel, de SSO, d’invitations autonomes, de facturation ou de rappels. PDF et QR sont disponibles localement. Les URL Codespaces restent soumises aux droits GitHub sur les ports transmis ; aucune exposition publique du Codespace n’a été activée.
- Émission locale exige un cheval lié ; le rattachement après émission n'est pas proposé dans cette tranche.
- Une correction du nom/permis crée une nouvelle déclaration sans écraser l’ancienne. Une autorisation ne se transfère pas silencieusement à un autre vétérinaire ni à un autre compte.
- Une durée libre est conservée mais ne produit pas une date de validité calculée : sans date de rappel, l'état est incomplet.
- Les règles vaccinales d'organisation existantes restent la base (ancienneté maximale commune en mois, influenza et rhino). Rhino exige EHV-1 **et** EHV-4 pour les preuves du portail. Les anciens documents gardent leur interprétation historique ; leur couverture détaillée n'est pas inventée.
- Une politique exigeant une identité documentaire `verified` ou une revue d'association conserve une attente : l'OMVQ ne vérifie pas l'identité du cheval et cette tranche n'ajoute pas de revue vétérinaire d'association.
- Le dossier central donne une projection des sources, pas un accès aux instantanés privés de la clinique.
- Liste pilote limitée aux 100 certificats les plus récents ; pagination avancée et politique de purge des sélections temporaires à prévoir.
- Le calcul est à la demande : actualiser les écrans après une action ou un changement de date. Aucun booléen vaccinal persistant.

## Tests

```bash
npm run test:vet
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsp-omvq-browser npm run test:vet:browser
VET_LOCAL_WORKDIR=/tmp/hsp-vet-local npm run test:vet:sql
VET_LOCAL_WORKDIR=/tmp/hsp-vet-local PLAYWRIGHT_BROWSERS_PATH=/tmp/hsp-omvq-browser npm run test:vet:local
npm run build
```

Les tests navigateur OMVQ interceptent **toutes** les requêtes et utilisent des fixtures. Le test de parcours crée des données fictives locales et une preuve positive via le client serveur local ; il ne visite jamais OMVQ. L'émetteur créé par le test est suspendu à la fin ; ses données restent dans la base locale pour inspection. Ne pas confondre ces fixtures avec une vérification réelle.

Ne pas exécuter les suites SQL et E2E en parallèle sur la même base. Le lanceur SQL renvoie un code non nul si un test échoue, y compris les deux échecs préexistants, et conserve les sorties complètes dans `.tmp/vet-tests/sql-results.json`.
Voir [VET_PILOT_VALIDATION.md](VET_PILOT_VALIDATION.md) pour la référence et les résultats détaillés.

## Fichiers livrés

| Fichiers | Rôle |
| --- | --- |
| `supabase/migrations/20260905000100_vet_certificate_pilot.sql` | Tables, RLS, RPC, audit, émission et identités centrales |
| `supabase/migrations/20260905000200_vet_vaccination_compliance.sql` | Composition du moteur santé et projections d’historique |
| `src/features/vet/VetApp.tsx`, `vet.css` | Interface privée et administration pilote |
| `src/services/vetServices.ts` | Types et appels RPC du portail |
| `src/features/health/VaccinationHistory.tsx` | Historique certifié dans HSP |
| `server/vet/omvq.mjs`, `local-server.mjs` | Adaptateur navigateur remplaçable et worker local |
| `scripts/vet/omvq.test.mjs`, `omvq.browser.mjs` | Comparateur, worker et fixtures navigateur |
| `scripts/vet/local-pilot.mjs` | Parcours UI/API local avec preuve simulée |
| `scripts/vet/run-local.mjs`, `test-sql-local.mjs` | Lanceurs gardés contre les cibles distantes |
| `supabase/tests/vet_certificate_pilot.sql` | 51 assertions SQL du pilote |
| `docs/VET_CERTIFICATE_PILOT.md`, `VET_PILOT_VALIDATION.md` | Instructions et résultats |

Fichiers existants modifiés : `src/App.tsx` (entrée `/vet` chargée à la demande), `src/features/platformAdmin/PlatformAdminView.tsx` (lien), `src/features/horses/HorseEditForm.tsx` (historique) et `package.json` (commandes locales/tests). Aucune dépendance npm ajoutée, aucun changement de configuration Vercel.

### Accès depuis Codespaces

Démarrer `VET_LOCAL_WORKDIR=/tmp/hsp-vet-local npm run vet:local -- dev`, puis ouvrir le port 5173 transmis par Codespaces, chemin `/vet`. Le bouton « Portail vétérinaire » de l’accueil mène à cette même route. Le serveur refuse désormais de démarrer sur un autre port si 5173 est occupé.

Ce lanceur active exclusivement en développement local les relais `/__local-supabase` (Supabase sur 127.0.0.1:54321) et `/__local-vet` (worker sur 127.0.0.1:54330). Le navigateur utilise ainsi la même origine HTTPS que la page Codespaces. Seul le nom d’hôte exact du Codespace est autorisé par Vite. Les clés de service restent dans le worker. Aucun relais n’est inclus dans le build déployé.

Validation de l’accès : lien visible à 1440, 390 et 320 px sans débordement horizontal ; navigation et rechargement de `/vet` affichent « Connexion privée », aucune inscription vétérinaire ; connexion du compte local propriétaire refusée par le portail. Requête avec le nom d’hôte Codespaces : HTTP 200 ; worker sans authentification via le relais : HTTP 401. L’URL HTTPS externe exige la connexion GitHub du propriétaire du Codespace (redirection 302 pour une requête anonyme).


### Correction du vétérinaire, PDF et envois locaux

Le formulaire guide le remplissage en quatre étapes. Dans un brouillon, « Corriger le nom ou le permis » préremplit les informations ; l’enregistrement sélectionne une nouvelle déclaration et conserve le brouillon. Les anciennes fiches et les instantanés émis restent inchangés. Un accent oublié seul ne provoque plus `name_mismatch`. Un ancien résultat négatif n’est pas transformé en validation : relancer explicitement « Vérifier dans le répertoire OMVQ ».

Après émission, « Télécharger le certificat PDF » génère le PDF depuis l’instantané officiel, dans le worker local existant. Aucun actif externe ni JavaScript n’est exécuté pour produire le document. Les versions révoquées/remplacées sont marquées comme telles et ne peuvent pas être envoyées via le bouton de transmission. Le PDF distingue la vérification OMVQ de la signature apposée automatiquement sous autorisation préalable. Aucun statut de signature qualifiée ni valeur juridique particulière n’est revendiqué.

« Envoyer le PDF — test local » capture un message séparé par destinataire dans Mailpit sur le port 54324, avec une pièce jointe PDF. Les courriels sont préremplis lorsqu’ils figurent dans le certificat ; ils peuvent être précisés au moment de la transmission sans modifier l’instantané. Le bouton « Consulter les envois » affiche les tentatives. Une même demande ne renvoie pas un message déjà traité. Un résultat incertain nécessite de vérifier Mailpit avant de créer une nouvelle demande ; aucune reprise automatique aveugle.

Le transport utilise uniquement l’[API locale de Mailpit](https://mailpit.axllent.org/docs/usage/sending-messages/), sans appeler la fonction de relais. Aucun transport Resend réel n’est activé. La future mise en service des courriels réels nécessitera la validation de l’expéditeur/domaine et de l’environnement d’envoi. Aucun service externe ajouté. La bibliothèque légère `qrcode` génère le QR localement ; le navigateur Playwright déjà présent produit le PDF.

Migrations complémentaires : `20260905000300_vet_practitioner_corrections.sql` (déclarations corrigées et comparaison OMVQ), `20260905000400_vet_certificate_deliveries.sql` (journal RLS des transmissions, écriture réservée au worker). Appliquées uniquement au Supabase local, sans réinitialiser les données de travail.


## Autorisation personnelle et intégrité (6 septembre 2026)

L’autorisation est liée à `requested_by` (profil HSP personnel), au vétérinaire déclaré et à la clinique. L’appareil n’est qu’un moyen de saisir la signature initiale. Un autre employé ou administrateur ne peut pas emprunter le mandat pour émettre. Le vétérinaire voit le nom du compte autorisé, la clinique, son nom/permis vérifiés OMVQ et l’attestation avant d’accepter. La clinique peut révoquer le mandat ; une suspension de l’émetteur ou un retrait d’accès bloque l’émission.

Les liens contiennent 32 octets aléatoires, transmis dans le fragment URL puis retirés de la barre d’adresse. Seul SHA-256 du jeton est conservé dans Supabase ; ni le jeton ni son empreinte ne figurent dans les projections client. Le courriel personnel contient nécessairement le lien de consentement (capturé dans la boîte de test Mailpit), mais aucun journal applicatif ni table HSP ne conserve le jeton en clair. Expiration du lien par défaut : 30 minutes (5 à 120 configurables). Durée du mandat : 365 jours (1 à 365 configurables), figée dans la demande et affichée au vétérinaire. Une approbation consomme le lien sous verrou ; l’annulation, le remplacement et l’expiration empêchent sa réutilisation.

Chaque émission conserve une signature distincte : visuel du mandat, identité du vétérinaire, date, méthode automatique, mandat source, auteur du brouillon, compte émetteur, vérification OMVQ et contenu signé avec SHA-256. Les instantanés et les preuves signées sont immuables pour les clients. Le moteur santé et le téléchargement contrôlent l’intégrité de la preuve. Les certificats historiques sans signature restent conservés mais ne donnent plus une validation vaccinale reconnue et doivent faire l’objet d’une nouvelle version signée.

États : le certificat reste brouillon avant émission ; le panneau du vétérinaire distingue l’autorisation en attente, active, expirée, annulée ou révoquée. Après émission : « Signé et valide », « Remplacé par une correction » ou « Révoqué ». Il n’y a pas d’attente de signature individuelle par certificat, conformément au choix d’apposition automatique. La révocation d’un mandat empêche les émissions futures sans révoquer rétroactivement les certificats déjà émis.

Les migrations complémentaires `20260905000500`, `20260905000600` et `20260906000100` à `20260906000400` sont versionnées et appliquées uniquement au Supabase local, sans reset des données utilisateur.

## Simuler une autorisation pour les essais locaux

L’administrateur peut créer une autorisation fictive sans demander au vétérinaire de signer. Le worker doit être lancé explicitement avec :

```bash
VET_LOCAL_WORKDIR=/tmp/hsp-vet-local PLAYWRIGHT_BROWSERS_PATH=/tmp/hsp-omvq-browser VET_OMVQ_ENABLED=true VET_LOCAL_TEST_AUTHORIZATION=true npm run vet:local -- worker
```

Dans `/vet`, utiliser un compte administrateur, ouvrir un brouillon et sélectionner le vétérinaire. La vérification OMVQ positive et fraîche reste requise. Dans « Signature automatique — autorisation préalable », ouvrir « Simulation pour les tests locaux ». Laisser le compte cible vide pour autoriser son propre compte administrateur, ou saisir le courriel d’un compte déjà autorisé dans cette clinique. Cliquer « Créer l’autorisation de test », puis émettre depuis le compte cible.

Cette autorisation est valable 24 heures, révocable et liée au compte. Elle ne remplace pas une autorisation réelle active. Le serveur refuse l’option si le flag est absent, si le JWT est invalide ou si l’utilisateur n’est pas administrateur. La RPC de création simulée est réservée au service ; le parcours ordinaire ne peut pas demander la méthode de simulation.

Le PDF affiche « TEST — AUCUNE SIGNATURE RÉELLE », le portail et la page de vérification affichent TEST. L’empreinte du contenu signé conserve la provenance simulée. Ces certificats permettent de tester l’émission et le téléchargement mais ne constituent jamais une preuve vaccinale reconnue. Aucune vérification OMVQ positive n’est fabriquée par ce bouton. Les actions sont auditées avec l’administrateur et le compte cible.

Migrations locales : `20260906000500_vet_local_test_authorizations.sql`, `20260906000600_vet_authorization_method_guard.sql`. Aucune activation sur un environnement distant.

### Page ouverte par le QR

La page `/vet/verify/NUMERO` affiche aussi les renseignements figés du certificat : cheval et propriétaire, identifiants, écurie/agent, vaccinations (produits, fabricants, maladies, lots, dates), clinique, préparateur, vétérinaire, vérification et signature. Les coordonnées personnelles et courriels restent dans le PDF. Les données centrales modifiées après émission ne changent pas cette page. L’état actuel reste prioritaire : valide, remplacé, révoqué, non vérifié ou TEST.

Dans le tableau de conformité, « Certificat TEST — ne constitue pas une preuve vaccinale » explique le code interne `pending_verification` lorsque la preuve provient d’une autorisation simulée. Une véritable autorisation préalable reste nécessaire pour produire une preuve reconnue.
