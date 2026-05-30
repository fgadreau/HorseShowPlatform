# Horse Show Platform - Résumé MVP Architecture

## ✅ Phase 1 : Architecture & Design COMPLÉTÉE

### Documents Créés

1. **[ROLES_PERMISSIONS_MODEL.md](ROLES_PERMISSIONS_MODEL.md)**
   - ✅ 8 rôles MVP définis
   - ✅ Matrice de permissions par rôle
   - ✅ Organisation hiérarchique (Platform > Organization > Show)
   - ✅ Support pour rôles multiples par user/show
   - ✅ Contacts non-connectés
   - ✅ Séparation Owner/Agent/Rider/Payer

2. **[SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md)**
   - ✅ 22 tables + relations
   - ✅ Authentification users/profiles
   - ✅ Organizations et multi-tenancy
   - ✅ Shows, classes, divisions
   - ✅ Contacts et horses management
   - ✅ Entries et stall bookings
   - ✅ Invoices, line items, payments
   - ✅ Audit trails

3. **[WORKFLOWS_BUSINESS.md](WORKFLOWS_BUSINESS.md)**
   - ✅ Entry creation workflow (5 étapes)
   - ✅ Invoicing & payments (création, envoi, enregistrement)
   - ✅ Scratches & refunds (policies, approvals)
   - ✅ Stall booking (intégré/séparé)
   - ✅ Publication & results (MVP basic)
   - ✅ MVP priority sequencing

4. **[FINANCIAL_CONCEPTS.md](FINANCIAL_CONCEPTS.md)**
   - ✅ Modèle de facturation groupée
   - ✅ 7 types de line items (entries, stalls, extras, fees, membership, tax, discount)
   - ✅ Partial payments & multiple payers
   - ✅ 7 payment methods (Stripe, cash, check, e-transfer, bank_transfer, manual, comped)
   - ✅ Refund policies & edge cases
   - ✅ Tax calculation simple
   - ✅ Invoice statuses & transitions

---

## 📊 Vue d'ensemble MVP

```
PLATFORM LAYER
  └─→ Organizations (multi-tenant)
       ├─→ Members/Roles
       ├─→ Shows
       │   ├─→ Classes/Divisions
       │   ├─→ Days/Schedule
       │   ├─→ Stall Options
       │   └─→ Show-specific Roles
       │
       ├─→ Contacts (Owner, Agent, Rider)
       ├─→ Horses
       ├─→ Invoices/Payments
       └─→ Entries/Stall Bookings
```

---

## 🎯 Prochaines Étapes pour Implementation

### Phase 2 : Backend & Database (à définir)

**Questions avant de coder :**

1. **Row-Level Security (RLS) Policies**
   - Qui peut voir quoi dans Supabase ?
   - Policies pour organizations (isolation multi-tenant)
   - Policies pour shows (owner vs agent vs secretary)
   - Policies pour invoices/payments (sensible)
   - Public data (schedule, results)

2. **API Architecture**
   - Endpoints React ← API Supabase ?
   - Utiliser Supabase client SDK directement depuis React ?
   - Ou créer API layer (Edge Functions, Node.js) ?
   - Authentication flow (Supabase Auth + JWT)

3. **Stripe Integration**
   - Webhook handling pour payments
   - Refund API
   - Stripe customer sync
   - Payment intent vs Charge

4. **Resend Email Integration**
   - Email templates (invoice, confirmation, payment, etc.)
   - Trigger events (send invoice, payment received, etc.)
   - Unsubscribe/preferences

5. **Architecture Tech Stack**
   - React frontend (Vercel deployment)
   - Supabase backend (PostgreSQL + Auth + Real-time)
   - Edge Functions vs External services ?
   - Database migrations strategy
   - Environment variables/secrets

---

## 🔐 Key MVP Decisions Summary

### Data Model
- ✅ Multi-tenant via organization_id
- ✅ Role-based access via organization_members + show_roles
- ✅ Contacts (user-linked or standalone)
- ✅ Invoice grouped per payer/show
- ✅ Payment methods flexible (Stripe + manual)

### Workflows
- ✅ Entry creation : Draft → Pending Checkout → Active
- ✅ Invoice generation : Automatic or manual
- ✅ Partial payments : Fully supported
- ✅ Refunds : Policy-driven, manual approval
- ✅ Stall booking : Integrated or separate

### Permissions
- ✅ 8 core roles (Platform Admin, Org Admin, Show Organizer, Secretary, Owner, Agent, Rider, Public)
- ✅ Granular by organization or show
- ✅ Future: Judge, Scribe, Announcer, Accountant

### Financial Model
- ✅ Simple invoice with multiple line items
- ✅ Support 7 payment methods
- ✅ Partial payments
- ✅ Configurable refund policies
- ✅ Simple tax calculation (% of subtotal)
- ✅ Manual discounts

---

## 📋 Checklist MVP Readiness

Before starting to code, ensure :

- [ ] All 4 documents reviewed and approved
- [ ] Questions about Phase 2 answered
- [ ] RLS policies approach decided
- [ ] API architecture chosen (SDK vs Layer)
- [ ] Stripe integration plan understood
- [ ] Resend email setup planned
- [ ] Deployment strategy (Vercel + Supabase) confirmed
- [ ] Team alignment on technical decisions
- [ ] Database backup & migration strategy
- [ ] Security review (auth, RLS, API security)

---

## 🚀 Estimated Timeline

If Phase 2 decisions finalized today :

- **Week 1-2 : Database & Auth**
  - Create Supabase project
  - Run SQL migrations
  - Setup Supabase Auth
  - Create RLS policies
  - Test multi-tenant isolation

- **Week 2-3 : Core Features Setup**
  - Organizations CRUD
  - Shows CRUD
  - Classes/divisions
  - Contacts/horses

- **Week 3-4 : Entry & Invoice**
  - Entry creation form
  - Invoice generation
  - Invoice PDF
  - Invoice email sending

- **Week 4-5 : Payments**
  - Stripe integration
  - Webhook handling
  - Manual payment entry
  - Payment status updates

- **Week 5-6 : Secretary Tools**
  - Scratch/refund UI
  - Stall booking management
  - Dashboard/reports

- **Week 6-7 : Polish**
  - Public show page
  - Email templates
  - Testing
  - Security audit

---

## ❓ Avant de Continuer...

Je recommande qu'on discute ces points maintenant :

**1. RLS & Multi-tenancy**
- Êtes-vous d'accord pour une approche strict d'isolation par organization_id ?
- Tous les queries doivent filter par org_id de l'utilisateur courant ?

**2. API Architecture**
- Utiliser Supabase client SDK directement depuis React ?
- Ou créer une API layer (Supabase Edge Functions) ?
- Pro/cons de chaque approche ?

**3. Authentication**
- Supabase Auth (simple, built-in) OK ?
- Single-org vs multi-org logins ?
- Social login needed (Google, Apple) au MVP ?

**4. File Storage**
- Photos de chevaux, docs (coggins, health certs) ?
- Supabase Storage OK ou préférez external (S3, Cloudinary) ?

**5. Real-time Features**
- Avez-vous besoin de real-time updates (ex: live scoring pour ShowScore) ?
- Ou async suffisant (polling) au MVP ?

**Répondez à ce qui vous semble important et on peut lancer la Phase 2 ! 🚀**

