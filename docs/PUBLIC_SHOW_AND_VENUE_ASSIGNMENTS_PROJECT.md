# Page publique, sites et assignations de stalles et campings

Statut : projet cadré et reporté  
Dernière mise à jour : 14 novembre 2026

## Objectif

Faire de la page publique du concours le point d'entrée des participants et ajouter à HSP un système simple de plans interactifs pour assigner les stalles, les tack stalls et les terrains de camping.

Le premier site visé est le Complexe équestre de Bécancour. Le projet doit s'intégrer aux réservations et à la facturation existantes sans recréer les fonctions sportives de ShowScore.

## Périmètre confirmé

### Page publique du concours

La page publique doit présenter seulement les sections disponibles pour le concours :

- le Showbill HSP affiché à l'écran;
- une action pour imprimer le Showbill ou l'enregistrer en PDF depuis le navigateur, sans conserver de PDF dans HSP;
- les liens d'inscription et de réservation;
- le plan général du site, les stall charts et le plan du camping;
- les règlements du complexe et les documents importants;
- un lien clair vers le ShowScore public du concours;
- les informations pratiques et les contacts.

HSP ne doit pas afficher les disponibilités ou les quantités restantes sur cette page.

Pour cette phase, les draws, résultats, scoresheets et autres données sportives publiques restent uniquement dans ShowScore. HSP fournit le lien vers ShowScore et ne duplique pas ces écrans.

### Sites et plans

Les sites sont gérés par les platform admins. Un site peut comporter plusieurs plans : plan général, bâtiments, écuries, tentes et camping.

Les plans doivent représenter les emplacements assignables ainsi que les éléments non assignables utiles à l'orientation, par exemple :

- bâtiments et manèges;
- entrées et stationnements;
- corridors, douches et salles;
- blocs et numéros de stalles;
- terrains de camping;
- zones réservées ou indisponibles.

Une association choisit un site HSP connu lorsqu'elle configure son concours. Elle peut alors utiliser les plans interactifs pour les assignations. Si le site n'existe pas encore dans HSP, elle conserve la possibilité de publier ses plans en PDF.

La première version ne comprend pas d'éditeur de dessin sophistiqué. Les plans fournis sont transformés en SVG avec une couche d'emplacements cliquables et des zones de texte dynamiques.

### Assignation depuis le plan

Le secrétariat part du plan :

1. Cliquer sur une stalle, un tack stall ou un terrain de camping.
2. Rechercher progressivement par agent, propriétaire ou cheval.
3. Voir en priorité l'agent ou le propriétaire, avec le cheval lorsqu'il est connu.
4. Voir le produit réservé, le type d'emplacement attendu, la quantité restant à assigner et le souhait de proximité.
5. Sélectionner la réservation pour assigner l'emplacement.

Le type d'emplacement doit être compatible avec l'option achetée. Par exemple, les stalles de l'écurie 203 à Bécancour doivent correspondre à l'option commerciale « Écurie principale ». Une éventuelle assignation forcée devra être signalée et auditée.

### Modèle d'assignation

HSP crée déjà :

- une ligne par cheval pour une stalle ordinaire;
- une ligne par terrain de camping réservé;
- une ligne pouvant avoir une quantité supérieure à un pour des tack stalls payés par un seul contact;
- dans le mode de facturation partagée, une ligne d'inventaire pour les tack stalls et des lignes distinctes servant uniquement à répartir la facturation entre les chevaux.

Une simple colonne de numéro sur `stall_bookings` ne couvre donc pas toutes les situations. La solution retenue est une petite table enfant contenant une ligne par emplacement physique assigné :

- une stalle de cheval produit normalement une assignation;
- trois tack stalls produisent trois assignations, même s'ils proviennent d'une seule ligne de réservation;
- un terrain de camping produit normalement une assignation.

Les réservations, quantités, prix et comptes demeurent la source de vérité financière. Les assignations ne doivent pas modifier la facturation.

### Publication des assignations

Les assignations en cours sont privées et visibles seulement par les personnes autorisées de l'association.

Le public et les membres ne voient rien tant qu'une secrétaire ou un admin n'a pas publié les assignations. La publication crée une version cohérente du plan complet. Les noms sont publics sur cette version publiée, conformément au fonctionnement habituel des stall charts.

Après une publication, les changements de travail ne doivent pas modifier immédiatement la version publique. HSP indique qu'il existe des modifications non publiées et la secrétaire utilise « Mettre à jour la publication » lorsqu'elle est prête.

Il est recommandé de pouvoir publier séparément les stalles et le camping. Cette décision restera à confirmer au moment de l'implémentation.

### Souhaits de proximité

Le formulaire de réservation doit permettre d'indiquer près de qui la personne souhaite être placée. Cette information est visible dans le panneau d'assignation pour les stalles et le camping.

La première version peut afficher et mettre en évidence ce souhait sans tenter de résoudre automatiquement toutes les proximités.

### Reprise du concours précédent

HSP peut proposer les assignations du dernier concours de la même association au même site lorsque les réservations actuelles correspondent.

La reprise est assistée et non automatique :

- correspondance exacte du cheval en priorité pour une stalle;
- correspondance du contact responsable pour le camping et les tack stalls;
- vérification du type d'emplacement et de la disponibilité physique;
- aperçu des correspondances, incompatibilités et conflits;
- action explicite « Appliquer les suggestions compatibles »;
- ajustements manuels avant publication.

## Plan pilote de Bécancour

Source de référence : [Plan des stalles Bécancour juin 1 2026 | Stalls plan CEB](https://docs.google.com/spreadsheets/d/12szZb-WIEYwVs-iIv4AkQDWg2QGnB8kbIO0-hYEUlcA/edit)

Le classeur comprend actuellement :

- Écurie 201 Stable;
- Écurie 202 Stable;
- Écurie 203 Stable;
- Tente 301 Tent;
- Tente 302 Tent;
- Tente 400-500 Tent;
- Tente 600 Tent;
- Camping.

La disposition du classeur est adaptée à une conversion en SVG : les numéros sont fixes, les noms occupent des zones voisines, et les corridors, douches et locaux peuvent demeurer non cliquables.

## Intégration proposée dans HSP

### Administration plateforme

Ajouter une section dédiée « Sites et plans » pour :

- créer et modifier un site;
- téléverser ou remplacer les sources de plans;
- gérer des versions de plans;
- définir les zones et les emplacements physiques;
- activer ou désactiver un plan.

### Gestion du concours

Ajouter une page « Plans et assignations » dans le contexte du concours, à proximité de la gestion des réservations. Sur ordinateur, la vue principale comprend le plan et un panneau latéral de recherche et d'assignation. Une vue par liste ou par zone doit rester disponible sur les petits écrans.

### Espace membre et page publique

Avant publication, aucune assignation n'est visible. Après publication :

- le stall chart public affiche les noms;
- le membre retrouve ses numéros dans « Mes réservations »;
- une action « Voir sur le plan » peut mettre en évidence ses emplacements;
- le plan public n'affiche aucun inventaire restant.

## Modèle de données indicatif

Les noms définitifs seront validés au début de l'implémentation. Le modèle minimal devrait couvrir :

- les sites;
- les versions de plans;
- les zones et emplacements physiques avec identifiants stables;
- le site et la version de plan choisis par un concours;
- la compatibilité entre options réservables et types ou zones physiques;
- les exceptions propres au concours, comme un emplacement indisponible;
- les assignations de travail;
- les publications d'assignations et leur contenu figé;
- les documents publics du concours autres que le Showbill.

Les politiques Supabase doivent séparer clairement les droits des platform admins, des admins et secrétaires d'association, des membres liés aux réservations et du public anonyme.

## Fondations existantes à réutiliser

- `src/features/shows/PublicShowPage.tsx` : page publique actuelle.
- `src/features/classes/ShowbillExport.tsx` : Showbill actuel et impression à la demande.
- `src/features/dashboard/StallsViews.tsx` : options, réservations, quantités et facturation.
- `src/features/platformAdmin/PlatformAdminView.tsx` : point d'entrée actuel des platform admins.
- `src/services/supabaseServices.ts` : services publics, réservations et chargement du contexte.
- Le bucket Supabase Storage `show-documents` existe déjà, mais ses métadonnées et politiques devront être adaptées avant la publication de documents publics.

## Phases proposées

1. Modèle des sites, plans, emplacements, compatibilités et droits.
2. Administration minimale des sites et conversion des plans de Bécancour.
3. Assignation privée des stalles, tack stalls et campings depuis le plan.
4. Publication versionnée et stall charts publics avec les noms.
5. Affichage des numéros dans les réservations des membres.
6. Évolution de la page publique et lien ShowScore.
7. Souhaits de proximité et reprise assistée du concours précédent.
8. Tests de sécurité, concurrence, impression, ordinateur et mobile.

## Estimation conservée

Avec des plans transformés en SVG et sans éditeur graphique général :

- pilote Bécancour utilisable : environ 3 à 5 semaines de développement effectif;
- généralisation, reprise du concours précédent et finition : environ 1 à 3 semaines supplémentaires.

L'estimation devra être révisée selon la qualité et le nombre de plans sources disponibles au démarrage.

## Décisions à reprendre au démarrage

- Publier les stalles et le camping séparément ou avec une seule action.
- Déterminer le libellé public affiché dans chaque case : agent, propriétaire, cheval ou combinaison selon le type d'emplacement.
- Définir précisément le droit de forcer une incompatibilité entre une réservation et un emplacement.
- Déterminer si les documents de sites inconnus sont publiés par concours ou réutilisables par l'association.
- Confirmer le comportement de la version publique lorsqu'une assignation publiée doit être corrigée en urgence.

