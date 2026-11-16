# Planification des pauses dans les journées et les draws

Statut : prochain projet, cadrage établi le 16 novembre 2026. L’utilisateur souhaite examiner le plan avant de décider du lancement. Aucune implémentation ni migration n’est réalisée à cette étape.

## Besoin demandé

Permettre au secrétariat de planifier une pause de lunch d’une durée configurable en minutes :

- Dans une journée de concours.
- Entre deux classes ou blocs du programme.
- À l’intérieur d’un draw, entre deux passages désignés.

Exemples : pause de 30 minutes à 12 h dans l’aréna A; pause de 45 minutes après une classe et avant la suivante; pause de 20 minutes entre les passages 25 et 26 d’un bloc.

## Base existante vérifiée

- `src/types/domain.ts` contient déjà le type de bloc `break`, une journée, une aréna, `scheduled_time`, `estimated_duration`, `sort_order` et les modes de début d’horaire.
- `supabase/migrations/20260801002600_explicit_block_schedule_dependencies.sql` gère `follows_block_id`, avec contrôle des dépendances entre blocs et détection des cycles.
- `src/features/classes/ClassesView.tsx` distingue les blocs de compétition des événements du programme et permet de gérer leur ordre.
- `src/features/classes/classUtils.tsx` ordonne les blocs et présente les modes heure fixe, à la suite d’un bloc et heure indéfinie.
- `src/features/controlRoom/ControlRoomView.tsx` affiche déjà les blocs de type pause et leur durée estimée.

Ces éléments ne constituent pas encore un parcours complet de pause de lunch, ni une insertion entre deux passages. La propagation de durées et l’affichage dans chaque sortie devront être vérifiés et complétés, sans présumer qu’un calcul horaire complet existe déjà.

## Comportement proposé

Dans l’horaire et le poste de contrôle, proposer « Ajouter une pause » avec :

- Un libellé, par défaut « Pause lunch », modifiable pour une autre pause.
- Une durée en minutes, strictement positive.
- La journée et l’aréna concernées.
- Un placement : heure fixe, après un bloc ou une classe distincte, ou entre deux passages d’un draw.
- La visibilité souhaitée, en respectant les règles de publication de l’horaire et du draw.

Permettre la modification, le déplacement et la suppression aux membres du personnel autorisés, avec historique des changements significatifs. Les compétiteurs consultent les pauses publiées.

## Lot 1 Pauses dans la journée et entre les blocs

Réutiliser le bloc `break` pour les pauses situées dans le programme de la journée. Ajouter une saisie structurée des minutes plutôt qu’un texte libre comme seule source du calcul.

Pour une pause après un bloc, relier la pause au bloc précédent et le bloc suivant à la pause lorsque l’enchaînement est pertinent. Prévisualiser cet effet avant confirmation. Ne pas remplacer arbitrairement les dépendances déjà configurées.

Pour une pause à heure fixe, conserver une heure locale interprétée dans le fuseau du concours. Si la compétition déborde sur cette heure, signaler le conflit au secrétariat; ne pas interrompre automatiquement un passage en cours.

Valider les journées, arénas, durées, permissions et dépendances côté serveur. Éviter les cycles et les liens vers un autre concours ou une autre journée.

## Lot 2 Pauses à l’intérieur d’un draw

Créer une structure dédiée aux interruptions internes, rattachée au bloc et à sa version de draw. Une pause n’est ni une inscription ni un concurrent.

Proposition de données : identifiant, bloc, libellé, durée en minutes, référence du passage d’ancrage, côté avant ou après, version de draw, ordre d’affichage et informations d’audit. Les noms de table et de RPC seront arrêtés à l’implémentation.

Présenter à l’utilisateur « après le passage 25, avant le passage 26 », mais conserver une référence stable au passage et au draw en base. Un numéro affiché seul ne suffit pas lorsque le draw est régénéré ou que des inscriptions tardives sont ajoutées.

Afficher une ligne « Pause lunch — 20 minutes » entre les passages, sans modifier leurs numéros ni leur identité. Une modification du draw qui rend l’ancrage ambigu doit demander un repositionnement avant publication.

Traiter explicitement les passages négatifs ou tardifs, les scratches et la suppression du passage servant d’ancrage. Ne pas déplacer silencieusement la pause vers un autre concurrent.

## Classes concurrentes

Dans HSP, plusieurs classes peuvent partager un bloc ou un passage. Une pause physique dans une aréna concerne alors l’ensemble du passage et des classes simultanées.

Autoriser naturellement la pause entre deux blocs successifs. Pour deux classes dans un même bloc concurrent, empêcher un placement contradictoire et expliquer qu’il faut choisir une frontière réelle de passages ou modifier le programme. Le sens exact de « entre deux classes » sera confirmé avec l’utilisateur sur un exemple de son horaire avant le développement.

## Lot 3 Durées et diffusion

Intégrer les minutes de pause aux estimations de fin du bloc et de début des éléments suivants, là où les durées des passages sont disponibles. Distinguer les heures prévues des heures réelles. Préserver les heures fixes et signaler leurs conflits au lieu de les décaler silencieusement.

Vérifier et adapter :

- L’horaire de l’administrateur et du compétiteur.
- Le poste de contrôle.
- Les draws publiés, les impressions et les PDF.
- Les affichages publics déjà activés pour le concours.
- Les intégrations ShowScore qui consomment ces informations.

Une pause privée ne doit pas apparaître dans une sortie publique. Si un draw déjà publié est modifié, suivre la version et le processus de republication existants.

L’exécution en direct d’une pause avec compte à rebours, notification ou reprise automatique constitue une extension à décider séparément. Le besoin initial porte sur la planification et l’affichage.

## Lot 4 Qualification

Tester les cas suivants :

- Pause de 30 minutes dans une journée et une aréna précises.
- Pause entre deux blocs, avec conservation de l’ordre et absence de cycle.
- Pause entre deux passages, sans renumérotation ni changement d’inscription.
- Modification de durée, déplacement et suppression.
- Classes concurrentes et plusieurs arénas.
- Draw régénéré, inscription tardive, scratch et ancrage supprimé.
- Horaire fixe en conflit et durée de compétition inconnue.
- Écrans français et anglais, téléphone, impression et PDF.
- Isolation des associations, permissions du secrétariat et visibilité publique.

La recette doit montrer que la durée est comptée une seule fois et que les participants voient la même pause dans l’horaire et le draw publiés.

## Ordre de réalisation proposé

1. Valider trois exemples concrets de placement avec l’utilisateur, dont un draw concurrent.
2. Livrer le formulaire et les pauses entre blocs avec durée structurée.
3. Ajouter les pauses à l’intérieur des draws et leurs règles de version.
4. Harmoniser les calculs, la publication et les sorties.
5. Qualifier en préproduction avant toute mise en service.

Décisions restant à prendre : durée par défaut, fenêtre de modification d’un draw publié, règle de repositionnement après scratch et nécessité d’un suivi en direct. Ces décisions ne bloquent pas la conservation de ce plan sur GitHub.
