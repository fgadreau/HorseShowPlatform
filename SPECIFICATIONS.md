# Horse Show Platform - Spécifications Produit

## Vue d'ensemble
**Nom du projet:** Horse Show Platform
**Objectif:** Plateforme SaaS fournissant plusieurs modules intégrés pour la gestion de compétitions équestres

## Modules
- Entries (Inscriptions)
- Stall Booking (Réservation de boxes)
- ShowScore (Scoring et résultats en direct)
- Year End Awards (Récompenses annuelles)

## Stack Technologique
- Frontend: React
- Backend/DB: Supabase
- Hébergement: Vercel
- Versioning: GitHub
- Email: Resend
- Paiements: Stripe
- Intégrations futures: QuickBooks/Xero

---

## Section 1: Rôles Utilisateurs
✅ **COMPLÉTÉ** - Voir [ROLES_PERMISSIONS_MODEL.md](ROLES_PERMISSIONS_MODEL.md)

**Rôles MVP :**
- Platform Admin (global)
- Organization Admin (par organisation)
- Show Organizer (par show)
- Secretary (par show ou organisation)
- Owner (connecté ou contact non-connecté)
- Agent (gère chevaux/entries pour owners)
- Rider (contact, participe aux épreuves)
- Public (accès aux résultats publics)

## Section 2: Workflows Métier
✅ **COMPLÉTÉ** - Voir [WORKFLOWS_BUSINESS.md](WORKFLOWS_BUSINESS.md)

**5 workflows MVP :**
- Entry Creation (draft → pending_checkout → active)
- Invoicing & Payments (groupé, partial payments)
- Scratches & Refunds (policies configurables)
- Stall Booking (intégré ou séparé)
- Publication & Results (simple MVP)

## Section 3: Modèle de Données
✅ **COMPLÉTÉ** - Voir [SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md)

**Tables principales :**
- users, user_profiles, platform_admins
- organizations, organization_members
- shows, show_roles, show_days
- classes, divisions
- horses, contacts, horse_contacts
- entries, stall_bookings
- invoices, invoice_line_items, payments

## Section 4: Concepts Financiers
✅ **COMPLÉTÉ** - Voir [FINANCIAL_CONCEPTS.md](FINANCIAL_CONCEPTS.md)

**Modèle de facturation MVP :**
- Invoice groupée par payer/show
- Line items : entries, stalls, extras, taxes, discounts
- Partial payments supportées
- Multiples méthodes de paiement (Stripe, cash, check, e-transfer, bank transfer)
- Refund policies configurables
- Simple tax calculation
- Status tracking complet

## Section 5: Permissions
✅ **COMPLÉTÉ** - Voir [ROLES_PERMISSIONS_MODEL.md](ROLES_PERMISSIONS_MODEL.md)

**Matrice des permissions par rôle :** Voir section 2 du document des rôles

## Section 6: Intégrations Futures
✅ **DOCUMENTÉ** - Voir [INTEGRATIONS_FUTURE.md](INTEGRATIONS_FUTURE.md)

**Intégrations planifiées (V2+) :**
- QuickBooks Online (sync invoices/payments)
- Xero (sync invoices/payments)
- GVL (validation coggins automatique)
- NRHA/AQHA (validation membership)
- Document upload & validation
- Split billing
- Promo codes & auto-discounts
- Email marketing
- Mobile app
- Video streaming
- Year end awards

**MVP Focus :** Fondations seulement, pas d'implémentation

Intégrations planifiées :
- QuickBooks Online
- Xero
- GVL (validation coggins automatique)
