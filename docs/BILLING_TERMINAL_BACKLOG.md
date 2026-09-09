# Stripe Terminal — chantier futur, non implanté

Ce chantier ne met en place aucun appel Terminal et ne suppose aucun transfert Stripe Connect effectif. Le matériel envisagé comprend le **Stripe Reader S710** et possiblement **Tap to Pay**; compatibilité, disponibilité et conditions devront être vérifiées au démarrage du chantier.

- Enregistrer les lecteurs et les emplacements, et gérer leur cycle de vie.
- Associer les emplacements et paiements au compte Stripe Connect de l’association, après qualification de l’intégration Connect.
- Créer et traiter les PaymentIntent Terminal; séparer automatiquement les frais HSP selon le modèle Connect retenu et testé.
- Confirmer exclusivement les encaissements par webhooks vérifiés, avec états en attente, accepté, refusé et annulé.
- Réutiliser les réservations de solde, clés d’idempotence et reçus numérotés du même Compte du concours; tester les doublons de requêtes et de webhooks.
- Couvrir les remboursements et contestations, les écritures correctrices et la répartition entre fournisseurs, sans réécrire les factures finales.
- Reprendre après interruption réseau, redémarrage du poste, perte de réponse ou déconnexion du lecteur; réconcilier avec Stripe avant une nouvelle tentative.
- Tester avec le lecteur simulé Stripe, puis qualifier le matériel et Tap to Pay séparément.
- Inclure ces paiements dans le total, le solde, l’historique et les mêmes reçus du compte; ne jamais ajouter de nouveau frais HSP lors d’un paiement supplémentaire.
- Attribuer proportionnellement les frais de traitement, distincts du montant commercial HSP. Vérifier les arrondis et la réconciliation avec les frais réellement rapportés par Stripe.

Critère de sortie : scénarios de concurrence, interruption, paiement partiel, paiement multicanal, remboursement et contestation validés de bout en bout en environnement de test avant toute proposition d’activation réelle.
