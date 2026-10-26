# Horaire, paid warm-up et admissibilité

Les membres demandent les paid warm-up uniquement dans l’horaire du formulaire
Inscription. « Mes demandes de paid warm-up » affiche le suivi et permet
d’annuler une demande ; il ne propose plus de choisir un cheval ni de demander
une place. Les boutons et panneaux reprennent les classes visuelles communes.
Le secrétariat conserve la gestion de son registre et de la liste d’attente.

Après le choix du cheval et du cavalier, HSP vérifie les classes NRHA de la
journée affichée, puis poursuit les autres journées dans l’ordre de l’horaire.
Les réponses apparaissent progressivement. Les requêtes sont séquentielles ;
changer de journée ne relance pas la file. Changer d’équipe ignore les réponses
de l’ancienne équipe. Un échec ne bloque pas les journées suivantes et un bouton
permet de réessayer les vérifications échouées. La validation finale avant
inscription reste en place.

Les anciennes listes NRHA Top Riders ne sont plus chargées, importables depuis
les réglages ou utilisées pour refuser localement une classe. Les décisions
NRHA passent par l’intégration ReinerSuite et ses politiques de disponibilité.
Les données historiques des listes importées sont conservées en base.

Dans **Horaire → Catalogue récurrent**, développer un bloc puis cliquer sur
**Inéligibilité** à côté d’une classe maison. L’association peut ajouter un
cavalier et un motif interne facultatif, puis retirer l’exclusion.
Une exclusion s’applique jusqu’à son retrait à toutes les occurrences de cette
classe récurrente dans les concours de cette association. Elle ne s’étend pas
aux autres classes, aux autres associations ou aux classes sanctionnées.
Elle n’annule aucune inscription existante.

La liste et les motifs restent visibles uniquement au personnel autorisé de
l’association. Le formulaire du membre reçoit seulement les identifiants des
classes bloquées pour sa propre équipe. Une vérification serveur interdit aussi
de contourner l’exclusion par une inscription directe ou une modification du
cavalier ou de la classe.

## Validation

- `npm run build`
- `npm run test:schedule:browser` : suivi sans demande, styles mobiles FR/EN,
  calcul des trois journées, absence de doublon après navigation, changement de
  cheval, liste NRHA importée ignorée, sélection maison bloquée et gestion de liste.
- `npm run test:client:mobile` : pages et formulaires clients dans neuf formats.
- `npm run test:eligibility` : moteur d’admissibilité.
- `supabase/tests/house_class_ineligibility.sql` : transaction annulée, isolation
  des associations, permissions staff/membre, confidentialité, refus serveur,
  réutilisation dans plusieurs concours et retrait d’exclusion.

Migration : `house_class_ineligibility`, préprod uniquement.
