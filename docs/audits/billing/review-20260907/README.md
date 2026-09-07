# Revue mobile et documents — 7 septembre 2026

Corrections de présentation livrées sur `feat/billing-hsp-direct-prototype`, à partir de `4c836abf5c6a9083f3676285c487678469008d8b`. Worktree persistant : `/workspaces/HorseShowPlatform/.worktrees/billing-hsp-direct`.

## Exemples pour revue

Tous les exemples ci-dessous proviennent de la pile fictive locale, avec authentification réelle et PDF téléchargés depuis son Storage privé. Les nouveaux paiements sont des encaissements manuels **simulés**, sans mouvement d’argent.

| Document / écran | Français | Anglais |
| --- | --- | --- |
| Facture finale `DEMO-INV-000006` | [PDF FR](invoice-fr.pdf) | [PDF EN](invoice-en.pdf) |
| Premier reçu, 200 CAD ; affectation partielle | [PDF FR](receipt-DEMO-RCPT-000015-fr.pdf) | [PDF EN](receipt-DEMO-RCPT-000015-en.pdf) |
| Second reçu, 298,75 CAD | [PDF FR](receipt-DEMO-RCPT-000016-fr.pdf) | [PDF EN](receipt-DEMO-RCPT-000016-en.pdf) |
| Récapitulatif de fermeture conservé | [PDF FR](statement-fr.pdf) | [PDF EN](statement-en.pdf) |
| Compte fermé | [Ordinateur](main-closed-fr-1440.png), [mobile](main-closed-fr-390.png) | — |
| Mes comptes, **après chargement des lignes** | [Ordinateur](accounts-loaded-fr-1440.png), [mobile](accounts-loaded-fr-390.png) | [Mobile](accounts-loaded-en-390.png) |
| Récapitulatif conservé, ouvert après fermeture | [Ordinateur](recap-snapshot-fr-1440.png), [mobile](recap-snapshot-fr-390.png) | [Mobile](recap-snapshot-en-390.png) |
| Secrétaire ayant fermé avant le participant | [Écran actualisé et facture existante](staff-race-closed-fr-390.png) | — |
| Ancien compte, écran de 320 px | [Capture](existing-account-fr-320.png) | — |

[Les 18 PDF FR/EN des deux nouveaux comptes](pdf-fr-en.zip). Les captures des récapitulatifs dans la boîte de dialogue, avant fermeture, restent également dans `.tmp/review-20260907/` ; les captures publiées du récapitulatif montrent son instantané conservé après fermeture.

## Corrections

- Les montants du détail et des documents passent en cartes sur mobile, avec libellés visibles pour prix, taxes et total. La liste présente séparément frais, paiements et solde.
- Un compte fermé affiche « Compte fermé — facture finale disponible ». Les indications « Prêt à finaliser » et « Récapitulatif à confirmer » sont retirées après fermeture. Le formulaire de nouveau paiement est masqué lorsque le solde payable est nul ; la résolution d’un paiement déjà en cours reste possible.
- Après un refus d’action, l’écran relit le compte autorisé. Les causes connues deviennent des explications FR/EN ; les erreurs inconnues invitent à vérifier l’état avant de réessayer, sans afficher le diagnostic technique. Si la secrétaire a fermé le compte, le récapitulatif se ferme et la facture existante s’ouvre. Les clés de reprise des commandes incertaines restent conservées.
- Les moyens de paiement et dates sont lisibles ; les disponibilités d’encaissement manuel et montants réservés administratifs sont réservés à l’espace secrétaire.
- Le compte et le récapitulatif partagent les groupes : inscriptions par cheval/bloc/séance, détail des frais de juges, réservations, autres achats, service HSP. Les sommes de présentation additionnent les montants enregistrés en centimes ; aucun calcul fiscal ni affectation n’est changé.
- Les PDF précisent « Total du bloc avant taxes ». Chaque fournisseur a ses coordonnées et identifiants fiscaux distincts, avec la mention de mandat existante. La facture finale présente date, moyen, montant et numéro de reçu. Les reçus distinguent le montant complet du frais, taxes incluses, et la portion réglée par le paiement.

## Version du rendu et conservation

La migration additive `20260907000400_billing_document_render_v2.sql` a été testée sur clone puis appliquée **uniquement** à `supabase_db_hsp-vet-local`, après sauvegarde locale. Aucun reset. Elle ajoute aux futurs instantanés documentaires `render_version=2` et les numéros immuables des reçus associés aux paiements. Le numéro du reçu en cours est ajouté lors de son insertion. Aucun UPDATE des documents historiques, montants, taxes, paiements ou affectations.

Le fichier `server/billing/pdf-v1.mjs` est identique octet par octet au renderer du commit de départ. Un document sans version, ou de version 1, conserve ce moteur ; la version 2 sélectionne le nouveau rendu. Une version inconnue est refusée. Les artefacts déjà publiés ne sont pas régénérés. Les anciens récapitulatifs secrétaire peuvent demander une nouvelle préparation après cette évolution de métadonnées : la comparaison exacte de l’instantané reste active.

Dix anciens PDF ont été téléchargés de nouveau et comparés à leurs SHA-256 précédents : **octets identiques**. Les empreintes des lignes historiques des documents, artefacts, frais, taxes de frais, paiements, affectations, tentatives Stripe et récupérations HSP, ainsi que des tables métier contrôlées, sont conservées. Les SVG et configurations locales ont leurs empreintes initiales inchangées. [Preuve de conservation et runtime](history-results.json).

### Incident de transition du worker

Le worker initial, relancé avant les modifications du code, était encore chargé avec l’ancien renderer lors de la création des quatre premiers reçus de revue. Ces quatre pièces ont un instantané marqué 2 mais des octets produits par le moteur 1. Cette différence a été détectée par extraction des PDF. Elles sont conservées et **exclues du jeu final d’exemples**, sans écrasement ni réémission sous leur numéro.

Identifiants concernés : `868648b7-8b85-4279-aa18-9b28497984bb`, `1cb0c4bb-4a71-4759-b3f2-983a04f70964`, `4966b2bb-c10a-4fce-b39b-8378a4f9666d`, `edcc3440-36df-43d1-a29a-d95dcb735d82`. Journal conservé dans `.tmp/review-20260907/transition/` et diagnostic dans `worker-transition.json` du dossier local de revue.

Le worker a ensuite été redémarré ; deux nouveaux concours fictifs ont fourni le jeu final. Tous ses PDF ont le pied de page « Rendu 2 / Render 2 » et les nouvelles colonnes attendues. Le serveur expose désormais son support de versions dans un en-tête de réponse ; le lanceur de financement des exemples le contrôle **avant** toute nouvelle vente ou réception fictive, pour détecter un worker non redémarré.

## Vérifications exécutées dans cette reprise

| Vérification | Résultat | Nature de la preuve |
| --- | --- | --- |
| `node scripts/billing/hsp-server-test.mjs` | 40 assertions, 5 rejets attendus | PostgreSQL réel sur clone jetable ; objets Stripe **simulés** ; deux sessions concurrentes, HSP unique, reprise, montants, version et numéros de reçus, historique conservé |
| `node scripts/billing/presentation.test.mjs` | 4 tests | Données **synthétiques** : groupes sans perte, causes FR/EN, références de reçu, ancien rendu, affectation partielle |
| `node scripts/billing/recovery.test.mjs` | 50 tests | RPC **simulées**, stockage local de reprise simulé ; commandes incertaines et rejets définitifs |
| `node scripts/billing/pdf-worker.test.mjs` | 5 tests | RPC/Storage **simulés** : publication, reprise et intégrité |
| `node scripts/billing/stripe-service.test.mjs` | 23 tests | Transport Stripe **simulé** : direct/destination, récupération, événements et refus live |
| `node scripts/billing/hsp-pdf-test.mjs` | 84 assertions, 6 PDF FR/EN | Chromium réel, entrées **synthétiques** de rendu 2 ; factures longues de 4 pages |
| `node --test scripts/billing/pdf-render.test.mjs` | 76 contrôles réussis | Chromium réel, fixtures **synthétiques** du rendu historique |
| `review-prepare-local.mjs`, `review-local.mjs fund` | Deux nouveaux comptes du jeu final | RPC locales réelles ; 200 + 298,75 CAD, et 50 + 81,25 CAD **manuels simulés** ; aucune nouvelle opération Stripe |
| `review-browser.mjs close` | Fermetures participant et secrétaire avant participant réussies | Navigateur et RPC réels. Le test retarde la requête participant pour laisser passer la vraie fermeture secrétaire ; il ne remplace aucune réponse serveur. Deux paiements, une facture et un frais HSP par compte |
| `review-browser.mjs` | Reprise finale réussie FR/EN | Détail à 1440/390/320 px ; liste à 1440/390 px avec lignes chargées, absence de montants coupés et de formulaire à zéro. [Résultats](browser-results.json) |
| `review-local.mjs documents` | 18 PDF téléchargés, 9 accès d’un autre payeur refusés | HTTP et Supabase Storage privé **réels** |
| `review-document-browser.mjs` | 8 téléchargements réels depuis les boutons | SHA-256 identiques aux téléchargements Storage ; 4 captures du récapitulatif conservé. [Résultats](browser-downloads.json) |
| `review-inspect-pdfs.mjs` | 204 contrôles sur 18 PDF | Extraction des PDF réels ; images produites et inspection visuelle des factures et reçus. [Résultats](pdf-inspection.json) |
| `hsp-results-local.mjs` | 30 assertions | Relecture des anciens cas persistants ; totaux HSP du contexte original toujours 31,50 encaissés, 26,25 récupérés, 5,25 restant à reverser |
| `hsp-provider-check.mjs` | Lecture Stripe sandbox réelle réussie | Les **deux paiements existants** totalisent 509,25 CAD ; application fee 5,25 sur le premier, zéro sur le second. Aucun nouveau paiement, remboursement, compte ou changement Connect |
| `review-history-local.mjs` | 10 anciens PDF identiques ; services et secret vérifiés | HTTP réel, empreintes et processus locaux ; aucune valeur secrète affichée |
| `npm run build`, `node --check`, `git diff --check` | Réussis | Avertissements existants sur la taille des chunks et l’import dynamique du module vétérinaire |

Les 82 tests unitaires ci-dessus ne sont pas présentés comme des paiements Stripe réels. Les parcours Stripe refus/3DS/remboursement n’ont pas été rejoués avec de nouvelles charges dans cette reprise ; leurs anciennes preuves sont dans le rapport du prototype.

Un passage tardif de la suite de fermeture a dépassé 30 secondes en attendant les lignes de « Mes comptes », après réussite des deux fermetures. Cette exécution est conservée comme partielle dans [son journal](browser-closure-results.json). La suite de lecture indépendante a ensuite terminé intégralement en FR/EN. Aucune requête PostgreSQL longue n’a été observée lors du diagnostic ; la cause du timeout n’a pas été établie. Il ne faut donc pas interpréter ces captures comme une garantie de latence du Codespace.

La préparation des nouvelles fixtures a aussi rencontré des erreurs de format et de rôle corrigées sans élargissement de droits. Une référence Interac fictive déjà utilisée a été refusée ; l’absence d’opération validée a été vérifiée avant de préparer une nouvelle référence unique. Aucun paiement validé n’a été modifié pour faire réussir le test.

## Reprise et accès

Services actifs : Supabase local `54321`, paiement `54331`, documents `54332`, interface `5174`, listener Stripe plateforme et Connect. Le listener actif confirme l’égalité de son secret avec celui du serveur ; configurations réutilisées et empreintes inchangées. Le dossier `branding/` non suivi du dépôt principal est préservé. L’ancienne référence de worktree `/tmp/hsp-billing-1c` est seulement une métadonnée prunable existante ; aucun travail n’y a été réalisé.

Interface : [ouvrir la pile fictive](https://sturdy-sniffle-69vvp94vqvvx34jw6-5174.app.github.dev/me/accounts?year=all).

Routes de revue avec le login fictif payeur existant :

- Jeu final, compte principal : `/me/accounts/070dabed-c1be-4f5e-8ef4-b12bc7482945`.
- Jeu final, course secrétaire/participant : `/me/accounts/f783560b-1581-4bd3-99aa-28d30da3f6fc`.
- Ancien compte inchangé : `/me/accounts/34a3095d-c747-420b-8fc7-decd650089b7`.
- Liste : `/me/accounts?year=all`.

Les configurations et identifiants de connexion restent dans les fichiers locaux ignorés existants. La sauvegarde de base, les empreintes et les journaux sont dans `.tmp/review-20260907/` **sous le worktree persistant**, pas dans `/tmp`. Pour reproduire une nouvelle qualification, utiliser un nouveau journal de fixtures ; ne pas supprimer les comptes ou documents déjà créés. Avant `review-local.mjs fund`, redémarrer le worker de cette branche avec la configuration documentaire existante.

Aucune fusion, migration distante, modification PREPROD/PROD ou déploiement. Aucun changement de règle fiscale, de remboursement, de petits paiements ou de récupération Stripe. La validation fiscale et le mandat définitif restent hors de cette revue de présentation.
