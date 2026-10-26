# Vérification des contacts homonymes

La création manuelle, l’import NRHA et les formulaires rapides partagent une
vérification des contacts déjà accessibles à l’utilisateur. Le répertoire du
personnel conserve aussi sa recherche globale autorisée. Les résultats locaux
et distants sont regroupés sans répéter la même fiche.

Un même nom déclenche une vérification même sans courriel ou téléphone, avec
une date de naissance différente ou lorsqu’un deuxième prénom est absent.
Le nom seul ne prouve pas qu’il s’agit de la même personne : l’utilisateur peut
réutiliser une fiche, corriger les informations ou confirmer explicitement
qu’il s’agit d’un homonyme. Un courriel identique conserve la règle existante
qui demande de réutiliser la fiche ou de corriger le courriel.

La confirmation d’un homonyme vaut pour la création en cours. Elle ne masque
pas les fiches déjà accessibles lors des créations suivantes, même si la
recherche globale a précédemment enregistré une confirmation de distinction.
Les correspondances locales ne produisent pas de nouvelle dérogation globale.
Le choix d’une fiche existante n’ajoute pas un contact.

Cette vérification ne donne aucun accès supplémentaire aux contacts privés et
ne fusionne ni ne supprime les fiches existantes. Aucun changement de schéma.
Un membre ne peut donc pas rechercher une personne dans le répertoire privé
de l’association pour confirmer un homonyme. Si la fiche lui est inaccessible,
le nom seul ne permet pas de la détecter depuis son compte. Un éventuel parcours
de demande de rattachement avec approbation reste une fonctionnalité distincte.

Validation : `npm run build`, `npm run test:identity`,
`npm run test:contact-duplicates:browser`, `npm run test:client:mobile`.
Le navigateur utilise uniquement des contacts fictifs, sans service distant,
en français et anglais sur téléphone portrait/paysage. Le test dédié est en CI.
