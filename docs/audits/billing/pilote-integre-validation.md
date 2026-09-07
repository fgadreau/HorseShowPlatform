# Pilote fictif — qualification intégrée locale

Date : 7 septembre 2026. Branche : `feat/billing-pilot-integrated`.
Base approuvée : `89e0b02aea4b729b759c2ee21873267462d829ac`.
Version de code qualifiée : `70254240ecfa96b244861dc1a945f715e6300774`.

**Le parcours principal a fonctionné ensemble sur la pile persistante : interface HSP, PostgreSQL/Supabase local, Stripe sandbox réel, worker PDF et Supabase Storage privé réel.** Deux paiements de test, deux reçus, un compte fermé par le payeur et une seule facture finale. Ce constat remplace les limites de qualification locale Storage/Stripe des rapports précédents pour les scénarios précisément exécutés ici ; il ne qualifie aucun déploiement réel.

Les fichiers financiers portent « DÉMONSTRATION — sans valeur comptable ou fiscale ». Aucun argent réel, réservation réelle, migration distante, déploiement, fusion ou changement de PREPROD/PROD.

## 1. Pile identifiée et préservée

Worktree persistant : `/workspaces/HorseShowPlatform/.worktrees/billing-pilot`.

| Composant | État vérifié |
| --- | --- |
| Docker | Contexte Unix local ; projet `hsp-vet-local` ; réseau `supabase_network_hsp-vet-local` |
| PostgreSQL | `supabase_db_hsp-vet-local`, volume persistant, port 54322 |
| Supabase API / Auth / REST | `http://127.0.0.1:54321`, connexions réelles des utilisateurs fictifs |
| Données initiales | Deux associations de fixtures Phase 1, six logins `@example.test`, aucune adresse de login extérieure aux fixtures |
| Migrations | 142 avant préparation ; seules les cinq migrations approuvées `20260906000900` à `20260906001300` manquaient ; 147 après application locale |
| Sauvegarde préalable | `.tmp/billing-pilot/before-billing-migrations.dump`, ignorée, accès local restreint |
| Storage | Conteneur persistant `supabase_storage_hsp-vet-local`, image `storage-api:v1.60.0`, volume dédié ; bucket `billing-pdfs`, `public=false` |
| Paiements | Serveur local 54331 ; secrets uniquement dans `.env.billing.local` ignoré |
| Documents | Serveur local 54332 ; worker toutes les cinq secondes ; `.env.billing-pdf.local` ignoré |
| Interface | Vite 5173, proxies de même origine vers cette pile locale |
| Stripe | Sandbox Gadreau development ; clés test ; plateforme `acct_1U3ySLRrKNJAsFE9` |
| Connect | Express fictif `acct_1UCpl6RoCSKbyLSt`, `charges_enabled=true`, capacités `card_payments` et `transfers` actives ; `payouts_enabled=false` |
| Webhook | CLI officielle 1.50.10 ; secret annoncé par le listener comparé sans affichage au secret du serveur ; correspondance confirmée |

Aucune réinitialisation ni restauration n’a été effectuée. Le premier contrôle d’empreinte des contacts a détecté l’ajout de la colonne nullable `company_name` par 1A ; les anciennes colonnes ont ensuite été comparées à la sauvegarde et étaient identiques. La réexécution du préparateur n’a appliqué aucune migration supplémentaire. Les anciennes données métier n’ont pas été réconciliées ni converties. Une première insertion de fixture utilisant une colonne inexistante de `horses` a été annulée transactionnellement puis corrigée ; aucune migration antérieure n’a été modifiée.

L’association adoptée est uniquement `HSP DÉMONSTRATION — sans valeur comptable ou fiscale`. L’autre association servant aux refus d’accès est une fixture d’isolation, pas une autre association participante. La nouvelle fixture conserve la distinction login/profil/contact payeur/bénéficiaire/cheval.

## 2. Parcours principal réellement exécuté

Compte `DEMO-ACC-000001`, UUID `ae65f01d-2ea6-4efb-b8c1-4d1b66f40fcc`, devise CAD.

| Étape | Transport effectivement utilisé | Résultat |
| --- | --- | --- |
| Sept frais initiaux structurés | RPC authentifiées de la secrétaire sur Supabase local, pas un mock | Deux chevaux, deux blocs, classes L4/L2, juges par classe et une seule fois au bloc, stalle simulée, casquette |
| Consultation Mes comptes | Vraie interface et projection personnelle | 470,00 avant taxes + 23,50 de taxe fictive = 493,50 CAD |
| Premier paiement partiel | Payment Element / vraie carte Stripe de test 4242 | 200,00 ; un encaissement ; reçu `DEMO-RCPT-000001` ; solde 293,50 ; compte ouvert |
| Frais supplémentaire | Formulaire réel de la secrétaire | 10,00 + 0,50 ; total 504,00 ; solde 304,00 |
| Deuxième paiement | Payment Element / Stripe sandbox réel | 304,00 ; deuxième encaissement ; reçu `DEMO-RCPT-000002` ; solde zéro ; compte encore ouvert |
| Prêt à finaliser | Bouton réel de la secrétaire | Attestation des frais complets, sans facture automatique |
| Récapitulatif et fermeture | Dialogue réel du payeur et RPC distincte | Facture unique `DEMO-INV-000001`, UUID `0dae02d9-60b2-4da9-876b-9e9e21b1b14a` ; compte fermé |
| Documents | Worker Chromium, téléversements et téléchargements HTTP Supabase Storage réels | FR/EN disponibles ; téléchargement depuis l’interface et depuis le serveur documentaire |

Les frais initiaux utilisent `add_documented_billing_sale` avec des références structurées de bloc, occurrence, classe, cheval et réservation simulée. La saisie de ces métadonnées n’a pas été présentée comme un nouveau formulaire métier d’inscription. Le raccordement aux vraies inscriptions et réservations demeure exclu.

Concordance de la facture finale :

| Section / montant | CAD fictifs |
| --- | ---: |
| Bloc 12 / Great Holly Whiz — DEMO | 175,00 inscriptions + 20,00 juges = 195,00 |
| Bloc 13 / Demo Silver Star | 100,00 inscriptions + 30,00 juges au bloc = 130,00 |
| Sous-total inscriptions | 325,00 |
| Stalle simulée | 120,00 |
| Casquette et frais supplémentaire | 35,00 |
| Frais avant taxes | 480,00 |
| Taxe configurée DEMO ONLY, 5 % | 24,00 |
| Total / paiements reçus / solde | 504,00 / 504,00 / 0,00 |

Les sous-totaux visuels ne créent aucun frais supplémentaire. Les affectations du premier reçu totalisent 200,00 ; celles du second 304,00. L’encaissement Stripe et la facture restent deux opérations distinctes.

## 3. Reprises et permissions

Ces cas utilisent des comptes fictifs supplémentaires ; ils ne changent pas les deux paiements du compte principal.

| Cas | Exécution / injection | Résultat observé |
| --- | --- | --- |
| Carte refusée | Vraie carte test Stripe 0002, Payment Element | Aucun encaissement ni reçu ; tentative ensuite annulée explicitement côté serveur |
| Authentification supplémentaire | Vraie carte test Stripe 3220 et véritable fenêtre 3DS de test | État `requires_action`, rechargement, reprise du même Intent, défi Complete, confirmation serveur ; un paiement de 10 et un reçu |
| Annulation puis même montant | Vrais appels Stripe d’annulation, puis Payment Element | Tentative de 10 annulée sans paiement ; nouvelle clé et nouvel Intent de 10 ; un seul encaissement |
| Webhook retardé / retour absent | Paiement réel Stripe test avec `pm_card_visa` ; arrêt temporaire contrôlé de l’arbre du listener pour injecter le retard ; aucun retour navigateur | Stripe confirme, HSP demeure provisoirement incertain ; fermeture secrétaire refusée avec `BILLING_PENDING_PAYMENT` |
| Résolution et webhook rejoué | Résolution serveur répétée ; même véritable événement Stripe livré deux fois avec une signature locale valide recalculée | Un encaissement et un reçu ; listener repris ; aucune facture automatique |
| Signature invalide | Requête HTTP locale volontairement mal signée | `BILLING_WEBHOOK_SIGNATURE`, aucun événement ajouté |
| Réponse d’encaissement perdue | Encaissement manuel **fictif** réellement écrit ; seule sa réponse HTTP est supprimée ; ajout d’un frais puis rechargement | Rejeu vérifié du contenu et de la clé originaux malgré nouvelle version ; un paiement/un reçu ; paiement suivant possible sans doublon |
| Secrétaire ferme avant le payeur | Vraies RPC secrétaire intercalées avant l’envoi de la finalisation personnelle depuis l’interface | `BILLING_NOT_ADMISSIBLE` ; commande définitivement refusée libérée ; saisie possible sur un autre compte ; une facture |
| Panne documentaire | Vrai rendu/upload FR, erreur de rendu EN injectée ; délai de reprise ramené à zéro uniquement par l’adaptateur de test | Pièce financière conservée, état failed visible côté serveur |
| Deux workers après panne | Deux workers réels, deux appels concurrents de prise en charge, vrai Storage | Un completed et un not_claimed ; deux artefacts publiés FR/EN ; aucune nouvelle pièce ou numéro |
| Modification après émission | Renommage du contact d’une fixture dédiée | Instantané inchangé et PDF téléchargé strictement identique, SHA-256 vérifié |
| Autre payeur / autre association | Logins réels de fixtures non autorisées | 10 refus du serveur documentaire et 10 refus d’accès direct Storage, pour les cinq pièces du compte principal |
| Rechargement et mobile | Vraie application, URL directe puis rechargement et téléphone 390 × 844 | Compte et facture retrouvés ; liste et détail capturés ; dix téléchargements FR/EN depuis les boutons HSP |

À la dernière vérification : sept Intents Stripe de test au total pour les scénarios, cinq réussis et deux annulés ; neuf événements reçus et neuf traités, zéro en attente. Tous les objets vérifiés ont `livemode=false`, la devise CAD et la destination Connect attendue. Les retries observés n’ont créé aucun encaissement ou reçu en double.

Le retard de webhook, la réponse supprimée et la panne de rendu sont **injectés**. La base, les transactions, Stripe, les encaissements et Storage ne sont pas simulés dans ces essais. Les tests navigateur de régression ci-dessous ont, eux, des API et Stripe.js simulés.

## 4. Corrections livrées

1. **Chargement de l’identité** : Finance attend le profil ; Mes comptes est identifié par le profil plutôt que par l’association administrative sélectionnée. Une sélection d’association arrivée pendant une réponse Stripe ne détruit plus l’état du paiement. Régression sur la conservation de saisie ajoutée.
2. **Reprise Stripe** : `requires_action` utilise explicitement `stripe.handleNextAction` sur le même client secret après rechargement. `processing` vérifie seulement le serveur. Ces chemins ne confirment pas une deuxième carte et ne produisent pas de reçu avant confirmation serveur. Deux scénarios navigateur simulés ciblés ajoutés, plus le cas 3DS réellement exécuté.
3. **Protection de l’aperçu** : Vite refuse `**/.tmp/**` en conservant ses protections par défaut. Git ignore ne protège pas un fichier servi par HTTP : un canari non secret était accessible avant la correction ; ses quatre variantes d’URL sont désormais en 403. L’application reste en 200. Les PDF privés doivent passer par le serveur documentaire autorisé.
4. **Sondes reproductibles** : préparation locale gardée, fixtures séparées, parcours réel, vérifications Storage, reprise documentaire, listener à sortie expurgée, contrôle final et inspection des PDF.

Aucun service financier SQL, contrat approuvé, migration, règle de facturation métier, SVG ou configuration Stripe du worktree principal n’a été modifié. Les changements applicatifs de ce lot concernent `Dashboard.tsx`, `PaymentElement.tsx` et `vite.config.ts`, avec scripts/tests et ce rapport.

### Incidents du harnais et traçabilité

- Le lanceur Chromium initial désactivait la sécurité Web : Origin absent et refus local attendu. Le harnais intégré conserve désormais cette sécurité. La première tentative n’a pas été remplacée après les attentes navigateur.
- Le pays/code postal fictifs, les attentes d’activation des boutons, la langue système `en-US@posix` du navigateur et le libellé réel Complete du défi 3DS ont nécessité des corrections du harnais. Les échecs n’ont pas été comptés comme paiements réussis. La langue du navigateur est maintenant explicite (`fr-CA`).
- Une première injection via `route.fetch` a expiré sans encaissement. Elle a été remplacée par un transport local explicite ; le scénario a ensuite réussi. Le diagnostic brut de cet échec contenait un jeton de session **local fictif**. La seule session concernée a été révoquée. Les erreurs HTTP brutes ne sont plus sérialisées par le harnais. Aucune clé Stripe ni service-role n’a été affichée.
- Le test PDF lancé dans le sandbox shell restreint a été bloqué au démarrage de Chromium ; sa relance autorisée a réussi. Ne pas confondre cet échec d’environnement avec un test de rendu réussi.
- Une image raster de contrôle PDF.js omettait visuellement des éléments répétés pourtant présents dans le texte PDF. Les dix PDF téléchargés ont donc aussi été rendus indépendamment avec MuPDF pour la revue visuelle ; aucun document n’a été réécrit pour corriger une image de contrôle.

## 5. Résultats et commandes

Commandes depuis le worktree persistant. Les fichiers `.env*` mentionnés sont ignorés ; aucune valeur secrète ne doit être copiée dans un terminal partagé ou une conversation.

```sh
node scripts/billing/pilot-prepare-local.mjs
node scripts/billing/pilot-fixture-local.mjs
node --env-file=.env.billing.local server/billing/configure-test.mjs fa300000-0000-0000-0000-000000000001 acct_1UCpl6RoCSKbyLSt
node --env-file=.env.billing.local scripts/billing/pilot-integrated.mjs charges
node scripts/billing/pilot-browser.mjs pay 200
node --env-file=.env.billing.local scripts/billing/pilot-documents-local.mjs
node scripts/billing/pilot-browser.mjs admin-extra
node scripts/billing/pilot-browser.mjs pay 304
node scripts/billing/pilot-browser.mjs admin-ready
node scripts/billing/pilot-browser.mjs finalize
node --env-file=.env.billing.local scripts/billing/pilot-integrated.mjs check
node --env-file=.env.billing.local scripts/billing/pilot-documents-local.mjs
node scripts/billing/pilot-browser.mjs documents
node scripts/billing/pilot-inspect-pdfs.mjs
```

`inspect`, `pay 200`, `check` et les reprises d’authentification ont été exécutés plusieurs fois pendant le diagnostic, toujours en conservant l’Intent non résolu. Ne pas rejouer aveuglément les commandes de scénario sur un compte déjà finalisé. Le journal local conserve les clés des commandes de préparation ; les assertions finales établissent les nombres réellement obtenus.

```sh
node --env-file=.env.billing.local scripts/billing/pilot-cases-local.mjs cancel
node scripts/billing/pilot-browser.mjs pay 10 cancel
node --env-file=.env.billing.local scripts/billing/pilot-cases-local.mjs prepare decline
node scripts/billing/pilot-browser.mjs decline 10 decline
node --env-file=.env.billing.local scripts/billing/pilot-cases-local.mjs prepare authentication
node scripts/billing/pilot-browser.mjs authenticate 10 authentication
node scripts/billing/pilot-browser.mjs resume-auth 10 authentication
node --env-file=.env.billing.local scripts/billing/pilot-cases-local.mjs delayed
node --env-file=.env.billing.local scripts/billing/pilot-cases-local.mjs staff-prepare
node --env-file=.env.billing.local scripts/billing/pilot-browser.mjs staff-race 0 staff-first
node --env-file=.env.billing.local scripts/billing/pilot-cases-local.mjs prepare documents
node --env-file=.env.billing.local scripts/billing/pilot-document-retry-local.mjs
node --env-file=.env.billing.local scripts/billing/pilot-cases-local.mjs prepare manual-lost
node scripts/billing/pilot-browser.mjs manual-lost 0 manual-lost
node --env-file=.env.billing.local scripts/billing/pilot-cases-local.mjs cancel-declined
node scripts/billing/pilot-http-safety-local.mjs
node --env-file=.env.billing.local scripts/billing/pilot-final-check-local.mjs
npm run build
node --test scripts/billing/navigation.test.mjs scripts/billing/recovery.test.mjs scripts/billing/stripe-service.test.mjs scripts/billing/pdf-worker.test.mjs scripts/billing/pdf-render.test.mjs
node --test scripts/billing/stripe-service.test.mjs
node scripts/billing/finance-browser.mjs
node --check scripts/billing/pilot-browser.mjs
node --check scripts/billing/pilot-cases-local.mjs
node --check scripts/billing/pilot-document-retry-local.mjs
node --check scripts/billing/pilot-final-check-local.mjs
node --check scripts/billing/pilot-listener-local.mjs
git diff --check
```

| Vérification | Résultat final |
| --- | --- |
| Build | Réussi ; avertissement existant de taille de chunks |
| Ensemble Node tests | 87 réussis, 0 échec ; inclut le fichier de rendu à 76 contrôles |
| Stripe service seul | 20 réussis, 0 échec ; transport simulé, pas une preuve Stripe réelle |
| Navigateur de régression | 25 scénarios, `complete=true`, API/Stripe.js simulés |
| PDF réels téléchargés | 10 fichiers, 96 contrôles de contenu/concordance, `complete=true` |
| Téléchargements interface | 10 réussis depuis les boutons HSP, sans mock |
| Refus documentaires | 10 via serveur + 10 via Storage direct |
| Reprise documentaire réelle | 4 assertions de scénario réussies ; vraie panne injectée + vrai Storage |
| Protection HTTP locale | 4 canaris refusés ; application disponible |
| Vérification finale | `complete=true`, signature concordante, bucket privé, 2 paiements / 2 reçus / 1 facture principale |

Les suites SQL complètes 1A/1A.6, reconstruction vierge et réservations/nominations legacy restent celles du commit approuvé : elles n’ont pas été présentées comme rejouées ici. Aucune migration nouvelle ni modification du serveur SQL n’a été introduite dans ce lot. Les opérations intégrées ci-dessus ont réellement exercé PostgreSQL persistant et ses autorisations via Auth/REST.

Les résultats machine sont dans `.tmp/billing-pilot/` : `final-check.json`, `documents-result.json`, `document-retry-result.json`, `pdf-inspection.json`, `http-safety-result.json`, `services-qualified.log`, `build.log`. Les résultats du navigateur simulé sont dans `.tmp/billing-ui/results.json`. Le dossier entier reste exclu de Git et du serveur Vite ; ne pas partager ses fichiers de configuration, ses accès, sa sauvegarde ou ses journaux bruts.

## 6. Revue documentaire et visuelle

Cinq pièces logiques, dix PDF : relevé initial, reçu 1, reçu 2, relevé/récapitulatif confirmé du payeur, facture finale. Le récapitulatif est un deuxième relevé daté, **pas une deuxième facture**.

Les quatre pièces demandées sont fournies en FR/EN dans l’archive de revue ; le relevé de confirmation est fourni en supplément. Elles proviennent des octets réellement téléchargés depuis Storage, pas d’une régénération à partir des contacts courants. Les téléchargements effectués dans l’interface ont également été conservés pour comparaison.

Les vérifications visuelles portent sur les titres et numéros distincts, les regroupements cheval/bloc/occurrence, la ligne de juges au bloc non répétée par classe, les colonnes alignées, les réservations, les autres frais, les taxes, les affectations des reçus, la pagination et la bannière de démonstration. Les libellés métier saisis en français restent figés en français dans le PDF anglais ; les titres et formats du document sont traduits.

Point de revue non bloquant : le récapitulatif général se poursuit sur la deuxième page de la facture, avec en-tête répété et mention de continuation. Une version plus compacte pourrait être étudiée après la revue visuelle. La fixture d’association ne possède pas d’adresse postale ni de numéros fiscaux configurés ; aucun n’a été inventé. Les coordonnées et l’entreprise fictives du payeur sont présentes.

Archives ignorées préparées pour partage :

- `.tmp/billing-pilot/review/pdf-pilote-fictif-fr-en.zip` : dix PDF et manifeste de hachage ;
- `.tmp/billing-pilot/review/captures-pilote-fictif.zip` : captures interface et aperçus PDF MuPDF ;
- `.tmp/billing-pilot/review/qualification.diff` : diff complet depuis la base approuvée.

## 7. Rouvrir la démonstration

URL : `https://sturdy-sniffle-69vvp94vqvvx34jw6-5173.app.github.dev/me/accounts`.

Compte principal : `/me/accounts/ae65f01d-2ea6-4efb-b8c1-4d1b66f40fcc`.
Accès administratif au même compte : `/associations/fa300000-0000-0000-0000-000000000001/finance/accounts/ae65f01d-2ea6-4efb-b8c1-4d1b66f40fcc`.

| Rôle fictif | Login |
| --- | --- |
| Payeur | `phase1.org-a-owner@example.test` |
| Secrétaire | `phase1.org-a-secretary@example.test` |
| Administrateur | `phase1.org-a-admin@example.test` |
| Autre utilisateur sans droit payeur | `phase1.org-a-judge@example.test` |
| Autre association, fixture d’isolation | `phase1.org-b-admin@example.test` |

Les mots de passe ne sont pas publiés. Ils sont consultables uniquement dans le fichier local ignoré `.tmp/billing-pilot/access.local.json`. Le compte principal est fermé : il permet la consultation et le téléchargement, pas un nouveau paiement. Les autres comptes fictifs ouverts servent à examiner les états de reprise. Ne pas changer les identités pour contourner les permissions.

Les quatre services sont laissés actifs. Pour redémarrer **seulement un service arrêté**, depuis le worktree, dans des terminaux distincts :

```sh
node --env-file=.env.billing.local server/billing/local-server.mjs
node --env-file=.env.billing-pdf.local server/billing/document-server.mjs
node --env-file=.env.billing.local scripts/billing/pilot-listener-local.mjs
node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 --strictPort
```

Le serveur documentaire contient le worker périodique : ne pas lancer un worker supplémentaire par nécessité supposée. Le listener utilise la CLI installée dans `.tmp/billing-pilot/stripe-cli` ; sa clé est passée en environnement, jamais en argument. Il compare son secret annoncé et masque sa sortie. Une panne ou un changement de signature doit être résolu sans copier de secret dans la conversation. Ne pas démarrer une nouvelle pile Supabase à la place de celle-ci et ne lancer aucun reset.

## 8. Limites et suite

- Qualification **locale fictive**, pas une approbation de déploiement réel. Les secrets live et les paiements réels restent interdits.
- Connect Express n’est pas entièrement qualifié pour des virements : payouts désactivés et vérifications d’onboarding encore présentes. Aucun document réel d’identité ou d’entreprise n’est demandé par ce test.
- Les remboursements, rétrofacturations, frais commerciaux définitifs, litiges, réservations réelles et migration historique ne sont pas qualifiés.
- La reprise `processing` est couverte par les tests simulés et les verrous SQL déjà approuvés ; le retard réellement injecté porte sur la livraison webhook d’un paiement carte déjà réussi chez Stripe, pas sur un moyen de paiement bancaire réellement asynchrone.
- La revue visuelle indépendante de ces PDF reste à approuver. Les anciens rapports et les documents contractuels restent inchangés.
- Les permissions de la démonstration ne doivent pas servir de modèle de données réelles. Les fixtures supplémentaires ne sont pas une extension du périmètre commercial.
- Aucune configuration Stripe, SVG ou travail parallèle du worktree principal n’a été ajouté aux commits. Les artefacts, accès, logs, sauvegardes et PDF restent hors Git. Aucun push forcé, PR, fusion, migration distante ou déploiement.
