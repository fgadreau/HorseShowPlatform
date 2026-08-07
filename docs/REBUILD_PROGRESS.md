# Suivi de la refonte HSP

## Situation actuelle

**Les Blocs 1 — Fondations et 3 — Documents et conformité de santé sont terminés et validés. Le Bloc 2 est validé pour I1 à I6 et I8; I7 demeure volontairement reporté jusqu'à la conception du module complet de rapports. La prochaine étape est la fermeture générale de la refonte et la préparation du déploiement.**

La PROD demeure inchangée. Le schéma complet a été déployé sur le projet
Supabase PREPROD vide après un reset local et un dry-run réussis; aucune donnée
de production n'y a été copiée. La chaîne canonique compte maintenant 100
migrations : `0001–0076`, trois migrations ShowScore datées, puis les 21 lots du
chantier datés du 1er août 2026.

Les références courtes `0077–0097` conservées dans le journal historique
ci-dessous désignent ces 21 lots dans leur ordre de conception. Leurs fichiers
canoniques portent désormais les versions `20260801000100–20260801002100` afin
de les ordonner après les migrations ShowScore déjà présentes en PROD.

Les changements sont également suivis dans `SHOWSCORE_REBUILD_IMPACT_REGISTER.md` : les adaptations techniques sont permises, mais aucun changement fonctionnel ShowScore n'est implicite.

## Légende

- ✅ Terminé et validé
- 🟡 En cours
- ⏸️ Reporté volontairement
- ⬜ À faire
- ⛔ Bloqué

## Bloc 1 — Fondations

Objectif : reconstruire les identités, répertoires, permissions et le vrai modèle concours/slate/bloc/classe.

| Étape | État | Résultat attendu |
| --- | --- | --- |
| F0. Décisions d'architecture | ✅ | Contacts et chevaux indépendants, répertoire association-discipline, bloc distinct de classe, classe porte discipline et organismes |
| F1. Inventaire technique bloc/classe/templates | ✅ | Revue Claude intégrée; dossards recensés et cinq décisions produit tranchées |
| F2. Schéma SQL cible | ✅ | Lots 0077 à 0084 validés : catalogues, répertoires, concours, autorité, privilèges, recherche globale sécurisée et fonctions ShowScore alignées; anciens chemins d'association supprimés physiquement |
| F3. Remise à zéro et nouveau seed | ✅ | Reset reproductible; seed canonique avec Reining, Gymkhana et Performance, ainsi qu'un contact et un cheval réellement partagés entre plusieurs répertoires |
| F4. RLS et permissions | ✅ | Staff autorisé à rattacher/lire sans acquérir l'identité; propriétaire/agent/plateforme conservent l'autorité globale; retraits indépendants testés et privilèges SQL alignés sur les policies |
| F5. Services et chargement ciblé | ✅ | Le contexte est limité à l'association active; contacts et chevaux viennent de ses répertoires, puis seules leurs relations, références et documents sont chargés; les tables concours/résultats sont filtrées côté base |
| F6. Interface des répertoires | ✅ | Recherche d'abord; choix d'un ou plusieurs répertoires à la création; rattachement/retrait par discipline sans supprimer la fiche globale |
| F7. Anti-doublon | ✅ | Contacts et chevaux recherchés globalement avant création; raisons affichées, réutilisation dans les répertoires choisis, identifiants exacts bloquants et faux rapprochements mémorisés; l'écurie est explicitement exclue |
| F8. Programme et templates | ✅ | Slates gérables, blocs rattachables, discipline explicite sur classes et modèles, groupes concurrents éditables, juges structurés au bloc, règles/frais/admissibilité uniquement sur les classes |
| F9. Validation du Bloc 1 | ✅ | Reset complet, 11 tests SQL/RLS, inscription, facture partagée avec réservation, dossard, ShowScore, résultat, payout, build et tests TypeScript réussis |

### Sortie attendue du Bloc 1

- Le mot et le concept produit « division » ont disparu.
- Un bloc regroupe les passages et porte l'horaire, le pattern commun, les juges et, selon le mode choisi, la fermeture des inscriptions.
- Une classe contient les règles, frais, discipline, payout et admissibilité.
- Un contact ou cheval peut être lié à plusieurs répertoires.
- Les créations ne produisent plus de doublons évidents.
- Les permissions sont testées côté base.

## Bloc 2 — Intégrations sportives et données externes

Objectif : conserver les outils NRHA/AQHA et les rapports officiels sans rendre les sources externes propriétaires des fiches HSP.

| Étape | État | Résultat attendu |
| --- | --- | --- |
| I1. Organismes et sources externes | ✅ | Associations HSP, governing bodies, émetteurs d'adhésions et sources techniques séparés; aucun membership n'implique automatiquement un connecteur ou des règlements |
| I2. Identifiants et instantanés | ✅ | Émetteurs explicites, identifiants typés, statuts et dates de validité, preuves immuables et exigences d'association indépendantes de la discipline |
| I3. Comparateur d'identité commun | ✅ | Primitive pure partagée, raisons structurées et profils distincts pour doublons, sources externes et santé; aucune décision métier fusionnée |
| I4. Imports assistés | ✅ | Le connecteur NRHA actif propose les valeurs champ par champ sans écrasement implicite; le même modèle générique est prêt pour AQHA et les futures sources |
| I5. Organismes liés aux classes | ✅ | Classes et modèles utilisent directement les FK; code de rapport et profil d'admissibilité sont indépendants pour chaque organisme, avec scénario NRHA + AQR et RLS validés |
| I6. Moteur d'admissibilité | ✅ | Décision par cheval-cavalier-classe-organisme-date, raisons structurées, preuve externe séparée, cache à TTL et politique de panne configurable |
| I7. Rapports officiels | ⏸️ | Module futur PDF/CSV modulable : classes seules ou regroupées et sélectionnées, validations par organisme et conversion optionnelle des gains selon un taux fourni par l'organisme |
| I8. Validation du Bloc 2 | ✅ | Moteur NRHA, imports, source indisponible et instantanés expirés testés sans régression; le module de rapports reporté est exclu de cette fermeture |

### Sortie attendue du Bloc 2

- Une API externe demeure un outil d'aide et de vérification.
- Les valeurs importées sont acceptées explicitement.
- L'admissibilité est évaluée pendant l'inscription.
- Les codes NRHA/AQHA en dur sont remplacés par des références structurées.
- Une panne externe suit une règle claire et ne corrompt jamais les données HSP.

## Bloc 3 — Documents et conformité de santé

Objectif : charger un document une seule fois, valider l'identité du cheval et calculer sa conformité séparément pour chaque association.

| Étape | État | Résultat attendu |
| --- | --- | --- |
| S1. Documents indépendants | ✅ | Documents santé ou enregistrement liés au cheval, fichiers immuables et aucune association propriétaire; plusieurs registres et statut grade supportés |
| S2. Identification du document | ✅ | Lecture versionnée du nom, naissance/âge, sexe, race, couleur, numéro et propriétaire, comparée à un instantané HSP sans modifier le cheval |
| S3. Verrouillage de l'identité | ✅ | Seuls les champs appuyés par une validation active concordante sont protégés; lectures en écart et champs non utilisés ne bloquent rien |
| S4. Correction auditée | ✅ | Propriétaire/co-propriétaire, agent ou plateforme seulement; raison, avant/après, champs touchés et invalidation versionnée conservés |
| S5. Politiques d'association | ✅ | Coggins par durée ou année civile du concours, influenza, rhino, concordance d'identité, révision locale et comportement warning/blocking configurables et versionnés |
| S6. Calcul de conformité | ✅ | Résultat central par cheval, association et date avec politique, exigences, preuves, raisons et décision warning/blocking |
| S7. Présentation utilisateur | ✅ | Centre de conformité et fiches cheval regroupés en « à jour », « mise à jour requise » et « en attente » par association |
| S8. Inscriptions et réservations | ✅ | La date du concours est utilisée; warning demeure visible et blocking refuse l'inscription ou la réservation liée à un cheval |
| S9. Validation du Bloc 3 | ✅ | Matrice multi-associations, corrections, RLS, suppression des chemins historiques et contrat ShowScore entièrement testés |

### Sortie attendue du Bloc 3

- Le même document peut satisfaire une association et être insuffisant pour une autre.
- La discipline n'influence jamais la politique de santé.
- Le statut est calculé à une date donnée, pas stocké comme booléen permanent.
- Les documents et validations demeurent réutilisables et auditables.

## Fermeture de la refonte

Cette fermeture n'est pas un quatrième chantier. Elle confirme simplement que les trois blocs sont livrés ensemble correctement.

- ✅ Tous les anciens fallbacks santé sont supprimés.
- ✅ Tous les documents de contexte de ce bloc sont mis à jour.
- ✅ Le reset complet est reproductible.
- ✅ `npm run build` réussit.
- ✅ Les tests programme, payouts, RLS, admissibilité et santé réussissent.
- ✅ Aucun ancien nom métier ne demeure dans l'interface ou le schéma final; les seules clés de compatibilité ShowScore sont celles documentées dans son registre.

## Validations du dernier lot

- reset local complet des migrations 0001 à 0084 et du seed;
- tests `foundation_catalogs_directories.sql` réussis;
- tests `blocks_classes_core.sql` réussis, incluant passage partagé, patterns concurrents, propagation des résultats, warmup et RLS;
- linter Supabase sans nouvelle erreur; seul l'avertissement historique de `accept_pending_association_invitations` demeure;
- build de production, programme de test du draw et programme de test des payouts réussis;
- nouveau passage TypeScript/UI validé : bloc limité à horaire, pattern, arène, juges et échéance; frais, admissibilité, dossard et organismes restent sur la classe;
- groupes concurrents créés dans les tables canoniques avec validation obligatoire du jour, de l'arène et du pattern;
- slates créables, modifiables et supprimables dans le programme; un bloc peut être rattaché ou détaché sans effet sur son horaire;
- discipline sélectionnable explicitement sur chaque classe et modèle de classe, puis propagée lors de la création depuis un bloc récurrent;
- édition des groupes concurrents limitée aux blocs du même concours, de la même journée, du même manège et du même patron;
- champ juge du bloc synchronisé dans `block_judge_assignments` tout en conservant `judge_display_name` comme entrée de compatibilité ShowScore;
- aperçu et calcul des inscriptions tardives alignés sur `shows.entry_deadline_mode`, `shows.late_entries_allowed` et `shows.late_entry_fee_percent`;
- chargement AQR des contacts/chevaux via les répertoires et nettoyage sans anciennes colonnes d'association;
- tests SQL `foundation_catalogs_directories.sql`, `blocks_classes_core.sql` et `directory_identity_authority.sql` rejoués après ce passage et réussis;
- test `directory_identity_authority.sql` réussi : anciens chemins absents, partage multi-association, identité protégée, réutilisation sans écrasement, dossard par répertoire et fin de l'autorité temporaire du staff après placement;
- seed multidisciplinaire validé avec Reining, Gymkhana et Performance; une même fiche contact et cheval appartient à plusieurs répertoires;
- interface Répertoire munie de sélecteurs de disciplines à la création et de contrôles d'ajout/retrait sur chaque résultat de recherche;
- suppression d'une liaison testée sans suppression de l'identité globale ni des autres répertoires;
- migration `0081_global_identity_table_privileges.sql` ajoutée afin que les policies RLS, plutôt qu'un refus prématuré de privilège SQL, arbitrent contacts, chevaux, rôles et relations;
- migration `0082_identity_similarity_search.sql` validée : recherche globale réservée au staff, coordonnées humaines masquées entre associations, index trigrammes, audit et tables de faux rapprochements;
- prévention des doublons branchée sur la création manuelle et les imports de contacts/chevaux, y compris la création d'un propriétaire ou agent depuis le formulaire cheval;
- critères humains limités au nom, courriel, téléphone et date de naissance; le nom d'écurie n'est ni envoyé ni comparé;
- numéro d'enregistrement de cheval identique et courriel humain identique traités comme identifiants bloquants plutôt que comme simple score;
- test TypeScript `test:identity` réussi avec les tests draw et payout;
- test SQL `identity_similarity_search.sql` réussi : recherche inter-associations, masquage, tolérance aux fautes, mémorisation, exclusion de l'écurie et refus aux non-staff;
- chargement applicatif ciblé par association : changement d'association recharge son contexte sans conserver les contacts, chevaux, inscriptions, factures ou résultats de l'association précédente;
- identités chargées à partir de `directory_contacts` et `directory_horses`, puis relations, références externes et documents limités aux identifiants utiles;
- tables ShowScore, résultats et payouts limitées aux concours chargés, sans modifier les structures retournées au client;
- migration `0083_authenticated_application_table_privileges.sql` validée : les utilisateurs authentifiés atteignent maintenant les policies RLS des tables centrales sans contourner ces policies;
- migration `0084_showscore_block_function_alignment.sql` validée : helpers de droits, visibilité et timing ShowScore lisent les blocs et leurs nouveaux champs tout en conservant les signatures historiques;
- test `targeted_context_showscore.sql` réussi avec un vrai rôle authentifié d'association;
- test `horse_creator_access.sql` adapté aux répertoires et réussi;
- anciens tests `phase1_rls.sql` et `results_payouts.sql` convertis vers les tables canoniques `blocks/classes` et réussis;
- nouveau test intégré `bloc1_integrated_workflows.sql` réussi : classe, dossard, inscription, facture, box, setup ShowScore, score, résultat et payout parcourus dans une seule transaction;
- le test intégré confirme que l'inscription et la réservation du même concours rejoignent la même facture brouillon et qu'un utilisateur d'une autre association ne voit ni l'inscription, ni les lignes de facture, ni le résultat, ni le payout, ni le dossard;
- signature de faux rapprochement d'un cheval complétée avec le propriétaire proposé afin qu'un rejet ne masque pas une recherche portant une autre identité complète;
- suite SQL complète rejouée après le reset final : 11 tests sur 11 réussis;
- build de production final, `test:identity`, `test:draw`, `test:payout` et `git diff --check` réussis;
- audit du catalogue : zéro ancienne table, colonne d'identité, fonction ou policy;
- migration `0085_external_data_sources_catalog.sql` validée : une source est un canal indépendant, sans association propriétaire, avec type, capacités, configuration non secrète et état opérationnel;
- `external_source_governing_bodies` permet plusieurs sources par organisme et plusieurs organismes par source sans confondre cette liaison avec le sanctionnement d'une classe;
- Cheval Québec et Ontario Equestrian sont catalogués comme OPTS canadiennes; NRHA, AQHA, NSBA et NBHA demeurent d'autres émetteurs possibles sans créer automatiquement de connecteur technique ni de sanctionnement de classe;
- test `external_sources_catalog.sql` réussi : lecture du catalogue par le staff, modification réservée à la plateforme, ajout d'un futur fournisseur et liaison plusieurs-à-plusieurs sans changement de schéma;
- le même test confirme qu'une association peut exiger une adhésion OPTS active à une date donnée, sans rattacher cette exigence à une discipline, une classe ou un connecteur technique;
- chargement TypeScript des sources et de leurs organismes ajouté au contexte ciblé; build et test d'identité réussis après le reset des migrations 0001 à 0085;
- aucune migration distante et aucun déploiement ShowScore.
- migration `0086_external_credential_issuers_identifiers.sql` validée : les anciennes tables ambiguës sont remplacées par `external_credential_issuers`, `contact_external_identifiers`, `horse_external_identifiers`, les exigences d'association et les instantanés externes typés;
- les émetteurs OPTS portent leur pays et leur province ou territoire; ajouter une OPTS comme Alberta Equestrian consiste à ajouter une ligne, pas une migration;
- un groupe d'exigences `opts` avec la règle `at_least_one` permet à l'association d'accepter plusieurs OPTS sans exiger toutes leurs adhésions simultanément;
- les exigences `active_on_reference_date` imposent un statut actif et des dates couvrant la date du concours; une simple valeur présente ne suffit pas;
- les vérifications NRHA existantes créent une preuve dans `external_data_snapshots`, reliée au contact ou au cheval, tout en conservant le comportement actuel des formulaires;
- reset local complet des migrations 0001 à 0086 et du seed réussi; tests OPTS/sources, fondations, parcours intégré Bloc 1 et ShowScore ciblé réussis;
- build de production réussi après le remplacement du vocabulaire applicatif par émetteurs, identifiants et exigences externes;
- le lot 0086 est classé `SS-0` : aucun objet de scoring, passage, résultat ou payload ShowScore n'est modifié.
- `identityComparison.ts` retourne maintenant un verdict, un score et les preuves structurées par champ (`exact`, `similar`, `different`, `missing`) tout en conservant les raisons historiques de l'anti-doublon;
- profils disponibles : doublon contact, doublon cheval, concordance externe contact, concordance externe cheval et identité de document de santé;
- normalisation commune des noms, courriels, téléphones, dates, sexes et identifiants; les adaptateurs NRHA ne maintiennent plus leurs propres comparateurs parallèles;
- validations NRHA contact et cheval exigent maintenant à la fois la confirmation de la source et un verdict local `match`; les différences sont présentées avec les mêmes raisons structurées;
- le résultat de comparaison est conservé dans la preuve externe afin d'expliquer ultérieurement pourquoi une concordance a été acceptée ou refusée;
- le profil santé est prêt et testé, mais il ne valide encore aucun document : cette décision demeure dans le Bloc 3;
- tests TypeScript étendus : accents, formats de numéro et téléphone, dates NRHA, sexe, conflits forts, données insuffisantes et profil santé;
- build, tests identité, draw et payout réussis; aucun changement SQL ni comportement ShowScore.
- modèle commun de proposition d'import ajouté : type de sujet, code de source, clé externe, date de capture, comparaison et valeurs proposées;
- décision d'import auditée champ par champ avec listes explicites des valeurs acceptées et refusées; cette décision complète le payload brut de la source sans le remplacer;
- les champs locaux vides sont présélectionnés, tandis qu'une valeur HSP existante doit être cochée volontairement avant tout remplacement;
- les imports NRHA de contacts et de chevaux utilisent cette règle en création et en modification; une concordance cheval en écart peut maintenant afficher les suggestions sans appliquer automatiquement toutes les valeurs;
- les décisions sauvegardées sont conservées dans l'instantané externe immuable et sa `source_record_key`; une acceptation partielle reste une preuve d'import, sans devenir une validation d'identité;
- le modèle et le composant d'interface utilisent un `sourceCode`/`sourceLabel` générique : le connecteur AQHA, encore planifié et absent du code applicatif actuel, pourra les réutiliser sans nouveau modèle de données;
- tests d'import ajoutés : équivalence ignorée, champ manquant présélectionné, remplacement existant non présélectionné, acceptation partielle, refus complet et absence d'écrasement silencieux;
- build, tests identité, draw et payout réussis; test SQL ciblé ShowScore exécuté directement avec `psql` et réussi;
- I4 est classé `SS-0` : aucun bloc, passage, setup, résultat, rôle ou payload ShowScore n'est modifié.
- migration `0087_class_governing_body_metadata.sql` ajoutée : chaque liaison classe-organisme porte maintenant son code de rapport, son profil d'admissibilité, ses métadonnées objet et sa date de mise à jour;
- les formulaires, types et services n'utilisent plus `sanctioning_body_codes`; ils transmettent directement les identifiants FK et les métadonnées de chaque organisme;
- le type de classe NRHA a quitté `classes.eligibility_rules.nrha_class_type` et appartient désormais uniquement à la liaison NRHA, ce qui évite de mélanger les règles de plusieurs organismes sur une même classe;
- l'activation de la validation NRHA dépend maintenant de la liaison structurée à NRHA; un nom, un code ou un payout ressemblant à NRHA ne déclenche plus implicitement le moteur;
- les modèles de classes conservent les mêmes liaisons et les recopient lors de la création d'un bloc récurrent, sans relation many-to-many supplémentaire;
- seed principal enrichi avec une classe réellement NRHA + AQR et des métadonnées de rapport distinctes; associations A et B possèdent des choix d'organismes configurables sans que cela prouve le sanctionnement d'une classe;
- ancien seed de stress draw réaligné sur `blocks/classes`, répertoires globaux et `class_governing_bodies`; exécution locale réussie avec 45, 32 et 7 passages actifs par bloc;
- test SQL `class_governing_bodies_integration.sql` réussi : multi-organismes, métadonnées classe/modèle, contrainte JSON et isolation RLS inter-associations;
- test TypeScript `test:governing` réussi : mapping NRHA, conservation AQR, retrait indépendant et lecture du profil d'admissibilité structuré;
- reset local complet 0001 à 0087, build, draw, payout, blocs/classes et contrat ShowScore réussis;
- I5 et la migration 0087 sont classés `SS-0` : les organismes restent une propriété des vraies classes et aucun bloc, passage, setup ou résultat ShowScore n'est modifié.
- migration `0088_team_eligibility_decisions.sql` ajoutée : `team_eligibility_snapshots` relie une preuve externe au cheval, cavalier, concours, classe et organisme, tandis que `team_eligibility_decisions` conserve séparément la conclusion HSP et ses raisons;
- le connecteur actif du calculateur NRHA possède maintenant sa propre source `NRHA_ELIGIBILITY_API`, distincte de la recherche de membres, de chevaux et des imports de listes;
- le moteur commun parcourt tous les organismes liés à la classe : une liaison sans profil n'invente aucune règle, un profil sans adaptateur est signalé explicitement et NRHA demeure le premier adaptateur actif;
- le code de classe utilisé par le calculateur NRHA provient de `class_governing_bodies.reporting_class_code`, et non du code générique de la classe;
- chaque classe et modèle NRHA peut configurer un TTL de 1, 6, 12 ou 24 heures et choisir de bloquer ou de permettre avec avertissement lorsqu'une source est indisponible; le défaut sécuritaire demeure le blocage pendant 6 heures;
- une réponse admissible ou non admissible encore fraîche est réutilisée seulement pour la même classe, organisme, cheval, cavalier, concours, date et empreinte d'entrée; les décisions expirées ne sont pas réutilisées;
- l'écran d'inscription consomme maintenant le contrat générique d'admissibilité tout en conservant l'adaptateur et les validations locales NRHA existants, incluant les listes de classement Cat. 2/6;
- test TypeScript `test:eligibility` réussi : multi-organismes, aucune règle inventée, adaptateur manquant, cache, TTL et politiques de panne;
- test SQL `team_eligibility_decisions.sql` réussi : source distincte, preuve/décision séparées, FK de contexte, TTL et isolation RLS inter-associations;
- reset local complet 0001 à 0088, build, test des organismes, blocs/classes et contrat ShowScore ciblé réussis;
- I6 et la migration 0088 sont classés `SS-0` : aucune table, fonction, clé de payload, session, passage ou vue ShowScore n'est modifiée.

### Validation I8

- le module de rapports I7 est reporté comme un vrai chantier fonctionnel : PDF/CSV, choix des classes, regroupements, adaptateurs par organisme et conversion auditée des gains;
- build de production réussi;
- tests TypeScript identité, organismes, admissibilité, draw et payout réussis;
- reset local complet réussi de 0001 à 0088 avec le seed courant;
- les 14 fichiers de tests SQL passent directement contre la base locale fraîchement reconstruite, incluant RLS, imports AQR, répertoires, anti-doublon, organismes multiples, admissibilité et ShowScore;
- `supabase test db` possède un problème d'outillage local : son conteneur ne monte pas `supabase/seed.sql` pour deux anciens tests utilisant `\\ir`; ces deux tests passent avec `psql` contre la même base;
- lint SQL réussi avec le seul avertissement historique déjà connu dans `accept_pending_association_invitations`;
- aucune différence fonctionnelle ShowScore constatée; I8 est classé `SS-0`.

### Réalisation S1

- migration `0089_independent_horse_documents_and_registration_status.sql` : `horse_documents` devient la table canonique globale, liée uniquement au cheval; l'association d'import est une provenance facultative et non un propriétaire;
- catégories initiales `health`, `registration` et `other`, avec documents Coggins/vaccins, enregistrement de race, pedigree et certificat de propriété;
- stockage déplacé vers des chemins commençant par `horse_id`, accès contrôlé par les droits sur le cheval et remplacement d'un fichier déjà conservé interdit;
- nom original, type MIME, taille et empreinte SHA-256 conservés pour les nouveaux fichiers importés;
- un cheval peut être `registered`, `grade` ou `unknown`; un cheval grade ne requiert aucun numéro et ne peut conserver le numéro principal historique;
- les identifiants typés permettent plusieurs registres de race pour le même cheval; le numéro lu sur un document demeure une proposition et ne crée ni ne remplace silencieusement l'identifiant HSP;
- création et modification de cheval exposent le choix « Grade — sans enregistrement »; la fiche accepte les documents de plusieurs registres de race;
- une vue de lecture temporaire `horse_health_documents` a maintenu les anciennes fonctions Coggins/vaccins pendant leur réécriture; elle est maintenant supprimée par S9, sans réintroduire d'association propriétaire;
- reset complet 0001 à 0089, test SQL dédié, RLS historique, résultats/payouts, contrat ShowScore, build, identité, draw et payout réussis;
- S1 est classé `SS-0` : aucune table, fonction, session, passage ou donnée ShowScore n'est modifiée.

### Réalisation S2

- migration `0090_versioned_horse_document_identity_validations.sql` : chaque lecture appartient au document et au cheval, sans association propriétaire, et conserve sa version, sa source, les valeurs extraites, l'instantané HSP, le verdict, le score et les preuves par champ;
- création atomique par RPC : la nouvelle lecture devient active et l'ancienne est marquée `superseded` avec un lien vers sa remplaçante; les preuves enregistrées ne peuvent pas être réécrites directement;
- droits limités au propriétaire/agent autorisé, à la plateforme ou au personnel admin/secrétaire d'une association dont le cheval est dans un répertoire; une association étrangère ne peut ni lire ni identifier;
- comparateur partagé étendu à la race et à l'année de naissance lorsque la date complète manque; un âge n'est converti en année qu'avec sa date de référence;
- les documents santé utilisent le profil strict `health_document_horse`; les enregistrements utilisent `external_horse`; un document d'enregistrement portant un numéro signale explicitement un conflit si le cheval est déclaré `grade`;
- nouvelle section progressive « Identification des documents » dans la fiche cheval : saisie des valeurs visibles, comparaison, résultat expliqué et nouvelles lectures possibles sans écrasement HSP;
- l'import d'un document de race ne change plus le statut `registration_status` et ne crée ni ne remplace un identifiant externe; cette décision demeure une action distincte sur la fiche globale;
- reset complet 0001 à 0090, test SQL S2, test S1, RLS historique, résultats/payouts, contrat ShowScore, build et tous les tests TypeScript réussis;
- lint SQL sans nouvelle erreur; seul l'avertissement historique de `accept_pending_association_invitations` demeure;
- S2 est classé `SS-0` : aucune table, fonction, session, passage, donnée ou interface ShowScore n'est modifiée.

### Réalisation S3

- migration `0091_lock_verified_horse_identity_fields.sql` : inventaire calculé des champs protégés à partir des preuves `exact` ou `similar` d'une validation active `verified/match`;
- cohérence SQL renforcée entre statut et verdict : une validation `verified` doit être un `match`, une validation `mismatch` doit porter ce verdict et une lecture `identified` demeure possible ou insuffisante;
- nom, naissance ou année, sexe, race et numéro principal sont bloqués uniquement lorsqu'ils ont réellement participé à la concordance; couleur, filiation et tout champ absent ou en écart restent modifiables;
- passage au statut `grade` refusé lorsqu'un numéro vérifié demeure actif, tout en permettant une confirmation explicite `unknown` vers `registered`;
- identifiants externes vérifiés protégés par registre : leur statut ou expiration peut évoluer, mais leur valeur, type, registre, cheval ou suppression ne peuvent changer silencieusement;
- un document soutenant une validation active concordante ne peut pas être supprimé par le chemin ordinaire;
- la fiche cheval charge l'inventaire des protections, désactive les champs concernés et explique la source du verrou; les propositions d'import NRHA ne permettent plus de sélectionner un champ protégé;
- une nouvelle lecture documentaire rafraîchit immédiatement l'inventaire des protections affiché;
- test SQL `verified_horse_identity_locks.sql` réussi : verrouillage champ par champ, champs libres, numéro externe, document source et isolation inter-associations;
- reset complet 0001 à 0091, tests S1/S2/S3, RLS historique, résultats/payouts, contrat ShowScore, build et tous les tests TypeScript réussis;
- lint SQL sans nouvelle erreur; seul l'avertissement historique de `accept_pending_association_invitations` demeure;
- S3 est classé `SS-0` : aucun objet, rôle, passage, score, résultat, payload ou écran ShowScore n'est modifié.

### Réalisation S4

- migration `0092_audited_horse_identity_corrections.sql` : chaque correction conserve l'autorité, la raison obligatoire, les champs modifiés ainsi que les instantanés complets avant et après;
- autorité limitée au propriétaire, co-propriétaire ou agent relié à son compte, ainsi qu'à l'administrateur plateforme; le personnel d'association peut identifier les documents, mais ne peut pas corriger l'identité globale;
- RPC transactionnelle `correct_horse_identity()` : correction atomique de la fiche et de ses identifiants externes, sans ouverture d'un droit général permettant de contourner les verrous S3;
- les lectures documentaires qui contiennent un champ corrigé deviennent `invalidated` et conservent la correction ainsi que leurs champs précisément touchés; les autres lectures restent valides;
- une référence externe corrigée revient à `unknown` sans effacer la preuve historique, tandis qu'une référence incluse dans la même demande mais réellement inchangée conserve son statut et sa vérification;
- une lecture invalidée ne bloque pas une nouvelle version du même document; cette nouvelle lecture peut ensuite rétablir les protections adaptées à la nouvelle identité;
- transition vers `grade` traitée comme une seule correction auditée avec retrait obligatoire des identifiants de registre de race;
- la fiche cheval offre un mode de correction explicite, exige une justification, présente l'historique avant/après et laisse les imports externes protégés hors de ce workflow;
- reset complet 0001 à 0092 réussi; tests S1 à S4, RLS historique, résultats/payouts, scénario intégré et contrat ShowScore réussis;
- build de production et tests TypeScript identité, organismes, admissibilité, draw et payout réussis;
- lint SQL sans nouvel avertissement; seul l'avertissement historique de `accept_pending_association_invitations` demeure;
- S4 est classé `SS-0` : aucun bloc, passage, rôle, score, résultat, payload, fonction ou écran ShowScore n'est lu ou modifié.

### Réalisation S5

- migration `0093_organization_health_policies.sql` : politiques versionnées par association avec dates d'effet, sans FK vers une discipline, un répertoire, une classe ou un organisme sportif;
- exigences séparées pour Coggins/EIA, influenza et rhino, acceptation configurable du certificat combiné, Coggins valide pour une durée de 1 à 36 mois ou uniquement durant l'année civile du concours, et durée vaccinale distincte;
- niveau de concordance documentaire configurable (`none`, `identified`, `verified`), révision propre à l'association facultative et comportement `warning` ou `blocking`;
- RPC contrôlée `set_organization_health_policy()` : admin, secrétaire ou plateforme seulement, conservation automatique de l'ancienne période et absence de périodes qui se chevauchent;
- politique par défaut créée automatiquement pour chaque nouvelle association, puis lisible comme exigence publiée par les participants;
- `organization_health_document_reviews` conserve les décisions versionnées par association sans modifier le document global; deux associations peuvent prendre des décisions opposées sur le même fichier;
- RPC de révision limitée au personnel de l'association et aux chevaux présents dans l'un de ses répertoires, indépendamment de la discipline précise;
- écran Réglages enrichi : date d'effet, exigences séparées, durées, niveau d'identification, révision locale, mode d'application, notes et historique des versions;
- chargement applicatif ciblé des politiques et révisions de l'association active;
- reset complet 0001 à 0093, tests S1 à S5, RLS historique, scénario intégré, build et tous les tests TypeScript réussis;
- lint SQL sans nouvel avertissement; seul l'avertissement historique de `accept_pending_association_invitations` demeure;
- S5 est classé `SS-0` : aucun objet, passage, rôle, score, résultat, payload, fonction ou écran ShowScore n'est lu ou modifié.

### Réalisation S6

- migration `0094_horse_health_compliance_engine.sql` : un seul calcul à la demande évalue le cheval, l'association et la date de référence sans stocker de booléen permanent;
- la politique active est résolue selon sa période d'effet, puis Coggins, influenza et rhino sont évalués séparément avec leurs propres états et documents justificatifs; la règle Coggins « année du concours » expire le document au 31 décembre de son année de test;
- un certificat combiné peut satisfaire influenza et rhino uniquement lorsque l'association l'accepte; la date du test ou vaccin et la durée configurée déterminent l'expiration;
- les niveaux d'identité `none`, `identified` et `verified` ainsi que la dernière révision locale de l'association sont appliqués dans un ordre explicite;
- statuts globaux `not_required`, `compliant`, `pending_review` et `non_compliant`, accompagnés de codes de raison stables comme `health.coggins.expired`;
- `can_proceed` traduit uniquement le mode d'application de la politique : un écart en mode `warning` demeure visible mais passable, tandis que `blocking` empêche de poursuivre;
- le même cheval et les mêmes documents peuvent être conformes pour une association et encore en attente pour une autre, sans mutation du document global;
- lecture autorisée au personnel de l'association concernée et aux autorités de l'identité du cheval lorsqu'il est réellement dans un répertoire de cette association;
- contrat TypeScript et service RPC ajoutés pour que S7 et S8 consomment exactement le même résultat plutôt que de recalculer la santé dans chaque écran;
- reset complet 0001 à 0094 réussi; les 20 fichiers de tests SQL, le build et les tests TypeScript identité, organismes, admissibilité, draw et payout réussissent;
- S6 est classé `SS-0` : aucun objet, fonction, passage, score, résultat, payload ou écran ShowScore n'est lu ou modifié.

### Réalisation S7

- migration `0095_horse_health_compliance_presentation.sql` : lecture groupée et bornée des couples cheval-association autorisés, sans dupliquer aucune décision du moteur S6;
- un propriétaire ou agent voit les associations où son cheval est réellement répertorié; le personnel voit seulement les chevaux de ses propres associations et les utilisateurs étrangers n'obtiennent aucun résultat;
- le centre de santé devient un centre de conformité à trois groupes colorés : « à jour », « en attente » et « mise à jour requise », avec date de référence et raisons détaillées;
- la date du prochain concours de l'association est utilisée pour la présentation du centre lorsqu'il existe; « Mes chevaux » et le répertoire utilisent la date courante, tandis que S8 appliquera précisément la date du concours choisi;
- « Mes chevaux » regroupe sous chaque cheval les sigles des associations à jour, en attente ou demandant une mise à jour, sans charger leurs coordonnées ni leurs données privées;
- le répertoire de l'association utilise le même résultat central et le même langage visuel que « Mes chevaux », au lieu de conserver un deuxième calcul Coggins/vaccins;
- raisons humaines pour document manquant, date absente, expiration, rejet, identification en attente ou différente et révision locale;
- les boutons d'association écrivent exclusivement dans `organization_health_document_reviews`; l'ancien chemin applicatif qui approuvait ou refusait le document global a été retiré;
- la fiche cheval conserve l'import, les dates, l'identification et les fichiers, tandis que les décisions propres à l'association se prennent dans le centre de conformité;
- reset complet 0001 à 0095 réussi; les 21 fichiers de tests SQL, le build et les tests TypeScript identité, organismes, admissibilité, draw et payout réussissent;
- le test SQL S7 valide notamment un même cheval affiché différemment pour deux associations;
- S7 est classé `SS-0` : aucun objet, fonction, rôle, passage, score, résultat, payload ou écran ShowScore n'est lu ou modifié.

### Réalisation S8

- migration `0096_entry_reservation_health_compliance.sql` : les anciens déclencheurs Coggins/vaccins sont remplacés par une seule assertion fondée sur le moteur central et `shows.start_date`;
- le calcul pur S6 est maintenant isolé dans `evaluate_horse_health_compliance()` sans droit client, tandis que `get_horse_health_compliance()` conserve les contrôles d'accès de l'API publique;
- les inscriptions et réservations associées à un cheval passent en mode avertissement ou blocage selon la politique active de l'association; annulations, scratches, réservations terminées et produits sans cheval demeurent possibles;
- les formulaires d'inscription et de réservation consomment le même résultat central, affichent les raisons et la date du concours, autorisent les avertissements et désactivent uniquement les cas réellement bloquants;
- le chargement de présentation découpe les grands ensembles de chevaux par lots de 100 sans changer le contrat de la RPC bornée;
- le test `entry_reservation_health_compliance.sql` couvre date exacte, raisons stables, warning, blocking, annulations et réservations sans cheval;
- reset complet 0001 à 0096 et seed réussis; les 22 fichiers SQL passent, y compris facturation, dossards, admissibilité, résultats, payouts et contrats ShowScore;
- S8 est classé `SS-0` : les inscriptions acceptées conservent le même schéma et les mêmes identifiants consommés par ShowScore; aucun passage, setup, score, résultat ou écran ShowScore n'est modifié.

### Réalisation S9

- migration `0097_bloc3_health_legacy_cleanup.sql` : la politique versionnée et le moteur central deviennent les seuls chemins de règles santé;
- suppression de la vue transitoire `horse_health_documents`, des anciennes fonctions Coggins/vaccins, des anciens déclencheurs et des colonnes santé de `organizations`;
- notifications, préparation d'inscription, fiche cheval et page publique utilisent maintenant les résultats ou politiques canoniques; aucun calcul local historique ne demeure;
- la page publique décrit séparément Coggins, influenza, rhino, identification et révision d'association selon la politique applicable à la date du concours;
- la politique Coggins accepte maintenant `rolling_months` ou `calendar_year`; le second mode exige un test de la même année civile que le concours et refuse aussi une date postérieure au concours;
- `bloc3_final_validation.sql` confirme le partage d'un cheval et de ses documents, les résultats indépendants par association, la séparation entre visibilité et autorité d'identité, la politique par défaut et le contrat ShowScore inchangé;
- reset complet 0001 à 0097 et seed réussis; les 23 fichiers SQL, le build et les cinq tests TypeScript réussissent;
- lint SQL sans nouvel avertissement; seul l'avertissement historique de `accept_pending_association_invitations` demeure;
- S9 est classé `SS-0` : aucun objet, rôle, passage, score, résultat, publication, payload ou écran ShowScore n'est modifié.

## Prochaine étape

Effectuer la **fermeture générale de la refonte** : relire le diff complet, préparer l'ordre de déploiement des migrations et de l'application, puis décider explicitement du moment du déploiement. Le module de rapports I7 reste un chantier futur séparé.
