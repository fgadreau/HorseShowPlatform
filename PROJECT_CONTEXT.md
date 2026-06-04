# PROJECT_CONTEXT

## Objectif
Documenter les décisions d’architecture MVP pour la plateforme Horse Show Platform avant de démarrer la phase d’implémentation.

## Vision MVP
- Plateforme multi-tenant pour l’organisation et la gestion de shows équestres.
- Support minimal viable pour inscriptions, facturation, paiements, stalls, et administration show.
- Priorité à la sécurité, à l’isolation des données, et à une implémentation simple mais évolutive.

## Documents de conception actifs
- `docs/SHOW_READINESS_AND_CLASS_FINANCE.md` : décisions produit à reprendre pour checklists utilisateur, exigences show/class, OPTS, préréglages NRHA/AQHA/NSBA, memberships achetables, taxes, added money, jackpot, retainage, payback et centre de notifications.

## Stack retenue
- Frontend : React
- Base de données + Auth + Storage : Supabase
- Infrastructure / hébergement : Vercel + GitHub
- Paiements : Stripe
- Emails : Resend
- Server-side avancé : Supabase Edge Functions

## 1. RLS & Multi-tenancy
### Principes
- Isolation stricte par `organization_id` sur toutes les tables liées à une organisation.
- Chaque table liée à `organization` ou `show` doit contenir `organization_id`, même si elle contient aussi `show_id`.
- Ne jamais se fier au frontend.
- RLS obligatoire côté Supabase.

### Règles d’accès
- `Platform Admin` : accès global à toutes les organisations et shows.
- `Organization Admin` : accès à toutes les données de sa propre organisation.
- `Show roles` (Organizer, Secretary, etc.) : accès restreint aux shows assignés.
- `Owner`, `Agent`, `Rider` : accès uniquement à leurs propres contacts, chevaux, inscriptions, factures.
- `Public` : accès uniquement aux données explicitement publiées.

### Filtrage
- Toutes les requêtes doivent filtrer par `organization_id` ou `show_id` selon le rôle.
- Les policies Supabase doivent combiner les deux si nécessaire, par exemple :
  - `organization_id = auth.organization_id`
  - `show_id IN (SELECT show_id FROM user_show_assignments WHERE user_id = auth.uid)`

## 2. API Architecture
### MVP
- Utiliser Supabase client SDK directement dans React pour les lectures et les opérations CRUD simples.
- Centraliser les appels dans une couche de service React réutilisable.

### Actions sensibles
Utiliser Supabase Edge Functions pour :
- Stripe checkout / webhook payment
- Envoi d’emails via Resend
- Finalisation des factures avec logique complexe
- Invitations et gestion des rôles
- Marquage des paiements avec audit strict
- Toute opération nécessitant une clé secrète ou un traitement serveur sécurisé

### Rôle de l’API layer
- Ne pas créer un backend monolithique complet au MVP.
- Préserver l’agilité : React + Supabase SDK pour la majorité, Edge Functions pour les cas sensibles.

## 3. Authentication
### Approche MVP
- Authentification email/password.
- Magic link optionnel si la mise en place reste simple.
- Pas de Google/Apple pour le MVP.

### Contacts non-connectés
- Supporter les contacts qui reçoivent une facture et paient via un lien sécurisé.
- Permettre la création/claim d’un compte plus tard.

## 4. Real-time Updates
### Choix MVP
- Pas de real-time nécessaire pour MVP.
- Utiliser refresh manuel ou refetch après les actions.

### Futur
- Real-time peut être ajouté plus tard pour :
  - ShowScore
  - Résultats live
  - Dashboard secrétaire
  - Affichage public/annonceur
  - Disponibilité des stalls en temps réel

## 5. File Storage
### Choix MVP
- Supabase Storage.

### Buckets prévus
- `organization-logos`
- `show-documents`
- `horse-documents`
- `invoices` ou `receipts` pour PDF plus tard
- `health-documents` ou `coggins`

### Justification
- Simplifie l’architecture
- Évite de doubler les services pour le MVP
- Permet une migration ultérieure vers un service externe si nécessaire

## Résumé des décisions
- React + Supabase + Vercel + GitHub + Resend + Stripe
- Supabase RLS stricte
- Supabase SDK direct pour CRUD simple
- Supabase Edge Functions pour actions sensibles
- Email/password auth
- Pas de real-time au lancement
- Supabase Storage pour fichiers
