# Horse Show Platform - Concepts Financiers (MVP)

## 1. Vue d'ensemble - Model de Facturation

Horse Show Platform MVP utilise un modèle de facturation simple mais flexible :

```
Entry/Stall Booking
    ↓
    └─→ Invoice générée
         ↓
         ├─→ Line items (entries, stalls, extras)
         ├─→ Taxes calculées
         ├─→ Discounts appliqués
         ↓
         ├─→ Total = subtotal + tax - discounts
         ↓
         ├─→ Payment(s) enregistré(s)
         │    ├─→ Stripe (en ligne)
         │    ├─→ Manuel (cash, check, e-transfer, bank transfer)
         │    └─→ Partial payments supportées
         ↓
         └─→ Invoice status : draft → sent → paid/partially_paid
```

---

## 2. Types de Frais (Line Items)

### 2.1 Entry Fees

```
Frais d'inscription pour une classe/division

entry_fee {
  item_type: 'entry'
  entry_id: UUID (lien à l'entry)
  description: "Reining Non-Pro - Junior division"
  quantity: 1
  unit_price: $150.00 (de la classe)
  total_price: $150.00
  tax_amount: $12.00 (si applicable)
}

Rules :
- Un item par entry (une class)
- Prix vient de classes.entry_fee
- Configurable par division (division peut override entry_fee)
- Peut être inclus ou exclus de tax selon policy
```

### 2.2 Stall Fees

```
Frais pour réservation de stalls

stall_fee {
  item_type: 'stall'
  stall_booking_id: UUID
  description: "12x12 Main Barn Stall (3 days)"
  quantity: 1
  unit_price: $250.00
  total_price: $250.00 (price * days or * quantity)
  tax_amount: $20.00
}

Extra items (liés à stall ou show) :

{
  item_type: 'extra'
  description: "Shavings (bag)"
  quantity: 3
  unit_price: $10.00
  total_price: $30.00
  tax_amount: $2.40
}

Types d'extras typiques :
- Shavings (par bag ou par day)
- Hay (per bale)
- Straw
- Mats
- Tack stall
- Grooming station (peut être gratuit)
- Water/electricity hookup
- Camping spot
- RV hookup
```

### 2.3 Membership & Other Fees

```
membership_fee {
  item_type: 'membership'
  description: "NRHA Membership - annual"
  quantity: 1
  unit_price: $50.00
  total_price: $50.00
  tax_amount: $0.00 (typiquement non-taxable)
}

office_fee {
  item_type: 'fee'
  description: "Office/Registration Fee"
  quantity: 1
  unit_price: $25.00
  total_price: $25.00
  tax_amount: $0.00
}

Other possible items:
- Drug testing fee
- Video feed fee
- Coaching/training (if offered)
- Merchandise (caps, shirts, etc.)
- Late entry fee
- Admin fee
```

### 2.4 Taxes

```
tax_line_item {
  item_type: 'tax'
  description: "Sales Tax (8%)"
  quantity: 1
  unit_price: null
  total_price: $54.00 (calculated)
  tax_amount: $0.00 (pas de tax sur la tax)
}

Calculation :
taxable_items = sum(items où tax_applicable = true)
tax_amount = taxable_items * show.tax_rate

Show peut configurer :
- tax_rate : 0.08 (8%)
- items_exempt : ['membership', 'fee'] (exempt list)

MVP : Simple tax rate seulement. Tous les items taxables sauf ceux dans exempt list.
```

### 2.5 Discounts

```
discount_line_item {
  item_type: 'discount'
  description: "Early bird discount 10% - EARLY10"
  quantity: 1
  unit_price: null
  total_price: -$67.50 (negative)
  tax_amount: $0.00
}

Calculation :
discount_amount = -(subtotal * 0.10)

MVP : Discount manuel seulement (Secretary ajoute)

Futur :
- Coupon/promo codes
- Auto-discounts (ex: if entries >= 3, 5% off)
- Early bird dates
```

---

## 3. Structure d'Invoice

### 3.1 Exemple d'Invoice Complète

```
HORSE SHOW PLATFORM
Invoice #: RHOA-SPRING2025-00001

Bill To:
Jane Smith
jane@example.com
(555) 123-4567

Invoice Date: May 10, 2025
Due Date: May 15, 2025
Organization: RHOA Spring Show 2025

---

LINE ITEMS :
  Description                        Qty    Unit Price    Total
  ─────────────────────────────────────────────────────────────
1. Reining Non-Pro                      1    $150.00      $150.00
2. Reining Open                         1    $150.00      $150.00
3. 12x12 Main Barn Stall (3 days)      1    $250.00      $250.00
4. Shavings (bag)                       2     $10.00       $20.00
5. Hay (bale)                           1     $15.00       $15.00
6. Tack Stall                           1     $50.00       $50.00

Subtotal:                                              $685.00
Sales Tax (8%):                                         $54.80
───────────────────────────────────────────────────────────────
Early Bird Discount 10%:                              -$73.98
───────────────────────────────────────────────────────────────
TOTAL DUE:                                            $665.82

PAYMENTS RECEIVED:
  Date        Method           Amount
  ─────────────────────────────────────
  May 11      Stripe           $665.82

BALANCE DUE: $0.00

Payment Terms: Due upon receipt
Notes: Thank you for entering RHOA Spring Show 2025!

Payment Methods:
  - Stripe: [Secure Payment Link]
  - Bank Transfer: [Details]
  - E-Transfer: secretary@rhoa.ca
  - Cash/Check: Accepted at show office

Thank you for your business!
```

### 3.2 Invoice Schema (Database)

```
invoices {
  id: UUID
  invoice_number: VARCHAR(50)  -- ORG-SHOW-SEQUENCE
  show_id: UUID (FK)
  organization_id: UUID (FK)
  payer_contact_id: UUID (FK)
  created_by_user_id: UUID (FK)
  
  issue_date: DATE
  due_date: DATE
  
  status: ENUM ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void']
  
  -- Amounts
  subtotal: DECIMAL(12,2)
  tax_amount: DECIMAL(12,2)
  discount_amount: DECIMAL(12,2)
  total_amount: DECIMAL(12,2)
  
  -- Payment tracking
  total_paid: DECIMAL(12,2) DEFAULT 0
  balance_due: DECIMAL(12,2) GENERATED AS (total_amount - total_paid)
  
  -- Metadata
  notes: TEXT
  payment_terms: TEXT
  
  sent_at: TIMESTAMP
  sent_by_user_id: UUID
  
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}

invoice_line_items {
  id: UUID
  invoice_id: UUID (FK)
  
  item_type: ENUM ['entry', 'stall', 'extra', 'membership', 'fee', 'discount', 'tax']
  item_id: UUID (entry_id or stall_booking_id, NULL for manual items)
  
  description: VARCHAR(255)
  quantity: DECIMAL(10,2)
  unit_price: DECIMAL(12,2)
  total_price: DECIMAL(12,2)
  
  tax_applicable: BOOLEAN DEFAULT true
  tax_amount: DECIMAL(12,2)
  
  created_at: TIMESTAMP
}
```

---

## 4. Calcul des Totals

### 4.1 Formule Standard

```
SUBTOTAL = sum(line_item.total_price where item_type NOT IN ['tax', 'discount'])

TAXABLE_SUBTOTAL = sum(line_item.total_price 
                       where tax_applicable = true 
                       AND item_type NOT IN ['discount', 'tax'])

TAX_AMOUNT = TAXABLE_SUBTOTAL * show.tax_rate

DISCOUNT_TOTAL = sum(line_item.total_price where item_type = 'discount')
                (note: negative values)

TOTAL = SUBTOTAL + TAX_AMOUNT + DISCOUNT_TOTAL

BALANCE_DUE = TOTAL - total_paid

Exemple :
  Entry 1: $150
  Entry 2: $150
  Stall:   $250
  Extra:    $20
  ──────────────
  Subtotal: $570
  Tax 8%:    $45.60
  Discount: -$50.00
  ──────────────
  Total: $565.60
```

### 4.2 Recalculation Triggers

```
Recalculer totals et status d'invoice quand :

1. Line item ajouté
2. Line item supprimé
3. Line item modifié (qty, price)
4. Discount appliqué/removed
5. Tax rate changé (admin action)
6. Payment enregistré
   - Si balance_due == 0 : status = 'paid'
   - Si balance_due > 0 ET total_paid > 0 : status = 'partially_paid'
   - Si balance_due > 0 ET total_paid == 0 : status = 'sent'
   - Si due_date < today ET balance_due > 0 : status = 'overdue'
```

---

## 5. Gestion des Paiements

### 5.1 Payment Schema

```
payments {
  id: UUID
  invoice_id: UUID (FK)
  
  payment_method: ENUM ['stripe', 'cash', 'check', 'etransfer', 'bank_transfer', 'manual', 'comped']
  
  amount: DECIMAL(12,2)
  currency: VARCHAR(3) DEFAULT 'USD'
  
  -- Stripe specifics
  stripe_payment_intent_id: VARCHAR(255) (unique per Stripe charge)
  stripe_charge_id: VARCHAR(255)
  
  -- Other payment references
  check_number: VARCHAR(50)
  bank_transfer_ref: VARCHAR(255)
  etransfer_ref: VARCHAR(255)
  
  status: ENUM ['pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded']
  
  created_by_user_id: UUID (qui a enregistré le paiement)
  
  notes: TEXT
  
  created_at: TIMESTAMP
  processed_at: TIMESTAMP
  refunded_at: TIMESTAMP
  
  updated_at: TIMESTAMP
}
```

### 5.2 Payment Methods Supported

```
1. STRIPE (Online)
   - Payer clique lien de paiement
   - Stripe charge carte
   - Webhook confirms payment
   - Payment record créé automatiquement
   - Refund via Stripe API

2. CASH
   - Secretary enregistre paiement manuel
   - Payer remet cash au show office
   - Payment record créé manuellement
   - No refund possible (sauf if Secretary marque)

3. CHECK
   - Secretary enregistre paiement
   - Chèque reçu par mail ou à l'office
   - Check number enregistré
   - Refund via nouveau chèque (manual process)

4. E-TRANSFER
   - Secretary enregistre paiement
   - Payer envoie e-transfer à email organization
   - Ref/memo enregistré
   - Refund via return e-transfer

5. BANK TRANSFER
   - Secretary enregistre paiement
   - Transfer reference enregistré
   - Refund via return bank transfer

6. COMPED (Free)
   - Secretary marque comme comped
   - Amount = 0 ou invoice.total_amount
   - Status = 'completed'
   - No refund

7. MANUAL (for auditing payments received offline)
   - Generic "manual payment" entrée
   - Secretary peut enregistrer sans méthode spécifique
   - Notes obligatoires
```

### 5.3 Partial Payments

```
Scenario : Invoice $1000, payer pays $600 now, $400 later

Timeline :
  1. Invoice created, status = 'draft'
     total_amount: $1000
     total_paid: $0
     balance_due: $1000

  2. Invoice sent, status = 'sent'

  3. Stripe payment $600 received
     Payment record created:
     {
       invoice_id: x
       payment_method: 'stripe'
       amount: $600
       status: 'completed'
     }

  4. Invoice updated:
     total_paid: $600
     balance_due: $400
     status: 'partially_paid'
     
     Email to payer: "We received $600. Balance due: $400"

  5. Secretary enregistre cheque de $400
     Payment record created:
     {
       invoice_id: x
       payment_method: 'check'
       amount: $400
       check_number: '1234'
       status: 'completed'
     }

  6. Invoice updated:
     total_paid: $1000
     balance_due: $0
     status: 'paid'
     
     Email to payer: "Your account is now paid in full. Thank you!"
```

---

## 6. Remboursements

### 6.1 Refund Scenarios

```
Scenario A : Stripe refund (full)
  - Invoice: $500, paid via Stripe
  - Owner demande refund après scratch
  - Secretary approuve (eligible_refund = $300)
  - System :
    1. Create refund via Stripe API
    2. Payment record: status = 'refunded'
    3. Create credit memo or adjustment invoice
    4. Email confirmation to payer
    
Scenario B : Partial Stripe + Manual payment, refund one payment
  - Invoice: $1000
    - Stripe payment: $600
    - Check: $400
  - Owner demande refund, eligible = $500
  - System :
    1. Refund Stripe $600 (full stripe payment) via API
    2. Note: Payer over-refunded by $100 (can dispute with Stripe)
    OR
    1. Refund Stripe $500 only
       BUT Stripe API doesn't support partial refund per original payment
       So : Issue credit to account or full refund $600 then re-charge $100
    3. Not ideal - may need manual intervention
    
  Best practice : Keep it simple at MVP
  - Full refund if eligible
  - If multiple payments, refund largest first or ask payer

Scenario C : Manual payment (cash, check, e-transfer) refund
  - Secretary notes : "Cash refund $300 given to customer on [date]"
  - Payment record updated or new record added
  - Manual: account holder reconciles

Scenario D : Comped refund
  - Not applicable (was never paid)
  - Scratch doesn't trigger refund if comped
```

### 6.2 Refund Policies - Examples

```
Policy A: Full Refund Until Cutoff
  {
    policy_type: 'deadline_based'
    cutoff_datetime: '2025-05-15 18:00:00'
    before_cutoff_refund_pct: 100
    after_cutoff_refund_pct: 0
    administrative_fee_pct: 0
  }

  Logic :
    if scratch_date < cutoff_datetime :
      eligible_refund = entry_fee * 100%
    else :
      eligible_refund = $0

Policy B: Sliding Scale
  {
    policy_type: 'deadline_based'
    cutoff_1_datetime: '2025-05-15 18:00:00'  # 5 days before
    cutoff_1_refund_pct: 100
    
    cutoff_2_datetime: '2025-05-16 18:00:00'  # 4 days before
    cutoff_2_refund_pct: 75
    
    cutoff_3_datetime: '2025-05-17 18:00:00'  # 3 days before
    cutoff_3_refund_pct: 50
    
    after_last_cutoff_refund_pct: 0
    administrative_fee_pct: 5
  }

Policy C: Fixed Fee Deduction
  {
    policy_type: 'fixed_fee'
    full_refund_until: '2025-05-15 18:00:00'
    partial_refund_after_fee: $50  # Deduct $50 from refund
  }

MVP: Start with simple "deadline_based" with one cutoff
```

---

## 7. Taxes - MVP Simple Model

### 7.1 Tax Calculation

```
Configuration par Show/Organization :

shows {
  tax_rate: DECIMAL(5,2)  -- ex: 0.08 (8%)
  tax_enabled: BOOLEAN DEFAULT true
  taxable_items: JSONB DEFAULT ['entry', 'stall', 'extra']
  exempt_items: JSONB DEFAULT ['membership', 'fee']
}

Calculation :
  taxable_subtotal = sum(item.total_price 
                         where item.item_type IN taxable_items
                         AND item.item_type NOT IN ['discount', 'tax'])
  
  tax_amount = taxable_subtotal * show.tax_rate
```

### 7.2 Tax Examples

```
Example 1 : Standard taxable items
  Entries: $300 (taxable)
  Stalls: $100 (taxable)
  Membership: $50 (exempt)
  ─────────────────────
  Taxable base: $400
  Tax 8%: $32
  Total: $482

Example 2 : With discount
  Entries: $300
  Discount: -$50
  ─────────────────────
  Taxable base: $300 - $50 = $250
  Tax 8%: $20
  Total: $270

  OR should tax be calculated before discount ?
  Best practice: Tax calculated on pre-discount subtotal
  
  Entries: $300
  Tax 8%: $24
  Discount: -$50 (on subtotal before tax)
  ─────────────────────
  Total: $300 + $24 - $50 = $274

  MVP: Simple - tax on subtotal before discount, then apply discount
```

---

## 8. Invoice Lifecycle

### 8.1 Status Transitions & Rules

```
DRAFT
  ├─→ SENT (Secretary clicks "Send")
  │    Email sent with payment link
  │    
  ├─→ VOID (Cancelled before sending)
  │    Created in error, no refund
  │    Used for adjustments
  
SENT
  ├─→ PAID (Full payment received)
  │    total_paid == total_amount
  │    
  ├─→ PARTIALLY_PAID (Partial payment received)
  │    total_paid > 0 AND total_paid < total_amount
  │    Can transition to PAID later
  │    
  ├─→ OVERDUE (Past due_date, unpaid)
  │    Automatic status if date passed and balance > 0
  │    Reminder emails can be sent
  │    
  ├─→ VOID (Cancelled after sending)
  │    Invoice cancelled, may generate credit memo
  │    Refunds all payments back to payer

PARTIALLY_PAID
  ├─→ PAID (Final payment received)
  
  ├─→ OVERDUE (Past due date, still balance)
  
  ├─→ VOID (Invoice cancelled)

OVERDUE
  ├─→ PAID (Payment received)
  
  ├─→ VOID (Written off)

PAID
  ├─→ VOID (Reversal needed, e.g. disputed)
      Refund all payments back to payer
```

### 8.2 Invoice Events & Notifications

```
Invoice Created
  → Email sent to payer (optional, manual trigger)

Invoice Sent
  → Email to payer with payment link
  → Email to Secretary confirming sent
  → Payment reminder can be scheduled

Payment Received (any method)
  → Email to payer : confirmation of payment received
  → Email to Secretary : payment recorded
  → If balance still due : reminder of remaining balance

Invoice Fully Paid
  → Email to payer : Invoice paid in full, thank you
  → Email to Secretary : Invoice closed

Invoice Overdue
  → Email to payer : Reminder of past due balance
  → Email to Secretary : Flag in dashboard
  → Manual collection action (follow-up calls, etc)

Invoice Voided
  → Email to payer if applicable
  → Email to Secretary : Invoice cancelled, refund initiated
```

---

## 9. Financial Reports & Exports (MVP)

### 9.1 Secretary Dashboard

```
Show Dashboard displays :

- Total invoices issued : $50,000
- Total paid : $45,000 (90%)
- Outstanding : $5,000
- Partially paid invoices : 5
- Overdue invoices : 2

By Payment Method :
  - Stripe : $30,000
  - Cash : $8,000
  - Check : $5,000
  - E-transfer : $2,000

By Status :
  - Draft : 3
  - Sent : 10
  - Partially Paid : 5
  - Paid : 50
  - Overdue : 2
```

### 9.2 Exports (MVP Basic)

```
Secretary can export :

1. Invoice List (CSV)
   - Invoice #, Date, Payer, Total, Paid, Balance, Status

2. Payments Report (CSV)
   - Payment ID, Invoice #, Date, Method, Amount, Status

3. Entries Report (CSV)
   - Entry #, Horse, Class, Division, Owner, Agent, Payer, Fee, Status

4. Stalls Report (CSV)
   - Booking #, Horse, Stall Type, Dates, Payer, Price, Status

Futur :
  - PDF Reports
  - QuickBooks export format
  - Xero integration
  - Accounting reconciliation
```

---

## 10. Edge Cases & Business Rules

### 10.1 Multiple Shows, Same Payer

```
Payer a entries dans 2 shows :
- Show A : 2 entries = $300
- Show B : 3 entries = $450

Result : 2 invoices (one per show)
  Invoice A-001 : $300
  Invoice B-001 : $450

NOT grouped into single invoice (keep it simple at MVP)
```

### 10.2 Agent Pays, Owner Gets Receipts

```
Entry créée :
  created_by: Agent
  owner_contact_id: Owner A
  payer_contact_id: Agent
  rider_contact_id: Owner A

Invoice :
  payer_contact_id: Agent
  Email to Agent with payment link

Receipt :
  Email sent to both Agent AND Owner A (confirmation of entry)
  Owner can see entry in their dashboard (if logged in)
```

### 10.3 Multiple Entries, One Invoice

```
Owner creates 3 entries on same day for same show :
  Entry 1 : Reining
  Entry 2 : Barrels
  Entry 3 : Poles

Result : ONE invoice with 3 line items (same payer, same show)
  Line 1: Reining $150
  Line 2: Barrels $150
  Line 3: Poles $150
  Tax: $36
  Total: $486

Later, Owner adds stalls :
  Line 4: Stall $250
  Line 5: Shavings $20
  
Invoice updated : Total now $756

Exisiting invoice : status is DRAFT or SENT (unpaid)
  → Update existing invoice (add items)
  
Existing invoice : status is PAID
  → Create NEW invoice for stalls/new items
```

### 10.4 Scratch Refund Partial

```
Invoice $1000 with multiple items :
  Entry A: $150
  Entry B: $150
  Stalls: $500
  Extra: $200
  Total: $1000

Owner scratches Entry A, eligible refund = $150 - admin_fee
Owner scratches Entry B, eligible refund = $150 - admin_fee

Secretary approves both scratches separately :
  - Refund 1 : -$140 (with $10 admin fee)
  - Refund 2 : -$140 (with $10 admin fee)

Invoice updated :
  Add credit line items (negative amounts)
  Balance due recalculated
  
Result : Invoice adjusted, not voided
```

---

## 11. Next Steps

- ✅ Business workflows defined
- ✅ Financial concepts MVP defined
- ⏳ **RLS Policies for Supabase** (who can see/modify what)
- ⏳ **API Endpoints** (React frontend to Supabase)
- ⏳ **Stripe Integration** (webhooks, payment flow)
- ⏳ **Email Templates** (Resend integration)
- ⏳ **UI/UX Specifications**

