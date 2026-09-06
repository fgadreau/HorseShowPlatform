# Tranche 1A — serveur local et validation

Base exacte : contrat documentaire `1ec44dbc8e476bffc87427071c73189db01fa9aa`.
Branche locale : `feat/billing-folio-foundation`. L'ancienne branche/copie de travail
est conservée sous `archive/billing-foundation-docs-local`; les trois documents
approuvés restent inchangés. Aucun push, déploiement ou migration distante de cette
tranche. L'application locale n'a pas reçu la migration non plus : seule une base
jetable clonée dans Docker a été migrée puis supprimée.

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
| `add_billing_sale` | Clé de requête + source UUID stable, produit/quantité, éventuel prix explicite, compte client et bénéficiaire/cheval. Auteur/devise imposés par le serveur. |
| `record_billing_payment` | Clé, compte/version, montant réellement reçu, date/moyen/référence, confirmation et affectations; retourne reçu et solde. |
| `get_billing_statement` | Personnel autorisé : crée un relevé figé idempotent, sans numéro de facture. |
| `finalize_billing_folio` | Clé, compte/version et **UUID du relevé confirmé**. Un relevé périmé, y compris après changement de coordonnées, impose une nouvelle confirmation. |
| `find_billing_account`, `get_billing_document` | Recherche autorisée par numéro, consultation des documents figés; connaître une référence ne donne pas accès. |

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

Commande : `npm run test:billing:sql`.
Pré-requis : Docker local et conteneur `supabase_db_hsp-vet-local` issu des outils
locaux existants. Le script refuse un socket distant et n'accepte aucune URL de
base distante. Il clone schéma/données/propriétaires/droits dans une base nommée
`billing_folio_test_<pid>`, utilise les rôles `authenticated` pour les RPC, puis
supprime la base créée. Il ne rejoue pas l'ensemble des migrations depuis une
base vide : la base source est le Supabase local existant.

Résultats :

- 48 assertions SQL et 28 contrôles explicites de rejets attendus réussis dans
  [billing_folio_foundation.sql](../../../supabase/tests/billing_folio_foundation.sql).
- Tests existants `stall_booking_invoice.sql` et `incentive_nomination_programs.sql`
  réussis après migration, chacun avec rollback de ses fixtures.
- Deux secrétaires en sessions PostgreSQL indépendantes : un compte, deux ventes.
  Le pilote de test observe réellement la seconde session bloquée sur le verrou
  avant de libérer la première. Les retries simultanés restituent le même résultat.
- Courses paiement/finalisation : un paiement/reçu et une facture finale; la
  requête concurrente avec récapitulatif périmé est refusée. Pas de suraffectation.
- Empreintes de toutes les lignes de sept tables historiques inchangées avant/après :
  `invoices`, `invoice_line_items`, `payments`, `manual_sales`, `entries`,
  `stall_bookings`, `contact_organization_memberships`.
- Syntaxe du script vérifiée avec `node --check`; diff sans erreur de whitespace.

Le résultat machine est produit dans `.tmp/billing-tests/results.json` avec
`complete: true`. Les tests sont de véritables transactions PostgreSQL locales;
ils ne sont ni des mocks de service ni des E2E navigateur. Aucun stockage de
fichiers n'est modifié par la migration; une vérification exhaustive des fichiers
historiques distants reste hors de cette validation locale.
