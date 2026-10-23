# Corrections de la revue indépendante de 6009098

Branche : `feat/billing-hsp-direct-prototype`. Base : `6009098c76c35ae6c4cbaacd8c333d4955660553`. Travail et journaux dans le worktree persistant `.worktrees/billing-hsp-direct`, dossier local `.tmp/review-v3/`.

## Pagination corrigée — rendu 3

La ligne complète de stalle était absente des reçus historiques `DEMO-RCPT-000015` FR/EN, alors que le sous-total de réservation restait visible. Le nouveau test reproduit ce défaut dans **les deux fichiers déjà publiés**. Les anciens contrôles de titres, sous-totaux et mentions ne suffisaient pas à prouver la présence de toutes les lignes.

Deux différences entre mesure et impression causaient la perte de contenu : le pied de page était rempli après pagination, réduisant ensuite la hauteur disponible ; la largeur du navigateur utilisée pour mesurer les tableaux était supérieure à la largeur imprimable A4, sous-estimant les retours à la ligne.

Le rendu 3 mesure les lignes en média d’impression, avec une largeur explicite de 186 mm (A4 moins les marges). Le pied de page est rempli et sa hauteur réservée avant pagination. Une vérification finale du DOM refuse le rendu si une ligne manque ou dépasse le corps de page. Le test extrait ensuite le **PDF final** et vérifie chaque ligne complète, avec toutes ses cellules, sur une même page ; les lignes identiques sont comptées avec leur multiplicité.

Les moteurs 1 et 2 sont conservés. `pdf-v2.mjs` est identique octet par octet au fichier `pdf.mjs` de `6009098`. Le dispatcher sélectionne explicitement 1, 2 ou 3 ; une version inconnue est refusée. Les anciens documents ne sont pas repassés dans le moteur corrigé.

La migration additive `20260907000500_billing_document_render_v3.sql`, testée sur clone puis appliquée uniquement à la pile **locale** `hsp-vet-local`, sélectionne le rendu 3 pour les nouveaux instantanés. Elle ne réécrit aucun document ni montant. Les numéros de reçu restent figés comme en version 2. Les comparaisons exactes de récapitulatif restent actives ; un ancien récapitulatif secrétaire peut demander une nouvelle préparation après ce changement de version.

## Encaissement sur compte fermé

Dans `AccountDetail.tsx`, seule la condition générale `data.state === 'open'` a été retirée de l’affichage du formulaire. L’interface exige toujours un solde positif, une disponibilité payable positive et la permission serveur : `actions.payment` pour la secrétaire, ou `stripe.can_pay` sans tentative en cours pour le participant.

Aucune permission serveur ni règle de clôture n’a été modifiée. Une facture finale n’est ni recréée ni actualisée lors d’un encaissement ultérieur.

Scénario réellement exécuté sur la nouvelle fixture :

1. Sept ventes structurées et un frais HSP unique : total de 498,75 CAD. Premier paiement manuel fictif de 200 CAD.
2. Fermeture secrétaire autorisée avec 298,75 CAD encore dus : facture unique `DEMO-INV-000008`.
3. Formulaire visible pour la secrétaire, en ordinateur et mobile ; absent de la vue participant, conformément aux permissions serveur.
4. Encaissement de 100 CAD via le navigateur : solde de 198,75 CAD, formulaire toujours disponible.
5. Encaissement de 198,75 CAD via le navigateur : solde nul, formulaire masqué.
6. Trois paiements au total, un seul frais HSP et une seule facture. L’instantané de facture et les SHA-256 de ses PDF FR/EN sont identiques avant/après les deux encaissements postérieurs à la fermeture.

La facture conserve donc volontairement son solde historique de 298,75 CAD à sa date d’émission. Les reçus ultérieurs et le compte courant retracent le règlement, sans modification rétroactive de la facture.

## Nouveaux exemples émis sur la pile fictive

| Exemple | Français | Anglais |
| --- | --- | --- |
| Reçu initial de 200 CAD, ligne de stalle complète en page 2 | [PDF FR](receipt-DEMO-RCPT-000019-fr.pdf) · [page 2 en image](receipt-page-2-fr.png) | [PDF EN](receipt-DEMO-RCPT-000019-en.pdf) · [page 2 en image](receipt-page-2-en.png) |
| Reçu de 100 CAD après fermeture | [PDF FR](receipt-DEMO-RCPT-000020-fr.pdf) | [PDF EN](receipt-DEMO-RCPT-000020-en.pdf) |
| Reçu de 198,75 CAD, solde réglé | [PDF FR](receipt-DEMO-RCPT-000021-fr.pdf) | [PDF EN](receipt-DEMO-RCPT-000021-en.pdf) |
| Facture finale conservée | [PDF FR](invoice-fr.pdf) | [PDF EN](invoice-en.pdf) |
| Récapitulatif avant fermeture | [PDF FR](statement-fr.pdf) | [PDF EN](statement-en.pdf) |

Captures de l’interface réelle : [compte fermé avec solde dû, ordinateur](closed-balance-due-1440.png), [mobile](closed-balance-due-390.png), [après paiement partiel](closed-partial-payment-390.png), [solde nul, formulaire masqué](closed-zero-balance-390.png).

Compte `DEMO-ACC-000014` : `/me/accounts/9687bae9-3343-4b27-93ae-2e0358c3da42`. Vue secrétaire : `/associations/fb300000-0000-0000-0000-000000000001/finance/accounts/9687bae9-3343-4b27-93ae-2e0358c3da42`, sur l’interface locale de la branche, port 5174. Les identifiants fictifs existants restent dans les fichiers locaux ignorés.

## Validations exécutées

| Commande / contrôle | Résultat | Portée |
| --- | --- | --- |
| `node scripts/billing/pdf-pagination.test.mjs` | Défaut reproduit dans les 2 anciens PDF ; 14 variantes FR/EN réussies, 580 lignes complètes contrôlées | Chromium réel ; instantané fictif historique et variantes **synthétiques**, dont coupures voisines et longues tables sur 4 pages. [Résultats](pagination-results.json) |
| `node scripts/billing/hsp-server-test.mjs` | 43 assertions, 5 rejets attendus | Clone PostgreSQL réel ; fournisseur Stripe **simulé**. Encaissement après fermeture autorisé, facture inchangée, disponibilité nulle après règlement ; invariants HSP et numéros des pièces |
| `presentation.test.mjs`, `pdf-worker.test.mjs`, `recovery.test.mjs`, sous Node | 4 + 5 + 50 tests réussis | Tests unitaires, services et stockage simulés selon la suite |
| `closed-account-payment.browser.mjs` | Scénario complet réussi | Navigateur et RPC locaux **réels**, aucune réponse remplacée. Encaissements manuels **fictifs**, aucun nouveau paiement Stripe. [Résultats](closed-payment-results.json) |
| `review-v3-local.mjs documents` | 10 PDF téléchargés, 238 lignes complètes vérifiées ; 5 accès d’un autre payeur refusés | Supabase Storage privé et HTTP **réels**. Même vérification de toutes les lignes que dans la suite de pagination. [Résultats](documents-results.json) |
| `review-v3-history-local.mjs` | 28 anciens PDF téléchargés à nouveau, tous identiques octet par octet | Inclut les PDF signalés et les jeux historiques 1/2. SVG et configurations inchangés. [Résultats](history-results.json) |
| `review-v3-prepare-local.mjs verify` | Empreintes des lignes historiques conservées | Documents, artefacts, frais, taxes de frais, paiements, affectations, tentatives Stripe, récupération HSP et tables métier contrôlées |
| `npm run build`, `node --check`, `git diff --check` | Réussis | Avertissements existants de taille des chunks/import dynamique vétérinaire |

Les nouveaux PDF ont aussi été rendus en images ; inspection visuelle de la stalle complète en page 2 FR/EN et des captures secrétaire. Les fichiers de régression synthétiques ne sont pas présentés comme de nouvelles pièces émises : les exemples de ce dossier portent leurs propres nouveaux numéros.

La première tentative de correction ne réservait que le pied de page. Le contrôle de toutes les lignes a alors trouvé un autre manque sur une variante à cinq lignes supplémentaires, révélant la différence de largeur. La suite complète n’a réussi qu’après correction des deux causes ; aucun exemple local de rendu 3 n’avait encore été émis pendant cette première tentative.

## Conservation et limites

Sauvegarde locale avant migration : `.tmp/review-v3/before-render-v3.dump`. Empreintes prises avant toute nouvelle fixture. Le worker versionné a été redémarré **avant** la sélection de version et la création des exemples ; son en-tête de capacité inclut 3, vérifié par les lanceurs locaux. Aucun ancien PDF, numéro, taxe, montant ou snapshot écrasé ; les reçus défectueux restent disponibles à titre historique.

Aucun reset de base, nouveau compte Stripe, paiement Stripe, remboursement, changement fiscal ou règle de petits paiements. Aucune fusion, migration distante, modification PREPROD/PROD ni déploiement. Seul le push du code et de ces exemples sur la branche de travail est prévu à distance.
