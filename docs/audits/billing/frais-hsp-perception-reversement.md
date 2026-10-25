# Frais de service HSP — annonce, perception et reversement

7 septembre 2026. Complément documentaire au contrat approuvé, avant implémentation.
Branche : `feat/billing-pilot-integrated`. Base de lecture de cette révision : `49d8a33450af5142f38126d22fbaccf4536283a0`.

**Décision produit acquise : 5,00 CAD avant taxes par Compte du concours payeur, dès la première opération facturable confirmée, y compris une stalle.** Ce document précise cette décision et distingue les recommandations de perception, les choix fiscaux et les annulations qui restent à approuver. Aucun code, migration, paiement, fixture ou document financier n’est modifié par ce lot.

Les contrats [D1–D5](plan-et-scenarios.md), [première tranche](premiere-tranche.md), [tests](tests-acceptation.md) et [navigation](tranche-1a5-navigation-ux.md) restent les références générales. Ce complément rassemble la proposition sans réécrire les contrats ni le [rapport du pilote déjà exécuté](pilote-integre-validation.md).

**Orientation du prototype : HSP fournisseur du participant, association mandataire de facturation et d’encaissement de la part HSP. Hypothèse fiscale à valider avec le comptable, non juridiquement approuvée.** Aucun abonnement, prélèvement mensuel ou calendrier de règlement n’est approuvé.

**Révision direct charges — proposition technique à approuver.** HSP est exploité par une seule personne : aucune récupération ou refacturation séparée des frais de traitement des participants auprès des associations ne doit être nécessaire. La recommandation destination charges du complément précédent est remplacée par celle du §6. Les opérations déjà qualifiées restent inchangées.

## 1. Invariants validés

- Une seule ligne **Frais de service HSP** / **HSP service fee**, quantité 1, prix serveur 5,00 CAD HT, par compte payeur du concours. Ni le cheval, ni la réservation, ni l’auteur, ni le paiement n’entrent dans sa clé d’unicité.
- Même règle pour le participant, une secrétaire autorisée, un agent autorisé pour l’opération métier concernée, Stripe, comptant et Interac. L’ajout automatique ne donne aucun droit financier général supplémentaire à l’agent.
- Une personne qui réserve uniquement une stalle voit et règle ces frais dès le premier paiement exigé pour cette réservation. Aucun rattrapage à la fermeture.
- Consultation, devis/récapitulatif préparatoire et brouillon abandonné ne créent aucun frais. Le déclencheur est la confirmation serveur de la première opération facturable, pas l’ouverture d’un écran ni la création d’un PaymentIntent.
- Première opération et frais HSP : transaction unique ; tout réussit ou tout est annulé. Un défaut de configuration fiscale empêche l’engagement complet.
- Le paiement crédite **intégralement** le compte du participant. La part reversée à HSP et les frais Stripe ne diminuent jamais cet encaissement ni ses affectations.
- Aucun frais pour les reçus, relevés, PDF, paiements supplémentaires, attestations ou finalisations. Une facture finale unique, immuable.
- Aucun ajout rétroactif aux comptes existants du pilote, ouverts ou fermés, même lors d’un prochain achat. Aucun recalcul des anciens PDF.
- Hors concours, USD et conversion de devise : non adoptés par cette décision. Le moteur existant de ces contextes reste inchangé ; il ne doit pas convertir 5 CAD ni appliquer arbitrairement 5 USD.

L’ancien contrat autorise éventuellement la création d’un compte par une opération gratuite. Cette possibilité n’autorise pas à facturer 5 CAD à la simple création du compte. Le traitement exact d’une opération confirmée à 0,00 reste une décision ouverte : recommandation, attendre la première ligne métier de montant positif, sans frais sur un devis gratuit.

## 2. Récapitulatif avant engagement

Exemple **entièrement fictif** : deux profils explicitement taxés à 5 % DEMO, sans prétention de taux fiscal réel.

| Désignation | Avant taxes | Taxe fictive 5 % | Total |
| --- | ---: | ---: | ---: |
| Stalle simulée | 150,00 | 7,50 | 157,50 |
| Frais de service HSP — une fois pour ce Compte du concours | 5,00 | 0,25 | 5,25 |
| Total à confirmer et à payer | **155,00** | **7,75** | **162,75 CAD** |

Le récapitulatif identifie l’association, le concours, le contact payeur et son entreprise éventuelle, les deux fournisseurs et le rôle mandataire, leurs numéros applicables, les lignes et chaque taxe/exemption rattachées à leur fournisseur, le montant exigé pour confirmer le service, les paiements déjà reçus et le solde. Le bouton indique l’engagement exact : « Confirmer — 162,75 CAD », puis paiement du montant présenté. Aucun prix de frais HSP ne vient du navigateur.

Pour un compte qui possède déjà cette ligne : montrer « Frais de service HSP déjà portés à ce compte ». S’ils sont encore impayés, montrer leur solde existant dans le montant à régler ; ne pas les présenter comme gratuits ou comme une nouvelle ligne. S’ils sont payés, aucun nouvel ajout de 5 CAD.

Proposition de commande préparatoire : `prepare_billing_operation_quote` (nom à confirmer), sans création de compte, frais, numéro financier ni dette HSP. Un enregistrement de devis technique expirable est permis ; il ne constitue ni relevé émis ni facture. Le serveur fige les identités, produits, quantités, profils fiscaux, politique de frais, existence/version du compte et état de la ligne HSP. Un compte inexistant est identifié par sa clé naturelle association + contexte + compte client payeur, pas par un UUID inventé côté navigateur.

La confirmation conserve l’identifiant/empreinte du devis, sa version, son auteur et la preuve de présentation/acceptation. Pour une saisie secrétaire, le personnel doit pouvoir consulter et communiquer le même récapitulatif avant confirmation ; le système ne doit pas fabriquer un consentement du client à partir du seul rôle secrétaire. Le canal et la preuve de cette communication restent à définir avec le parcours métier.

Le devis d’une opération est distinct du récapitulatif de fermeture déjà présent en 1A.6 : confirmer l’un n’autorise pas l’autre.

## 3. Transaction serveur proposée

1. Authentifier, résoudre le véritable payeur et vérifier l’autorisation métier actuelle, l’association, le concours, la devise CAD et l’adoption explicite de la nouvelle politique.
2. Résoudre d’abord une éventuelle commande déjà exécutée avec la même clé et le même contenu : retourner son résultat durable à l’appelant toujours autorisé, même si le devis a expiré ou le compte a changé depuis. Même clé avec contenu différent : refus. Résultat ambigu : conserver la commande originale, jamais créer une nouvelle clé par simple timeout.
3. Pour une nouvelle exécution, prendre les verrous communs existants de portée/contrôle d’association et de compte dans leur ordre actuel. Pour un compte inexistant, sérialiser sa clé naturelle et conserver la contrainte unique en base. Relire la politique et les données de devis sous ces verrous ; verrouiller les lignes d’identité selon l’ordre déterministe existant. Aucun appel Stripe sous verrou SQL.
4. Comparer le devis à l’état courant. Prix, taxes, payeur, politique ou montant effectivement engagé différents : refus explicite `BILLING_STALE_QUOTE` proposé, nouveau récapitulatif à confirmer. Ne pas appliquer silencieusement un montant différent.
5. Créer ou retrouver le compte, puis insérer l’opération métier et, si nécessaire, l’unique ligne système HSP avec ses taxes. Inscrire sa provenance système, le payeur, l’auteur de l’engagement, la politique figée et l’autorisation utilisée. La ligne HSP n’appartient pas à un cheval particulier ; le bénéficiaire public est le payeur du compte.
6. Créer le suivi unique de la part HSP facturée au participant, avec principal et taxes figés. Le montant facturé non encaissé ne constitue pas une somme déjà détenue par le mandataire à reverser ; ce suivi commence avec zéro encaissé et zéro reversé. Mettre à jour versions, audit et résultat idempotent atomiquement. Toute nouvelle vente invalide l’attestation des frais complets et les récapitulatifs antérieurs selon 1A.6.
7. Seulement après commit, préparer le paiement du montant annoncé par les contrats Stripe existants. Refus de carte ou fermeture de fenêtre n’effacent pas un engagement confirmé. La réservation reste non confirmée tant que son exigence réellement encaissée n’est pas satisfaite.

**Deux premières opérations simultanées** : une seule ligne HSP et un seul compte, grâce au verrou et à l’unicité SQL. Si deux devis contenaient chacun les 5 CAD, le second doit être recalculé et reconfirmé après la première transaction ; les deux ne peuvent pas réclamer indépendamment le même frais. En cas de réponse perdue de la première transaction, sa reprise retourne les mêmes UUID, lignes et montants.

Recommandation d’affectation pour les nouveaux contextes adoptés : régler prioritairement la ligne HSP TTC une seule fois, puis les frais du service visé, avec un plan d’affectation serveur figé par tentative. La condition d’activation d’une première réservation inclut son montant obligatoire et le solde de la ligne HSP TTC. Un paiement inférieur peut être enregistré comme partiel si le contexte l’autorise, mais ne confirme pas la réservation. Cette priorité doit aussi être respectée par l’encaissement manuel. Aucun ancien plan d’affectation n’est réécrit.

## 4. Compatibilité avec le code observé

| Existant réel | Conséquence du complément |
| --- | --- |
| `billing_folios`, unicité association/contexte/payeur | À conserver, y compris après fermeture ; aucun nouveau compte pour contourner le frais ou un compte fermé |
| `billing_charges`, profils produits et `billing_charge_taxes` | Réutiliser les montants et taxes figés ; introduire une nature système structurée HSP, sans recherche sur le libellé |
| `add_billing_sale` et `add_documented_billing_sale` | Le second appelle le premier ; intégrer le déclenchement dans le chemin commun autorisé, pas dans le seul wrapper documentaire ni par deux appels client successifs |
| Présentation PDF `section: other` | Peut porter la ligne HSP, mais ne suffit pas à distinguer deux fournisseurs : ajouter des identités fournisseur structurées et figées, leurs numéros et taxes, puis adapter le rendu sans recalcul fiscal |
| `billing7_lock` et verrous 1A.6 | Étendre leur discipline commune aux dettes/réservations de règlement ; ne pas introduire un chemin de verrouillage inversé pour les encaissements manuels |
| `begin_billing_stripe_attempt`, une tentative non résolue par compte | Réutiliser le registre et la clé fournisseur ; figer la part HSP à recouvrer dans cette tentative |
| `server/billing/stripe.mjs` | Crée actuellement un PaymentIntent avec `transfer_data[destination]`, sans `application_fee_amount` ; aucun prélèvement HSP actuel |
| `billing_stripe_observe` | Crédite déjà tout `a.amount` ; préserver ce comportement. L’affectation actuelle trie par `created_at,id` : elle ne garantit pas la priorité HSP proposée |
| Documents, reçu unique par paiement, facture unique par compte | Aucun nouveau document/numéro lors du recouvrement HSP, d’un webhook ou d’un rendu PDF |
| Activation 1A.6 | Ajouter une adoption distincte et versionnée, désactivée par défaut ; pas de réutilisation implicite de « moteur activé » pour tarifer les comptes existants |

La qualification du commit `ae96a7d` ne prouve **pas** le fonctionnement de ce nouveau tarif, des application fees ou des règlements association → HSP. Ces scénarios restent à implémenter et à exécuter sur de nouvelles fixtures.

## 5. Tables et contraintes envisagées — non exécutables dans ce lot

Noms proposés, à ajuster aux conventions lors de l’implémentation autorisée :

| Élément | Contenu / contrainte |
| --- | --- |
| Politique `billing_hsp_fee_policies` et adoption de contexte | Version, 500 cents CAD HT, libellés FR/EN, profils fiscaux explicites, début d’adoption, règle de déclenchement et autorité ; immuable une fois utilisée |
| Lien `billing_hsp_fee_assessments` | `folio_id UNIQUE` et `charge_id UNIQUE`, organisation/contexte/payeur concordants ; référence politique et première opération. L’unicité ne dépend ni de l’état, ni de la version de politique, ni du cheval |
| Nature système de charge | Index unique partiel sur `folio_id` pour la nature HSP, ou mécanisme équivalent imposé dans tous les writers ; aucune saisie, suppression ou modification directe de cette nature par le navigateur |
| Devis préparatoire | Identifiant opaque, acteur, payeur, empreinte des lignes/politique, versions, expiration et confirmation ; pas de numéro de compte créé pour un devis abandonné |
| `billing_hsp_collections` (remplace la proposition `billing_hsp_receivables`) | Un suivi par assessment : part HSP facturée au participant, HT et taxes par composante ; affectations des encaissements réels, part récupérée par application fee, reversements confirmés, réservations et anomalies. Aucun compte de vente HSP → association |
| Fournisseurs et mandat figés | Identité publique, coordonnées et numéros fiscaux fictifs par fournisseur ; identifiant fournisseur sur chaque frais/taxe ; rôle mandataire de l’association, référence/version de l’entente de prototype. Instantanés documentaires autonomes, sans lecture ultérieure des fiches |
| Réservations de recouvrement | Part HSP + tentative Stripe ou opération de reversement explicitement autorisée, montant, état ; au plus une réservation non résolue pour cette part HSP, aucun dépassement du reste à percevoir |
| Événements de règlement | Journal append-only : réservation, confirmation, annulation sûre, paiement direct reçu, correction/restitution autorisée. Unicité environnement + plateforme + compte propriétaire de l’objet + référence fournisseur ; allocation aux parts HSP unique par règlement |
| Preuves fournisseur des direct charges | Mode de charge, environnement, plateforme et compte connecté figés ; références PaymentIntent/charge/application fee/balance transaction ; coûts réellement débités par Stripe au compte connecté, sans créance de refacturation HSP pour ces coûts |

Toutes les relations sont contrôlées par des clés étrangères et contrôles de portée, pas par l’UUID fourni seul. RLS, privilèges explicites, `search_path` fixé, écritures directes révoquées. Le personnel de l’association consulte ses seuls relevés de règlement ; le payeur ne reçoit ni ces écritures internes ni les coûts/provider metadata. Conserver seulement la ligne HSP publique et sa fiscalité dans ses instantanés.

Cette sous-comptabilité de règlements explique les sommes dues et leurs preuves ; HSP ne devient pas un grand livre général et ne remplace pas Xero, QuickBooks ou Sage.

## 6. Perception auprès du participant et recouvrement auprès de l’association

Trois montants distincts :

- **Prix client** : 5,00 CAD HT + taxes du profil de la ligne client ; intégré au compte dès l’engagement.
- **Sommes HSP encaissées à reverser** : part du service HSP et de ses taxes réellement encaissée pour son compte, moins les récupérations et reversements confirmés. Ce reversement n’est pas une nouvelle vente HSP à l’association et ne crée pas une seconde taxation du service.
- **Frais Stripe** : coût du traitement assumé économiquement par l’association, jamais un nouveau frais au participant et jamais retranché de son paiement crédité.

### Choix recommandé : direct charges, Stripe prélève les frais à l’association

**Proposition pour approbation : nouveau compte connecté avec Dashboard complet, collecte des frais et responsabilité des soldes négatifs du compte connecté confiées à Stripe.** L’association dispose ainsi de ses paiements et des outils Stripe de gestion des litiges ; HSP conserve la gestion opérationnelle du concours. Cette préférence réduit la charge de soutien d’un exploitant seul ; elle n’est pas une obligation de conserver le type Express du pilote.

| Configuration à distinguer | Conclusion pour HSP |
| --- | --- |
| Destination charge actuelle, même avec `fees.payer=account` | Frais de cette charge prélevés sur la plateforme ; ne satisfait pas la contrainte. À préserver uniquement pour les opérations déjà qualifiées |
| Direct charge + v1 `controller.fees.payer=account` | Stripe prélève ses frais au compte connecté ; application fee HSP séparée ; modèle proposé |
| Direct charge + `fees.payer=application` | Plateforme facturée ; ne pas adopter pour ce besoin |
| Ancien `type=express`, donc `application_express` | Traitement standard débité au compte connecté, mais autres services et tarification IC+ peuvent être facturés à HSP ; Stripe déconseille les direct charges avec ce réglage legacy. Ce n’est pas l’équivalent de `account` |

Le payeur des frais ne se modifie pas après création. La configuration `account` n’entraîne pas de frais Connect pour ces comptes selon la documentation, mais n’exonère pas les activités propres de la plateforme. [Stripe — responsabilité des frais](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior).

Configuration v1 recommandée à la **création d’un nouveau compte fictif** : `controller.fees.payer=account`, `controller.losses.payments=stripe`, `controller.requirement_collection=stripe`, `controller.stripe_dashboard.type=full`. Elle correspond au comportement Standard ; contrôler les propriétés retournées plutôt que le seul champ `type`. Ne pas envoyer `type=express` en espérant obtenir ces valeurs. [Stripe — propriétés controller et configurations compatibles](https://docs.stripe.com/connect/migrate-to-controller-properties).

Équivalent Accounts v2 : configuration Merchant, `defaults.responsibilities.fees_collector=stripe`, `losses_collector=stripe`, `dashboard=full`, capacité de paiement carte demandée puis active. Ces responsabilités sont fixées avec Merchant et non modifiables ensuite. v2 interdit notamment `losses_collector=application` avec `fees_collector=stripe`. Ce modèle de compte n’impose pas de remplacer l’API PaymentIntents v1. [Stripe — configuration Accounts v2](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration).

Le dépôt utilise Accounts v1 ; proposer d’abord les propriétés explicites v1 pour limiter le changement, sous réserve de leur disponibilité dans ce sandbox. Si son onboarding exige v2, adapter uniquement la création/lecture de configuration, sans mélanger les paramètres des deux API. **Aucun nouveau compte n’est créé dans ce lot.** À la qualification : vérifier rattachement réel à la plateforme test, pays Canada et devise CAD retenus, propriétés, capacités, `charges_enabled` et exigences de versement ; pas seulement le nom public du compte.

Un **nouveau** compte à Dashboard Express demeure une alternative à examiner, avec ses responsabilités explicitement choisies et validées dans l’API retenue ; ne pas déclarer cette combinaison universellement interdite, ni la supposer acceptée dans ce sandbox. Le Dashboard complet est préféré pour laisser l’association gérer davantage ses opérations. Stripe recommande de confier à Stripe la responsabilité des pertes des comptes utilisant direct charges ; ses recommandations distinguent aussi les outils Radar disponibles selon le Dashboard. [Stripe — configurations recommandées](https://docs.stripe.com/connect/integration-recommendations).

Le compte Express fictif actuel demeure un témoin du parcours destination charges. Ses propriétés controller n’ont pas été relues auprès de l’API dans ce lot documentaire : aucune reconfiguration possible n’est affirmée. L’ancien `type=express` observé dans le code ne constitue pas une vérification actuelle de ses responsabilités. Créer ultérieurement une nouvelle association/contextes fictifs et un nouveau compte connecté compatible ; ne déplacer ni PaymentIntents, reçus, fonds, secrets, documents ou tentatives existants.

### Récupération des 5 CAD : intégrale une seule fois

Sous réserve du modèle fiscal validé, figer `application_fee_amount` au montant de la part HSP TTC restant à récupérer, sur la première tentative Stripe du même compte dont le montant suffit. Les paiements suivants ont une part HSP de zéro (paramètre absent si nécessaire dans l’API). Une règle automatique Dashboard par transaction ne doit pas ajouter une deuxième commission. La limite fournisseur de l’application fee est le montant du paiement ; montant et devise restent déterminés par le serveur. [Stripe — contrat PaymentIntent](https://docs.stripe.com/api/payment_intents/create).

Algorithme proposé :

1. Verrouiller compte, tentative et suivi de la part HSP dans l’ordre commun ; vérifier que la part visée n’est ni reversée ni réservée par un autre règlement.
2. Réserver la récupération intégrale dans la tentative **avant** l’appel externe ; figer le montant de l’application fee dans la commande originale et la clé fournisseur. Une incertitude conserve cette réservation.
3. À confirmation serveur, créditer au participant la totalité du paiement et produire son reçu une seule fois. Vérifier le montant d’application fee attendu et les références Stripe de la perception ; confirmer séparément le règlement HSP avec sa preuve fournisseur. Si cette preuve manque, conserver l’état à rapprocher et empêcher une deuxième récupération, sans effacer un paiement client réellement reçu.
4. Un webhook répété ou désordonné relit l’état fournisseur ; il ne crée ni nouveau frais, ni second suivi de part HSP, ni second règlement HSP. La reprise d’une ancienne tentative utilise ses montants figés, pas le reste recalculé du jour.
5. Une annulation fournisseur certaine sans perception libère la réservation ; une nouvelle tentative peut ensuite réserver cette **même** part HSP. Un timeout ne la libère pas.

Pour une réservation payée intégralement à 162,75 CAD, le frais client est payé dès le premier encaissement. Avec un profil HSP → participant fictif à 5 %, la part HSP est 5,25 CAD (5,00 + 0,25). Un deuxième paiement porte 0,00 de part HSP. Il n’existe aucune taxe HSP → association supplémentaire sur le reversement.

**Très petits paiements** : conserver les paiements partiels permis. Si un paiement est inférieur au montant HSP à récupérer intégralement, proposer une part HSP de zéro pour cette tentative et attendre un paiement suffisant ou le règlement direct par l’association. Il ne confirme pas la réservation tant que le montant obligatoire complet n’est pas encaissé. Aucun nouveau minimum global de paiement n’est décidé ici. Une récupération fractionnée cumulativement plafonnée est une alternative possible, mais n’est pas la recommandation « une seule récupération intégrale » et demanderait une approbation explicite.

### Comptant, Interac et parcours mixtes : suivi par association et concours

L’encaissement manuel confirmé crédite le participant, mais ne prouve aucun reversement à HSP. Identifier la part HSP **effectivement encaissée** grâce aux affectations serveur du paiement, y compris le détail HT/taxes enregistré ; jamais d’après le seul total facturé ou une promesse de virement. La priorité HSP proposée au §3 reste à confirmer pour les petits paiements ; sa ventilation aux composantes doit être explicite et testée, sans inventer de ventilation historique.

Prévoir un **Relevé des sommes HSP encaissées et à reverser**, par association et concours, daté, avec le détail par numéro de compte payeur : part HSP facturée HT, chaque taxe, TTC, encore non encaissée, encaissements affectés par moyen et référence de reçu, récupérations Stripe confirmées, autres reversements confirmés, réservations en cours et reste à reverser. Afficher les totaux par devise et taxes ; conserver les dates d’encaissement et de reversement séparées. Un impayé client apparaît dans « non encaissé », pas dans « encaissé à reverser ».

Pour un scénario sans remboursement : **reste encaissé à reverser = encaissements confirmés affectés à HSP − application fees HSP confirmées − autres reversements confirmés**. Les réservations en traitement sont affichées séparément et réduisent seulement le disponible pour une nouvelle récupération, sans être présentées comme un reversement accompli. Les anomalies et corrections éventuelles ont un journal distinct ; aucun montant négatif n’est silencieusement ramené à zéro.

Exemple DEMO : 162,75 CAD encaissés comptant avec 5,25 affectés à HSP donnent 5,25 à reverser ; une vente identique non payée donne zéro encaissé à reverser et 5,25 non encaissés. Un reversement confirmé de 5,25 laisse zéro à reverser, sans frais, taxe, facture ni nouveau paiement participant. Le relevé administratif est une pièce de rapprochement, pas une facture de vente HSP à l’association.

En cas de paiement Stripe ultérieur du **même compte**, proposer la récupération automatique du reste HSP libre, selon le mandat : prendre en compte les montants HSP précédemment encaissés comptant/Interac et ceux affectés au paiement courant, sans compter deux fois les mêmes encaissements. La récupération ne dépasse ni la part HSP TTC totale encore non reversée, ni le montant du PI, ni la part HSP cumulativement encaissée une fois ce PI confirmé. La reprise conserve ce plan exact. Si la part est déjà reversée ou réservée par une autre opération, aucune nouvelle récupération de cette part. Un prélèvement sur un autre compte participant n’est pas proposé.

Un futur reversement identifié doit réserver les sommes sous verrou avant son traitement, puis conserver référence, montant, affectations et preuve de réception réellement confirmée. Une référence annoncée ne vaut pas réception ; une réponse perdue doit être résolue avant un second règlement. Les rôles autorisés consultent uniquement leur périmètre, sans exposer ce journal au participant. Une dette de reversement interne ne bloque pas à elle seule la fermeture du compte participant payé.

**Aucun abonnement, facture mensuelle de service HSP → association, prélèvement automatique, carte d’association obligatoire, échéance ou calendrier n’est retenu.** Moyen, fréquence et autorisation de règlement restent ouverts ; seule la visibilité fiable des sommes à reverser est proposée ici. Ne déclencher aucun job de collecte automatique depuis ce relevé.

### Montants nets et responsabilités restantes

Exemple DEMO avec profils association → participant et HSP → participant explicitement tous deux à 5 % : participant paie **162,75 CAD**, compte du participant dans HSP crédité de **162,75**, application fee **5,25**, association reçoit un net **157,50 − S**, où S représente les frais Stripe effectifs débités par Stripe à cette association. Deuxième paiement : application fee zéro et ses propres frais Stripe restent à l’association. Aucun calcul estimatif de S n’entre dans la facture du participant.

| Coût ou responsabilité | Proposition / limite |
| --- | --- |
| Traitement des paiements directs des participants | Stripe débite l’association ; HSP n’avance ni ne refacture ces frais. Vérifier les balance transactions réelles lors de la qualification |
| Services Stripe propres à HSP | Options payantes ou services consommés sur la plateforme restent des coûts HSP. Les éventuels coûts d’un futur moyen de reversement devront être évalués une fois ce moyen choisi ; aucun encaissement B2B périodique n’est présumé |
| Connect et options | Vérifier le contrat et la tarification applicables au Canada/sandbox puis au live ; ne pas assimiler tous les produits Stripe à un service gratuit. Aucun tarif live chiffré n’est fixé dans ce document. [Stripe — tarification Connect Canada](https://stripe.com/en-ca/connect/pricing) |
| Litiges, remboursements, pertes | L’association gère ses ventes et preuves ; HSP doit recevoir les événements et maintenir ses comptes cohérents. `losses=stripe` ne décharge pas HSP de son propre solde négatif ni de ses obligations contractuelles, fiscales ou de sécurité |
| Tableau Stripe complet | L’association peut rembourser hors HSP ou déconnecter son compte. Détecter ces opérations, bloquer les nouvelles tentatives si déconnexion et conserver les anomalies durables ; ne pas prétendre qu’un historique HSP immuable empêche un remboursement fournisseur |
| Anciennes destination charges | Leurs responsabilités restent celles du modèle d’origine. Aucune conversion automatique des anciennes opérations n’est proposée |

### Adaptations indispensables avant un nouveau pilote direct charges

L’audit en lecture seule confirme les points suivants dans `server/billing/stripe.mjs`, `src/features/finance/PaymentElement.tsx` et `supabase/migrations/20260906001100_billing_stripe_test.sql`. Cette migration approuvée ne sera pas modifiée : toute évolution sera additive.

| Couche | Existant observé | Adaptation proposée, non implémentée |
| --- | --- | --- |
| Configuration | `checkAccount` exige `type === express` et `charges_enabled` | Configuration versionnée par contexte/nouvelle tentative : mode de charge, plateforme, compte propriétaire, responsabilité des frais/pertes vérifiées ; ancien mode conservé pour reprise |
| PaymentIntents | Requêtes plateforme, `transfer_data[destination]`, version API `2024-06-20` | Création directe avec clé secrète plateforme et en-tête serveur `Stripe-Account` du compte adopté ; supprimer `transfer_data` dans ce seul mode. Conserver capture automatique et un PI distinct par paiement partiel. Ne changer aucune version API implicitement |
| Elements | `Stripe(publishable_key, {locale})` | Ajouter `stripeAccount` validé serveur avec la clé publique plateforme et le client secret correspondant ; même instance pour confirmation, 3DS et reprise. Remonter le composant lors du changement de compte ; aucun choix libre du compte Stripe par le navigateur |
| Confirmation SQL | Vérifie `transfer_data.destination` | Vérifier une preuve privée issue d’une lecture fournisseur dans la portée exacte, environnement test, montant brut, devise, capture, application fee attendue et rattachement durable. Un champ `account` fourni par le client n’est pas une preuve |
| Reprises | GET/liste/cancel des PI sur la plateforme ; clé durable existante | Toutes les opérations sur PI directs utilisent le compte propriétaire figé, y compris recherche après réponse perdue. Conserver contenu, mode, montant HSP et portée originaux ; pas de nouvelle clé sur timeout. Nouvelle clé seulement après annulation certaine |
| Webhooks | Signature brute vérifiée ; tout `event.account` refusé ; recherche par `provider_id` seul | Canal Connect signé, contrôle de `event.account` contre le rattachement attendu ; dédoublonnage environnement/plateforme/compte/événement et rapprochement dans cette portée. Ne pas simplement supprimer le refus actuel. Événements inconnus conservés sans encaissement |
| Commission HSP | Aucune application fee actuelle | Réserver la part HSP ; confirmer sa perception avec ApplicationFee/charge fournisseur. Si sa preuve arrive après le paiement, conserver la réservation et créditer néanmoins le participant au brut ; ne jamais récupérer deux fois |
| Documents et fermeture | Reçus/outbox et facture immuables, blocage fournisseur | Préserver ces contrats ; paiement en traitement bloque les deux fermetures. Les métadonnées Connect et preuves de règlement restent privées |

La documentation montre l’initialisation Elements avec le même compte connecté que le PaymentIntent et la collecte d’application fees. Leur objet peut être créé de façon asynchrone. [Stripe — direct charges avec Elements](https://docs.stripe.com/connect/direct-charges?platform=web&ui=elements).

Prévoir deux portées de réception explicites : événements des comptes connectés pour les PI directs et événements de plateforme pour application fees et anciennes destination charges. Le listener de test doit inclure `--forward-connect-to` pour Connect et conserver `--forward-to` pour la plateforme. Vérifier les secrets de signature de chaque destination active sans les publier, et refuser `livemode=true` dans chaque chemin. Chaque traitement relit l’objet dans sa portée ; l’ordre des événements n’est pas une preuve de règlement. [Stripe — webhooks Connect et listener local](https://docs.stripe.com/connect/webhooks).

Une déconnexion ou perte d’accès fournisseur n’autorise ni un second PI sur un autre compte, ni la libération d’une réservation incertaine. La confirmation déjà engagée reste à résoudre, même si l’activation HSP est retirée. Le webhook signé seul ne doit pas pouvoir rattacher une transaction étrangère via des métadonnées ressemblantes. Les nouvelles tables/indices doivent porter la portée fournisseur complète et garder l’ordre commun de verrouillage ; aucune nouvelle opération réseau dans une transaction SQL.

## 7. Fiscalité : configurations distinctes, aucune règle inventée

Le profil de la stalle ne détermine pas celui des frais HSP. Chaque profil produit/contexte doit avoir des taxes explicitement configurées ou une exemption motivée. Taxes avec raison d’exemption, ou ni taxe ni raison : refus. `organization_products.tax_applicable` legacy n’est pas une autorité fiscale. Chaque taux, nom, juridiction, montant et motif nécessaire est figé sur la ligne et ses documents.

### Hypothèse retenue pour le prototype, à valider avec le comptable

- L’association fournit au participant les services du concours : inscriptions, stalles, achats et autres services de l’association.
- HSP fournit au participant son propre service de 5,00 CAD HT, une seule fois par Compte du concours dès la première opération facturable.
- Pour le prototype, l’association facture et encaisse cette part HSP **comme mandataire**, avec les taxes fictives propres à cette fourniture HSP → participant.
- Le reversement transporte les sommes encaissées pour HSP. Il ne crée automatiquement ni vente HSP → association, ni deuxième taxe sur le même service. Les anciennes recommandations de revente B2B et de facture mensuelle sont retirées.

Ce choix décrit une **hypothèse de prototype**, pas une reconnaissance juridique du mandat ni une validation fiscale. Faire examiner par le comptable une facture exemple et l’entente HSP–association : identification des fournisseurs, portée du mandat, numéros applicables, lieu de fourniture, profils fiscaux, responsabilité de déclaration/remise des taxes et éventuelles formalités. Le fait de reverser les taxes à HSP dans la fixture ne tranche pas à lui seul qui doit les déclarer dans un déploiement réel. L’ARC prévoit des règles particulières pour les agents ; elles ne valident pas cette entente par défaut. [ARC — agents et facturation](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-special-cases.html).

Les direct charges restent un choix de transport à qualifier ; le compte connecté de l’association et l’application fee ne prouvent pas la validité du mandat ou d’une pièce à deux fournisseurs. Vérifier également la compatibilité de l’entente avec les conditions Stripe avant usage réel. Tous les noms, coordonnées, numéros et profils des tests seront fictifs, sans substitution des identités réelles d’HSP ou d’une association.

### Facture exemple documentaire à soumettre au comptable

**DÉMONSTRATION — sans valeur comptable ou fiscale**
Compte du concours : DEMO-ACC-000001 — Concours fictif
Facture finale unique : DEMO-INV-000001 — Payeur fictif Camille Exemple

| Fournisseur / rôle | Frais HT CAD | Taxe fictive | Total CAD |
| --- | ---: | ---: | ---: |
| Association Démo — fournisseur de la stalle simulée ; identifiant fiscal fictif DEMO-ASSO-TAX | 150,00 | Taxe A DEMO 5 % : 7,50 | 157,50 |
| HSP Démo — fournisseur du service HSP ; identifiant fiscal fictif DEMO-HSP-TAX ; facturé et encaissé par Association Démo comme mandataire | 5,00 | Taxe H DEMO 5 % : 0,25 | 5,25 |
| Total général | **155,00** | **7,75** | **162,75** |

Ces identifiants ne sont pas des numéros fiscaux valides. Le document complet devra afficher les coordonnées fictives et numéros applicables de chaque fournisseur, les coordonnées du payeur, la date, la devise, les paiements reçus et le solde daté. Si déjà payé : 162,75 reçus, solde zéro. Les taxes restent séparées par fournisseur même lorsque leurs noms ou taux coïncident. Prévoir un scénario avec profils distincts/exemption motivée pour vérifier cette séparation.

Conserver **une seule facture finale et un total général**, avec sections fournisseur ; aucune seconde facture pour la part HSP. Les inscriptions gardent leurs groupes cheval/bloc dans la section association. Les relevés provisoires reprennent la même séparation sans numéro de facture ; les reçus identifient le paiement et ses affectations par fournisseur. Les sous-totaux ne sont jamais additionnés une deuxième fois.

Extension additive minimale proposée : rattachement structuré de chaque frais et taxe à son fournisseur ; instantanés versionnés de chaque identité, coordonnées, numéros applicables et mention de mandat. Figer ces données dès la pièce/récapitulatif concerné, périmer le récapitulatif si elles changent avant confirmation, puis produire les PDF uniquement depuis l’instantané confirmé. Aucun fournisseur deviné par le libellé et aucun enrichissement rétroactif des anciennes pièces depuis les fiches courantes. Cette évolution du rendu reste à implémenter après revue ; aucun PDF n’est généré dans ce lot documentaire.

## 8. Annulations et remboursements : règles à décider

| Situation | Invariant acquis / proposition à approuver |
| --- | --- |
| Brouillon abandonné avant confirmation | Aucun frais, dette HSP, paiement ni numéro financier |
| Engagement confirmé puis carte refusée | Ligne existante conservée ; pas d’encaissement fictif. Annuler une tentative Stripe n’annule pas la réservation ou son engagement |
| Annulation de réservation, compte encore ouvert | Décider si les 5 CAD sont remboursables, à partir de quelle étape et si des autres achats les maintiennent ; correction tracée, jamais suppression de l’historique |
| Annulation totale avant tout encaissement | Décider le maintien ou le crédit de la part HSP facturée au participant ; aucune somme n’a encore été encaissée à reverser ; ne pas la confondre avec un brouillon jamais confirmé |
| Annulation partielle après paiement | Déterminer lignes et taxes à créditer ; ne pas calculer automatiquement les frais HSP au prorata du remboursement de la stalle |
| Frais HSP crédités puis nouvelle réservation dans le même compte | Ne pas supprimer la contrainte d’unicité ni réinsérer une nouvelle ligne HSP. Décider si le crédit demeure acquis ou si une correction liée est permise ; pas de refacturation automatique |
| Facture finale déjà émise | Note de crédit et remboursement appropriés, aucune réouverture ou réécriture de la facture ; document lié avec taxes prouvées |
| Application fee déjà récupérée | Décider la restitution HSP/association et le remboursement client séparément ; journal de contre-écritures et preuves fournisseur, pas de remise à zéro permettant un nouveau prélèvement aveugle |
| Litige/rétrofacturation ou remboursement ambigu | Mise en rapprochement et gel du recouvrement concerné ; politique de coûts et de dette à décider, sans double prélèvement |

Pour les nouvelles direct charges, demander le remboursement dans la portée du compte connecté ; son solde est concerné, pas un transfert destination à inverser. L’application fee n’est pas restituée automatiquement. `refund_application_fee=true` produit un prorata lors d’un remboursement partiel, potentiellement incompatible avec les 5 CAD fixes : recommander une décision explicite et, si nécessaire, une restitution séparée de l’application fee. **Ne pas utiliser `reverse_transfer` dans ce chemin direct.** [Stripe — remboursement des direct charges](https://docs.stripe.com/connect/direct-charges?platform=web&ui=elements).

Les remboursements effectués dans le Dashboard de l’association doivent aussi être détectés. Journaliser séparément remboursement participant, taxes corrigées et restitution HSP ; conserver la clé du frais initial et ne pas le remettre automatiquement « à percevoir ». Si le solde fournisseur est insuffisant ou le remboursement incertain, suivre son état sans affirmer que le client est remboursé. Coûts Stripe conservés ou nouveaux coûts de litige : vérifier les règles et montants fournisseur, pas de refacturation automatique par HSP. Une restitution de reversement HSP au mandataire reste distincte du remboursement au participant ; elle ne recrée pas une vente taxable.

Les taxes d’une note de crédit doivent découler des lignes initiales réellement corrigées ; aucune ventilation historique inventée. Les remboursements et crédits restent hors de l’implémentation actuelle tant que ces règles ne sont pas approuvées.

## 9. Scénarios d’acceptation à implémenter

Tous ces scénarios sont **à exécuter**, pas des résultats acquis. Nouvelles fixtures : nouvelle association de démonstration ou nouveaux contextes fictifs explicitement adoptés sans comptes existants, CAD, profils fiscaux DEMO ; réservations simulées uniquement. Seconde association = fixture d’isolation.

| ID | Scénario | Assertions attendues |
| --- | --- | --- |
| HSP01 | Réservation seule, payée puis finalisée | Récapitulatif 150 + 5 HT ; taxes fictives 7,75 ; paiement 162,75 ; un compte, deux lignes, un frais HSP, un reçu ; compte ouvert à zéro puis facture unique sans nouvel ajout |
| HSP02 | Réservation payée puis inscription 100 HT et deuxième paiement | Premier paiement inclut HSP ; second montant fictif 105 ; une seule ligne et récupération HSP ; deux reçus ; total final 267,75, frais HSP inchangé |
| HSP03 | Première vente secrétaire, comptant puis variante Interac | Frais et taxes annoncés, même transaction ; encaissement intégral crédité ; part HSP encaissée à reverser distincte ; finalisation client sans attente du reversement interne |
| HSP04 | Deux premières opérations simultanées, sessions PostgreSQL distinctes | Un seul compte/numéro/frais/suivi ; second devis périmé refusé puis reconfirmé sans double frais ; aucune ligne métier perdue |
| HSP05 | Réponse perdue après confirmation puis rechargement | UUID et contenu exacts rejoués, même résultat malgré expiration du devis/nouvelle version ; aucun deuxième frais, reçu ou compte ; autre contenu avec même clé refusé |
| HSP06 | Consultation et brouillon abandonné | Aucun frais, dette HSP ou numéro créé ; devis expiré ne déclenche aucun job financier |
| HSP07 | Impôt HSP non configuré / exemption explicite / taxes contradictoires | Refus atomique si incomplet/contradictoire ; exemption motivée admise ; pas de déduction depuis le profil stalle ou le champ legacy |
| HSP08 | Double clic, webhook répété, ordre inversé, timeout fournisseur | Réservation durable de la même part HSP ; une application fee confirmée, un encaissement et reçu par paiement ; aucun nouveau montant après réponse perdue |
| HSP09 | Annulation Stripe confirmée puis nouvelle tentative | Réservation interne libérée seulement après preuve ; même frais existant ; nouvelle clé fournisseur ; première tentative non perçue ; une récupération réussie |
| HSP10 | Comptant/Interac puis Stripe ; règlement HSP direct avant Stripe | Première variante récupère une part encaissée encore à reverser du même compte ; deuxième applique zéro ; course entre règlement direct et tentative bloque la double récupération |
| HSP11 | Paiement inférieur au montant HSP intégral à récupérer | Crédit intégral du paiement partiel ; aucune confirmation prématurée de réservation ; part HSP non perdue, montant facturé distingué du montant encaissé, report au paiement suffisant/règlement association ; pas de minimum global inventé |
| HSP12 | Plusieurs chevaux/blocs/réservations et plusieurs moyens | Frais toujours unique par payeur, aucun partage entre payeurs ; autre propriétaire payeur = autre compte et autre frais unique |
| HSP13 | Anciennes fixtures, compte ouvert existant, facture existante, hors concours, USD | Aucun ajout ni conversion ; instantanés et hachages des documents existants inchangés ; aucune régression des anciens writers non adoptés |
| HSP14 | Montant HSP falsifié, opt-out navigateur, autre payeur/association | Refus serveur ; pas de suppression/déplacement de ligne système ni d’accès au journal de règlement HSP |
| HSP15 | Relevés/reçus/PDF, retry worker et fermeture concurrente | Aucun frais lié aux documents ; mêmes montants figés, une facture finale ; dette association → HSP ne devient pas un solde dû du participant |
| HSP16 | Coûts Stripe directement débités à l’association | Balance transaction du compte connecté : brut = net + frais Stripe + part HSP ; crédit participant au brut ; coût inconnu non assimilé à zéro ; aucune créance HSP de refacturation des frais Stripe |
| HSP17 | Nouveau compte et propriétés fournisseur | Configuration réellement retournée conforme ; compte non rattaché, `application`, live ou capability inactive refusés ; compte Express qualifié antérieur inchangé |
| HSP18 | PI/Elements/3DS et deux associations fictives | Même compte propriétaire à chaque étape ; compte, secret client ou PI échangés refusés ; montant falsifié refusé ; deux paiements, une application fee totale attendue |
| HSP19 | Webhooks Connect/plateforme retardés, inversés, répétés | Signature et portée exactes ; objet étranger non encaissé ; application fee tardive ne provoque aucune seconde perception ; ancien webhook destination continue son traitement |
| HSP20 | Annulation puis même montant / réponse perdue après création | Nouvelle clé seulement après annulation certaine ; reprise originale dans le même compte Stripe ; un seul encaissement et reçu ; aucune création sur la plateforme par défaut |
| HSP21 | Relevé association/concours et reversement concurrent avec Stripe | Facturé, encaissé HT/taxes, réservé, reversé et restant distingués ; vente impayée exclue des sommes encaissées ; une seule récupération ; aucune deuxième vente taxable ni échéancier automatique |
| HSP22 | Remboursement direct partiel/total, y compris Dashboard | État fournisseur réconcilié ; application fee traitée selon politique approuvée, sans prorata aveugle ni nouveau frais ; facture initiale inchangée ; aucun `reverse_transfer` |
| HSP23 | Déconnexion, droits retirés et paiement incertain | Nouvelles commandes refusées, historique lisible ; ancienne tentative non remplacée ; résolution/blocage durable sans fermeture prématurée |
| HSP24 | Pièce unique à deux fournisseurs FR/EN | Identités, rôles, coordonnées fictives, numéros et taxes distincts ; profils identiques puis différents/exemption ; somme exacte des sections, un numéro final ; reçu et relevé cohérents |
| HSP25 | Fournisseur ou mandat modifié après récapitulatif / après émission | Récapitulatif périmé avant fermeture ; après émission, instantanés et PDF inchangés ; aucune lecture des fiches courantes pour réécrire les pièces |
| HSP26 | Part HSP manuelle encaissée partiellement puis complément Stripe | Affectations HT/taxes explicites ; reste à reverser limité aux montants encaissés ; reprise au même contenu ; total récupéré au plus égal à l’unique part HSP TTC, aucune seconde taxation |

Couverture future : SQL pour atomicité/unicité/permissions ; véritables sessions concurrentes ; services pour réservations de recouvrement et preuves Stripe ; navigateur FR/EN ordinateur/mobile pour annonce, confirmation et reprises ; Stripe sandbox réel et Storage privé pour la qualification intégrée. Les cas HSP08/HSP09 doivent distinguer paiement reçu, application fee constatée et disponibilité des fonds ; aucune simulation n’est présentée comme une perception réelle.

## 10. Découpage proposé et décisions avant implémentation

1. Revoir cette orientation documentaire et la facture exemple avec l’entente de prototype ; obtenir l’autorisation d’implémentation sans confondre celle-ci avec une validation juridique/fiscale.
2. Extension additive de politique, devis/confirmation, ligne HSP unique, fournisseurs figés et suivi des encaissements/reversements ; writers communs et tests SQL/concurrence. Aucune adoption de compte existant ni modification de migration antérieure.
3. Adapter récapitulatifs, affectations, reçus/relevés et facture à deux fournisseurs, sans raccordement aux réservations réelles. Les PDF lisent seulement les données figées.
4. Sur de nouveaux comptes connectés fictifs compatibles, adapter PI/Elements/webhooks/reprises par mode versionné et récupérer la part HSP TTC une fois. Préparer le relevé par association/concours sans collecte périodique automatique.
5. Qualifier les nouvelles fixtures et leurs documents, conserver le pilote précédent intact. Les moyens et dates de reversement, remboursements, raccordements métier réels et usage réel nécessitent des décisions distinctes.

Décisions encore ouvertes : validation comptable de la facture exemple et de l’entente HSP–association, responsabilités fiscales et numéros requis ; configuration Stripe et API de création à qualifier ; affectation des petits paiements et récupération différée ; autorité, moyen et moment du reversement sans calendrier présumé ; preuve d’annonce dans le parcours secrétaire ; opérations à 0,00 ; annulations, remboursements et coûts de litige. L’orientation de prototype HSP → participant avec association mandataire remplace la proposition de revente HSP → association. **Le montant de 5,00 CAD HT, son déclenchement et son unicité restent acquis ; aucun abonnement ou prélèvement mensuel n’est approuvé.**

Contrôles de ce lot documentaire : références au code et à la documentation officielle vérifiées en lecture seule ; aucun taux fiscal réel sélectionné ; scénarios chiffrés recalculés ; diff limité à ce complément ; `git diff --check`. Aucun test exécutable, migration, paiement, appel authentifié Stripe ou nouvelle fixture lancé dans ce lot. Les 26 scénarios sont des critères futurs, pas une qualification directe acquise ; les résultats destination charges du pilote restent valides uniquement pour leur version. Sources officielles Stripe consultées le 7 septembre 2026 ; aucune configuration ni clé modifiée.
