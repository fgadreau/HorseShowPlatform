# Tranche 1B — Interface administrative et participant

Base approuvée : `35275a1e4d5d92be3ac3b5e2b669b07ea1b56c9d`. Branche : `feat/billing-stripe-test-ui`. Contrats serveur du commit local `7afa8c2e34789c67e75c1218d357424d8370e575`. Cette livraison suit le serveur dans un commit local distinct, sans push.

**Statut : interface implémentée, build et parcours locaux avec fixtures/mocks validés. Le parcours intégré à Stripe test réel reste non qualifié faute de clés test.** Aucun résultat simulé ne vaut validation de carte ou de webhook réel. Les limites ci-dessous font partie de la livraison à revoir.

## Surfaces livrées

* `src/features/finance/FinanceView.tsx` : Finance (année, recherche, trois onglets), listes paginées, filtres personnels association/année/état, soldes d'années antérieures, contextes et première vente à un contact payeur.
* `AccountDetail.tsx` : détail commun, frais/taxes, bénéficiaire et cheval distincts, vente au prix du contexte, encaissement comptant/Interac fictif, montant réservé/disponible, reçu, relevé, attestation, blocage administratif, récapitulatif et fermeture secrétaire/payeur.
* `PaymentElement.tsx` : Stripe.js, Payment Element, montant partiel, confirmation test, retour vérifié auprès du serveur, reprise/annulation. Le bouton de confirmation attend le montage de l'Element.
* `DocumentView.tsx` : consultation du relevé, reçu et de la facture logique **uniquement depuis `document.snapshot`**. Aucun téléchargement ou traitement PDF prétendu actif. Message explicite de livraison PDF en 1C.
* `navigation.ts`, `finance.css`, `src/services/billingFolio.ts` : URL canoniques, styles responsive, RPC, appel au serveur local, clés de commande persistées et protection des retries ambigus.
* `App.tsx`, `Dashboard.tsx`, `features/navigation.ts`, `types/ui.ts`, `lib/i18n.ts` : intégration à la navigation existante, Finance et Mes comptes, réutilisation des écrans métier et traductions FR/EN.
* `vite.config.ts` : proxy du serveur de paiement **uniquement dans la configuration locale existante**, vers `127.0.0.1:54331` ; contrôle de l'origine conservé.
* `scripts/billing/finance-browser.mjs`, `finance-harness.tsx`, `finance-preview.mjs`, `navigation.test.mjs` : fixtures isolées, captures et validation. Aucun de ces mocks n'est importé par l'application de production.

## Navigation

| URL | Écran |
| --- | --- |
| `/associations/:org/finance` | Finance, état des onglets et filtres dans la query string. |
| `/associations/:org/finance/accounts/:folio` | Détail administratif canonique commun à Finance et au concours. |
| `/associations/:org/shows/:show/overview` | Écran concours existant, contextualisé. |
| `/associations/:org/shows/:show/entries` | Inscriptions existantes. |
| `/associations/:org/shows/:show/reservations` | Réservations existantes. |
| `/associations/:org/shows/:show/schedule` | Horaire existant. |
| `/associations/:org/shows/:show/accounts` | Comptes du concours. |
| `/associations/:org/shows/:show/scoring`, `/results`, `/health` | Accès secondaires sous Plus vers les écrans existants. |
| `/me/accounts`, `/me/accounts/:folio` | Liste/détail personnels, projections payeur exclusivement. |

Le menu vertical garde l'association ; les fonctions opérationnelles rejoignent la barre horizontale. Aucun deuxième menu latéral permanent. Les sélecteurs et les fonctions existantes sont réutilisés, sans réécriture des règles d'inscription, de réservation ou de pointage. Finance remplace Facturation ; Mes comptes remplace Mes factures. Un volet explicitement nommé facturation historique conserve le composant legacy et ses callbacks existants, séparés du nouveau moteur. Un concours sans contexte adopté est identifié comme historique dans Finance.

L'association et le concours explicites dans l'URL ont priorité : aucun repli silencieux vers un autre concours sur un lien invalide. Sans concours explicite, le défaut privilégie un concours non archivé en cours/à venir, puis le plus récent. Le sélecteur conserve la section équivalente. L'accès au détail depuis un concours ajoute `return_show` pour retrouver ce concours au retour ; les filtres annuels/recherche/contextes restent dans l'URL. Les URL publiques `/shows/:slug`, vétérinaires `/vet…` et le dispatch ShowScore antérieur ne sont pas remplacés.

## Autorité et expérience

Les lectures utilisent les RPC 1A.6 et les contrats complémentaires `billing_ui_detail`, `billing_ui_catalog`, `billing_navigation_scope`. Le serveur fournit actions, admissibilité, codes de motifs publics, totaux et réservations. La présence d'un rôle administratif ne change jamais la requête de Mes comptes : `p_personal=true`, et la liste personnelle reste réservée aux contacts réellement payeurs.

Les codes de fermeture sont traduits FR/EN. Les montants restent par devise ; la devise et le prix ne sont pas éditables dans une vente. Le formulaire permet de distinguer payeur, bénéficiaire et cheval. Le navigateur prépare des affectations manuelles à partir des frais affichés ; le serveur revalide version, plafond et affectations sous verrou, sans faire confiance au calcul client.

Les états de chargement, vide et erreur sont distincts. Les champs de détail sont conservés en session après erreur/rechargement ; une commande inconnue après perte réseau garde sa clé et interdit une modification silencieuse du contenu avant résolution. Le formulaire affiche l'erreur et conserve la saisie. Une navigation hors de la saisie de détail avertit l'utilisateur ; la fermeture du navigateur est aussi protégée. La boîte de confirmation utilise un dialogue natif avec focus initial sur Retour, Échap et confinement du focus.

Les listes se présentent en tableaux sur ordinateur et en cartes compactes sur téléphone. La barre horizontale peut défiler ; les contrôles gardent un focus visible. Le marquage Démonstration / données fictives / Stripe TEST est visible. Les documents logiques indiquent explicitement « PDF non disponible — génération prévue en tranche 1C ».

Un paiement est possible avant Prêt à finaliser. Les états Stripe affichés proviennent de la lecture serveur ; `redirect_status` ne sert pas de preuve. Les paramètres de retour Stripe, dont le client secret, sont retirés de l'URL de détail. La reprise vérifie le fournisseur côté serveur ; une fenêtre fermée ne supprime pas la tentative. Une réussite de paiement ne finalise pas le compte. La facture logique et son numéro restent distincts des deux reçus du scénario.

## Validation exécutée

```sh
npm run build
node scripts/billing/navigation.test.mjs
node scripts/billing/finance-browser.mjs
node scripts/billing/stripe-service.test.mjs
node --check scripts/billing/finance-preview.mjs
git diff --check
```

| Catégorie | Résultat |
| --- | --- |
| Build TypeScript/Vite | Réussi. Avertissements de chunks >500 kB et import vétérinaire dynamique/statique ; aucun échec de compilation. |
| Contrats de routes | 15 tests réussis, dont exclusion des routes publiques/vétérinaires et identité concours/association. |
| Navigateur Chromium réel, RPC/Stripe simulés | 18 scénarios réussis ; résultat machine `.tmp/billing-ui/results.json`, `complete:true`. |
| PostgreSQL réel | Deux suites complètes sur bases jetables : 200 assertions, 87 rejets attendus, 17 groupes de concurrence, régressions 1A/1A.6/réservations/nominations ; reconstruction vierge de 146 migrations. Détail dans le rapport 1A.7. |
| Services avec mocks | 20 tests réussis. |
| Stripe test réellement exercé | Aucun appel, aucun paiement, aucune carte : configuration manquante explicitée dans le rapport 1A.7. |

Les scénarios navigateur couvrent : vente secrétaire, liste/détail payeur, premier paiement partiel, frais supplémentaire puis second paiement/deux reçus, attestation et dialogue de finalisation, facture unique après actualisation, liste mobile sans débordement de page, anglais, erreur de chargement et reprise, retour navigateur, vente dont la réponse est perdue puis rechargement/retry, quatre états de paiement (authentification supplémentaire, traitement, refus/carte requise, annulation), vrai Dashboard avec écran Inscriptions existant, chargement des écrans Réservations et Horaire existants, changement de concours conservant la section, et absence de repli vers un autre écran sur un concours explicite invalide. Le scénario de paiement utilise un faux Element et une réponse fournisseur simulée ; les signatures/règles SQL sont testées séparément.

La suite E2E générale du dépôt écrit dans la pile locale habituelle ; elle n'a pas été lancée sur cette base de développement. Les régressions SQL sont réellement rejouées sur copies jetables. Les tests navigateur des écrans métier réutilisés valident leur montage/navigation avec collections de fixtures vides ; ils ne revendiquent pas une nouvelle exécution complète de toutes les opérations de ShowScore ou de réservation réelle.

## Captures et aperçu consultable

Captures locales, ignorées par Git :

* `.tmp/billing-ui/admin-desktop.png` : compte administratif, paiements et attestation.
* `.tmp/billing-ui/payer-desktop.png` : facture logique depuis son instantané.
* `.tmp/billing-ui/payer-mobile.png` : liste personnelle sur téléphone (390 px).
* `.tmp/billing-ui/navigation-desktop.png` : vrai Dashboard avec navigation du concours et écran métier existant.

Aperçu UX autonome et explicitement simulé :

```sh
node scripts/billing/finance-preview.mjs
# http://127.0.0.1:5318/
# Administration : /associations/org-demo/finance
# Payeur : /me/accounts
```

Cet aperçu n'utilise **aucune base de données ni API Stripe** : données en mémoire, lien Administration/Payeur, composant Payment Element factice marqué SIMULÉ. Il permet la consultation et l'essai du parcours UI sans secrets. Redémarrer le processus réinitialise les faux comptes. Il ne représente pas un pilote Stripe réel ou une activation de HSP.

Pour l'application complète branchée sur une pile Supabase locale isolée disposant des migrations, contextes fictifs adoptés et utilisateurs : utiliser `VITE_DEPLOY_ENV=local`, `VITE_VET_LOCAL_PROXY=true`, `VITE_SUPABASE_URL=http://127.0.0.1:54321` et sa clé publique locale, puis `npm run dev` sur 5173. Le serveur Stripe test se lance séparément selon le rapport 1A.7. Aucun secret serveur ne doit porter le préfixe `VITE_`. Cette qualification intégrée avec fournisseur réel n'a pas été exécutée.

## Limites et suites

* La validation Stripe réelle, le listener et le compte Express test restent bloqués par les variables absentes. Les reprises réseau, 3DS et annulations sont simulées ici ; une qualification auprès du fournisseur est indispensable avant de considérer le pilote validé.
* Les filtres visibles de Mes comptes couvrent association, année, état, recherche et anciens soldes. Les filtres techniques concours/type sont acceptés dans les paramètres de requête ; une sélection dédiée de tous les types configurables reste une amélioration de présentation à revoir.
* La configuration initiale des contextes fiscaux et de leur phase de fermeture utilise encore les RPC administratives existantes. Aucun écran de configuration fiscale complet ou d'onboarding Connect n'est ajouté à ce parcours de compte.
* L'aperçu UX expose le composant Finance isolé ; la capture de navigation et les tests de montage utilisent séparément le vrai Dashboard. Les tests ne revendiquent pas un scénario de bout en bout combinant navigateur, PostgREST et Stripe réel.
* Les erreurs techniques inattendues peuvent encore afficher un code serveur ; les motifs publics de finalisation disposent de traductions. Les gros bundles existants restent à surveiller.
* 1C : rendu PDF depuis les instantanés, stockage, worker, reprises et téléchargement autorisé. Aucun fichier financier n'est généré ici.
* 1D : qualification intégrée, matrice navigateur/métier élargie, contrôle des reprises fournisseur avec vraies clés test et validation du pilote fictif. Les paiements live et le premier déploiement réel restent soumis à une autre autorisation.

Aucun push, PR, fusion, déploiement, migration distante, changement PREPROD/PROD, paiement réel ou modification des documents contractuels approuvés. SVG intacts et non suivis. Les artefacts de tests et captures ne sont pas ajoutés aux commits.

## Correctif de reprise après revue — base `a73b6df7ffefc282dd9228fe984af7b5acf30ef4`

Branche inchangée : `feat/billing-stripe-test-ui`. Correctif validé localement, puis autorisé au commit et au push pour revue indépendante.

Le registre des commandes conserve la clé et le JSON original complet avant l'appel RPC. Le panneau FR/EN « Résoudre la commande précédente », disponible dans la liste Finance et dans le détail, rejoue ce JSON depuis le stockage après rechargement. Il ne recalcule ni version, ni affectations, ni date, ni montant. Une autre commande durable est refusée tant que la précédente reste incertaine. Les encaissements, ventes, fermetures et préparations de documents emploient ce mécanisme. Les anciens enregistrements du registre de commandes restent lisibles.

Après un encaissement résolu, la saisie du montant et de la référence est vidée et le compte est relu, afin de pouvoir continuer normalement. Les erreurs réseau, pertes de réponse, conflits d'idempotence et retraits d'accès conservent la commande originale. Seuls les rejets explicites de validation listés dans le service libèrent le registre ; un refus d'accès nécessite de rétablir les droits ou une résolution administrative, jamais d'inventer une nouvelle clé.

Le registre Stripe conserve une seule préparation par identité/compte, sans incorporer la version financière. Il permet une nouvelle clé après annulation confirmée, mais conserve la précédente pendant une opération incertaine. Voir le complément 1A.7.

Commandes exécutées pour le correctif :

```sh
node scripts/billing/recovery.test.mjs
node scripts/billing/stripe-service.test.mjs
node scripts/billing/navigation.test.mjs
node scripts/billing/finance-browser.mjs
npm run build
git diff --check
```

| Vérification | Résultat du correctif |
| --- | --- |
| Reprise, services avec stockage et RPC simulés | 4 tests réussis : rejet périmé puis correction, timeout/annulation/clé, encaissement perdu puis rejeu exact et commande suivante, conservation après retrait d'accès. |
| Services Stripe simulés existants | 20 tests réussis. |
| Routes | 15 tests réussis. |
| Chromium réel, RPC et Stripe simulés | 20 scénarios réussis, dont les 18 antérieurs adaptés au bouton explicite et 2 nouveaux scénarios. Résultat machine `.tmp/billing-ui/results.json`, `complete:true`. |
| Annulation puis paiement du même montant | Rechargement entre les deux, clés distinctes après annulation serveur, un seul paiement confirmé. |
| Réponse d'encaissement perdue | Le serveur simulé enregistre paiement et reçu avant de couper la réponse. Après rechargement et changement de version/affectations, le rejeu vérifie le contenu exact ; aucun paiement ou reçu supplémentaire. Un nouvel encaissement fonctionne ensuite. |
| TypeScript et build | Réussis ; avertissements existants concernant la taille des chunks et l'import du service vétérinaire. |
| Whitespace | `git diff --check` réussi. |
| PostgreSQL / Stripe effectif | Aucun nouveau test PostgreSQL ni appel réel Stripe dans ce correctif ; résultats historiques non requalifiés. |

Le premier lancement Chromium a été empêché par l'interdiction sandbox d'écouter sur loopback (`EPERM`). Le rejeu autorisé utilise uniquement le serveur local et des mocks. Aucun environnement distant n'est utilisé. Les SVG restent intacts et non suivis ; les artefacts `.tmp` restent ignorés.

Limites : persistance liée au navigateur et à son origine ; vider son stockage supprime la commande locale. Les commandes d'une identité sont résolues avant d'en soumettre d'autres ; une reprise dont les permissions ont disparu reste bloquée. La qualification intégrée Stripe réelle demeure incomplète, et les PDF/worker restent en 1C. Aucun changement aux migrations, aux documents contractuels approuvés ou aux writers legacy.
