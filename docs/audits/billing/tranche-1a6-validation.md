# Tranche 1A.6 — Validation des extensions serveur

Date : 6 septembre 2026. Correctif des instantanés après revue indépendante. Branche locale : `feat/billing-folio-checkout-server`.

## Base et périmètre

Base exacte : `28addc94a4508ff3f71e1bf79c322b4a7daabbe8`, vérifiée sur la branche locale et sur `origin/feat/billing-folio-foundation` par lecture seule. Elle contient la fondation validée `a3067ed4f1a48b0216972187b706c631bc54d819` et le document 1A.5 approuvé. Aucun fichier suivi étranger n'était modifié au départ. Les trois SVG non suivis sont conservés à l'identique.

Cette livraison implémente des RPC PostgreSQL, sans service applicatif supplémentaire. Aucun Stripe, PaymentIntent, webhook, interface, route navigateur, PDF, worker, remboursement ou raccordement aux réservations réelles n'est ajouté. Aucune association n'est activée par la migration. Le pilote reste entièrement fictif ; la seconde association est une fixture d'isolation.

Fichiers de la livraison :

* `supabase/migrations/20260906001000_billing_checkout_server.sql` : migration additive.
* `supabase/tests/billing_checkout_server.sql` : assertions et refus sous les identités authentifiées.
* `supabase/tests/billing_checkout_compat.sql` : adaptation exclusivement jetable des fixtures 1A aux capacités désactivées par défaut.
* `scripts/billing/checkout-concurrency.mjs` : concurrence entre véritables sessions PostgreSQL.
* `scripts/billing/test-sql-local.mjs` : orchestration des suites et résultats machine.
* Le présent rapport.

La migration additive 1A.6 est complétée conformément à la revue ; toutes les migrations antérieures à 1A.6, les tests SQL 1A, les trois contrats approuvés et le document de conception 1A.5 restent inchangés.

## Schéma et contrats

| Table ajoutée | Rôle |
| --- | --- |
| `billing_pilot_organizations` | Capacités moteur, lecture personnelle, checkout ; toutes désactivées par défaut ; révision de politique. |
| `billing_context_access` | Adoption explicite du contexte, capacités, autorisation de phase de fermeture, année structurée et provenance. |
| `billing_read_history` | Continuité de lecture des comptes déjà accessibles, sans activation de nouvelles commandes. |
| `billing_checkout_state` | Attestation révocable de frais complets, auteur, date et révision, distincte de `open/closed`. |
| `billing_close_blocks` | Blocages durables identifiés par clé, motif public contrôlé et détails internes. |
| `billing_payer_recaps` | Liaison immuable entre document provisoire, payeur authentifié, version financière et révisions internes. |

Les contraintes d'unicité du compte, de la facture et de l'outbox restent celles de 1A. Les documents, numéros et données financières historiques ne sont pas réécrits. Seuls les identifiants des comptes 1A existants sont inscrits au registre de continuité de lecture ; cela n'active aucune capacité.

RPC exposées à `authenticated`, avec contrôle serveur :

* `billing_set_capabilities` : l'administrateur de plateforme autorise l'association ; l'administrateur de l'association adopte ses contextes. Une clé publique n'accorde aucune autorité.
* `billing_set_ready`, `billing_set_close_block`, `billing_get_close_controls` : commandes et lecture du personnel autorisé ; les preuves complètes restent internes.
* `list_billing_accounts`, `list_billing_contexts`, `get_billing_finance_overview`, `search_billing_finance` : Finance, comptes opérationnels, concours sans compte inclus, recherche typée.
* `list_my_billing_accounts` : identité personnelle stricte, même pour un administrateur.
* `get_billing_account_detail`, `get_billing_checkout_eligibility` : projection commune avec autorisation personnelle ou administrative explicite.
* `prepare_own_billing_recap`, `finalize_own_billing_folio` : parcours réservé au véritable payeur, indépendant de la permission du personnel.

Les wrappers 1A sont conservés. Le dispatcher `billing_execute` et `billing_get_customer_account` ajoutent les contrôles de capacité ; leurs algorithmes antérieurs sont renommés en fonctions privées. La configuration préalable des types et contextes reste possible pour les administrateurs sans activer le moteur. Les nouvelles ventes, paiements, relevés et fermetures passent par les contrôles ; un retry identique déjà réussi retourne sa réponse durable après retrait d'une capacité, sans nouvel effet.

## Année, lectures et permissions

L'année est enregistrée dans `financial_year`, avec `year_basis`. Pour un concours, elle provient de `shows.start_date`, date du calendrier local ; une année fournie contradictoire est refusée. Hors concours, elle est configurée explicitement comme année de service. Une année qualifiée est figée. Une année inconnue reste `NULL`, recherchable avec `unqualified`, sans déduction du nom, du numéro ou des paiements. Les activités permanentes utilisent des contextes annuels distincts conformément à 1A.5.

Les listes acceptent une limite de 1 à 100 et un offset borné ; les tris utilisent une clé UUID finale stable. Les filtres de comptes sont `year`, `state`, `show_id`, `context_id`, `type_id`, `prior_balance`, `unqualified`, `q`. `prior_balance` retrouve les soldes positifs d'années antérieures, y compris après fermeture. L'absence d'année sélectionnée signifie toutes les années autorisées. Les agrégats sont séparés par devise ; `groups: []` et `has_data: false` distinguent l'absence de données des montants nuls et des erreurs SQL.

La recherche couvre compte, reçu, facture, contact payeur, entreprise, bénéficiaire, cheval (y compris sans bénéficiaire), concours et contexte. Elle retourne les comptes correspondants et leurs documents liés, typés ; une référence documentaire retrouve donc aussi son compte. Des index de portée et des index trigrammes sont ajoutés. Aucun compteur ni agrégat n'utilise des comptes hors du périmètre autorisé.

Le rôle `show_roles.secretary` seul n'ouvre que son concours, jamais les contextes hors concours. Mes comptes suit exclusivement profil authentifié → contact lié → compte client payeur → compte financier. Plusieurs contacts liés restent distincts. Entreprise, cavalier, propriétaire, agent, bénéficiaire et auteur n'accordent aucun droit supplémentaire. Le retrait des capacités conserve la consultation des comptes déjà accessibles, à condition que l'identité ou les droits actuels restent valides.

Les nouvelles tables ont RLS et révocation des accès directs, y compris pour `service_role`. Les fonctions privées ne sont pas exécutables par le client. Les fonctions privilégiées fixent `search_path=''` et qualifient les objets. Les projections réutilisent les listes explicites de champs de 1A ; les preuves d'autorisation, auteurs internes, révisions de contrôle et journaux ne sont pas renvoyés au payeur. La version financière reste publique pour la confirmation optimiste.

## Attestation, blocages et fermeture

Une vente invalide l'attestation. L'ajout ou le retrait d'un blocage, une modification des capacités ou de la politique invalident également l'attestation et le récapitulatif. Un paiement conserve l'attestation de frais complets, mais la version financière périme le récapitulatif. La fin du concours n'a aucun effet automatique.

La finalisation autonome exige : capacités association/contexte, phase de fermeture explicitement autorisée, payeur réel, compte ouvert, attestation valide, aucun blocage et solde exactement zéro. Une situation négative est également refusée. Les blocages `pending_operation` et `pending_provider` préparent le raccordement ultérieur sans créer de fournisseur ni de paiement en attente dans cette tranche.

Le récapitulatif fige les coordonnées, frais, taxes, paiements, solde, devise, politique zéro, attestation et version. Il est un relevé provisoire sans numéro de facture. Sa validité compare aussi l'instantané actuel des coordonnées ; une modification du contact ou de l'association impose un nouveau récapitulatif. Les UUID internes de contrôle restent dans une table protégée.

Ordre de verrouillage partagé : contrôle de l'association → portée 1A → compte. Les commandes documentaires verrouillent ensuite tous les contacts payeur et bénéficiaires par UUID croissant (dédupliqués), puis tous les chevaux par UUID croissant, puis l'association. Cet ordre constant est commun au payeur et au personnel ; les verrous sont conservés jusqu'à la fin de la transaction. Les capacités et l'année restent protégées par le verrou de contrôle de l'association. Sous ces verrous, la commande relit les droits, le solde, les révisions et le récapitulatif, puis écrit fermeture, facture unique, journal, résultat idempotent et outbox dans la même transaction. Un nouveau request ID après fermeture est refusé ; le même request ID et le même contenu retournent le résultat durable ; un contenu différent est refusé.

`finalize_billing_folio` conserve la possibilité 1A de fermer avec solde dû. Elle respecte désormais aussi les blocages administratifs et partage les garanties d'unicité avec le payeur. Un concours archivé reste consultable ; le personnel peut encaisser et fermer selon ses droits, mais une vente ordinaire est effectivement refusée côté serveur. La fermeture ne dépend jamais du rendu PDF.

## Commandes et résultats

Commandes finales de validation :

```sh
node scripts/billing/test-sql-local.mjs > .tmp/billing-tests/snapshot-clone.log 2>&1
node scripts/billing/test-sql-local.mjs --fresh > .tmp/billing-tests/snapshot-fresh.log 2>&1
node --check scripts/billing/test-sql-local.mjs
node --check scripts/billing/checkout-concurrency.mjs
git diff --check
```

Les lanceurs n'acceptent aucune URL distante, exigent un socket Docker local et n'utilisent aucun projet lié. Le clone est une nouvelle base dans le conteneur local existant ; le mode vierge crée son propre projet, conteneur et volumes Supabase, initialise les schémas système, rejoue toutes les migrations dans l'ordre puis `supabase/seed.sql`. Seuls les environnements jetables créés sont supprimés. Un échec, y compris de nettoyage, conserve `complete: false` dans le résultat machine.

| Exécution finale | Résultat |
| --- | --- |
| Copie de la base locale | Exécution complète : 171 assertions SQL, 79 rejets SQL attendus. |
| Reconstruction vierge | Exécution complète : 144 migrations, seed, 171 assertions SQL, 79 rejets SQL attendus. |
| Dont suites 1A inchangées | 97 assertions, 49 rejets attendus par exécution. |
| Dont compléments 1A.6 | 74 assertions, 30 rejets attendus par exécution. |
| Concurrence | 16 groupes par exécution : 5 existants et 11 checkout ; 11 refus supplémentaires vérifiés par le lanceur, hors compte SQL. |
| Régressions legacy | `stall_booking_invoice.sql` et `incentive_nomination_programs.sql` réussissent dans les deux modes. |
| Conservation de l'historique | Empreintes identiques de 7 tables financières et sources avant/après migration et après les suites. |

Résultats machine : `.tmp/billing-tests/results.json` et `.tmp/billing-tests/rebuild-results.json`, artefacts ignorés par Git. La suite historique reste inchangée ; un trigger installé uniquement dans les bases jetables adopte ses nouvelles fixtures pour pouvoir rejouer ses commandes avec les nouvelles capacités. Ce trigger est retiré avant les tests 1A.6, qui activent explicitement leurs fixtures via les RPC.

Les onze groupes checkout utilisent deux sessions PostgreSQL indépendantes et vérifient l'attente réelle sur verrou : même commande dans deux onglets, deux clés distinctes, payeur face à secrétaire, révocation de l'attestation, ajout de vente, réception d'un paiement et retrait de capacité. Ils vérifient respectivement résultat durable, facture unique, refus cohérent, absence de frais perdus et récapitulatif périmé. Quatre groupes supplémentaires exercent un renommage de bénéficiaire et de cheval, chacun dans les deux ordres : renommage commis avant finalisation (`BILLING_STALE_RECAP`, aucune facture), puis finalisation avant renommage (écriture bloquée jusqu'au commit, facture conforme au récapitulatif). L'attente sur le verrou de ligne est observée dans `pg_stat_activity`, sans temporisation utilisée comme preuve de concurrence. Les cinq groupes 1A couvrent aussi deux secrétaires, retries de ventes, paiements simultanés, fermetures simultanées et prise de bail d'outbox.

## Limites et risques résiduels

* Le verrou de contrôle par association privilégie la cohérence du pilote et sérialise ses écritures financières. Une mesure de charge sera nécessaire avant un déploiement de volume important.
* Les résultats sont paginés côté serveur, mais les totaux et recherches peuvent recalculer plusieurs instantanés ; aucun benchmark de grande volumétrie n'est revendiqué.
* Les scénarios de concurrence imposent un ordre observé et ne constituent pas une exploration exhaustive de tous les ordonnancements. Le retry après réponse perdue est exercé par répétition de la commande durable, sans panne réseau injectée.
* Les rôles cheval sont exercés notamment dans une fixture cumulant propriétaire, cavalier et agent sans être payeur ; aucune autorisation financière n'est inférée de ces liens.
* Les crédits, excédents et remboursements restent hors modèle de commande du pilote ; la règle de checkout refuse tout solde non nul, sans ajouter un mécanisme de crédit artificiel pour les tests.
* Les blocages fournisseur sont une fondation générique. La future 1A.7 devra créer et résoudre ces blocages sous le même ordre de verrouillage et gérer l'ambiguïté d'une tentative. Aucune intégration Stripe n'est présente ici.
* Les raisons publiques de fermeture sont actuellement françaises ; les données de contexte conservent leurs libellés français et anglais. Leur présentation bilingue devra être raccordée lors de l'interface, sans déduire les droits dans le navigateur.
* Aucun test navigateur n'est ajouté : aucune interface ou route n'est modifiée. Les PDF, le worker et les parcours navigateur seront validés dans leurs tranches autorisées.

Aucune migration distante, modification de PREPROD ou PROD, configuration de secret, paiement, génération de fichier financier, PR, fusion ou déploiement n'a été effectué. La seule consultation distante est la vérification Git en lecture seule de la base. La livraison initiale a ensuite été poussée sur autorisation ; le correctif décrit ci-dessous reste un nouveau commit local sans push. 1A.7 et 1B ne sont pas commencées.


## Correctif des instantanés — parent et portée

Parent exact du nouveau commit correctif : `8f253ea5bd3ebc3e622f0daae65eec35c1149351`. Il ne remplace pas ce commit et n'est pas poussé. Le correctif modifie seulement la migration additive 1A.6, sa suite SQL, le module de concurrence, le lanceur et ce rapport. Aucun accès distant n'a été nécessaire pour ce correctif.

`billing_snapshot` est remplacée dans la migration 1A.6, sans toucher à la migration 1A. Chaque frais conserve ses anciens identifiants et ajoute `beneficiary: { contact_id, display_name }` et `horse: { id, name }` (objet nul si absent). Le nom public assemble prénom, deuxième prénom éventuel et nom, en omettant les éléments vides. Aucune adresse, téléphone ou courriel du bénéficiaire n'est ajouté. Le contexte inclut `financial_year` et `year_basis`, nuls quand inconnus.

Les nouveaux relevés, reçus et factures embarquent ces données dans leurs instantanés immuables. Aucun document existant n'est réécrit ou enrichi a posteriori. Un document historique dépourvu de noms reste donc incomplet sur ces champs : un futur rendu doit signaler leur absence, sans inventer des noms historiques ni relire les fiches actuelles.

La comparaison intégrale de l'instantané du récapitulatif inclut maintenant ces noms et l'année. Les tests sous l'identité du payeur prouvent la péremption après chaque renommage, la présence des noms dans le reçu et le récapitulatif, l'égalité des frais confirmés et facturés, ainsi que l'absence de coordonnées privées supplémentaires. Une comparaison de toutes les lignes documentaires du compte avant et après les modifications postérieures à la fermeture prouve leur immutabilité. Les tests ajoutent **10 assertions SQL et 2 rejets attendus** aux résultats précédents, plus **4 groupes de concurrence réelle**.

### Index du récapitulatif

L'index B-tree `billing_payer_recap_current(folio_id, actor_id, financial_version)` correspond aux trois égalités utilisées pour rechercher le récapitulatif courant. Le filtre des révisions et de l'instantané, puis le tri des documents, restent nécessaires après cette sélection. Le lanceur conserve les plans `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` dans `.tmp/billing-tests/recap-plan-clone.json` et `recap-plan-fresh.json`, non suivis. Il examine le plan normal et vérifie aussi, avec `enable_seqscan=off` uniquement pour cette sonde, que les trois égalités permettent l'accès par cet index. Le plan normal observé utilise déjà `Index Scan` sur `billing_payer_recap_current`, avec les trois égalités dans `Index Cond`. La sonde porte sur une recherche sans résultat. Elle confirme le chemin d'accès disponible ; elle ne prétend pas mesurer un gain sur une volumétrie de production. Aucun paramètre du planificateur de l'application n'est changé.

Les contrôles de syntaxe Node et de whitespace réussissent. Les tests 1A, 1A.6 et les régressions legacy sont exécutés dans chacun des deux environnements jetables, avec reconstruction des 144 migrations dans le mode vierge ; les résultats machine finaux sont complets. Les SVG restent intacts et non suivis. Aucun PDF, Stripe, interface, modification de PREPROD/PROD ou push n'est ajouté.
