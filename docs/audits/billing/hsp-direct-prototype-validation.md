# Prototype HSP direct charges — validation en cours

Base approuvée : `f3a92678926d976d333a04be68dcbb7b3d307c3a`.
Branche : `feat/billing-hsp-direct-prototype`.
Worktree persistant : `.worktrees/billing-hsp-direct`.

## Sauvegarde incomplète — 7 septembre 2026

Ce commit est une sauvegarde de travail, **pas un lot qualifié pour approbation finale**. Le modèle fiscal reste fictif et non validé pour l’usage réel. Aucun abonnement ou prélèvement périodique n’est ajouté.

Travail présent : deux migrations additives non appliquées à la pile persistante, devis avant engagement, frais HSP atomiques et uniques, fournisseurs figés, branchement direct/destination par tentative, récupération HSP, détection d’anomalies fournisseur, premier relevé administratif, confirmation UI et adaptation PDF. Des cas limites, tests ciblés et parcours intégrés restent à compléter.

## Résultats réellement exécutés sur cette sauvegarde

- `node scripts/billing/hsp-server-test.mjs` : clone PostgreSQL jetable ; 22 assertions, 4 rejets attendus. Objets fournisseur **simulés**, transactions PostgreSQL réelles. Aucune preuve de paiement Stripe réel dans cette suite.
- `node scripts/billing/test-sql-local.mjs --fresh` : reconstruction vierge complète, `complete=true`, 219 assertions SQL et 96 rejets attendus ; régressions réservations/nominations et courses PostgreSQL existantes ; publication documentaire testée avec adaptateur filesystem privé, **pas Supabase Storage réel pour cette version**.
- `node scripts/billing/test-sql-local.mjs` : première exécution clone partielle ; la suite ancienne refuse les capacités déjà activées dans le pilote persistant. Cette hypothèse doit encore être adaptée sans effacer les anciennes fixtures. La suite ciblée HSP utilise un clone de cette même pile et réussit.
- `node --test scripts/billing/stripe-service.test.mjs` : 1 test réussi (fournisseur simulé).
- `node --test scripts/billing/pdf-render.test.mjs scripts/billing/pdf-worker.test.mjs scripts/billing/recovery.test.mjs` : 56 tests réussis avec Chromium local après autorisation système ; le premier démarrage sous sandbox restreint avait échoué. Les PDF à deux fournisseurs doivent encore recevoir des tests et une inspection propres.
- `npm run build` : réussi avant le dernier ajout du composant de relevé administratif ; build final à rejouer. Avertissement habituel sur la taille des chunks.
- `node --check` sur Stripe, PDF et le nouveau lanceur ; `git diff --check` : réussis.

## Sandbox et limites

Un nouveau compte connecté fictif a été réellement créé dans le sandbox : `acct_1UCs8m2NaiSJaBMx`, plateforme `acct_1U3ySLRrKNJAsFE9`. La lecture a confirmé `fees.payer=account`, `losses.payments=stripe`, Dashboard `full`. À cette lecture, paiements et versements non activés ; onboarding en cours côté utilisateur. Aucun compte qualifié antérieur n’a été reconfiguré.

Aucun paiement réel ou test de paiement direct intégré n’a encore été exécuté pour cette version. Les nouvelles migrations n’ont été appliquées qu’aux environnements jetables. Aucun reset, migration distante, changement PREPROD/PROD, fusion ou déploiement. Configurations Stripe et SVG préservés.

Reste notamment à qualifier : concurrence des premières opérations adoptées, réponses perdues, permissions détaillées, calcul du relevé et ventilation des encaissements partiels, reprise après preuve d’application fee retardée, remboursements externes, totalité de l’interface, PDF FR/EN et Storage réel. Le reversement hors Stripe et les remboursements commerciaux restent bloqués/non proposés tant que leurs règles ne sont pas décidées.

## Incident de ressources local

À la demande de l’utilisateur, diagnostic CPU sans arrêt de la base : deux anciennes sessions PostgREST d’encaissement (`10918`, `11783`), actives depuis plus d’une heure, occupaient l’essentiel du CPU. Annulation ciblée puis terminaison de la session restante avec les fonctions PostgreSQL ; aucune suppression de données validées. Après intervention : aucune des deux sessions restante, aucune requête active de plus d’une minute, CPU mesuré à 31,6 % sur quatre secondes. Pas de garantie sur la disponibilité future du Codespace ; validations lourdes désormais séquentielles et sauvegarde distante du travail incomplet.

## Déblocage de l’onboarding — vérification effective

Compte existant uniquement : `acct_1UCs8m2NaiSJaBMx`, type Standard, Dashboard complet, `fees.payer=account`, `losses.payments=stripe`, collecte des exigences par Stripe. GET réel : courriel absent, conditions non acceptées, `requirements.past_due`, paiements/versements désactivés. Champs exigés : `business_profile.support_phone`, `business_profile.url`, `external_account`, `tos_acceptance.date`, `tos_acceptance.ip`. Aucune modification de ces propriétés dans cette intervention.

POST réel `/v1/account_links` avec `type=account_onboarding` accepté sur cet identifiant. Aucun appel de création de compte, aucune acceptation des conditions. Le lien à usage unique n’est ni publié ni stocké dans Git. `account_update` et le lien Dashboard de remédiation ne sont pas utilisés.

Un serveur local séparé (`54333`) et une page HSP de développement (`5174/billing-onboarding.html`) authentifient le login Supabase local et imposent `is_platform_admin()` côté serveur avant de fournir un Account Link. Le navigateur ne choisit ni compte, ni plateforme, ni URLs de retour. Un retour relit les exigences ; une expiration passe par HSP authentifié pour générer un nouveau lien. Les configurations ignorées pointent uniquement le compte fictif existant. Cette page locale requiert Vite, ne constitue pas un déploiement.

Tests exécutés : `node --test scripts/billing/onboarding.test.mjs` (2 tests réussis, fournisseur simulé : administrateur autorisé, non-administrateur refusé avant appel Stripe, responsabilités incompatibles refusées) ; POST anonyme local refusé ; navigateur réel connecté comme administrateur HSP fictif, GET des exigences Stripe puis POST Account Link et redirection effective. Première tentative navigateur échouée car l’outil désactivait la sécurité web et omettait Origin ; vérification réussie avec les protections navigateur activées. Aucun affaiblissement du contrôle d’origine serveur.

Écran Stripe réellement observé : « Get started with Stripe », compte de test, demande d’adresse courriel, possibilité affichée de réutiliser le courriel d’un utilisateur Stripe existant. Aucun `/no_access/`. Test arrêté avant saisie de courriel, création/authentification d’identité Stripe, ou acceptation. Le propriétaire doit continuer personnellement avec un courriel contrôlé et effectuer la vérification/connexion demandée par Stripe. Le lien est attaché au compte existant, pas un nouvel appel de création Connect. L’activation finale reste à constater par lecture serveur après ce parcours.

Références : [Stripe — onboarding hébergé](https://docs.stripe.com/connect/hosted-onboarding), [onboarding des comptes Standard](https://docs.stripe.com/connect/standard-accounts). Captures locales ignorées : `.tmp/hsp-direct/onboarding-hsp.png`, `.tmp/hsp-direct/onboarding-stripe.png`. Aucun secret publié ; aucun paiement ni migration dans ce lot.

## Reprise intégrée après onboarding — 7 septembre 2026

État réellement relu : `charges_enabled=true`, capacité `card_payments=active`, `transfers=active`, courriel présent. Les versements restent désactivés avec une exigence de vérification d’identité (`proof_of_liveness`). Aucune identité, acceptation ou responsabilité modifiée par HSP. Les essais ci-dessous sont des paiements de sandbox, sans argent réel ; ils ne qualifient pas les versements bancaires.

### Préparation effectivement appliquée

`node scripts/billing/hsp-prepare-local.mjs` : identité Docker Unix et projet `hsp-vet-local` vérifiés, utilisateurs exclusivement `@example.test`, marqueurs fictifs présents, socle documentaire 1C présent. Sauvegarde locale ignorée créée avant application des seules migrations `20260907000100` et `20260907000200`. Empreintes des tables historiques métier et des comptes, frais, paiements et documents financiers inchangées. Aucun reset.

`node scripts/billing/hsp-fixture-local.mjs` : nouvelle association fictive uniquement ; rattachement au compte sandbox existant, sans création ni reconfiguration Connect. Les clones de test utilisent désormais des UUID et un fichier de résultats séparés des fixtures persistantes.

Les seuls anciens processus locaux paiement, documents et listener ont été remplacés par cette version. Base et interfaces existantes conservées. Listener plateforme **et Connect**, comparaison effective de son secret de signature : `WEBHOOK_SECRET_MATCH_CONFIRMED`. Les valeurs restent dans les configurations locales ignorées.

### Parcours principal réellement exécuté

Compte `34a3095d-c747-420b-8fc7-decd650089b7`, `DEMO-ACC-000001` : sept ventes structurées fictives (classes, juges, deux chevaux/blocs, stalle simulée, casquette), plus l’unique frais HSP. Devis préparés puis commandes confirmées via RPC autorisées : 498,75 CAD. Aucun raccordement métier réel.

- Navigateur réel, Payment Element dans le compte connecté : paiement de 200 CAD, puis vérification serveur. Un encaissement et un reçu ; compte ouvert.
- Ajout de 10 CAD HT fictifs depuis l’interface secrétaire, avec confirmation du devis : total 509,25 CAD ; toujours un seul frais HSP.
- Second paiement réel **Stripe sandbox** de 309,25 CAD via Payment Element. Crédit brut cumulé au participant : 509,25 CAD.
- Lecture réelle des deux PaymentIntents, charges, application fee et transactions de solde dans leur compte connecté : application fee de 5,25 CAD sur le premier, zéro sur le second. Frais Stripe observés sur le solde de l’association : 7,70 CAD et 11,74 CAD dans ce sandbox ; ces observations ne constituent pas une tarification commerciale validée.
- Interface secrétaire : attestation accordée. Interface Mes comptes : récapitulatif confirmé, finalisation autonome réussie. Compte fermé, solde zéro, deux encaissements, deux reçus, **une seule facture `DEMO-INV-000001`**.
- Worker réel, téléversement réel dans le bucket Supabase Storage privé : deux relevés (dont le récapitulatif), deux reçus et une facture, chacun FR/EN. Dix téléchargements HTTP PDF réussis. Dix refus de téléchargement par d’autres identités/périmètres et dix refus d’accès direct au bucket.

Commandes (variables chargées depuis le fichier local ignoré existant, jamais publié) : `hsp-integrated.mjs charges`, `hsp-browser.mjs pay 200`, `hsp-browser.mjs admin-extra`, `hsp-browser.mjs pay 309.25`, `hsp-provider-check.mjs`, `hsp-browser.mjs admin-ready`, `hsp-browser.mjs finalize`, `hsp-integrated.mjs check`, `hsp-documents-local.mjs`, dans `scripts/billing/`, avec Node. Captures et PDF dans `.tmp/hsp-direct/`, exclus de Git et de Vite.

### Contrôles ciblés réellement exécutés

- `node scripts/billing/hsp-server-test.mjs` : **31 assertions, 5 rejets attendus**, clone local jetable supprimé ; objets fournisseur simulés. Inclut deux sessions PostgreSQL concurrentes sur deux premiers devis : une vente accepte, l’autre exige un devis actualisé sans nouveau frais HSP ; poursuite réussie. Inclut devis abandonné sans compte, réservation seule payée comptant, réponse rejouée sans doublon, fermeture à zéro et somme HSP encaissée restant à reverser de 5,25 CAD.
- `node scripts/billing/hsp-pdf-test.mjs` : six PDF synthétiques FR/EN à deux fournisseurs, **84 assertions**, Chromium réel ; relevés/reçus sur deux pages, factures longues sur quatre pages. Aucun transport Storage dans ce test distinct.
- `node --test scripts/billing/stripe-service.test.mjs` : fichier de tests réussi, fournisseur simulé, deux scénarios supplémentaires direct charges. Le runner rapporte un fichier de test, pas un nouveau décompte d’assertions SQL. Une suspension des nouveaux paiements ne bloque plus la lecture d’un PaymentIntent déjà associé et l’enregistrement de sa preuve de confirmation ; création nouvelle toujours refusée si paiements suspendus.
- `npm run build` : réussi, avertissement de taille de chunks ; `node --check` et `git diff --check` réussis.

**Qualification encore partielle.** Le parcours nominal prouve désormais Stripe test et Storage réels pour cette version. Les cas intégrés directs de refus/3DS/annulation/reprises, l’inspection visuelle finale, les règles de répartition des très petits encaissements et la revalidation complète des régressions restent à compléter. Aucun résultat ancien destination charges n’est compté comme preuve d’un nouveau scénario direct. Aucun reversement hors Stripe automatisé, remboursement commercial, abonnement, migration distante ou déploiement.

## Lot de qualification pour revue — résultats finaux de cette reprise

Les résultats de cette section remplacent les limites techniques levées dans les sections de sauvegarde ci-dessus. Le prototype reste exclusivement fictif et ne constitue pas une validation fiscale ou une autorisation d’usage réel.

### Suites finales

| Commande exécutée | Résultat réellement obtenu | Nature |
| --- | --- | --- |
| `node scripts/billing/test-sql-local.mjs` | `complete=true`, 219 assertions SQL, 96 rejets attendus | Clone PostgreSQL local jetable ; suites 1A/1A.6/Stripe/PDF, sessions concurrentes et régressions réservations/nominations ; adaptateur filesystem privé pour la sous-suite PDF |
| `node scripts/billing/test-sql-local.mjs --fresh` | `complete=true`, 219 assertions SQL, 96 rejets attendus | Reconstruction vierge de toutes les migrations, dont `20260907000300`, seed et mêmes suites ; pile jetable supprimée |
| `node scripts/billing/hsp-server-test.mjs` | 35 assertions, 5 rejets attendus, `complete=true` | Clone réel, deux sessions concurrentes ; objets Stripe simulés ; devis abandonné, réponse perdue/rejeu, réservation seule/manuelle, réservations HSP et absence de prorata fiscal inventé |
| `node scripts/billing/stripe-service.test.mjs` | 23 tests réussis | Transport Stripe simulé ; direct/destination, clés stables, refus live, confirmation malgré suspension des nouvelles charges, événements plateforme, restitution d’application fee signalée |
| `node scripts/billing/hsp-pdf-test.mjs` | 84 assertions, six PDF FR/EN | Chromium réel, entrées synthétiques, facture longue quatre pages |
| `node scripts/billing/hsp-inspect-pdfs.mjs` | 106 contrôles sur dix PDF téléchargés | PDF réellement publiés dans Storage ; extraction, rendu en images, identités/numéros, montants et groupes vérifiés |
| `node scripts/billing/hsp-results-local.mjs` | 30 assertions, `complete=true` | Lecture finale des comptes réellement utilisés sur la pile persistante |
| `npm run build` | Réussi | Avertissement de taille des chunks ; aucun échec de compilation |
| `node --check` sur scripts modifiés et `git diff --check` | Réussis | Syntaxe/whitespace |

Le lanceur compare désormais les capacités avant/après migration à un état témoin du clone. Sur reconstruction vierge, cet état témoin reste vide : une activation introduite par une migration échouerait toujours. Deux assertions 1A ciblent désormais leur association de fixture plutôt que tous les comptes réels du clone. Les premières exécutions avaient échoué sur ces hypothèses de base vide ; aucune donnée persistante n’a été effacée pour les faire passer. Aucune migration 1A/1A.6/1A.7/1C antérieure modifiée.

### Cas intégrés supplémentaires

| Cas | Résultat et portée de la preuve |
| --- | --- |
| Annulation puis même montant | Première tentative Stripe réellement annulée, seconde tentative 131,25 CAD payée ; un paiement et un reçu. Réservation simulée seule + HSP finalisée ensuite à zéro ; rejeu de la fermeture, une facture |
| Authentification supplémentaire | Carte 3DS de test réellement utilisée. Premier retour navigateur expiré ; même tentative reprise après rechargement, défi terminé, confirmation serveur : un paiement et un reçu. Le timeout initial n’est pas masqué |
| Carte refusée | Refus Stripe réel, zéro paiement/reçu ; annulation serveur confirmée et réservation libérée |
| Webhook retardé / retour omis | Listener local volontairement suspendu ; véritable paiement Stripe test confirmé par API. HSP reste incertain et refuse la fermeture. Reprise serveur puis livraison injectée deux fois du véritable événement : un encaissement et reçu. Listener réactivé dans `finally` |
| Réponse manuelle perdue | Encaissement local fictif réellement validé, réponse HTTP volontairement abandonnée ; ajout d’un frais/version nouvelle, rechargement et reprise du contenu original ; aucune duplication puis paiement suivant accepté |
| Secrétaire avant participant | Fermeture secrétaire réelle puis refus `BILLING_NOT_ADMISSIBLE` du participant ; commande définitivement refusée libérée, autre compte utilisable |
| Interac + Stripe | 100 CAD Interac **simulés**, puis 31,25 CAD réellement traités dans Stripe test : compte crédité 131,25 CAD ; HSP récupéré une seule fois à hauteur de 5,25 CAD |
| Panne documentaire | Rendu anglais volontairement en erreur après téléversement FR réel. Deux workers concurrents pour la reprise : un seul termine, l’autre ne prend pas le bail. Même pièce/numéro, deux artefacts publiés FR/EN ; modification ultérieure du contact fictif sans modification du snapshot ni des octets téléchargés |
| Accès PDF | Dix téléchargements depuis le navigateur Mes comptes, rechargement et captures mobile. Dix téléchargements HTTP refusés aux autres identités/périmètres ; dix lectures directes du bucket refusées |
| Application fee plateforme | Véritable événement `application_fee.created` récupéré dans Stripe puis livraison locale **injectée deux fois** ; traitement réussi, documents inchangés. Le test a d’abord tenté une lecture directe interdite des documents ; il utilise désormais la projection du payeur autorisé |

Commandes supplémentaires exécutées, sous Node avec les variables du fichier local ignoré existant : `hsp-cases-local.mjs cancel`, `prepare authentication`, `prepare decline`, `cancel-declined`, `delayed`, `prepare manual-lost`, `staff-prepare`, `prepare documents`, `mixed-prepare`, `finalize cancel` ; `hsp-browser.mjs pay 131.25 cancel`, `authenticate 131.25 authentication`, `resume-auth 131.25 authentication`, `decline 131.25 decline`, `manual-lost 5 manual-lost`, `staff-race 0 staff-first`, `pay 31.25 mixed`, `documents` ; `hsp-document-retry-local.mjs` et `hsp-fee-replay-local.mjs`.

La migration additive `20260907000300_billing_hsp_reporting.sql` a été appliquée uniquement à la pile locale identifiée après test sur clone. Elle vérifie la validité des règles fiscales des produits annoncés, y compris HSP, et distingue les réservations fournisseur des reversements confirmés. Les totaux du relevé pour les fixtures de cette reprise sont : **31,50 CAD HSP encaissés, 26,25 CAD récupérés, 5,25 CAD encore à reverser** après paiement manuel fictif. Aucun prélèvement ni règlement n’a été déclenché.

Une affectation partielle HSP conserve le montant TTC effectivement enregistré ; ses composantes HT/taxes sont `null` et explicitement non qualifiées, jamais assimilées à zéro ou calculées selon un prorata arbitraire. Une affectation complète expose les montants HT et taxes figés. Les réservations et preuves d’application fee empêchent la double récupération.

Le service reçoit désormais aussi les événements plateforme `application_fee.created` et `application_fee.refunded`, relit la charge dans le compte connecté et signale une application fee restituée comme anomalie. La facture et le paiement initial restent conservés. Référence vérifiée : [Stripe — types d’événements, API 2024-06-20](https://docs.stripe.com/api/events/types?api-version=2024-06-20). La détection de remboursement/restitution a été testée avec objets simulés ; **aucun remboursement externe réel dans Stripe sandbox n’a été exécuté** dans cette reprise.

### Réouvrir la démonstration

Les services sont laissés actifs sur la pile locale persistante : Supabase `54321`, paiement `54331`, documents/worker `54332`, listener plateforme et Connect. Dernière vérification : secret du listener actif identique au secret serveur, aucune requête PostgreSQL active depuis plus d’une minute. Cela ne garantit pas la disponibilité future du Codespace.

- Interface de ce worktree : `https://sturdy-sniffle-69vvp94vqvvx34jw6-5174.app.github.dev`.
- Payeur : `/me/accounts/34a3095d-c747-420b-8fc7-decd650089b7`.
- Secrétaire : `/associations/fb300000-0000-0000-0000-000000000001/finance/accounts/34a3095d-c747-420b-8fc7-decd650089b7`.
- Logins fictifs : `phase1.org-a-owner@example.test` et `phase1.org-a-secretary@example.test`. Le mot de passe reste uniquement dans `.tmp/hsp-direct/access.local.json`, ignoré et non servi par Vite ; ne pas le publier.

Si un service est arrêté, depuis ce worktree, après vérification que son port est libre :

```sh
node --env-file=../billing-pilot/.env.billing.local server/billing/local-server.mjs
node --env-file=../billing-pilot/.env.billing-pdf.local server/billing/document-server.mjs
node --env-file=../billing-pilot/.env.billing.local scripts/billing/hsp-listener-local.mjs
node scripts/billing/onboarding-preview-local.mjs
```

Ce sont des processus de premier plan à ouvrir dans des terminaux séparés. Ne pas lancer de doublons ni arrêter la base. Les processus déjà détachés sont référencés dans `.tmp/hsp-direct/runtime-processes.json` et `onboarding-processes.json`. Les configurations existantes sont réutilisées sans publication de secrets.

PDF pour revue : `.tmp/hsp-direct/review/hsp-direct-pdf-fr-en.zip` (dix PDF : relevés, deux reçus, facture FR/EN). Captures : `.tmp/hsp-direct/review/hsp-direct-captures.zip`. Diff complet depuis la proposition approuvée : `.tmp/hsp-direct/review/review.patch`. Ces fichiers sont hors Git et refusés par Vite ; les PDF restent également accessibles par les boutons de téléchargement authentifiés de Mes comptes.

### Limites restantes avant toute extension du prototype

- Versements Stripe suspendus pour l’exigence d’identité du compte connecté ; aucun versement bancaire qualifié.
- Validation fiscale réelle, mandat définitif, annulations/remboursements, politique de ventilation des petits encaissements et reversement hors Stripe restent des décisions ouvertes. Aucun abonnement, calendrier de collecte ou prorata fiscal automatique ajouté.
- Remboursements/restitutions externes et anomalies couverts par tests simulés ; qualification Stripe réelle de ces événements reste à faire sur de nouvelles fixtures. La réception réelle d’un événement d’application fee créé a été vérifiée avec rejeu de transport injecté, pas avec un remboursement.
- Les seuils et comportements de très petits paiements fournisseur ne sont pas qualifiés intégralement ; aucune nouvelle règle commerciale de minimum n’est approuvée par ces résultats.
- La revue visuelle finale des PDF par l’utilisateur reste nécessaire. Les exemples et captures sont fournis ; les vérifications de texte/montants ne remplacent pas son approbation graphique.
- Réservations et inscriptions demeurent des ventes structurées fictives ; aucun raccordement aux sources opérationnelles réelles, historique ou taux fiscaux réels.

Aucune fusion, aucun déploiement, aucune migration distante, aucune modification PREPROD/PROD et aucun paiement réel. Les trois SVG locaux ont leurs empreintes initiales inchangées ; configurations et artefacts exclus des commits.
