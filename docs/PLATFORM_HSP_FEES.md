# Configuration des frais HSP

Dans **Plateforme → Paramètres plateforme → Frais de service HSP**, un
administrateur de plateforme choisit l’association et son montant avant taxes.
Une exception par concours peut être configurée au même endroit. Le défaut
plateforme s’applique aux associations sans montant personnalisé.

Priorité conservée : concours, association, plateforme. Laisser le champ du
montant vide rétablit l’héritage ; zéro correspond à une commandite. Le défaut
plateforme doit rester strictement positif.

Les finances de l’association ne contiennent plus ce réglage. Les opérations
serveur de lecture des paramètres internes et de modification exigent le droit
d’administration de plateforme, y compris pour une association ou un concours.
Les frais facturés restent visibles dans les comptes et documents financiers.

Ce déplacement ne change aucun montant existant, aucune facture, aucun frais
déjà porté à un compte et ne déclenche aucun paiement.

Validation : build, scénario navigateur `scripts/billing/hsp-fee-browser.mjs`
(FR/EN, portrait/paysage, ciblage association/concours et validations), test SQL
transactionnel annulé `supabase/tests/platform_hsp_fee_permissions.sql`
(administrateur d’association et membre refusés, plateforme autorisée, audit et
accès direct aux tables), tests financiers locaux existants.
