# Promotion vétérinaire vers PREPROD — 6 septembre 2026

Cible autorisée : `preprod`, Supabase `qaguotdproxamgudnnsd`. PROD `srzzituovoxkvvlaesxa` et `main` sont exclus. Base de la branche : `ecd9d59e1ed3ead0aca5dc17b79ac51d3a579e6a`, identique à `origin/preprod` à l’inspection. Les modifications présentes concernent le portail ; aucune modification parallèle sans rapport n’a été trouvée.

## État hébergé prévu

- Auth : client HSP/Supabase PREPROD existant, comptes préexistants et permissions propres au portail. Aucun seed ni compte du pilote local à importer.
- Chevaux/propriétaires : modèle central et RPC avec recherche préalable, accès limité et audit.
- Signatures : représentation et empreinte conservées dans les tables privées Supabase, avec RLS. Pas de fichier de signature dans un bucket public.
- PDF : généré à la demande par Chromium à partir de l’instantané ; aucun stockage persistant du PDF actuellement. Le serveur local n’est pas un hébergement PREPROD.
- QR/vérification : URL relative `/vet/verify/NUMERO` dans l’application PREPROD ; le générateur hébergé devra utiliser exactement l’origine PREPROD, jamais le Codespace.
- OMVQ : désactivé par défaut en base, aucun cache ni preuve locale importés. Sans service de navigateur configuré, brouillon en attente, signature et émission bloquées.
- Courriels : le pilote utilise exclusivement Mailpit local. La fonction d’invitation existante utilisant Resend ne doit pas être détournée pour envoyer des certificats. Aucun envoi externe pendant la validation.

## Dépendance externe à résoudre

Le dépôt déploie une application Vite statique sur Vercel. Le worker Node/Playwright est explicitement limité aux connexions Supabase locales. Cette session ne dispose ni d’un worker hébergé existant identifié, ni d’un accès administrateur Vercel. Les variables/secrets d’environnement GitHub ne sont pas lisibles avec le jeton disponible (HTTP 403), mais le déploiement Git existant est observable.

Options : adapter le worker aux fonctions Node Vercel avec un Chromium compatible et les limites réelles du projet, ou fournir un service de navigateur autorisé. Ne pas ajouter d’abonnement/service externe sans choix explicite. La documentation Vercel traite les limites des fonctions : https://vercel.com/docs/functions/limitations ; l’exemple Supabase s’appuie sur un navigateur distant : https://supabase.com/docs/guides/functions/examples/screenshots.

La connexion privée et les brouillons peuvent être promus séparément. Le parcours émission/PDF/signature réelle restera bloqué tant que ce service, son origine PREPROD, ses secrets PREPROD et son transport de courriels de test ne seront pas configurés et validés. L’interface l’annonce explicitement.

## Ordre et récupération

1. Contrôler le diff, comparer les tests avec `preprod`, valider les politiques et la chaîne en local.
2. Créer la PR vers `preprod` et attendre les contrôles obligatoires. Aucune exemption ou contournement des protections.
3. Avant bascule : confirmer à nouveau l’URL PostgreSQL PREPROD ; capturer schéma/historique de migrations et définition du moteur santé dans un répertoire privé hors Git. Dry-run Supabase CLI, limité aux migrations vétérinaires attendues ; aucun reset, seed ou `migration repair`.
4. Appliquer les migrations additives approuvées avant que le déploiement expose les nouvelles routes à des utilisateurs. Si la fusion déclenche Vercel automatiquement, privilégier l’application après validations de PR et immédiatement avant fusion afin d’éviter une application pointant vers des tables absentes.
5. En cas d’échec : ne pas poursuivre la fusion ; conserver le dernier déploiement. Chaque migration est transactionnelle via la CLI ; inspecter l’historique avant reprise. Ne pas supprimer les tables/certificats déjà créés. Pour neutraliser le portail, désactiver OMVQ et suspendre les émetteurs ; une régression du moteur santé impose une migration corrective utilisant la définition sauvegardée, jamais un reset. Rétablir l’interface par PR de revert si nécessaire.
6. Vérifier le commit réellement déployé, les routes et les droits sur PREPROD avec de nouvelles données explicitement identifiées comme tests, sans preuve OMVQ positive simulée ni courrier à une personne réelle.

## Vérifications avant PR

- Build, draw, payout, identity, governing, eligibility et paid-warmup : réussis sur une archive propre de `origin/preprod` et sur le pilote.
- SQL local : 28/30 fichiers réussis, dont 81 assertions vétérinaires. Les deux échecs se reproduisent avec les tests de `origin/preprod`, le moteur documentaire antérieur et sans le trigger vétérinaire : `bloc3_final_validation.sql` (vaccins de fixture expirés le 15 juillet 2026) et `compatibility_views_security_invoker.sql:106` (3 journées de fixture visibles, attendu 1). Aucun correctif sans rapport intégré à cette promotion.
- Le workflow `Veterinary PREPROD verification` crée ses propres comptes à mots de passe aléatoires via l’API Admin, sans email de confirmation ni import du seed local. Il vérifie les brouillons et le refus d’émission sans OMVQ ; suspend ses cliniques, retire son administrateur et désactive ses comptes en fin d’exécution. Les éléments impossibles sans worker sont explicitement signalés comme bloqués, jamais simulés comme réussis.
