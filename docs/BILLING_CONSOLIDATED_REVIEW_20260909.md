# Facturation consolidée HSP — corrections et preuves du 9 septembre 2026

Travail local sur `feat/billing-pilot-integrated`, dans `.worktrees/billing-pilot`. Aucun push, PR, fusion, déploiement, appel Stripe réel ou changement de données réelles. Les bases de validation sont jetables. Les documents et identifiants fiscaux restent explicitement DEMO, sans validité comptable ou fiscale.

## Corrections réalisées

Les sections deviennent « Portion Association/HSP de la facture consolidée », avec leurs numéros fiscaux distincts. Chaque page rappelle le numéro du compte et que les portions sont déjà incluses dans le total global. Un compte payé indique que les portions sont acquittées; un compte débiteur demande uniquement le solde global. Le relevé utilise ses propres titres et précise qu’il ne remplace pas la facture finale.

Le résumé global est agrandi (15 pt, contre 9 pt pour le corps), avec Total du compte, Total payé et Solde. La pagination répète le contexte du fournisseur et garde ensemble son petit récapitulatif fiscal. Les colonnes des lignes indiquent « Montant avant taxes »; sous-total, TPS/TVQ et total taxes incluses restent séparés par fournisseur. Les descriptions ne répètent plus le calcul des taxes. Les taux et montants suivent la langue, notamment `9,975 %` / `9.975%` et `7,34 $` / `$7.34`.

Chaque reçu distingue la « Répartition de ce paiement seulement » de la situation HSP du compte (total, payé à la date du reçu, restant). Une allocation HSP nulle ne constitue jamais une preuve de commandite. La commandite et son niveau proviennent exclusivement du snapshot. L’historique contient les numéros de reçus, modes et références disponibles, avec dates locales lisibles; sa dernière ligne n’est plus automatiquement en gras.

Les libellés communs FR/EN sont centralisés dans le dictionnaire existant. Les descriptions de produits bilingues sont enregistrées sur les nouvelles charges, puis conservées dans les documents immuables. Le fuseau résolu du contexte et les numéros de reçus sont également capturés. Les anciennes pièces ne sont pas réécrites.

Le montant HSP demeure librement configurable, notamment **7,34 $**, avec priorité concours > association > plateforme (5,00 $). `null` signifie héritage, zéro signifie commandite. Aucun calcul commercial, taxe, allocation, solde ou mécanisme d’idempotence validé n’a été modifié pour ces corrections de présentation. Les sept scénarios originaux et la migration financière précédente sont comparés à une copie antérieure conservée dans les preuves.

## Migrations et fichiers

- `supabase/migrations/20260909000100_billing_consolidated_suppliers.sql` : migration financière du chantier précédent, conservée identique pendant cette correction; frais configurables, audit, fournisseurs, snapshots et unicité des frais HSP.
- `supabase/migrations/20260909000200_billing_document_locale.sql` : nouvelle migration de présentation; catalogue de descriptions bilingues protégé, RPC administrative, capture à la création des charges, enrichissement du snapshot (fuseau et reçus), capture du numéro du reçu au moment de son insertion. Aucun recalcul ni réécriture historique.
- `server/billing/pdf.mjs`, `consolidated-model.mjs`, `consolidated-render.mjs` : modèle et rendu consolidés, validation financière conservée et compatibilité du rendu historique.
- `src/lib/billingDocumentTranslations.json`, `src/lib/i18n.ts` : dictionnaire partagé FR/EN.
- `supabase/tests/billing_document_locale.sql`, `scripts/billing/pdf-integration.mjs`, `test-sql-local.mjs` : parcours persistés et publication réelle par le worker local.
- `scripts/billing/consolidated.test.mjs`, `consolidated-fixtures.mjs`, `document-proof-cases.mjs`, `consolidated-pdfs.mjs`, `document-proof-inspection.mjs`, `document-proof-sheets.mjs`, `audit-document-proofs.py` : tests, génération, extraction, images et audit indépendant.
- `scripts/billing/finance-browser.mjs` : mock du réglage HSP ajouté au parcours existant et diagnostic des échecs de navigation.

Les fichiers du chantier précédent restent inclus : `processing-allocation.mjs`, `HspFeeSettings.tsx`, `hspFeeAmount.ts`, `FinanceView.tsx`, `AccountDetail.tsx`, `hsp-fee-browser.mjs`, `billing_consolidated_suppliers.sql` et [backlog Terminal](BILLING_TERMINAL_BACKLOG.md). L’inventaire exhaustif des chemins modifiés ou ajoutés est dans [FILES.txt](billing-demo-20260909/FILES.txt).

## Résultats des validations finales

| Validation exécutée | Résultat et portée |
| --- | --- |
| `node scripts/billing/test-sql-local.mjs --fresh` | 149 migrations rejouées; 265 assertions et 100 rejets attendus; 53 étapes de validation réussies; concurrence, unicité, immuabilité, règles serveur et worker PDF. Base jetable supprimée. |
| `node --test scripts/billing/*.test.mjs scripts/vet/*.test.mjs scripts/capacity/*.test.mjs` | 149 tests réussis, aucun échec ni test ignoré. |
| Six suites npm `test:draw`, `test:payout`, `test:paid-warmup`, `test:identity`, `test:governing`, `test:eligibility` | Toutes réussies. |
| `node scripts/billing/finance-browser.mjs` | 25 contrôles réussis; vrai navigateur et UI React, RPC/Stripe simulés. |
| `node scripts/billing/hsp-fee-browser.mjs` | 6 contrôles réussis, dont montant personnalisé et zéro; RPC simulées. |
| Tests de rendu historique `pdf-render.test.mjs` | 6 anciens PDF, 76 contrôles réussis; inclus dans la suite Node. |
| `node scripts/billing/consolidated-pdfs.mjs` | 32 PDF de fixtures générés, 54 pages. |
| Worker intégré exécuté par la suite SQL | 18 PDF provenant de 9 pièces persistées, 30 pages. |
| `python3 scripts/billing/audit-document-proofs.py` | **1 377 contrôles indépendants réussis**, 50 PDF / 84 pages, comparaison des sept scénarios originaux identique. |
| `npm run build` | TypeScript et Vite réussis; avertissements existants de taille de bundles et d’import mixte de `vetServices`. |
| `git diff --check` | Réussi. |

L’audit Python recalcule avec Decimal et arrondi au cent les bases, taxes, sommes par fournisseur, totaux globaux, paiements, allocations et soldes. Il rapproche les snapshots des textes des PDF, numéros de reçus et empreintes SHA-256. Il n’importe ni le moteur de prix ni le moteur de rendu. Les contrôles ne sont pas tous des tests indépendants de scénarios : plusieurs vérifient les mêmes règles dans les deux langues.

Des essais intermédiaires ont été interrompus par l’environnement; la reconstruction neuve et les suites finales ont été relancées jusqu’à réussite. Un ancien essai par copie rencontrait une colonne déjà existante; il ne constitue pas le résultat final. Chromium et les conteneurs locaux ont nécessité l’exécution locale autorisée hors sandbox. Le premier essai navigateur avait expiré pendant une navigation; la nouvelle exécution complète passe, sans modification du comportement financier.

## Preuves par fixtures et parcours intégrés

**Fixtures hors base : 16 scénarios, chacun en FR et EN (32 PDF, 54 pages).** Standard, commandite concours, frais personnalisés, trois paiements et leurs trois reçus, reçus commandité et personnalisé, facture finale débitrice, relevé partiel, facture longue, HSP payé en premier et son reçu, profils fiscaux différents, commandite association. Ces exemples donnent une couverture visuelle contrôlée, sans démontrer à eux seuls la persistance.

**Parcours persistés : 3 concours DEMO, chacun avec relevé, reçu et facture finale FR/EN (18 PDF, 30 pages).** Création effective des concours et contextes de type événement, vente Association/HSP, paiement comptant, paiement Interac complémentaire pour les comptes réglés, finalisation et lecture des pièces depuis PostgreSQL. Standard 5,00 $, commandite association 0,00 $, personnalisé 7,34 $ avec solde final 94,98 $. Les réglages et traductions sont ensuite changés et les snapshots contrôlés inchangés. Le worker publie les vrais documents, puis le téléchargement autorisé vérifie leurs octets et empreintes. Le stockage utilise un adaptateur privé sur disque; l’API HTTP Supabase Storage et Stripe ne sont pas sollicités.

Les scénarios multipages et de profils fiscaux différents restent des fixtures; ils ne sont pas présentés comme des ventes persistées. La suite SQL couvre en complément les doublons, paiements concurrents, refus d’accès, reprise après échec de rendu et immuabilité.

## Examen visuel et exemples

**Toutes les 84 pages des 50 PDF ont été examinées**, en vis-à-vis FR/EN, après génération. Aucune coupure ni superposition observée; résumé global dominant, rappels et identifiants présents sur les suites. Les récapitulatifs fiscaux restent groupés. Deux détails trouvés pendant la revue (titres du relevé et total fournisseur isolé) ont été corrigés puis réexaminés. Chaque page possède une image PNG; [le registre de revue](billing-demo-20260909/validation/visual-review.json) associe les pages examinées à l’empreinte du PDF.

- [Standard](billing-demo-20260909/standard-fr.pdf) : total 120,73 $, solde nul.
- [Personnalisé 7,34 $](billing-demo-20260909/personnalise-7-34-fr.pdf) : total 123,42 $.
- [Trois paiements](billing-demo-20260909/paiements-multiples-fr.pdf) et [premier reçu](billing-demo-20260909/recu-1-fr.pdf) : zéro affecté à HSP sans mention de commandite.
- [Facture longue, trois pages](billing-demo-20260909/facture-longue-fr.pdf).
- [Reçu commandité persisté](billing-demo-20260909/integrated/sponsored-receipt-fr.pdf).
- [Reçu personnalisé persisté](billing-demo-20260909/integrated/custom-due-receipt-fr.pdf).
- [Facture finale débitrice persistée](billing-demo-20260909/integrated/custom-due-invoice-fr.pdf).
- [Relevé personnalisé en anglais](billing-demo-20260909/integrated/custom-due-statement-en.pdf).

Les manifestes `results.json`, snapshots, textes et PNG se trouvent dans [les preuves](billing-demo-20260909/) et leur sous-dossier `integrated`. Les résultats de tests et la copie de référence antérieure sont dans [validation](billing-demo-20260909/validation/).

## Limites restantes

- Les descriptions libres historiques sans traduction restent dans leur langue d’origine. Pour obtenir de nouvelles pièces complètement bilingues, le catalogue doit être renseigné FR/EN avant la vente via la RPC ajoutée; aucun écran d’édition de ces traductions n’est livré ici. Les noms propres, adresses et identifiants ne sont pas traduits. Les libellés applicatifs et descriptions des preuves sont bilingues.
- Un ancien snapshot sans fuseau utilise UTC; une référence absente est indiquée comme non fournie, jamais inventée. Les PDF historiques déjà publiés ne sont pas régénérés rétroactivement. Une facture finale avec solde représente l’état figé de sa finalisation; les paiements ultérieurs exigent leurs propres reçus.
- Les identifiants des portions restent dérivés du compte, sans nouvelle séquence indépendante par fournisseur. Les identités HSP restent DEMO. Aucun réglage n’a été activé sur une base réelle.
- Aucune séparation réelle Stripe Connect n’est revendiquée. Les frais Stripe effectifs restent inconnus tant qu’ils ne sont pas importés; leur modèle d’attribution proportionnelle reste distinct du prix HSP. Stripe Terminal, S710 et Tap to Pay restent au backlog, sans implémentation.
- Les suites locales ci-dessus ont été exécutées. Les E2E distants, tests de promotion de production et campagnes de charge/broadcast ou intégrations vétérinaires spécialisées n’ont pas été exécutés; ce rapport ne prétend pas couvrir chaque commande du dépôt ni valider un déploiement.

Arrêt pour révision : aucun push, aucune PR, aucune fusion ni aucun déploiement.

## Sauvegarde sélective locale

Le commit de sauvegarde contient uniquement les 27 fichiers de code, tests, migrations et documentation explicitement sélectionnés. Les PDF, PNG, textes extraits, snapshots, résultats et logs sont exclus de Git et conservés dans `build/review/hsp-billing-consolidated-20260909.zip`. Les liens de preuves de ce rapport deviennent disponibles après extraction de l’archive à la racine du dépôt. Les deux aperçus PNG en double sont retirés; les 84 images de pages sont conservées.

L’archive contient ce rapport, le backlog, les résultats et logs de validation, un manifeste SHA-256 de chaque entrée et le script de reconstruction. Les entrées sont triées, les dates et permissions ZIP fixées et le stockage sans compression rend la reconstruction indépendante de la version de zlib. Le SHA-256 de l’archive est fourni séparément afin d’éviter une référence circulaire. Aucun push, PR, fusion ou déploiement n’est réalisé.
