# Inscriptions, annulations et contexte actif

## Règles appliquées

- Le contexte actif affiche l’association et le concours dans l’en-tête. La sélection propose une recherche, les dates, le lieu et un repère de sélection. Les droits et les routes canoniques existants restent l’autorité.
- Les paramètres du concours sont accessibles directement dans l’en-tête de chaque section. Le mode d’inscription actif est affiché avec un raccourci de modification; la fenêtre ouvre les inscriptions et paiements en premier. Le même accès est proposé dans la liste des concours.
- Une soumission en gestion manuelle devient active immédiatement, même sans paiement. Une ancienne inscription brouillon doit encore être confirmée.
- En mode carte, une inscription soumise attend une préautorisation vérifiée ou un paiement reçu et alloué. Une confirmation du navigateur ou une simple case de consentement ne suffit pas.
- Une inscription entièrement gratuite devient active dès confirmation si aucun autre frais du compte n’est dû. Les frais annexes sont pris en compte.
- Les inscriptions en attente de confirmation financière et les demandes d’annulation en attente bloquent le draw du bloc concerné. Les autres blocs restent disponibles.
- Le bloc est l’unité de draw : une demande pour une classe touche cette classe; une demande de bloc touche les classes de cette équipe cheval/cavalier/payeur dans le bloc.
- Une demande ne change pas le statut de l’inscription. Le participant peut la retirer; la secrétaire peut la refuser ou l’approuver individuellement.
- Le secrétariat peut aussi annuler directement une classe ou un bloc, avec choix du crédit et des frais. L’aperçu ne crée aucune demande en attente; la confirmation applique l’annulation et ses ajustements dans une seule transaction. Une demande du participant déjà en attente reste à traiter individuellement.
- Dès la génération du draw, même non publié, il faut un scratch. Les nouveaux ajouts suivent les règles et les frais d’ajout tardif existants.

## Ajustements financiers

Le traitement exige un compte ouvert du concours, déjà configuré dans le moteur de comptes. Aucun ancien compte n’est importé automatiquement et aucune facture figée n’est modifiée.

L’approbation recalcule les frais des classes retirées et le changement du frais de juge partagé, selon la sélection existante de la classe au prix d’inscription le plus élevé. Les autres frais indépendants, notamment le dossard, restent régis par leurs règles existantes.

Le crédit peut être nul, total ou personnalisé. Les frais d’annulation sont un montant libre distinct, dont zéro. La secrétaire calcule manuellement une proportion si elle le souhaite. Le crédit partiel conserve les taxes historiques des frais libérés; les nouveaux frais utilisent la configuration fiscale du compte. L’aperçu et l’approbation emploient le même calcul serveur et une signature du devis pour refuser une confirmation périmée.

Les crédits et frais libres demandent « avant taxes » ou « taxes incluses ». Ce choix est également proposé pour les ventes manuelles et les ajustements libres du prix d’inscription. Les prix unitaires sont normalisés avant taxes, puis les taxes sont calculées par ligne selon le fonctionnement existant; la saisie originale est conservée pour audit. Un paiement reçu reste le montant réellement encaissé.

Une annulation porte ses ajustements au compte. Elle ne modifie pas les paiements reçus, ne capture pas une préautorisation et ne déclenche aucun remboursement Stripe. Un crédit excédentaire demeure à traiter lors de la fermeture du compte.

## Préautorisation Stripe

Le flux conserve le moment configuré : l’action de préautorisation est disponible manuellement ou à partir du début du concours, avec l’heure et le fuseau du concours. La marge configurée est conservée. Cette évolution n’ajoute pas de tâche planifiée de prélèvement hors session ni d’enregistrement automatique de carte.

Une préautorisation `requires_capture` vérifiée active les inscriptions couvertes sans créer de paiement ou de reçu. L’encaissement est une action explicite distincte sur le solde courant, accessible au payeur et au secrétariat autorisé. Les reprises utilisent une clé stable et un montant de capture figé côté serveur. Les nouvelles opérations restent limitées à l’intégration Stripe TEST existante.

## Vérifications locales

```sh
npm run test:entry-lifecycle:sql
npm run test:entry-lifecycle:browser
npm run test:show-settings:browser
node scripts/entry-submit.browser.mjs
node scripts/billing/finance-browser.mjs
node --test scripts/billing/recovery.test.mjs scripts/billing/presentation.test.mjs scripts/billing/navigation.test.mjs scripts/billing/stripe-service.test.mjs
npm run build
```

Le test SQL utilise exclusivement un nouveau projet Docker local jetable, rejoue toutes les migrations, teste les permissions réelles, les calculs, les comptes payés et fermés, la gratuité et les courses entre annulation et draw. Il n’accepte aucune connexion distante. Le navigateur utilise des réponses simulées, bloque les appels externes et produit des captures dans `.tmp/entry-lifecycle-ui`. Ces vérifications ne remplacent pas un paiement et une préautorisation réels dans le sandbox Stripe de préproduction.
