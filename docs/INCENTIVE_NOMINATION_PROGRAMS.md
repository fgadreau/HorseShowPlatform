# Programmes incitatifs et de nomination

Une association peut configurer cinq types de programmes :

- nomination de cheval ou de poulain;
- nomination annuelle d’étalon;
- souscription d’étalon avec nomination séparée de chaque poulain;
- programme incitatif pour étalons;
- programme incitatif à la performance.

La création d’un programme ne modifie jamais automatiquement l’admissibilité
des classes. Dans l’horaire, l’association ouvre les exigences d’une classe ou
d’un modèle de classe et coche explicitement le programme requis. La majorité
des classes peut donc demeurer sans exigence de nomination.

## Nominations et ventes

Chaque nomination possède une saison, un rôle (`horse`, `foal` ou `stallion`),
un statut, une période de validité et un numéro de référence facultatif. Pour
les programmes fondés sur un étalon, une progéniture active doit référencer la
nomination d’étalon qui la rend admissible.

Un utilisateur peut acheter une nomination depuis **Mes chevaux**. Si le prix
du programme est supérieur à zéro, HSP crée une vente et une facture brouillon.
La nomination demeure en attente jusqu’au paiement. Une progéniture peut aussi
rester en attente après paiement tant que l’association n’a pas confirmé
l’étalon admissible.

## Import CSV

L’import est disponible dans les paramètres de l’association. Il affiche un
aperçu et refuse l’écriture tant que le fichier contient une erreur de format.
Les séparateurs virgule et point-virgule sont acceptés, de même que les champs
entre guillemets.

En-têtes anglais :

```csv
program_code,horse_name,registration_number,nomination_role,season_year,status,nominated_on,valid_from,valid_until,qualifying_stallion_reference,reference_number,notes
```

Les équivalents français sont aussi acceptés : `code_programme`, `nom_cheval`,
`numero_enregistrement`, `role_nomination`, `saison`, `statut`,
`date_nomination`, `valide_du`, `valide_au`, `reference_etalon` et
`numero_reference`.

Le cheval est recherché d’abord par numéro d’enregistrement, puis par nom exact
si ce nom est unique dans les répertoires actifs de l’association. Pour un
poulain admissible par un étalon, la ligne de l’étalon doit précéder celle du
poulain et son `reference_number` doit être utilisé dans
`qualifying_stallion_reference`.
