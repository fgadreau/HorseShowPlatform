# Tranche 1A.5 — Architecture de navigation et parcours UX

Architecture et périmètre du pilote fictif (Stripe test et PDF) approuvés — 6 septembre 2026. Base vérifiée : branche
`feat/billing-folio-foundation`, HEAD `a3067ed4f1a48b0216972187b706c631bc54d819`.
Les propositions ci-dessous ne sont pas des fonctionnalités livrées.

**Convention de lecture :** dans ce document, « pilote » désigne exclusivement le
**pilote de démonstration entièrement fictif**, prévu dans environ deux mois.
Le **premier déploiement réel**, envisagé l'an prochain, est une étape séparée,
soumise à une nouvelle autorisation et validation. Aucune réussite du pilote ne
vaut autorisation d'utiliser des données, des taux fiscaux ou des paiements réels.

## 1. Périmètre et objectifs

Audit du code en lecture seule; seul ce document est créé. Aucune interface, route,
permission, RPC, migration, donnée, PDF ou service n'est modifié. Aucun push.
Les trois documents contractuels et les trois SVG non suivis de `branding/` sont
préservés. Les maquettes sont documentaires, sans validation visuelle navigateur.

HSP reste un registre opérationnel inspiré d'un PMS hôtelier : un contexte, un
compte client payeur stable, un compte évolutif, plusieurs frais et encaissements,
puis une seule facture finale immuable. Il ne remplace pas la comptabilité générale.
Un frais a un payeur; un compte peut concerner plusieurs chevaux. Aucun partage
automatique de ligne, événement fictif ou second compte après fermeture.

Cette proposition intègre le complément « Mes comptes » et la finalisation par le
payeur. Cette dernière **n'est pas autorisée par 1A aujourd'hui** : elle nécessite
une extension serveur distincte, à approuver avant développement. 1B ne pourra pas
la rendre sûre avec de simples boutons ou conditions dans le navigateur.

## 2. Navigation actuelle observée et preuves

Les chemins ci-dessous sont des fichiers réels relatifs à la racine du dépôt.

| Source inspectée | Observation |
| --- | --- |
| `src/App.tsx`, `src/types/ui.ts` | `activeView: ViewKey` dans React; pas de route administrative par association/concours. Association sélectionnée dans l'état; rechargement via `loadAppContext`. |
| `src/features/navigation.ts`, `src/lib/i18n.ts` | Menu association : Vue d'ensemble, Notifications, Concours, personnes, Santé, Horaire (`blocks`), Inscriptions, Dossards, Réservations (`stalls`), Pointage, Résultats, Facturation (`billing`), Programmes, Paramètres. Les libellés exacts viennent d'i18n. |
| Même navigation, `Dashboard.tsx` | Espace personnel distinct : aperçu, profil, chevaux, contacts/cavaliers, inscriptions, dossards, réservations, `my-invoices`. Il ne s'agit pas encore de « Mes comptes ». |
| `src/features/dashboard/Dashboard.tsx:418` | Menu association affiché pour `organization_members.role` admin/secretary. L'administrateur plateforme peut avoir une vue administrative effective sans que la même condition affiche le menu association. |
| `Dashboard.tsx:535`, `:641`, `:781` | Sélecteur de concours partagé dans l'en-tête pour certaines vues. Repli sur le premier concours, pas d'identité dans l'URL. Le service trie les concours par date de début croissante. |
| `Dashboard.tsx:583` | Factures et ventes du concours sélectionné incluent aussi les lignes `show_id=NULL`. Les comptes personnels utilisent également ce mélange. |
| `src/features/shows/ShowsView.tsx` | Liste des concours, assistant de préparation, édition et annonces. Navigation par callback `onViewChange(ViewKey)`; le contrat de ce callback ne transporte pas l'identité du concours. |
| `src/features/classes/ClassesView.tsx:674` | Horaire par journées, blocs/classes/slates, warm-ups et Showbill; pas besoin de créer un second écran Horaire. |
| `src/features/entries/EntriesView.tsx`, `EntryForm.tsx`, `MyEntriesView.tsx` | Parcours secrétaire et personnel; identités cheval/propriétaire/cavalier/payeur déjà présentes dans les données. Conserver ces parcours et leurs contrôles métier. |
| `src/features/dashboard/StallsViews.tsx` | Réservations, inventaire/configuration, formulaires en modales, vues personnelles; `ReservationTabs`, `ContactPicker`, `SearchSelect` déjà employés. |
| `src/features/billing/BillingView.tsx` | Liste/recherche de factures, détail sélectionné en état local, panneaux repliables, vente manuelle avec prix et case fiscale modifiables; impression dans une fenêtre HTML. Même composant utilisé en personnel sans callbacks de vente. Ce sont des mécanismes legacy. |
| `src/features/settings/SettingsView.tsx`, `IncentiveProgramsSettings.tsx`, `src/features/people/MyContactsView.tsx`, `src/features/horses/MyHorsesView.tsx` | Configuration catalogue/adhésions/programmes; parcours d'achat d'adhésion et nomination existants. Ne pas les recréer dans Finance. |
| `src/services/supabaseServices.ts:299` | `loadAppContext` choisit une association et charge les collections actuelles. Pas de collection `show_roles` exposée comme capacité de navigation; pas de services de liste annuelle/recherche financière 1A. |
| `src/components/ui.tsx` | `ViewIntro`, `Metric`, `EmptyState`, `NoticeBanner`, `ModalDialog`, `SearchSelect`, `ContactPicker`, `FormActions`, `LanguageToggle`. La modale a un rôle dialog et Échap, mais pas de gestion complète de confinement/restauration du focus. |
| `src/styles.css:4236`, `:5887`, `Dashboard.tsx:669` | Sous 980 px le shell passe sur une colonne et la navigation en haut; sous 640 px menu mobile dépliable plein écran, fermeture sur choix/Échap, verrouillage du défilement. Aucun deuxième volet permanent nécessaire. |
| `src/App.tsx:110` et dispatch initial | `/shows/:slug` est une page publique; `/vet`, ses sous-chemins et l'hôte `vet.*` ouvrent le portail vétérinaire. À préserver. |
| `supabase/migrations/20260906000900_billing_folio_foundation.sql:145` | Autorisation serveur admin plateforme, admin/secrétaire association ou secrétaire de `show_roles`, avec `config.staff_roles`; consultation propre au payeur via `contacts.linked_user_id`. |

Carte actuelle concise :

```text
Application authentifiée (vue en état React)
├─ Association sélectionnée → menu vertical de fonctions générales ET de concours
│  ├─ Concours → liste / préparation / édition
│  ├─ Horaire, Inscriptions, Réservations, Pointage, Résultats
│  │  └─ sélecteur de concours dans l'en-tête
│  └─ Facturation → factures legacy + ventes (concours et NULL mélangés)
└─ Mon espace → mes activités → mes factures legacy
Pages séparées : /shows/:slug (public), /vet… (vétérinaire)
```

## 3. Problèmes et incohérences

1. Un lien administratif ne fixe pas le concours : actualisation, historique du
   navigateur et liens partagés ne peuvent pas restituer précisément la section.
2. Le premier concours peut devenir le contexte par défaut même s'il est ancien.
3. La facturation courante mélange concours et hors concours; elle n'est ni une
   vue annuelle globale ni le nouveau compte courant 1A.
4. Les fonctions opérationnelles encombrent le menu association. Il faut déplacer
   leurs accès, sans réécrire leurs formulaires ou dupliquer leur état métier.
5. La navigation ne représente pas complètement les droits de secrétaire de concours.
6. Les chevaux accessibles par mandat ne prouvent pas la qualité de payeur : les
   filtres des activités personnelles ne doivent pas être réutilisés pour les comptes.
7. L'écran legacy autorise prix/taxes manuels incompatibles avec 1A. Réutiliser son
   apparence, jamais brancher sa commande de vente telle quelle sur les comptes.
8. « Mes factures » ne décrit pas un compte encore ouvert et sans facture finale.

## 4. Architecture recommandée

Un shell association conservé, un seul espace Finance global, un espace concours
opérationnel et un espace personnel Mes comptes. Une route canonique de détail
administratif par compte, quel que soit le point d'entrée; une présentation payeur
séparée utilisant les mêmes identités et projections financières autorisées.

```text
Association → Finance → vue annuelle / recherche ─┐
Association → Concours → Comptes du concours ─────┴→ même détail de compte
Participant → Mes comptes → détail payeur du même compte (droits distincts)
```

## 5. Menu principal cible

À gauche sur ordinateur : conserver les fonctions générales existantes. Faire
évoluer **Facturation vers Finance**, plutôt qu'ajouter Finance à côté de Facturation.
Il y a une seule entrée financière administrative. Ce remplacement est approuvé.

Ordre recommandé : Vue d'ensemble, Notifications, Concours, répertoire de personnes,
Santé, Dossards, **Finance**, Programmes, Paramètres. Les libellés des répertoires
restent ceux de l'application. Horaire, Inscriptions, Réservations, Pointage et
Résultats rejoignent le concours; pas de doublons permanents. Dossards reste global,
car le composant actuel gère les plages et affectations à l'échelle association.
Santé reste global; le raccourci contextualisé sous Plus ouvre le même centre filtré.
Les presets d'horaire propres à l'association restent accessibles depuis l'écran
Horaire et les Paramètres, sans créer un second éditeur.

Dans Mon espace, remplacer **Mes factures par Mes comptes**. Aucun libellé Finance
pour le participant. Ne pas toucher aux autres entrées personnelles. Un membre du
personnel peut utiliser Mon espace, mais les requêtes « Mes comptes » filtrent
explicitement ses seuls comptes payeur, même s'il a par ailleurs des droits étendus.

## 6. Finance : structure et présentation

En-tête : association active, titre Finance, année courante par défaut, recherche.
Exactement trois onglets horizontaux : **Vue d'ensemble · Concours · Comptes hors concours**.
Pas d'onglets principaux Paiements, Documents, Reçus ou Factures.

| Onglet | Contenu et actions |
| --- | --- |
| Vue d'ensemble | Frais hors taxes, taxes, total TTC, encaissements affectés, solde à recevoir; comptes ouverts/fermés; concours avec comptes ouverts, contextes actifs, interventions. Chaque indicateur conduit à une liste filtrée. |
| Concours | Tableau dense sur ordinateur : nom/dates/statut, nombre de comptes, ouverts, frais TTC, reçu, solde, « Voir les comptes ». Liste de cartes compactes sur téléphone. Inclure tous les concours autorisés de l'année, même sans compte. |
| Comptes hors concours | Liste de contextes, filtres par type configuré, période, comptes ouverts/solde, accès à la liste des comptes. Nom public précis dans chaque ligne; configuration accessible seulement à l'admin. |

Ne jamais additionner CAD et USD en une valeur monétaire : regrouper les indicateurs
par devise, même si chaque contexte n'en possède qu'une. Afficher la portée annuelle
et la date d'actualisation; un zéro n'est pas un état de chargement ou une erreur.
La vue annuelle mesure les comptes rattachés à l'année, avec leurs encaissements
reçus à ce jour. Elle n'est pas un état des flux bancaires de l'année civile.

## 7. Espace opérationnel du concours

En-tête : association, sélecteur recherchable de concours, nom complet, dates,
statut métier et état temporel. Menu horizontal : **Aperçu · Inscriptions ·
Réservations · Horaire · Comptes du concours · Plus**.

Aperçu réutilise préparation/annonces de ShowsView; la liste générale est accessible
par « Voir tous les concours ». Horaire réutilise ClassesView, y compris warm-ups.
Réservations conserve ses sous-vues inventaire et réservations. Plus contient
**Santé et conformité**, **Pointage / ShowScore**, **Résultats**, **Paramètres du
concours**, et Documents seulement lorsque des documents métier sont réellement
raccordés. Ne pas inventer un dépôt documentaire vide. Conserver la restriction de
plan ShowScore (`hasPlanFeature`) en plus des permissions métier.

## 8. Deux accès, une même liste opérationnelle et un même détail

Finance / Concours / Voir les comptes ouvre la même URL de liste que Concours /
Comptes du concours. Le détail utilise `/associations/:orgId/accounts/:folioId`.
Il résout le contexte depuis le serveur : ne pas faire confiance à un concours
mémorisé ou à un paramètre fourni pour changer son appartenance.

Le fil d'Ariane présente l'association et le contexte réel. Un retour validé conserve
l'origine Finance (année/filtres) ou Concours (section/recherche). Il ne détermine
jamais les droits ou les données. Sans origine, retour vers la liste du contexte.
Le menu gauche indique Finance après entrée depuis Finance, Concours après entrée
opérationnelle; le contenu du compte et ses actions restent identiques.

## 9. Années et comptes hors concours

| Situation | Règle approuvée, à implémenter |
| --- | --- |
| Concours sur une année | Année de rattachement = année de début du concours, dans son calendrier local. |
| Concours à cheval sur décembre/janvier | Une seule année de rattachement : celle du début. Dates complètes visibles; aucune duplication des sommes. |
| Adhésion/nomination annuelle | Année de service explicitement configurée, pas année d'ouverture informatique. |
| Clinique/location sur une période | Année de début de service par défaut proposé, confirmation administrative avant adoption. |
| Boutique/service permanent | Recommandation : type permanent, mais contextes financiers annuels distincts (« Compte boutique — 2027 »). Aucune clôture automatique; un compte 2027 reste consultable/payable en 2028. Ne pas remettre les anciens soldes dans le nouveau contexte. |
| Paiement en année suivante | Reste affecté au compte et à l'année de contexte d'origine; date réelle sur le reçu. Indication « reçu en 2028 » dans le détail 2027. |

Alternative permanente rejetée comme défaut : compte unique à durée indéfinie,
qui ne permettrait plus de vendre après sa première finalisation. La découpe
annuelle est approuvée, mais pas encore implémentée. Les limites
1A (configuration figée, `config.period` sans année structurée dédiée) impliquent
un contrat d'année explicite et versionné à concevoir avant les requêtes annuelles.
Ne pas extraire l'année d'un nom libre. Ne pas reconstruire une année historique
sans preuve; afficher « Année à qualifier » dans une portée distincte, sans inventer.

## 10. Carte des routes : existant et proposition

Toutes les URL administratives/personnelles ci-dessous sont **proposées**, non créées.
Les UUID stables identifient les ressources; les numéros publics servent à rechercher.

| Actuel | Route cible proposée |
| --- | --- |
| `activeView=overview`, association en état | `/associations/:orgId/overview` |
| `activeView=billing` | `/associations/:orgId/finance/overview?year=2027` |
| Pas de vue financière annuelle concours | `/associations/:orgId/finance/shows?year=2027` |
| Ventes NULL mêlées aux concours | `/associations/:orgId/finance/non-event?year=2027&type=…` |
| Pas de liste de comptes par contexte hors concours | `/associations/:orgId/finance/contexts/:contextId/accounts` |
| `activeView=shows` | `/associations/:orgId/shows` (sélection et Voir tous) |
| Préparation/annonces en état local | `/associations/:orgId/shows/:showId/overview` |
| `entries`, `stalls`, `blocks` | `/associations/:orgId/shows/:showId/entries`, `/reservations`, `/schedule` (même préfixe) |
| Nouveau Compte du concours | `/associations/:orgId/shows/:showId/accounts` |
| `scoring`, `results` | Même préfixe concours + `/scoring`, `/results` |
| Santé globale, édition concours | Même préfixe concours + `/health`, `/settings`, adaptateurs aux écrans existants |
| Détail de facture en état local | Nouveau détail `/associations/:orgId/accounts/:folioId`; document `/associations/:orgId/accounts/:folioId/documents/:documentId` |
| Recherche locale de factures | `/associations/:orgId/finance/search?q=…&year=2027` |
| `my-invoices` | `/me/accounts?year=2027&association=…&status=…&type=…` |
| Détail personnel en état local | `/me/accounts/:folioId`, puis `/documents/:documentId` sous ce compte |
| Factures historiques legacy | Sous-page Finance « Historique de facturation » et accès personnel équivalent; `/associations/:orgId/finance/legacy-invoices/:invoiceId`, `/me/legacy-invoices/:invoiceId` |
| `/shows/:slug`, `/vet…` | Inchangés; ne jamais confondre slug public et UUID concours administratif. |

Les autres fonctions générales ne nécessitent pas de refonte immédiate. Prévoir
un adaptateur `ViewKey` → navigation canonique pour les callbacks/notifications et
l'assistant, avec org/show explicites. Ne pas ajouter un routeur parallèle par
fonction : choisir un seul mécanisme de routing et de chargement en 1B. Le dépôt
n'offre pas aujourd'hui de routeur administratif à simplement configurer.

## 11. Sélection d'association, année et concours

Priorité : URL explicite valide et autorisée > préférence locale pour une entrée
sans cible > sélection explicite. Une URL inconnue/interdite ne doit jamais se
replier silencieusement sur la première association ou le premier concours.
Sans cible, proposer les concours en cours/à venir et les récents avec comptes
ouverts, puis Voir tous; si le dernier choix est valide, le réutiliser et écrire
l'URL. Ne pas mémoriser un compte payeur comme contexte implicite de vente.

Finance sans année choisit l'année courante et l'affiche dans l'URL. Changement
d'association : purger données/filtres incompatibles, garder l'année explicite,
revalider les permissions avant affichage. Changement de concours : conserver la
section équivalente autorisée, sinon Aperçu avec explication. Ne jamais transférer
le formulaire ou le payeur d'une opération inachevée vers un autre concours.
Avertir avant de quitter une saisie; conserver la clé de tentative si son résultat
est encore inconnu. Retour/avance/rechargement doivent restituer le contexte URL.

## 12. Permissions et identité

| Identité réelle | Navigation / accès cible |
| --- | --- |
| Admin plateforme | Accès serveur existant; rendre le shell cohérent, sans transmettre la capacité service_role au navigateur. |
| Admin association | Finance de son périmètre; configuration des contextes. Les actions respectent les règles du contexte. |
| Secrétaire association | Lecture/vente/encaissement/clôture selon `staff_roles`; pas configuration fiscale/prix libre. |
| Secrétaire de `show_roles` | Concours autorisés seulement; Finance partielle explicitement marquée. Aucun total ou résultat révélant les concours interdits, aucun contexte hors concours par ce seul rôle. |
| Payeur authentifié | Mes comptes seulement pour ses contacts liés; lecture des projections publiques autorisées. Finalisation personnelle obligatoire avant pilote, non accordée aujourd'hui. |
| Cavalier, propriétaire, agent, bénéficiaire ou auteur seul | Aucun droit financier sur le compte d'un tiers issu de cette seule qualité. |
| Non authentifié / référence connue | Connexion puis contrôle serveur; réponse indisponible sans divulgation d'identité ou de montant. |

Chaîne réelle : session `auth.users` → `user_profiles` (`current_profile_id`) →
`contacts.linked_user_id` → `billing_customer_accounts.payer_contact_id` → folio.
Un login peut être lié à plusieurs contacts; présenter leurs comptes sans fusionner
les contacts. Le compte client est unique association/contact et existe sans login.
La secrétaire peut le facturer; l'accès en ligne attend une liaison d'identité
vérifiée. Aucun rattachement automatique par nom, courriel ressemblant ou entreprise.

`contacts.company_name` est facultatif : « Marie Tremblay · Écurie Tremblay » reste
le même payeur, pas un login d'entreprise ou une délégation générale. Les documents
conservent leurs instantanés; une modification des coordonnées ne les réécrit pas.
Les coordonnées actuelles et celles de la pièce sont distinguées si elles diffèrent.
Auteur, payeur, bénéficiaire, propriétaire et cheval restent des champs distincts.
Les preuves d'autorisation et identifiants internes d'employés ne figurent pas dans
la projection personnelle; l'audit reste administratif et protégé.

## 13. États particuliers

| État | Comportement |
| --- | --- |
| Aucune association | Sélection autorisée, aucune donnée financière globale implicite. Mes comptes peut agréger les seules associations du payeur. |
| Aucun concours sélectionné | Sélecteur / liste; aucune commande financière active. |
| Aucun concours de l'année | Message avec année, changer l'année; création seulement pour le rôle autorisé. |
| À venir / en cours / terminé | Indication temporelle calculée à partir des dates, séparée du statut réel `draft/open/closed/archived`. Terminé ne signifie pas comptes fermés. |
| Concours archivé | Accessible par Voir tous et historique annuel; consultation conservée. Recommandation : aucune nouvelle vente, traitement des soldes et clôture des comptes ouverts par personnel autorisé. Politique approuvée; pas une interdiction déjà codée dans 1A. |
| Compte ouvert | Solde courant et relevé provisoire; aucune appellation Facture finale. |
| Compte fermé, solde zéro | Facture finale et reçus consultables; aucune nouvelle vente ou deuxième clôture. |
| Compte fermé avec solde | « Fermé — solde à payer »; encaissement sur le même compte, nouveau reçu, facture originale inchangée. |
| Accès partiel | Mention « Votre périmètre autorisé »; ni noms ni compteurs des éléments exclus. |
| Aucun contexte hors concours | Explication; configurer pour l'admin, contacter l'administration pour la secrétaire. |
| Aucun résultat | Termes et portée visibles, effacer filtres ou élargir l'année; ne pas suggérer une ressource interdite. |
| Chargement / erreur / droits retirés | État distinct du vide; retirer les anciennes données à changement de portée, reprise explicite, aucun faux succès. |

## 14. Recherche et parcours administratifs

Recherche Finance : numéro de compte/reçu/facture, payeur, entreprise, bénéficiaire,
cheval, concours et nom public du contexte. Par défaut année sélectionnée; action
explicite « Toutes les années autorisées », notamment pour retrouver un reçu tardif.
Un numéro exact hors année propose cette extension sans révéler une ressource avant
contrôle d'accès. Résultats paginés côté serveur, typés et dédoublonnés par UUID :
Compte du concours, Compte d'adhésion…, Relevé du compte, Reçu de paiement, Facture
finale. Chaque ligne indique association, contexte/année, payeur et référence; un
relevé est daté et ne reçoit pas un faux numéro de facture. La recherche locale de
BillingView ne suffit pas et ne doit pas charger tous les journaux internes.

Parcours secrétaire : Concours → Comptes → recherche payeur/entreprise/cheval →
compte ou « Ajouter une vente » → choix du contact payeur et contexte affichés →
produit configuré, quantité, bénéficiaire/cheval si pertinent → taxes détaillées,
prix non éditable → confirmation → compte numéroté créé à la première opération.
Ne pas ouvrir un compte vide juste pour afficher une fiche client.

Encaissement : compte → Enregistrer un paiement → comptant/Interac, montant, date,
référence, frais affectés → confirmation de réception réelle → reçu individuel et
solde actualisé. Un écran en attente réseau ne prouve pas l'encaissement.

Fermeture secrétaire : compte → relevé/récapitulatif daté → vérification du payeur,
frais, taxes, paiements et solde → confirmation de fermeture → facture finale unique.
Une version périmée impose une nouvelle revue. 1A autorise une fermeture manuelle
avec solde; ne pas confondre cette possibilité avec la future politique payeur.

Finance → concours de 2027 avec impayés → même compte → paiement reçu en 2028 → reçu
2028 rattaché au compte 2027. Hors concours : Finance → type/année → contexte précis →
même détail et mêmes commandes. Les achats adhésions/nominations existants restent
à leur emplacement métier, avec futur lien au compte une fois les adaptateurs prêts.

## 15. Maquettes ordinateur — administration

Valeurs fictives illustratives en CAD, aucune donnée réelle. Aubergine pour l'action
principale, fond clair et tableaux denses; conserver les tokens/styles HSP existants.

```text
┌ Menu association ───┬────────────────────────────────────────────────────────────┐
│ HSP                │ Association [AQR ▼]                 Année [2027 ▼]          │
│ Vue d'ensemble     │ FINANCE   [Rechercher compte, reçu, payeur, cheval…      🔍] │
│ Notifications      │ Vue d'ensemble | Concours | Comptes hors concours           │
│ Concours           │ Frais HT 10 000 | Taxes 1 500 | TTC 11 500 CAD              │
│ Répertoire         │ Reçu 8 000 | Solde 3 500 CAD | Ouverts 18 | Fermés 42       │
│ Santé              │ À traiter : [3 concours avec comptes ouverts →]             │
│ Dossards           │ Concours       Dates     Statut  Comptes Ouverts Reçu Solde │
│ FINANCE ●          │ Futurité       12–15/09  Terminé   60      18    …     …  → │
│ Programmes         │ [Voir les comptes]                                         │
│ Paramètres         │ Contextes actifs : Adhésion 2027 · Boutique 2027            │
│ Mon espace…        │ Totaux des comptes 2027, encaissements reçus à ce jour.      │
└────────────────────┴────────────────────────────────────────────────────────────┘

┌ Même menu gauche ──┬ Association AQR                                             ┐
│ CONCOURS ●         │ [Futurité 2027 ▼]  12–15 septembre · Open · En cours         │
│                    │ Aperçu | Inscriptions | Réservations | Horaire | COMPTES | +│
│                    │ [No, payeur, entreprise, bénéficiaire, cheval…] [Ouverts ▼]│
│                    │ [Ajouter une vente]                                         │
│                    │ No compte     Payeur / entreprise  Chevaux État Solde      │
│                    │ AQR-2027-482  Marie / Écurie M.        2   Ouvert 425,00 → │
└────────────────────┴────────────────────────────────────────────────────────────┘

Détail commun : Association AQR > Futurité 2027 > AQR-2027-482
Compte du concours — Marie Tremblay / Écurie M.       Ouvert · Solde 425,00 CAD
[Ajouter une vente] [Enregistrer un paiement] [Relevé du compte] [Fermer…]
Frais : Description | Bénéficiaire / Cheval | Qté | Prix HT | Taxes | Total
Totaux : HT 500,00 · taxe A 25,00 · taxe B 50,00 · TTC 575,00
Paiements : reçu R-21 · Interac · 150,00 · date réelle → consulter
Documents : relevé du 15/09 → consulter; facture finale absente avant fermeture
```

## 16. Maquettes mobile et tablette — administration

```text
[HSP] Finance                         [☰]
Association AQR [▼]    Année [2027 ▼]
[Recherche financière…             🔍]
Vue d'ensemble | CONCOURS | Hors concours →
Futurité 2027 · 12–15 septembre
Terminé · 60 comptes / 18 ouverts
Reçu … CAD         Solde … CAD
[Voir les comptes]

[HSP] Concours                        [☰]
AQR · [Futurité 2027               ▼]
12–15 septembre · En cours
← Horaire | COMPTES DU CONCOURS | Plus
[Rechercher…] [Filtres (1)]
[Ajouter une vente]
AQR-2027-482 · Marie / Écurie M.
2 chevaux · Ouvert · Solde 425,00 CAD [Ouvrir]

Compte AQR-2027-482     [Retour]
Marie · Solde 425,00 CAD · Ouvert
[Ajouter une vente] [Paiement]
Frais (liste détaillable) / Totaux / Paiements / Documents
[Relevé du compte] [Fermer le compte…]
```

Téléphone : une seule navigation globale repliable, onglet actif visible après
navigation, champs de recherche pleine largeur et filtres dans un panneau temporaire.
Tablette : conserver le shell adaptatif existant; tableau si lisible, liste sinon.
Les taxes et références complètes restent accessibles par ouverture de ligne.
Modales financières plein écran sur téléphone, une confirmation explicite, focus
visible/restauré; pas d'action irréversible masquée derrière une icône seule. Viser
zones tactiles 44 px, clavier et lecteurs d'écran, zoom 200 %, FR/EN sans troncature
des montants; les autorisations ne varient jamais avec la largeur.

## 17. Mes comptes — parcours et filtres

Une liste, pas une série d'onglets financiers. Filtres : association (toutes les
associations autorisées comme payeur par défaut), année courante avec option Toutes,
statut ouvert/fermé, concours ou type hors concours; recherche référence/nom de
contexte/cheval des seuls comptes autorisés. Afficher un raccourci « Soldes des années
précédentes » pour ne pas cacher une dette avec le filtre annuel. Année de contexte,
jamais année d'un paiement pour déplacer le compte.

Chaque ligne : nom public du compte, association, numéro, payeur (utile si plusieurs
contacts liés), année, ouvert/fermé, état de préparation et solde/devise. Détail :
identité du payeur/entreprise, bénéficiaires/chevaux, frais/taxes, encaissements,
relevés, reçus, facture finale si émise. Aucun ajout de frais, validation d'Interac
ou accès à l'audit par le participant. La lecture du compte actuel ne modifie aucun
document historique. Les factures legacy restent retrouvables par un lien secondaire
« Factures antérieures », sans les faire passer pour des folios reconstruits.

## 18. Finalisation autonome — proposition, non livrée

Libellé recommandé : **Prêt à finaliser**, badge secondaire d'un compte toujours
**Ouvert**. Ne pas ajouter un troisième état financier à `open/closed` simplement
pour l'affichage. La préparation est une autorisation révisable, séparée de la
fermeture; une date de fin de concours ne la crée jamais automatiquement.

Mécanisme recommandé : attestation administrative par compte « Tous les frais
attendus sont portés », liée à une révision financière et à une version de politique.
Une phase de fermeture du contexte autorise l'étude de l'admissibilité, mais ne
remplace pas l'attestation individuelle. Toute nouvelle charge/information qui
invalide cette attestation la révoque; tout changement financier invalide le
récapitulatif. Les paiements reçus peuvent laisser l'attestation des frais complète,
mais imposent un nouveau récapitulatif. Principe approuvé; contrat technique à préciser avant extension du modèle.

Conditions contrôlées ensemble côté serveur au moment de finaliser :

1. Session valide, contact effectivement payeur, compte encore ouvert.
2. Association autorisant le self-checkout et politique explicite du contexte.
3. Phase de fermeture autorisée et attestation des frais complète encore valide.
4. Aucune opération de facturation/paiement en attente ni source attendue non intégrée.
5. Aucune contestation ou vérification administrative bloquante.
6. Solde conforme à la politique et récapitulatif confirmé encore identique,
   y compris coordonnées, politique et attestations applicables.

Le serveur renvoie des motifs publics précis : « D'autres frais sont attendus »,
« Paiement en cours », « Vérification par l'association », « Solde à régler »,
« Le compte a changé : vérifiez le nouveau récapitulatif ». Aucun détail interne de
permission ou de contestation d'autrui. État non admissible : Signaler un problème;
Demander la fermeture seulement lorsque l'association propose ce traitement. Pas de
bouton de fermeture lorsque des frais restent attendus. Le workflow complet peut suivre le pilote. Sans mécanisme serveur durable, proposer
les coordonnées de contact vérifiées de l’association, sans bouton prétendant
enregistrer une demande ni accusé de réception fictif. Aucun envoi automatique.

| Situation financière | Comportement personnel recommandé |
| --- | --- |
| Solde zéro | Admissible seulement si toutes les autres conditions sont réunies. |
| Paiement en traitement | Bloquer; afficher en attente, sans reçu d'encaissement ni activation anticipée. |
| Solde dû | Paiement Stripe test à cet endroit avant le pilote, ou instructions de l'association pour un encaissement manuel confirmé. Pas de self-checkout par défaut. |
| Crédit / excédent | Bloquer et orienter vers le personnel; 1A refuse les excédents et n'implémente pas les crédits. Aucun remboursement fictif. |
| Modalités autorisées | Exception explicite, documentant échéance et solde; acceptation du payeur et contrôle serveur, jamais case libre du participant. |
| Paiement après facture | Nouveau reçu et solde courant actualisé; facture finale inchangée, pas de seconde facture. |

Parcours : Mes comptes → détail → vérifier frais/taxes/paiements → signaler au besoin
→ paiement Stripe test confirmé côté serveur → récapitulatif versionné → confirmation explicite
**Finaliser mon compte** → résultat de la facture unique. Un double clic ou une
réponse réseau perdue restitue la même facture. Une erreur ne déclenche pas une
nouvelle tentative avec une nouvelle clé sans avoir résolu la précédente.

## 19. Maquettes participant

```text
ORDINATEUR
┌ Mon espace ────────┬ MES COMPTES                                                 ┐
│ Aperçu / Profil    │ Association [Toutes ▼] Année [2027 ▼] Statut [Tous ▼]        │
│ Mes chevaux       │ Type [Tous ▼] [Rechercher un compte ou une référence…]       │
│ Mes contacts      │ [Soldes des années précédentes]                             │
│ Mes inscriptions  │ Compte / Association    No          Payeur     État   Solde │
│ Mes réservations  │ Concours Futurité / AQR AQR-2027-482 Marie      Ouvert 425 →│
│ MES COMPTES ●     │ Adhésion 2027 / AQR     ADH-2027-12  Marie      Fermé    0 →│
│ …                 │ [Factures antérieures]                                      │
└───────────────────┴─────────────────────────────────────────────────────────────┘

MOBILE
[HSP] Mes comptes                     [☰]
[Rechercher…]    [Filtres : 2027]
Association [Toutes ▼]   Année [2027 ▼]
Compte du concours — Futurité 2027
AQR · AQR-2027-482 · Marie / Écurie M.
Ouvert · Solde 425,00 CAD       [Ouvrir]
[Soldes des années précédentes]

DÉTAIL OUVERT — ordinateur en sections, mobile en liste verticale
[Retour à Mes comptes]  Compte du concours — Futurité 2027
AQR-2027-482 · Marie Tremblay / Écurie M. · Ouvert
Frais : stalles / bénéficiaire / cheval / HT / chaque taxe / TTC
Paiements reçus : date / moyen / montant / reçu → consulter
Solde actuel 425,00 CAD · Relevés → consulter
D'autres frais sont attendus. L'association n'a pas autorisé la finalisation.
[Signaler un problème]       (aucun bouton Finaliser)
[Payer mon compte] — cible Stripe test du pilote, non implémentée en 1A.5.

PRÊT À FINALISER
Ouvert · Prêt à finaliser · Solde 0,00 CAD
L'association confirme que tous les frais attendus sont portés.
[Vérifier avant de finaliser]  [Signaler un problème]

RÉCAPITULATIF — même contenu sur téléphone plein écran
Compte AQR-2027-482 · Payeur et coordonnées de facturation
Frais HT 500,00 + taxe A 25,00 + taxe B 50,00 = 575,00 CAD
Reçu R-21 : 150,00 · Reçu R-22 : 425,00 · Solde 0,00 CAD
Relevé préparé le 15/09 à 18:32 (version contrôlée par le serveur)
[ ] Je confirme ce récapitulatif et la fermeture de mon compte.
Une facture finale sera créée. Aucun frais ordinaire ne pourra être ajouté.
[Retour]                       [Finaliser mon compte]
En cours : bouton occupé; conserver la référence de tentative.
Si modifié : Compte actualisé — [Revoir le nouveau récapitulatif]

RÉSULTAT
Compte fermé · Solde actuel 0,00 CAD
Facture finale FAC-2027-104 créée le 15/09 à 18:33
[Consulter la facture finale] [Voir les reçus] [Retour à Mes comptes]
Fichier en préparation si nécessaire; fermeture réussie même si le rendu échoue.

DEMANDE / PROBLÈME — workflow complet conçu, facultatif pour le pilote
Compte AQR-2027-482 · [Frais concerné ▼] (facultatif pour demande de fermeture)
Motif [Texte…]                  [Annuler] [Envoyer la demande]
Confirmation : Demande reçue · référence D-… · En attente de l'association
Compte toujours ouvert; aucune facture créée par cette demande.
Un problème financier bloquant suspend la finalisation jusqu'à résolution autorisée.
Pilote sans workflow durable : [Contacter l’association] → coordonnées vérifiées;
aucun message « Demande reçue ». La secrétaire peut bloquer la finalisation.
```

## 20. Composants réutilisables et travail futur

| Réutiliser / adapter | Limites ou création nécessaire |
| --- | --- |
| Shell Dashboard, Brand, LanguageToggle, styles de boutons/panels/tableaux | Découpler sélection/navigation du chargement global; conserver mobile et FR/EN, thème existant. |
| ViewIntro, Metric, EmptyState, NoticeBanner | Alimenter par agrégats autorisés futurs; distinguer chargement, erreur et portée partielle. |
| SearchSelect, ContactPicker | Recherche serveur paginée pour gros répertoires; identité payeur et entreprise explicites; ne pas déduire les droits d'un choix UI. |
| ModalDialog, FormActions | Ajouter gestion de focus, retour clavier et formulaires plein écran; neutraliser double validation. |
| ShowsView/ShowAssistant, ClassesView, EntriesView, StallsView, ResultsView, ScoringView | Adaptateurs de contexte URL, pas deuxième implémentation métier; vérifier callbacks et appels legacy avant raccordement. |
| BillingView | Présentation/références utiles et historique conservé; nouveau détail de compte et nouvelles commandes plutôt que réutiliser prix/taxes legacy. |
| À créer en 1B | En-têtes de contexte, barre d'onglets, Finance annuelle, listes de comptes, recherche typée, détail commun, présentation Mes comptes, actions vente/paiement/récapitulatif. |

### Frontière interface / extensions serveur

**Interface 1B sur les capacités 1A** : écrans secrétaire de vente/encaissement/relevé/
fermeture; consultation payeur des comptes/documents expurgés; affichage d'un état
fermé avec solde. La liste annuelle, les agrégats, la recherche multi-critères et
les capacités de navigation nécessitent aussi des lectures serveur adaptées : les
RPC 1A `find_billing_account` (numéro exact) et `get_billing_document` ne les couvrent
pas. Pas de chargement massif de journaux en navigateur pour compenser.

**Extension serveur préalable au checkout payeur** (noms techniques indicatifs) :
projection `get_billing_checkout_eligibility`, préparation de récapitulatif payeur,
commande `finalize_own_billing_folio`, gestion des attestations de frais et blocages administratifs durables pour le pilote;
demandes/contestations et résolution structurée complète peuvent suivre le pilote. Ne pas simplement
accorder au payeur `billing_execute` ou contourner `billing_assert_staff`.
Aujourd'hui `get_billing_statement` et `finalize_billing_folio` sont des commandes
réservées au personnel. Le payeur peut consulter un relevé déjà produit, pas en
créer un par cette RPC. Les projections publiques restent des listes de champs.

**Politiques à concevoir** : activation association puis contexte du self-checkout
(désactivé par défaut), phase ouvrant la fermeture, attestation par compte, politique
zéro/modalités explicites, blocages, possibilité de demande, validité/révocation du
récapitulatif. 1A rejette les clés de configuration inconnues et fige la configuration;
ces champs ne peuvent pas être ajoutés discrètement par le front. Prévoir une
évolution versionnée et additive dans une tranche serveur approuvée, pas réécrire
la migration 1A ou activer les anciens paramètres de capture automatique des shows.

Transaction cible : authentifier le payeur → verrouiller compte et dépendances
avec le même ordre que ventes/paiements → relire droits, politique, attestation,
opérations en attente et contestations → vérifier révision/instantané → fermer et
créer facture/outbox atomiquement. Clé d'idempotence durable par commande et auteur;
même clé/autre contenu refusé. Une fermeture secrétaire simultanée et une fermeture
payeur ne peuvent pas produire deux factures. Invalidation atomique de la préparation
lors d'un nouveau frais ou blocage; aucune fenêtre entre vérification et clôture.
La référence du récapitulatif transmis au payeur est opaque; les métadonnées de
verrouillage et preuves internes restent privées. Le suivi serveur requis avant pilote des opérations en
attente doit couvrir les sources métier et prestataires, pas seulement l'outbox PDF.
Un rendu PDF en attente après fermeture ne doit pas annuler ou répéter la clôture.

## 21. Risques, décisions à approuver et acceptation

Risques prioritaires : fermeture prématurée avant remontée de tous les frais;
changement silencieux de concours; exposition inter-associations dans une recherche;
confusion cheval accessible/payeur; doublons financiers lors de coexistence legacy;
perte des parcours ShowScore/inscriptions/réservations; annuels masquant impayés;
addition de devises; modales inaccessibles; récapitulatif périmé après changement
d'identité, paiement ou contestation.

1A refuse l'adoption d'une portée contenant des opérations legacy; hors concours,
le verrou legacy couvre la portée NULL de l'association entière. La navigation ne
résout pas ce problème de reprise. Afficher « Historique / moteur actuel » ou
« Configuration financière requise », jamais migrer automatiquement en ouvrant un
onglet ni agréger deux fois une même opération.

### Décisions produit et séquence de livraison

| Réf. | Décision / état |
| --- | --- |
| UX1 | Approuvé au niveau produit. Faire évoluer Facturation vers Finance et Mes factures vers Mes comptes; déplacer uniquement les accès propres au concours. |
| UX2 | Détail administratif canonique commun approuvé; chemins exacts proposés à confirmer; namespace personnel distinct. Choix de bibliothèque de routing à faire lors du cadrage technique, sans routeur parallèle. |
| UX3 | Approuvé au niveau produit. Année du début/service figée; contextes annuels pour activité permanente; traitement visible des années à qualifier. |
| UX4 | Approuvé au niveau produit. Vue annuelle par comptes de l'année et encaissements à ce jour, pas flux comptables annuels; montants séparés par devise. |
| UX5 | Approuvé au niveau produit. Secrétaire de concours : Finance partielle limitée à ses concours; Mes comptes multi-associations limité au payeur. |
| UX6 | Approuvé au niveau produit. Archivé : consultation, encaissement et clôture autorisée, pas de nouvelle vente; déterminer la règle serveur avant de la promettre. |
| UX7 | Approuvé au niveau produit. Checkout payeur désactivé par défaut, badge « Prêt à finaliser », phase contexte + attestation individuelle révisable des frais complets. |
| UX8 | Approuvé au niveau produit. Solde zéro par défaut; modalités explicites comme exception future. Crédit/excédent et paiement en traitement bloquent. |
| UX9 | Workflow complet conçu, reportable après pilote. Blocage administratif durable obligatoire pour sécuriser la fermeture; sans enregistrement durable de demande, afficher seulement un moyen réel de contacter l’association. |
| UX10 | Séquence requise avant pilote : fondation 1A → conception 1A.5 → extensions serveur checkout payeur/Stripe → interface administrative et Mes comptes → Stripe test → PDF → tests automatisés et pilote fictif contrôlé sur une association de démonstration. Dépendances détaillées en section 27; aucune sous-tranche arbitrairement numérotée. |

### Critères d'acceptation de la future implémentation

- Navigation : un seul Finance administratif, un seul Mes comptes personnel, aucun
  deuxième menu latéral; fonctions générales conservées, pas de concours historiques
  dans le menu gauche. Onglets et libellés FR/EN cohérents (Show account, Account
  statement, Payment receipt, Final invoice, My accounts proposés côté anglais).
- URL : lien direct, actualisation, retour/avance et changement d'association/concours
  conservent la bonne identité; section inaccessible → repli explicite sans fuite.
  Pages publiques `/shows/:slug`, portail vet et accès ShowScore restent fonctionnels.
- Finance/Concours ouvrent le même UUID et le même détail, mêmes droits et montants;
  aucun calcul sur les seules lignes de la page courante. Recherche/pagination,
  année et devises contrôlées serveur; une référence connue ne donne aucun accès.
- Années : concours décembre/janvier, adhésion ouverte avant année de service,
  boutique annuelle, paiement tardif, impayé ancien et année inconnue testés sans
  doublon, conversion ou ventilation historique inventée.
- Comptes : gratuité seulement configurée, prix non éditable, taxes explicites,
  paiements partiels réellement encaissés, références/numéros distincts, fermeture
  manuelle unique. Compte fermé avec solde accepte un reçu ultérieur sans réécriture.
- Identité : contact sans login facturable, plusieurs contacts liés distingués,
  entreprise facultative sans droit additionnel; propriétaire/agent/cavalier/auteur
  non payeur refusé; droits retirés après chargement revérifiés lors de l'action.
- Participant : filtre Mes comptes strict même pour un administrateur; documents
  expurgés; aucun accès audit; lecture et paiement ne valent jamais permission de clôture.
- Checkout : tester séparément chaque condition bloquante, compte à zéro non prêt,
  fin de concours seule, contestation, paiement en traitement, crédit/excédent,
  modalités autorisées et interdites, demande de fermeture sans émission de facture.
- Concurrence réelle : nouveau frais vs finalisation, paiement vs récapitulatif,
  retrait d'autorisation/attestation vs clôture, contestation vs clôture, deux onglets
  payeur, payeur vs secrétaire; une seule facture, aucun frais perdu, récapitulatif
  périmé refusé. Retries après timeout rendent le même résultat durable.
- Après clôture : compte toujours fermé si rendu documentaire échoue, document en
  préparation visible sans faux téléchargement; paiement tardif → reçu distinct.
- Mobile/tablette/ordinateur : 360, 768 et 1280 px, zoom 200 %, clavier/focus, retour
  des modales, onglet actif visible, sélection/recherche et montants lisibles;
  parité stricte des permissions. Aucun test navigateur n'est prétendu exécuté ici.

### Vérification documentaire de cette tranche (audit initial et révision)

Audit statique uniquement. Base et état Git vérifiés; aucun test SQL/application
relancé puisque seul ce document est ajouté. Avant remise : comparaison des fichiers
suivis avec HEAD, vérification des empreintes SVG et contrôle du diff du nouveau
fichier. Aucun commit, push, migration, déploiement, PDF ou début de 1B.


## 22. Pilote fictif et premier déploiement réel — périmètres distincts

### Pilote de démonstration entièrement fictif

Une association fictive autorisée dans un environnement de démonstration isolé,
un concours entièrement fictif et des contextes neufs adoptés explicitement.
Contacts, payeurs, chevaux, inscriptions, réservations, produits et frais sont tous
fictifs. Une devise unique pour la démonstration, aucune conversion ni partage de
dépenses, aucune donnée financière réelle, aucune migration d'historique et aucune
modification de PROD. Le modèle reste multi-association et isolé par association.
La seconde association des tests d'isolation est **uniquement une fixture de test**,
jamais une deuxième association participante ni une source de données réelles.

Stripe est exercé réellement via son environnement **test** : Payment Element,
PaymentIntent, authentification supplémentaire, webhooks et reprises. Uniquement
des cartes, clés et objets de test, aucun objet live accepté, aucun mouvement
d'argent réel et aucune activation Stripe en production. Les expressions
« encaissement confirmé » ou « montant réellement reçu » décrivent, pour ce pilote,
la confirmation serveur d'une transaction Stripe de test, pas des fonds réels.
Le pilote ne valide aucun modèle commercial définitif de frais ou de transfert.

Écrans de démonstration et trois types de PDF portent une mention visible
**« DÉMONSTRATION — données, montants, taxes et numéros fictifs — sans valeur
comptable ou fiscale »**. Les taux configurés servent à tester les calculs, pas à
certifier une fiscalité réelle; les numéros de démonstration ne sont pas présentés
comme des documents comptables réels. Utiliser les noms fictifs correspondants.

Prévoir trois capacités serveur distinctes, désactivées par défaut : nouveau moteur,
checkout autonome et Stripe test. Chacune exige une association dans la liste pilote
et un contexte adopté explicitement autorisé, plus les droits de l'utilisateur.
Un plan commercial, une clé publique présente ou un bouton visible ne vaut jamais
activation. Retirer une capacité interdit les nouvelles commandes correspondantes;
la consultation et la résolution des tentatives déjà créées doivent rester possibles
pour ne pas perdre une confirmation fournisseur arrivée après désactivation.
Aucun identifiant d'association unique codé en dur dans le modèle financier.

| Obligatoire avant ouverture du pilote | Conçu, reportable après pilote |
| --- | --- |
| Finance, Comptes du concours, Mes comptes, détail, frais et taxes | Automatisation de tous les types hors concours |
| Paiements partiels et multiples, Stripe test, encaissement manuel fictif ou simulé (aucun encaissement réel) | Remboursements, crédits, excédents, rétrofacturations et modalités complexes |
| Relevé PDF, reçu PDF, facture finale PDF, consultation/téléchargement autorisés | Exports comptables et migration complète de l'historique |
| Prêt à finaliser, attestation de frais complets, blocage administratif durable, finalisation payeur et secrétaire | Workflow complet de contestation et résolution structurée des litiges |
| Permissions, concurrence, idempotence, ordinateur/mobile, tests SQL/services/navigateur | Interfaces complètes de rapprochement fournisseur |

La simulation de réservation de stalle est représentée par une **vente configurée
fictive** dans le nouveau contexte financier. Aucun adaptateur de réservation
réelle, activation de service, inventaire réel ou modification opérationnelle de
production n'est exigé pour ce pilote. Les fausses inscriptions et réservations
ne doivent pas être confondues avec des engagements réels.

### Scénario complet obligatoire du pilote fictif

1. Créer le concours fictif et préparer ses produits/taxes fictifs.
2. Ouvrir le Compte du concours du faux payeur à sa première opération.
3. Ajouter plusieurs frais fictifs au même compte.
4. Simuler une réservation de stalle par une vente configurée.
5. Vérifier le calcul détaillé des taxes configurées.
6. Effectuer un paiement partiel Stripe test.
7. Effectuer un deuxième paiement Stripe test sur le même compte.
8. Vérifier deux encaissements de test et deux Reçus de paiement distincts.
9. Consulter compte et documents dans Mes comptes avec le login du faux payeur.
10. Faire passer le compte à Prêt à finaliser par l'autorité de démonstration.
11. Confirmer un récapitulatif versionné correspondant au solde à zéro.
12. Finaliser de manière autonome, explicitement et une seule fois.
13. Vérifier la création d'une seule Facture finale fictive.
14. Générer, consulter et télécharger les PDF du relevé, des reçus et de la facture.
15. Vérifier les permissions, reprises et non-duplications, dont les refus avec
    la seconde association fixture et les autres faux payeurs.

### Premier déploiement réel — séparé, l'an prochain

Limité à une seule association réelle pour réduire le volume, le nombre
d'utilisateurs, les risques de permissions, les besoins de migration et le soutien
initial. Autorisation distincte et nouvelle validation avant toute donnée réelle,
taux fiscal réel, paiement réel, utilisation éventuelle de Stripe live, migration
ou activation en production. L'historique ne sera pas repris au titre du pilote.
Le raccordement et la validation des **vraies réservations** sont préalables à ce
déploiement réel si cette source doit être utilisée; ils ne conditionnent pas la
démonstration fictive. Les règles commerciales de collecte, frais/transferts et le
rapprochement devront être validés pour le réel indépendamment des essais test.

## 23. Audit Stripe existant — lecture seule, sans supposition de déploiement

Deux états du dépôt ont été inspectés sans checkout, fetch ni modification : HEAD
`a3067ed` et la branche locale `recovery/stripe-billing-2026-09-02`, commit exact
`a2a6b44f0afafc55dffd2c78097d8053c57208b9`, par `git show`, `git ls-tree` et `git grep`.
Aucun secret réel lu, configuré ou utilisé; aucun appel à Stripe. L'audit porte sur
le code local, pas sur l'état de comptes ou de fonctions déployés.

| Périmètre / fichier réel | Ce qui existe réellement |
| --- | --- |
| HEAD : `.env.example`, `README.md` | Noms serveur `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; le README présente encore les fonctions Stripe comme à ajouter. |
| HEAD : `0001_initial_schema.sql` | `organizations.stripe_customer_id`; `payments` lié à `invoice_id`, méthode stripe, références PaymentIntent/charge, statuts, montant/devise. Index initial PaymentIntent non unique. Ce n'est pas `billing_payments`. |
| HEAD : `src/utils/planFeatures.ts` et paramètres des shows | Drapeau de plan `stripe_preauth`, configuration préautorisation/capture des inscriptions; aucune preuve d'un flux Stripe exécutable dans HEAD. |
| HEAD : `supabase/functions`, `api`, `server`, `src` et dépendances suivies | Pas des cinq fonctions Stripe ni des composants Stripe de la branche recovery dans cette base. |
| Recovery : `supabase/functions/_shared/stripe.ts` | Appels HTTP REST `/v1` avec clé `sk_test_` imposée, clé d'idempotence optionnelle, conversion montant ×100. Pas un SDK Stripe serveur. |
| Recovery : `stripe-connect/index.ts`, migration `20260813000200_stripe_connect_accounts.sql` | **Stripe Connect Express** : compte par association, onboarding/liens de dashboard; `stripe_connect_accounts`, statut charges/payouts et exigences. Vérification admin/secrétaire association. |
| Recovery : `stripe-invoice-payment/index.ts` | PaymentIntent sur la plateforme avec `transfer_data[destination]` vers le compte connecté (destination charge). Solde complet d'une facture legacy; portefeuille requis; capture automatique ou manuelle choisie dans la requête. Pas de Checkout Session hébergée. |
| Recovery : `stripe-wallet/index.ts`, migration `20260813000100_stripe_payment_profiles.sql` | `stripe_payment_profiles` par contact, Customer Stripe, SetupIntent/CustomerSession, liste/retrait de cartes; contrôle contact lié au login. Profil global contact, pas identité financière par association. |
| Recovery : `stripe-capture-payment/index.ts` | Capture totale/partielle d'une autorisation legacy, droit admin/secrétaire association, écriture `audit_events`. Pas d'usage de `billing_folios`. |
| Recovery : `stripe-webhook/index.ts` | Signature HMAC sur corps brut avec tolérance temporelle; refus `livemode`; `stripe_webhook_events` avec ID unique; événements PaymentIntent et `account.updated`. Modifie `payments` puis `invoices`. |
| Recovery : `InvoicePayment.tsx`, `PaymentWallet.tsx`, `StripeConnectPanel.tsx` | Elements/PaymentElement, confirmation navigateur avec `return_url` et rechargement; portefeuille et onboarding. Dépendances `@stripe/react-stripe-js`, `@stripe/stripe-js`. |
| Recovery : `src/services/stripePayments.ts`, `stripeWallet.ts`, `stripeConnect.ts` | Adaptateurs d'invocation des Edge Functions ci-dessus; aucune commande de paiement folio. |
| Recovery : `.env.example`, `src/lib/env.ts`, fonctions, `docs/STRIPE_SANDBOX.md` | `VITE_STRIPE_PUBLISHABLE_KEY` côté navigateur; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` côté fonctions selon usage. Aucun secret serveur ne doit devenir VITE. |

### Réutilisation sélective et obstacles vérifiés

Réutilisables après adaptation/revue : composants Elements, libellés FR/EN,
contrôle login/contact payeur, onboarding Express, discipline test-only et séparation
des secrets. Le portefeuille n'est pas un prérequis produit à imposer au pilote;
examiner un paiement sans sauvegarde obligatoire de carte. La portée du Customer
Stripe et la séparation test/live devront être explicites si ce stockage est repris.

**Ne pas fusionner la branche recovery ni brancher ses commandes directement sur 1A.**
Le paiement est lié à une facture officielle legacy alors que le folio doit accepter
plusieurs encaissements avant sa facture finale. La devise vient de l'association,
le montant de `invoice.balance_due`, pas du contexte figé et de ses affectations.
`record_billing_payment` 1A accepte seulement cash/etransfer : il faut une commande
serveur fournisseur protégée, pas déguiser Stripe en comptant ni élargir une entrée
navigateur permettant de déclarer soi-même un paiement confirmé.

Défauts concrets de la reprise à corriger avant pilote :

- Webhook : détection de doublon, mutation paiement, recalcul facture puis insertion
  événement en plusieurs requêtes, sans transaction globale. L'unicité de l'événement
  seule ne rend pas ces effets atomiques; pas de garde visible contre événements
  arrivant dans le désordre et régressant un paiement déjà terminé.
- Capture partielle : la capture demande `amount_to_capture`, mais le webhook réussi
  conserve le montant initial de `payments` et additionne ce montant. L'encaissement
  futur doit porter le montant réellement reçu, vérifié côté fournisseur.
- Création : clé dérivée facture/solde/mode et réutilisation d'une tentative pending;
  ce n'est pas une intention utilisateur durable et distincte pour deux paiements
  du même montant. Fenêtre entre création fournisseur et insertion locale, erreur
  possible après effet externe, aucune résolution complète de tentative ambiguë.
- Le webhook ne produit aucun reçu HSP 1A et ne vérifie pas la portée folio/pilote.
  Les métadonnées seules ne suffiront pas à authentifier le rattachement financier.
- Le retour `window.location.reload()` ne présente ni état durable en attente ni
  résolution d'un retour perdu. Les garde-fous test existent partiellement, mais
  les tables ne portent pas un partitionnement explicite environnement/compte Stripe.

Le document historique `docs/STRIPE_SANDBOX.md` de recovery décrit un lifecycle,
mais ne prouve pas des tests réussis. Aucune exécution Stripe revendiquée ici.
Recommandation technique à valider : conserver Connect Express/destination charges
et Elements comme point de départ, avec un nouveau protocole de tentative et de
confirmation folio. Ne pas supposer qu'une clé pilote suffit à décider du modèle
commercial de collecte, des frais ou de la responsabilité du futur déploiement live.

## 24. Parcours Stripe du payeur — obligatoire pour le pilote test

1. Mes comptes → compte dont le contact lié est réellement payeur.
2. Consulter frais, taxes, encaissements et solde; **Payer mon compte**.
3. Confirmer le montant proposé ou choisir un montant partiel autorisé. Le serveur
   valide précision, positivité, maximum disponible et politique du contexte.
4. Préparation serveur d'une tentative durable pour ce compte, ce payeur, cette
   association et cette devise; clé stable avant appel fournisseur.
5. Elements recueille le paiement et l'authentification supplémentaire éventuelle.
6. Retour dans HSP vers la tentative du même compte; réauthentification si nécessaire.
7. État lu côté serveur : traitement, refus, annulation ou confirmation, jamais déduit
   d'un paramètre URL ou de la seule réponse JavaScript Stripe.
8. Confirmation fiable serveur : signature webhook validée, environnement et compte
   fournisseur attendus, objet/rattachement et montant réellement reçu vérifiés.
9. Une transaction HSP crée l'encaissement, ses affectations, un Reçu de paiement
   unique et sa demande de rendu, puis actualise le solde/la version.
10. Le compte reste ouvert. Aucun paiement réussi ne le ferme ni n'émet la facture.
11. Un autre paiement peut suivre : réservation avant concours, paiement partiel,
    supplément pendant le concours puis paiement du solde, tous dans le même compte.
12. Une fois payé **et Prêt à finaliser**, nouveau récapitulatif puis action distincte
    Finaliser mon compte → facture finale unique, rendu PDF éventuellement en attente.

| Objet | Sens et autorité |
| --- | --- |
| Transaction/tentative Stripe | État fournisseur et montant réellement reçu; peut être refusée ou en traitement. |
| Encaissement HSP | Écriture financière confirmée, affectée à un seul compte, créée côté serveur. |
| Reçu de paiement HSP | Preuve numérotée de cet encaissement, pas la facture ni un simple écran Stripe. |
| Relevé du compte | Situation provisoire datée des frais/paiements/solde, pas une facture finale. |
| Facture finale | Pièce unique créée par clôture explicite, immuable, indépendante de la réussite du rendu. |

### Protocole serveur requis, sans implémentation dans 1A.5

Le navigateur propose un identifiant de compte et un choix de montant; le serveur
résout et revérifie payeur, association, contexte, devise, droits et capacités pilote.
Il calcule le solde et le maximum, refuse les falsifications et excédents; aucun
montant, statut, rôle ou destination Connect reçu du client n'est une autorité.
Toutes les actions utilisateur recontrôlent l'identité payeur. Le webhook n'a pas
une session payeur : il vérifie l'autorisation enregistrée et le rattachement de la
tentative côté serveur. Une liaison de login retirée n'efface pas une somme déjà
encaissée; elle interdit de nouvelles actions et peut imposer une revue protégée.

Prévoir registre de tentatives (compte/association/environnement/compte fournisseur,
montant autorisé en unités mineures, devise, clé de commande, référence fournisseur,
état, dates et résultat) et boîte de réception durable des événements. Unicité de
l'événement fournisseur **et** de l'encaissement fournisseur, dans leur portée
compte Stripe/environnement; unicité reçu par encaissement. Même clé/autre contenu
refusé. Un webhook répété ou un autre événement du même succès ne crée rien en double.
États monotones et résolution d'événements désordonnés; ne pas rétrograder un succès
sur un ancien événement processing. Authentifier les webhooks sur leur corps brut;
aucun JWT utilisateur ne remplace leur signature. Réponses publiques expurgées.

Un appel Stripe n'est pas une transaction SQL : enregistrer d'abord l'intention,
appeler Stripe avec clé stable, persister/résoudre le résultat. Timeout/réponse perdue
→ retrouver la tentative et interroger son état fournisseur côté serveur; ne pas
inventer une nouvelle tentative tant que l'ancienne reste ambiguë. Retour navigateur
perdu/webhook retardé → reprise depuis Mes comptes; pas de reçu avant confirmation.

**Éviter l'excédent concurrent**, pas seulement le refuser après capture : sous verrou,
réserver le montant payable d'une tentative active. Pour le pilote, recommander une
seule tentative Stripe non résolue par compte; les encaissements manuels et nouvelles
tentatives respectent le disponible net de ces montants. Ne libérer cette réservation
qu'après état terminal fiable; une expiration UI n'annule pas une capture possible.
Les frais ajoutés augmentent le solde sans modifier la tentative déjà autorisée.
Si un montant fournisseur incohérent arrive malgré les contrôles, conserver la preuve
en anomalie durable et bloquer la clôture pour rapprochement, jamais le masquer ou
créer artificiellement un crédit. Ce mécanisme serveur est une dépendance pilote.

Confirmation Stripe et finalisation peuvent arriver simultanément : même ordre de
verrous que ventes/encaissements/clôture; relire état des tentatives, recalculer solde,
contrôler version et instantané du récapitulatif avant fermeture. Si le paiement
change le compte, refuser le récapitulatif périmé et faire confirmer le nouveau.
Aucune finalisation avec paiement en traitement. La confirmation ne ferme jamais
le compte elle-même, même si elle fait passer le solde à zéro.

Séparation test/live : clés publiques et secrètes test cohérentes, secret webhook
propre au test, objets et compte Connect test, rejet serveur de `livemode=true` et
de configuration live. Pas de configuration ou activation live en production dans
ce pilote. Les politiques pilote complètent ces contrôles; les secrets ne sont ni
journalisés, ni conservés dans les URL de recherche, ni exposés dans les reçus.

## 25. Maquettes Stripe ordinateur et mobile — cibles fictives non implémentées

```text
DÉMONSTRATION — montants, taxes, identités et numéros fictifs
ORDINATEUR — Mon espace > Mes comptes > AQR-2027-482
Compte du concours — Futurité 2027 · Marie / Écurie M. · Ouvert
Frais et taxes 575,00 CAD | Déjà reçu 150,00 | Solde 425,00
[Payer mon compte]                    [Consulter le relevé PDF]
Montant [425,00 CAD]  (maximum validé serveur; paiement partiel permis)
[Confirmer le montant] → Préparation du paiement…
[Payment Element Stripe TEST] → [Confirmer le paiement]
Authentification supplémentaire requise → poursuivre dans Stripe
Retour HSP : Paiement en traitement. Aucun reçu disponible pour cette tentative.
[Actualiser l’état] — fermer cet écran n'annule pas le paiement.

MOBILE — mêmes montants, contrôles et transitions
[HSP] Mes comptes                       [☰]
Futurité 2027 · AQR-2027-482
Ouvert · Solde 425,00 CAD
[Payer mon compte]
Montant [200,00 CAD] [Continuer]
Préparation… → Stripe TEST / authentification
Traitement… [Consulter l’état]
Confirmé : 200,00 CAD · Reçu R-22 [Voir / Télécharger PDF]
Partiellement payé · Solde 225,00 CAD
Le compte reste ouvert. [Payer mon compte]
```

| État visible ordinateur ET mobile | Action / message, sans faux succès |
| --- | --- |
| Prêt à payer | Payer mon compte; montant maximum fourni par le serveur. |
| Préparation du paiement | Action occupée; clé conservée, aucune seconde tentative sur double clic. |
| Authentification supplémentaire requise | Continuer la vérification Stripe; HSP n'affiche aucun encaissement. |
| Paiement en traitement | Attendre/actualiser; finalisation indisponible. |
| Paiement confirmé | Montant reçu, référence HSP, reçu PDF ou rendu en préparation; compte ouvert. |
| Paiement refusé | Message clair; aucun encaissement. Réessayer seulement après résolution terminale. |
| Paiement annulé | Annulation confirmée serveur; fermer la fenêtre Stripe seul ne prouve pas l'annulation. |
| Retour incomplet dans HSP | Reprendre Mes comptes, vérifier la tentative existante après authentification. |
| Webhook retardé | Confirmation attendue; reprise serveur, ne pas repayer une tentative ambiguë. |
| Paiement déjà traité | Afficher le même encaissement et reçu; aucun numéro supplémentaire. |
| Solde partiellement payé | Solde restant et Payer mon compte pour une nouvelle tentative autorisée. |
| Solde à zéro | Masquer l'action de paiement; afficher les reçus. |
| Payé, pas encore Prêt à finaliser | Frais attendus ou vérification par l'association; aucun checkout anticipé. |
| Payé et Prêt à finaliser | Vérifier le récapitulatif → Finaliser mon compte. |
| Facture finale produite | Compte fermé; Consulter / Télécharger PDF, ou rendu en attente avec reprise. |

## 26. Trois types de PDF obligatoires avant pilote fictif

Relevé du compte, Reçu de paiement et Facture finale : générer depuis les instantanés
financiers immuables autorisés, pas les coordonnées/catalogues courants. Afficher le
numéro du compte sur chaque pièce, le numéro propre au reçu ou à la facture; ne pas
inventer de numéro de facture pour le relevé. Consultation et téléchargement privés
après vérification du payeur/personnel; aucune URL publique permanente de stockage.

Réutiliser la fondation `billing_outbox` 1A : pending/processing/completed/failed,
tentatives, bail/jeton, erreur, prochaine tentative, résultat et journal. Le worker
reste à construire. Une reprise cible le **même document et numéro**; elle ne recrée
ni reçu, ni facture, ni opération financière. Prévoir écriture/référence de fichier
idempotente et protection contre un worker dont le bail a expiré. État affiché :
« PDF en préparation », « Génération retardée — reprise en cours », puis télécharger.
Une fermeture validée reste réussie si le PDF attend; ne pas proposer de finaliser
à nouveau pour contourner l'échec de rendu. Tester les trois types sur ordinateur
et mobile, contrôle d'accès au fichier compris. Aucun PDF généré dans cette tranche.

## 27. Découpage recommandé et dépendances — UX10 révisée

| Étape, sans nouvelle numérotation de sous-tranche | Dépendances / sortie requise |
| --- | --- |
| Fondation serveur 1A | Base validée, inchangée. |
| Conception 1A.5 | Architecture et périmètre du pilote fictif, Stripe test et PDF approuvés. |
| Extensions serveur checkout payeur et Stripe | Activation pilote, préparation/attestation/blocages, lectures autorisées, récapitulatif payeur, registre de tentatives, montants réservés, confirmation atomique et dédoublonnage fournisseur. |
| Interface administrative et Mes comptes | Routing/contextes/permissions et services ci-dessus; ventes et paiements manuels sur 1A, préparation/checkout payeur sécurisés. |
| Intégration Stripe test | Reprise sélective Elements/Connect, protocole nouveau moteur, retour/reprise, webhooks; jamais writer legacy. Paiements partiels et multiples. |
| Génération PDF | Worker raccordé à l'outbox, rendu des trois pièces, stockage privé, reprise et téléchargement; peut être développé en parallèle après stabilité des instantanés. |
| Validation et pilote fictif | Tests SQL/services/navigateur, Stripe test et trois PDF réussis; association, concours et identités entièrement fictifs dans un environnement isolé. Aucune activation de PROD. |

Stripe test, PDF et checkout payeur ne sont donc **pas postérieurs au pilote**.
Le workflow complet de litige, remboursements/rétrofacturations, modalités complexes,
exports et automatisation de toutes les sources peuvent suivre. Sans ces traitements,
un remboursement ou litige fournisseur externe peut désynchroniser le solde HSP :
détecter/conserver les événements non pris en charge, bloquer la finalisation du
compte concerné et organiser une revue manuelle, sans réécrire la facture. Pas de
promesse de rapprochement complet ou de traitement automatique des fonds réels.

### Décisions techniques encore ouvertes

- Confirmer Connect Express/destination charges + Elements comme architecture de
  reprise, la capture automatique pour les paiements de test, la portée Customer
  et l'absence d'obligation d'enregistrer une carte. Recommandations techniques,
  sans validation du modèle commercial du déploiement réel.
- Confirmer une tentative Stripe active par compte, le protocole de réservation du
  montant et la résolution d'une tentative sans réponse; préciser les limites de
  montant partiel et les exigences de paiement d'un service.
- Choisir l'association fictive et les contextes de démonstration, les rôles d'activation, le moyen
  de contacter le personnel sans workflow complet et la procédure de blocage/revue.
- Préparer la vente fictive représentant la stalle pour la démonstration. Le
  raccordement de vraies réservations relève uniquement du premier déploiement réel
  si cette source y est utilisée; ce n’est plus une décision ouverte pour le pilote.
- Fixer la cadence de reprise webhooks/PDF, la conservation des preuves et l'accès
  aux anomalies. Les garanties de non-duplication et d'autorisation sont obligatoires.

## 28. Critères supplémentaires Stripe, checkout et PDF

Les tests ci-dessous sont **à implémenter et exécuter avant pilote**; l'audit de code
ne vaut pas validation de l'intégration recovery. Aucun paiement lancé ici.

| Couche | Scénarios requis et résultats attendus |
| --- | --- |
| SQL | Unicité association/contexte/payeur, tentative/fournisseur/événement/reçu, droits payeur et isolation; montant falsifié, devise imposée, maximum sous verrou, excédent refusé. Encaissement + affectations + reçu + outbox atomiques. |
| Services / Stripe test | Succès, partiel, deux paiements sur un compte, refus carte, annulation, authentification supplémentaire, webhook retardé/répété/désordonné, signature invalide, retour perdu, retry après timeout. Montant réellement reçu; compte reste ouvert après succès. |
| Services / permissions | Autre payeur, autre association, contexte non adopté ou hors pilote, droits révoqués, identifiant fournisseur substitué : refus sans fuite. Séparation stricte clés test/production et rejet objets live. |
| Concurrence SQL + services | Double clic, réponse perdue, paiement et ajout de frais, paiement et finalisation, deux encaissements simultanés : aucun excédent, aucune double écriture; recalcul/version sous verrou. Finalisation avant confirmation du paiement refusée. |
| Navigateur ordinateur/mobile | Payer mon compte, montant partiel, 3DS, annulation, retour incomplet, reprise de tentative, états visibles de la section 25; compte payé non prêt puis prêt, récapitulatif et finalisation explicite. Aucun retour navigateur utilisé comme preuve. |
| Documents | Relevé/reçu/facture PDF lisibles et téléchargeables seulement par rôles autorisés; échec de rendu, retry, expiration de bail et double worker : même UUID/numéro, aucun second document financier. Clôture réussie pendant rendu en attente. |
| Non-duplication bout en bout | Webhooks répétés + double clic + timeout + finalisations secrétaire/payeur concurrentes : un reçu par encaissement et une facture finale par compte; deux paiements Stripe de test distincts donnent deux reçus distincts. |
| Limites | Remboursement/rétrofacturation hors workflow : anomalie durable et blocage/revue, pas encaissement négatif inventé. Historique legacy intact, aucune activation live ou inter-association. |


Les critères de démonstration utilisent exclusivement des fixtures fictives et des
objets Stripe test. Tester explicitement refus, annulation, authentification
supplémentaire, traitement/webhook retardé, retour navigateur perdu, reprise après
timeout et absence de double paiement/reçu. Vérifier le marquage de démonstration
sur les écrans/PDF, le rejet des clés et objets live et l'absence de dépendance à
PROD ou à un historique réel. Ces essais ne remplacent pas la validation séparée
requise pour le premier déploiement réel.
