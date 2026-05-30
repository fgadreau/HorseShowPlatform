# Horse Show Platform - Workflows Métier (MVP)

## Vue d'ensemble

Ce document définit les workflows clés du MVP avec les statuts, transitions, règles métier et cas d'usage.

---

## 1. WORKFLOW : INSCRIPTION (ENTRY CREATION)

### 1.1 Acteurs & Permissions

| Acteur | Peut créer | Peut modifier | Peut supprimer |
|--------|-----------|---------------|----------------|
| Owner | ✅ Ses chevaux | ✅ Siennes | ✅ Siennes |
| Agent | ✅ Chevaux assignés | ✅ Assignées | ✅ Assignées |
| Secretary | ✅ N'importe quel | ✅ N'importe quelle | ✅ N'importe quelle |
| Show Organizer | ✅ N'importe quel | ✅ N'importe quelle | ❌ |

### 1.2 Statuts d'Entry

```
DRAFT
  ↓
  ├─→ PENDING_CHECKOUT (Owner/Agent a validé)
  │     ↓
  │     └─→ ACTIVE (Facture générée & checkout complété)
  │           ↓
  │           ├─→ SCRATCHED (Annulé avant/après deadline)
  │           └─→ COMPLETED (Show terminé)
  │
  └─→ CANCELLED (Abandonné)
```

**Statuts détaillés :**
- `draft` : En cours de création, pas encore confirmé
- `pending_checkout` : Validé, en attente de checkout/facturation
- `active` : Invoice générée, en attente de paiement ou payée
- `scratched` : Annulé par Owner/Agent/Secretary, refund request possible
- `cancelled` : Annulé administrativement
- `completed` : Show terminé

### 1.3 Processus Détaillé : Owner/Agent Crée une Entry

#### Étape 1 : Sélection et Validation

```
User (Owner/Agent) sélectionne :
  - Cheval (le sien ou assigné)
  - Show
  - Classe(s)
  - Division(s)

Système valide :
  ✓ Classe existe et est ouverte
  ✓ Deadline d'inscription pas dépassée
  ✓ Max entries par classe pas atteint
  ✓ Cheval pas déjà inscrit à cette classe
  ✓ Fields obligatoires : horse_id, owner_contact_id, payer_contact_id, rider_contact_id (optionnel)
  ✓ Prix existe pour la classe/division
  
Si validation échoue → Erreur + instruction à l'utilisateur
Si validation OK → Passer à Étape 2
```

#### Étape 2 : Création du Brouillon

```
Status = DRAFT

Champs remplis :
  - horse_id
  - owner_contact_id
  - agent_user_id (optionnel)
  - rider_contact_id (optionnel)
  - payer_contact_id (qui reçoit la facture)
  - created_by_user_id = current_user
  - base_fee = class entry_fee
  - status = 'draft'

User peut :
  - Ajouter d'autres chevaux/classes
  - Voir le panier avec les frais estimés
  - Modifier le payer_contact_id
  - Ajouter des notes spéciales
```

#### Étape 3 : Ajout de Stalls (Optionnel)

```
User peut ajouter des stall bookings maintenant ou plus tard.

Si stall ajouté :
  - Sélectionner type stall, dates, quantité
  - Sélectionner payer (même que entry ou différent)
  - Réserver : status = reserved, quantité décrementée
  
Les stalls s'ajoutent au panier
```

#### Étape 4 : Checkout & Confirmation

```
User revoit le panier :
  - Entries : class name, division, horse name, fees
  - Stalls : type, dates, quantity, fees
  - Extras : (vides au MVP)
  - Total : sum(entry_fees) + sum(stall_fees) + taxes

User clique "Confirm & Checkout"

Système :
  - Valide à nouveau les données
  - Change status : DRAFT → PENDING_CHECKOUT
  - Crée ou met à jour l'INVOICE
  - Vérifie/enregistre le payer_contact_id
```

#### Étape 5 : Création de l'Invoice

```
Un brouillon d'invoice est créé :

invoice {
  status = 'draft'
  payer_contact_id = entry.payer_contact_id
  total_amount = sum des line items
  total_paid = 0
}

Invoice line items :
  - Entry 1 : "Reining Non-Pro" → base_fee
  - Stall 1 : "12x12 Stall (3 days)" → stall_fee
  - Tax : subtotal * tax_rate

Invoice status remplace DRAFT → SENT
Email sent to payer avec lien de paiement Stripe
```

#### Étape 6 : Paiement & Finalisation

```
Cas 1 : Paiement Stripe
  - Payer clique le lien de paiement
  - Stripe charge le montant total
  - Webhook Supabase enregistre payment
  - Invoice status : SENT → PAID
  - Entry status : PENDING_CHECKOUT → ACTIVE
  - Email confirmation à payer + owner + agent

Cas 2 : Paiement Manuel (Secretary)
  - Secretary enregistre le paiement manuel
  - Crée payment record (method = cash/check/etransfer/etc)
  - Invoice status : SENT → PAID
  - Entry status : PENDING_CHECKOUT → ACTIVE
  
Cas 3 : Partial Payment
  - Premier paiement Stripe : $500
  - Invoice status : SENT → PARTIALLY_PAID
  - Balance due : $300
  - Secretary peut enregistrer deuxième paiement manuel
  - Invoice status : PARTIALLY_PAID → PAID
```

### 1.4 Workflow Secretary : Crée une Entry pour un Exhibitor

```
Secretary crée entry pour exhibitor (ex: au show office)

1. Cherche/crée le cheval et contacts (owner, rider, payer)
2. Crée l'entry directement avec status = DRAFT
3. Remplit tous les champs (pas d'étapes)
4. Valide et génère invoice immédiatement
5. Imprime facture ou envoie par email
6. Enregistre paiement manuellement si nécessaire
7. Entry status : DRAFT → ACTIVE (bypass checkout)

Secretary a un outil "Quick Entry" pour ce flux simplifié.
```

### 1.5 Règles de Validation (MVP)

```
✓ Cheval existe et appartient à l'owner/agent
✓ Classe existe pour ce show
✓ Classe pas full (entries < max_entries_per_class)
✓ Pas de deadline dépassée (now() < class entry deadline)
✓ Pas d'entrée dupliquée (horse + class + division unique)
✓ Prix de la classe défini
✓ Payer_contact_id défini
✓ Owner et Rider et Rider définis
✓ Horse a un owner (via primary_owner_contact_id ou horse_contacts)

À FUTUR :
  ✗ Validation NRHA/AQHA membership
  ✗ Validation coggins/santé
  ✗ Validation age/eligibility par division
```

---

## 2. WORKFLOW : FACTURATION & PAIEMENTS

### 2.1 Statuts d'Invoice

```
DRAFT (créée, pas envoyée)
  ↓
SENT (email envoyé au payer)
  ├─→ PARTIALLY_PAID (paiement reçu, balance due)
  │     ↓
  │     └─→ PAID (100% payé)
  │
  ├─→ PAID (100% payé directement)
  │
  ├─→ OVERDUE (pas payée après due_date)
  │
  └─→ VOID (annulée)
```

**Statuts en détail :**
- `draft` : Créée mais non envoyée
- `sent` : Email envoyé, en attente
- `viewed` : Payer a consulté (futur tracking)
- `partially_paid` : Au moins 1 paiement reçu, balance_due > 0
- `paid` : Totalement payée
- `overdue` : Past due_date et pas entièrement payée
- `void` : Annulée/remboursée

### 2.2 Contenu d'une Invoice (Line Items)

```
Invoice pour exhibitor typical :

Line Items :
  1. Reining Non-Pro (Entry)           $150.00
  2. Reining Open (Entry)              $150.00
  3. 12x12 Stall (3 days)              $225.00
  4. Shavings (3 days)                 $ 30.00
  5. Hay (3 days)                      $ 45.00
  6. Tack Stall                        $ 50.00
  7. Office Fee (flat)                 $ 25.00
  
Subtotal                               $675.00
Tax (8%)                               $ 54.00
Discount (coupon "FRIEND10")           $ -72.90

TOTAL                                  $656.10
```

**Types d'items (item_type) :**
- `entry` : Entry fee pour une classe
- `stall` : Stall booking fee
- `extra` : Extras (hay, shavings, tack stall, office fee, etc.)
- `discount` : Remise appliquée
- `fee` : Frais additionnels (late fee, etc.)
- `tax` : Taxes
- `membership` : Fees d'association

### 2.3 Création d'Invoice

#### Trigger 1 : Au Checkout

```
Quand Entry passe DRAFT → PENDING_CHECKOUT :

1. Cherche invoice existante pour (payer_contact_id, show_id, status != 'paid' && status != 'void')
2. Si existe ET unpaid : ajouter line items à cette invoice
3. Si existe et paid : créer nouvelle invoice
4. Si n'existe pas : créer nouvelle invoice

Générer invoice_number : ORG_SLUG-SHOW_ID-SEQUENCE
  Exemple : RHOA-SPRING2025-00001

invoice {
  invoice_number
  show_id
  payer_contact_id
  created_by_user_id = current_user
  status = 'draft'
  issue_date = today
  due_date = configurable (ex: today + 5 days)
  subtotal = 0
  tax_amount = 0
  total_amount = 0
}

line items ajoutés.

Recalculate totals :
  subtotal = sum(item prices)
  tax_amount = subtotal * show.tax_rate
  total_amount = subtotal + tax - discounts
```

#### Trigger 2 : Création Manuelle par Secretary

```
Secretary peut créer une invoice manuellement :

1. Choisir payer_contact_id
2. Choisir show
3. Ajouter line items manuellement
   - Sélectionner type (entry, stall, extra, fee, discount)
   - Entrer description
   - Entrer montant
4. Système calcule taxes
5. Envoyer par email ou imprimer

Utile pour :
  - Frais additionnels non liés à entry/stall
  - Memberships
  - Late fees
  - Adjustments
```

### 2.4 Envoi de l'Invoice

```
Workflow standard :
1. Secretary/System clique "Send Invoice"
2. Invoice status : DRAFT → SENT
3. Email envoyé à payer_contact.email avec :
   - PDF de la facture
   - Lien sécurisé de paiement Stripe
   - Instructions de paiement
4. Payer reçoit l'email
5. Payer clique lien Stripe ou paye manuellement
```

### 2.5 Enregistrement de Paiements

#### Cas A : Paiement Stripe

```
Payer clique lien Stripe → paie montant

Webhook Stripe → Supabase :
  1. Crée payment record :
     {
       invoice_id
       payment_method = 'stripe'
       amount = montant payé
       stripe_payment_intent_id
       stripe_charge_id
       status = 'completed'
       created_by_user_id = system_webhook
     }
  
  2. Update invoice :
     total_paid += amount
     balance_due = total_amount - total_paid
     
     if balance_due == 0 :
       status = 'paid'
     else if total_paid > 0 :
       status = 'partially_paid'
  
  3. Envoyer email confirmation paiement à payer
  4. Email notification à Secretary
```

#### Cas B : Paiement Manuel

```
Secretary enregistre paiement manuellement :

1. Secretary cherche invoice
2. Clique "Record Payment"
3. Formulaire :
   - Montant reçu
   - Méthode : cash / check / e-transfer / bank_transfer / comped
   - Check number (si check)
   - Référence (si e-transfer/bank)
   - Notes
4. Crée payment record
5. Invoice recalculée (total_paid, balance_due, status)
6. Email confirmation optionnel

Utile pour :
  - Cash à la porte
  - Chèque reçu
  - E-transfer confirmé
  - Paiements comped (free)
```

#### Cas C : Paiement Partiel Stripe + Manuel

```
Exemple : Invoice $1000

1. Payer paie $600 via Stripe
   → Webhook crée payment Stripe
   → Invoice : total_paid = 600, balance_due = 400, status = partially_paid

2. Secretary reçoit chèque de $400
   → Enregistre payment manuel
   → Invoice : total_paid = 1000, balance_due = 0, status = paid
```

### 2.6 Taxes

```
MVP : Tax rate simple par show

invoice.tax_amount = subtotal * show.tax_rate

Futur :
  - Tax rate par item type
  - Tax exemptions
  - Multi-jurisdictional
```

### 2.7 Discounts

```
MVP : Discount manuel seulement

Secretary peut ajouter discount line item :
  - Description : "FRIEND10 coupon"
  - item_type = 'discount'
  - total_price = -$72.90
  
La remise s'ajoute au calcul :
  total_amount = subtotal + tax + discount

Futur :
  - Coupon system
  - Auto-discounts basé sur entries qty
  - Promo codes
```

---

## 3. WORKFLOW : SCRATCHES & REMBOURSEMENTS

### 3.1 Statuts de Scratch

```
ACTIVE (entry inscrite)
  ↓
  ├─→ SCRATCHED_PENDING_REFUND (demande scratch, refund à approuver)
  │     ↓
  │     ├─→ REFUND_APPROVED (Secretary approuve)
  │     │     ↓
  │     │     └─→ SCRATCHED (Entry annulée, refund initié)
  │     │
  │     └─→ REFUND_DENIED (Secretary refuse)
  │           ↓
  │           └─→ SCRATCHED (Entry annulée, pas de refund)
  │
  └─→ SCRATCHED (Scratch par Secretary sans refund)
```

### 3.2 Politiques de Remboursement

```
Configurable par Organization/Show :

default_refund_policy : string
  - 'full_refund' : 100% remboursement (default)
  - 'percentage' : X% remboursement
  - 'no_refund' : Pas de remboursement
  - 'deadline_based' : Selon deadline (voir ci-dessous)

refund_deadline_based :
  - cutoff_datetime : "Show date - 5 days at 23:59"
  - before_cutoff_refund_pct : 100
  - after_cutoff_refund_pct : 50
  - after_class_draw_refund_pct : 0

administrative_fee_pct : 5 (retenu sur refund)

Exemples :
  "Full refund until May 15 at 6pm, 50% after"
  "No refund after draw published"
  "10% admin fee on all refunds"
```

### 3.3 Processus de Scratch par Owner/Agent

```
1. Owner/Agent clique "Request Scratch" sur entry

2. Système crée scratch request :
   entry.status = SCRATCHED_PENDING_REFUND
   
3. Message à Secretary : "Refund request for Horse X in Reining Non-Pro"

4. Secretary voit request dans dashboard

5. Secretary évalue :
   - Check refund policy
   - Compute eligible refund amount
   - Approve ou Deny
   
   Si before cutoff :
     eligible_refund = entry_fee * 100%
   
   Si after cutoff :
     eligible_refund = entry_fee * 50% - administrative_fee
   
   Si after draw published :
     eligible_refund = $0

6. Secretary clique "Approve Refund"
   - Crée credit/refund record
   - Si payment Stripe : initiate Stripe refund
   - Si payment manuel : créer note "Manual refund to $payer_method"
   - entry.status = SCRATCHED
   - Email confirmation au payer

7. Si Secretary clique "Deny"
   - entry.status = SCRATCHED
   - Email notification "Refund denied, scratch processed"
   - Pas de remboursement
```

### 3.4 Processus de Scratch par Secretary

```
Secretary peut scratch une entry directement :

1. Secretary ouvre entry
2. Clique "Scratch Entry"
3. Choix : "Scratch with refund" ou "Scratch without refund"

Si "Scratch with refund" :
  - Évalue politique
  - Compute eligible_refund
  - Initiate refund si applicable
  - entry.status = SCRATCHED
  - Email confirmation

Si "Scratch without refund" :
  - entry.status = SCRATCHED
  - No refund
  - Email notification
```

### 3.5 Remboursement - Méthodes

```
Cas 1 : Payment Stripe
  - Stripe refund API appelée
  - Montant remboursé à la carte de crédit du payer
  - payment record : status = 'refunded'
  - invoice line item : type peut avoir "refund" flag

Cas 2 : Payment Manuel (Cash)
  - Secretary note "Cash refund given"
  - payment record : type = 'manual_refund'
  - Email reminder à Secretary : "Remember to give cash refund"

Cas 3 : E-transfer/Bank Transfer
  - Secretary crée note avec détails du payer
  - Manual refund à initier par Secretary
  - Email instruction au payer avec détails

Cas 4 : Comped
  - Pas de remboursement (était gratuit)
```

### 3.6 Edge Cases

```
Cas 1 : Entry payée partiellement, scratch après partial payment

Invoice : Total 500, Paid 300, Balance 200

Owner demands refund :
  - Eligible refund = 500 * 50% = 250
  - Already paid = 300
  - Scenario : payer a trop payé !
  - Refund = 300 - 250 = $50 back
  
  Ou :
  - Eligible refund = 500 * 50% = 250
  - Already paid = 300
  - Refund full eligible amount = 250 to cardholder
  - Note: Payer peut disputer si sur-payé

Cas 2 : Plusieurs entries, scratch une seule

Owner a 2 entries pour $300 chacun, inscrit à 2 classes
Paie 1 invoice combined = $600

Owner gratte une entry, eligible refund = $150

Système :
  - Crée credit memo ou adjustment invoice
  - Refund $150 uniquement
  - Autre entry reste active

Cas 3 : Après draw published

Policy = "No refund after draw published"
Owner demands refund anyway

Secretary refuse → No refund
Owner peut contester (hors système)
```

---

## 4. WORKFLOW : RÉSERVATION DE STALLES

### 4.1 Statuts de Stall Booking

```
REQUESTED (demande initial)
  ↓
  ├─→ RESERVED (confirmé, stall alloué)
  │     ↓
  │     ├─→ ACTIVE (Owner arrivé au show)
  │     │     ↓
  │     │     └─→ COMPLETED (Show fini)
  │     │
  │     ├─→ CANCELLED (annulé avant show)
  │     │     ↓
  │     │     └─→ REFUND_PROCESSED (remboursement if applicable)
  │     │
  │     └─→ RELEASED (stall retiré pendant show)
  │
  └─→ CANCELLED (refusé/annulé)
```

### 4.2 Types de Stalls

```
Stall Options (configurable par show) :

- Main Barn Stall (12x12 heated)
- Side Barn Stall (12x12 unheated)
- Tack Stall
- Camping Spot
- RV Hookup
- Shavings (per bag or per stall)
- Hay (per bale or per stall)
- Mats
- Grooming Station (shared, no pricing typically)

Chaque option a :
  - name
  - price
  - total_quantity (ex: 50 stalls disponibles)
  - available_quantity (tracking)
  - category (stall, camping, parking, extra)
```

### 4.3 Réservation Pendant Checkout (Integrated)

```
Owner fait entry(ies), puis :

1. Voit option "Add Stalls/Camping?"
2. Sélectionne :
   - Stall option : "12x12 Main Barn"
   - Quantity : 2
   - Dates : Show Day 1 - Show Day 3 (3 days)
   - Payer : "Same as entries" (default) ou modifiable
3. Stall ajouté au panier
4. À checkout, invoice inclut stall fees
5. Stall booking created avec status RESERVED
6. Quantité disponible décrémentée

Tout dans une seule transaction checkout.
```

### 4.4 Réservation Séparée (Optionnel)

```
Owner peut aussi réserver stalls indépendamment :

1. Accède à "Book Stalls" (avant/après entries)
2. Sélectionne options et dates
3. Créé stall booking(s)
4. Invoice générée pour stall fees uniquement
5. Payer peut différer de entries

Utile si owner veut réserver stalls mais pas d'entries.
```

### 4.5 Processus Détaillé : Réservation de Stall

```
1. Sélection
   - Stall option
   - Quantity (ex: 1 Main stall + 2 shavings)
   - Show dates couvertes

2. Validation
   ✓ Stall option existe
   ✓ Quantity <= available_quantity
   ✓ Horse attaché (si applicable)
   ✓ Horse has health docs (if required by association)
   ✓ Dates ok (no overlaps, within show dates)
   
   À futur :
   ✗ Tack stalls : max 1 per 4 horses
   ✗ Availabilité de la map de stalls

3. Réservation
   stall_booking {
     show_id
     stall_option_id
     horse_id (optionnel)
     booker_contact_id (qui réserve)
     payer_contact_id (qui paie)
     created_by_user_id
     status = 'reserved'
     show_day_start_id
     show_day_end_id
     unit_price = stall_option.price
     total_price = price * days (optionnel: qty)
   }
   
4. Inventory
   stall_options.available_quantity -= quantity
   
5. Invoice
   - Ajouter line item pour stall booking
   - Recalculate invoice totals
   - Si invoice unpaid : envoyer email
```

### 4.6 Annulation et Remboursement de Stall

```
Owner annule stall :

1. Clique "Cancel Booking"
2. Check refund policy
3. Compute eligible refund (même logique que scratch)
4. Secretary approuve ou refuse
5. Si approuvé :
   - Initier refund (Stripe ou manual)
   - stall_booking.status = CANCELLED
   - Inventory : available_quantity += quantity
   - Email confirmation

Secretary peut aussi annuler :
1. Accède au stall booking
2. Clique "Cancel"
3. Même processus que Owner cancellation
```

### 4.7 Configuration des Stalls (Show Organizer)

```
Show Organizer crée stall options :

1. Accède à "Show Setup → Stalls"
2. Crée stall option :
   {
     name: "12x12 Main Barn (Heated)"
     price: $250
     total_quantity: 50
     category: 'stall'
     duration_days: null (flexible)
     show_day_start: null
     show_day_end: null
   }
3. Crée stall option :
   {
     name: "Shavings"
     price: $30
     total_quantity: 200 (bags)
     category: 'extra'
   }
4. Secretary/Admin peut modifier en cas de besoin
5. Dashboard montre stalls réservés vs disponibles

À FUTUR :
  - Map graphique avec positions de stalls
  - Auto-assignment de stalls
  - Restrictions (ex: tack stall max per barn)
```

---

## 5. WORKFLOW : PUBLICATION & RÉSULTATS (MVP Basic)

### 5.1 Contrôle de Publication

```
Show Organizer/Admin configure visibility :

Setting par show :
  - show.is_public = true/false
    → Determine si show visible dans directory public
  
  - show.show_schedule_public = true/false
    → Si true : schedule visible sur public page
  
  - show.show_draw_public = true/false
    → Si true : draw visible (après publication par Secretary)
  
  - show.show_entries_public = true/false
    → Si true : entry list visible (noms chevaux)
  
  - show.show_results_public = true/false
    → Si true : results visible (futur ShowScore intégration)
```

### 5.2 Public Show Page

```
Si show.is_public = true :

www.horseshowplatform.com/shows/ORG_SLUG/SHOW_SLUG

Affiche (si public settings OK) :
  - Show name, dates, location
  - Schedule (classes, times, rings)
  - Entries list (optionnel)
  - Draw (optionnel)
  - Rules/notes
  - Contact info
  - Link to register (if entries open)

Si show.is_public = false :
  → Page require login + permission
```

### 5.3 Schedule Publication

```
Show Organizer crée schedule :

1. Crée show_days (Friday, Saturday, Sunday)
2. Crée classes avec :
   - name, fees, ring, scheduled_time
   - divisions
3. Clique "Publish Schedule"

Si show.show_schedule_public = true :
  → Public page affiche schedule

Si false :
  → Schedule seulement visible pour organization/show members
```

### 5.4 Draw Publication

```
Secretary peut publier draw :

1. Système génère/affiche entry order par class
2. Secretary clique "Publish Draw"
3. draw_published = true
4. Si show.show_draw_public = true :
   → Visible sur public page (entry numbers, horse names, etc.)

Important :
  - Après draw public : refund policy peut changer (ex: no refund)
  - Entries pas changeable après draw publish
```

### 5.5 Results (Futur - ShowScore Integration)

```
MVP : Pas de gestion des résultats dans Horse Show Platform

ShowScore existe en tant qu'app externe/module séparé

À futur :
  - ShowScore API integration
  - Import des résultats
  - Publication sur platform
  - Payout/awards basé sur résultats

MVP focus :
  - Infra pour futur connection
  - Entries créées
  - Schedule fait
  - Paiements reçus
  - Shows réussis !
```

---

## 6. DATA TRANSITIONS & AUDIT

### 6.1 Status Changes à Tracker

```
Entités avec status à audit :

entries :
  - draft → pending_checkout
  - pending_checkout → active
  - active → scratched (created_at, scratched_by_user_id)
  - active → completed

invoices :
  - draft → sent
  - sent → partially_paid → paid
  - * → void (reason)

payments :
  - pending → processing → completed
  - * → failed (error_msg)
  - completed → refunded

stall_bookings :
  - requested → reserved
  - reserved → cancelled
  - reserved → completed
```

### 6.2 Audit Log

```
Créer audit_log table pour track changes :

audit_log {
  id UUID
  table_name : 'entries' | 'invoices' | etc.
  record_id : UUID (entry/invoice/payment id)
  action : 'created' | 'updated' | 'deleted' | 'status_changed'
  old_values : JSONB (avant)
  new_values : JSONB (après)
  changed_by_user_id : UUID
  timestamp : now()
  details : TEXT (ex: "Scratch approved - within refund cutoff")
}

Utile pour :
  - Tracer qui a changé quoi et quand
  - Dispute resolution
  - Audit compliance
```

---

## 7. MVP PRIORITY & SEQUENCING

### Phase 1 : Setup (Week 1-2)
- ✅ Organizations creation
- ✅ Shows creation
- ✅ Classes & divisions setup
- ✅ Stall options configuration

### Phase 2 : Contacts & Horses (Week 2-3)
- ✅ User profiles setup
- ✅ Contacts (Owner, Agent, Rider) creation
- ✅ Horses creation + relationships
- ✅ Organization members roles

### Phase 3 : Entries (Week 3-4)
- ✅ Entry creation workflow (draft → pending_checkout → active)
- ✅ Entry validation
- ✅ Cart/checkout UI

### Phase 4 : Invoicing (Week 4-5)
- ✅ Invoice generation
- ✅ Invoice line items (entries, stalls)
- ✅ Invoice email sending

### Phase 5 : Payments (Week 5-6)
- ✅ Stripe integration
- ✅ Manual payment entry
- ✅ Webhook handling

### Phase 6 : Secretary Tools (Week 6-7)
- ✅ Scratch/refund workflow
- ✅ Stall booking management
- ✅ Payment reconciliation

### Phase 7 : Public Page (Week 7)
- ✅ Show public page
- ✅ Schedule/draw publication
- ✅ Basic public visibility

---

## 8. Future Workflows (V2+)

```
- Split billing (multiple payers per invoice)
- Eligibility validation (NRHA/AQHA membership)
- ShowScore results integration
- Judge/Scribe/Announcer roles
- QuickBooks/Xero integration
- Advanced map visualization
- Promotional codes & auto-discounts
- Year End Awards
- Dynamic pricing / surge pricing
```

---

