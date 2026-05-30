# Horse Show Platform - Modèle de Rôles et Permissions (MVP)

## Architecture Générale

### Principes
- **Scope hiérarchique** : Platform > Organization > Show
- **Permissions flexibles** : une personne peut avoir des rôles différents par show/organization
- **Contacts non-connectés** : possibilité de créer des contacts (Owner/Agent/Rider) sans compte utilisateur
- **Séparation des rôles** : Owner ≠ Agent ≠ Rider ≠ Payer

---

## 1. Rôles Principaux

### 1.1 Platform Level

#### **Platform Admin**
- Scope : global (toute la plateforme)
- Responsabilités :
  - Gérer les organizations
  - Gérer les abonnements et facturation globale
  - Support et intervention sur les issues
  - Configuration globale de la plateforme
- Permissions clés :
  - Créer/modifier/supprimer organizations
  - Accès lecture/écriture à tous les shows
  - Gestion des plans/subscriptions

---

### 1.2 Organization Level

#### **Organization Admin**
- Scope : une organization spécifique
- Responsabilités :
  - Créer/configurer des shows
  - Gérer les utilisateurs de l'organization
  - Configurer règles, prix, bourses, taxes
  - Activer/désactiver modules
  - Configurer politiques de remboursement
- Permissions clés :
  - Accès à tous les shows de l'organization
  - Assigner des rôles (Secretary, Show Organizer)
  - Configurer paramètres organization-wide
  - Gérer les contacts et chevaux de l'organization

---

### 1.3 Show Level

#### **Show Organizer / Coordinator**
- Scope : un show spécifique
- Responsabilités :
  - Créer/configurer journées, classes, divisions
  - Configurer horaires, frais, stalls
  - Créer formulaires d'inscription
  - Configurer pricing et options
  - Publier/masquer schedule, draw, résultats
- Permissions clés :
  - Lecture/écriture sur la configuration du show
  - Gérer les options de stalls
  - Publier les résultats/schedule
  - Lecture sur les entries et paiements (pas modification)

#### **Secretary / Show Office**
- Scope : un ou tous les shows de l'organization
- Responsabilités :
  - Gérer les entries (créer, modifier, valider)
  - Créer/envoyer factures
  - Enregistrer les paiements (toutes méthodes)
  - Gérer scratches et refunds
  - Valider les demandes de remboursement
  - Gérer les draws
  - Support sur place aux exhibitors
- Permissions clés :
  - CRUD sur les entries
  - CRUD sur les invoices
  - Enregistrer les paiements
  - Modifier le statut des entries
  - Gérer les scratches et refunds

---

### 1.4 Exhibitor / Owner & Associated Parties

#### **Owner (Connected)**
- Scope : ses chevaux et ses inscriptions
- Responsabilités :
  - Créer son profil
  - Ajouter ses chevaux
  - Faire ses inscriptions (entries)
  - Réserver stalls/extras
  - Recevoir et payer ses factures
- Permissions clés :
  - Créer/modifier ses chevaux (owner_id = lui-même)
  - Créer/modifier entries pour ses chevaux
  - Voir ses factures
  - Payer via Stripe ou marquer comme payé (si option disponible)

#### **Owner (Non-Connected / Contact)**
- Scope : pas de compte utilisateur
- Responsabilités :
  - Existe comme contact
  - Reçoit factures par email
  - Peut payer par lien sécurisé sans compte
  - Peut créer/claim son compte plus tard
- Permissions clés :
  - Accès en lecture seule via token de paiement
  - Peut créer un compte en se connectant avec email

#### **Agent (Connected)**
- Scope : chevaux/entries qu'il gère, pour les owners assignés
- Responsabilités :
  - Créer/modifier chevaux pour ses owners
  - Faire les entries au nom de l'owner
  - Réserver stalls au nom de l'owner
  - Générer factures et les envoyer
  - Payer les factures
- Permissions clés :
  - Créer/modifier chevaux liés à lui
  - CRUD entries pour chevaux assignés
  - Voir factures pour owners/chevaux assignés
  - Payer factures

#### **Rider / Exhibitor (Contact)**
- Scope : lecture sur les classes et schedule concernant ce cheval/cette entry
- Responsabilités :
  - Informé des classes où il monte
  - Accès au schedule
  - Peut recevoir notifications
- Permissions clés :
  - Voir le schedule des classes
  - Voir le draw si applicable
  - Voir les résultats après publication

#### **Public / Spectator**
- Scope : informations publiques du show
- Responsabilités :
  - Voir schedule public
  - Voir draw public
  - Voir résultats publiés
  - Voir standings publics
- Permissions clés :
  - Lecture seule sur les données marquées comme publiques

---

## 2. Matrice de Permissions (MVP)

| Fonction | Platform Admin | Org Admin | Show Org | Secretary | Owner | Agent | Rider | Public |
|----------|---|---|---|---|---|---|---|---|
| **SHOWS** | | | | | | | | |
| Créer show | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Modifier config show | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Voir show | ✅ | ✅ | ✅ | ✅ | Sien | Sien | ✅ (leur entry) | Publics |
| **ENTRIES** | | | | | | | | |
| Créer entry | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modifier entry | ✅ | ✅ | ❌ | ✅ | Siennes | Siennes | ❌ | ❌ |
| Supprimer entry | ✅ | ✅ | ❌ | ✅ | Siennes | Siennes | ❌ | ❌ |
| Voir entries | ✅ | ✅ | Lecture | ✅ | Siennes | Siennes | ❌ | ❌ |
| **STALLS** | | | | | | | | |
| Configurer stalls | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Réserver stall | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modifier réservation | ✅ | ✅ | ❌ | ✅ | Siennes | Siennes | ❌ | ❌ |
| **INVOICES** | | | | | | | | |
| Créer facture | ✅ | ✅ | ❌ | ✅ | Agent/Sec | ✅ | ❌ | ❌ |
| Modifier facture | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Voir facture | ✅ | ✅ | Lecture | ✅ | Siennes | Siennes | ❌ | ❌ |
| Payer facture | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **CHEVAUX** | | | | | | | | |
| Créer cheval | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modifier cheval | ✅ | ✅ | ❌ | ✅ | Siens | Siens | ❌ | ❌ |
| **CONTACTS** | | | | | | | | |
| Créer contact | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Modifier contact | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **PUBLICATION** | | | | | | | | |
| Publier schedule | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Publier draw | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Publier résultats | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SCRATCHES/REFUNDS** | | | | | | | | |
| Scratch entry | ✅ | ✅ | ❌ | ✅ | Sienne | Siennes | ❌ | ❌ |
| Approve refund | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Modèle de Données Relationnels - Rôles

### 3.1 Organization Roles (Membres de l'organization)

```
organization_members {
  id: UUID
  organization_id: UUID (FK)
  user_id: UUID (FK)
  role: ENUM ['admin', 'secretary', 'user']
  created_at: timestamp
  updated_at: timestamp
}
```

- `role = 'admin'` : Organization Admin (accès à tous les shows)
- `role = 'secretary'` : Secretary (peut être limité à certains shows)
- `role = 'user'` : Membre sans rôle spécifique

### 3.2 Show Roles (Rôles spécifiques par show)

```
show_roles {
  id: UUID
  show_id: UUID (FK)
  user_id: UUID (FK)
  role: ENUM ['organizer', 'secretary', 'judge', 'scribe', 'announcer']
  scope: ENUM ['show', 'ring'] (pour future granularité)
  created_at: timestamp
  updated_at: timestamp
  UNIQUE(show_id, user_id, role)
}
```

- `role = 'organizer'` : Show Organizer pour ce show
- `role = 'secretary'` : Secretary pour ce show
- Autres rôles réservés pour future (Judge, Scribe, Announcer pour ShowScore)

### 3.3 Logic Rules

**Pour Platform Admin :**
- Créé dans une table `platform_admins` simple (user_id)

**Pour Organization Admin :**
- User avec `organization_members.role = 'admin'` pour son organization

**Pour Show Organizer / Secretary :**
- User avec `show_roles.role = 'organizer'` ou `'secretary'` pour un show spécifique
- OU Organization Admin (hérité)

**Pour Owner / Agent :**
- Lié via `user_profiles` (type_user) et relations à `horses` et `contacts`

---

## 4. Relation Owner / Agent / Rider / Payer

Chaque Entry ou Stall Booking doit tracker :

```
entry {
  id: UUID
  horse_id: UUID (FK) - le cheval
  created_by_user_id: UUID (FK) - qui a créé (Owner, Agent, ou Secretary)
  owner_contact_id: UUID (FK) - contact du propriétaire
  agent_user_id: UUID (FK) - agent user (optionnel)
  rider_contact_id: UUID (FK) - celui qui monte (optionnel)
  payer_contact_id: UUID (FK) - qui reçoit la facture/qui paie (Owner ou Agent au MVP)
  created_at: timestamp
  updated_at: timestamp
}
```

**Pour la facturation :**
- Générer une facture basée sur `payer_contact_id`
- Le payer peut être Owner (connecté/contact) ou Agent
- Split billing sera une v2 : `invoice_line_items` avec plusieurs payeurs

---

## 5. Contacts Non-Connectés

```
contacts {
  id: UUID
  organization_id: UUID (FK)
  type: ENUM ['owner', 'agent', 'rider', 'other']
  first_name: string
  last_name: string
  email: string
  phone: string
  created_by_user_id: UUID (FK) - qui a créé ce contact
  linked_user_id: UUID (FK, nullable) - si le contact a créé un compte plus tard
  created_at: timestamp
  updated_at: timestamp
}
```

- Si `linked_user_id` = NULL : contact non-connecté (reçoit factures par email)
- Si `linked_user_id` = user_id : contact a créé un compte (peut se connecter)

---

## 6. Résumé MVP

### Rôles Supportés
1. Platform Admin
2. Organization Admin
3. Show Organizer
4. Secretary
5. Owner (connecté et non-connecté)
6. Agent (connecté)
7. Rider (contact)
8. Public

### Permissions
- Simples et prédéfinies par rôle
- Scope: Platform > Organization > Show
- Future : permissions granulaires (Judge, Scribe, Announcer)

### Entités Clés Nécessaires
- `users` / `user_profiles`
- `organizations` / `organization_members`
- `shows` / `show_roles`
- `contacts` (Owner, Agent, Rider non-connectés)
- `horses` et relations Owner/Agent
- `entries` avec tracking de qui crée/qui paie
- `invoices` et `payments`
- `stall_bookings`

---

## Prochaines Étapes

1. ✅ Modèle de rôles/permissions défini
2. ⏳ **Structure Supabase détaillée** (prochainement)
3. ⏳ Workflows métier par module
4. ⏳ Modèle de facturation et paiements
5. ⏳ Architecture API et base de données
