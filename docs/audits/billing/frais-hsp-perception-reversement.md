# Frais de service HSP — annonce, perception et reversement

7 septembre 2026. Complément documentaire au contrat approuvé, avant implémentation.
Branche : `feat/billing-pilot-integrated`. Base de lecture : `ae96a7dbbe09c3973bd76fcef89fa47b7df1ba47`.

**Décision produit acquise : 5,00 CAD avant taxes par Compte du concours payeur, dès la première opération facturable confirmée, y compris une stalle.** Ce document précise cette décision et distingue les recommandations de perception, les choix fiscaux et les annulations qui restent à approuver. Aucun code, migration, paiement, fixture ou document financier n’est modifié par ce lot.

Les contrats [D1–D5](plan-et-scenarios.md), [première tranche](premiere-tranche.md), [tests](tests-acceptation.md) et [navigation](tranche-1a5-navigation-ux.md) restent les références générales. Aucun document dédié à la perception/reversement des frais HSP n’a été trouvé dans la base inspectée ; ce complément rassemble la proposition sans réécrire les contrats ni le [rapport du pilote déjà exécuté](pilote-integre-validation.md).

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

Le récapitulatif identifie l’association, le concours, le contact payeur et son entreprise éventuelle, les lignes, chaque taxe/exemption, le montant exigé pour confirmer le service, les paiements déjà reçus et le solde. Le bouton indique l’engagement exact : « Confirmer — 162,75 CAD », puis paiement du montant présenté. Aucun prix de frais HSP ne vient du navigateur.

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
6. Créer l’unique créance de règlement association → HSP correspondante selon le modèle commercial à approuver. Mettre à jour versions, audit et résultat idempotent atomiquement. Toute nouvelle vente invalide l’attestation des frais complets et les récapitulatifs antérieurs selon 1A.6.
7. Seulement après commit, préparer le paiement du montant annoncé par les contrats Stripe existants. Refus de carte ou fermeture de fenêtre n’effacent pas un engagement confirmé. La réservation reste non confirmée tant que son exigence réellement encaissée n’est pas satisfaite.

**Deux premières opérations simultanées** : une seule ligne HSP et un seul compte, grâce au verrou et à l’unicité SQL. Si deux devis contenaient chacun les 5 CAD, le second doit être recalculé et reconfirmé après la première transaction ; les deux ne peuvent pas réclamer indépendamment le même frais. En cas de réponse perdue de la première transaction, sa reprise retourne les mêmes UUID, lignes et montants.

Recommandation d’affectation pour les nouveaux contextes adoptés : régler prioritairement la ligne HSP TTC une seule fois, puis les frais du service visé, avec un plan d’affectation serveur figé par tentative. La condition d’activation d’une première réservation inclut son montant obligatoire et le solde de la ligne HSP TTC. Un paiement inférieur peut être enregistré comme partiel si le contexte l’autorise, mais ne confirme pas la réservation. Cette priorité doit aussi être respectée par l’encaissement manuel. Aucun ancien plan d’affectation n’est réécrit.

## 4. Compatibilité avec le code observé

| Existant réel | Conséquence du complément |
| --- | --- |
| `billing_folios`, unicité association/contexte/payeur | À conserver, y compris après fermeture ; aucun nouveau compte pour contourner le frais ou un compte fermé |
| `billing_charges`, profils produits et `billing_charge_taxes` | Réutiliser les montants et taxes figés ; introduire une nature système structurée HSP, sans recherche sur le libellé |
| `add_billing_sale` et `add_documented_billing_sale` | Le second appelle le premier ; intégrer le déclenchement dans le chemin commun autorisé, pas dans le seul wrapper documentaire ni par deux appels client successifs |
| Présentation PDF `section: other` | Compatible pour la ligne HSP ; le rendu présente une ligne déjà enregistrée, sans la calculer ni l’ajouter |
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
| `billing_hsp_receivables` | Une créance par assessment, débiteur association, principal HT, taxes de la relation HSP/association, devise et justificatifs figés ; distincte du solde du participant |
| Réservations de recouvrement | Créance + tentative Stripe ou lot de règlement manuel, montant, état ; au plus une réservation non résolue pour cette créance, aucun dépassement du reste à percevoir |
| Événements de règlement | Journal append-only : réservation, confirmation, annulation sûre, paiement direct reçu, correction/restitution autorisée. Unicité environnement + plateforme + référence fournisseur ; allocation aux créances unique par règlement |
| Coûts Stripe de l’association | Référence unique de balance transaction, montant/devise réels, éventuels ajustements, état « à déterminer » tant que Stripe ne les fournit pas ; distincts des 5 CAD et du compte participant |

Toutes les relations sont contrôlées par des clés étrangères et contrôles de portée, pas par l’UUID fourni seul. RLS, privilèges explicites, `search_path` fixé, écritures directes révoquées. Le personnel de l’association consulte ses seuls relevés de règlement ; le payeur ne reçoit ni ces écritures internes ni les coûts/provider metadata. Conserver seulement la ligne HSP publique et sa fiscalité dans ses instantanés.

Cette sous-comptabilité de règlements explique les sommes dues et leurs preuves ; HSP ne devient pas un grand livre général et ne remplace pas Xero, QuickBooks ou Sage.

## 6. Perception auprès du participant et recouvrement auprès de l’association

Trois montants distincts :

- **Prix client** : 5,00 CAD HT + taxes du profil de la ligne client ; intégré au compte dès l’engagement.
- **Créance HSP sur l’association** : base commerciale proposée de 5,00 CAD HT, plus sa fiscalité propre éventuelle. Sa définition dépend du modèle fournisseur/revendeur ou mandataire (§7).
- **Frais Stripe** : coût du traitement assumé économiquement par l’association, jamais un nouveau frais au participant et jamais retranché de son paiement crédité.

### Proposition recommandée : recouvrement intégral une seule fois

Conserver destination charges / Connect Express. Sous réserve du modèle fiscal validé, figer un `application_fee_amount` correspondant au montant de la créance HSP encore entièrement due, **sur la première tentative Stripe admissible d’un montant suffisant**. Les autres paiements de ce compte portent explicitement une part HSP de zéro. Ne pas laisser une règle Dashboard de tarification ajouter des frais par paiement à la place de ce contrat.

La documentation Stripe décrit le retour de l’application fee vers la plateforme, son plafond au montant du paiement et le débit des frais de traitement à la plateforme. L’application fee ne suffit donc pas, à elle seule, à faire supporter ces coûts à l’association. [Stripe — destination charges](https://docs.stripe.com/connect/destination-charges?platform=web&ui=elements).

Algorithme proposé :

1. Verrouiller compte, tentative et créance dans l’ordre commun ; vérifier qu’elle n’est ni réglée ni réservée par un autre règlement.
2. Réserver la récupération intégrale dans la tentative **avant** l’appel externe ; figer le montant de l’application fee dans la commande originale et la clé fournisseur. Une incertitude conserve cette réservation.
3. À confirmation serveur, créditer au participant la totalité du paiement et produire son reçu une seule fois. Vérifier le montant d’application fee attendu et les références Stripe de la perception ; confirmer séparément le règlement HSP avec sa preuve fournisseur. Si cette preuve manque, conserver l’état à rapprocher et empêcher une deuxième récupération, sans effacer un paiement client réellement reçu.
4. Un webhook répété ou désordonné relit l’état fournisseur ; il ne crée ni nouveau frais, ni seconde créance, ni second règlement HSP. La reprise d’une ancienne tentative utilise ses montants figés, pas le reste recalculé du jour.
5. Une annulation fournisseur certaine sans perception libère la réservation ; une nouvelle tentative peut ensuite réserver cette **même** créance. Un timeout ne la libère pas.

Pour une réservation payée intégralement à 162,75 CAD, le frais client est payé dès le premier encaissement. Avec des fiscalités fictives client et HSP/association toutes deux configurées à 5 %, la part HSP est 5,25 CAD. Un deuxième paiement porte 0,00 de part HSP. C’est un exemple de fixture, pas l’affirmation que les deux fiscalités réelles sont identiques.

**Très petits paiements** : conserver les paiements partiels permis. Si un paiement est inférieur au montant HSP à récupérer intégralement, proposer une part HSP de zéro pour cette tentative et attendre un paiement suffisant ou le règlement direct par l’association. Il ne confirme pas la réservation tant que le montant obligatoire complet n’est pas encaissé. Aucun nouveau minimum global de paiement n’est décidé ici. Une récupération fractionnée cumulativement plafonnée est une alternative possible, mais n’est pas la recommandation « une seule récupération intégrale » et demanderait une approbation explicite.

### Comptant, Interac et parcours mixtes

L’encaissement manuel confirmé paie le compte client, **pas automatiquement HSP**. La créance envers HSP reste visible pour l’association : créée, éventuellement non encore encaissée auprès du client, réservée pour récupération, réglée ou à rapprocher. Le fait que le client soit à zéro n’implique pas que l’association ait reversé les sommes. Cette dette interne ne bloque pas à elle seule la finalisation d’un compte client admissible : seule une incertitude touchant son paiement, son solde ou ses conditions de fermeture doit intervenir dans son checkout.

Recommandation : créance constatée lors de l’engagement facturable ; règlement périodique de l’association à HSP, avec échéance à définir. Un relevé de règlement regroupe les comptes concernés, principal, taxes propres à cette relation, retenues Stripe déjà prouvées, règlements directs, corrections et reste dû. Il ne crée pas une seconde facture pour le participant. La pièce commerciale HSP → association, si retenue, a un autre débiteur et ne duplique pas la facture du concours.

Pour un règlement manuel à HSP : référence bancaire et réception réellement confirmée, auteur habilité côté HSP, allocation durable aux créances. La secrétaire peut déclarer/proposer une référence, mais pas marquer unilatéralement « HSP payé ». Une référence ambiguë reste à rapprocher ; un règlement annoncé réserve les créances explicitement prises en charge pour empêcher une retenue Stripe simultanée. Les soldes bancaires externes ne sont pas une transaction SQL : un double transfert externe éventuel devient un excédent de règlement à rapprocher, jamais un nouveau débit du participant.

Si le client paie d’abord comptant puis par Stripe, la créance non réglée peut être récupérée sur ce paiement Stripe **du même compte**, selon l’accord de compensation avec l’association. Si l’association l’a déjà réglée, aucune application fee HSP. Ne pas prélever silencieusement sur un autre compte client pour compenser une dette de l’association.

### Coûts Stripe assumés par l’association

Proposition compatible avec l’architecture actuelle : relever les frais effectifs de chaque balance transaction et les porter sur un relevé de coûts association → HSP, séparé de la récupération unique des 5 CAD. Règlement périodique ou compensation contractuellement autorisée ultérieurement ; aucun tarif estimé n’est présenté comme un coût fournisseur définitif. Les coûts inconnus restent « à déterminer », pas zéro.

Exemple abstrait : participant crédité 162,75 ; application fee HSP 5,25 ; transfert net à l’association 157,50 ; coût Stripe réel S initialement débité à la plateforme et dû séparément par l’association. Le participant reste crédité de 162,75. Ne pas promettre un transfert net de 157,50 − S automatiquement : cette retenue supplémentaire n’est pas implémentée ni choisie. Les frais des deuxième et suivants paiements restent à la charge de l’association, sans nouveau frais HSP au payeur.

## 7. Fiscalité : configurations distinctes, aucune règle inventée

Le profil de la stalle ne détermine pas celui des frais HSP. Chaque profil produit/contexte doit avoir des taxes explicitement configurées ou une exemption motivée. Taxes avec raison d’exemption, ou ni taxe ni raison : refus. `organization_products.tax_applicable` legacy n’est pas une autorité fiscale. Chaque taux, nom, juridiction, montant et motif nécessaire est figé sur la ligne et ses documents.

**Choix commercial/fiscal restant à approuver** : qui fournit et facture juridiquement le service HSP au participant ?

- Recommandation de compatibilité à étudier : l’association facture au participant la ligne client ; HSP fournit son service à l’association. Les taxes client appartiennent à la fourniture association → client ; celles de HSP → association sont configurées séparément. Une association exemptée/non inscrite n’implique pas automatiquement une exemption pour le service vendu par HSP à l’association. Ne pas additionner ces deux fiscalités sur la ligne client.
- Alternative : HSP fournisseur du participant et association mandataire. Il faut alors valider la présentation du fournisseur et des numéros fiscaux, la perception/remise des taxes et l’émission documentaire ; le seul libellé « Frais de service HSP » et un compte Connect ne suffisent pas à établir ce mandat. Cela peut nécessiter une extension des instantanés actuels, où l’association est l’émetteur.

L’ARC distingue les responsabilités fiscales selon l’existence et la nature d’une relation mandant/mandataire ; le choix ne découle pas automatiquement du transport du paiement. [ARC — règles pour les agents](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-special-cases.html).

La proposition de fixture peut simuler explicitement la première option, mais ne valide aucun traitement TPS/TVH/TVQ réel. À décider avant usage réel : fournisseur, inscriptions fiscales, lieu de fourniture, fiscalité du service HSP, des frais refacturés Stripe et des corrections, ainsi que les pièces HSP/association nécessaires. Une application fee Stripe est une circulation de fonds ; elle ne remplace ni un calcul fiscal ni une pièce justificative.

## 8. Annulations et remboursements : règles à décider

| Situation | Invariant acquis / proposition à approuver |
| --- | --- |
| Brouillon abandonné avant confirmation | Aucun frais, dette HSP, paiement ni numéro financier |
| Engagement confirmé puis carte refusée | Ligne existante conservée ; pas d’encaissement fictif. Annuler une tentative Stripe n’annule pas la réservation ou son engagement |
| Annulation de réservation, compte encore ouvert | Décider si les 5 CAD sont remboursables, à partir de quelle étape et si des autres achats les maintiennent ; correction tracée, jamais suppression de l’historique |
| Annulation totale avant tout encaissement | Décider l’annulation ou l’exigibilité de la créance association → HSP ; ne pas la confondre avec un brouillon jamais confirmé |
| Annulation partielle après paiement | Déterminer lignes et taxes à créditer ; ne pas calculer automatiquement les frais HSP au prorata du remboursement de la stalle |
| Frais HSP crédités puis nouvelle réservation dans le même compte | Ne pas supprimer la contrainte d’unicité ni réinsérer une nouvelle ligne HSP. Décider si le crédit demeure acquis ou si une correction liée est permise ; pas de refacturation automatique |
| Facture finale déjà émise | Note de crédit et remboursement appropriés, aucune réouverture ou réécriture de la facture ; document lié avec taxes prouvées |
| Application fee déjà récupérée | Décider la restitution HSP/association et le remboursement client séparément ; journal de contre-écritures et preuves fournisseur, pas de remise à zéro permettant un nouveau prélèvement aveugle |
| Litige/rétrofacturation ou remboursement ambigu | Mise en rapprochement et gel du recouvrement concerné ; politique de coûts et de dette à décider, sans double prélèvement |

Stripe ne rembourse pas automatiquement l’application fee avec le remboursement client. Les options de restitution/transfert peuvent produire un prorata qui ne correspond pas à un frais fixe conservé ou intégralement remboursé. Ne pas activer systématiquement `refund_application_fee`/`reverse_transfer` sans un plan métier précis. [Stripe — remboursements des application fees](https://docs.stripe.com/connect/destination-charges?platform=web&ui=embedded-form).

Les taxes d’une note de crédit doivent découler des lignes initiales réellement corrigées ; aucune ventilation historique inventée. Les remboursements et crédits restent hors de l’implémentation actuelle tant que ces règles ne sont pas approuvées.

## 9. Scénarios d’acceptation à implémenter

Tous ces scénarios sont **à exécuter**, pas des résultats acquis. Nouvelles fixtures : nouvelle association de démonstration ou nouveaux contextes fictifs explicitement adoptés sans comptes existants, CAD, profils fiscaux DEMO ; réservations simulées uniquement. Seconde association = fixture d’isolation.

| ID | Scénario | Assertions attendues |
| --- | --- | --- |
| HSP01 | Réservation seule, payée puis finalisée | Récapitulatif 150 + 5 HT ; taxes fictives 7,75 ; paiement 162,75 ; un compte, deux lignes, un frais HSP, un reçu ; compte ouvert à zéro puis facture unique sans nouvel ajout |
| HSP02 | Réservation payée puis inscription 100 HT et deuxième paiement | Premier paiement inclut HSP ; second montant fictif 105 ; une seule ligne et récupération HSP ; deux reçus ; total final 267,75, frais HSP inchangé |
| HSP03 | Première vente secrétaire, comptant puis variante Interac | Frais et taxes annoncés, même transaction ; encaissement intégral crédité ; dette HSP distincte ; finalisation client sans attente du reversement interne |
| HSP04 | Deux premières opérations simultanées, sessions PostgreSQL distinctes | Un seul compte/numéro/frais/créance ; second devis périmé refusé puis reconfirmé sans double frais ; aucune ligne métier perdue |
| HSP05 | Réponse perdue après confirmation puis rechargement | UUID et contenu exacts rejoués, même résultat malgré expiration du devis/nouvelle version ; aucun deuxième frais, reçu ou compte ; autre contenu avec même clé refusé |
| HSP06 | Consultation et brouillon abandonné | Aucun frais, dette HSP ou numéro créé ; devis expiré ne déclenche aucun job financier |
| HSP07 | Impôt HSP non configuré / exemption explicite / taxes contradictoires | Refus atomique si incomplet/contradictoire ; exemption motivée admise ; pas de déduction depuis le profil stalle ou le champ legacy |
| HSP08 | Double clic, webhook répété, ordre inversé, timeout fournisseur | Réservation durable de la même créance ; une application fee confirmée, un encaissement et reçu par paiement ; aucun nouveau montant après réponse perdue |
| HSP09 | Annulation Stripe confirmée puis nouvelle tentative | Réservation interne libérée seulement après preuve ; même frais existant ; nouvelle clé fournisseur ; première tentative non perçue ; une récupération réussie |
| HSP10 | Comptant/Interac puis Stripe ; règlement HSP direct avant Stripe | Première variante récupère une dette encore due du même compte ; deuxième applique zéro ; course entre règlement direct et tentative bloque la double récupération |
| HSP11 | Paiement inférieur au montant HSP intégral à récupérer | Crédit intégral du paiement partiel ; aucune confirmation prématurée de réservation ; dette HSP non perdue, report au paiement suffisant/règlement association ; pas de minimum global inventé |
| HSP12 | Plusieurs chevaux/blocs/réservations et plusieurs moyens | Frais toujours unique par payeur, aucun partage entre payeurs ; autre propriétaire payeur = autre compte et autre frais unique |
| HSP13 | Anciennes fixtures, compte ouvert existant, facture existante, hors concours, USD | Aucun ajout ni conversion ; instantanés et hachages des documents existants inchangés ; aucune régression des anciens writers non adoptés |
| HSP14 | Montant HSP falsifié, opt-out navigateur, autre payeur/association | Refus serveur ; pas de suppression/déplacement de ligne système ni d’accès au journal de règlement HSP |
| HSP15 | Relevés/reçus/PDF, retry worker et fermeture concurrente | Aucun frais lié aux documents ; mêmes montants figés, une facture finale ; dette association → HSP ne devient pas un solde dû du participant |
| HSP16 | Coûts Stripe distincts et indisponibles temporairement | Paiement client crédité au brut ; coût fournisseur en attente puis réel, idempotent ; aucun deuxième frais de 5 CAD |

Couverture future : SQL pour atomicité/unicité/permissions ; véritables sessions concurrentes ; services pour réservations de recouvrement et preuves Stripe ; navigateur FR/EN ordinateur/mobile pour annonce, confirmation et reprises ; Stripe sandbox réel et Storage privé pour la qualification intégrée. Les cas HSP08/HSP09 doivent distinguer paiement reçu, application fee constatée et disponibilité des fonds ; aucune simulation n’est présentée comme une perception réelle.

## 10. Découpage proposé et décisions avant implémentation

1. Approuver la présente proposition et le modèle fiscal fictif explicite ; conserver les décisions commerciales encore ouvertes comme telles.
2. Extension additive de politique, devis/confirmation, ligne système unique et créance ; writers communs et tests SQL/concurrence. Aucune adoption de compte existant ni modification de migration antérieure.
3. Adapter récapitulatifs participant/secrétaire et affectations du premier paiement, sans raccordement aux réservations réelles. Les PDF lisent seulement les nouvelles lignes figées.
4. Ajouter réservation/récupération Stripe de la créance, rapprochement et suivi des règlements directs/coûts Stripe ; tester sans secrets live ni nouveau flux financier du participant.
5. Qualifier les nouvelles fixtures et leurs documents. Conserver le pilote précédent intact comme témoin. Le raccordement aux réservations réelles, les remboursements et l’usage réel restent des lots autorisés séparément.

Décisions encore ouvertes : modèle fournisseur/mandataire et fiscalité des deux relations ; exigibilité et échéance de la créance HSP ; compensation après paiement manuel ; récupération intégrale différée pour petits paiements ou alternative fractionnée ; preuve d’annonce dans le parcours secrétaire ; opérations à 0,00 ; conditions d’annulation/remboursement et coûts de litige. **Le montant client de 5,00 CAD HT, son déclenchement à la première opération facturable et son unicité ne sont pas remis en discussion.**

Contrôles de ce lot documentaire : références au code et à la documentation officielle vérifiées en lecture seule ; aucun taux fiscal réel sélectionné ; scénarios chiffrés recalculés ; diff limité à ce complément ; `git diff --check`. Aucun test exécutable, migration, paiement ou nouvelle fixture lancé dans ce lot.
