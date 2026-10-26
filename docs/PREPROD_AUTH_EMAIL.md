# Confirmation de compte HSP en préproduction

## État

Configuration cible et modèle versionnés. Leur présence dans GitHub ne modifie
pas les réglages du projet Supabase hébergé. L'application distante et la
validation par un nouveau courriel restent à effectuer.

Projet concerné : **Horse Show Platform PREPROD** (`qaguotdproxamgudnnsd`).
Site HSP : **https://preprod.horseshowplatform.com**.

## Retour après vérification

Dans [Authentication → URL Configuration](https://supabase.com/dashboard/project/qaguotdproxamgudnnsd/auth/url-configuration) :

- `Site URL` : `https://preprod.horseshowplatform.com`
- Ajouter `https://preprod.horseshowplatform.com` et
  `https://preprod.horseshowplatform.com/**` aux `Redirect URLs`.
- Conserver les destinations ShowScore déjà nécessaires au projet partagé.
  Ne pas remplacer toute la liste par les seules destinations HSP.

L'inscription HSP fournit déjà `window.location.origin` à `emailRedirectTo`.
La destination doit être autorisée côté Supabase. Un retour vers `localhost`
après activation du compte est compatible avec une mauvaise configuration de
redirection ; les réglages distants doivent être inspectés pour confirmer la cause.

## Envoi par Resend

Dans Resend, vérifier que **horseshowplatform.com** est validé pour l'envoi,
avec les enregistrements DNS demandés par Resend. Si seul un sous-domaine a été
validé, il ne suffit pas à autoriser l'adresse proposée ci-dessous.

Configurer le SMTP personnalisé de **Supabase PREPROD** :

| Réglage | Valeur |
| --- | --- |
| Sender email | `noreply@horseshowplatform.com` |
| Sender name | `HorseShowPlatform — Préprod` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Clé API Resend autorisée à envoyer depuis ce domaine |

Garder la confirmation de courriel activée. Désactiver le suivi des liens Resend
pour les courriels Auth, afin de ne pas réécrire les liens de vérification.
Vérifier les limites d'envoi Supabase et Resend avant les invitations externes.

Les réglages SMTP et le nom d'expéditeur concernent tous les courriels Auth du
projet PREPROD partagé, y compris ceux initiés depuis ShowScore. Ils ne changent
pas les courriels envoyés directement par les Edge Functions via l'API Resend.
La fonction historique `send-invitation-email` conserve sa propre identité
ShowScore ; ce flux est distinct de la confirmation de compte traitée ici.

Ne pas placer la clé Resend dans une variable `VITE_*`, dans ce document ou dans
Git. La configurer directement dans Supabase ou via un gestionnaire de secrets.

## Modèle de confirmation

Dans Authentication → Email → Templates → Confirm signup :

- Sujet : `Confirme ton adresse courriel — HSP Préprod`
- Corps HTML : contenu de
  [`supabase/templates/preprod-confirm-signup.html`](../supabase/templates/preprod-confirm-signup.html).

Conserver `{{ .ConfirmationURL }}` dans le bouton et le lien alternatif : ce lien
fait vérifier le jeton par Supabase avant le retour sur l'application. Un lien
direct vers la page d'accueil ne vérifie pas le courriel.

Ce modèle est réservé à PREPROD et s'applique à la confirmation de compte du
projet partagé. Ne pas le copier tel quel en production.

## Validation du parcours

1. Créer un nouveau compte de test depuis `https://preprod.horseshowplatform.com`.
2. Vérifier l'expéditeur HSP, la mention préproduction et la réception du message
   dans une boîte externe à l'équipe Supabase.
3. Cliquer sur le lien du **nouveau** courriel, puis vérifier le retour sur
   `https://preprod.horseshowplatform.com`, sans passage vers `localhost`.
4. Vérifier que le courriel est confirmé dans Supabase et que le compte permet
   de se connecter et d'accéder au parcours participant.
5. Vérifier aussi le retour après confirmation d'une inscription depuis ShowScore,
   puisque le projet Auth est partagé.

Un ancien courriel peut conserver son ancienne destination ou avoir déjà été
consommé ; il ne valide pas la nouvelle configuration. Ne pas publier de lien
de vérification complet dans GitHub : il contient un jeton d'authentification.

## Références

- [Supabase : destinations de redirection](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase : SMTP personnalisé](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend : SMTP avec Supabase](https://resend.com/docs/send-with-supabase-smtp)
- [Supabase : modèles de courriels](https://supabase.com/docs/guides/auth/auth-email-templates)
