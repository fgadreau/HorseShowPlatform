# Test de capacité ShowScore

Ce test complète le méga robot fonctionnel. Il ouvre simultanément les vraies
pages publiques ShowScore dans Chromium, conserve leurs connexions Realtime et
mesure les lectures REST Supabase pendant une période stable. Il ne crée, ne
modifie et ne supprime aucune donnée.

## Profils

| Profil | TV | Mobiles | OBS | État stable | But |
| --- | ---: | ---: | ---: | ---: | --- |
| `smoke` | 3 | 5 | 1 | 30 s | Valider la configuration |
| `baseline` | 15 | 50 | 2 | 2 min | Représenter le prochain show |
| `target` | 15 | 500 | 2 | 5 min | Première cible de capacité publique |

Le profil `target` est volontairement manuel. Cinq cents pages de navigateur
peuvent aussi saturer le runner GitHub; un échec de mémoire du runner n'est pas
une preuve de saturation de ShowScore et devra mener à une exécution distribuée.

## Budgets initiaux

- toutes les vues doivent charger;
- navigation p95 au plus 15 secondes;
- aucune erreur de statut Realtime;
- aucune erreur JavaScript non interceptée;
- taux d'erreurs REST au plus 0,5 %;
- au plus 2 requêtes REST par vue et par minute une fois la rampe stabilisée.

Le dernier budget est exigeant intentionnellement. À 500 cellulaires, même une
seule requête inutile répétée fréquemment redevient une charge importante. Les
requêtes du chargement initial sont séparées de la mesure stable.

## Garde-fous

Le lancement est refusé sauf si `CAPACITY_ALLOW_TRAFFIC=true`, si l'environnement
est explicitement non productif et si l'hôte de production est fourni pour être
comparé aux URL cibles. Toutes les URL distantes doivent utiliser HTTPS.

Variables requises :

```text
CAPACITY_ALLOW_TRAFFIC=true
CAPACITY_DEPLOY_ENV=staging
CAPACITY_PROFILE=smoke
CAPACITY_PRODUCTION_SHOWSCORE_HOST=showscore.app
CAPACITY_PUBLIC_URL=https://<preprod>/public/associations/<association>/shows/<show>
CAPACITY_TV_URLS=https://<preprod>/public/.../tv,https://<preprod>/public/.../tv?arena=...
CAPACITY_OBS_URLS=https://<preprod>/public/.../overlay?arena=...
SHOWSCORE_VERCEL_AUTOMATION_BYPASS_SECRET=<optionnel>
```

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
les seuils, le p95 de navigation, le taux d'erreur, les connexions Realtime et
les routes REST les plus sollicitées.

Le premier smoke du 5 août 2026 a révélé une boucle de reconnexion. Neuf vues
produisaient alors 156 requêtes REST par vue-minute, sans erreur REST. L'audit
de la publication a ajouté des garde-fous explicites pour le live annonceur et
la table `shows`, puis le test a commencé à considérer toute erreur de statut
Realtime comme un échec explicite. Ces migrations sont respectivement
`20260805000700_showscore_announcer_live_realtime.sql` et
`20260805000800_shows_realtime.sql`.

## GitHub Actions

Le workflow `ShowScore preprod capacity` est déclenché manuellement avec l'un
des trois profils. Les URL sont gardées dans les variables de l'environnement
GitHub `preprod`; aucun secret Supabase privilégié n'est nécessaire. Le rapport
est conservé comme artefact pendant 30 jours.

Commencer par `smoke`, puis `baseline`. Le profil `target` ne doit être lancé
qu'après lecture du rapport baseline et pendant une fenêtre où la préproduction
peut être chargée sans déranger les tests manuels.
