# Affichage des contacts

Les choix de contacts affichent le nom complet uniquement, sans type, liste de
rôles ou mention « Association active ». Cette règle s’applique au sélecteur
commun des inscriptions, chevaux, santé et réservations, ainsi qu’aux choix de
contacts propres aux dossards et réservations.

Les formulaires de création rapide et de modification ne proposent plus de
choisir un type de contact. La classification existante est conservée lors
d’une modification ; les nouveaux contacts utilisent le contexte du formulaire.
Les rôles nécessaires à une réservation sont attribués automatiquement.

Les libellés des champs, comme Cavalier, Payeur ou Propriétaire du cheval,
restent présents pour expliquer la sélection. Les liens réels de propriété et
les accès d’agent sont toujours gérés par les parcours dédiés. Une étiquette
générale de contact n’indique jamais la propriété du cheval sélectionné.

Validation : build, `test:contact-duplicates:browser` (FR/EN, mobile portrait et
paysage, noms seuls et conservation du type à la modification),
`test:reservations:browser` (noms seuls et création sans choix de rôles).
