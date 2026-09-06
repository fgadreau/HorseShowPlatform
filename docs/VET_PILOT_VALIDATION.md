# Validation du pilote vétérinaire — 5 septembre 2026

Branche locale : `feat/vet-vaccination-certificates-pilot-2026-09-05`. Référence initiale propre et synchronisée : `ecd9d59`. Aucun test sur une base distante.

## Résultats de référence et finaux

| Vérification | Avant modifications | Après modifications |
| --- | --- | --- |
| `test:draw` | Réussi | Réussi |
| `test:payout` | Réussi | Réussi |
| `test:paid-warmup` | 8/8 | 8/8 |
| `test:identity` | Réussi | Réussi |
| `test:governing` | Réussi | Réussi |
| `test:eligibility` | Réussi | Réussi |
| `test:capacity:config` | 5/5 | 5/5 |
| Build TypeScript + Vite | Réussi | Réussi |
| SQL existants autonomes | 27/29 | 27/29 |
| SQL pilote | Sans objet | 51 assertions réussies |
| Comparateur/worker `test:vet` | Sans objet | 7/7 |
| Navigateur OMVQ simulé `test:vet:browser` | Sans objet | 3/3 |
| Parcours vertical UI + API local | Sans objet | Réussi |
| Smoke E2E HSP existant | Bloqué en préparation : PGRST116 | Même blocage |
| Rejeu complet des migrations depuis une base locale neuve | Réussi pour le schéma initial | Réussi avec les deux migrations pilote |

Le build garde son avertissement préexistant concernant les bundles dépassant 500 ko. Le bundle vétérinaire est chargé à la demande. Aucun navigateur n’est intégré au bundle frontend.

## Matrice SQL complète

Les 29 fichiers existants ci-dessous sont exécutés séparément. Les fichiers `fixture`, `assertions` et `flow_seed` destinés à des scénarios de reconstruction/préproduction ne sont pas des suites autonomes et ne sont pas lancés isolément. Aucun scénario PREPROD/PROD n’est exécuté.

| Fichier | Référence | Final |
| --- | --- | --- |
| `audited_horse_identity_corrections.sql` | Réussi | Réussi |
| `bloc1_integrated_workflows.sql` | Réussi | Réussi |
| `bloc3_final_validation.sql` | Échec préexistant | Même échec |
| `blocks_classes_core.sql` | Réussi | Réussi |
| `class_governing_bodies_integration.sql` | Réussi | Réussi |
| `compatibility_views_security_invoker.sql` | Échec préexistant | Même échec |
| `configurable_eligibility_requirements.sql` | Réussi | Réussi |
| `directory_identity_authority.sql` | Réussi | Réussi |
| `entry_reservation_health_compliance.sql` | Réussi | Réussi |
| `external_sources_catalog.sql` | Réussi | Réussi |
| `foundation_catalogs_directories.sql` | Réussi | Réussi |
| `horse_creator_access.sql` | Réussi | Réussi |
| `horse_document_identity_validations.sql` | Réussi | Réussi |
| `horse_documents_independence.sql` | Réussi | Réussi |
| `horse_health_compliance.sql` | Réussi | Réussi |
| `horse_health_compliance_presentation.sql` | Réussi | Réussi |
| `identity_similarity_search.sql` | Réussi | Réussi |
| `incentive_nomination_programs.sql` | Réussi | Réussi |
| `organization_health_policies.sql` | Réussi | Réussi |
| `phase1_rls.sql` | Réussi | Réussi |
| `results_payouts.sql` | Réussi | Réussi |
| `showscore_announcer_paid_warmup_live.sql` | Réussi | Réussi |
| `showscore_announcer_session_initialization.sql` | Réussi | Réussi |
| `showscore_public_broadcast.sql` | Réussi | Réussi |
| `showscore_secretary_schedule_writes.sql` | Réussi | Réussi |
| `stall_booking_invoice.sql` | Réussi | Réussi |
| `targeted_context_showscore.sql` | Réussi | Réussi |
| `team_eligibility_decisions.sql` | Réussi | Réussi |
| `verified_horse_identity_locks.sql` | Réussi | Réussi |
| `vet_certificate_pilot.sql` | Sans objet | Réussi |

## Échecs préexistants conservés

- `bloc3_final_validation.sql` attend une conformité A positive à `current_date`. Au 5 septembre 2026, les preuves du seed conduisent à un résultat non conforme avec vaccin expiré. L’association B donne bien `not_required`. Même échec avant/après.
- `compatibility_views_security_invoker.sql:106` attend une journée d’association ; la requête en retourne trois. Même message avant/après.
- Le smoke E2E HSP échoue dans sa préparation avec `PGRST116`, « The result contains 0 rows / Cannot coerce the result to a single JSON object ». Les parcours de cette suite ne démarrent donc pas. Aucun succès E2E HSP global n’est revendiqué.

Ces tests existants n’ont pas été modifiés pour masquer les erreurs. Les tests santé, identité documentaire, politiques, inscriptions, réservations, permissions et ShowScore détaillés dans la matrice passent.

## Couverture nouvelle

- Accès ordinaire refusé, RLS et RPC directes, isolation A/B, jeton de sélection interclinique rejeté.
- Suspension immédiate malgré un JWT encore valide ; refus des écritures directes et de la RPC serveur de vérification.
- Vétérinaire sans compte HSP ; permis, nom et statut non conformes empêchent une validation positive ; preuve absente, inactive ou trop ancienne refuse l’émission.
- Émission idempotente, trois maladies pour une administration, instantané propriétaire immuable, création centrale sans droits implicites.
- Prévention des doublons forts, nom seul insuffisant, confirmation requise, propriétaire et autres chevaux inaccessibles à la clinique.
- Dates de produit et de validité distinctes, date de référence, moteur central, remplacement/révocation et conservation de l’historique.
- Lecture du dossier santé pour le propriétaire HSP, sans ouverture du répertoire privé des certificats de clinique.
- Comparaison NFC/accents/Dr/Dre/m.v., absence ou multiplicité de résultats, CAPTCHA/429 et échec navigateur sans contournement.
- Cache positif évitant navigateur et nouvelles écritures, désactivation et contrôle d’accès avant consultation.

Le parcours UI utilise un véritable Supabase local et une vraie session Auth locale. Une preuve OMVQ est injectée uniquement comme fixture locale via la RPC réservée au serveur. Le worker est également vérifié avec un vrai JWT local et cette preuve en cache. Aucune nouvelle requête réelle OMVQ n’a été faite pendant l’implémentation.

## Sorties complètes et reproduction

- `.tmp/vet-tests/baseline-sql.json` : stdout/stderr SQL de référence.
- `.tmp/vet-tests/sql-results.json` : stdout/stderr de chaque fichier SQL final.
- `.tmp/vet-tests/unit-build.json` : sorties complètes des suites unitaires et du build.
- `.tmp/vet-tests/local-pilot.txt` : sortie complète du parcours UI/API local final.
- `.tmp/vet-tests/sql-run.txt` : résumé du dernier passage de la matrice SQL.
- `.tmp/vet-tests/baseline-existing-e2e.txt` et `final-existing-e2e.txt` : erreur de préparation du smoke existant.

Ces artefacts locaux ignorés par Git restent consultables dans le workspace. Les commandes reproductibles et les limites du pilote figurent dans [VET_CERTIFICATE_PILOT.md](VET_CERTIFICATE_PILOT.md).

Les services externes GVL/NRHA, le vrai OMVQ, le Storage hébergé et les environnements PREPROD/PROD n’ont pas été sollicités par les tests de cette tranche. La compatibilité GVL est couverte au niveau des documents et du moteur SQL existants, pas par une requête GVL en direct.

## Suivi UX, accents, PDF et envois locaux — 2026-09-05

- `test:vet` : 11/11, dont comparaison sans accents avec maintien des refus nom/permis/statut, contenu PDF issu exclusivement de l’instantané, échappement HTML, destinataires et refus d’accès avant génération.
- `test:vet:browser` : 3/3 sur pages OMVQ simulées, aucune requête réelle au répertoire.
- `supabase/tests/vet_certificate_pilot.sql` : 60 assertions réussies, transaction annulée en fin de test ; corrections conservant les déclarations antérieures, comparaison OMVQ isolée du moteur d’identité central, journal des transmissions protégé. Les assertions sont limitées aux émetteurs des fixtures pour permettre l’exécution sans réinitialiser les essais manuels de l’utilisateur.
- Parcours UI/API local : ajout d’un nom erroné, correction enregistrée sur le même brouillon, refus d’émission sans vérification, validation fixture avec accent absent, émission immuable, trois maladies valides, PDF téléchargé, envois séparés propriétaire/agent capturés dans Mailpit, double clic idempotent et suspension immédiate. La vérification positive de ce scénario est une fixture locale explicitement simulée.
- Vérification de Mailpit : deux messages séparés, une pièce jointe PDF valide chacun. Aucun relais SMTP configuré ; aucun envoi externe.
- Build TypeScript/Vite réussi (avertissement préexistant sur les bundles >500 ko).
- Migrations `20260905000300` et `20260905000400` appliquées uniquement au Supabase local existant, sans reset. Les anciennes données de travail et les certificats émis sont conservés.
- Pour le scénario UI avec téléchargement/envoi, démarrer le worker local sur 54330 avec `PLAYWRIGHT_BROWSERS_PATH=/tmp/hsp-omvq-browser` avant `npm run test:vet:local`.

Les résultats détaillés de cette passe sont dans `/tmp/hsp-vet-ux-build.log`, `/tmp/hsp-vet-ux-sql.log` et `/tmp/hsp-vet-ux-browser.log`. Les limitations des suites historiques documentées plus haut restent distinctes ; elles n’ont pas été réexécutées pour cette correction ciblée.

## Parcours cheval, autorisation personnelle, signature automatique et suppression — 6 septembre 2026

Décision finale : le vétérinaire donne une autorisation préalable au compte personnel HSP qui la demande, au sein de la clinique. Le compte peut ensuite déclencher l’apposition automatique depuis tout appareil. Aucune signature individuelle de chaque certificat n’est demandée ; un autre compte ne peut pas utiliser ce mandat.

Résultats de la dernière passe :

| Validation | Résultat |
| --- | --- |
| Tests unitaires vétérinaires / PDF / dates / QR | 13/13 réussis |
| Adaptateur navigateur OMVQ sur fixtures | 3/3 réussis, aucune recherche réelle |
| SQL du pilote | 68 assertions réussies, rollback final |
| Ensemble des fichiers SQL existants + pilote | 28/30 ; mêmes deux échecs préexistants |
| Parcours UI/API local complet | Réussi, compte secrétaire + navigateur vétérinaire sans session HSP |
| Draw, payout, paid-warmup, identity, governing, eligibility, capacity:config | Tous réussis |
| Build TypeScript/Vite | Réussi ; avertissement préexistant bundles >500 ko |
| Git diff whitespace | Aucun problème |

Le parcours UI teste la recherche sans association et le formulaire prérempli, la correction du nom sans perte du brouillon, le refus sans OMVQ puis sans autorisation, la signature initiale à la souris sur l’appareil de la clinique, l’émission automatique immuable, les trois maladies, le téléchargement PDF, les envois Mailpit séparés et idempotents, puis un lien personnel signé au toucher dans un navigateur sans connexion HSP. Le lien disparaît de la barre d’adresse et ne peut plus être utilisé après signature. Sont également testés la nouvelle version avec une nouvelle empreinte/signature, les pages publiques valide/remplacé/révoqué, la révocation avec le motif court « test », la suppression d’un brouillon avec confirmation et la suspension de l’émetteur.

Les tests SQL couvrent aussi : ancienne RPC de création inaccessible, création impossible sans recherche ou avec un reçu consommé/expiré, rattachement immédiat, données vaccinales et agent conservées, réutilisation fiable du propriétaire par courriel, correspondance apparaissant après la recherche initiale, refus du doublon de micropuce même avec confirmation, isolation des cliniques, empreinte altérée refusée par le moteur santé, jeton haché non lisible par le client, expiration/annulation/réutilisation impossible, durée du mandat figée lors de la demande, impossibilité pour un autre compte (y compris administrateur) d’utiliser le mandat et contrôle des droits des fonctions privilégiées.

Les deux échecs SQL historiques restent `bloc3_final_validation.sql` (preuve vaccinale de fixture expirée à la date courante) et `compatibility_views_security_invoker.sql` (1 journée attendue, 3 présentes). Le smoke E2E général précédemment bloqué en préparation n’a pas été relancé ; aucun succès de cette suite globale n’est revendiqué.

Traces : `/tmp/hsp-vet-next-unit.log`, `/tmp/hsp-vet-next-adapter.log`, `/tmp/hsp-vet-next-sql.log`, `/tmp/hsp-vet-next-sql-suite.log`, `/tmp/hsp-vet-next-browser.log`, `/tmp/hsp-vet-next-build.log`, `/tmp/hsp-vet-next-regressions.json`. La sortie complète du passage sur 30 fichiers SQL est dans `.tmp/vet-tests/sql-results.json` ; les assertions ajoutées ensuite au pilote sont consignées dans le log SQL ciblé.

Toutes les migrations supplémentaires ont été appliquées avec `migration up --local` au workdir `/tmp/hsp-vet-local`, sans réinitialisation des données de travail. Aucun push, PR, déploiement, courriel externe ou écriture PREPROD/PROD. Les preuves OMVQ des scénarios automatisés sont des fixtures locales ; les émetteurs créés par les scénarios réussis sont suspendus en fin de test.

## Autorisation simulée pour les tests — 6 septembre 2026

- 15 tests unitaires réussis, dont flag désactivé, utilisateur déconnecté/non administrateur et PDF explicitement simulé.
- 77 assertions SQL réussies : simulation limitée à un administrateur serveur et à un compte autorisé, échéance de 24 heures, idempotence, provenance figée dans le certificat, absence de preuve vaccinale reconnue et statut public TEST. Le parcours ordinaire refuse la méthode de simulation.
- Parcours UI/API complet réussi avec `VET_LOCAL_TEST_AUTHORIZATION=true` : l’administrateur saisit le compte secrétaire cible, crée l’autorisation fictive, la secrétaire émet un certificat TEST, le PDF se télécharge, la page publique affiche TEST et la conformité reste non reconnue. Les parcours normaux, signature distante, correction, révocation et suppression du brouillon passent aussi.
- Build réussi ; avertissement préexistant de taille des bundles. Contrôle des espaces Git réussi.
- Les tests SQL et UI ont été validés successivement sur la pile locale. Aucune simulation positive OMVQ n’est ajoutée par le nouveau bouton : les fixtures de vérification restent propres aux scénarios automatisés.
- Traces : `/tmp/hsp-vet-test-auth-unit.log`, `/tmp/hsp-vet-test-auth-sql.log`, `/tmp/hsp-vet-test-auth-browser.log`, `/tmp/hsp-vet-test-auth-build.log`.

Le worker local en cours est démarré avec le flag de simulation activé. Sans ce flag, l’endpoint est désactivé. Aucune activation distante, migration PREPROD/PROD, publication ou PR.
# Correction des sessions du portail — 6 septembre 2026

Le compte local `phase1.platform@example.test` a été confirmé administrateur par connexion locale et `is_platform_admin`. Le message « Connexion administrateur requise » pouvait désigner une session invalidée, avant tout contrôle du rôle. La déconnexion du portail utilisait la portée globale Supabase et pouvait invalider les autres sessions du même compte pendant les tests.

La déconnexion utilise désormais `scope: 'local'`. Les appels authentifiés au worker renouvellent la session et réessaient une seule fois après un HTTP 401, jamais après un refus de droits 403 ou une erreur serveur. Une session révoquée demande explicitement une reconnexion. Le renouvellement ne réinitialise plus le formulaire et le certificat sélectionné.

Validation locale : 19/19 tests unitaires du pilote, build réussi (avertissement habituel sur la taille des bundles), parcours navigateur complet avec autorisation simulée réussi. Les assertions ajoutées vérifient la conservation d’une session administrateur indépendante après déconnexion du portail et celle du formulaire après renouvellement du jeton. Aucune migration ou modification de droits nécessaire. Journaux : `/tmp/hsp-vet-session-unit.log`, `/tmp/hsp-vet-session-browser.log`, `/tmp/hsp-vet-session-build.log`.

## QR détaillé et libellé de conformité — 6 septembre 2026

La migration locale `20260906000700_vet_public_certificate_details.sql` étend la RPC publique avec une liste explicite de champs provenant de l’instantané émis : cheval, propriétaire, identifiants, agent, administrations, clinique, préparateur, vétérinaire, vérification et signature. Aucun courriel personnel, adresse du propriétaire, UUID interne, jeton ou contenu technique de signature n’est renvoyé. Le statut actuel et le lien de correction restent disponibles, y compris après révocation. Les certificats TEST restent signalés comme simulations.

Le moteur conserve `pending_verification` pour compatibilité, mais fournit la raison `test_certificate` lorsque la preuve retenue est simulée. Le portail affiche cette exclusion en français et traduit les autres états. Aucune simulation n’est transformée en preuve reconnue.

Validation : 81 assertions SQL réussies avec rollback, 19 tests unitaires réussis, build réussi (avertissement habituel de taille des bundles). Journaux : `/tmp/hsp-vet-qr-sql.log`, `/tmp/hsp-vet-qr-unit.log`, `/tmp/hsp-vet-qr-build.log`, `/tmp/hsp-vet-qr-browser.log`. Migration appliquée exclusivement dans Supabase local, sans réinitialisation.

Le parcours navigateur QR/UI/API a ensuite réussi, notamment sans connexion pour les noms du cheval/propriétaire, vaccins et signature, et avec le libellé français d’exclusion pour les trois maladies du certificat TEST.

## PDF compact — 6 septembre 2026

Le PDF présente désormais l’identité et la clinique en deux colonnes, les administrations dans un tableau et la signature à côté du QR. Marges A4 de 11 mm et ajustement d’échelle limité à 85 % au minimum ; aucune information n’est tronquée. Les documents exceptionnellement longs peuvent continuer sur une autre page pour préserver leur lisibilité.

`PLAYWRIGHT_BROWSERS_PATH=/tmp/hsp-omvq-browser npm run test:vet:pdf` : trois cas réussis, avec 1, 3 et 6 administrations, coordonnées et identifiants renseignés. PDF.js confirme une page A4 et la présence des noms, du dernier lot, de la signature et du lien de vérification. Les 19 tests unitaires du pilote passent également. Journal : `/tmp/hsp-vet-pdf-layout.log`. Worker local rechargé pour les prochains téléchargements ; les instantanés des certificats ne sont pas modifiés.
