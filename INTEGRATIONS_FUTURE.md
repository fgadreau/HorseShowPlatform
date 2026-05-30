# Horse Show Platform - Intégrations Futures

## Vue d'ensemble

Ce document liste les intégrations planifiées pour après le MVP. Elles ne feront PAS partie du MVP, mais la structure doit les permettre.

---

## 1. QuickBooks Online Integration (V2)

### Objectif
Synchroniser automatiquement les invoices et payments de Horse Show Platform vers QuickBooks pour comptabilité/accounting.

### Fonctionnalités
```
- Sync invoices → QBO (créer factures)
- Sync payments → QBO (créer paiements)
- Sync refunds → QBO (créer mémos de crédit/ajustements)
- Sync chart of accounts
- Multi-company support (par organization)
- Real-time sync ou batch nightly
```

### Architecture MVP
```
table: qbo_connections {
  id: UUID
  organization_id: UUID (FK)
  qbo_realm_id: VARCHAR (QBO identifier)
  qbo_access_token: encrypted TEXT
  qbo_refresh_token: encrypted TEXT
  sync_enabled: BOOLEAN
  sync_frequency: ENUM ['real-time', 'daily', 'weekly']
  last_sync_at: TIMESTAMP
  created_at: TIMESTAMP
}

table: qbo_sync_logs {
  id: UUID
  qbo_connection_id: UUID (FK)
  sync_type: ENUM ['invoice', 'payment', 'refund', 'chart_of_accounts']
  record_id: UUID (invoice_id, payment_id, etc.)
  qbo_doc_id: VARCHAR
  status: ENUM ['pending', 'synced', 'failed']
  error_message: TEXT
  synced_at: TIMESTAMP
}
```

### Implementation Steps (V2)
1. Setup QBO OAuth flow
2. Create API adapter for QBO
3. Build mapping : Invoice → Invoice in QBO
4. Build mapping : Payment → Deposit/Payment in QBO
5. Create sync worker (scheduled job)
6. Add UI for QBO connection in settings
7. Add manual sync trigger button
8. Add sync logs viewer

### Challenges
- QBO API rate limits
- Multi-currency support
- Tax categories mapping
- Refund handling complexity

---

## 2. Xero Integration (V2)

### Objectif
Alternative à QuickBooks pour organizations utilisant Xero pour accounting.

### Similar à QBO
```
- Sync invoices → Xero
- Sync payments → Xero
- Multi-org support
- Real-time ou batch sync
```

### Architecture MVP
```
table: xero_connections {
  id: UUID
  organization_id: UUID (FK)
  xero_tenant_id: VARCHAR
  xero_access_token: encrypted TEXT
  xero_refresh_token: encrypted TEXT
  sync_enabled: BOOLEAN
  created_at: TIMESTAMP
}
```

### Implementation Steps
Similar à QBO but with Xero API

---

## 3. GVL Coggins Validation (V2)

### Objectif
Validate automatically that horses have valid Coggins test via GVL (Global Veterinary Link).

### Fonctionnalités
```
- Look up horse registration + coggins status from GVL database
- Auto-validate coggins on entry creation
- Recurring validation (check expiry dates)
- Mark entry as "coggins_verified = true" automatically
- Email reminders for expiring coggins

Structure :
- GVL API call for each horse
- Cache results (coggins valid for 1 year, check weekly)
- Admin dashboard showing validation status
```

### Architecture MVP
```
table: gvl_verifications {
  id: UUID
  horse_id: UUID (FK)
  gvl_registration_number: VARCHAR
  coggins_status: VARCHAR  -- 'valid', 'expired', 'not_found'
  coggins_expiry_date: DATE
  verified_at: TIMESTAMP
  next_check_at: TIMESTAMP
}
```

### Implementation Steps (V2)
1. Research GVL API
2. Create GVL adapter
3. Add manual "Verify coggins" button
4. Add scheduled task for recurring checks
5. Add dashboard alerts for expiring coggins

---

## 4. NRHA/AQHA Membership Validation (V2)

### Objectif
Validate memberships automatically for associations requiring NRHA/AQHA membership.

### Fonctionnalités
```
- Look up rider/owner membership status
- Auto-validate on entry creation (if class requires it)
- Recurring validation
- Mark entry as "membership_verified = true"
- Email reminders for expiring memberships
```

### Architecture MVP
```
table: membership_validations {
  id: UUID
  contact_id: UUID (FK)
  organization: VARCHAR  -- 'NRHA', 'AQHA', etc.
  membership_number: VARCHAR
  status: VARCHAR  -- 'valid', 'expired', 'not_found'
  expiry_date: DATE
  verified_at: TIMESTAMP
  next_check_at: TIMESTAMP
}
```

### Implementation Steps (V2)
1. Research NRHA/AQHA APIs
2. Create adapters for each
3. Add lookup UI
4. Add auto-validation on entry creation
5. Add dashboard

---

## 5. Document Upload & Validation (V2)

### Objectif
Allow uploading health certificates, coggins PDFs, etc., with optional OCR/AI validation.

### Fonctionnalités
```
- Upload health cert, coggins, registration doc
- Auto-detect expiry dates (OCR future)
- Store in Supabase Storage
- Mark horse as "health_cert_verified = true"
- Integration with health cert databases (if available)
- Recurring expiry reminders
```

### Architecture MVP
```
table: horse_documents {
  id: UUID
  horse_id: UUID (FK)
  document_type: ENUM ['coggins', 'health_cert', 'registration', 'other']
  file_url: TEXT  (Supabase Storage URL)
  expiry_date: DATE (extracted or manually entered)
  verified: BOOLEAN
  verified_at: TIMESTAMP
  uploaded_by_user_id: UUID
  uploaded_at: TIMESTAMP
}
```

### Implementation Steps (V2)
1. Setup Supabase Storage buckets
2. Create upload UI (drag-drop)
3. Add expiry date tracking
4. Add alert for expiring docs
5. Future: OCR via third-party service

---

## 6. Split Billing (V2)

### Objectif
Allow multiple payers on single invoice (e.g., Owner pays 60%, Agent/Sponsor pays 40%).

### Fonctionnalités
```
- Multiple line items per payer
- Separate invoices per payer OR split invoice
- Partial payments from different sources
- Reconciliation dashboard
```

### Architecture MVP
```
table: invoice_payers {
  id: UUID
  invoice_id: UUID (FK)
  payer_contact_id: UUID (FK)
  amount_owed: DECIMAL(12,2)
  amount_paid: DECIMAL(12,2) DEFAULT 0
  
  OR simpler : modify invoice_line_items to have payer_contact_id per line
  
  invoice_line_items {
    ...existing...
    payer_contact_id: UUID (FK)  -- can differ per item
  }
```

### Implementation Steps (V2)
1. Modify invoice/line item structure
2. Create split billing invoice UI
3. Send separate invoices per payer
4. Track payments per payer
5. Reconciliation dashboard

---

## 7. Promotional Codes & Auto-Discounts (V2)

### Objectif
Support coupon codes and automatic discounts (early bird, group discounts, etc.)

### Fonctionnalités
```
- Create promo codes (e.g., "EARLY2025", "FRIEND10")
- Define discount : fixed $ OR percentage
- Limit usage : max uses, max per customer, date range
- Auto-apply : based on # of entries, dates, etc.
- Loyalty discounts : repeat exhibitors

Structure :
- Promo codes per organization or show
- Track usage
- A/B test pricing
```

### Architecture MVP
```
table: promo_codes {
  id: UUID
  organization_id: UUID (FK)
  show_id: UUID (FK, nullable - NULL = org-wide)
  code: VARCHAR(50) UNIQUE
  discount_type: ENUM ['fixed', 'percentage']
  discount_value: DECIMAL(10,2)
  max_uses: SMALLINT (NULL = unlimited)
  max_uses_per_customer: SMALLINT (NULL = unlimited)
  valid_from: DATE
  valid_until: DATE
  created_by_user_id: UUID
  created_at: TIMESTAMP
}

table: promo_code_usage {
  id: UUID
  promo_code_id: UUID (FK)
  contact_id: UUID (FK)
  invoice_id: UUID (FK)
  used_at: TIMESTAMP
}
```

### Implementation Steps (V2)
1. Create promo code CRUD in admin
2. Add promo code input to checkout
3. Validate and apply discount
4. Track usage
5. Report on effectiveness

---

## 8. Email Capture & Marketing (V2)

### Objectif
Build email list of exhibitors for future marketing/announcements.

### Fonctionnalités
```
- Capture emails from invoices, signups
- Opt-in for newsletter/communications
- Segmentation (by organization, show, class, etc.)
- Email campaigns via Resend or Mailchimp
- Analytics (open rates, click rates)
```

### Architecture MVP
```
table: email_subscribers {
  id: UUID
  organization_id: UUID (FK)
  email: VARCHAR(255)
  contact_id: UUID (FK, nullable - may not have profile)
  opted_in: BOOLEAN
  opted_in_at: TIMESTAMP
  opted_out_at: TIMESTAMP
  tags: JSONB  -- ['exhibitor', 'sponsor', 'barn_manager']
  created_at: TIMESTAMP
}
```

### Implementation Steps (V2)
1. Add opt-in checkbox to invoice email
2. Create email list management UI
3. Build email campaign builder
4. Integration with Resend or Mailchimp
5. Analytics dashboard

---

## 9. Mobile App (V2+)

### Objectif
Native mobile app (iOS/Android) for exhibitors to track entries, check results, pay invoices on-the-go.

### Functionalities
```
- Entry tracking dashboard
- Invoice payment
- Schedule/results viewing
- Notifications
- QR code entry scoring (future ShowScore integration)
```

### Architecture
```
- React Native or Flutter
- Same Supabase backend
- Push notifications via Firebase
```

---

## 10. Video Stream & Scoring Integration (V2+)

### Objective
Live video stream of classes + live scoring.

### Features
```
- Live stream per ring/class
- Live scoring updates
- Announcer view
- Public spectator view
- Archive recordings
```

### Architecture
```
- Video hosting : Mux, Wistia, or YouTube Live
- Scoring sync via ShowScore API (when available)
- Real-time updates via Supabase Real-time
```

---

## 11. Year End Awards & Standings (V2+)

### Objective
Calculate cumulative standings and awards across multiple shows in a season.

### Features
```
- Track points/wins across shows
- Calculate standings by division/class
- Generate awards certificates
- Payout sheets
- Year-end banquet management
```

### Architecture
```
table: year_end_standings {
  id: UUID
  organization_id: UUID (FK)
  year: SMALLINT
  contact_id: UUID (FK)  -- horse owner
  horse_id: UUID (FK)
  division_id: UUID (FK)
  points: DECIMAL(10,2)
  earnings: DECIMAL(12,2)
  calculated_at: TIMESTAMP
}

table: awards {
  id: UUID
  organization_id: UUID (FK)
  year: SMALLINT
  contact_id: UUID (FK)
  horse_id: UUID (FK)
  award_name: VARCHAR
  position: SMALLINT  -- 1st, 2nd, etc.
  created_at: TIMESTAMP
}
```

---

## Integration Priority Matrix

```
HIGH PRIORITY (V2 early)
  - Promo codes / Auto-discounts
  - Document upload
  - Split billing
  - GVL coggins validation

MEDIUM PRIORITY (V2 mid)
  - NRHA/AQHA membership validation
  - QuickBooks integration
  - Xero integration
  - Email marketing

LOWER PRIORITY (V2+)
  - Mobile app
  - Video streaming
  - Year end awards
  - Judge/Scribe advanced features
```

---

## Architecture Decisions for Extensibility

### API Design
- Build APIs as if external services will consume them
- Version your APIs (v1, v2)
- Use webhooks for event-driven updates

### Database Design
- Foreign keys allow future related data
- Audit table for all changes
- Status/state management for future workflows

### Authentication
- Use Supabase JWT for extensibility
- Store integration credentials encrypted
- Allow OAuth connections

### Message Queues
- Consider Bull/RabbitMQ for async tasks
- Webhook retries, email sending, sync jobs
- Not MVP, but plan architecture for it

---

## Notes for Implementation

1. **API Rate Limiting**
   - Plan for QBO, Xero, GVL, NRHA rate limits
   - Implement caching and retry logic

2. **Error Handling**
   - Graceful degradation if external service down
   - Manual override options for secretary

3. **Testing**
   - Use sandbox environments (QBO sandbox, Xero sandbox)
   - Mock external services for unit tests

4. **Security**
   - Encrypt API keys in database
   - Use environment variables for secrets
   - Never log sensitive data

5. **Monitoring**
   - Log all integrations sync attempts
   - Alert on failures
   - Dashboard for integration health

---

