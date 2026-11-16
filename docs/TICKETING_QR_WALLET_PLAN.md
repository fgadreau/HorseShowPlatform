# Billetterie avec QR PDF courriel et Apple Wallet

Statut : plan conservé le 16 novembre 2026. Implémentation différée à la demande de l’utilisateur. Aucune autorisation de démarrer ou de déployer cette fonctionnalité n’est donnée par ce document.

## Fonctionnement retenu

- Un billet individuel par place achetée : quatre places produisent quatre billets et quatre QR uniques.
- Les billets deviennent utilisables après confirmation du paiement complet de la commande, par Stripe ou par encaissement manuel confirmé au secrétariat. Les billets gratuits deviennent utilisables immédiatement.
- Billets consultables dans HSP, téléchargeables individuellement en PDF ou regroupés dans un PDF de commande.
- Ajout individuel à Apple Wallet avec un fichier `.pkpass` signé.
- Le PDF et le passe Wallet utilisent le même identifiant de billet : une entrée validée avec l’un empêche une seconde entrée avec l’autre.
- Lecteur au secrétariat dans HSP, avec caméra de téléphone ou tablette. Connexion Internet requise pour la première version.

## Envoi par courriel après paiement

Après confirmation du paiement complet, envoyer automatiquement les billets à l’adresse courriel de l’acheteur. Le message contient les PDF et les liens pour ajouter les billets à Apple Wallet.

Utiliser une file d’envoi durable avec déduplication, reprises après échec et historique. Une confirmation de paiement répétée ne doit pas déclencher plusieurs envois initiaux. Prévoir une action autorisée « Renvoyer les billets » au secrétariat, elle aussi tracée.

Lors de la réalisation, préciser le traitement des billets gratuits, d’une adresse absente ou invalide, des grosses commandes et d’une annulation pendant qu’un envoi attend son traitement. Un échec de courriel ne doit pas empêcher l’accès aux billets dans HSP.

## Affichage lors du scan

Après lecture et validation du QR, afficher au personnel autorisé :

- Le nom de la personne qui a réservé, soit l’acheteur de la commande.
- L’événement, le type et le numéro du billet.
- Le résultat : entrée acceptée, déjà utilisé, annulé, paiement insuffisant, autre événement ou QR inconnu.
- La date et l’heure du premier passage lorsqu’il est déjà utilisé.

Pour plusieurs places achetées dans une commande, chaque billet affiche le nom de cet acheteur. Aucune attribution obligatoire d’un nom distinct à chaque accompagnateur n’est prévue.

Ne placer aucun renseignement personnel dans le QR. Une coupure de connexion doit afficher une validation non confirmée, sans accepter silencieusement l’entrée.

## Base technique existante

- `src/features/tickets/TicketsView.tsx` : achat, commandes, rapports et annulations.
- `src/features/tickets/ticketService.ts` : types, statuts, appels RPC et exports.
- `supabase/migrations/20261116050953_event_ticketing.sql` : commandes et lignes de quantités, capacités, facturation et permissions.
- `supabase/migrations/20261116051043_ticket_billing_labels.sql` : libellés et annulation complète de commande.
- `server/billing/invoice-pdf.mjs` : moteur de génération PDF à réutiliser avec un modèle de billet distinct.
- Dépendances `qrcode` et `jsqr` déjà présentes. Aucun lecteur de caméra propre à la billetterie ni passe Apple Wallet n’existe à la date du plan.

La règle de paiement actuelle de `ticket_order_json` utilise les paiements affectés aux frais de la commande. Le solde global du client ne suffit pas pour autoriser l’entrée. La nouvelle règle devra aussi distinguer un remboursement de place annulée d’un ajustement de prix qui conserve le droit d’entrée.

## Lots proposés

1. **Billets individuels et droits d’entrée** : table proposée `ticket_passes`, un enregistrement par place, génération idempotente, version révocable du QR, contrôles acheteur et personnel. Préserver les commandes et paiements existants; définir la reprise des anciennes commandes.
2. **PDF et accès client** : affichage du QR, téléchargement individuel et groupé, numéro lisible et informations d’événement. Un nouveau téléchargement conserve l’identifiant.
3. **Contrôle des entrées** : écran de scan par événement, nom de l’acheteur, résultats explicites, validation atomique PostgreSQL, recherche manuelle et correction administrative avec motif et historique.
4. **Annulations et remboursements** : invalider les billets concernés, conserver les passages déjà effectués, encadrer les annulations de billets utilisés et relier les remboursements partiels aux places annulées ou aux ajustements de prix. Ne pas libérer automatiquement une place déjà consommée.
5. **Courriels** : déclenchement après paiement confirmé, PDF et liens Wallet, file durable, déduplication, suivi des erreurs et renvoi manuel.
6. **Apple Wallet** : génération serveur des passes signés, bouton d’ajout, même billet et QR que le PDF, français et anglais. Concevoir les identifiants pour les mises à jour futures.
7. **Qualification en préproduction** : tests métier, concurrence, droits d’accès, PDF, courriels, caméras iPhone et Android et ajout réel sur iPhone.

Les lots PDF et contrôle d’entrée peuvent être qualifiés avant Wallet. La livraison complète inclut le courriel automatique et Wallet; l’ordre de mise en service reste à décider au lancement.

## Prérequis Apple

Compte Apple Developer, Pass Type ID, certificat de signature, clé privée protégée côté serveur et ressources graphiques. La distribution depuis HSP ne nécessite pas d’application iPhone dédiée.

Les mises à jour automatiques du visuel Wallet après changement d’horaire, annulation ou utilisation constituent une extension, avec service de mise à jour et notifications Apple. Le serveur HSP doit vérifier l’état réel à chaque scan même si le visuel Wallet n’a pas été actualisé.

Références officielles :

- [Distribution des passes](https://developer.apple.com/documentation/walletpasses/distributing-and-updating-a-pass)
- [Création et signature](https://developer.apple.com/documentation/walletpasses/building-a-pass)
- [Identifiants et certificats](https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates)
- [Service de mise à jour](https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes)

## Critères de validation

- Quatre places donnent exactement quatre billets, même après une reprise.
- Un billet impayé ou annulé est refusé; un paiement manuel confirmé est reconnu.
- Deux scans simultanés ne produisent qu’une entrée acceptée.
- Scanner le PDF rend également le passe Wallet utilisé.
- Le personnel voit le nom de l’acheteur pour chaque billet de sa commande.
- Les téléchargements et recherches respectent les accès de chaque association et acheteur.
- Un remboursement pour ajustement de prix ne supprime pas arbitrairement le droit d’entrée.
- Le courriel initial est envoyé après paiement, avec PDF et liens Wallet, sans doublon lors d’une reprise.
- Un échec d’envoi reste visible et peut être repris; les renvois sont tracés.
- Le passe s’ajoute à Wallet sur un iPhone; le lecteur fonctionne sur iPhone et Android.

## Décisions à préciser au démarrage

Gestion des commandes partiellement payées, annulation individuelle, réémission d’un billet perdu, éventuelle réentrée, plages de validité, délégation du contrôle d’entrée et traitement des commandes volumineuses. Le transfert officiel de propriété d’un billet et la validation hors connexion ne font pas partie de la première version proposée.
