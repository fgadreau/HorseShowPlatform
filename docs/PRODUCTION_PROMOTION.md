# Promotion de préproduction vers production

La livraison se nomme « promouvoir `preprod` vers `main` » ou « fusionner
`preprod` dans `main` ». La production reste inchangée tant que cette procédure
n'est pas entièrement verte.

## Portée

HorseShowPlatform possède la chaîne canonique des migrations du projet Supabase
partagé. ShowScore est promu après la migration et le déploiement HSP afin que
les deux applications utilisent toujours un schéma compatible.

## Garde automatique

Le workflow **Production readiness rehearsal** doit être lancé manuellement sur
la branche `preprod` avec la confirmation `DRY-RUN PROD`. Il exécute, dans cet
ordre :

1. le build et tous les programmes de validation HSP;
2. la vérification que les anciennes migrations n'ont pas été modifiées et
   qu'aucune nouvelle migration ne contient `TRUNCATE TABLE`;
3. le méga-robot complet sur HSP et ShowScore en préproduction;
4. `supabase db push --dry-run` contre PROD, sans appliquer de migration.

Le dernier job utilise l'environnement GitHub `production-readiness` et exige
le secret `PRODUCTION_DATABASE_URL`. Ce secret doit être une connexion directe
ou poolée à la base PROD, conservée uniquement dans cet environnement protégé.
Le garde vérifie la référence du projet sans afficher les identifiants.

## Répétition de données obligatoire

Le dry-run SQL ne prouve pas à lui seul la conservation des données. Avant la
fusion, restaurer une sauvegarde récente de PROD dans un projet temporaire,
privé et sans services sortants, puis :

1. noter les comptes par association, concours, blocs, classes, inscriptions,
   résultats, factures, paiements, documents et fichiers Storage;
2. appliquer toute la chaîne HSP;
3. répéter les mêmes comptes et vérifier les relations clés;
4. exécuter les tests SQL et le parcours HSP → ShowScore → HSP;
5. détruire la répétition temporaire après approbation.

Le workflow **Production data rehearsal** automatise les étapes 2 à 4. Il exige
le secret `REHEARSAL_DATABASE_URL` et la référence du projet temporaire. Il
refuse explicitement la référence PROD, prend un instantané avant/après des
comptes et empreintes d'identifiants, applique les migrations uniquement sur la
copie, compare les invariants et conserve les preuves pendant 30 jours.

Les migrations qui suppriment des colonnes ou des structures historiques sont
signalées par `npm run test:promotion`; elles exigent cette répétition et une
sauvegarde immédiatement avant la fenêtre réelle.

## Ordre de la fenêtre de production

1. Geler les écritures administratives et confirmer qu'aucun concours n'est en
   cours.
2. Prendre et vérifier la sauvegarde PROD.
3. Refaire le workflow de readiness sur les SHA exacts de `preprod`.
4. Appliquer les migrations HSP approuvées.
5. Fusionner la PR HSP `preprod → main` et attendre Vercel.
6. Faire un smoke test de lecture HSP, sans données synthétiques en PROD.
7. Fusionner la PR ShowScore `preprod → main` et attendre Vercel.
8. Vérifier connexion, concours, horaire, annonceur, scribe, TV générale,
   manège principal et OBS en lecture seule.
9. Lever le gel seulement après approbation des deux applications.

## Retour arrière

Un déploiement Vercel peut être restauré au déploiement précédent. Une migration
de données ne doit jamais être annulée avec du SQL improvisé : arrêter les
écritures, restaurer la sauvegarde validée dans le cadre prévu, puis redéployer
les versions HSP et ShowScore compatibles avec ce schéma.
