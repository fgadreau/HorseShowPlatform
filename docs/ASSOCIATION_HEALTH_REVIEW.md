# Révision des certificats par l’association

Dans **Santé → Centre de conformité**, les admins et secrétaires de l’association
peuvent ouvrir un certificat et consulter la fiche actuelle du cheval à côté du
document : nom, naissance, sexe, race, robe, propriétaire, parents et références
d’identification. Ce résumé est en lecture seule. Les vaccins conservent leur
approbation manuelle et la saisie de la date figurant sur le certificat.

## Coggins : différence d’identité

La section **Coggins : révision de concordance** permet d’accepter une coquille
après vérification du fichier et des autres caractéristiques. Le nom extrait du
certificat est affiché séparément du nom dans l’application. Un motif de 10 à
2000 caractères est obligatoire pour accepter ou refuser.

La décision est versionnée : association, document, auteur, date, motif et lecture
d’identité examinée sont conservés. Un refus ultérieur retire la dérogation. La
décision ne réécrit ni le cheval, ni le certificat, ni les résultats automatiques,
et ne constitue pas une approbation pour une autre association.

L’approbation exige un fichier joint, un résultat négatif et une date de
prélèvement valide. Les résultats positifs et les contrôles signalant un
certificat annulé, non signé ou non EIA ne sont pas admissibles à cette action.
La validité reste calculée selon la politique de l’association et la date du
concours : accepter une différence d’identité ne prolonge pas l’expiration.

Une nouvelle lecture d’identité ou une modification du document rend la
dérogation précédente inapplicable. Il faut alors examiner le document à
nouveau. Les décisions passées restent consultables via **Afficher aussi les
décisions enregistrées**.

## Déploiement et tests

Appliquer `20261025000900_association_coggins_identity_review.sql` avant de
déployer le frontend. La migration ajoute une RPC réservée au personnel et les
références de la preuve examinée dans l’historique des décisions. Elle ne crée
aucune approbation pour les documents existants.

- `npm run build`
- `npm run test:vaccination-review:browser` : vaccins et Coggins, FR/EN,
  mobile/ordinateur, résumé, comparaison du nom, motif, erreur/reprise et gardes
  sur les certificats non admissibles; documents synthétiques et réseau simulé.
- `supabase/tests/association_coggins_identity_review.sql` : transaction annulée
  sur un schéma Supabase migré. Fournir via `psql -v` les variables `org_id`,
  `doc_id`, `staff_uid`, `member_uid` d’une fixture Coggins et d’une association
  exigeant ce document. Les UID sont ceux d’Auth, pas ceux de `user_profiles`.
  Le test prépare temporairement le document; utiliser une base de test. Il
  vérifie audit, portée de l’association, droits, refus, nouvelle lecture,
  résultat positif, signature manquante, date future, fichier absent et expiration.

L’activation de la fonctionnalité n’approuve pas automatiquement le Coggins de
Sailing For Platinum. La décision et son motif doivent venir du personnel après
examen du certificat.
