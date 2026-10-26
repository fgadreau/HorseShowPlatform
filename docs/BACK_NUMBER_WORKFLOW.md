# Gestion des dossards — pilote préprod

Le nouveau parcours concerne les associations en mode **dossard par cheval**.
Les autres modes existants restent disponibles.

## Règles

- Le registre est propre à l'association. Un numéro ne peut pas être assigné
  à deux chevaux en même temps ; le cheval conserve son numéro indéfiniment.
- Au choix du cheval, le formulaire recherche son numéro actuel. Il propose
  sa réutilisation, un numéro personnel libre ou une demande à l'association.
- Une demande est facturée une seule fois, même si plusieurs classes sont
  inscrites ensemble ou si une soumission est reprise après une erreur.
- L'association définit le montant et active ou non l'assignation automatique.
  Le serveur choisit le premier numéro disponible de son stock. Un ancien numéro
  personnel libéré ne devient pas automatiquement un dossard physique du stock.
- Sans stock ou lorsque l'automatisme est désactivé, les inscriptions restent
  possibles avec un dossard en attente. Le secrétariat voit la demande dans
  **Dossards → Demandes et frais**, puis lui assigne un numéro.
- Les nouveaux numéros assignés se propagent aux inscriptions actives des
  concours présents ou futurs. Les inscriptions annulées et l'historique des
  concours passés ne sont pas réécrits.
- Une annulation ne libère pas le numéro et ne rembourse pas les frais de
  dossard. Cette règle a été confirmée pour le pilote.

## Option du bloc

Les formulaires de création et modification d'un bloc permettent d'imposer les
dossards fournis par l'association. Le participant ne peut alors pas fournir
un numéro personnel. Si son numéro actuel a déjà été fourni par cette
association, il peut le réutiliser sans nouveaux frais. Sinon, il en demande
un nouveau, qui remplace son numéro permanent.

Le tarif du bloc peut être laissé vide pour reprendre celui de l'association,
ou fixé à `0` pour une demande gratuite. Lors d'une inscription à plusieurs
blocs, le formulaire traite le tarif le plus élevé en premier pour créer la
demande unique. Un changement ultérieur de tarif ne modifie pas une demande
déjà enregistrée.

L'ordre de passage est bloqué côté interface et base de données tant qu'un
dossard manque. La base vérifie aussi le registre et la provenance imposée par
le bloc. Elle protège les écritures de préparation du bloc, de configuration
ShowScore et des positions de passage. Un numéro ne peut pas être changé ni
libéré pour une inscription active dont l'ordre est déjà préparé : il faut
d'abord retirer cet ordre pour le régénérer. Un numéro lié à une inscription
active doit être libéré ou réassigné avant suppression du registre.

## Registre historique

Les numéros d'inventaire et les assignations historiques identifiables comme
effectuées par le personnel sont marqués « Fournis par l'association ». Les
anciens numéros déclarés par des participants, ou dont l'origine n'est pas
identifiable, sont marqués personnels. Le secrétariat peut confirmer un numéro
physique existant en l'assignant de nouveau au même cheval, sans créer de frais.

Les anciennes intégrations qui laissent un numéro vide restent compatibles :
aucune demande payante n'est créée implicitement. Leur dossard doit être résolu
avant de préparer l'ordre. Les nouveaux formulaires présentent explicitement
les choix et le tarif avant la soumission.

## Facturation et sécurité

Le montant provient exclusivement des réglages serveur. Une clé de demande
stable rend la soumission de plusieurs classes idempotente. Les numéros et les
assignations sont protégés par les contraintes d'unicité existantes et des
verrous transactionnels ; les assignations manuelles passent maintenant par une
opération atomique, y compris pour le prochain numéro libre.

Les comptes de facturation adoptés reçoivent une charge `back_number` avec les
taxes configurées du concours. Les concours utilisant encore les factures
historiques reçoivent une vente dédiée. Cette ligne ne dépend pas du maintien
de l'inscription. Aucun paiement Stripe ou courriel n'est déclenché par les tests.
Les demandes ne peuvent pas être modifiées directement par les participants ;
elles sont visibles par leur auteur et le personnel autorisé.

## Vérification

```sh
npm run build
npm run test:back-numbers:browser
npm run test:client:mobile
```

Le test dédié vérifie en FR/EN sur 320×568, 390×844, 844×390 et 1024×768 :
recherche, numéro personnel, réutilisation, demande, maintien du choix lors du
changement de bloc, bloc imposé, attente, échec de recherche, tarif et assignation
du secrétariat. Il utilise uniquement des données simulées et bloque le réseau
externe. La CI exécute ce test.

[`supabase/tests/participant_back_numbers.sql`](../supabase/tests/participant_back_numbers.sql)
vérifie les règles sur une transaction annulée : permissions, numéro déjà pris,
frais uniques sur plusieurs classes, annulation, assignations manuelle et
automatique, absence de stock, bloc gratuit ou imposé, propagation des changements,
préservation de l'historique, et montants/taxes dans les deux systèmes de
facturation. Les utilisateurs, associations, inscriptions et frais fictifs sont
tous annulés à la fin du test.
