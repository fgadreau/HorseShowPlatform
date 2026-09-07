# Revue du rendu 4 — dossard → bloc → classes

Travail issu de `92a23585e21bc81347a03b0af2abba26ba40ccb9`, sur `feat/billing-hsp-direct-prototype`, dans le worktree persistant `/workspaces/HorseShowPlatform/.worktrees/billing-hsp-direct`.

Les nouvelles pièces affichent les inscriptions par dossard, puis par identifiant de bloc et occurrence, puis par classe. Chaque classe présente inscription, juges et total avant taxes. Les juges du bloc restent sur une ligne distincte, avec le sous-total du bloc puis le total du dossard. Réservations, autres achats et service HSP restent séparés. Le détail du compte, le relevé/récapitulatif, la facture et les frais repris sur les reçus utilisent le même modèle de présentation, en FR/EN, avec des cartes sur mobile.

## Exemples réellement émis dans la pile fictive

Compte `DEMO-ACC-000015`, concours fictif créé pour cette revue. Une seule facture `DEMO-INV-000009`, 33 frais dont 30 d’inscription/juges, un seul frais HSP. Aucun paiement Stripe supplémentaire.

| Dossard | Inscriptions avant taxes | Juges avant taxes | Total inscriptions avant taxes |
| --- | ---: | ---: | ---: |
| 941 — Great Holly Whiz — Morgan Cavalier DEMO | 1 675 $ | 180 $ | 1 855 $ |
| 942 — Demo Silver Star — Camille Cavalier DEMO | 300 $ | 20 $ | 320 $ |
| Non attribué — Demo Silver Star, aucun cavalier déduit | 75 $ | 0 $ | 75 $ |
| Sous-total inscriptions | 2 050 $ | 200 $ | 2 250 $ |

Les 4 groupes bloc/occurrence du dossard 941 comprennent deux blocs distincts portant le même nom, une occurrence matin et une occurrence après-midi, et un bloc de 12 classes. Le dossard 942 comporte deux blocs. Réservations : 120 $ ; autres achats : 25 $ ; HSP : 5 $. Sous-total général : 2 400 $ ; taxes fictives existantes : 120 $ ; total : 2 520 $.

Deux encaissements manuels fictifs ont été exécutés : 200 $ avant fermeture, puis 2 320 $ après fermeture par la secrétaire autorisée. La facture conserve son instantané de fermeture : premier reçu de 200 $ et solde historique de 2 320 $. Le second reçu et le compte courant constatent le règlement ; aucune réécriture de facture. Le formulaire est masqué à solde courant nul.

| Document | Français | English |
| --- | --- | --- |
| Facture finale — 4 pages | [PDF FR](main-invoice-DEMO-INV-000009-fr.pdf) | [PDF EN](main-invoice-DEMO-INV-000009-en.pdf) |
| Relevé utilisé comme récapitulatif de fermeture — 4 pages | [PDF FR](main-statement-9a972a6e-f41c-4387-bd9f-b58e921ece7d-fr.pdf) | [PDF EN](main-statement-9a972a6e-f41c-4387-bd9f-b58e921ece7d-en.pdf) |
| Reçu 000022 — paiement partiel de 200 $, 4 pages | [PDF FR](main-receipt-DEMO-RCPT-000022-fr.pdf) | [PDF EN](main-receipt-DEMO-RCPT-000022-en.pdf) |
| Reçu 000023 — paiement après fermeture de 2 320 $, 6 pages | [PDF FR](main-receipt-DEMO-RCPT-000023-fr.pdf) | [PDF EN](main-receipt-DEMO-RCPT-000023-en.pdf) |

Les descriptions métier sont figées dans leur langue source ; les libellés de présentation sont traduits. Les PDF conservent les coordonnées et identifiants fiscaux séparés des deux fournisseurs et la mention du mandat du prototype. Les reçus distinguent le montant complet du frais et la portion réglée, sans recalculer ou répartir artificiellement les taxes.

## Captures navigateur réelles

| Vue | FR ordinateur | FR mobile | EN ordinateur | EN mobile |
| --- | --- | --- | --- | --- |
| Compte ouvert | [1440 px](account-open-fr-1440.png) | [390 px](account-open-fr-390.png) | [1440 px](account-open-en-1440.png) | [390 px](account-open-en-390.png) |
| Compte fermé, solde nul | [1440 px](account-closed-fr-1440.png) | [390 px](account-closed-fr-390.png) | [1440 px](account-closed-en-1440.png) | [390 px](account-closed-en-390.png) |
| Mes comptes après chargement | [1440 px](my-accounts-fr-1440.png) | [390 px](my-accounts-fr-390.png) | [1440 px](my-accounts-en-1440.png) | [390 px](my-accounts-en-390.png) |
| Facture finale | [1440 px](invoice-fr-1440.png) | [390 px](invoice-fr-390.png) | [1440 px](invoice-en-1440.png) | [390 px](invoice-en-390.png) |
| Relevé/récapitulatif conservé | [1440 px](statement-fr-1440.png) | [390 px](statement-fr-390.png) | [1440 px](statement-en-1440.png) | [390 px](statement-en-390.png) |
| Reçu partiel | [1440 px](receipt-fr-1440.png) | [390 px](receipt-fr-390.png) | [1440 px](receipt-en-1440.png) | [390 px](receipt-en-390.png) |

La boîte de confirmation de fermeture a également été capturée en FR [ordinateur](closing-recap-fr-1440.png) / [mobile](closing-recap-fr-390.png). Sa version EN est vérifiée via le même relevé figé et le même composant de document. [Encaissement secrétaire sur compte fermé avec solde dû](closed-payable-staff-1440.png).

## Références métier et versions

Le modèle opérationnel conserve `entries.entry_number`, mais aucune clé étrangère immuable vers `organization_back_numbers`. L’inventaire permet les affectations cheval, cavalier et équipe cheval/cavalier ; numéro et affectation restent modifiables. Le résolveur opérationnel peut utiliser le propriétaire en secours : cette déduction n’est pas reprise pour la facturation.

Le prototype interdit toujours l’adoption d’un concours contenant des écritures historiques et l’insertion d’anciennes `entries` dans un contexte adopté. Aucun garde-fou n’a été désactivé. Les inscriptions de ces exemples restent des ventes documentées fictives : la nouvelle RPC `add_documented_billing_entry_sale` rattache explicitement une vente à une classe du concours et, si disponible, à une affectation de l’inventaire. Elle vérifie le concours/l’association, le périmètre payeur, le cheval, le statut et le mode de l’affectation. Le cavalier provient uniquement de cette affectation confirmée. Il ne s’agit pas d’un raccordement au cycle opérationnel des anciennes inscriptions.

La table immuable `billing_charge_entry_identity` fige les références et libellés à l’ajout du frais ; l’instantané du document les copie. Les clés combinent association, concours, identifiant d’affectation, cible métier selon la politique et numéro enregistré. Les blocs utilisent leur ID et l’occurrence ; les classes utilisent leur ID. Noms et numéros seuls ne constituent jamais une clé. Sans affectation confirmée, les références disponibles limitent le regroupement ; en cas d’ambiguïté, les sources de vente restent distinctes. Les frais anciens sans référence fiable ne reçoivent aucun dossard ou cavalier inventé.

Migration additive `20260907000600_billing_entry_identity_v4.sql` : `presentation_version=4`, `render_version=4`, identité figée `version=1`. Seules les nouvelles pièces sélectionnent le rendu 4. Les fichiers `pdf-v1.mjs`, `pdf-v2.mjs` et `pdf-v3.mjs` sont inchangés. Aucun remplacement d’objet Storage ni modification rétroactive de montants, taxes, paiements, affectations ou PDF émis.

Le contrôle navigateur a révélé un dépassement du délai SQL de « Mes comptes ». La matérialisation de l’instantané, puis une barrière d’inlining dans la lecture des comptes, éliminent ses évaluations répétées par colonne. L’égalité complète des instantanés et des listes autorisées a été vérifiée avant/après. Le contrôle RPC final a chargé 23 comptes en 1 027 ms ; aucun délai serveur n’a été augmenté.

## Validations exécutées et limites

- **Tests simulés, avec outils réels** : 61 tests unitaires passent ; 12 instantanés synthétiques sont rendus par Chromium et extraits par PDF.js en FR/EN. Les 594 lignes attendues sont vérifiées, avec leurs cellules et leur multiplicité sur une page. Les cas longs couvrent les coupures internes et les en-têtes dossard/bloc « suite / continued ». [Résultats pagination](pagination-results.json), [tests unitaires](unit.txt).
- **PostgreSQL réel sur clone jetable** : 49 assertions et 9 rejets attendus. Migration complète testée depuis la sauvegarde précédant le rendu 4, puis régressions financières, références croisées, rejeu, stabilité après renommage et changement de numéro, collecte après fermeture, frais HSP et récupération unique. Liste personnelle testée sous `statement_timeout='3s'`. Les objets fournisseur Stripe de cette suite sont **simulés**. [Résultats](server-results.json), [exécution de la migration complète](server-clean-migration.txt).
- **Pile fictive persistante réellement utilisée** : nouvelles références classe/dossard, 33 frais via RPC, deux encaissements manuels fictifs, fermeture via navigateur, facture unique ; 8 PDF générés par le worker, publiés puis téléchargés depuis le Storage privé. Les 458 lignes des PDF finaux et leurs en-têtes sont contrôlés ; 4 téléchargements par un autre payeur sont refusés. [Documents et SHA-256](documents-results.json), [sommes indépendantes](integrity-results.json).
- **Navigateur réel, sans réponses simulées** : 27 captures ; aucun débordement horizontal de page ni cellule de montant coupée dans les vues contrôlées ; Mes comptes chargé ; 6 téléchargements navigateur identiques aux PDF Storage. [Résultats navigateur](browser-results.json). Inspection visuelle des montants mobile/ordinateur et des pages PDF contenant sous-totaux, dossard non attribué et continuation. [Contrôles complémentaires PDF](pdf-inspection.txt).
- **Préservation** : 38 anciens PDF retéléchargés et identiques octet pour octet ; empreintes des lignes financières et métadonnées historiques inchangées. SVG et configuration Stripe inchangés. Processus persistants présents ; secret du listener identique à celui du worker et confirmation CLI retrouvée, sans afficher les secrets. [Historique](history-results.json), [données historiques](financial-history.txt), [runtime](runtime-results.json).
- **Build** : `npm run build` réussi ; avertissements existants de taille de bundle et d’imports dynamiques. [Journal](build.txt).

Les essais locaux n’ajoutent aucun paiement Stripe, compte Stripe, remboursement, règle fiscale ou règle de petits paiements. Le rapprochement Stripe de cette livraison repose sur les régressions simulées et la configuration locale conservée, pas sur une nouvelle transaction Stripe réelle. Les anciennes limites de qualification restent applicables.

Aucune fusion, migration distante, modification PREPROD/PROD ou réinitialisation de la pile. Sauvegarde et journaux de reprise conservés dans `.tmp/review-v4` du worktree persistant, hors Git ; seuls les exemples fictifs et les résultats sans secrets sont publiés ici.
