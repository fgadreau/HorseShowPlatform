Les paiements et PDF de facturation dépendent encore des serveurs locaux et de Codespaces. Ce candidat prépare des routes Vercel limitées à PREPROD et à un contexte fictif, une réception Stripe sandbox durable avec secrets plateforme/Connect distincts, et des workers bornés déclenchables par Supabase Cron.

Les mécanismes financiers existants sont réutilisés. Une migration opérationnelle additive apporte l'inbox et les baux globaux ; aucune pièce, taxe, affectation, règle HSP ou version de rendu historique n'est modifiée. La branche dédiée désactive son auto-déploiement Vercel.

Validation locale : builds local/staging réussis ; suite billing 118 tests réussis puis ciblage hosted étendu 12/12 ; 155 migrations rejouées dans une nouvelle instance locale, 219 assertions SQL et 96 rejets attendus ; handlers signés et concurrence vérifiés avec PostgreSQL réel, PDF FR/EN générés avec Chromium. Stripe et le transport Storage restent simulés dans ces tests ; le packaging NFT est une estimation locale.

Voir [le rapport et protocole d'essai](preprod-hosted-candidate-2026-09-08.md) et les scripts d'inventaire/planification. L'état SQL/Storage distant et Fluid Compute restent à confirmer. Hobby est rapporté par le propriétaire. Aucune migration distante, activation payante ou modification de secret/protection effectuée.

PR à maintenir en brouillon, sans fusion ni déploiement avant autorisation explicite de l'essai hébergé. **Ne créer cette PR qu'après confirmation que l'intégration Supabase ne créera pas automatiquement une branche avec migrations.**
