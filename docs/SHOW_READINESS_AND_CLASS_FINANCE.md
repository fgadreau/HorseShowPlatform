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

### Fermeture des inscriptions et ordre de passage

Avant le calcul final des resultats et des bourses, l'app doit gerer la fermeture operationnelle des inscriptions:

- Chaque bloc de classe peut avoir une date/heure de fermeture des inscriptions, avec un defaut logique: la veille de la classe a 18h.
- Une association peut accepter les inscriptions tardives apres cette fermeture.
- Le frais late par defaut est 50% du frais d'inscription, mais il doit rester configurable par classe/show.
- Si les inscriptions tardives sont refusees, l'inscription doit etre bloquee apres la fermeture.
- Si elles sont acceptees, la penalite doit etre facturee comme une ligne separee pour rester claire sur la facture.
- L'ordre de passage ne doit pas etre publie automatiquement au cutoff. Le cutoff rend l'action disponible, mais la sortie/publication reste une action manuelle du gestionnaire.
- Les inscriptions tardives acceptees doivent etre ajoutees au debut de la classe avec des numeros d'ordre de passage negatifs.
- Lors de l'inscription, un cavalier ne peut pas etre inscrit plus de trois fois dans une meme division.
- Lors de l'inscription, un meme cheval ne peut etre inscrit qu'une seule fois par classe, meme si la classe contient plusieurs divisions.
- Lors de la generation de l'ordre de passage, l'app doit viser le plus grand espacement possible entre les passages du meme cavalier.
- Le minimum vise est huit chevaux entre deux passages du meme cavalier. Si ce minimum est mathematiquement impossible, l'app doit maximiser l'ecart et produire un avertissement futur.
- Le reste de l'ordre doit rester aleatoire.
- HSP reste la source officielle des inscriptions. ShowScore peut recevoir ou consulter l'ordre de passage prepare, mais les classements, resultats officiels et payout final seront traites dans une phase ulterieure.

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

- Un show reel peut contenir un ou plusieurs slates NRHA, c'est-a-dire des shows techniques aux yeux de la NRHA.
- Un slate contient des blocs de classe dans l'horaire.
- Un bloc de classe peut contenir des divisions mixtes: NRHA, maison, AQR, ou autres.
- Une division represente l'option precise ou le concurrent s'inscrit, ex. `1100 Open`.
- La categorie NRHA doit donc etre stockee sur la division, pas sur le bloc.
- Plusieurs divisions peuvent courir ensemble dans le meme bloc.

Le mapping NRHA officiel doit donc commencer par les divisions ou divisions de preset. Le bloc reste l'objet d'horaire, et le slate regroupe les blocs qui appartiennent au meme show technique.

La saisie d'une division NRHA doit proposer une liste deroulante triee par numero de classe, basee sur les 89 classes du PDF approuve NRHA fourni. La selection remplit le numero, le nom officiel et la categorie NRHA de la division.

## Added money, jackpot, payback et retainage

Les organismes ne gerent pas tous les bourses de la meme facon. Il faut donc separer:

- Regles financieres de l'association.
- Regles financieres du show.
- Regles financieres de la classe/division.
- Regles propres a l'organisme.

### Heritages et overrides financiers

Le retainage est souvent un reglage de l'association, mais il doit pouvoir etre modifie pour un show ou pour une division precise.

Ordre d'heritage recommande:

1. Association: retainage par defaut, devise principale, numeros de taxes, taux de taxes par defaut.
2. Show: override de retainage, devise du show, taux de reference utiles pour rapports.
3. Division: override final pour retainage, added money, jackpot, trophy/plaque fee, frais organisme et payout schedule.

Le setup de division doit inclure le prix du trophee/plaque, parce que ce montant peut etre retire du calcul de bourse avant le payout selon l'organisme.

### Types de payout

Chaque payout schedule devrait avoir un court descriptif pour aider le gestionnaire a choisir:

- NRHA Schedule A: standard NRHA pour la majorite des classes ancillary. Payout plus concentre selon les brackets; moins de concurrents peuvent recevoir de l'argent dans certains cas, mais les premieres positions recoivent une plus grosse portion.
- NRHA Schedule B: utilise pour les classes NRHA Category 1 avec 2,000$ ou plus en added money. Payout adapte aux classes avec added money important.
- Payout maison concentre: moins de places payees, montants plus eleves aux premieres positions.
- Payout maison reparti: plus de places payees, montants plus petits par place, utile pour encourager la participation.
- Jackpot 100%: la portion admissible retourne aux concurrents selon le tableau choisi, avec retainage a 0% ou tres clairement configure.
- Aucun payout: classe sans bourse.

Le payout maison doit etre facile a remplir: tranches par nombre d'entrees, nombre de places payees et pourcentage par place, avec validation que le total donne 100%.

Premiere approche implementee dans le setup de division: un tableau maison stocke dans `payout_rules.custom_brackets`, avec min/max d'entrees et pourcentages par place. L'interface affiche un apercu estimatif de la bourse selon un nombre d'entrees simule. Le calcul final officiel, les egalites, scratches, rapports et paiements aux gagnants viendront dans une phase separee.

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

### Devises et rapports organismes

L'app doit pouvoir calculer les bourses dans la devise du show, par exemple CAD pour une association canadienne.

Certains organismes, comme NRHA, operent en USD. Le payout aux concurrents peut rester en CAD si le show est en CAD, mais les rapports envoyes a NRHA devront convertir les montants selon le taux de reference annuel reconnu par NRHA pour l'annee concernee.

Information a prevoir:

- Devise principale de l'association.
- Devise du show, avec override possible.
- Devise de rapport par organisme externe, ex. NRHA en USD.
- Taux de reference annuel par organisme et par annee.
- Date ou annee de reference du rapport.
- Montant original, devise originale, montant converti et taux utilise dans chaque rapport organisme.

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
- `organization_exchange_rates`
- `organization_report_currency_rules`
- `payout_calculations`
- `sanctioning_body_reports`
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
- Ajouter devise du show et taux de reference organisme pour rapports.
- Calculer la bourse estimative et finale.

### Phase 5: Notifications et checklists

- Centre de notifications gestionnaire.
- Checklist pre-saison utilisateur.
- Checklist reservation/inscription.
- Statuts "pret", "incomplet", "en revision", "bloque".

## Questions ouvertes

- Les taxes doivent-elles etre configurees par type de produit ou par produit individuel?
- Comment chaque organisme gere-t-il les jackpots, added money, incentives et earnings?
- Quels memberships peuvent etre achetes directement dans l'app?
- Quels paiements doivent bloquer l'inscription et lesquels peuvent rester manuels?
- A quel moment faut-il convertir le champ de slate en table dediee avec numerotation, dates, restrictions et rapports par organisme?
- Comment importer ou confirmer les taux annuels officiels NRHA et autres organismes?
