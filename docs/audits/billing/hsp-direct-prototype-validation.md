# Prototype HSP direct charges — validation en cours

Base approuvée : `f3a92678926d976d333a04be68dcbb7b3d307c3a`.
Branche : `feat/billing-hsp-direct-prototype`.
Worktree persistant : `.worktrees/billing-hsp-direct`.

## Sauvegarde incomplète — 7 septembre 2026

Ce commit est une sauvegarde de travail, **pas un lot qualifié pour approbation finale**. Le modèle fiscal reste fictif et non validé pour l’usage réel. Aucun abonnement ou prélèvement périodique n’est ajouté.

Travail présent : deux migrations additives non appliquées à la pile persistante, devis avant engagement, frais HSP atomiques et uniques, fournisseurs figés, branchement direct/destination par tentative, récupération HSP, détection d’anomalies fournisseur, premier relevé administratif, confirmation UI et adaptation PDF. Des cas limites, tests ciblés et parcours intégrés restent à compléter.

## Résultats réellement exécutés sur cette sauvegarde

- `node scripts/billing/hsp-server-test.mjs` : clone PostgreSQL jetable ; 22 assertions, 4 rejets attendus. Objets fournisseur **simulés**, transactions PostgreSQL réelles. Aucune preuve de paiement Stripe réel dans cette suite.
- `node scripts/billing/test-sql-local.mjs --fresh` : reconstruction vierge complète, `complete=true`, 219 assertions SQL et 96 rejets attendus ; régressions réservations/nominations et courses PostgreSQL existantes ; publication documentaire testée avec adaptateur filesystem privé, **pas Supabase Storage réel pour cette version**.
- `node scripts/billing/test-sql-local.mjs` : première exécution clone partielle ; la suite ancienne refuse les capacités déjà activées dans le pilote persistant. Cette hypothèse doit encore être adaptée sans effacer les anciennes fixtures. La suite ciblée HSP utilise un clone de cette même pile et réussit.
- `node --test scripts/billing/stripe-service.test.mjs` : 1 test réussi (fournisseur simulé).
- `node --test scripts/billing/pdf-render.test.mjs scripts/billing/pdf-worker.test.mjs scripts/billing/recovery.test.mjs` : 56 tests réussis avec Chromium local après autorisation système ; le premier démarrage sous sandbox restreint avait échoué. Les PDF à deux fournisseurs doivent encore recevoir des tests et une inspection propres.
- `npm run build` : réussi avant le dernier ajout du composant de relevé administratif ; build final à rejouer. Avertissement habituel sur la taille des chunks.
- `node --check` sur Stripe, PDF et le nouveau lanceur ; `git diff --check` : réussis.

## Sandbox et limites

Un nouveau compte connecté fictif a été réellement créé dans le sandbox : `acct_1UCs8m2NaiSJaBMx`, plateforme `acct_1U3ySLRrKNJAsFE9`. La lecture a confirmé `fees.payer=account`, `losses.payments=stripe`, Dashboard `full`. À cette lecture, paiements et versements non activés ; onboarding en cours côté utilisateur. Aucun compte qualifié antérieur n’a été reconfiguré.

Aucun paiement réel ou test de paiement direct intégré n’a encore été exécuté pour cette version. Les nouvelles migrations n’ont été appliquées qu’aux environnements jetables. Aucun reset, migration distante, changement PREPROD/PROD, fusion ou déploiement. Configurations Stripe et SVG préservés.

Reste notamment à qualifier : concurrence des premières opérations adoptées, réponses perdues, permissions détaillées, calcul du relevé et ventilation des encaissements partiels, reprise après preuve d’application fee retardée, remboursements externes, totalité de l’interface, PDF FR/EN et Storage réel. Le reversement hors Stripe et les remboursements commerciaux restent bloqués/non proposés tant que leurs règles ne sont pas décidées.

## Incident de ressources local

À la demande de l’utilisateur, diagnostic CPU sans arrêt de la base : deux anciennes sessions PostgREST d’encaissement (`10918`, `11783`), actives depuis plus d’une heure, occupaient l’essentiel du CPU. Annulation ciblée puis terminaison de la session restante avec les fonctions PostgreSQL ; aucune suppression de données validées. Après intervention : aucune des deux sessions restante, aucune requête active de plus d’une minute, CPU mesuré à 31,6 % sur quatre secondes. Pas de garantie sur la disponibilité future du Codespace ; validations lourdes désormais séquentielles et sauvegarde distante du travail incomplet.

## Déblocage de l’onboarding — vérification effective

Compte existant uniquement : `acct_1UCs8m2NaiSJaBMx`, type Standard, Dashboard complet, `fees.payer=account`, `losses.payments=stripe`, collecte des exigences par Stripe. GET réel : courriel absent, conditions non acceptées, `requirements.past_due`, paiements/versements désactivés. Champs exigés : `business_profile.support_phone`, `business_profile.url`, `external_account`, `tos_acceptance.date`, `tos_acceptance.ip`. Aucune modification de ces propriétés dans cette intervention.

POST réel `/v1/account_links` avec `type=account_onboarding` accepté sur cet identifiant. Aucun appel de création de compte, aucune acceptation des conditions. Le lien à usage unique n’est ni publié ni stocké dans Git. `account_update` et le lien Dashboard de remédiation ne sont pas utilisés.

Un serveur local séparé (`54333`) et une page HSP de développement (`5174/billing-onboarding.html`) authentifient le login Supabase local et imposent `is_platform_admin()` côté serveur avant de fournir un Account Link. Le navigateur ne choisit ni compte, ni plateforme, ni URLs de retour. Un retour relit les exigences ; une expiration passe par HSP authentifié pour générer un nouveau lien. Les configurations ignorées pointent uniquement le compte fictif existant. Cette page locale requiert Vite, ne constitue pas un déploiement.

Tests exécutés : `node --test scripts/billing/onboarding.test.mjs` (2 tests réussis, fournisseur simulé : administrateur autorisé, non-administrateur refusé avant appel Stripe, responsabilités incompatibles refusées) ; POST anonyme local refusé ; navigateur réel connecté comme administrateur HSP fictif, GET des exigences Stripe puis POST Account Link et redirection effective. Première tentative navigateur échouée car l’outil désactivait la sécurité web et omettait Origin ; vérification réussie avec les protections navigateur activées. Aucun affaiblissement du contrôle d’origine serveur.

Écran Stripe réellement observé : « Get started with Stripe », compte de test, demande d’adresse courriel, possibilité affichée de réutiliser le courriel d’un utilisateur Stripe existant. Aucun `/no_access/`. Test arrêté avant saisie de courriel, création/authentification d’identité Stripe, ou acceptation. Le propriétaire doit continuer personnellement avec un courriel contrôlé et effectuer la vérification/connexion demandée par Stripe. Le lien est attaché au compte existant, pas un nouvel appel de création Connect. L’activation finale reste à constater par lecture serveur après ce parcours.

Références : [Stripe — onboarding hébergé](https://docs.stripe.com/connect/hosted-onboarding), [onboarding des comptes Standard](https://docs.stripe.com/connect/standard-accounts). Captures locales ignorées : `.tmp/hsp-direct/onboarding-hsp.png`, `.tmp/hsp-direct/onboarding-stripe.png`. Aucun secret publié ; aucun paiement ni migration dans ce lot.
