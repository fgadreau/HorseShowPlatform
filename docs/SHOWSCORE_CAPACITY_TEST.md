# Test de capacité ShowScore

Ce test complète le méga robot fonctionnel. Il ouvre simultanément les vraies
pages publiques ShowScore dans Chromium, conserve leurs connexions Realtime et
mesure les lectures REST Supabase pendant une période stable. Un producteur
contrôlé modifie le score d'un passage synthétique toutes les cinq secondes,
mesure sa propagation vers chaque vue, puis restaure la fixture.

## Profils

| Profil | TV | Mobiles | OBS | État stable | But |
| --- | ---: | ---: | ---: | ---: | --- |
| `smoke` | 3 | 5 | 1 | 30 s | Valider la configuration |
| `baseline` | 15 | 50 | 2 | 2 min | Représenter le prochain show |
| `diagnostic100` | 15 | 83 | 2 | 2 min | Cerner le seuil après baseline |
| `diagnostic125` | 15 | 108 | 2 | 2 min | Cerner le seuil avant 150 vues |
| `diagnostic150` | 15 | 133 | 2 | 2 min | Cerner le seuil avant 167 vues |
| `intermediate` | 15 | 150 | 2 | 2 min | Premier palier après baseline |
| `distributed167` | 15 | 150 | 2 | 2 min | Rejouer 167 vues sur deux runners |
| `endurance167` | 15 | 150 | 2 | 15 min | Mesurer la stabilité et les snapshots de secours |
| `distributed500` | 15 | 500 | 2 | 5 min | Valider 517 sorties sur six runners |
| `high` | 15 | 300 | 2 | 3 min | Palier avant la cible maximale |
| `target` | 15 | 500 | 2 | 5 min | Première cible de capacité publique |

Les profils `target` et `distributed500` sont volontairement manuels. Cinq cents pages de navigateur
peuvent aussi saturer le runner GitHub; un échec de mémoire du runner n'est pas
une preuve de saturation de ShowScore. `distributed500` évite cette ambiguïté en
répartissant les 517 sorties réelles sur six runners.

## Budgets initiaux

- toutes les vues doivent charger;
- navigation p95 au plus 15 secondes;
- toutes les connexions Realtime doivent être actives à la fin;
- aucune déconnexion Realtime non récupérée;
- aucune reconnexion récupérée sur les profils courts et au plus 0,5 par
  vue-heure pour `endurance167`;
- aucune erreur JavaScript non interceptée;
- taux d'erreurs REST au plus 0,5 %;
- au plus 2 requêtes REST par vue et par minute une fois la rampe stabilisée.
- au moins 99 % des mutations live reçues par les vues;
- propagation Realtime p95 au plus 2 secondes;
- aucune erreur du producteur et restauration confirmée de la fixture.

Le dernier budget est exigeant intentionnellement. À 500 cellulaires, même une
seule requête inutile répétée fréquemment redevient une charge importante. Les
requêtes du chargement initial sont séparées de la mesure stable.

## Garde-fous

Le lancement est refusé sauf si `CAPACITY_ALLOW_TRAFFIC=true`, si l'environnement
est explicitement non productif et si l'hôte de production est fourni pour être
comparé aux URL cibles. Le producteur exige en plus `CAPACITY_ALLOW_WRITES=true`,
une correspondance exacte entre l'URL et la référence du projet Supabase de
préproduction, et une référence de production différente. Toutes les URL
distantes doivent utiliser HTTPS.

Variables requises :

```text
CAPACITY_ALLOW_TRAFFIC=true
CAPACITY_ALLOW_WRITES=true
CAPACITY_DEPLOY_ENV=staging
CAPACITY_PROFILE=smoke
CAPACITY_PRODUCTION_SHOWSCORE_HOST=showscore.app
CAPACITY_PUBLIC_URL=https://<preprod>/public/associations/<association>/shows/<show>
CAPACITY_TV_URLS=https://<preprod>/public/.../tv,https://<preprod>/public/.../tv?arena=...
CAPACITY_OBS_URLS=https://<preprod>/public/.../overlay?arena=...
CAPACITY_WRITER_ENABLED=true
CAPACITY_WRITER_INTERVAL_MS=5000
CAPACITY_WRITER_SETTLE_MS=3000
CAPACITY_SUPABASE_URL=https://<ref-preprod>.supabase.co
CAPACITY_SUPABASE_PROJECT_REF=<ref-preprod>
CAPACITY_PRODUCTION_SUPABASE_PROJECT_REF=<ref-production>
CAPACITY_SUPABASE_SERVICE_ROLE_KEY=<secret serveur seulement>
SHOWSCORE_VERCEL_AUTOMATION_BYPASS_SECRET=<optionnel>
```

`CAPACITY_MAX_RECOVERED_REALTIME_RECONNECTS_PER_VIEW_HOUR` permet de remplacer
le budget du profil. Sa valeur par défaut est `0,5` pour `endurance167` et `0`
pour tous les profils courts.

Plusieurs URL TV ou OBS peuvent être séparées par des virgules ou des retours à
la ligne. Le robot les distribue en rotation entre les vues demandées.

Pour vérifier la configuration sans trafic :

```bash
CAPACITY_DRY_RUN=true npm run test:capacity
```

Pour lancer réellement le profil sélectionné :

```bash
npm run test:capacity
```

Les rapports JSON et Markdown sont écrits dans `.tmp/capacity`. Ils contiennent
les seuils, le p95 de navigation, le taux d'erreur, les connexions Realtime, les
routes REST les plus sollicitées, le nombre de mutations, leur couverture et le
p95 de propagation.

Le producteur découvre le bloc à partir des abonnements réellement ouverts par
les vues. Il respecte la source live configurée (`scribe` ou `announcer`), place
temporairement la publication en `live_scoring`, puis n'écrit que le tableau
`runs` de cette session. Chaque écriture utilise la date de mise à jour précédente
comme verrou optimiste. Si un autre acteur touche la fixture, le robot arrête ses
écritures et refuse de remplacer cette modification. La restauration remet le
contenu et le statut de publication originaux; la source annonceur conserve une
révision monotone.

Le premier smoke du 5 août 2026 a révélé une boucle de reconnexion. Neuf vues
produisaient alors 156 requêtes REST par vue-minute, sans erreur REST. L'audit
de la publication a ajouté des garde-fous explicites pour le live annonceur et
la table `shows`, puis le test a commencé à considérer toute erreur de statut
Realtime comme un échec explicite. Ces migrations sont respectivement
`20260805000700_showscore_announcer_live_realtime.sql` et
`20260805000800_shows_realtime.sql`.

Le premier smoke avec producteur du 5 août 2026 a ensuite confirmé la chaîne
live complète : 6 mutations, 54 livraisons sur 54, propagation p95 de 599 ms et
restauration réussie. Il a aussi révélé une amplification distincte dans le
client public ShowScore : chaque mutation reçue recharge les 13 sources REST de
la page. À une mutation toutes les 5 secondes, cela représente 156 requêtes par
vue-minute.

La correction ShowScore fusionnée en préproduction le 6 août applique désormais
la charge utile Realtime localement. Les paliers avec producteur ont donné les
résultats suivants sur ce déploiement :

| Vues | Livraisons | Propagation p95 | REST stable | Reconnexions | Résultat |
| ---: | ---: | ---: | ---: | ---: | --- |
| 67 | 1 608 / 1 608 | 929 ms | 0 | 0 | Réussi |
| 100 | 2 400 / 2 400 | 1 006 ms | 0 | 0 | Réussi |
| 125 | 3 000 / 3 000 | 1 164 ms | 0 | 0 | Réussi |
| 150 | 3 600 / 3 600 | 1 236 ms | 0 | 0 | Réussi |
| 167, essai 1 | 4 007 / 4 008 | 1 353 ms | 13 lectures | 1 | Échec strict |
| 167, essai 2 | 4 007 / 4 008 | 1 345 ms | 13 lectures | 1 | Échec strict |
| 167, 2 runners | 4 008 / 4 008 | 1 311 ms | 0 | 0 | Réussi |
| 167, 2 runners, 15 min | 29 378 / 29 392 | 1 305 ms | 2,56 / vue-min | 17 | Échec strict |

La capacité entièrement validée par ce banc est donc de 167 vues simultanées
lorsque la génération de charge est répartie sur deux runners. Les deux échecs
sur un runner unique indiquent une limite du générateur concentré, pas un seuil
Realtime démontré à 167 connexions.

Le test d'endurance distribué de 15 minutes confirme que le service reste
opérationnel : les 167 connexions sont actives à la fin, la fixture est restaurée
et la couverture atteint 99,952 %. Il ne respecte toutefois pas les budgets
stricts. Dix-sept vues se sont reconnectées automatiquement et 14 livraisons ont
été manquées momentanément avant le snapshot de récupération. Les snapshots de
secours complets ont aussi produit 6 409 lectures REST, soit 2,56 par vue-minute
contre une limite de 2.

L'artefact détaillé contient exactement 493 lectures de chacune des 13 routes du
snapshot, donc 493 snapshots complets. La correction porte l'intervalle de
sécurité d'une vue Realtime saine de cinq à dix minutes, toujours avec une gigue
de 20 %. Une reconnexion conserve sa resynchronisation immédiate. Le banc sépare
maintenant les reconnexions récupérées des déconnexions finales et applique au
profil d'endurance une limite de 0,5 reconnexion récupérée par vue-heure. Les
profils courts demeurent stricts à zéro.

Le palier de 317 vues ne doit donc pas encore être lancé. Il faut d'abord valider
ces deux corrections avec `smoke`, `baseline`, puis `endurance167` sur le
déploiement ShowScore de préproduction.

## GitHub Actions

Le workflow `ShowScore preprod capacity` est déclenché manuellement avec l'un
des onze profils. Les URL et références sont gardées dans les variables de
l'environnement GitHub `preprod`. La clé Supabase `service-role`, déjà utilisée
par le robot E2E, demeure uniquement dans le processus Node du runner. Le
rapport est conservé comme artefact pendant 30 jours.

`distributed167` et `endurance167` répartissent les vues en deux shards de 84
et 83 vues. `distributed500` utilise six shards contenant entre 85 et 88 sorties.
Tous les runners attendent une même heure UTC; un seul active le producteur,
puis un job final exige tous les rapports et agrège exactement 167 ou 517 journaux
de vues avant de recalculer les budgets. Les identifiants de vues doivent être
uniques et la fixture restaurée pour obtenir un résultat réussi.

Commencer par `smoke` et `baseline`. Après un premier échec à `intermediate`,
utiliser `diagnostic100`, `diagnostic125` et `diagnostic150` dans cet ordre pour
cerner le seuil avant de reprendre `intermediate` puis `high`. Le profil `target`
ne doit être lancé qu'après lecture des rapports précédents et pendant une
fenêtre où la préproduction peut être chargée sans déranger les tests manuels.
