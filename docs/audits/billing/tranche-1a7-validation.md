# Tranche 1A.7 — Stripe test, validation locale

Base : `35275a1e4d5d92be3ac3b5e2b669b07ea1b56c9d`, branche source approuvée `feat/billing-folio-checkout-server`. Branche de travail : `feat/billing-stripe-test-ui`. Aucun fichier suivi étranger n'était modifié ; les trois SVG sont préservés et non suivis. Aucune migration approuvée n'est modifiée.

**Statut : implémentation serveur et tests locaux réalisés ; qualification auprès de Stripe test non exécutée, faute de configuration.** Les résultats PostgreSQL et mocks ci-dessous ne constituent pas une validation de carte, Connect ou webhook auprès du fournisseur réel.

## Audit recovery et contrats officiels

La branche `recovery/stripe-billing-2026-09-02` a été inspectée sans fusion. Ses fonctions `stripe-invoice-payment`, `stripe-connect`, `_shared/stripe`, `stripe-webhook` et ses services utilisent Express/destination charges, mais le paiement dépend d'un portefeuille, peut choisir une capture manuelle et écrit dans `payments`/`invoices` legacy après l'appel externe. Ces writers et leurs migrations n'ont pas été repris. Le transport HTTP encodé et le principe de refus des clés live ont été réutilisés conceptuellement ; le registre financier et la confirmation sont nouveaux.

Contrats vérifiés dans la documentation officielle pendant cette intervention :

* [Destination charges avec Elements](https://docs.stripe.com/connect/destination-charges?platform=web&ui=elements) : PaymentIntent sur la plateforme, `transfer_data[destination]`, compte Express par association.
* [PaymentIntents](https://docs.stripe.com/api/payment_intents) : un intent distinct par paiement partiel, `capture_method=automatic`, aucun SetupIntent/Customer/portefeuille requis.
* [Idempotence](https://docs.stripe.com/api/idempotent_requests) : clé fournisseur stable ; ne pas recréer aveuglément après la période de conservation d'une clé.
* [Webhooks](https://docs.stripe.com/webhooks) : signature sur corps brut, répétitions, ordre non garanti, récupération de l'objet courant.
* [Annulation](https://docs.stripe.com/api/payment_intents/cancel) : annulation côté fournisseur ; fermer une fenêtre n'annule rien.

Le transport fixe `Stripe-Version: 2024-06-20` pour conserver un contrat explicite compatible avec les paramètres v1 utilisés ; il ne dépend pas de la version par défaut du compte. Les événements servent de notification durable : leur contenu financier n'est jamais appliqué directement, l'intent courant est relu via l'API. Seules les cartes sont proposées pour le pilote, capture automatique, sans frais d'application configurés. Aucun modèle commercial définitif de commissions, transferts interrégionaux ou remboursements n'est approuvé ici.

## Code et schéma

* `20260906001100_billing_stripe_test.sql` : comptes fournisseurs test, tentatives durables, événements reçus, RPC fournisseur privées, réservation, adaptation additive de l'encaissement et de la fermeture.
* `20260906001200_billing_ui_contracts.sql` : détail autorisé, catalogue aux prix du contexte, portée de navigation et codes publics stables pour 1B.
* `server/billing/stripe.mjs` : transport, signatures, préparation/reprise/annulation, réception et reprise des événements.
* `server/billing/local-server.mjs` : serveur local sur `127.0.0.1:54331`, Supabase loopback uniquement, origine contrôlée, corps borné, réponses sans cache, erreurs expurgées.
* `server/billing/configure-test.mjs` : configuration locale explicite d'un compte Express test existant, après vérification auprès de Stripe ; jamais exécutée par une migration.
* `supabase/tests/billing_stripe_test.sql`, `scripts/billing/stripe-concurrency.mjs`, `stripe-service.test.mjs` et lanceur SQL étendu.

Tables : `billing_stripe_accounts` (une association/un compte connecté, test uniquement, désactivé par défaut), `billing_stripe_attempts` (association/contexte/folio/payeur/acteur, montant/devise, clé, fournisseur, état, résultat), `billing_stripe_events` (notification durable minimale, reprises, erreurs). Index unique partiel : une tentative non résolue par folio. Un fournisseur ne peut être lié à deux tentatives ; un paiement et un reçu au plus par tentative. Le moyen `stripe_test` est ajouté aux paiements sans modifier les lignes existantes.

RPC authentifiées : `begin_billing_stripe_attempt`, `authorize_billing_stripe_attempt`, `get_billing_stripe_status`. L'UUID connu ne suffit pas ; le contact effectivement payeur est vérifié. La consultation et la reprise restent possibles pour le payeur toujours autorisé après retrait d'activation, sans autoriser de nouvelle tentative.

RPC réservées au service : configuration, lecture privée de tentative, `billing_stripe_observe`, réception et résultat d'événement. Le rôle navigateur ne peut pas créer un encaissement fournisseur. RLS activée ; aucun DML direct, y compris pour le service. Le service ne lit que les trois registres fournisseur et écrit par RPC. Fonctions privilégiées avec `search_path` fixé ; aides privées non exécutables par le client.

## Atomicité, concurrence et reprises

L'ouverture de tentative précède l'appel Stripe. Le serveur impose folio, payeur, association, contexte adopté et devise ; le montant partiel demandé est borné par le solde recalculé. Le montant reste réservé tant que la tentative n'est pas résolue. L'encaissement manuel calcule son plafond en retranchant cette réservation sous le même verrou.

Ordre : contrôle association → portée 1A → folio → contacts triés par UUID → chevaux triés par UUID → association. Une tentative non résolue bloque les deux fermetures. Ce blocage provient du registre fournisseur ; `billing_set_close_block` ne peut pas le supprimer. La préparation d'un paiement périme le récapitulatif par révision de contrôle sans retirer l'attestation de frais complets. Sa confirmation incrémente la version financière.

La confirmation privée valide mode test, plateforme, destination, montant, devise, capture et rattachement. Elle crée atomiquement paiement, affectations dans l'ordre des frais, reçu, outbox et audit, puis résout la réservation. Un succès ne ferme jamais le compte. Une confirmation déjà engagée reste recevable après désactivation. Les anomalies restent bloquantes et visibles administrativement ; aucun encaissement n'est supposé.

Une réponse externe perdue est récupérée avec `hsp-test-<attempt UUID>`. Après 23 heures sans identifiant lié, aucun nouveau POST de création n'est fait : recherche bornée des intents existants par date et référence de tentative, puis relecture et validation. Une recherche incomplète ou ambiguë renvoie `BILLING_RECONCILIATION_REQUIRED` et garde la réservation. Une annulation est demandée à Stripe, puis son état réel est enregistré ; le navigateur ne peut déclarer le paiement annulé ou reçu.

Les événements authentifiés sont inscrits avant l'acquittement HTTP. Un drain local borné les reprend toutes les 15 secondes, en priorisant le plus petit nombre de tentatives puis l’identifiant pour qu’un lot d’événements non rattachés ne monopolise pas la file ; il ne s'agit pas du worker documentaire. Échec et événement sans liaison restent durables. Un événement répété n'ajoute aucune ligne, et le traitement relit l'intent courant pour éviter d'appliquer un ancien état. Les données Stripe techniques ne sont pas incluses dans les documents publics.

## Commandes et résultats

```sh
node scripts/billing/test-sql-local.mjs > .tmp/billing-tests/stripe-clone.log 2>&1
node scripts/billing/test-sql-local.mjs --fresh > .tmp/billing-tests/stripe-fresh.log 2>&1
node scripts/billing/stripe-service.test.mjs > .tmp/billing-tests/stripe-service.log 2>&1
node --check server/billing/stripe.mjs
node --check server/billing/local-server.mjs
node --check server/billing/configure-test.mjs
git diff --check
```

| Validation | Résultat |
| --- | --- |
| PostgreSQL réel, copie locale jetable | 200 assertions SQL, 87 rejets SQL attendus ; exécution complète. |
| PostgreSQL réel, reconstruction vierge | 146 migrations et seed ; mêmes 200 assertions et 87 rejets ; exécution complète. |
| Suites antérieures inchangées | 1A et 1A.6, y compris noms documentaires figés et récapitulatif périmé. |
| Concurrence PostgreSQL réelle | 17 groupes : 16 antérieurs et réservation Stripe contre encaissement manuel ; 12 refus supplémentaires vérifiés par les lanceurs, hors compte SQL. |
| Régressions legacy | Réservations et nominations réussies ; empreintes historiques des sept tables financières/sources conservées. |
| Services avec mocks | 20 tests réussis : configuration live absente/refusée, signature/corps/expiration, réponse perdue, états, annulation, fenêtre idempotente, champs injectés, identité retirée, événement durable et reprise. |
| Stripe test réellement appelé | **0 appel, 0 PaymentIntent, 0 paiement, 0 événement réel traité.** |

Les résultats machine des deux exécutions SQL sont `.tmp/billing-tests/results.json` et `rebuild-results.json`, `complete:true`. Les nouvelles assertions couvrent aussi deux encaissements/deux reçus puis une facture finale, changement de frais pendant paiement, désactivation, anomalies de mode/montant/devise/destination/plateforme et les contrats UI sous les identités réelles PostgreSQL. Les tests services simulent Stripe ; aucune simulation n'est présentée comme une confirmation réelle du fournisseur.

## Configuration manquante et limites

Aucune valeur Stripe renseignée n'a été trouvée dans les variables locales inspectées. Variables nécessaires : `STRIPE_SECRET_KEY` (`sk_test_`), `STRIPE_PUBLISHABLE_KEY` (`pk_test_`), `STRIPE_WEBHOOK_SECRET` (`whsec_`). Il faut également les clés de la **pile Supabase locale isolée** via `BILLING_SUPABASE_ANON_KEY`, `BILLING_SUPABASE_SERVICE_ROLE_KEY` et son URL `BILLING_SUPABASE_URL`. Aucune valeur n'est imprimée, ajoutée à Git ou configurée par cette livraison.

Après préparation séparée d'une pile locale fictive et fourniture des clés test autorisées :

```sh
node server/billing/configure-test.mjs <association_fictive_uuid> <compte_Express_test_existant>
node server/billing/local-server.mjs
# Dans un autre terminal disposant de Stripe CLI authentifié en test :
stripe listen --forward-to http://127.0.0.1:54331/webhook
```

Le secret de signature doit correspondre au listener effectif. L'application locale se lance avec les variables Vite locales décrites dans le rapport 1B. Ces commandes d'accès au fournisseur n'ont pas été exécutées ici.

Restent à qualifier avec Stripe : onboarding Express effectif, Payment Element réel, authentification 3DS réelle, livraison/rejeu des vrais webhooks, annulation et états retardés du fournisseur. Le transport et les verrous sont couverts localement ; il n'y a pas de prétention à une matrice exhaustive de tous les ordonnancements réseau. La recherche d'une création ambiguë est bornée et peut exiger une réconciliation administrative ; une anomalie ne peut pas être effacée arbitrairement. Les remboursements et rétrofacturations sont hors périmètre, ce qui interdit de présenter ce pilote comme un rapprochement comptable complet.

Aucun Stripe live, paiement réel, migration distante, PREPROD/PROD, push, PR, fusion ou déploiement. 1C (PDF/worker) et 1D (qualification/intégration et régressions élargies avant pilote) restent séparées.

## Correctif de reprise après revue — base `a73b6df7ffefc282dd9228fe984af7b5acf30ef4`

Correctif sur `feat/billing-stripe-test-ui`, validé localement avant le commit et le push autorisés pour revue indépendante. La clé navigateur Stripe est désormais persistée dans `localStorage` par identité et compte, indépendamment de la version financière. Une reprise utilise le montant et la clé originaux ; un timeout ne les renouvelle jamais. Le bouton « Résoudre la tentative précédente » permet aussi de rejouer la préparation originale si sa réponse a disparu et que la saisie a changé. Un état serveur `canceled` ou `succeeded` résout la clé ; une nouvelle tentative du même montant reçoit alors une nouvelle clé. Une réponse concernant un autre identifiant de tentative connu ne peut pas supprimer la clé courante. Les secrets et le client secret Stripe ne sont pas persistés dans ce registre.

Validation ciblée : `node scripts/billing/recovery.test.mjs` — 4 tests de service réussis avec stockage/RPC simulés ; `node scripts/billing/stripe-service.test.mjs` — 20 tests fournisseur simulés réussis. Le scénario Chromium ajouté annule une tentative via le serveur simulé, recharge la page, paie le même montant avec une nouvelle clé et vérifie un seul encaissement. La suite navigateur complète compte désormais 20 scénarios réussis ; détails dans le rapport 1B.

Aucune modification serveur ou migration. Les résultats PostgreSQL antérieurs ci-dessus restent ceux de leur exécution initiale ; les suites SQL n'ont pas été relancées pour ce correctif navigateur. **Toujours 0 appel réel Stripe pour cette intervention.** L'annulation réelle, les webhooks et le Payment Element fournisseur restent à qualifier dans Stripe test. Une purge volontaire du stockage navigateur ne constitue pas une reprise durable de ce client ; les contraintes serveur restent indispensables. Aucun paiement réel, secret configuré, changement de PROD ou travail 1C.
