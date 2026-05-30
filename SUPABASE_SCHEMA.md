# Horse Show Platform - Architecture Supabase (MVP)

## Vue d'ensemble

Structure relationnelle Supabase pour supporter :
- Multi-organization
- Multi-show par organization
- Rôles et permissions granulaires
- Contacts non-connectés
- Chevaux et entries
- Facturation flexible
- Stalls et réservations

---

## 1. Core Authentication & Users

### Table: `users` (Supabase Auth - auto-generated)
```sql
-- Supabase crée cette table automatiquement via Auth
-- Champs importants pour nous :
id: UUID (PK)
email: string
created_at: timestamp
updated_at: timestamp
```

### Table: `user_profiles`
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Infos de base
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  
  -- Type d'utilisateur (pour UI/logique)
  type_user VARCHAR(50) CHECK (type_user IN ('owner', 'agent', 'secretary', 'admin')),
  
  -- Localisation
  address VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(2),
  
  -- Photos / Médias
  avatar_url TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
```

---

## 2. Organization & Membership

### Table: `organizations`
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Infos de base
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,  -- pour URL : platform.com/org/slug
  description TEXT,
  
  -- Contact principal
  primary_contact_name VARCHAR(255),
  primary_contact_email VARCHAR(255),
  primary_contact_phone VARCHAR(20),
  
  -- Addresse
  address VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(2),
  
  -- Média
  logo_url TEXT,
  website_url TEXT,
  
  -- Subscription / Plan
  subscription_plan VARCHAR(50) DEFAULT 'free',  -- free, pro, enterprise
  subscription_status VARCHAR(50) DEFAULT 'active',  -- active, trialing, cancelled
  stripe_customer_id VARCHAR(255),
  
  -- Configuration globale
  timezone VARCHAR(50) DEFAULT 'UTC',
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Modules activés (JSON pour flexibilité)
  modules_enabled JSONB DEFAULT '{"entries": true, "stall_booking": true, "show_score": false, "year_end_awards": false}',
  
  -- Taxes et configurations financières
  tax_rate DECIMAL(5, 2) DEFAULT 0.00,
  default_refund_policy VARCHAR(50) DEFAULT 'full_refund',  -- full_refund, percentage, none
  
  created_by_user_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
```

### Table: `organization_members`
```sql
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Rôle au niveau organization
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'secretary', 'user')),
  -- admin: Organization Admin (accès tous les shows)
  -- secretary: Secretary (peut être limité à shows spécifiques via show_roles)
  -- user: Membre sans rôle spécial
  
  -- Permissions supplémentaires (pour granularité future)
  permissions JSONB DEFAULT '[]',
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_role ON organization_members(role);
```

---

## 3. Shows & Show Configuration

### Table: `shows`
```sql
CREATE TABLE shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Infos de base
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Localisation
  location VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(2),
  coordinates POINT,  -- GPS pour maps future
  
  -- Configuration
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  timezone VARCHAR(50),
  
  -- Modules activés pour ce show (override organization setting)
  modules_enabled JSONB,
  
  -- Finances show-specific
  default_currency VARCHAR(3),
  tax_rate DECIMAL(5, 2),
  
  -- Publication / Visibilité
  is_public BOOLEAN DEFAULT false,
  show_schedule_public BOOLEAN DEFAULT false,
  show_draw_public BOOLEAN DEFAULT false,
  show_results_public BOOLEAN DEFAULT false,
  show_standings_public BOOLEAN DEFAULT false,
  
  -- Logo/Image
  image_url TEXT,
  
  created_by_user_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_shows_org_id ON shows(organization_id);
CREATE INDEX idx_shows_status ON shows(status);
CREATE INDEX idx_shows_dates ON shows(start_date, end_date);
```

### Table: `show_roles`
```sql
CREATE TABLE show_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Rôle pour ce show spécifique
  role VARCHAR(50) NOT NULL CHECK (role IN ('organizer', 'secretary', 'judge', 'scribe', 'announcer')),
  
  -- Scope (pour future : ring-specific, class-specific)
  scope VARCHAR(50) DEFAULT 'show' CHECK (scope IN ('show', 'ring', 'class')),
  scope_id UUID,  -- ring_id ou class_id si applicable
  
  -- Permissions spécifiques
  permissions JSONB DEFAULT '[]',
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(show_id, user_id, role)
);

CREATE INDEX idx_show_roles_show_id ON show_roles(show_id);
CREATE INDEX idx_show_roles_user_id ON show_roles(user_id);
```

### Table: `show_days`
```sql
CREATE TABLE show_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  
  day_date DATE NOT NULL,
  day_name VARCHAR(50),  -- "Friday", "Saturday", etc.
  day_number SMALLINT,  -- 1, 2, 3...
  
  -- Horaires
  start_time TIME,
  end_time TIME,
  gate_open_time TIME,
  
  -- Configuration
  max_entries_per_class SMALLINT,
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(show_id, day_date)
);

CREATE INDEX idx_show_days_show_id ON show_days(show_id);
```

---

## 4. Classes & Divisions

### Table: `classes`
```sql
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  
  -- Infos de base
  name VARCHAR(255) NOT NULL,  -- "Barrels", "Poles", "Reining", etc.
  code VARCHAR(50),  -- pour codes spécifiques (ex: NRHA codes)
  description TEXT,
  
  -- Configurations
  min_entries SMALLINT DEFAULT 2,
  entry_fee DECIMAL(10, 2),
  payment_method VARCHAR(50) DEFAULT 'any',  -- pour future
  
  -- Classes "block" - plusieurs classes groupées
  class_block_id UUID,  -- si cette class fait partie d'un bloc
  
  -- Scheduling
  show_day_id UUID REFERENCES show_days(id),
  scheduled_time TIME,
  estimated_duration INTERVAL,
  ring_number SMALLINT DEFAULT 1,
  
  -- État
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'running', 'finished')),
  
  -- Publication
  is_public BOOLEAN DEFAULT true,
  
  -- Validation externe
  requires_membership VARCHAR(255),  -- NRHA, AQHA, etc.
  requires_coggins BOOLEAN DEFAULT false,
  requires_health_cert BOOLEAN DEFAULT false,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_classes_show_id ON classes(show_id);
CREATE INDEX idx_classes_day_id ON classes(show_day_id);
CREATE INDEX idx_classes_status ON classes(status);
```

### Table: `divisions`
```sql
CREATE TABLE divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  
  -- Infos de base
  name VARCHAR(255) NOT NULL,  -- "Youth", "Amateur", "Senior", "Non-Pro", etc.
  level SMALLINT,  -- 1, 2, 3, 4 (pour ordering)
  code VARCHAR(50),
  
  -- Indépendance des divisions
  -- Si split=true, les résultats et bourses sont séparés
  is_split_results BOOLEAN DEFAULT true,
  is_split_classes BOOLEAN DEFAULT false,
  
  -- Pricing override
  entry_fee DECIMAL(10, 2),  -- si différent de la class
  
  -- Age/Eligibility
  min_age SMALLINT,
  max_age SMALLINT,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(class_id, name)
);

CREATE INDEX idx_divisions_class_id ON divisions(class_id);
```

---

## 5. Chevaux & Propriétaires

### Table: `horses`
```sql
CREATE TABLE horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Infos de base
  name VARCHAR(255) NOT NULL,
  breed VARCHAR(100),
  color VARCHAR(100),
  gender VARCHAR(10) CHECK (gender IN ('M', 'F', 'G')),  -- Mare, Filly, Gelding
  birth_year SMALLINT,
  registration_number VARCHAR(100),  -- NRHA, AQHA, etc.
  registration_organization VARCHAR(100),
  
  -- Propriétaires/Gérants
  primary_owner_contact_id UUID NOT NULL REFERENCES contacts(id),
  
  -- Documents
  coggins_expiry DATE,
  health_cert_expiry DATE,
  registration_doc_url TEXT,
  
  notes TEXT,
  
  created_by_user_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_horses_org_id ON horses(organization_id);
CREATE INDEX idx_horses_owner_contact_id ON horses(primary_owner_contact_id);
```

### Table: `contacts`
```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Type de contact
  type VARCHAR(50) NOT NULL CHECK (type IN ('owner', 'agent', 'rider', 'payer', 'other')),
  
  -- Infos personnelles
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  
  -- Adresse
  address VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(2),
  
  -- Lien à un utilisateur (si compte créé)
  linked_user_id UUID UNIQUE REFERENCES user_profiles(id) ON DELETE SET NULL,
  
  -- Info business
  barn_name VARCHAR(255),  -- pour agents/écuries
  notes TEXT,
  
  created_by_user_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(organization_id, email)
);

CREATE INDEX idx_contacts_org_id ON contacts(organization_id);
CREATE INDEX idx_contacts_type ON contacts(type);
CREATE INDEX idx_contacts_linked_user_id ON contacts(linked_user_id);
```

### Table: `horse_contacts` (Relation many-to-many)
```sql
CREATE TABLE horse_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Rôle de ce contact pour ce cheval
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'co-owner', 'agent', 'rider', 'manager')),
  
  -- Permissions pour ce contact/cheval
  can_create_entries BOOLEAN DEFAULT false,
  can_modify_entries BOOLEAN DEFAULT false,
  can_book_stalls BOOLEAN DEFAULT false,
  can_pay_invoices BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(horse_id, contact_id, role)
);

CREATE INDEX idx_horse_contacts_horse_id ON horse_contacts(horse_id);
CREATE INDEX idx_horse_contacts_contact_id ON horse_contacts(contact_id);
```

---

## 6. Entries (Inscriptions)

### Table: `entries`
```sql
CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  horse_id UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  
  -- Qui a créé cette entry ?
  created_by_user_id UUID NOT NULL REFERENCES user_profiles(id),
  
  -- Participants & Payeurs
  owner_contact_id UUID NOT NULL REFERENCES contacts(id),
  agent_user_id UUID REFERENCES user_profiles(id),  -- optional agent
  rider_contact_id UUID REFERENCES contacts(id),  -- qui monte
  payer_contact_id UUID NOT NULL REFERENCES contacts(id),  -- qui paie la facture
  
  -- Status
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'scratched', 'completed', 'cancelled')),
  
  -- Validation externe
  membership_verified BOOLEAN DEFAULT false,
  membership_verified_at TIMESTAMP,
  coggins_verified BOOLEAN DEFAULT false,
  coggins_verified_at TIMESTAMP,
  health_cert_verified BOOLEAN DEFAULT false,
  health_cert_verified_at TIMESTAMP,
  
  -- Timing
  entry_number SMALLINT,  -- numero dans la division
  
  -- Frais additionnels
  base_fee DECIMAL(10, 2),
  total_fees DECIMAL(10, 2),
  
  -- Notes
  notes TEXT,
  special_requests TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  scratched_at TIMESTAMP,
  scratched_by_user_id UUID REFERENCES user_profiles(id)
);

CREATE INDEX idx_entries_show_id ON entries(show_id);
CREATE INDEX idx_entries_horse_id ON entries(horse_id);
CREATE INDEX idx_entries_division_id ON entries(division_id);
CREATE INDEX idx_entries_status ON entries(status);
CREATE INDEX idx_entries_payer_contact_id ON entries(payer_contact_id);
```

---

## 7. Stalls & Camping

### Table: `stall_options`
```sql
CREATE TABLE stall_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  
  -- Infos de base
  name VARCHAR(255) NOT NULL,  -- "12x12 Stall", "Camping Spot", "Hay Included", etc.
  description TEXT,
  
  -- Pricing
  price DECIMAL(10, 2) NOT NULL,
  
  -- Disponibilité
  total_quantity SMALLINT NOT NULL,
  available_quantity SMALLINT NOT NULL,
  
  -- Durée
  duration_days SMALLINT,  -- NULL = flexible, sinon nombre de jours
  show_day_start_id UUID REFERENCES show_days(id),
  show_day_end_id UUID REFERENCES show_days(id),
  
  -- Catégorie
  category VARCHAR(50) CHECK (category IN ('stall', 'camping', 'parking', 'extra')),
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_stall_options_show_id ON stall_options(show_id);
```

### Table: `stall_bookings`
```sql
CREATE TABLE stall_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  stall_option_id UUID NOT NULL REFERENCES stall_options(id),
  horse_id UUID REFERENCES horses(id),  -- peut être NULL pour camping/parking
  
  -- Qui a créé ?
  created_by_user_id UUID NOT NULL REFERENCES user_profiles(id),
  
  -- Participants
  booker_contact_id UUID NOT NULL REFERENCES contacts(id),  -- qui réserve
  payer_contact_id UUID NOT NULL REFERENCES contacts(id),  -- qui paie
  
  -- Réservation
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('reserved', 'active', 'cancelled', 'completed')),
  
  -- Dates
  show_day_start_id UUID NOT NULL REFERENCES show_days(id),
  show_day_end_id UUID NOT NULL REFERENCES show_days(id),
  
  -- Pricing
  unit_price DECIMAL(10, 2),
  total_price DECIMAL(10, 2),
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  cancelled_at TIMESTAMP,
  cancelled_by_user_id UUID REFERENCES user_profiles(id)
);

CREATE INDEX idx_stall_bookings_show_id ON stall_bookings(show_id);
CREATE INDEX idx_stall_bookings_horse_id ON stall_bookings(horse_id);
CREATE INDEX idx_stall_bookings_status ON stall_bookings(status);
```

---

## 8. Billing & Invoicing

### Table: `invoices`
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Invoice tracking
  invoice_number VARCHAR(50) UNIQUE NOT NULL,  -- generated: ORG-SHOW-0001
  
  -- Parties
  payer_contact_id UUID NOT NULL REFERENCES contacts(id),
  created_by_user_id UUID NOT NULL REFERENCES user_profiles(id),
  
  -- Dates
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  
  -- Amounts
  subtotal DECIMAL(12, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  
  -- Payment
  total_paid DECIMAL(12, 2) DEFAULT 0,
  balance_due DECIMAL(12, 2) GENERATED ALWAYS AS (total_amount - total_paid) STORED,
  
  -- Notes
  notes TEXT,
  payment_terms TEXT,
  
  sent_at TIMESTAMP,
  sent_by_user_id UUID REFERENCES user_profiles(id),
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_invoices_show_id ON invoices(show_id);
CREATE INDEX idx_invoices_payer_contact_id ON invoices(payer_contact_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
```

### Table: `invoice_line_items`
```sql
CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Origine de la ligne (entry, stall, ou manual)
  item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('entry', 'stall', 'manual', 'discount', 'fee')),
  item_id UUID,  -- entry_id, stall_booking_id, ou NULL pour manual
  
  -- Description & Pricing
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  
  -- Tax
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
```

### Table: `payments`
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Méthode de paiement
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('stripe', 'cash', 'check', 'etransfer', 'bank_transfer', 'manual', 'comped')),
  
  -- Montants
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Stripe reference (si stripe)
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  
  -- Autres références
  check_number VARCHAR(50),
  bank_transfer_ref VARCHAR(255),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  
  -- Qui a enregistré ?
  created_by_user_id UUID NOT NULL REFERENCES user_profiles(id),
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  processed_at TIMESTAMP,
  refunded_at TIMESTAMP
);

CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);
```

---

## 9. Platform Admin

### Table: `platform_admins`
```sql
CREATE TABLE platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  permissions JSONB DEFAULT '[]',
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_platform_admins_user_id ON platform_admins(user_id);
```

---

## 10. Row-Level Security (RLS) - Concepts

Pour Supabase, activer RLS sur les tables sensibles et créer des policies :

```sql
-- Exemple : Users ne voient que leurs propres données
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON user_profiles
  FOR SELECT
  USING (user_id = auth.uid());

-- Exemple : Organization Members ne voient que les données de leur org
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view organization members of their org"
  ON organization_members
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
```

*Détails complets des policies à venir.*

---

## 11. Vue de Synthèse - Relations

```
users (Supabase Auth)
  ├─ user_profiles (1:1)
  │   ├─ organization_members (1:N → organizations)
  │   ├─ show_roles (1:N → shows)
  │   ├─ contacts (created_by) (1:N)
  │   ├─ horses (created_by) (1:N)
  │   ├─ entries (created_by) (1:N)
  │   ├─ payments (created_by) (1:N)
  │   └─ platform_admins (1:1)
  │
  ├─ organizations (1:N)
  │   ├─ organization_members (1:N)
  │   ├─ shows (1:N)
  │   ├─ contacts (1:N)
  │   ├─ horses (1:N)
  │   └─ invoices (1:N)
  │
  ├─ shows (1:N)
  │   ├─ show_roles (1:N)
  │   ├─ show_days (1:N)
  │   ├─ classes (1:N)
  │   │   └─ divisions (1:N)
  │   │       └─ entries (1:N)
  │   ├─ entries (1:N → horses, payer_contact, owner_contact, rider_contact)
  │   ├─ stall_options (1:N)
  │   │   └─ stall_bookings (1:N)
  │   ├─ invoices (1:N)
  │   └─ payments (1:N → invoices)
  │
  ├─ contacts (1:N)
  │   ├─ horses (owner) (1:N)
  │   ├─ horse_contacts (1:N)
  │   ├─ entries (payer, rider, owner, agent) (1:N)
  │   └─ invoices (payer) (1:N)
  │
  └─ horses (1:N → organization, owner_contact)
      ├─ horse_contacts (1:N → contacts)
      ├─ entries (1:N → divisions)
      └─ stall_bookings (1:N → stall_option)
```

---

## 12. Indices Recommandés

*Déjà inclus dans les définitions de tables ci-dessus.*

Critères de base :
- FKs : index automatique
- Recherches : `status`, `organization_id`, `show_id`, `user_id`
- Filtering/Sorting : `created_at`, `email`, `slug`

---

## 13. Prochaines Étapes

1. ✅ Modèle de rôles/permissions défini
2. ✅ Structure Supabase proposée
3. ⏳ **Détail des Policies RLS Supabase** (qui peut voir/modifier quoi)
4. ⏳ **Workflows métier détaillés** (inscription, facturation, paiement)
5. ⏳ **Modèle de facturation** (MVP simple)
6. ⏳ **API & Webhooks Stripe**
7. ⏳ **Architecture API React/Backend**

