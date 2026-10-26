# Finances de l’association

L’onglet **Finance** présente cinq sections : vue d’ensemble, comptes clients,
concours, activités hors concours et rapports. Les filtres d’année, de concours
et de recherche sont conservés dans l’URL. Les comptes sont paginés par 25 et
les concours par 12 ; les totaux ne sont jamais calculés à partir d’une seule
page de résultats. Les devises restent séparées.

La présentation Finance utilise une densité compacte sur ordinateur : texte
courant de 14 px, boutons de 13 px et espacements réduits. Sur mobile, les
champs restent à 16 px et les boutons conservent une hauteur de 44 px.
Le zoom du navigateur reste sous le contrôle de l’utilisateur.

La liste des concours calcule ses montants directement depuis les charges et
paiements, uniquement pour la page demandée. Elle ne reconstruit pas les
documents complets des comptes pour chaque total. En cas d’erreur de lecture,
un message de chargement échoué remplace le faux état « premières opérations ».

La vue d’ensemble distingue les montants facturés aux clients, les paiements
reçus, les soldes à recevoir et les comptes encore ouverts. Ces montants
opérationnels comprennent les taxes et frais HSP. Une recherche permet de
retrouver un client, un cheval, un compte ou une facture via les opérations
serveur existantes. Le filtre « Avec un solde seulement » porte sur toute la
sélection. Les comptes et leurs opérations existantes restent accessibles.

## Bilan par concours ou activité

Dans **Rapports**, choisir le concours ou l’activité. Le rapport présente :

- les revenus de l’association hors taxes, nets des annulations et crédits ;
- les frais de traitement connus attribués à l’association ;
- les revenus par catégorie, les paiements reçus par moyen et l’état des comptes ;
- les taxes, encaissements, soldes et frais HSP présentés séparément.

Les allocations de paiement déterminent la part encaissée pour chaque
fournisseur. Un encaissement mixte n’est jamais compté intégralement comme un
revenu de l’association. La part association des frais de traitement suit le
même prorata et l’arrondi au cent que les documents existants. Les frais
inconnus sont signalés ; ils ne sont pas estimés.

Cette première version se limite aux revenus, paiements et soldes. Aucune
saisie de dépenses ni calcul de résultat net n’est proposé dans l’interface
ou dans les exports. Les encaissements comprennent les taxes et ne représentent
pas un bénéfice net.

La migration additive déjà publiée conserve son registre et son audit de
dépenses : aucune donnée ni migration historique n’est supprimée. L’interface
n’expose plus ces opérations et n’utilise pas leurs montants dans les rapports.
La reprise générique reste disponible pour une opération lancée avant cette
simplification.

Le rapport peut être imprimé ou exporté en CSV UTF-8 à séparateur point-virgule.
Les cellules textuelles susceptibles d’être interprétées comme des formules de
tableur sont neutralisées.
Ce rapport de gestion reste provisoire ; il ne remplace pas les factures ou la
comptabilité. Les anciennes factures en archives ne sont pas ajoutées aux
rapports des comptes actuels.

## Accès et validation

Le rapport et les dépenses exigent les droits de personnel du contexte
financier. L’association demandée doit correspondre au contexte. Les tables de
dépenses ne peuvent pas être modifiées directement depuis un client. Aucun
réglage de frais HSP n’est réintroduit dans les finances de l’association.

Validation : build ; `scripts/billing/association-finance.browser.mjs` en FR/EN
sur téléphone portrait, paysage et ordinateur ; export et absence de commandes
de dépenses ;
`scripts/billing/finance-browser.mjs` pour les parcours financiers existants ;
`scripts/billing/finance-report.test.mjs` pour le CSV ;
`supabase/tests/association_finance_reports.sql` pour les calculs et autorisations
avec des utilisateurs synthétiques dans une transaction annulée.
