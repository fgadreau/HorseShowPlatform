# Show readiness, class presets, eligibility, and finance

Ce document garde les decisions produit a reprendre plus tard pour les chantiers de preparation pre-saison, exigences d'inscription, préréglages de classes, notifications, taxes et calcul de bourses.

## Principe central

L'app doit separer clairement quatre questions:

- Est-ce que le concurrent est pret pour la saison?
- Est-ce que le concurrent peut venir a ce show?
- Est-ce que le couple cavalier/cheval peut entrer dans cette classe?
- Quels frais, taxes, bourses, retainage et paiements doivent etre calcules?

Ces questions se recoupent dans l'interface, mais elles ne doivent pas etre melangees dans le modele de donnees.

## Checklists utilisateur

### Preparation pre-saison

La preparation pre-saison devrait etre une checklist dans l'espace utilisateur final.

Items prevus:

- Profil utilisateur complet.
- Contacts/cavaliers crees et lies au compte.
- Chevaux crees avec proprietaire, agent et references externes.
- Numeros de membre externes saisis.
- Au moins une adhesion OPTS active si une association/show l'exige.
- Coggins valide et documents de sante approuves.
- Certificats de vaccination deposes, si requis.
- Moyen de paiement ou contact payeur pret.

Cette checklist peut etre globale au compte, puis adaptee selon l'association/show choisi.

### Reservation et inscription

La checklist de reservation/inscription devrait attendre que les champs et les flux soient plus complets.

Items prevus:

- Show selectionne.
- Cavalier admissible pour le show.
- Cheval admissible pour le show.
- Coggins et sante valides a la date de reference du show.
- Adhesions show-level satisfaites.
- Classe/division choisie.
- Exigences class-level satisfaites.
- Stalls, tack stalls, camping et extras choisis.
- Facture generee avec lignes visibles.
- Taxes appliquees selon les produits taxables.
- Paiement complete ou statut manuel approuve selon la politique du show.

## Centre de notifications

Il faudra un centre de notifications pour les gestionnaires d'association et, plus tard, pour les utilisateurs finaux.

Notifications gestionnaire:

- Coggins en revision manuelle.
- Certificat vaccin en revision manuelle.
- Document de sante qui vient a echeance.
- Cheval avec document expire mais deja lie a un show futur.
- Adhesion obligatoire manquante ou expiree.
- Membership d'association achete mais en attente de paiement/approbation.
- Facture impayee ou paiement manuel a confirmer.

Les notifications peuvent etre de deux types:

- Persistantes: creees dans une table `notifications` ou `tasks`, marquees lues/resolues.
- Calculees: derivees a la volee depuis les documents de sante, memberships, entries et factures.

## Questionnaires et formulaires guides

Les formulaires d'ajout devraient evoluer vers des parcours guides plutot que des gros formulaires.

Exemple pour ajouter un cheval:

- Identite du cheval.
- Proprietaire et agent.
- References externes, ex. licence competition NRHA.
- Documents de sante: Coggins, vaccin influenza/rhino.
- Resume: pret, incomplet, en revision, ou bloque.

Le parcours doit permettre la sauvegarde partielle, parce qu'un utilisateur peut ne pas avoir tous les documents au meme moment.

## Types d'exigences

### Show-level requirements

Ces exigences determinent si un concurrent peut venir au show.

Exemples:

- Membre de l'association hote.
- Possibilite d'acheter une carte de membre de l'association hote.
- Au moins une adhesion OPTS acceptee.
- Documents de sante valides.
- Facture/paiement en regle, selon la politique du show.

Ces exigences appartiennent a l'association ou au show, pas a une classe precise.

### Class-level requirements

Ces exigences determinent si un couple cavalier/cheval peut entrer dans une classe/division.

Exemples:

- Membership NRHA requis pour une classe NRHA.
- Licence de competition NRHA du cheval requise.
- Membership AQHA requis pour une classe AQHA.
- Membership NSBA requis pour certaines classes.
- Regles d'age, statut, earnings, rookie, youth, non pro, open, etc.

Ces exigences doivent etre liees aux class presets, classes ou divisions.

## OPTS et assurance provinciale

Les OPTS, comme Cheval Quebec, doivent etre traitees differemment des autres adhesions externes.

Regle souhaitee:

- Une association peut exiger au moins une adhesion OPTS active.
- L'association choisit quelles OPTS sont acceptees.
- Le cavalier doit satisfaire au moins une adhesion dans ce groupe.
- L'app ne doit pas exiger toutes les OPTS cochees.

Modele conceptuel:

- `external_organizations.type = provincial_sport_org` ou `insurance_membership`.
- `requirement_group.type = at_least_one`.
- `requirement_group.members = [Cheval Quebec, Ontario Equestrian, ...]`.

L'app peut accepter plusieurs adhesions OPTS dans le dossier d'un contact, mais la validation doit seulement demander au moins une adhesion active acceptee.

## Memberships achetables

Une association doit pouvoir vendre ses propres cartes de membre.

Exemples:

- Carte de membre de l'association hote.
- Carte journaliere ou temporaire.
- Membership annuel.

Ces produits doivent pouvoir:

- Etre ajoutes pendant la preparation ou l'inscription.
- Creer une ligne de facture.
- Etre marques payes ou en attente.
- Mettre a jour un statut de membership lorsque le paiement est confirme.
- Avoir une regle taxable ou non taxable selon l'association.

## Prereglages de classes

L'app doit avoir une bibliotheque de préréglages par organisme.

Organismes prevus:

- NRHA.
- AQHA.
- NSBA.
- AQR / maison.
- Autres organismes futurs.

Chaque preset devrait contenir:

- Organisme.
- Code/numero officiel.
- Nom officiel.
- Categorie.
- Type: Open, Non Pro, Youth, Rookie, Green, Aged Event, Freestyle, etc.
- Exigences cavalier.
- Exigences cheval.
- Eligibilite et notes de regles.
- Classe eligible ou non aux awards.
- Earnings comptent ou non.
- Frais par defaut optionnels.
- Regles financieres par defaut.

### NRHA

Pour NRHA, la categorie est lisible depuis le code, mais elle doit etre stockee explicitement. Les categories 10, 11, 12 et 13 ne peuvent pas etre deduites uniquement par le premier caractere.

Exemples:

- `1100 Open`: categorie 1.
- `5300 Rookie Level 1`: categorie 5.
- `9100 Freestyle Open`: categorie 9.
- `10001 Green Reiner Level 2`: categorie 10.
- `11011 Para-Reining`: categorie 11.

Le PDF `NRHA_Approved_Classes.pdf` contient une premiere liste exploitable de codes et noms.

### Classes, divisions et slates

Dans l'app:

- Une classe peut representer un bloc dans l'horaire ou un slate.
- Une division peut representer l'option precise ou le concurrent s'inscrit.
- Plusieurs divisions peuvent courir ensemble dans le meme bloc.

Le mapping exact NRHA devra etre decide cas par cas, parce que certains numeros officiels ressemblent davantage a des divisions qu'a des blocs horaires.

## Added money, jackpot, payback et retainage

Les organismes ne gerent pas tous les bourses de la meme facon. Il faut donc separer:

- Regles financieres de l'association.
- Regles financieres du show.
- Regles financieres de la classe/division.
- Regles propres a l'organisme.

### NRHA payback

Le PDF `showrules.pdf` indique notamment:

- Schedule A pour les classes NRHA ancillary, sauf cas speciaux.
- Schedule B pour les Category 1 avec `2,000$` ou plus en added money.
- Le calcul utilise les entry fees, nombre d'entrees, trophy/plaque fees, frais NRHA 5%, retainage show, added money, puis la table de payback.
- Si le net entry fee est negatif, il n'y a pas de 5% NRHA ni de show retainage; le added money annonce est paye selon la schedule appropriee.
- Les classes Youth ont des exemptions indiquees dans le worksheet, par exemple 0 pour certains frais.

Modele de calcul NRHA conceptuel:

```text
entry_fee * number_of_entries = gross_entry_fees
gross_entry_fees - trophy_or_plaque_fee = base_after_fees
base_after_fees * 5% = nrha_fee
base_after_fees - nrha_fee = net_entry_fee
net_entry_fee * show_retainage_percent = show_retainage_amount
net_entry_fee - show_retainage_amount = final_net_entry_fee
final_net_entry_fee + added_money = purse
purse * payback_schedule = payout per placing
```

## Taxes et numeros de taxes

Chaque association doit pouvoir configurer ses taxes.

Information a prevoir:

- Nom legal de l'association pour facturation.
- Numero de taxes federal/provincial selon la juridiction.
- Taux de taxes par defaut.
- Pays/province/etat.
- Devise.
- Produit taxable ou non taxable.

Chaque produit ou type de ligne doit avoir une option taxable:

- Entry fee taxable ou non.
- Judge fee taxable ou non.
- Stall taxable ou non.
- Camping taxable ou non.
- Ripe/shavings taxable ou non.
- Foin taxable ou non.
- Membership taxable ou non.
- Admin fee taxable ou non.
- Merchandise taxable ou non.

Le taux global de l'association ne suffit pas. Il faut aussi savoir quels produits sont taxables pour cette association.

## Objets de donnees pressentis

Noms indicatifs a raffiner avant implementation:

- `external_organizations`
- `external_membership_requirements`
- `requirement_groups`
- `organization_membership_products`
- `class_preset_catalogs`
- `class_preset_items`
- `class_preset_eligibility_rules`
- `organization_financial_settings`
- `show_financial_settings`
- `product_tax_rules`
- `payback_schedules`
- `payback_schedule_brackets`
- `class_financial_rules`
- `payout_calculations`
- `notifications` ou `tasks`

## Phases de mise en place

### Phase 1: Catalogue et requirements

- Modeliser les class presets officiels.
- Importer une premiere liste NRHA.
- Separer requirements show-level et class-level.
- Ajouter la notion de requirement group pour OPTS.

### Phase 2: Memberships achetables

- Creer des produits de membership d'association.
- Les lier aux factures.
- Mettre a jour le statut du membership apres paiement.

### Phase 3: Taxes par association

- Ajouter les numeros de taxes.
- Ajouter les produits taxables/non taxables.
- Revoir le calcul de facture pour appliquer les bonnes taxes par ligne.

### Phase 4: Payback et bourses

- Modeliser schedules A/B et autres schedules futurs.
- Ajouter added money, jackpot, retainage, trophy/plaque fees et frais organisme.
- Calculer la bourse estimative et finale.

### Phase 5: Notifications et checklists

- Centre de notifications gestionnaire.
- Checklist pre-saison utilisateur.
- Checklist reservation/inscription.
- Statuts "pret", "incomplet", "en revision", "bloque".

## Questions ouvertes

- Est-ce que le retainage est defini par association, par show, par classe, ou les trois avec override?
- Les taxes doivent-elles etre configurees par type de produit ou par produit individuel?
- Comment chaque organisme gere-t-il les jackpots, added money, incentives et earnings?
- Quels memberships peuvent etre achetes directement dans l'app?
- Quels paiements doivent bloquer l'inscription et lesquels peuvent rester manuels?
- Quelle granularite est souhaitee pour NRHA: classe officielle comme division ou comme classe horaire?
