# Identité HSP — aperçu de validation

Branche : `feat/hsp-aubergine-identity`, créée à partir de la branche de travail
`fix/vet-worker-api-routing-2026-09-06`. Aucune fusion, publication distante,
migration ou promotion d’environnement.

La palette est centralisée dans `src/theme.css`. Le composant `Brand` choisit le
logo complet dans la navigation ordinateur, l’accueil public et le portail
vétérinaire; le symbole est utilisé dans la connexion et la navigation mobile.
Les trois SVG de `public/branding/` sont strictement identiques aux originaux
conservés dans `branding/`. Le favicon SVG et la couleur du navigateur sont
renseignés dans `index.html`. Aucun manifeste PWA ou jeu d’icônes d’application
n’existait à remplacer.

Les composants partagés utilisent des surfaces claires, des bordures neutres,
des sélections aubergine et un focus visible. Les couleurs de succès, erreur,
avertissement, santé et plans restent fonctionnelles. Les logos et données des
associations ne sont pas modifiés. La navigation mobile ne recouvre plus les
modales. La densité des tableaux et les parcours sont conservés.

Aucun mode sombre n’existait. La palette déclare explicitement le mode clair.
Les traductions existantes sont conservées; la connexion a été vérifiée en FR
et EN. Les pages publiques et le portail vétérinaire restent dans les langues
qu’ils proposaient déjà.

## Consulter l’aperçu

Avec le serveur local en cours :
[ouvrir l’aperçu](http://localhost:5173/scripts/branding-preview/).
Dans Codespaces, ouvrir le port 5173 puis ajouter `/scripts/branding-preview/`.
Cet aperçu emploie les composants réels et des données fictives, avec des
réponses réseau simulées. Il n’est pas inclus dans la compilation de
l’application. Il sert à la revue visuelle, pas à tester les opérations métier.

Pour le relancer (arrêter d’abord un autre Vite sur ce port) :

```bash
VITE_DEPLOY_ENV=local VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=preview-fixture npm run dev
```

Pour régénérer les captures avec Chromium déjà installé :

```bash
CHROMIUM_PATH=/tmp/chromium node scripts/branding-preview/capture.mjs
```

## Captures

| Écran | Ordinateur 1440 px | Mobile 390 px |
| --- | --- | --- |
| Connexion FR | [capture](auth-1440.png) | [capture](auth-390.png) |
| Connexion EN | [capture](auth-en-1440.png) | [capture](auth-en-390.png) |
| Navigation et liste | [capture](navigation-1440.png) | [menu ouvert](navigation-390.png) |
| Formulaire en modale | [capture](form-1440.png) | [capture](form-390.png) |
| Accueil public | [capture](public-1440.png) | [capture](public-390.png) |
| Concours public | [capture](show-1440.png) | [capture](show-390.png) |
| Connexion vétérinaire | [capture](vet-1440.png) | [capture](vet-390.png) |
| Formulaire vétérinaire | [capture](vet-editor-1440.png) | [capture](vet-editor-390.png) |

Les captures longues incluent le document entier. Sur mobile, les modales et
le menu ouvert occupent le viewport et possèdent leur propre défilement.

## Vérifications et limites

- `npm run build` : réussi (TypeScript et Vite). Avertissements de taille des
  bundles et d’import dynamique/statique de `vetServices`; aucun blocage.
- `git diff --check` : réussi.
- Chromium : écrans ci-dessus sans erreur JavaScript ni débordement horizontal.
  Résultats détaillés dans [checks.json](checks.json).
- Focus des champs : contour aubergine de 2 px, décalage de 2 px; même règle
  pour boutons, liens, résumés et éléments à tabulation.
- Comparaison binaire : les trois SVG sont identiques aux fichiers fournis.
- Supabase local ne répondait pas : les tests métier E2E avec authentification,
  sauvegarde et permissions réelles ne sont pas validés par cet aperçu. Ils
  restent à exécuter sur une base isolée avant promotion.

Contrastes calculés à partir des valeurs sRGB de la palette :

| Usage | Rapport |
| --- | --- |
| Blanc sur aubergine principale | 8,96:1 |
| Blanc sur survol | 10,98:1 |
| Blanc sur état actif | 13,21:1 |
| Aubergine sur fond de sélection | 7,76:1 |
| Texte secondaire sur fond de page | 5,72:1 |
| Bordure de champ sur blanc | 3,06:1 |

Le [favicon à 16 et 32 px](favicon-16-32.png) a été rendu à sa taille réelle,
à densité 1. À 32 px, le symbole reste identifiable; à 16 px, les détails du
cavalier et du cheval se confondent. Une version simplifiée serait utile pour
cette taille. Le SVG approuvé est conservé en attendant cette déclinaison.
