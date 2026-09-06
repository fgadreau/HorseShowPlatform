# Première tranche — contrat avant implémentation

Statut : préparation pour revue, aucune migration créée/appliquée à ce stade.
Base : `preprod` `6ca720b`, branche `feat/billing-folio-foundation`.
Le [modèle révisé](plan-et-scenarios.md) fait foi pour D1–D5 et la terminologie.

## Parcours livré ensemble

1. La secrétaire choisit un concours réel ou un contexte hors concours typé, un compte client payeur
   stable. La devise configurée du contexte est affichée en lecture seule. Le bénéficiaire et le cheval éventuel sont distincts.
   Un contexte hors concours ne crée aucune ligne dans `shows`.
2. Elle ajoute une vente au catalogue avec quantité, prix et éventuelle exemption
   autorisée. Le serveur résout les taxes configurées et conserve leurs détails;
   aucun taux fourni par le navigateur ne fait foi.
3. La première opération crée le **Compte du concours** ou le compte hors concours sous son nom public précis
   (p. ex. **Compte de nomination — Futurité 2027**)
   et son numéro public. Les suivantes retrouvent le même compte. L'écran montre
   le numéro, l'état Ouvert, les frais, les taxes, les paiements et le solde actuel.
4. **Relevé du compte** produit une vue provisoire datée. Aucun numéro de facture,
   aucun libellé laissant croire à une facture officielle; numéro du compte visible.
5. La secrétaire enregistre du comptant réellement reçu ou un Interac reçu, avec
   montant, date, référence et affectations. Le serveur ajoute un paiement séparé,
   un **Reçu de paiement** numéroté et ses affectations atomiquement. Le reçu porte
   aussi le numéro du compte; le compte reste ouvert et son solde est recalculé.
6. Elle peut ajouter une autre vente, puis un paiement partiel d'un autre moyen.
   Un double clic ou une réponse perdue ne recrée ni vente, ni paiement, ni reçu.
7. Elle ferme explicitement le compte après lecture d'un récapitulatif versionné.
   Une **Facture finale** unique reçoit son numéro distinct; le numéro du compte
   reste visible. Les frais et taxes figés ne peuvent plus être réécrits.
8. La recherche administrative retrouve compte, paiements et facture par le numéro
   public du compte, dans le périmètre de permissions de l'utilisateur.

Exemple de test fictif : vente 100,00 + taxes A=5,00 et B=10,00, vente exemptée
40,00 ⇒ sous-total 140,00, taxes 15,00, total 155,00. Comptant 50,00 ⇒ solde 105,00;
Interac 105,00 ⇒ solde zéro. Un compte, deux ventes, deux paiements, deux reçus,
aucune facture avant fermeture, une seule après. Les taux ne sont pas un barème légal.

## Contrats serveur à implémenter

| Commande | Entrées métier | Résultat et atomicité |
| --- | --- | --- |
| `add_billing_sale` | Clé idempotente, association, contexte, compte client payeur, produit/quantité/prix autorisé, bénéficiaire et cheval éventuel | Vérifie le personnel, le payeur, le routage, les catégories autorisées et les dates/politiques du contexte; résout/crée le compte numéroté, calcule taxes, écrit frais/provenance/journal; retourne UUID + numéro + version + totaux. Auteur et devise résolus par le serveur; un seul payeur/compte par frais, aucune ventilation automatique. |
| `record_billing_payment` | Clé, compte, version attendue, montant, moyen, date de réception, référence, affectations | Verrouille le compte, impose la devise du contexte, valide fonds déclarés reçus et plafonds, crée paiement/reçu/affectations/journal; retourne numéro de reçu, numéro du compte et solde. Un Interac seulement annoncé est refusé. |
| `get_billing_statement` | Compte et droits de lecture | Produit et conserve un instantané daté versionné avec numéro public, coordonnées contact/entreprise, frais/taxes/paiements/solde; aucune facture officielle. Une relecture par identifiant retourne le même relevé. |
| `finalize_billing_folio` | Clé, compte, version du récapitulatif confirmé | Sous verrou, refuse un récapitulatif périmé; fige coordonnées contact/entreprise et montants dans l’instantané, attribue numéro de facture et ferme dans la même transaction. UNIQUE folio/facture protège aussi contre deux clés concurrentes. |
| `find_billing_account` | Association autorisée, numéro public | Recherche indexée et filtrée côté serveur; aucune fuite par numéro deviné. |
| `get_billing_document` | Type et UUID du document | Vérifie les droits; rendu depuis instantané, identifiants typés. Relancer le PDF n'émet pas une deuxième pièce. |

L'initialisation des types et contextes hors concours, des profils fiscaux et des séries numériques
requiert une configuration autorisée. Aucun taux ou numéro officiel arbitraire
n'est choisi par une vente. Les séries de tests sont explicitement fictives.
La clé idempotente reste stable après timeout/rechargement jusqu'à résolution;
une modification de contenu après erreur ambiguë exige de résoudre l'opération
précédente avant d'en créer une nouvelle. Un simple bouton désactivé ne suffit pas.

## Découpage exact des changements

| Étape | Fichiers / surfaces attendus | Critère de sortie |
| --- | --- | --- |
| A — Serveur | Migration additive dans `supabase/migrations/`, tests dans `supabase/tests/`; comptes clients, types configurables et contextes à devise unique, contact.company_name facultatif, comptes numérotés uniques sans devise dans la clé, taxes, transactions, RLS, séquences et routage | Sur base locale jetable : unicité, immuabilité, sommes, autorisations et concurrence réellement vérifiées. Aucune application distante. |
| B — Services | Module financier dédié appelé depuis `src/services/`; DTO distinguant compte/reçu/facture et identité client/login | Tests des retries, réponses perdues, version périmée, permissions, montants et erreurs; pas de deuxième writer legacy. |
| C — Interface | Navigation contextuelle et routes ci-dessous, formulaire contact (entreprise facultative), composants de `src/features/billing/` et branchement dans Dashboard | Parcours ci-dessus FR/EN, ordinateur/mobile, clavier; catégorie administrative Compte hors concours et nom client précis; détails des taxes et numéros lisibles. Historique ancien toujours accessible. |
| D — Documents | Rendu de relevé/reçu/facture depuis leurs données respectives, stockage/outbox | Instantanés stables, numéros distincts et référence du compte partout; panne de rendu relançable. |
| E — Validation/revue | Tests navigateur du dépôt, captures, rapport de validation | Matrice d'acceptation exécutée, erreurs documentées, aperçu consultable; promotion et migration distante soumises à autorisation distincte. |

Le périmètre pilote est un contexte neuf explicitement adopté. Les anciennes
sources non raccordées doivent y refuser les écritures financières côté serveur;
les autres contextes gardent le moteur actuel. Ne pas annoncer l'ensemble des
inscriptions/réservations comme migré après cette seule tranche.

## Configuration hors concours dans la tranche

Préparer le catalogue de types comme données versionnées : nom public FR/EN,
préfixe, période/année, catégories de frais, règles de paiement/activation, dates
et permissions. Les valeurs effectives appartiennent au contexte sélectionné;
la commande de vente n'invente pas de nouveau contexte à chaque achat.
Une boutique peut être permanente; adhésion 2027 et adhésion 2028 sont deux
contextes. Deux cliniques du même mois peuvent aussi être distinctes.

L'écran administratif affiche **Compte hors concours**; l'écran client, la
recherche et les pièces utilisent le nom précis, par exemple **Compte d'adhésion —
2027**, **Compte boutique** ou **Compte de nomination — Futurité 2027** avec
**No de compte : NOM-2027-00142**. Aucun libellé utilisateur ne reprend le terme
« campagne ». Le préfixe de cet exemple n'est pas une séquence officiellement configurée.

Ajouter un type ne demande pas un nouveau modèle financier. Le serveur vérifie
les règles du type/contexte et les droits réels; la configuration ne contourne
pas D3/D4. Une date de fermeture d'activité n'émet pas une facture automatiquement.
Le rendu fige les références des pièces déjà produites malgré une modification
ultérieure du type ou de sa période.

## Limites explicites

L'agent ne peut pas utiliser la commande de vente générale. Le raccordement des
mandats actifs et des services payants vient au lot métier, avec tests négatifs dès
le socle. La structure des affectations est présente dès le paiement initial.
Les notes de crédit/remboursements et une future note de débit liée sont prévues au modèle; l'interface ne permet
aucune correction après fermeture tant que ces commandes ne sont pas livrées.
Stripe, fermeture automatique et imports comptables effectifs ne font pas partie
de cette première tranche. La proposition de fermeture avec solde dû et le refus
d'excédent initial sont documentés dans le modèle, sans les présenter comme D1–D5.

Les éléments A–E attendent l’autorisation explicite après revue des documents.
Aucune migration ni implémentation exécutable ne commence maintenant. Ce document
n'est ni un aperçu fonctionnel ni une preuve de passage des tests.

## Navigation et routes — audit et cible

Audit du code actuel, en lecture seule :

| Surface actuelle | Constat | Réutilisation / adaptation proposée |
| --- | --- | --- |
| `src/App.tsx` (`matchPublicShowSlug`, `activeView`, `onViewChange`) | `/shows/:slug` est public; `/vet` est séparé. Les vues internes utilisent `useState<ViewKey>` et `setActiveView`, sans route interne portant le concours. | Garder les routes publiques/vet; ajouter un adaptateur de routes internes vers les vues existantes, compatible historique navigateur. |
| `src/features/navigation.ts` | Menu vertical association avec Concours, inscriptions, réservations, horaire/score, résultats et facturation; aucune liste des concours individuels dans ce menu. | Conserver l'ossature à gauche et les fonctions générales; déplacer l'accès contextuel dans les onglets, sans deuxième implémentation des vues. |
| `src/features/dashboard/Dashboard.tsx` (`selectedShowId`, `selectedShow`, `SHOW_CONTEXT_VIEW_KEYS`) | Sélection en état local, repli vers le premier concours disponible; sélecteur d'en-tête existant dans certaines vues, mais pas dans `shows`. Aucun concours mémorisé persistant trouvé dans ce chemin. | Réutiliser le sélecteur, étendre au conteneur Concours; URL prioritaire. Supprimer le repli silencieux lorsqu'un concours explicite est invalide/interdit. |
| Même Dashboard (`effectiveView`, rendus `entries/stalls/blocks/scoring/results/billing`) | Vues et filtrage association/concours déjà disponibles; contrôle frontend de rôle. | Réutiliser composants et données, conserver contrôles serveur; ne pas déduire l'autorisation d'un onglet visible. Séparer contexte concours et filtre hors concours de billing. |
| `vercel.json` | Fallback SPA vers `index.html`, route API vet et fichiers servis avant ce fallback. | Les liens internes proposés peuvent charger la SPA; vérifier chargement direct/refresh sans intercepter API, fichiers, routes publiques ou vet. |

Menu vertical à gauche = association. Dans **Concours**, en-tête = nom, dates,
statut du concours et sélecteur; onglets horizontaux = fonctions du concours.
Le sélecteur change de concours sans retour à la liste, propose les concours
pertinents et **Voir tous les concours** pour consulter l'historique. Aucun
concours historique individuel n'est ajouté au menu vertical.

Routes **proposées**, pas encore créées; préfixe interne distinct de `/shows/:slug` :

| Onglet / accès | URL proposée | Vue à réutiliser |
| --- | --- | --- |
| Concours / Voir tous les concours | `/app/associations/:organizationId/shows` | Liste `shows` existante. |
| Aperçu | `/app/associations/:organizationId/shows/:showId/overview` | Données du concours et synthèse ciblée; ne pas afficher l'aperçu global comme si filtré. |
| Inscriptions | `/app/associations/:organizationId/shows/:showId/entries` | `entries`. |
| Réservations | `/app/associations/:organizationId/shows/:showId/reservations` | `stalls`, stalles/camping existants. |
| Horaire | `/app/associations/:organizationId/shows/:showId/schedule` | Composants de planification actuellement accessibles via `blocks`/ShowScore, sans réécriture métier. |
| Comptes du concours | `/app/associations/:organizationId/shows/:showId/accounts` | Vues financières filtrées sur ce seul contexte; détail sous `/accounts/:folioId`. |
| Plus → Santé et conformité, Documents, Résultats ou ShowScore, Paramètres du concours | Même préfixe concours puis `/health`, `/documents`, `/results`, `/showscore`, `/settings` | Réutiliser les fonctions disponibles et leurs droits; ne pas créer un module Documents vide ni modifier les paramètres globaux de l'association. |
| Finance → Comptes hors concours | `/app/associations/:organizationId/billing?scope=non_event&type=:typeCode` | Section financière actuelle, filtres par type; pas de nouvelle section principale Activités hors concours. |

Chaque destination de Plus a sa propre URL; Plus est un menu et non une vue métier.
L'identité du concours dans l'URL gagne sur toute sélection en mémoire/persistée.
Au démarrage, valider l'association et le concours avant de charger les données;
URL invalide/inaccessible ⇒ erreur ou accès refusé, jamais affichage d'un autre
concours. Sans concours dans l'URL, proposer le sélecteur/la liste pertinente.
Le changement de concours met à jour l'URL et conserve l'onglet si autorisé; sinon
revient à l'aperçu du nouveau concours avec explication. Aucun fallback vers une
fonction non autorisée. Back/forward, refresh, lien après connexion et changement
d'association doivent rester cohérents. Prévenir la perte d'une saisie non sauvée;
une réponse réseau de l'ancien concours ne remplace pas celle du nouveau.

Sur mobile : onglets défilants ou sélecteur accessible, état actif et focus visibles.
Le menu gauche conserve son comportement mobile actuel. Pas de refonte massive du
menu, ni duplication de vue pour financer ce changement. Les opérations personnelles
et leurs permissions restent disponibles; les nouveaux liens n'élargissent pas
l'accès aux comptes clients.

## Diff de revue et conséquences

| Avant cette revue | Après / impact |
| --- | --- |
| Devise dans la clé de compte et choisie dans la commande | UNIQUE association/contexte/compte client payeur; devise serveur unique du contexte et snapshots cohérents. RPC de vente sans sélection de devise. |
| Références aux parts de réservation dans le raccordement | Frais/éléments distincts à payeur unique; aucun moteur ni test de division d'une dépense. Préserver seulement l'historique existant. |
| Coordonnées payeur génériques | `contacts.company_name` facultatif, mêmes contacts/UUID, snapshots complets pour chaque relevé/reçu/final produit. |
| Correction future limitée au crédit/remboursement | Extension par note de débit liée, sans nouvelle facture finale ni réouverture; aucun écran tardif dans la tranche. |
| Navigation interne en état React | Adaptateur URL association/concours/onglet; sélecteur et composants réutilisés, liens directs prioritaires sur la mémoire. |
| Exports sans frontière de produit explicite | HSP explique les opérations et exporte; grand livre, paie, fournisseurs, rapprochement bancaire complet et états financiers hors périmètre. |

Les scénarios SQL/services/navigateur sont des spécifications à implémenter après
accord, pas des tests déjà passés. Le diff Git de cette revue est exclusivement
documentaire; aucune modification des tables, RPC, routes ou écrans n'est exécutée.
