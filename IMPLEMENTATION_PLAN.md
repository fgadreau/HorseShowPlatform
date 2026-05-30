# IMPLEMENTATION_PLAN

## Objectif
Définir les étapes d’implémentation MVP dans l’ordre, avec les livrables et priorités claires.

## Phase 2 - Plan MVP

### 1. Initialisation du projet
- Créer le dépôt GitHub si pas déjà fait.
- Configurer Vercel pour le déploiement du frontend.
- Configurer Supabase pour la base de données, Auth, Storage et Edge Functions.
- Ajouter les environnements : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`.

### 2. Modèle de données et RLS
- Implémenter le schéma Supabase SQL basé sur `SUPABASE_SCHEMA.md`.
- Ajouter `organization_id` partout où c’est pertinent.
- Créer les policies RLS pour chaque table :
  - `Platform Admin`
  - `Organization Admin`
  - `Show roles`
  - `Owner/Agent/Rider`
  - `Public`
- Tester les policies avec des utilisateurs de rôles différents.

### 3. Authentification
- Configurer Supabase Auth email/password.
- Créer l’UI de connexion et inscription React.
- Prévoir la logique de reset password et verification email.
- Implémenter la gestion des contacts non-connectés via liens sécurisés.

### 4. Structure React et Services Supabase
- Créer l’arborescence React.
- Implémenter la couche de services Supabase partagée.
- Mettre en place le context utilisateur / organisation.
- Gérer le filtrage automatique `organization_id` dans les requêtes.

### 5. Pages et fonctionnalités MVP
#### 5.1 Organisation et shows
- Page de dashboard organisation.
- Liste des shows.
- Création / édition de show.

#### 5.2 Gestion des rôles et permissions
- Interface d’attribution de rôles.
- Gestion des accès show-specific.

#### 5.3 Inscriptions (Entries)
- Création d’inscription en draft.
- Passage en `pending_checkout`.
- Validation et activation de l’inscription.
- Support des propriétaires/agents/riders.

#### 5.4 Facturation et paiements
- Modèle d’invoice groupée avec line items.
- Interface de visualisation des factures.
- Envoi de facture par email.
- Paiement Stripe Stripe Checkout + capture de webhook.
- Support des paiements manuels et partiels.

#### 5.5 Stalls et extras
- Réservation de stalls.
- Tarifs flexibles par show.
- Mise à jour de disponibilité.

#### 5.6 Scratches et remboursements
- Implémenter les politiques de scratch/refund configurables.
- Workflow d’approbation manuelle si nécessaire.

### 6. Edge Functions sensibles
- Endpoint Stripe webhook.
- Endpoint de finalisation de facture / calcul de taxes.
- Endpoint d’envoi d’email via Resend.
- Endpoint d’invitation / onboarding utilisateur.
- Endpoint de marquage de paiement avec audit si requis.

### 7. Stockage de fichiers
- Configurer Supabase Storage.
- Créer les buckets initiaux.
- Implémenter upload/download pour logos, documents de show, documents chevaux.
- Ajouter règles de sécurité RLS sur l’accès aux fichiers.

### 8. Tests et vérifications
- Tests manuels des workflows critiques.
- Vérifier l’isolation multi-tenant.
- Tester les rôles et les accès RLS.
- Vérifier les webhooks Stripe et les emails Resend.

### 9. Documentation et livraison
- Mettre à jour les docs `SPECIFICATIONS.md`, `ARCHITECTURE_SUMMARY.md`, et autres si besoin.
- Documenter la configuration d’environnement et le déploiement.
- Préparer un plan de bascule pour la phase suivante.

## Priorités MVP
1. RLS + modèle données
2. Auth + organisation
3. Entries / Invoices / Payments
4. Stalls / Policies de scratch
5. Edge Functions sensibles
6. Stockage fichiers
7. Tests et documentation

## Annexes
- Se baser sur `WORKFLOWS_BUSINESS.md` pour la logique métier.
- Se baser sur `FINANCIAL_CONCEPTS.md` pour la facturation et les paiements.
- Se baser sur `SUPABASE_SCHEMA.md` pour le modèle SQL.
