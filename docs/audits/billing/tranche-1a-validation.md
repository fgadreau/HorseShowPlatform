# Tranche 1A — serveur local et validation

Contrat documentaire : `1ec44dbc8e476bffc87427071c73189db01fa9aa`.
Correction de la fondation revue : `b43a4b1a2873ae2cb1785b78f1b618b4a4e5151a`.
Branche : `feat/billing-folio-foundation`. Validation du 6 septembre 2026.
Les trois documents approuvés restent inchangés. Les corrections ne sont pas
poussées; aucune PR, fusion, migration distante ou modification PREPROD/PROD.
Seule la migration 1A non appliquée à distance est corrigée; aucune migration
antérieure n'est réécrite. La base locale de développement reste inchangée.

## Corrections après revue

- Fiscalité : le profil produit du contexte est l'unique autorité. Le champ legacy
  `organization_products.tax_applicable` n'est plus consulté. Taxes et raison
  d'exemption simultanées, ou absence des deux, sont refusées. Une raison vide ne
  constitue pas une exemption. Aucun taux n'est inventé.
- Prix : `unit_price` est retiré des clés autorisées de `add_billing_sale`, même
  pour une valeur de zéro. Le tarif vient exclusivement du profil figé du contexte.
  La gratuité exige un tarif configuré à `0.00`. Aucun remplacement négocié ajouté.
- Confidentialité : instantanés et réponses documentaires construits par listes
  explicites de champs. Les vues et privilèges de colonnes excluent les auteurs
  internes et métadonnées de version. Les preuves complètes demeurent dans les
  écritures/journaux protégés, accessibles au personnel habilité par
  `billing_get_audit`. La version de concurrence reste dans les réponses de
  commandes réservées au personnel, pas dans le document destiné au payeur.
- Outbox : états `pending`, `processing`, `completed`, `failed`, tentatives,
  erreur, prochaine tentative, dates de prise en charge/fin, bail et référence de
  résultat. Prise exclusive avec `FOR UPDATE SKIP LOCKED`, jeton renouvelé à chaque
  tentative, reprise après expiration et refus d'un ancien jeton. Transitions
  contrôlées par triggers et journalisées dans `billing_outbox_events` immuable.
  Seules les RPC de capacité `service_role` pilotent ces transitions; aucune
  écriture libre n'est accordée. Aucun worker ou fichier n'est créé.

## Livré

Migration additive [20260906000900_billing_folio_foundation.sql](../../../supabase/migrations/20260906000900_billing_folio_foundation.sql) :

- `contacts.company_name` nullable, sans reprise depuis le nom d'écurie ni changement
  des UUID. Réutilisation des helpers actuels `contact_is_linked_to_org` et
  `horse_is_linked_to_org`, basés sur les répertoires de disciplines.
- Types hors concours versionnés, contextes configurés explicitement et à devise
  unique; compte client stable association/contact, compte numéroté UNIQUE
  association/contexte/compte client, indépendamment de la devise et de la fermeture.
- Frais de vente à payeur unique, provenance/idempotence, cheval/bénéficiaire et
  preuve du rôle vérifié côté serveur. Prix/taxes configurés pour le contexte,
  montants décimaux, taxes indépendantes détaillées, exonération explicite.
- Encaissements confirmés comptant/Interac, allocations au même compte, reçus
  individuels, solde calculé; référence Interac unique par association après retrait
  des espaces périphériques, casse conservée. Aucune conversion de devise.
- Relevés datés conservés; facture finale unique et immuable; trois séries
  distinctes compte/reçu/facture. Fermeture manuelle liée à un relevé précis, version
  et instantané contrôlés. Encaissement ultérieur possible sans réécrire la facture.
- Journal append-only et outbox documentaire transactionnelle. RLS et révocation
  des écritures directes, helpers privés; documents accessibles seulement au payeur
  lié ou au personnel autorisé. Les agents n'obtiennent aucun accès financier
  global à partir d'un lien au cheval.

## RPC disponibles dans la copie locale de test

| RPC | Usage |
| --- | --- |
| `billing_create_context_type` | Configuration versionnée réservée à l'admin d'association/plateforme : noms FR/EN, séries, catégories, politiques, rôles; aucun type métier codé comme nouvel enum financier. |
| `billing_create_context` | Crée et adopte explicitement un contexte neuf, sa devise, son calendrier, sa configuration et ses profils produit/taxes. Hors concours, hérite des catégories/droits/politiques du type. |
| `billing_get_customer_account` | Résout/crée l'identité financière du contact; contexte optionnel pour les droits d'une secrétaire limitée à un concours. |
| `add_billing_sale` | Clé de requête + source UUID stable, produit/quantité, tarif imposé par le profil du contexte, compte client et bénéficiaire/cheval. Auteur/devise imposés par le serveur. |
| `record_billing_payment` | Clé, compte/version, montant réellement reçu, date/moyen/référence, confirmation et affectations; retourne reçu et solde. |
| `get_billing_statement` | Personnel autorisé : crée un relevé figé idempotent, sans numéro de facture. |
| `finalize_billing_folio` | Clé, compte/version et **UUID du relevé confirmé**. Un relevé périmé, y compris après changement de coordonnées, impose une nouvelle confirmation. |
| `find_billing_account`, `get_billing_document` | Recherche autorisée par numéro, consultation des documents figés; connaître une référence ne donne pas accès. |

RPC internes supplémentaires : `billing_get_audit(uuid)` vérifie les droits du
personnel et du contexte; `billing_claim_document(text, uuid, integer)` et
`billing_finish_document(uuid, uuid, boolean, text, text, integer)` sont réservées
à `service_role`. Le helper de projection documentaire n'est pas exécutable par
le payeur. Le futur worker devra produire effectivement le résultat avant de
marquer son travail terminé; cette tranche ne vérifie pas l'existence d'un fichier.

La finalisation ajoute l'UUID du relevé au contrat initial de version : cela empêche
d'émettre des coordonnées différentes de celles du récapitulatif confirmé, même
si aucune vente/paiement n'a changé la version du compte.

Les instantanés comprennent le nom du contact, son entreprise facultative, les
coordonnées, la devise, le numéro du compte et les données vendeur/fiscales
existantes. Les numéros fiscaux payeur inexistants ne sont pas inventés. Le reçu
identifie explicitement son paiement et ses affectations, en plus de la situation
du compte au moment de l'émission.

## Choix de réalisation et limites de la tranche

Les trois pièces utilisent un stockage commun `billing_documents` avec contraintes
partielles d'unicité par type, et vues de lecture `billing_statements`,
`billing_receipts`, `billing_final_invoices`. Les UUID de pièces et leurs séries
restent distincts; aucune facture miroir n'est créée dans les anciens `invoices`.
La provenance secrétaire est portée par `billing_charges.source_type/source_id`;
les adaptateurs/versionnements des autres sources viendront au lot métier.

L'adoption et les anciens writers prennent le même verrou de portée. Un contexte
contenant des factures, ventes, inscriptions, réservations ou adhésions legacy
est refusé : rapprochement requis, aucun effacement. Après adoption, les anciens
writers de cette portée sont refusés côté serveur pour éviter deux moteurs.
**Hors concours, le modèle legacy ne connaît que `show_id=NULL` : l'adoption exige
une portée NULL sans historique financier et bloque ses anciens writers pour
l'association entière.** Ce garde-fou est volontairement conservateur; il faut
raccorder les sources/classer l'historique avant un pilote sur une association
qui possède déjà ces opérations. Les autres portées restent sur leur moteur actuel.

La configuration devient immuable dès création du contexte, ce qui est plus strict
que le gel minimal à la première opération. Les règles fiscales possèdent une
version/période de validité; une vente hors validité est refusée. L'édition de
configuration d'un contexte adopté et la succession automatique de taux dans le
même contexte ne sont pas livrées. Les taux sont explicitement fournis par l'admin,
jamais déduits du taux global historique. Le fuseau du contexte détermine la date
fiscale; aucun barème provincial/étatique n'est certifié ou préchargé ici.

CAD/USD à deux décimales sont prises en charge. Les tarifs de contexte sont figés;
si sa devise diffère de celle du catalogue d'association, le tarif doit être fourni
explicitement à la configuration. Aucun prix n'est converti implicitement.
Chaque paiement de cette tranche doit être entièrement affecté aux frais du même
compte; excédents/avances non affectées refusés. Un compte avec solde dû peut être
fermé avec son récapitulatif, puis encaissé. Les frais ordinaires après fermeture
sont refusés; aucun second compte/final n'est possible.

Aucune interface, route ou formulaire contact n'a été modifié (tranche 1B).
L'outbox contient des demandes durables, mais **aucun PDF/fichier n'est encore généré**
(tranche documentaire). Les tests services et navigateur restent à ajouter avec
ces couches. Stripe, exports effectifs, mandats agents, exigences/activation réelle
des réservations, crédits/remboursements et notes de débit restent hors de 1A.
La politique `allocated_received` ne simule aucune activation de service dans les
sources non raccordées. HSP reste le registre opérationnel, pas un grand livre.

## Validation exécutée

Commandes finales exécutées avec succès :

```sh
npm run test:billing:sql
npm run test:billing:rebuild
node --check scripts/billing/test-sql-local.mjs
git diff --check
git diff --exit-code b43a4b1 -- docs/audits/billing/plan-et-scenarios.md docs/audits/billing/premiere-tranche.md docs/audits/billing/tests-acceptation.md
```

| Vérification | Clone local | Reconstruction vierge |
| --- | ---: | ---: |
| Assertions SQL exécutées | 97 | 97 |
| Rejets SQL attendus réellement observés | 49 | 49 |
| Scénarios de concurrence indépendants | 5 | 5 |
| Suites de régression legacy | 2 | 2 |
| Migrations du dépôt rejouées depuis zéro | Sans objet | 143 |
| Seed du dépôt après reconstruction | Sans objet | Réussi |
| Résultat final | Réussi | Réussi |

Les compteurs SQL proviennent de l'exécution des helpers d'assertion/rejet des
fichiers `billing_folio_foundation.sql` et `billing_folio_review.sql`, y compris
les assertions exécutées en boucle. Ils ne comptent ni les assertions Node du
pilote ni les assertions des suites legacy. Les courses ajoutent séparément trois
rejets vérifiés : appel interdit d'un helper privé, paiement à version périmée,
finalisation à version périmée. Une prise d'outbox concurrente sans travail retourne
`null`, ce qui n'est pas une erreur. Total des rejets vérifiés dans la tranche,
SQL et pilote réunis : **52 par mode**, hors suites legacy.

Couverture des corrections : legacy faux explicitement taxé, legacy vrai
explicitement exempté, ambiguïtés fiscales refusées, injection de prix par une
secrétaire refusée (dont zéro), gratuité configurée, invariance des prix/taxes et
documents après modification du catalogue legacy. Tests sous le véritable rôle
`authenticated` du payeur sur compte, relevé, reçu et facture, contrôle récursif
des clés internes absentes, refus des accès directs aux colonnes/helpers/journaux
protégés; accès complet du personnel habilité au journal conservé. Tests outbox :
échec/retry, délai avant reprise, succès idempotent, expiration/reprise, jeton
périmé, écritures libres interdites et audit des transitions.

Les cinq courses utilisent des sessions PostgreSQL distinctes : deux secrétaires
créant les premières ventes; retries identiques; paiements simultanés;
finalisations simultanées; prises simultanées du même travail documentaire. Pour
la première course, le pilote observe la seconde session bloquée sur le verrou
avant de libérer la première. Résultats : un compte, aucune duplication de frais,
aucune suraffectation, une facture finale et une seule prise de travail.

Régressions exécutées par les deux commandes : `stall_booking_invoice.sql` et
`incentive_nomination_programs.sql`, avec rollback des fixtures. Empreintes de
chaque ligne des sept tables historiques comparées avant/après : `invoices`,
`invoice_line_items`, `payments`, `manual_sales`, `entries`, `stall_bookings`,
`contact_organization_memberships`. Sur base vierge, ces comparaisons ne prouvent
pas la préservation d'un historique réel; le mode clone apporte ce contrôle sur
les données locales existantes. Aucun stockage documentaire n'est modifié.

### Isolation et reconstruction

Le mode clone copie schéma, données, propriétaires et droits de
`supabase_db_hsp-vet-local` vers `billing_folio_test_<pid>`, applique 1A et supprime
uniquement cette copie. Le mode vierge initialise un projet Supabase temporaire
sans migrations du dépôt ni référence distante. `supabase db start --workdir`
prépare seulement les schémas système officiels auth/storage. Le script rejoue
ensuite les **143 fichiers SQL dans l'ordre lexical**, une transaction par fichier,
applique `supabase/seed.sql`, puis exécute toutes les validations ci-dessus.

Le projet/volume/conteneur porte un nom aléatoire propre au test, vérifié libre;
les ports sont locaux et temporaires. Le nettoyage appelle `supabase stop
--project-id <projet-jetable> --no-backup --workdir <répertoire-jetable>`, puis
supprime uniquement son répertoire. Le pilote refuse les arguments de connexion,
les sockets/contextes Docker distants et un fichier de liaison `project-ref`.
Aucune URL de base distante ou identité du projet hébergé n'est utilisée.

Contrôle final en lecture seule : aucun conteneur/volume de reconstruction ne
subsiste; zéro base `billing_folio_test_%`; `billing_folios` reste absent de la base
locale de développement. Les environnements jetables ont été supprimés.

Pendant la préparation du pilote, un essai en autocommit a échoué dans `0024`
(`contact_dedup_map`, table temporaire `ON COMMIT DROP`). Il s'agissait d'une erreur
du pilote, corrigée par l'exécution transactionnelle par fichier. La migration
historique est inchangée et passe désormais. Les avertissements « there is no
transaction in progress » viennent des fichiers qui contiennent déjà leur propre
`COMMIT`; ils n'empêchent pas le rejeu. Aucun échec préexistant de la chaîne ne
subsiste dans cette validation.

Résultats machine locaux : `.tmp/billing-tests/results.json` et
`.tmp/billing-tests/rebuild-results.json`, tous deux `complete: true`, avec liste
des migrations rejouées, compteurs, étapes et éventuel échec. Ces artefacts sont
régénérés par les commandes; ils ne sont pas des données de production.
Les tests sont de véritables transactions PostgreSQL locales, sans mocks.
Les tests services/navigateur et les fichiers PDF restent hors de cette tranche.
