# Refonte des répertoires, identités et validations

## Statut

Version consolidée du projet et du plan de mise en oeuvre.

L'inventaire technique détaillé de la Phase F1 est maintenu dans `docs/BLOCK_CLASS_FIELD_INVENTORY.md`.

Les impacts techniques et les invariants fonctionnels de ShowScore sont suivis dans `docs/SHOWSCORE_REBUILD_IMPACT_REGISTER.md`. Toute modification à partir de F2 doit y être classée `SS-0`, `SS-T` ou `SS-F`; un changement `SS-F` exige une décision produit explicite.

Ce document intègre les décisions produit, la revue d'architecture de Claude et les clarifications suivantes :

- les données actuelles sont fictives et peuvent être supprimées;
- il n'y aura aucune période de migration ou de compatibilité utilisateur;
- les contacts et chevaux sont indépendants des associations;
- les répertoires sont définis par une association et une discipline;
- la structure produit est `concours -> slate -> bloc -> classe`;
- les classes, et non les blocs, portent la discipline et les organismes de règles applicables;
- les sources externes sont des outils d'import, de comparaison et d'admissibilité, jamais les propriétaires des fiches HSP;
- les règlements de santé appartiennent aux associations, indépendamment des disciplines.

## 1. Résumé du projet

Horse Show Platform doit gérer une identité unique pour chaque contact et chaque cheval, même lorsque cette personne ou ce cheval participe à plusieurs disciplines et travaille avec plusieurs associations.

Le modèle actuel conserve un `organization_id` directement sur plusieurs fiches tout en utilisant aussi des tables de liaison multi-associations. Certaines fonctions suivent l'association enregistrée sur la fiche, d'autres suivent les liaisons. Cela produit plusieurs chemins d'accès, favorise les doublons et rend les permissions difficiles à raisonner.

La refonte remplace ce modèle par cinq axes distincts :

1. Les identités HSP : contacts et chevaux indépendants.
2. Les répertoires : association + discipline.
3. Le programme du concours : concours, slates, blocs et classes.
4. Les organismes de règles : NRHA, AQR, AQHA et autres organismes applicables aux classes.
5. Les sources externes : API, registres et imports utilisés comme outils ponctuels.

Les documents de santé appartiennent au cheval. Leur conformité est calculée séparément pour chaque association, selon sa politique et la date du concours.

## 2. Principes non négociables

- Un contact correspond à une seule fiche canonique dans HSP.
- Un cheval correspond à une seule fiche canonique dans HSP.
- Une association ne possède pas la fiche globale.
- Une discipline ne possède pas la fiche globale.
- Une fiche peut appartenir à plusieurs répertoires.
- Aucun transfert entre associations n'est nécessaire.
- Un administrateur ou secrétaire peut rattacher une fiche existante aux répertoires de sa propre association.
- Le droit de rattacher ne donne pas automatiquement le droit de modifier l'identité globale.
- Une source externe peut confirmer une information précise sans devenir la source de vérité de toute la fiche.
- Une classe peut appliquer plusieurs organismes de règles.
- Un bloc peut contenir des classes de disciplines ou sanctionnements différents.
- Une règle de santé appartient à l'association, jamais à la discipline.
- La conformité de santé dépend d'une association et d'une date de référence.
- Une ressemblance floue ne provoque jamais une fusion automatique.

## 3. Hors portée

- Migration progressive des données fictives actuelles.
- Approbation d'une association précédente avant un nouveau rattachement.
- Propriété exclusive d'un contact ou cheval par une association.
- Fusion automatique basée uniquement sur un score de similarité.
- Moteur métier unique pour import, admissibilité sportive et santé.
- Règles de santé mondiales imposées par une discipline.
- Exposition publique des coordonnées de contacts dans la recherche globale.

## 4. Vocabulaire produit définitif

```text
Concours réel
└── Slate / concours technique
    └── Bloc d'horaire
        ├── Classe
        ├── Classe
        └── Classe
```

### Concours

Événement réel organisé par une association.

### Slate

Regroupement technique requis pour les rapports et contraintes de certains organismes. Un concours réel peut contenir plusieurs slates.

### Bloc

Objet d'horaire. Il détermine l'ordre, la journée, l'heure ou la relation avec le bloc précédent. Il peut contenir des classes différentes.

### Classe

Produit dans lequel une inscription est effectuée. La classe porte :

- sa discipline;
- son code officiel ou maison;
- ses organismes de règles;
- ses frais;
- ses critères d'admissibilité;
- ses paramètres de résultats ou de bourse.

Le nouveau modèle produit ne contient aucune entité appelée « division ».

## 5. Modèle conceptuel cible

```text
Association
├── Répertoire Reining
│   ├── contacts
│   └── chevaux
├── Répertoire Performance
│   ├── contacts
│   └── chevaux
└── Politique de santé

Concours
└── Slate
    └── Bloc
        └── Classe
            ├── discipline
            └── organismes de règles (0..n)

Contact indépendant <-- relation --> Cheval indépendant
                                      ├── documents de santé
                                      ├── identifiants externes
                                      └── instantanés externes
```

## 6. Schéma de données cible

### 6.1 Associations et disciplines

#### `organizations`

Tenant HSP : personnel, facturation, concours, politiques et paramètres.

Une association HSP n'est pas automatiquement un organisme de règles, même si la même entité réelle peut jouer les deux rôles.

#### `disciplines`

- `id`
- `code`
- `name_fr`
- `name_en`
- `is_active`

Exemples : Reining, Performance, Gymkhana, Ranch, Dressage.

#### `organization_disciplines`

Cette liaison représente le répertoire d'une association pour une discipline.

- `id`
- `organization_id`
- `discipline_id`
- `is_default`
- `is_active`
- `created_at`
- unique `(organization_id, discipline_id)`

La désactivation masque le répertoire pour les nouvelles opérations. Elle ne supprime jamais les liaisons, inscriptions ou historiques existants.

Une discipline ne peut pas être désactivée si une inscription ouverte en dépend sans qu'une action explicite soit choisie : conserver jusqu'à la fermeture, déplacer la classe ou fermer les inscriptions.

### 6.2 Contacts et chevaux indépendants

#### `contacts`

Contient uniquement l'identité globale et les coordonnées autorisées.

Le `organization_id` d'origine disparaît du modèle cible.

#### `horses`

Contient l'identité globale du cheval :

- nom;
- date ou année de naissance;
- sexe;
- race et couleur;
- père et mère;
- identifiants généraux utiles;
- audit de création et modification.

Le `organization_id` d'origine disparaît du modèle cible.

#### `horse_contact_relationships`

Relations globales :

- `horse_id`
- `contact_id`
- `role`: `owner`, `co_owner`, `agent`, `manager`
- permissions déléguées pertinentes;
- dates et audit;
- unique `(horse_id, contact_id, role)`

Le cavalier d'une inscription demeure enregistré sur l'inscription. Il ne devient pas automatiquement une relation permanente avec le cheval.

### 6.3 Liaisons aux répertoires

#### `directory_contacts`

- `id`
- `organization_discipline_id`
- `contact_id`
- `source`
- `created_by_user_id`
- `created_at`
- unique `(organization_discipline_id, contact_id)`

#### `directory_horses`

- `id`
- `organization_discipline_id`
- `horse_id`
- `source`
- `created_by_user_id`
- `created_at`
- unique `(organization_discipline_id, horse_id)`

Sources possibles : `manual`, `entry`, `membership`, `relationship`, `reservation`, `import`.

Une suppression retire seulement la liaison au répertoire. La fiche globale et ses autres liaisons demeurent intactes.

Les notes internes ou statuts propres à l'association doivent vivre sur une table contextuelle liée au répertoire, jamais sur la fiche globale.

### 6.4 Structure du concours

#### `shows`

Concours réels organisés par une association.

#### `slates`

Concours techniques reliés à un concours réel.

#### `blocks`

Groupes de passages reliés à un concours, une journée et, lorsque pertinent, une slate. Le bloc porte son horaire, son pattern commun, ses juges et son échéance d'inscription effective lorsque le concours utilise des échéances par bloc.

#### `classes`

- `id`
- `organization_id`
- `show_id`
- `slate_id` lorsque nécessaire;
- `block_id`
- `organization_discipline_id`
- nom, code, frais et paramètres métier;
- critères d'admissibilité;
- état des inscriptions;
- ordre à l'intérieur du bloc.

La valeur `organization_discipline_id` de la classe est la source de vérité pour l'ajout automatique aux répertoires.

Le concours, la slate ou le bloc peuvent proposer une discipline par défaut pour accélérer la création, mais ils ne remplacent pas la discipline enregistrée sur la classe.

Des contraintes ou triggers doivent garantir que :

- la classe, son bloc, sa slate et son concours appartiennent au même concours réel;
- `organization_discipline_id` appartient à l'association organisatrice du concours;
- un bloc ne peut pas recevoir une classe d'un autre concours;
- une référence de slate demeure facultative lorsque le concours n'en utilise pas.

#### Répartition définitive des responsabilités

Le schéma actuel mélange des champs d'horaire et de classe sur plusieurs tables. La reconstruction ne doit pas recopier ces duplications. Elle applique la matrice cible suivante :

| Destination | Champs et responsabilités |
| --- | --- |
| Slate | numéro technique NRHA ou autre identifiant de slate, contraintes de rapport |
| Bloc | journée, heure, mode de départ, durée, arène, ordre, nom, notes, pattern commun, juges et fermeture des inscriptions lorsque le mode est par bloc |
| Classe | nom, code, discipline, frais, minimum d'inscriptions, niveau, âge, membership, admissibilité, organismes de règles, payout et résultats |
| Association ou concours | politique de santé, règles générales de numéros, politique de retard, échéance des réservations, mode et valeurs par défaut des échéances d'inscription |
| À supprimer ou remplacer | supprimer `class_block_id`; remplacer `is_event_block` par `blocks.block_type`; supprimer les codes de sanctionnement texte et les champs métier dupliqués sur le bloc |

Décisions particulières :

- `nrha_slate_number` appartient à la slate;
- `pattern` appartient au bloc; toutes les classes du bloc et tous les blocs exécutés concurremment doivent utiliser le même pattern;
- les payouts demeurent sur la classe;
- `requires_membership` devient une règle d'admissibilité de classe;
- `requires_coggins` et `requires_health_cert` disparaissent au profit de la politique de santé de l'association;
- `is_event_block` est remplacé par `blocks.block_type` avec `competition`, `paid_warmup`, `event`, `break` et `ceremony`;
- la politique de numéro utilise la valeur générale de l'association avec une surcharge de classe seulement lorsqu'un cas métier l'exige;
- l'échéance des réservations est indépendante de celle des inscriptions;
- le concours choisit une fermeture des inscriptions globale ou par bloc, normalement la veille à 18 h, à partir des valeurs par défaut de l'association;
- les classes n'ont pas de date limite propre;
- les juges sont affectés au bloc tandis que leurs frais demeurent sur les classes;
- la visibilité de l'horaire, la visibilité/ouverture des classes et la publication des résultats sont séparées.

#### Templates de programme

Le système de templates suit exactement la même séparation, avec une relation simple un-à-plusieurs :

```text
block_templates
└── class_templates
    ├── classe modèle 1
    ├── classe modèle 2
    └── classe modèle 3
```

`block_templates` conserve les valeurs de regroupement, d'horaire et le pattern commun par défaut.

`class_templates` contient `block_template_id`, `sort_order` et toutes les valeurs métier de classe : discipline, code, frais, organismes, admissibilité, payout et surcharges permises.

Le modèle many-to-many de réutilisation d'une même classe dans plusieurs templates de bloc est volontairement écarté du MVP. Si un besoin réel apparaît, un catalogue partagé pourra être ajouté plus tard sans modifier les vraies tables `blocks` et `classes`.

### 6.5 Organismes de règles

#### `governing_bodies`

- `id`
- `code`
- `name`
- `is_active`

Cette table représente les organismes ou ensembles de règles sportives : NRHA, AQR, AQHA, etc.

#### `class_governing_bodies`

- `class_id`
- `governing_body_id`
- `reporting_class_code`, propre au format officiel de cet organisme;
- `eligibility_profile_code`, propre à son moteur d'admissibilité;
- `sanction_metadata`, objet extensible pour les autres données de sanction ou de rapport;
- unique `(class_id, governing_body_id)`

Une classe peut n'avoir aucun organisme, un seul ou plusieurs.

Une table facultative `organization_governing_bodies` peut limiter les choix normalement proposés dans les paramètres d'une association. Elle n'est jamais la preuve du sanctionnement réel d'une classe.

Les anciens codes texte doivent être remplacés par ces clés étrangères.

Les mêmes champs existent sur `class_template_governing_bodies` comme valeurs par défaut. Un type de classe NRHA, par exemple, n'appartient pas aux règles génériques de la classe : il appartient à la liaison NRHA. Ainsi, une classe NRHA + AQR peut conserver des codes et profils distincts sans que l'un devienne la règle de l'autre.

### 6.6 Sources et données externes

#### `external_data_sources`

- `id`
- `code`
- `name`
- `source_type`: `api`, `manual_import`, `document`, `public_registry`
- paramètres non secrets;
- état opérationnel explicite, notamment `planned`, `available`, `degraded`, `unavailable` ou `retired`;

Exemples : registre public NRHA, AQHA Leveling, import de listes NRHA et GVL.

Un même organisme peut avoir plusieurs sources distinctes — API, registre public, import de listes ou document — et l'ajout d'un nouveau fournisseur consiste à ajouter une ligne de catalogue, pas à modifier le schéma. Un connecteur connu mais non encore branché demeure à l'état `planned`; sa présence au catalogue ne constitue jamais une promesse de disponibilité.

#### `external_credential_issuers`

Catalogue des entités qui émettent un numéro de membre, une carte, une licence ou un enregistrement externe. Exemples : les organismes provinciaux ou territoriaux de sport (OPTS) comme Cheval Québec et Ontario Equestrian, ainsi que NRHA, AQHA, NSBA et NBHA.

Une OPTS porte un pays et une subdivision provinciale ou territoriale. L'application ne contient aucune règle propre à Cheval Québec : une nouvelle OPTS s'ajoute au catalogue par configuration.

Un émetteur d'adhésion n'est pas automatiquement un organisme de règlements ni une source technique. Une même entité réelle peut jouer plusieurs rôles, mais chaque rôle demeure représenté séparément et relié explicitement lorsque nécessaire.

Une exigence d'association peut demander qu'un contact possède une adhésion active auprès d'un émetteur précis, indépendamment de la discipline. Pour les OPTS, l'association peut déclarer plusieurs organismes acceptés dans un groupe `at_least_one` : une seule adhésion active parmi ce groupe suffit. La valeur enregistrée conserve son statut, ses dates de validité et la source qui l'a fournie ou vérifiée.

Une source externe est un outil. Elle ne possède pas le contact, le cheval, la classe ou le répertoire.

Une table facultative `external_source_governing_bodies` peut relier une source aux organismes dont elle fournit les données. La relation est plusieurs-à-plusieurs et ne donne aucun rôle de tenant à la source.

#### `horse_external_identifiers`

- `horse_id`
- `external_credential_issuer_id` comme émetteur de l'identifiant;
- `verified_by_external_data_source_id` facultatif;
- type d'identifiant;
- valeur normalisée;
- état de concordance;
- date de dernière vérification;
- unique selon la portée de l'identifiant officiel.

#### `contact_external_identifiers`

Même principe pour les numéros de membre, cartes et identifiants de cavaliers. Le statut actif ou expiré est évalué à la date pertinente pour l'inscription, selon les exigences propres à l'association HSP.

#### `external_data_snapshots`

- `id`
- `external_data_source_id`
- `retrieved_at`
- `effective_on`
- `expires_at`
- `payload`
- `payload_hash`
- état de récupération;
- audit.

Un instantané conserve ce que la source disait à un moment précis. Il ne contient pas la décision métier finale.

Pour conserver de vraies clés étrangères, les sujets ne doivent pas être représentés uniquement par un couple polymorphique texte/id. Des liaisons typées spécialisent l'instantané :

- `external_data_snapshot_horses(snapshot_id, horse_id)`;
- `external_data_snapshot_contacts(snapshot_id, contact_id)`;
- `team_eligibility_snapshots(snapshot_id, horse_id, rider_contact_id, show_id, class_id, governing_body_id)`.

Les liaisons typées empêchent de réduire les sujets à un couple polymorphique texte/id et permettent d'appliquer les FK et RLS propres à chaque contexte.

#### `team_eligibility_decisions`

Cette table conserve la décision HSP, séparément de la preuve externe :

- association, concours, classe et organisme de règlements;
- cheval, cavalier et date de référence;
- état `eligible`, `ineligible` ou `unavailable` et autorisation de poursuivre;
- raisons structurées;
- empreinte exacte des données évaluées;
- preuve externe facultative, date de vérification et expiration du cache.

Le cache n'est réutilisé que si toute l'équipe, la classe, l'organisme, la date et l'empreinte concordent et que son TTL n'est pas expiré. La liaison classe-organisme configure le TTL et la politique `block` ou `allow_with_warning` applicable lorsque la source est indisponible. Une panne ne modifie jamais les identités HSP.

### 6.7 Documents et politiques de santé

#### `horse_documents`

- `id`
- `horse_id`
- catégorie `health`, `registration` ou `other`;
- type de document;
- chemin de stockage immuable;
- empreinte cryptographique du fichier;
- numéro de certificat;
- émetteur;
- date du test ou vaccin;
- créateur et dates d'audit.

Le document n'a pas d'association propriétaire.

Un document d'enregistrement de race peut référencer un `external_credential_issuer_id`, un numéro et une race. Un même cheval peut posséder plusieurs enregistrements auprès de registres différents. `horses.registration_status` distingue `registered`, `grade` et `unknown`; `grade` signifie explicitement qu'aucun enregistrement n'est attendu.

La vue de lecture transitoire `horse_health_documents` a servi uniquement pendant la réécriture. Elle est supprimée en S9 avec les anciennes fonctions Coggins/vaccins; `horse_documents` est l'unique table canonique.

#### `horse_health_document_validations`

Validation versionnée de l'identité inscrite sur le document :

- document;
- nom lu;
- naissance ou âge lu;
- sexe lu;
- race, couleur ou signalement;
- numéro officiel lu;
- résultat de comparaison;
- source et auteur;
- date;
- avertissements et données brutes utiles.

États suggérés : `pending`, `identified`, `verified`, `mismatch`, `rejected`, `superseded`.

#### `organization_health_policies`

Politique indépendante de la discipline :

- Coggins requis;
- règle de validité du Coggins : durée glissante en mois ou test effectué durant l'année civile du concours;
- influenza requis;
- rhino requis;
- certificat combiné accepté;
- durée de validité des vaccins;
- niveau de validation d'identité requis;
- révision propre à l'association requise;
- comportement `warning` ou `blocking`;
- dates d'effet.

#### `organization_health_document_reviews`

Révision facultative propre à une association. Elle ne modifie pas la validation objective reconnue par les autres associations.

#### `horse_identity_corrections`

Journal spécialisé pour toute correction d'un champ verrouillé : valeurs avant/après, auteur, raison, date et validations rendues obsolètes.

## 7. Comparaison d'identité partagée

Les workflows demeurent distincts, mais ils utilisent une primitive commune de comparaison.

Fonctions pures suggérées :

- normaliser un nom de cheval;
- normaliser un numéro officiel;
- comparer une date ou année de naissance;
- interpréter un âge à la date d'un document;
- comparer le sexe avec des transitions légitimes;
- retourner les champs concordants, divergents et inconnus;
- produire un score explicable.

Interface implantée :

```ts
compareContactIdentity(reference, candidate)
compareHorseIdentity(reference, candidate)
compareExternalContactIdentity(reference, candidate)
compareExternalHorseIdentity(reference, candidate)
compareHorseHealthIdentity(reference, candidate)
```

Chaque résultat contient le profil, le verdict, le score, les raisons compatibles avec l'anti-doublon et une preuve structurée par champ. Le profil détermine les champs et tolérances applicables, mais pas la décision métier finale.

Utilisations :

- import externe : proposer des valeurs;
- concordance officielle : signaler les différences;
- recherche anti-doublon : classer les candidats;
- santé : déterminer si le document concerne vraisemblablement le cheval;
- admissibilité : confirmer que les identifiants utilisés correspondent aux sujets sélectionnés.

La décision `admissible`, `document accepté` ou `doublon confirmé` reste dans son propre workflow.

## 8. Recherche globale et prévention des doublons

### 8.1 Autorisation

La recherche globale complète est réservée :

- aux administrateurs et secrétaires d'au moins une association;
- aux administrateurs de plateforme;
- aux propriétaires ou agents dans les workflows où ils recherchent ou créent leurs propres chevaux.

Les résultats retournent uniquement un résumé d'identification. Les coordonnées privées complètes ne sont pas exposées sans droit supplémentaire.

Les recherches cross-association sensibles doivent être auditées.

### 8.2 Signaux chevaux

Signaux forts :

- numéro officiel identique;
- identifiant externe vérifié identique;
- même nom normalisé, même naissance et même sexe.

Signaux complémentaires :

- nom très semblable;
- année de naissance;
- race et couleur;
- propriétaire;
- père et mère;
- écurie ou agent.

### 8.3 Réponses

- Correspondance certaine : empêcher normalement un doublon et proposer la fiche existante.
- Correspondance probable : avertissement fort avec candidats.
- Correspondance faible : suggestion sans blocage.

Le serveur répète la vérification dans la transaction de création.

### 8.4 Faux rapprochements

#### `horse_similarity_dismissals`

Mémorise que deux chevaux ont été comparés et confirmés distincts :

- paire ordonnée de chevaux ou signature candidat;
- utilisateur;
- raison;
- date;
- version de l'algorithme.

Une modification importante de l'identité ou de l'algorithme peut rendre la décision à revoir.

### 8.5 Contacts

- courriel normalisé identique : réutilisation;
- téléphone identique : signal fort mais non nécessairement unique;
- nom et écurie semblables : suggestion;
- aucune fusion automatique sur le nom seulement.

## 9. Autorisations métier

### Administrateur de plateforme

- accès global;
- fusion et correction exceptionnelle;
- gestion des catalogues globaux;
- audit.

### Administrateur ou secrétaire d'association

- recherche globale limitée;
- rattachement de n'importe quelle fiche existante aux répertoires de sa propre association;
- retrait d'une liaison de sa propre association;
- gestion des données contextuelles de l'association;
- révision des documents si la politique le prévoit;
- aucune propriété automatique sur l'identité globale.

### Contact lié à un compte

- gestion de sa propre fiche selon les champs permis;
- consultation de ses relations et activités;
- rattachement déclenché par une inscription, adhésion ou réservation légitime.

### Propriétaire ou agent

- gestion du cheval selon ses permissions;
- upload de documents;
- rattachement dans un workflow légitime;
- correction d'identité explicite et auditée lorsque permis.

### Correction d'identité verrouillée

Réservée au propriétaire/agent autorisé et à l'administrateur de plateforme. Un secrétaire peut signaler ou préparer une correction, mais le simple rattachement à son association ne lui donne pas ce droit global.

## 10. Workflows cibles

### 10.1 Création ou rattachement d'un cheval

1. Choisir ou déduire le répertoire.
2. Rechercher par nom ou numéro dans toute la plateforme autorisée.
3. Afficher les candidats avec raisons de ressemblance.
4. Choisir une fiche existante ou poursuivre une nouvelle création.
5. Revalider côté serveur.
6. Créer si nécessaire.
7. Faire un `upsert` de la liaison au répertoire.
8. Proposer le rattachement du propriétaire et de l'agent.

### 10.2 Ajout automatique par inscription

La classe détermine `organization_discipline_id`.

Lors de l'inscription :

- lier le cheval au répertoire;
- lier le propriétaire;
- lier le cavalier;
- lier l'agent seulement lorsqu'il participe au workflow;
- créer l'inscription;
- effectuer l'ensemble dans une transaction idempotente.

### 10.3 Ajout par carte de membre

Un type de carte peut être relié à un ou plusieurs répertoires. Son activation rattache automatiquement le contact aux répertoires configurés.

### 10.4 Association monodisciplinaire

Le seul répertoire actif est présélectionné et aucun choix inutile n'est affiché.

### 10.5 Association multidisciplinaire

Le contexte de la classe ou du workflow présélectionne le répertoire. L'utilisateur peut ajouter d'autres répertoires lorsqu'il en a le droit.

### 10.6 Import externe

1. Récupérer un instantané externe.
2. Comparer avec la fiche locale.
3. Présenter les valeurs officielles comme suggestions.
4. L'utilisateur accepte les champs désirés.
5. Conserver source, date et résultat de concordance.

Une panne de la source ne bloque pas une création ordinaire, sauf si la classe exige explicitement une preuve ou vérification d'admissibilité.

### 10.7 Admissibilité sportive

1. Sélectionner cheval, cavalier, classe et date.
2. Identifier les organismes de règles de la classe.
3. Vérifier les identifiants requis.
4. Réutiliser ou rafraîchir les instantanés externes.
5. Évaluer localement les règles machine-readable lorsque possible.
6. Retourner une décision avec raisons précises.

L'import externe aide à obtenir les données; le moteur d'admissibilité prend la décision propre à la classe.

### 10.8 Santé

1. Charger un document santé ou un document d'enregistrement une seule fois.
2. Identifier les renseignements du cheval inscrits sur le document.
3. Comparer ces renseignements à la fiche HSP.
4. Valider ou signaler les différences.
5. Calculer séparément la conformité pour chaque association liée.
6. Utiliser la date du concours pendant une inscription ou réservation.

Présentation attendue :

```text
Documents à jour
APEM · APEQ

Mise à jour requise
AQR — Coggins expiré pour le prochain concours
APWL — Certificat influenza/rhino manquant
```

### 10.9 Rapports officiels — module reporté

La production des rapports ne sera pas figée pendant la refonte des fondations. Elle fera l'objet d'un module distinct lorsque les besoins de présentation seront prêts.

Portée déjà décidée :

- sorties PDF et CSV;
- formats modulables par organisme de régie;
- sélection explicite des classes par cases à cocher;
- production d'une classe seule ou de plusieurs classes regroupées;
- validations des champs requis et affichage des écarts avant génération;
- conversion facultative des gains selon un taux de change explicite fourni par le governing body;
- conservation de la devise et du montant source, du taux utilisé, de la date ou version du taux et du montant converti dans l'instantané du rapport;
- lecture des résultats synchronisés sans mutation des données ni du workflow ShowScore.

Un format particulier, notamment NRHA, AQHA, NSBA ou NBHA, sera livré par adaptateur. Un export générique ne devra pas prétendre être un rapport officiel d'un organisme sans contrat de format validé.

## 11. Verrouillage de l'identité

Une validation de document lie ce document à un instantané précis de l'identité du cheval.

Champs sensibles :

- nom;
- naissance;
- sexe;
- numéro officiel.

Une modification ordinaire est bloquée lorsqu'une validation active dépend de ces champs.

Le workflow `Corriger l'identité` :

1. explique l'impact;
2. demande une raison;
3. enregistre les valeurs avant/après;
4. rend obsolètes les validations touchées;
5. exige une nouvelle validation lorsque nécessaire.

Cela permet une correction légitime sans réutiliser silencieusement un document pour un autre cheval.

## 12. Conformité de santé par association

La conformité n'est pas un booléen permanent sur le cheval.

Entrées :

- cheval;
- association;
- date de référence;
- documents;
- validations d'identité;
- politique active;
- révision d'association facultative.

Sorties :

- `compliant`
- `update_required`
- `pending_review`
- `not_required`

Chaque sortie inclut les raisons, documents utilisés et dates d'expiration calculées.

Dans le répertoire, la date de référence est aujourd'hui ou le prochain concours pertinent. Dans une inscription, la date du concours est obligatoire.

## 13. Services et RPC transactionnelles

Les opérations suivantes doivent être centralisées côté serveur :

- `search_horse_candidates`
- `create_or_link_horse`
- `link_contact_to_directory`
- `link_horse_to_directory`
- `create_entry_with_directory_links`
- `correct_horse_identity`
- `evaluate_horse_health_compliance`
- rafraîchissement contrôlé d'un instantané d'admissibilité.

Les contraintes, permissions et opérations multi-tables ne doivent pas dépendre d'une séquence d'appels React.

Le frontend conserve des services typés, mais les décisions sensibles et l'atomicité restent dans PostgreSQL ou une Edge Function appropriée.

## 14. Chargement des données

Le nouveau modèle abandonne le chargement complet de tous les contacts et chevaux au démarrage.

Approche cible :

- charger les répertoires de l'association;
- sélectionner un répertoire actif;
- rechercher côté serveur avec pagination;
- retourner des cartes-résumés;
- charger les détails à l'ouverture;
- utiliser une RPC minimale pour la recherche globale;
- ne charger les données externes et de santé qu'au besoin.

Cette approche réduit à la fois les données transmises et la densité visuelle.

## 15. Stratégie de remise à zéro

### Choix recommandé

Créer une migration destructive ciblée, réinitialiser la base et les données fictives, puis retirer tout fallback applicatif de l'ancien modèle.

Le dépôt contient de nombreuses fonctions indépendantes du répertoire : facturation, stalls, horaires, résultats, ShowScore, paiements et memberships. Une migration ciblée protège mieux ces fonctions qu'une réécriture immédiate de tout l'historique SQL.

Après stabilisation, l'historique pourra être condensé dans une nouvelle baseline.

### Nomenclature SQL

Puisque le produit n'est pas en production réelle, cette refonte est le bon moment pour aligner les noms physiques :

- `blocks` pour les blocs;
- `classes` pour les classes;
- références `block_id` et `class_id` cohérentes partout.

Point de départ technique seulement : la table SQL actuelle `classes` contient les blocs et la table SQL actuelle `divisions` contient les vraies classes. La reconstruction doit donc renommer ou recréer ces tables dans le bon ordre, migrer toutes les clés étrangères, puis éliminer définitivement l'ancien nom `divisions`. Aucun alias de compatibilité ne doit subsister dans le modèle final.

### Données

- supprimer les données fictives locales et distantes;
- ne produire aucun mapping d'anciens UUID;
- recréer un seed complet;
- adapter les tests aux nouveaux identifiants et relations.

## 16. Plan de mise en oeuvre

### Phase 0 — Inventaire et décisions figées

Travaux :

- inventorier toutes les tables, fonctions, triggers, RLS et composants touchant contacts, chevaux, santé et structure bloc/classe;
- produire un inventaire colonne par colonne des tables SQL actuelles qui mélangent blocs et classes;
- décider pour chaque colonne `bloc`, `classe`, `slate`, `association/concours` ou `supprimer`;
- inventorier les tables de templates actuelles et les quatre formulaires actifs qui les modifient;
- inventorier `organization_back_numbers`, `claim_horse_back_number()` et `BackNumbersView.tsx`, dont l'admissibilité dépend actuellement des anciens rattachements directs et tables de liens;
- confirmer la suppression de `class_block_id`, `requires_coggins` et `requires_health_cert`, ainsi que le remplacement de `is_event_block` par `blocks.block_type`;
- inventorier explicitement le moteur NRHA actuel;
- confirmer la hiérarchie concours/slate/bloc/classe;
- confirmer que la classe porte la discipline;
- confirmer la relation many-to-many classe-organismes;
- confirmer la séparation associations/organismes/sources externes;
- lister les données privées exposables par la recherche globale;
- préparer la matrice de permissions.

Critère de sortie : toutes les décisions structurelles sont fermées, la matrice de redistribution est complète et tous les usages SQL/React touchés sont listés avant le SQL.

### Phase 1 — Noyau SQL et nomenclature

Travaux :

- étiqueter chaque lot SQL selon son impact ShowScore et mettre à jour le registre avant l'implémentation;

- créer disciplines et répertoires;
- rendre contacts et chevaux indépendants;
- créer les relations globales cheval-contact;
- créer concours, slates, blocs et classes avec les bons noms;
- créer `block_templates` et leurs `class_templates` enfants;
- redistribuer les champs selon la matrice cible au lieu de copier les colonnes dupliquées;
- déplacer le numéro de slate, le pattern de bloc, les règles, les frais et les payouts vers leurs niveaux définitifs;
- créer les échéances séparées de réservation et d'inscription, avec un mode d'inscription global au concours ou par bloc;
- créer les trois états distincts de visibilité du bloc, de la classe et des résultats;
- affecter les juges au bloc et faire respecter l'unicité du pattern dans le bloc et entre blocs concurrents;
- déplacer les références des entrées vers `class_id`;
- créer governing bodies et liaisons de classe;
- remplacer les codes texte;
- créer contraintes uniques et index;
- supprimer les anciens chemins de rattachement.
- réécrire `claim_horse_back_number()` pour vérifier les rattachements dans `directory_horses` et `directory_contacts`, sans fallback vers un `organization_id` porté par la fiche globale;

Critères :

- une fiche peut être liée à plusieurs répertoires;
- un bloc contient plusieurs classes;
- chaque classe a une discipline explicite;
- une classe peut avoir plusieurs organismes;
- un modèle de bloc possède directement ses modèles de classes;
- aucune entité produit appelée division ne subsiste.

### Phase 2 — RLS et permissions

Travaux :

- réécrire les helpers d'accès autour des liaisons uniques;
- séparer accès à l'identité, rattachement et données contextuelles;
- sécuriser la recherche cross-association;
- ajouter l'audit de recherche;
- couvrir documents, relations, répertoires et instantanés;
- tester chaque rôle directement en SQL.

Critères :

- un secrétaire peut lier une fiche à sa propre association;
- il ne peut pas modifier arbitrairement l'identité globale;
- aucun utilisateur ne voit des coordonnées privées sans droit;
- aucune policy ne dépend d'un ancien `organization_id` de fiche.

### Phase 3 — Seed de référence et reset

Créer :

- associations mono et multidisciplinaires;
- plusieurs répertoires;
- concours, slates, blocs et classes mixtes;
- classe NRHA + AQR;
- contacts et chevaux partagés;
- chevaux semblables mais distincts;
- doublon certain par numéro;
- politiques de santé divergentes;
- instantanés externes frais, expirés et indisponibles.

Critère : tous les scénarios peuvent être reproduits après un seul reset.

### Phase 4 — Services et chargement ciblé

Travaux :

- adapter les types TypeScript;
- remplacer le bootstrap global;
- créer les services paginés;
- créer les RPC de liaison;
- supprimer les fallbacks hérités;
- adapter les dépendances des inscriptions, factures, stalls et numéros.

Critère : l'application compile et charge seulement le contexte demandé.

### Phase 5 — Interface des répertoires

Travaux :

- sélection de répertoire;
- recherche d'abord;
- étiquettes de répertoires sur les fiches;
- ajout/retrait par staff;
- proposition propriétaire/agent;
- actions en lot;
- comportements mono et multidisciplinaires.

Critère : aucune grande liste n'est affichée ou chargée avant une recherche.

### Phase 6 — Anti-doublon et comparateur commun

Travaux :

- créer normalisations et index `unaccent`/`pg_trgm`;
- extraire la comparaison d'identité pure;
- créer la recherche de candidats;
- ajouter la vérification transactionnelle;
- intégrer tous les points de création;
- créer les dismissals de faux rapprochements;
- appliquer la réutilisation exacte des contacts.

Critères :

- identifiant officiel identique = pas de doublon;
- faute légère = bon candidat proposé;
- homonymes distincts = création permise;
- faux rapprochement confirmé = non répété inutilement.

### Phase 7 — Sources externes et admissibilité

Travaux :

- créer sources, identifiants et instantanés;
- remplacer les codes NRHA en dur par des références structurées;
- adapter imports NRHA/AQHA;
- conserver l'acceptation explicite des valeurs importées;
- adapter le moteur d'admissibilité au nouveau modèle classe/organismes;
- évaluer les règles au moment de l'inscription;
- ajouter raisons précises, cache et TTL;
- préserver le fonctionnement en cas de source indisponible selon la règle de classe.

Critères :

- un import aide sans prendre le contrôle de la fiche;
- une donnée externe datée est traçable;
- le moteur NRHA demeure fonctionnel;
- l'admissibilité utilise classe, cheval, cavalier et date corrects.

État de l'import assisté : le connecteur NRHA actuellement actif utilise une proposition générique, une sélection champ par champ et une décision conservée dans l'instantané externe. Les champs HSP déjà remplis ne sont jamais présélectionnés pour remplacement. AQHA ne possède pas encore de connecteur applicatif actif; sa source planifiée et toute future source réutiliseront ce même contrat plutôt qu'un workflow autoritaire propre à l'organisme.

État du moteur d'admissibilité : le contrat commun évalue toutes les liaisons classe-organisme qui portent un profil. Une liaison sans profil n'invente aucune exigence; un profil configuré sans adaptateur produit une raison bloquante explicite. NRHA est le premier adaptateur actif. Ses réponses sont conservées comme preuves immuables et comme décisions HSP séparées avec TTL; ses codes proviennent de la liaison NRHA structurée. Les politiques de panne sont configurables sur la classe et son modèle, avec blocage sécuritaire par défaut.

État des rapports : leur implémentation est volontairement reportée jusqu'à la conception du module PDF/CSV modulable décrit en 10.9. Les codes de rapport structurés et les slates restent les fondations de ce futur module, mais aucun format officiel partiel n'est livré pendant cette phase.

### Phase 8 — Documents de santé et verrouillage

Travaux :

- détacher les documents des associations et unifier santé/enregistrements dans `horse_documents`;
- permettre plusieurs registres de race et le statut explicite `grade` sans enregistrement;
- rendre les fichiers immuables et hashés;
- créer validations versionnées;
- utiliser le comparateur commun avec un profil santé;
- créer la correction d'identité auditée;
- verrouiller les champs critiques;
- adapter Storage et RLS.

Critères :

- document chargé une seule fois;
- identité du document explicite;
- renommage silencieux impossible;
- correction légitime possible avec invalidation visible.

État S1–S9 : `horse_documents` est maintenant le dépôt canonique indépendant avec fichiers immuables, documents santé ou de race, plusieurs registres et statut `grade`. `horse_document_validations` conserve chaque lecture comme une version immuable liée à un instantané HSP. Le comparateur commun couvre nom, naissance ou année dérivée d'un âge daté, sexe, race, numéro et propriétaire. Une lecture peut constater une concordance ou un écart, mais ne modifie jamais automatiquement la fiche ni ses identifiants. Les champs appuyés par une preuve concordante active sont verrouillés individuellement; les preuves absentes ou en écart ne verrouillent rien. Une autorité d'identité peut utiliser une correction explicite et auditée avec raison, avant/après et invalidation précise des lectures touchées; le personnel d'association ne reçoit pas ce droit global. Les politiques de santé sont versionnées par association et complètement indépendantes des disciplines; les révisions locales sont également séparées du document global. Le calcul S6 combine ces éléments pour une date donnée et retourne un statut, une autorisation de poursuivre et des raisons structurées par exigence. S7 présente ce résultat dans le centre de conformité, le répertoire et « Mes chevaux », incluant les groupes d'associations par cheval. S8 applique exactement cette décision aux inscriptions et réservations liées à un cheval en utilisant la date du concours, sans bloquer les produits non liés à un cheval. S9 retire la vue et les fonctions historiques : toutes les surfaces utilisent désormais exclusivement les politiques versionnées et la conformité centrale.

### Phase 9 — Politiques et conformité de santé

Travaux :

- créer politiques d'association;
- créer révisions facultatives;
- centraliser le calcul de conformité;
- utiliser la date du concours;
- afficher les associations à jour et à mettre à jour;
- fournir des raisons précises;
- intégrer inscriptions et réservations.

Critères :

- même document, résultats différents selon deux associations;
- discipline sans effet sur la politique;
- recalcul automatique après changement pertinent;
- blocage seulement si la politique le demande.

État S6–S9 : `evaluate_horse_health_compliance()` porte le calcul pur interne, sans droit d'exécution client. `get_horse_health_compliance()` en demeure la façade autorisée : elle résout la politique applicable à la date demandée, sélectionne les meilleures preuves actives pour Coggins, influenza et rhino, applique l'identification et la révision locale, puis retourne `not_required`, `compliant`, `pending_review` ou `non_compliant`. Le Coggins peut être évalué selon une durée glissante ou selon l'année civile du concours. Le mode `warning` ou `blocking` détermine séparément `can_proceed`. `list_horse_health_compliance()` sélectionne seulement les couples cheval-association autorisés pour l'affichage. Le centre de conformité, le répertoire, « Mes chevaux », les notifications, les inscriptions et les réservations consomment tous ce même résultat. Les mutations utilisent `shows.start_date`; un avertissement demeure visible et passable, un blocage est garanti par déclencheur, et une réservation sans cheval n'est pas concernée. Les anciens champs de `organizations`, la vue de compatibilité et les fonctions santé historiques sont supprimés.

### Phase 10 — Automatisations de répertoire

Travaux :

- automatiser l'inscription;
- automatiser cartes de membre et réservations pertinentes;
- propager les relations nécessaires;
- conserver source et audit;
- garantir l'idempotence;
- gérer les répertoires désactivés.

Critère : une action répétée ne crée jamais plusieurs liaisons.

### Phase 11 — Modules dépendants et non-régression

Adapter et tester explicitement :

- programme concours/slates/blocs/classes;
- templates de blocs et de classes ainsi que leurs formulaires de création et modification;
- inscriptions et modifications;
- facturation et paiements;
- stalls et réservations;
- numéros de concurrent, incluant `organization_back_numbers`, `claim_horse_back_number()` et `BackNumbersView.tsx`;
- ShowScore, draws et résultats;
- memberships;
- moteur NRHA;
- exports et rapports officiels, lorsque le module reporté décrit en 10.9 sera entrepris;
- centre de santé.

Critères :

- chaque module utilise les nouvelles clés sans fallback vers l'ancien modèle;
- tous les scénarios du registre ShowScore passent;
- aucun changement fonctionnel `SS-F` n'est livré sans approbation explicite.

### Phase 12 — Validation finale et documentation

Travaux :

- tests SQL des contraintes et RLS;
- tests unitaires du comparateur;
- tests de similarité;
- matrice de conformité santé;
- tests d'admissibilité;
- tests des RPC atomiques;
- tests des workflows React;
- build et tests existants adaptés;
- suppression du code mort;
- mise à jour de tous les documents de contexte.

Critères :

- `npm run build` réussit;
- tests programme et paiements réussissent;
- reset complet reproductible;
- aucune fuite inter-associations;
- aucun ancien nom ou chemin métier ne subsiste;
- documentation et schéma concordent.

## 17. Ordre de livraison

Les phases 0 à 4 forment la fondation et doivent être réalisées sur une branche de refonte cohérente.

Les phases 5 et 6 rendent le répertoire utilisable manuellement et sans doublons.

La phase 7 protège les imports et l'admissibilité existante.

Les phases 8 et 9 forment ensemble le nouveau noyau de santé.

La phase 10 automatise uniquement des opérations déjà stabilisées manuellement.

Les phases 11 et 12 ferment la refonte avant toute nouvelle fonctionnalité dépendante.

## 18. Tests minimaux obligatoires

### Répertoires

- même cheval dans deux disciplines d'une association;
- même cheval dans deux associations;
- retrait d'une liaison sans suppression;
- rattachement répété idempotent;
- discipline désactivée avec historique conservé.

### Permissions

- secrétaire lie une fiche existante;
- secrétaire d'une autre association ne modifie pas l'identité;
- propriétaire gère son cheval;
- utilisateur sans rôle ne parcourt pas le répertoire global;
- données privées non retournées par la recherche.

### Doublons

- numéro identique;
- accents et ponctuation;
- faute de frappe;
- même nom, naissance différente;
- dismissal persistant;
- concurrence de deux créations simultanées.

### Structure du concours

- bloc avec plusieurs classes;
- classes de disciplines différentes dans le même bloc;
- classe avec NRHA + AQR;
- ajout automatique selon la discipline de la classe;
- slate avec contraintes de rapport conservées.

### Externe et admissibilité

- import accepté partiellement;
- import refusé sans modification locale;
- instantané expiré;
- source indisponible;
- identifiants discordants;
- admissibilité expliquée par classe et date;
- moteur NRHA sans régression.

### Santé

- document valable pour APEM et expiré pour AQR;
- document en attente de révision d'une association seulement;
- modification d'identité bloquée;
- correction auditée;
- recalcul à la date du concours;
- aucune dépendance à la discipline.

## 19. Risques et protections

### Portée RLS sous-estimée

Protection : inventaire obligatoire, matrice de rôles et tests SQL avant l'interface.

### Cinquième source de vérité

Protection : les cinq axes ont des rôles distincts; seuls les répertoires déterminent l'appartenance association-discipline.

### Import externe devenu autoritaire

Protection : instantané daté, comparaison visible et acceptation explicite des changements.

### Comparaisons divergentes

Protection : primitive commune, profils par workflow et décisions métier séparées.

### Recherche globale trop intrusive

Protection : rôle requis, résumé minimal, audit et détail protégé par RLS.

### Secrétaire modifiant une identité partagée

Protection : permission de rattachement séparée de la correction d'identité.

### Statut santé périmé

Protection : conformité calculée avec une date, jamais booléen permanent.

### Régression NRHA ou ShowScore

Protection : modules nommés explicitement dans les phases et tests obligatoires.

### Deux chemins applicatifs recréés

Protection : RPC uniques, contraintes, suppression des fallbacks et aucun alias métier final.

## 20. Résultat attendu

À la fin de la refonte :

- chaque contact et cheval possède une identité HSP unique;
- les associations classent ces fiches dans leurs répertoires disciplinaires;
- les classes portent leur discipline et leurs organismes de règles;
- les blocs demeurent de simples objets d'horaire;
- les imports externes facilitent la saisie et l'admissibilité sans contrôler les fiches;
- les documents de santé sont réutilisables et liés à une identité validée;
- chaque association obtient son propre résultat de conformité;
- les recherches sont rapides, limitées et résistantes aux doublons;
- les permissions sont explicites et testées;
- la terminologie de la base correspond enfin à celle du produit.
