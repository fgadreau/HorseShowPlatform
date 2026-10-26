# Propriétaire, créateur et agent d’un cheval

## Parcours client

Dans **Mes chevaux → Propriétaires et accès comme agent** :

- **Créer pour un autre propriétaire** : rechercher d’abord son numéro NRHA.
  La recherche retourne uniquement le nom de la fiche correspondante. Un numéro
  absent ou ambigu conduit au parcours de confirmation par nom.
  Si le compte n’a pas déjà un accès autorisé au propriétaire identifié, la
  création attend la confirmation de ce propriétaire ou du secrétariat : saisir
  un numéro NRHA ne donne pas accès à une fiche privée ni à ses coordonnées.
- **Nom et confirmation** : saisir le nom du propriétaire et les informations
  de base du cheval. Le secrétariat choisit la fiche réelle du propriétaire et
  confirme la demande. Aucun cheval ni accès d’agent n’est créé auparavant.
- Une fois le nouveau cheval créé, son propriétaire est le contact désigné.
  Le créateur est automatiquement agent lorsqu’il agit pour un tiers. S’il est
  lui-même propriétaire, aucun rôle d’agent supplémentaire n’est nécessaire.
  Les documents santé et informations complémentaires peuvent ensuite être
  ajoutés depuis la fiche du cheval.
- **Demander à devenir agent d’un cheval** : rechercher le nom exact ou un
  numéro du cheval dans l’association sélectionnée. Seuls le nom et le numéro
  du cheval sont retournés. Envoyer une demande au propriétaire ou au secrétariat.
- **Actualiser les demandes** recharge le suivi et les chevaux nouvellement
  accessibles après approbation.

Le formulaire classique vérifie aussi les chevaux existants avant la création.
Si le compte est déjà lié au cheval, il peut le réutiliser. Sinon, il demande
un accès d’agent. Un nom seul peut désigner un homonyme et demande une décision
explicite ; un numéro correspondant ne permet pas de créer une seconde fiche.
La base sérialise également les créations portant le même numéro normalisé.

Les demandes sont possibles pour une association publique ou déjà accessible
au compte. Elles ne donnent pas accès aux répertoires des associations privées.
La recherche par nom d’un propriétaire ne parcourt pas les contacts privés :
elle transmet le nom fourni au secrétariat pour confirmation.

## Traitement et permissions

Le propriétaire lié au cheval peut approuver ou refuser une demande d’agent
depuis **Mes chevaux**. Le personnel admin/secrétaire de l’association à laquelle
le cheval est rattaché peut le faire depuis le **Répertoire**. La confirmation
d’un propriétaire saisi par nom appartient uniquement au secrétariat ; celui-ci
sélectionne la fiche existante ou crée d’abord le contact avec le formulaire
habituel et sa vérification des doublons.
Un propriétaire identifié par numéro NRHA peut aussi confirmer une demande de
création qui le désigne. Sa fiche est alors fixée par le numéro ; la confirmation
ne permet pas de choisir un autre propriétaire. Un nom seul reste à confirmer
uniquement par le secrétariat.

Une demande en attente, annulée ou refusée n’accorde aucun accès. Une approbation
ajoute le contact du demandeur comme agent avec les droits d’inscription,
modification des inscriptions et réservation. Aucun droit de paiement n’est
ajouté automatiquement. Les permissions de consultation du propriétaire du
cheval suivent le modèle de délégation déjà en place ; elles ne donnent pas
le droit de modifier son identité ou ses autres chevaux.

Le lien d’agent est attaché au cheval et réutilisable pour ses concours. La
demande et sa décision restent enregistrées dans l’association choisie.
Le propriétaire principal du cheval reste inchangé. Un agent ne peut pas se
promouvoir propriétaire/co-propriétaire, nommer de nouveaux gestionnaires,
augmenter seul ses droits ou supprimer un cheval existant. Les propriétaires
conservent la gestion de la propriété. Le secrétariat peut approuver les accès
d’agent sans s’attribuer la propriété. Un créateur peut terminer les liens
d’une nouvelle fiche avant son premier rattachement au répertoire ; retirer
ensuite ce rattachement ne rétablit pas ce droit initial.

La création confirmée par le secrétariat conserve le demandeur comme créateur
et agent : le membre du personnel qui traite la demande ne devient pas agent.
Les droits d’inscription pour le compte du propriétaire restent compatibles
avec la vérification des dossards ; aucun paiement bancaire n’est déclenché.
Aucun rôle de personnel ni carte de membre payante n’est attribué par ce parcours.

Les demandes passent par des opérations serveur autorisées et transactionnelles.
Les clients ne peuvent pas modifier directement leur statut. Les tentatives
répétées et décisions répétées sont idempotentes. Les confirmations enregistrent
l’auteur de la décision et ne modifient jamais automatiquement une fiche privée
de propriétaire existante. Ce parcours ne déclenche pas de courriel.

## Validation

- `npm run build`
- `npm run test:horse-access:browser` : FR/EN sur téléphone portrait/paysage ;
  recherche minimale, demande/annulation, approbation du propriétaire,
  confirmation du secrétariat, numéro NRHA, nom en attente, formulaire classique
  et absence de création en double.
- `npm run test:client:mobile` et `node scripts/tests/directory-ui/run.mjs`.
- `supabase/tests/horse_agent_requests.sql` : transaction annulée, utilisateur
  sans accès initial à l’association, confidentialité, autorisations, droits
  d’inscription réels après approbation, protection de la propriété, absence de
  droits de paiement, annulation/refus, création NRHA et confirmation par nom.
  Le test vérifie aussi qu’un utilisateur ne peut pas obtenir les données d’un
  propriétaire privé en saisissant son numéro puis en proposant un nouveau cheval.

Migration : `horse_agent_access_requests`, préprod uniquement.
