# Revue mobile du parcours client — 26 octobre 2026

Branche : `fix/preprod-client-mobile`, destinée à `preprod`.

## Changements

- Les appels à compléter le profil ou ajouter un cheval sont des boutons
  entièrement cliquables ; texte et action restent dans la largeur disponible.
- Dans le profil, les titres des étapes sont cliquables et les boutons
  « Compléter » restent visibles sur téléphone. Le titre du profil ouvre le
  formulaire et place le focus dans le premier champ.
- Les champs du profil ont des libellés associés et des valeurs d'autocomplétion.
  Leur disposition évite les groupes de quatre champs étroits.
- Le menu mobile conserve le même fonctionnement jusqu'à 980 px, notamment en
  paysage. La liste défile indépendamment ; langue et déconnexion restent au bas
  de la zone visible. Le contenu derrière le menu devient inactif.
- Les fenêtres partagées sont rendues hors des conteneurs de page ; la bannière
  de préprod ne recouvre plus leur fermeture. Leur en-tête reste visible pendant
  le défilement. Le focus reste dans la fenêtre et revient au contrôle d'ouverture.
- Menu et fenêtres suivent `visualViewport` pendant le zoom ou les changements
  de zone visible. Le zoom n'est pas désactivé. Les champs mobiles utilisent au
  moins 16 px pour éviter le zoom automatique de saisie sur iOS.

## Reining initial

Reining est présélectionné dans le formulaire initial de répertoire. Le
participant confirme explicitement le partage de ses fiches avec l'association
nommée avant l'inscription. Le chargement d'une association ou une connexion
ne déclenche aucune inscription : l'ordre des associations publiques ne peut
donc pas provoquer de partage automatique. Tout choix existant est conservé.

La fonction utilitaire d'initialisation n'est pas appelée par le chargement du
contexte ; le formulaire utilise l'inscription explicite existante. Elle
ne crée ni rôle d'organisation ni carte de membre payante. Elle
s'exécute avec les droits et politiques RLS de l'appelant, puis réutilise la
fonction existante d'inscription à un répertoire. Elle est réservée aux sessions
authentifiées. Les migrations `20261026130114` et `20261026130312` ont été
appliquées uniquement à Supabase PREPROD (`qaguotdproxamgudnnsd`). Les fichiers
canoniques portent les mêmes versions que l'historique distant.

Lors de l'ajout d'un cheval, Reining est également présélectionné s'il est actif ;
le choix reste modifiable. Le défaut de l'association sert de repli si Reining
n'est pas disponible.

## Vérification reproductible

```sh
npm ci
npm run build
npm run test:client:mobile
```

Le test de navigateur utilise Chrome installé, ou le canal indiqué dans
`MOBILE_BROWSER_CHANNEL` (par exemple `msedge`). Il démarre un serveur local
avec un client Supabase simulé et bloque tout trafic externe : aucun paiement,
courriel ni changement de compte réel ne part de cette revue.

Formats : 320×568, 390×844, 430×932, 667×375, 844×390, 932×430,
768×1024, 1024×768 et 1440×900, chacun en français et en anglais.

Pages : connexion, création de compte, tableau de bord, profil, chevaux,
cavaliers, inscriptions, réservations, numéros de dos, facturation personnelle.

Formulaires : profil (édition et sauvegarde simulée), cheval, cavalier,
inscription, réservation et carte de membre. Les tests vérifient l'absence de
débordement de page, les champs non coupés, les actions de complétion, la sélection
Reining malgré un autre défaut d'association, la rotation, la déconnexion et la
fermeture d'une longue fenêtre après défilement et avec un zoom de 200 %.

Captures de revue générées dans `.tmp/mobile-client/` (artefacts régénérables).

Le script SQL [`supabase/tests/default_reining_directory.sql`](../supabase/tests/default_reining_directory.sql)
a réussi sur PREPROD avec des utilisateurs et associations fictifs créés dans
une transaction annulée. Il vérifie droits d'appel, ajout initial, absence de
doublons, conservation d'un autre répertoire, absence de rôle/carte et refus d'une
association privée. Les alertes de sécurité Supabase ne présentent aucune
nouvelle entrée après les migrations.

## Limites et livraison

La matrice est exécutée sur Chromium. Une validation sur appareils réels Safari
iOS et Chrome Android reste utile pour leur clavier et les gestes natifs.
Les services de paiement et l'intégralité des opérations métier ne sont pas
retestés par cette revue d'interface. Les écrans d'administration ne font pas
partie de cette matrice client.

Le frontend doit être intégré par PR vers `preprod` pour être actif sur
`https://preprod.horseshowplatform.com`. Aucune livraison PROD n'est effectuée.
