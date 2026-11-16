# Retrait de l’ancienne facturation — 15 novembre 2026

Le moteur `billing_*` est la seule source des comptes, soldes, charges,
paiements et documents. Les tableaux de bord et réservations lisent ses comptes.
Les archives de l’ancien écran et la reprise des anciennes cartes sont retirées.

Les migrations historiques restent immuables. La migration de retrait supprime
`invoices`, `invoice_line_items`, `payments`, leurs anciens déclencheurs et les
liens `invoice_id` des ventes et cartes. Les cartes fictives achetées via la
plateforme sans charge moderne sont supprimées. Les cartes importées, gratuites
et les achats déjà reliés à une charge moderne sont conservés.

Les inscriptions, réservations et ventes de concours doivent utiliser un concours
dont les comptes sont configurés. Un concours non configuré ne peut plus créer de
facture par un moteur de repli. Les documents PDF versionnés du moteur actuel sont
conservés, y compris leurs anciens formats de rendu.

Le portail vétérinaire est temporairement masqué et ses routes affichent une page
d’indisponibilité. Son code et ses données restent disponibles pour sa reprise.

## Livraison en préproduction

1. Appliquer la migration additive du lecteur des comptes de tableau de bord.
2. Livrer le frontend sur `preprod` et vérifier le déploiement Vercel.
3. Appliquer la migration de retrait, puis comparer les empreintes des tables
   `billing_*` avant/après. Aucun changement de production n’est requis.

## Vérification

Le test SQL `entry_lifecycle.sql` couvre inscriptions, paiements, annulations,
contrôles d’accès du lecteur des comptes et absence des tables retirées.
`membership_import.sql` vérifie l’isolation financière des cartes importées.
Les tests navigateur finances, réservations, cartes de membre et
`scripts/billing/retirement.browser.mjs` couvrent les parcours conservés.
