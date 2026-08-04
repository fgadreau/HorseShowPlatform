# Registre d'impact de la refonte sur ShowScore

## Objectif

La refonte peut modifier le schéma et le code d'intégration de ShowScore, mais elle ne doit pas modifier son fonctionnement observable sans décision produit explicite.

Il faut distinguer :

- **impact technique** : table, clé étrangère, requête, adaptateur, RPC ou policy à mettre à jour;
- **impact fonctionnel** : changement visible dans la préparation, le draw, le scoring, la publication ou les résultats.

Un impact technique est attendu pendant la reconstruction. Un impact fonctionnel n'est pas accepté par défaut.

Chaque modification à partir de F2 doit être marquée :

- `SS-0` : aucun impact ShowScore;
- `SS-T` : adaptation technique, comportement identique;
- `SS-F` : changement fonctionnel potentiel, à faire approuver avant l'implémentation.

## Contrat fonctionnel à préserver

Après la refonte, ShowScore doit toujours pouvoir :

1. charger les mêmes associations, concours, journées et blocs à scorer;
2. préparer un bloc avec son pattern, son juge ou panel, son arène et son ordre;
3. gérer les blocs exécutés concurremment et les passages partagés;
4. produire le draw en regroupant correctement les inscriptions d'un même passage physique;
5. distinguer les inscriptions régulières et tardives comme aujourd'hui;
6. démarrer, scorer, finaliser et republier un passage sans perte de données;
7. reporter un résultat final vers toutes les classes auxquelles le passage était inscrit;
8. conserver le live, les publications publiques, les résultats officiels et les contrôles de visibilité;
9. conserver le fonctionnement spécialisé des warmups payants;
10. conserver les droits des administrateurs, secrétaires, juges, scribes et annonceurs.

## Impacts techniques déjà connus

| Référence | Modification HSP | Impact ShowScore | Résultat fonctionnel exigé |
| --- | --- | --- | --- |
| SS-01 | La table HSP actuelle `classes` devient conceptuellement `blocks`; les vraies classes proviennent des anciennes `divisions` | `SS-T` — le concept ShowScore actuellement nommé `class` doit être alimenté par `blocks` | ShowScore présente toujours un élément à scorer par bloc |
| SS-02 | `entries.division_id` devient `entries.class_id` | `SS-T` — le générateur de passages regroupe les inscriptions par `class.block_id` | Un cheval/cavalier effectue un seul passage pour toutes ses classes compatibles du bloc |
| SS-03 | Pattern et juges appartiennent au bloc | `SS-T` — adaptateurs et setups lisent ces valeurs sur `blocks` | Aucun changement visible dans le setup de scoring |
| SS-04 | Toutes les classes d'un bloc et tous les blocs concurrents doivent partager le même pattern | `SS-T`; `SS-F` seulement pour une ancienne configuration invalide, qui sera maintenant refusée | Les blocs concurrents valides continuent de fonctionner comme avant |
| SS-05 | Les setups, sessions et fonctions ShowScore qui utilisent aujourd'hui un `class_id` pointant vers l'ancien bloc doivent viser `block_id` | `SS-T` — réécriture coordonnée des FK, requêtes, RPC, triggers et RLS | Même cycle de setup, session, scoring et finalisation |
| SS-06 | Visibilité du bloc, ouverture de la classe et publication des résultats deviennent séparées | `SS-T` — les helpers publics ShowScore doivent utiliser l'état approprié | Aucun résultat caché ne devient public; le live et l'horaire conservent leurs règles |
| SS-07 | `entry_results.division_id` devient `entry_results.class_id` | `SS-T` — réécriture de `sync_entry_results_for_scored_run()` et `sync_entry_result_for_block_run_link()` | Un score final alimente toutes les classes concernées, sans doublon ni oubli |
| SS-08 | Le warmup payant devient un bloc `paid_warmup` | `SS-T` — préserver les tables et écrans spécialisés derrière ce type | Même réservation, horaire et affichage de warmup |
| SS-09 | Contacts et chevaux deviennent globaux et sont rattachés par répertoire | `SS-T` — adapter les chargements utilisés pour les noms, numéros et relations | Draw, affichage du cavalier/cheval/propriétaire et dossards identiques |
| SS-10 | Les RLS sont reconstruites | `SS-T` — réécrire et tester les policies ShowScore | Aucun rôle existant ne perd ou ne gagne un accès involontaire |

## Frontière de compatibilité

ShowScore utilise directement plusieurs objets du Supabase HSP. Il n'est donc pas réaliste de promettre qu'aucun fichier ShowScore ou qu'aucune requête ne changera lorsque `classes` et `divisions` sont reconstruits.

Le vocabulaire visible de ShowScore est déjà correct : l'interface présente les éléments de l'horaire et du scoring comme des **blocs**. Le décalage est interne seulement. Des types et fonctions comme `ShowScoreClass`, `toShowScoreClass()` et `buildShowScoreRunsForClass()`, la table HSP actuelle `classes`, ainsi que plusieurs colonnes `show_score_*.class_id`, désignent en réalité le bloc montré à l'utilisateur. La refonte doit corriger ces noms et références techniques sans renommer l'interface ni changer son fonctionnement.

Dans ce contexte, une carte ShowScore comme « Cheval novice » demeure un bloc de scoring. Les vraies classes offertes à l'inscription restent ses enfants et servent à répartir admissibilité, frais, organismes et résultats.

La cible est plutôt :

- aucun changement volontaire de workflow ou d'interface ShowScore;
- mise à jour technique coordonnée de ses requêtes et de la couche de compatibilité;
- pas d'ancien alias `division` conservé uniquement pour masquer une migration incomplète;
- tests de contrat avant et après chaque lot touchant les objets `show_score_*`, les passages, les résultats ou la visibilité publique.

Les clés JSON historiques `divisionId`, `divisionIds` et `divisionNames` demeurent provisoirement dans le payload technique envoyé à ShowScore. Elles contiennent désormais les identifiants et noms des vraies classes HSP. Ce maintien est une frontière de compatibilité `SS-T`, pas un concept métier exposé ni une colonne du nouveau schéma; leur retrait exige une version coordonnée du client ShowScore.

## Validation obligatoire

Avant de fermer F9, exécuter au minimum les scénarios suivants sur le nouveau seed :

- un bloc, plusieurs classes, un passage partagé;
- deux blocs concurrents avec le même pattern;
- refus de deux blocs concurrents avec des patterns différents;
- draw avec passages réguliers et tardifs;
- session juge et session scribe;
- score final propagé à plusieurs classes;
- publication live puis publication officielle;
- résultats publics cachés puis publiés;
- warmup payant;
- utilisateur sans rôle ShowScore refusé par RLS.

Toute différence observée doit être inscrite dans ce registre avec son étiquette `SS-0`, `SS-T` ou `SS-F` avant d'être corrigée ou acceptée.

## Journal des lots de reconstruction

| Lot | Étiquette | Impact vérifié |
| --- | --- | --- |
| `20260801000100_foundation_catalogs_directories_slates.sql` | `SS-0` | Ajoute disciplines, répertoires, organismes, slates et échéances; ne modifie aucun objet `show_score_*`, passage, draw ou résultat; reset local complet validé |
| `20260801000200_blocks_classes_core_rebuild.sql` | `SS-T` | Reconstruit les vraies tables `blocks/classes`, renomme les clés ShowScore vers `block_id`, impose le pattern commun, rattache les juges et warmups au bloc et propage un passage vers plusieurs classes; reset, linter et tests SQL réussis |
| `20260801000300_directory_authority_identity_access.sql` | `SS-T` | Rend les répertoires seuls responsables du rattachement association-contact-cheval, protège l'identité globale et fait valider les dossards par ces répertoires; noms, chevaux, cavaliers et numéros visibles dans ShowScore demeurent inchangés |
| `20260801000400_remove_legacy_identity_organization_paths.sql` | `SS-T` | Supprime physiquement les anciennes tables de liens et les `organization_id` des identités globales; les chargements passent déjà par les répertoires et aucune donnée de bloc, passage, scoring ou résultat ShowScore n'est modifiée |
| `20260801000500_global_identity_table_privileges.sql` | `SS-T` | Accorde les privilèges SQL nécessaires pour laisser les policies RLS arbitrer les fiches globales et leurs relations; aucun rôle ShowScore, passage, setup ou résultat n'est modifié |
| `20260801000600_identity_similarity_search.sql` | `SS-0` | Ajoute uniquement la recherche anti-doublon des identités, son audit et la mémorisation des faux rapprochements; aucun objet, payload, passage ou rôle ShowScore n'est modifié |
| `20260801000700_authenticated_application_table_privileges.sql` | `SS-T` | Rétablit les privilèges SQL requis pour que les policies RLS puissent arbitrer les tables HSP et ShowScore; les rôles et décisions d'accès restent ceux des policies existantes |
| `20260801000800_showscore_block_function_alignment.sql` | `SS-T` | Réaligne les helpers de droits, visibilité, scoresheets et timing sur `blocks`, `block_id`, `schedule_is_public` et `results_are_public`; signatures RPC et clés de réponse historiques inchangées |
| `20260801000900_external_data_sources_catalog.sql` | `SS-0` | Sépare le catalogue des sources externes des associations et organismes, avec des connecteurs planifiés extensibles; aucun objet ShowScore, passage, résultat ou payload n'est modifié |
| `20260801001000_external_credential_issuers_identifiers.sql` | `SS-0` | Remplace les anciennes adhésions externes par des émetteurs, identifiants typés, exigences datées et preuves immuables; aucun objet de scoring, passage, résultat, rôle ou payload ShowScore n'est modifié |
| `20260801001100_class_governing_body_metadata.sql` | `SS-0` | Structure le code de rapport et le profil d'admissibilité par liaison classe-organisme et modèle-organisme; les blocs, passages, setups, résultats et payloads ShowScore demeurent inchangés |
| `20260801001200_team_eligibility_decisions.sql` | `SS-0` | Ajoute les preuves d'admissibilité typées, décisions HSP, TTL, politiques de panne et RLS; ne modifie aucun objet, fonction, passage, résultat ou payload ShowScore |
| Comparateur commun I3 | `SS-0` | Centralise les concordances d'identité et les raisons d'écart pour l'anti-doublon, NRHA et les futurs documents; ne modifie aucun bloc, passage, session, résultat ou rôle ShowScore |
| Imports assistés I4 | `SS-0` | Ajoute les propositions champ par champ, l'acceptation explicite et la preuve d'import aux fiches contact/cheval; aucun objet, adaptateur, payload, rôle ou comportement ShowScore n'est modifié |
| Organismes liés aux classes I5 | `SS-0` | Remplace les tableaux de codes applicatifs par les FK et métadonnées des vraies classes et de leurs modèles; ShowScore continue de scorer le bloc sans lire ni modifier ces liaisons |
| Moteur d'admissibilité I6 | `SS-0` | Évalue cheval, cavalier, vraie classe, organisme et date avant l'inscription; les codes de rapport viennent des FK de classe et aucune donnée de scoring ou de passage ShowScore n'est lue ou modifiée |
| Décision de report I7 | `SS-0` | Le futur module de rapports PDF/CSV lira les résultats synchronisés sans les modifier; aucun export partiel, objet ShowScore, payload, session ou workflow n'est ajouté maintenant |
| Validation du Bloc 2 I8 | `SS-0` | Reset 0001–0088, build, tests draw/payout/admissibilité et contrat SQL ShowScore réussis; aucune différence visible de préparation, passage, scoring ou publication constatée |
| Documents indépendants S1 / `20260801001300` | `SS-0` | Unifie les fichiers santé et enregistrements de race sous le cheval, ajoute le statut grade et sécurise le stockage; aucun objet, payload, passage, score ou workflow ShowScore n'est modifié |
| Identification documentaire S2 / `20260801001400` | `SS-0` | Ajoute des lectures d'identité versionnées, leur comparateur et leur interface sur la fiche cheval; aucun objet, payload, passage, score, rôle ou workflow ShowScore n'est lu ou modifié |
| Verrouillage d'identité S3 / `20260801001500` | `SS-0` | Protège les champs et numéros appuyés par une validation documentaire active; ne lit ni ne modifie aucun bloc, passage, rôle, score, résultat, payload ou écran ShowScore |
| Correction auditée S4 / `20260801001600` | `SS-0` | Ajoute une correction transactionnelle réservée aux autorités d'identité, son journal avant/après et l'invalidation des lectures documentaires touchées; aucun objet, fonction, rôle, passage, score, résultat, payload ou écran ShowScore n'est lu ou modifié |
| Politiques de santé S5 / `20260801001700` | `SS-0` | Ajoute les exigences de santé versionnées et les révisions documentaires propres à chaque association, indépendamment des disciplines; aucun objet, fonction, rôle, passage, score, résultat, payload ou écran ShowScore n'est lu ou modifié |
| Calcul de conformité S6 / `20260801001800` | `SS-0` | Calcule à la demande la conformité santé d'un cheval pour une association et une date à partir des documents, validations, révisions et politiques; aucun objet, fonction, rôle, passage, score, résultat, payload ou écran ShowScore n'est lu ou modifié |
| Présentation de conformité S7 / `20260801001900` | `SS-0` | Groupe les résultats autorisés par cheval et association et les affiche dans le centre de conformité, le répertoire et « Mes chevaux »; aucun objet, fonction, rôle, passage, score, résultat, payload ou écran ShowScore n'est lu ou modifié |
| Conformité des inscriptions et réservations S8 / `20260801002000` | `SS-0` | Contrôle la santé avant les mutations avec la date du concours et la politique warning/blocking; les inscriptions acceptées gardent le même schéma et les mêmes identifiants, sans modifier setup, passage, score, résultat, publication ou écran ShowScore |
| Validation et nettoyage santé S9 / `20260801002100` | `SS-0` | Supprime les anciens champs, vue et fonctions santé, ajoute le choix Coggins durée/année civile et valide le contrat ShowScore existant; aucun setup, passage, score, résultat, publication, payload ou écran ShowScore n'est modifié |
| Interface programme F8 | `SS-T` | Ajoute la gestion des slates, le choix de discipline des vraies classes et l'édition des groupes concurrents; les juges sont synchronisés vers `block_judge_assignments`, mais `judge_display_name` et les clés JSON historiques utilisées par ShowScore demeurent inchangés |
| Interface répertoires F6 | `SS-0` | Ajoute le choix de disciplines à la création et les rattachements/retraits de répertoire; la fiche globale, ses identifiants et les données consommées par ShowScore restent inchangés |
| Interface anti-doublon F7 | `SS-0` | Interrompt la création d'un contact ou cheval semblable pour proposer sa fiche existante; les données finales consommées par ShowScore conservent exactement les mêmes formes et identifiants |
| Services et chargement F5 | `SS-T` | Limite les requêtes à l'association et à ses concours/répertoires avant de construire le même contexte applicatif; les adaptateurs et payloads ShowScore ne changent pas |
| Validation intégrée F9 | `SS-T` | Le scénario complet classe → inscription → setup de bloc → passage scoré → résultat → payout réussit; les droits inter-associations refusent les données privées et aucune différence fonctionnelle ShowScore n'a été observée |

## Clôture F9

Le reset local complet des migrations 0001 à 0084 et du seed réussit. Les 11 tests SQL passent, notamment les passages partagés, les patterns concurrents, les rôles ShowScore, la visibilité publique, les warmups, la propagation des résultats et le scénario intégré `bloc1_integrated_workflows.sql`.

Le build, les tests de draw et de payout réussissent également. Aucun impact `SS-F` n'a été constaté. Les seules compatibilités volontaires restantes sont les signatures RPC et clés JSON historiques déjà documentées; elles ne changent ni l'interface ni le workflow observable de ShowScore.

### Compatibilité temporaire explicite du lot `20260801000200`

La RPC publique `record_app_event()` conserve provisoirement son paramètre nommé `target_class_id` afin de ne pas casser un client ShowScore non encore adapté. La valeur est désormais écrite dans `app_events.block_id`. Ce nom de paramètre doit être remplacé de façon coordonnée avec le client ShowScore; il ne constitue pas un retour du concept « division » ni une vraie classe HSP.
