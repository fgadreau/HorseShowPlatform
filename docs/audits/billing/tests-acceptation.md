# Tests d'acceptation à implémenter — comptes numérotés

Statut : scénarios et assertions préparés **avant implémentation**. Aucun test
ci-dessous n'est présenté comme exécuté. Les seuls diagnostics déjà exécutés sont
ceux de l’audit initial (annulation d’une vente émise et paiement non reflété dans le solde). Les tests SQL/services/navigateur seront
ajoutés avec la première tranche pour vérifier son comportement réel.

Fixtures : deux associations, deux secrétaires autorisées distinctes, un personnel
non autorisé, deux comptes clients payeurs sans dépendance au login, un entraîneur,
plusieurs chevaux et mandats actifs/expirés/révoqués. Deux concours réels, plusieurs types/contextes hors concours
(dont deux activités du même type et de la même année) et des devises différentes uniquement entre contextes distincts. Taxes A/B fictives; aucune donnée PROD.

## SQL et transactions concurrentes

| ID | Action | Assertions obligatoires |
| --- | --- | --- |
| Q01 | Première vente puis autre vente, même portée | Un compte, un numéro public non NULL, deux frais; aucun numéro de facture. |
| Q02 | Deux connexions SQL, deux secrétaires, première vente simultanée | Un seul compte/numéro, deux ventes légitimes conservées; soldes exacts. Barrière de concurrence réelle, pas deux appels séquentiels. |
| Q03 | Même clé et contenu, appels simultanés puis retry après commit | Même réponse, un frais et un numéro; compte sans doublon. Clé identique/contenu différent : conflit sans écriture. |
| Q04 | Même portée après fermeture | Retrouve le compte fermé; ajout de frais refusé, aucun nouveau compte/facture. |
| Q05 | Changer payeur, concours ou contexte hors concours | Comptes distincts pour les portées distinctes; aucune création de faux show. Deux opérations de contextes hors concours différents ne se mélangent pas. |
| Q06 | Plusieurs chevaux, un payeur; entraîneur pour deux propriétaires | Un compte pour le payeur unique; deux comptes quand les propriétaires paient chacun. Auteur entraîneur ne remplace pas le payeur. Chaque frais/élément est créé distinctement pour un seul payeur; aucune division automatique. Rattachements/provenance conservés. |
| Q07 | Renommer concours/client, changer le login lié au contact | UUID du compte client et du compte, numéro public et références documentaires inchangés. Compte client sans utilisateur Auth accepté. |
| Q08 | Vente gratuite ou réservation en attente en première opération, puis échec forcé | Succès : compte numéroté sans facture/paiement inventé. Échec : rollback de l'opération et du compte créé, aucun orphelin; numéro publié jamais recyclé. |
| Q09 | Deux ventes 100 taxable A+B (5+10) et 40 exempt | Sous-total 140, taxes détaillées 5 et 10, total 155; exemption justifiée. Arrondis décimaux de petites quantités et taxe non supportée testés. |
| Q10 | Comptant 50 puis Interac 105 | Deux paiements, deux reçus distincts, même numéro de compte; soldes 105 puis zéro; compte ouvert et aucune facture avant fermeture. |
| Q11 | Retry paiement; deux clés avec même référence Interac; deux paiements concurrents dépassant ensemble le solde | Un encaissement par opération/virement réel; doublon bancaire refusé; plafond vérifié sous verrou. Deux remises comptant légitimes ne sont pas fusionnées arbitrairement. |
| Q12 | Affectation à un frais d'autre compte, suraffectation ou devise différente | Refus et rollback complet paiement/reçu/affectations/journal. Aucun encaissement orphelin. |
| Q13 | Fonds annoncés/préautorisés; requis réservation 100, encaissé affecté 40 puis 60 | Aucune confirmation avant 100 encaissés affectés. Paiement d'une vente distincte n'active pas la réservation. Activation une seule fois malgré retry. Test métier à exécuter lors du raccordement des réservations. |
| Q14 | Deux fermetures concurrentes, même clé puis clés différentes | Une facture finale et un numéro officiel, état fermé cohérent. Retry retourne la même pièce; deuxième clé ne crée pas de facture. |
| Q15 | Vente concurrente à la fermeture | Sérialisation : frais inclus dans une version confirmée, ou conflit/refus; jamais frais omis ni ajouté après instantané. Une version périmée impose un nouveau récapitulatif. |
| Q16 | UPDATE/DELETE directs sur final/reçu, ancien trigger essayant de modifier le document | Refus SQL même hors interface; instantané identique. Changer taux, contact, entreprise ou adresse ensuite n’affecte pas les pièces, y compris les relevés déjà produits. |
| Q17 | Personnel autre association, client ordinaire, agent sur vente générale | Refus RPC et DML direct; aucun compte créé, aucun numéro/document accessible. Secrétaire de show refusée sur autre show et compte hors concours sans droit association/type. |
| Q18 | Mandat cheval A utilisé pour B, autre payeur, marchandise/adhésion, mandat expiré/révoqué | Refus serveur. Test positif du mandat admissible dans la tranche métier; verrou/révocation concurrente vérifie le point d'autorisation documenté. |
| Q19 | Deviner un numéro et appeler recherche/document/relevé | Aucune fuite inter-client/association; agent d'un cheval ne voit pas tout le compte propriétaire. |
| Q20 | Ancien writer pendant adoption d'un contexte, puis après adoption | Verrou commun; une seule mécanique écrit. Ancienne source non raccordée refusée; aucun doublon frais/invoices/nouveau final. |
| Q21 | Reprise d'historique avec factures multiples et taxes agrégées | Aucun UUID/numéro/paiement/fichier remplacé, aucun détail fiscal inventé; contexte ambigu non adopté. Nouvelle référence de reprise clairement distincte d'une référence historique. |
| Q22 | Séquences concurrentes, collision de format, recherche d'un compte fermé | Unicité par association, pas de recyclage, séries compte/reçu/facture distinctes; numéro visible/recherchable après fermeture. |
| Q23 | Ajouter un type clinique/location/services par configuration | Même schéma et transactions financières; nom public localisé, préfixe, période, catégories, règles, dates et permissions résolus depuis une version. Aucun nouveau modèle financier. |
| Q24 | Frais hors catégorie, opération avant ouverture/après fermeture, droit du type absent | Refus serveur sans écritures partielles. Date de fin ne produit aucune facture automatique et n'interdit pas de régler une dette existante. Règle de type n'élargit pas un mandat et ne simule pas de fonds reçus. |
| Q25 | Deux contextes de même type/année; boutique sans année | Comptes distincts par contexte, compte réutilisé au sein du même contexte; aucune unicité fondée seulement sur type/période/nom. |
| Q26 | Modifier préfixe/période/libellé/règle après ouverture; collision de préfixes entre types | Numéros existants et pièces historiques inchangés, nouvelle configuration versionnée; aucune collision publique dans l'association. |
| Q27 | Reprendre une vente historique sans show, type/période indémontrables | Pas de classement automatique; rapprochement explicite requis, documents/UUID et montant fiscal agrégé conservés. |
| Q28 | Devise contradictoire injectée dans une vente/paiement; tentative de second compte par devise | Refus serveur, un seul compte par association/contexte/compte client payeur; aucune conversion, frais et documents dans la devise du contexte. |
| Q29 | Changer devise du contexte après première opération, même solde zéro | Refus; les coordonnées monétaires du compte et de chaque pièce restent figées. Autre contexte avec autre devise autorisé. |
| Q30 | Contact avec/sans entreprise, sans login, puis coordonnées modifiées | Même compte client stable; nom du contact toujours présent, entreprise facultative; anciens relevés/reçus/final identiques, nouveau relevé distinct avec nouvelles coordonnées. Aucun nom d'écurie copié comme entreprise. |
| Q31 | Tentative de création de frais avec plusieurs payeurs/comptes | Refus intégral; seuls des éléments distincts à payeur unique sont admis. Aucun scénario d'arrondi/ventilation automatique entre payeurs. |
| Q32 | Frais ordinaire tardif, nouvelle ouverture ou double fermeture | Refus de frais/réouverture et aucun second compte/final. Extension note de débit uniquement spécifiée pour plus tard, pas de RPC/UI active dans la tranche. |

Exécuter la concurrence dans plusieurs transactions PostgreSQL indépendantes avec
barrière, timeout et assertions après commit. Des tests entièrement encapsulés
dans un seul ROLLBACK ne prouvent pas les courses entre secrétaires. Base locale
jetable, fixture isolée, contrôle avant/après de l'historique; aucune migration distante.

## Services

| ID | Scénario | Assertion |
| --- | --- | --- |
| V01 | Timeout après commit, rafraîchissement échoué, retry/rechargement | Clé conservée et réponse durable retrouvée; pas de création d'une nouvelle commande à l'aveugle. |
| V02 | Double clic avant rerender React | Une soumission locale; protection SQL indépendante toujours nécessaire. |
| V03 | Une clé avec vente modifiée | Conflit explicite; la première opération est résolue avant d'autoriser une nouvelle. |
| V04 | Auteur/login injecté, contact d'autre association, erreur de permission | Auteur jamais considéré comme fiable; refus serveur affiché sans fallback legacy. |
| V05 | Paiement partiel puis finalisation périmée | Affichage du solde serveur; nouvelle version chargée avant confirmation, aucun arrondi JS faisant foi. |
| V06 | PDF indisponible après paiement/finalisation réussie | Signale pièce en préparation, conserve références; relance du rendu seule, aucun réencaissement/réémission. |
| V08 | Type configurable et noms client | DTO conserve type/contexte/version et libellé localisé; aucun fallback vers le terme interdit, aucune règle de permission ou de paiement décidée seulement dans le navigateur. |
| V09 | Devise injectée, plusieurs payeurs dans une ligne | Pas de paramètre de choix de devise dans la vente; devise serveur affichée, refus sans fallback ni division automatique. |
| V10 | Coordonnées et documents | DTO comprend nom contact, entreprise facultative, adresse/coordonnées et numéros fiscaux pertinents; relecture des pièces depuis snapshot, pas depuis le contact courant. |
| V07 | Rendu compte/reçu/facture | Identifiants typés distincts; numéro de compte conservé dans chaque DTO et export, aucun numéro de facture avant fermeture. |

## Navigateur, FR/EN, ordinateur et mobile

| ID | Parcours | Assertions |
| --- | --- | --- |
| N01 | Vente secrétaire → relevé → comptant partiel → autre vente → Interac → fermeture | Libellés validés, détail fiscal, comptes/reçus/final distincts, solde et identités exacts; captures des étapes et documents. |
| N02 | Deux sessions de secrétaires sur le même payeur/contexte | Même numéro public; deux opérations légitimes visibles sans écrasement; course fermeture/vente maîtrisée. |
| N03 | Double clic vente/paiement/fermeture avec latence et réponse perdue | Une écriture par intention, un reçu par paiement, une facture finale. Vérifier les données serveur, pas seulement le nombre de toasts. |
| N04 | Contextes adhésion/nomination séparés | Administration : Compte hors concours. Client : Compte d’adhésion — 2027 et Compte de nomination — Futurité 2027; numéros distincts, aucun événement dans calendriers/statistiques. |
| N05 | Recherche par numéro, impression/téléchargement des trois documents | Référence du compte partout; relevé clairement provisoire; facture finale seulement après fermeture, stable après modification du catalogue. |
| N06 | Changer d'utilisateur, client sans login, agent, autre association | Payeur stable et permissions réelles; pas d'accès gagné par modification URL/numéro. |
| N08 | Boutique, adhésion, nomination, clinique, location et services en FR/EN | Noms précis partout, périodes pertinentes seulement, préfixe configuré; contrôle écran administratif/client, recherche, relevé, reçu et facture finale. Exemple NOM-2027-00142 cohérent sur les pièces. |
| N07 | 390 px et bureau, clavier, FR/EN | En-tête, numéro, statut et solde lisibles; focus/erreurs accessibles, actions compréhensibles; aucune appellation principale « folio », « dossier du show » ou « réservation » pour le compte; aucun terme « campagne » affiché aux utilisateurs. |

Les mocks réseau peuvent couvrir erreurs/latence côté service et UI, mais la preuve
de permissions/concurrence finale doit inclure le serveur local réel. Le rapport
séparera tests mockés, intégration SQL et parcours navigateur réel; il n'assimilera
pas une capture de fixture à un E2E réussi.

## Navigation à couvrir après autorisation

| ID | Action | Assertions |
| --- | --- | --- |
| N09 | Lien direct concours B/onglet comptes avec concours A précédemment sélectionné | URL prioritaire, nom/dates/statut et données de B; aucun fallback vers A ou le premier concours. Même résultat au refresh et après connexion. |
| N10 | Sélecteur change le concours; retour/précédent navigateur | URL association/concours/onglet cohérente; onglet conservé si autorisé, réponse réseau obsolète ignorée. Saisie non sauvée protégée. |
| N11 | Concours introuvable/interdit, autre association ou onglet non autorisé | Erreur/accès refusé; aucune donnée d'un autre concours présentée comme solution de repli. Contrôles serveur intacts. |
| N12 | Desktop/mobile, accès Concours puis Plus et Voir tous les concours | Menu vertical association conservé; en-tête et onglets contextuels, destinations distinctes; historique accessible via liste, pas déroulé dans le menu vertical. Focus et onglets mobiles accessibles. |
| N13 | Finance hors concours et anciennes routes publiques/vet | Filtres par type dans la finance existante; aucune nouvelle section principale obligatoire. `/shows/:slug`, `/vet`, fichiers et API existants préservés. |
| N14 | Vente et pièces avec/sans entreprise | Nom contact et entreprise affichés conformément aux snapshots; devise visible mais non sélectionnable, un seul payeur par frais; aucune interface tardive de note de débit. |

Les notes de débit futures auront leurs propres tests de plafonds/effets,
idempotence, droits, taxes et lien immuable au final lors de leur implémentation.
Elles ne sont pas des scénarios exigés pour une interface de première tranche.
Le grand livre, la paie, les fournisseurs, le rapprochement bancaire complet et
les états financiers ne sont ni des fonctionnalités ni des tests à livrer dans HSP.

**Attendre l'autorisation explicite après revue avant migrations ou tests exécutables.**
