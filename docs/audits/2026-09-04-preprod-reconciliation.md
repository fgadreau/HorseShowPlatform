Répétition finale sur une sauvegarde restaurée de PREPROD terminée. **Prêt pour une draft PR de revue : oui. Prêt pour une application PREPROD : non.** Les contrôles de conservation et de sécurité passent, mais cinq tests SQL restent en échec sur la copie réelle, et l’identité stricte des deux diagnostics historiques demandée n’est pas entièrement établie.

Cette conclusion remplace le bilan opérationnel de la répétition synthétique conservée plus bas. Aucun commit, push, PR, migration repair ou accès distant en écriture. Branche inchangée : `fix/preprod-migration-reconciliation-2026-09-04`, base `8214db4904b47cf6b5a1bcd3d69752a8e917af56`.

Les [preuves exactes de la restauration](reconciliation-2026-09-04/restored-validation.json), le [résumé mis à jour](reconciliation-2026-09-04/validation-summary.json) et la [liste exhaustive des fichiers proposés au commit](2026-09-04-preprod-reconciliation-files-to-commit.txt) sont disponibles. Le diff de revue et toute donnée privée temporaire sont exclus de cette liste.

La sauvegarde logique complète utilise `pg_dump --format=custom` PostgreSQL 17.6 et un snapshot exporté partagé avec les captures de référence. Les connexions distantes ont `default_transaction_read_only=on`; la transaction de référence est explicitement REPEATABLE READ READ ONLY et terminée par ROLLBACK. Une lecture complémentaire du propriétaire de la base, elle aussi en READ ONLY, a permis d’aligner les bases locales renommées. Les métadonnées de rôles nécessaires à la restauration sont sauvegardées sans exporter les mots de passe des rôles PostgreSQL.

L’export s’est terminé le **2026-09-04T20:30:11.549963+00:00**, taille **2934394 octets**, SHA-256 **`55deaeae6550aa4e7565cf9c8527d2fa9735855b8ce384e9302db39db723cc2d`**. L’horodatage exact du début de la transaction n’a pas été retenu lors de cette exécution; l’heure ci-dessus est celle de fin d’export, pas une heure de transaction reconstruite. L’archive et les captures brutes ont été conservées exclusivement dans un répertoire `/tmp/hsp-preprod-restored-*` en mode 0700, avec archive en 0600. Aucune donnée métier réelle, identité utilisateur ou clé n’est ajoutée au dépôt; seuls des agrégats, empreintes et résultats de comparaison sont publiés. Lors du dernier rejeu, les flux de diagnostic SQL sont comparés en mémoire et ne sont pas conservés.

La restauration utilise l’image `public.ecr.aws/supabase/postgres:17.6.1.131`, sans réseau Docker, sans port Docker publié, sans driver de journalisation et avec les tâches pg_cron désactivées. Le CLI 2.102.0 ne traite pas correctement l’URL de socket et impose TLS à `--db-url`; un proxy TLS éphémère lié uniquement à 127.0.0.1 relaie ses connexions vers le socket Unix protégé. Il ne dispose d’aucune destination distante. Le propriétaire des bases renommées et les attributs/memberships des rôles sont alignés sur la source, y compris la suppression d’un membership de bootstrap absent de PREPROD.

L’archive a été restaurée sans erreur. Les 94 tables publiques et l’historique correspondent intégralement à la capture distante avant migration. Les définitions des fonctions et colonnes restaurées correspondent exactement; les grants sont comparés en ignorant uniquement le nom de base `postgres`/`restored`. Les rôles, memberships et default ACL correspondent; les policies existantes restent inchangées, avec exactement sept nouvelles policies attendues.

| Référence protégée | Avant → après les six migrations |
| --- | --- |
| Setups | 7 → 7, mêmes valeurs métier, approbations, runs et choix explicites |
| Sources | 6 announcer restent announcer; le setup scribe reste scribe |
| Juges par setup pseudonymisé | 1, 1, 2, 2, 2, 2, 1 → valeurs identiques |
| Dates des setups | Exactement sept updated_at modifiés par la migration historique |
| Sessions annonceur | 6 → 6, mêmes lignes et révisions |
| Paid warm-up | 1 → 1, même ligne et même file au déploiement |
| Organisations | 4 → 4; seule addition attendue : is_test_mode=false |
| Blocs/classes/modèles | 8 / 7 / 0 inchangés; aucune classe créée |
| Liens organismes/exigences/inscriptions | 5 / 7 / 50 inchangés |
| Factures/paiements | 0 / 0 inchangés |
| Autres données publiques | Identiques dans les 94 tables, hors les deux différences explicitement autorisées ci-dessus |
| Defaults | live_data_source=announcer, qualified_rider_count=6; ce dernier n’est pas le nombre de juges |
| RPC warm-up | Signature uuid, boolean, boolean, text, timestamptz, jsonb; retour jsonb; SECURITY DEFINER; cinq arguments par défaut; EXECUTE anon refusé, authenticated autorisé |
| Permissions sur lignes restaurées | Announcer : lecture/RPC autorisées, UPDATE direct refusé; secrétaire : calendrier et RPC autorisés; admin local autorisé; admin tiers et anon refusés |
| Élévation inter-association | Appels avec UUID d’association tierce refusés; tables et memberships inchangés après rollback des tests |
| Historique local | Les quatre migrations manquantes puis les deux correctifs sont enregistrés, dans cet ordre |
| Deuxième dry-run local | Aucune migration annoncée |

Les tests de permissions sur les lignes réelles utilisent des identités synthétiques dans une transaction annulée. Les 29 tests historiques s’exécutent sur un clone local séparé de la restauration, avec leur seed commun. Le seed suppose des UUID de disciplines fixes alors que PREPROD possède déjà ces codes : le lanceur résout les trois références REINING/GYMKHANA/PERFORMANCE vers le catalogue restauré, identiquement aux trois étapes, uniquement en mémoire. Aucun fichier SQL de test historique ou de migration n’est modifié.

| Étape de test | Réussites / total |
| --- | --- |
| Sauvegarde restaurée intacte | 22 / 29 |
| Après les quatre migrations historiques manquantes | 24 / 29 |
| Après les deux nouvelles corrections | 24 / 29 |

Soit **87 exécutions SQL** lors du dernier rejeu. Les tests warm-up et secrétaire deviennent verts avec les quatre migrations attendues. Les deux correctifs n’introduisent aucun nouveau statut d’échec parmi les 29 tests. Les diagnostics des cinq échecs restants sont comparés avant/après ces deux correctifs :

| Test | Diagnostic sur la sauvegarde réelle | Identité stricte avant/après correctifs |
| --- | --- | --- |
| bloc3_final_validation.sql | Vaccin du seed expiré depuis le 15 juillet 2026; des UUID de policies sont générés à chaque exécution | **Non**; identique seulement après remplacement des UUID générés |
| compatibility_views_security_invoker.sql | Accès public aux associations : 2 attendues, 6 présentes avec les quatre organisations restaurées | **Oui**, octet pour octet; l’assertion en échec diffère de celle rencontrée sur les fixtures synthétiques |
| organization_health_policies.sql | Comptage global supposant uniquement les associations du seed | **Oui**, octet pour octet |
| phase1_rls.sql | Comptage des shows anonymes : 0 attendu, 3 shows publics restaurés visibles | **Oui**, octet pour octet |
| targeted_context_showscore.sql | La requête de l’association B voit aussi des blocs publiés des associations restaurées | **Oui**, octet pour octet |

Il serait donc incorrect de confirmer « les deux erreurs historiques sont strictement identiques » sans réserve, ou de présenter cette suite comme 27/29 sur les données réelles. Les trois échecs supplémentaires sont liés aux hypothèses d’isolation des fixtures et aux données publiques restaurées, pas à un changement de résultat après les deux correctifs. Le test de visibilité publique ne constitue pas une élévation en administrateur; cette dernière est testée séparément sur des associations réelles et refusée.

Les suites applicatives draw, payout, paid-warmup, identity, governing, eligibility, capacity:config ainsi que le build sont réexécutés avec **code retour 0**. Aucun test navigateur n’est revendiqué.

Le nettoyage a supprimé l’instance, l’archive, les captures privées, les diagnostics temporaires et les clés TLS; leur absence est vérifiée dans le JSON de preuves. Aucun backup réel n’est conservé dans le dépôt ou proposé au commit.

Le correctif est suffisamment documenté et vérifié pour une **draft PR de revue**. L’application PREPROD reste **bloquée** tant que les cinq tests en échec n’ont pas des fixtures isolées/déterministes ou une acceptation explicite de leurs limites, et que la réserve sur l’identité stricte de Bloc 3 n’est pas résolue ou explicitement acceptée. Aucune modification des migrations historiques n’est nécessaire pour traiter ces fixtures.

Risques résiduels : commits séparés par migration; sept réécritures de dates et broadcasts historiques; verrouillages DDL; nécessité de conserver class_templates/candidats à zéro pour la réparation historique; dernier écrivain gagnant dans la RPC warm-up; droits secrétaire plus larges que le seul horaire; grants TRUNCATE préexistants. Une future application exige toujours une fenêtre sans écritures, un nouveau préflight et une sauvegarde immédiate : celle de cette répétition a été détruite conformément à la demande.

Pour reproduire sans conserver de données privées : disposer de psycopg 3 (ou renseigner `HSP_PSYCOPG_PATH` vers son installation temporaire), Docker, OpenSSL et du CLI 2.102.0. `HSP_PREPROD_DATABASE_URL` reste dans l’environnement, jamais dans une commande imprimée. Exécuter séquentiellement `python scripts/rehearse-preprod-restored.py backup`, puis `restore`, `app`, `validate`, et enfin `cleanup`. Le nettoyage est impératif même si une validation échoue; consulter seulement les résultats agrégés. Le lanceur ne propose aucun repair, commit ou push.

**Répétition synthétique précédente, conservée pour traçabilité.** Les chiffres et réserves ci-dessous décrivent cette première répétition et ne remplacent pas le bilan sur sauvegarde réelle ci-dessus.

Correctif PREPROD préparé sur `fix/preprod-migration-reconciliation-2026-09-04`, depuis `origin/preprod` **8214db4904b47cf6b5a1bcd3d69752a8e917af56**. Aucun commit, push, PR, accès à une base Supabase distante ou migration repair pendant cette préparation.

Les entrées sont l’[audit](2026-09-04-preprod-migrations.md), les [preuves](2026-09-04-preprod-evidence.json) et le [préflight](2026-09-04-preprod-preflight.sql), laissés intacts. Le commit audité et la base de branche ont le même contenu de dépôt. Les 126 migrations historiques correspondent octet pour octet à `origin/preprod`; les quatre hashes critiques et celui du préflight correspondent aux preuves. [Manifeste](reconciliation-2026-09-04/historical-sha256.json).

Le diff complet disponible dans le workspace est un artefact de revue, exclu du commit proposé. Les preuves d’audit déjà présentes au début de la session restent inchangées.

Deux migrations nouvelles seulement :

- `20260904000100_secure_association_creation.sql` : RPC de création exclusivement, identité et profil obligatoires, search_path fixé, INSERT sans UPSERT, donc UUID existant refusé même en concurrence. La création réussie attribue admin au créateur; l’échec ne modifie ni l’association tierce ni ses membres. PUBLIC/anon restent sans EXECUTE; authenticated conserve la création. Une mise à jour doit passer par `showscore_update_organization_profile`. Un retry avec le même UUID renvoie désormais une violation d’unicité; il ne sert plus d’édition implicite.
- `20260904000200_restore_announcer_setup_defaults.sql` : defaults `announcer` et `6`, sans UPDATE des setups. Les choix explicites restent inchangés. La RPC paid warm-up et les six policies secrétaire proviennent respectivement de `20260824130000` et `20260824131000`, appliquées telles quelles dans le lot.

Le périmètre secrétaire conserve INSERT/UPDATE de shows, show_days et blocks, y compris visibilité et autres champs autorisés par les policies historiques. Il ne promet pas une restriction aux seules colonnes d’horaire. L’annonceur seul conserve SELECT du warm-up et la RPC live; aucune policy UPDATE supplémentaire ne lui est accordée.

Répétition reproductible exclusivement locale : Supabase CLI **2.102.0**, image PostgreSQL **17.6.1.131**, serveur **17.6**. L’instance locale et ses volumes ont été détruits après validation; les fichiers de configuration restent dans /tmp pour permettre une nouvelle répétition. Le projet jetable a pour chemin `/tmp/hsp-reconciliation-20260904` et pour conteneur `supabase_db_hsp-reconciliation-20260904`. Services utilisés : DB, Auth, PostgREST, Realtime, gateway; les services non nécessaires sont exclus du démarrage. Le lanceur détruit et recrée uniquement les volumes de ce projet jetable entre les deux reconstructions. Cela évite de dépendre des échecs intermittents constatés pendant les premiers essais de db reset / initialisation Realtime.

```sh
mkdir -p /tmp/hsp-reconciliation-20260904
./node_modules/.bin/supabase init --workdir /tmp/hsp-reconciliation-20260904
./node_modules/.bin/supabase start --workdir /tmp/hsp-reconciliation-20260904 \
  -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,storage-api
# Attendre la fin réussie du démarrage, puis :
python scripts/rehearse-preprod-reconciliation.py
```

Le script n’accepte aucune URL distante. Il reconstruit les versions présentes dans les preuves, charge une fixture synthétique, rejoue le préflight existant et les six migrations via `db push --local --include-all`, compare les données, teste le rejeu et la concurrence, puis reconstruit toute la chaîne chronologiquement et compare le schéma public. Les migrations de sonde transactionnelle n’existent que dans `/tmp`; aucun fichier de sonde n’entre dans le dépôt ou le lot PREPROD.

Les fixtures représentent les agrégats observés, avec des valeurs synthétiques discriminantes pour sources, modes, approbations, runs, acteur et date du changement de source. Elles ne sont pas une copie exacte des données PREPROD : les preuves agrégées ne permettent pas cette reconstruction. Une répétition sur sauvegarde restaurée reste une condition d’application distante.

Résultats détaillés : [bilan JSON](reconciliation-2026-09-04/validation-summary.json), [journal final](reconciliation-2026-09-04/rehearsal-final.log) et dossier [reconciliation-2026-09-04](reconciliation-2026-09-04/). Résultats observés :

| Contrôle | Résultat |
| --- | --- |
| Setups | 7 → 7; mêmes valeurs métier, approbations, runs et sources (6 announcer, 1 scribe); exactement 7 updated_at changés par la migration historique |
| Sessions annonceur | 6 → 6; lignes complètes et révisions inchangées |
| Warm-up et comptes annexes | 1 warm-up/file inchangé; 8 blocs, 7 classes, 5 liens organismes, 7 exigences, 50 inscriptions, 0 facture/paiement inchangés |
| Defaults réels | Nouvel INSERT sans source ni nombre qualifié : announcer / 6 |
| Rejeu | Nouvelles corrections : mêmes données complètes; lot complet : mêmes valeurs métier, avec dates/broadcasts historiques non neutres |
| Rôles SQL | anon, authenticated sans identité, sans profil, tiers, announcer seul, secretary seul, admin local/tiers et platform admin testés |
| Escalade | UUID existant refusé; association/membres tiers inchangés; création nouvelle avec un seul propriétaire; collision concurrente refusée sans membre supplémentaire |
| Warm-up live | Accès autorisés conservés; UPDATE direct annonceur refusé; ajout, retrait, réordre de file, statut et élément actif invalides refusés |
| Concurrence live | Sérialisation par verrou; dernier écrivain gagnant confirmé |
| PostgREST/Auth | RPC disponible après migration, secrétaire 200, anon 401, admin tiers 403, takeover 409/23505 |
| Schéma public final | Dumps identiques entre rattrapage PREPROD et reconstruction chronologique, hors jeton aléatoire de protection pg_dump |
| Tests SQL existants | **27/29 passent; 2 échecs historiques reproduits sans les corrections** |
| Tests applicatifs | draw, payout, paid-warmup (8 tests), identity, governing, eligibility et capacity:config passent |
| Build | `npm run build` passe; avertissement existant sur les chunks > 500 kB |
| Frontière transactionnelle CLI | Première sonde validée et historisée; seconde échouée entièrement annulée et non historisée (`true|true|1|0`) |

Les deux échecs SQL ne sont pas masqués : `bloc3_final_validation.sql` utilise CURRENT_DATE avec un vaccin du seed expiré le 15 juillet 2026; `compatibility_views_security_invoker.sql` attend une journée alors que le seed et son trigger produisent trois journées. Les mêmes erreurs sont obtenues sur le schéma canonique en rétablissant transactionnellement la définition historique de la seule fonction modifiée; les defaults canoniques historiques étaient déjà announcer / 6. Ces transactions sont annulées. Voir [résultats SQL](reconciliation-2026-09-04/sql-results.json), [contre-test Bloc 3](reconciliation-2026-09-04/baseline-bloc3_final_validation.log) et [contre-test vues](reconciliation-2026-09-04/baseline-compatibility_views_security_invoker.log). Le lanceur termine volontairement avec un code non nul tant que la suite historique contient ces échecs, après avoir exécuté les autres contrôles.

Les scripts `legacy_rebuild_fixture.sql` / `legacy_rebuild_assertions.sql` constituent une paire dédiée à un schéma intermédiaire historique, pas des tests autonomes du schéma final; les scripts de seed ne sont pas comptés comme tests. Aucun test navigateur Playwright n’est revendiqué. Les tests applicatifs sont les suites indiquées ci-dessus, complétées par les contrôles HTTP locaux.

Plan d’application proposé, **non exécuté**, à soumettre avant toute écriture distante :

1. Faire relire le diff complet et valider explicitement le lot de **six** versions : `20260801002350`, `20260807000400`, `20260824130000`, `20260824131000`, `20260904000100`, `20260904000200`. Figer l’artefact, son SHA-256 et le CLI 2.102.0. Aucun repair ni modification d’une migration historique.
2. Préparer une sauvegarde cohérente PREPROD des données, schémas et ACL; vérifier sa restauration isolée. Répéter ce même lot sur cette restauration, en conservant les dumps des sept setups, six sessions et du warm-up avant/après. Ne pas assimiler les preuves agrégées à une sauvegarde.
3. Suspendre les écritures HSP, ShowScore, imports, robots et jobs. Bloquer les RPC de mutation et nouvelles sessions applicatives pendant toute la fenêtre; attendre la fin des transactions existantes. La correction finale du défaut ne protège pas des INSERT concurrents entre deux migrations.
4. Charger `HSP_PREPROD_DATABASE_URL` sans l’imprimer. Vérifier dans la console Supabase et la connexion que le projet est **qaguotdproxamgudnnsd**. Utiliser une connexion PostgreSQL dédiée, pas un endpoint PROD ou un pooler transactionnel non validé. Conserver la sauvegarde immédiate et exécuter le préflight en lecture seule :

   ```sh
   psql "$HSP_PREPROD_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -f docs/audits/2026-09-04-preprod-preflight.sql > preflight-application.log
   ```

   Arrêter si l’historique n’est plus exactement celui des preuves, si les quatre versions ne sont plus les seules historiques manquantes, si un hash diffère, si class_templates/candidats/rangs à réparer ne sont plus zéro, ou si schéma, ACL, triggers, defaults et comptes s’écartent du snapshot attendu. Tout modèle apparu exige un nouvel audit métier de `20260807000400`; son cutoff ne suffit pas à autoriser une copie.
5. Avec le même artefact, demander le dry-run exact, sans écriture :

   ```sh
   ./node_modules/.bin/supabase db push --db-url "$HSP_PREPROD_DATABASE_URL" \
     --include-all --dry-run
   ```

   Arrêter si la liste ou l’ordre diffèrent des six versions ci-dessus. Fixer pour la connexion de migration `lock_timeout=5s` et `statement_timeout=120s` (paramètres PostgreSQL de démarrage `options` dans l’URL dédiée, encodés et contrôlés sur la restauration). Vérifier ces paramètres effectifs avec `SHOW` sur la même URL. Leur durée peut être révisée après mesure sur la restauration, avant approbation.
6. **Seulement après autorisation distincte d’application**, exécuter une seule fois :

   ```sh
   ./node_modules/.bin/supabase db push --db-url "$HSP_PREPROD_DATABASE_URL" \
     --include-all --yes
   ```

   Arrêter à la première erreur; conserver les logs. Ne pas supposer une transaction atomique couvrant les six migrations. En cas d’application partielle, comparer l’historique et le catalogue réels avant toute reprise; ne pas repair ou relancer aveuglément.
7. Toujours avant réouverture, refaire le préflight et comparer les données complètes à la sauvegarde : sept mêmes setups et valeurs métier, six mêmes sessions/révisions, warm-up/file inchangés; defaults `announcer`/`6`; quatre organisations avec `is_test_mode=false`; comptes 8 blocs, 7 classes, 5 liens organismes, 7 exigences, 50 inscriptions, 0 facture/paiement. Les dates updated_at des setups et événements de broadcast produits par `02350` sont des effets attendus, à distinguer d’une modification métier. Vérifier les ACL, les six policies et la présence de la RPC via PostgREST après rechargement du schéma.
8. Après accord pour les vérifications fonctionnelles distantes, effectuer un smoke test avec comptes et données de test bornés : annonceur live, secrétaire, admin, compte tiers refusé. Les tests SQL de ce dépôt incluent seed et écritures : **ne pas les lancer sur PREPROD**. Réouvrir seulement si toutes les comparaisons et tests passent.
9. En cas d’échec, maintenir la suspension, sauvegarder l’état partiel et décider d’une migration compensatrice ou d’une restauration vérifiée avec autorisation distincte. Le rollback applicatif ne restaure ni ACL, ni défauts, ni données, ni événements déjà diffusés.

Risques conservés : réécriture historique des sept `updated_at` et broadcasts; verrouillages DDL; algorithme historique de copie non sûr si les modèles cessent d’être vides; absence de verrou optimiste dans la RPC warm-up (dernier écrivain gagnant); verrou du warm-up pris avant contrôle d’autorisation; grants TRUNCATE préexistants à anon/authenticated non couverts par RLS; permissions secrétaire plus larges que l’horaire. Le correctif de création supprime le chemin d’élévation audité, sans constituer un audit exhaustif de toutes les RPC SECURITY DEFINER du produit.
