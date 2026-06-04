# Draw Test Program

Ce fichier garde la procedure pour tester les ordres de passage avec beaucoup d'inscriptions.

## Test automatique

Le test TypeScript ne touche pas a Supabase. Il genere un gros programme en memoire et valide directement l'algorithme `buildShowScoreRunsForClass`.

```bash
npm run test:draw
```

Ce qui est valide:

- 45 runs dans une grosse classe.
- 3 late entries placees au debut avec des draws negatifs.
- Les draws reguliers commencent a 1 et restent sequentiels.
- Les entries cancelled/scratched ne deviennent pas des runs.
- Aucun cheval n'est inscrit deux fois dans la meme classe.
- Aucun cavalier n'a plus de trois inscriptions dans une division.
- Dans le cas faisable, le meme cavalier a au moins 8 chevaux entre ses passages.
- Un cas court volontairement impossible garde toutes les inscriptions et expose l'ecart compresse.

## Seed local Supabase

Le seed local cree un show complet visible dans l'app:

- Show: `Draw Test Mega Classic`
- Classe `Draw Test 1100 Open`: 45 inscriptions actives, dont 3 late.
- Classe `Draw Test Mixed Non Pro`: 32 inscriptions actives, dont 2 late.
- Classe `Draw Test Short Edge`: 7 inscriptions actives, cas volontairement trop court pour garantir 8 chevaux entre toutes les repetitions.

Commande:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/seed_draw_test_program.sql
```

Le seed suppose que les migrations sont appliquees et que `supabase/seed.sql` a deja cree `Phase 1 Association A`.

## Verification dans l'app

1. Se connecter avec `phase1.org-a-secretary@example.test`.
2. Aller dans `Scoring`.
3. Selectionner `Draw Test Mega Classic`.
4. Cliquer `Sortir ordre` sur les classes de test.
5. Verifier que les late entries apparaissent en draws negatifs au debut, puis les draws reguliers commencent a 1.

La publication automatique n'est pas attendue: le cutoff rend l'action possible, mais le gestionnaire sort l'ordre manuellement.
