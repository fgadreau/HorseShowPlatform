# Revue du rendu 5 — totaux et changements de page

Base revue : `0bc833950fc8eedde1d7b83d1e526a01cc7d61e6`. Branche `feat/billing-hsp-direct-prototype`, worktree persistant `/workspaces/HorseShowPlatform/.worktrees/billing-hsp-direct`.

Le sous-total du bloc reste désormais avec sa dernière ligne de détail. Pour le dernier bloc d’un dossard, cette ligne, le sous-total du bloc et le total du dossard sont déplacés ensemble si la page manque de place. Un bloc poursuivi répète le dossard, le cheval, le nom public du bloc et l’occurrence, avec « suite / continued ». Aucun en-tête de dossard suivant n’est laissé sans ligne.

Les trois niveaux sont distincts dans le PDF et le composant partagé compte/relevé/récapitulatif/facture/reçu :

- **Classe** : total avant taxes en semi-gras dans la dernière colonne.
- **Bloc** : texte en gras aubergine et trait supérieur ; par exemple « Total Bloc DEMO A — dossard 941 — Après-midi / Afternoon — avant taxes ». Le nom public figé est conservé : aucun numéro de bloc n’est inventé. L’occurrence est explicitée pour éviter de confondre les passages.
- **Dossard** : « Total inscriptions — dossard 941 — avant taxes », en gras sur fond aubergine pâle, bordures et espace avant le prochain dossard.

## Nouveaux PDF réellement émis

Nouveau compte fictif `DEMO-ACC-000016`, nouvelle facture unique `DEMO-INV-000010`. Les exemples reprennent les mêmes prix et le même scénario que la revue précédente, sur un nouveau concours fictif, sans modifier les anciens frais ou pièces. Les identifiants d’affectation des dossards existants sont réutilisés ; les classes/blocs appartiennent au nouveau concours.

| Pièce | Français | English |
| --- | --- | --- |
| Facture finale | [PDF FR — 4 pages](main-invoice-DEMO-INV-000010-fr.pdf) | [PDF EN — 4 pages](main-invoice-DEMO-INV-000010-en.pdf) |
| Relevé utilisé comme récapitulatif de fermeture | [PDF FR — 4 pages](main-statement-9f526103-dc03-4bcb-bced-40c7d6e1c967-fr.pdf) | [PDF EN — 4 pages](main-statement-9f526103-dc03-4bcb-bced-40c7d6e1c967-en.pdf) |
| Reçu partiel 000024 | [PDF FR — 4 pages](main-receipt-DEMO-RCPT-000024-fr.pdf) | [PDF EN — 4 pages](main-receipt-DEMO-RCPT-000024-en.pdf) |
| Reçu après fermeture 000025 | [PDF FR — 6 pages](main-receipt-DEMO-RCPT-000025-fr.pdf) | [PDF EN — 5 pages](main-receipt-DEMO-RCPT-000025-en.pdf) |

Les pages 2 et 3 de la facture montrent les sous-totaux identifiés, les totaux des dossards 941/942 et le groupe non attribué. Le sous-total qui était seul en haut d’une page de l’ancienne facture accompagne maintenant son détail.

Les inscriptions/juges restent à **1 855 $ + 320 $ + 75 $ = 2 250 $ avant taxes**. Réservations : 120 $ ; autres achats : 25 $ ; HSP : 5 $, une seule fois. Sous-total : 2 400 $ ; taxes fictives : 120 $ ; total : 2 520 $. Deux nouveaux encaissements manuels fictifs de 200 $ et 2 320 $ ont servi au scénario. Le second intervient après fermeture : la facture conserve son instantané de clôture et son solde historique de 2 320 $, tandis que le compte courant affiche zéro. Aucune nouvelle transaction ou création de compte Stripe.

## Captures ciblées des totaux

| Vue | FR ordinateur | FR mobile | EN ordinateur | EN mobile |
| --- | --- | --- | --- | --- |
| Détail du compte | [1440 px](focus-account-fr-1440.png) | [390 px](focus-account-fr-390.png) | [1440 px](focus-account-en-1440.png) | [390 px](focus-account-en-390.png) |
| Facture finale | [1440 px](focus-invoice-fr-1440.png) | [390 px](focus-invoice-fr-390.png) | [1440 px](focus-invoice-en-1440.png) | [390 px](focus-invoice-en-390.png) |
| Relevé/récapitulatif complet | [1440 px](statement-fr-1440.png) | [390 px](statement-fr-390.png) | [1440 px](statement-en-1440.png) | [390 px](statement-en-390.png) |

La boîte de confirmation de fermeture est également capturée en [FR ordinateur](closing-recap-fr-1440.png) et [FR mobile](closing-recap-fr-390.png). La version EN du même instantané est visible dans les captures du relevé ci-dessus. Les 27 captures complètes et les 8 captures ciblées sont indexées dans les [résultats navigateur](browser-results.json) et les [contrôles des styles et téléchargements](focus-results.json).

## Versionnement et intégrité

`render_version=5` et `presentation_version=5` sont sélectionnés uniquement pour les nouvelles pièces par la migration additive `20260907000700_billing_document_render_v5.sql`. La version des références métier figées reste **1**. Le regroupement métier de `entryGroups.mjs` n’est pas modifié. Le modèle 5 réutilise les cellules du modèle 4 ; il renomme les totaux et place le total du dossard à la fin de son dernier tableau de bloc.

Les rendus 1 à 4 et les documents déjà émis sont conservés. Aucun montant, taxe, paiement ou affectation historique n’a été modifié. La pagination mesure des fragments indivisibles, avec le pied de page déjà réservé ; elle vérifie ensuite la présence des lignes, leurs limites géométriques et la présence de chaque fin de bloc sur une seule page. Un fragment indivisible plus haut qu’une page est refusé explicitement, jamais tronqué silencieusement.

## Validations exécutées

- **63 tests unitaires** : 61 régressions existantes et 2 tests nouveaux vérifiant l’identité exacte des lignes de détail, cellules monétaires, nombres de lignes, libellés et rendu historique. [Régressions](unit.txt), [tests des totaux](totals-unit.txt).
- **34 PDF synthétiques, Chromium/PDF.js réels** : 1 458 lignes attendues, avec multiplicité exacte. Deux cas reproduisent le défaut de la facture historique `DEMO-INV-000009` FR/EN puis vérifient son rendu corrigé sans modifier l’original. Les 32 autres font varier la longueur des blocs autour des coupures, jusqu’à 40 détails supplémentaires, pour les factures et reçus FR/EN. Contrôles : dernier détail + sous-total, fin du dernier bloc + total du dossard, bloc long, continuation et passage au dossard suivant sans en-tête isolé. Le contrôle des totaux est limité au bon tableau, pour ne pas confondre deux sous-totaux identiques sur une page. [Résultats](pagination-results.json).
- **Clone PostgreSQL réel** : migration et régressions financières exécutées, **49 assertions et 9 rejets attendus**. Les objets Stripe de cette suite sont simulés. Aucune remise à zéro de la base persistante. [Journal](server.txt).
- **Pile fictive persistante réelle** : RPC d’ajout, deux encaissements manuels fictifs, fermeture via navigateur, worker PDF, Storage privé et téléchargements réels. **8 PDF, 458 lignes vérifiées avec multiplicité exacte**, fins de blocs/dossards conservées ensemble ; quatre accès d’un autre payeur refusés. [Pièces et empreintes SHA-256](documents-results.json), [sommes et unicité](integrity-results.json).
- **Navigateur réel, sans réponses simulées** : 35 captures, contrôle de non-débordement des pages/cellules, 8 contrôles des styles calculés et **8 téléchargements identiques aux objets Storage**. Mes comptes charge 24 comptes ; l’encaissement autorisé après fermeture reste possible et le formulaire disparaît à solde nul. [Captures/parcours](browser-results.json), [styles/téléchargements](focus-results.json).
- **Préservation** : les **46 anciens PDF** ont été retéléchargés et restent identiques octet pour octet ; empreintes des données financières et métadonnées historiques inchangées ; SVG et configuration Stripe inchangés. [Historique PDF/configuration](history-results.json), [historique financier](financial-history.txt).
- **Build réussi** : `npm run build`, avec les avertissements existants de taille de bundle et d’imports dynamiques. [Journal](build.txt). [Inspection complémentaire des PDF téléchargés](pdf-inspection.txt).

Aucune fusion, migration distante, modification PREPROD/PROD ou nouvelle règle fiscale, de paiement, d’affectation ou de frais HSP. Sauvegarde et journaux de reprise conservés dans `.tmp/review-v5` du worktree persistant, hors Git. Les transactions des exemples sont exclusivement fictives ; les tests Stripe simulés ne constituent pas une nouvelle qualification Stripe réelle.
