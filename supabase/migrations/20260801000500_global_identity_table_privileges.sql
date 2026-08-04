-- Bloc 1 / F4-F6: permettre aux policies RLS d'arbitrer les opérations sur
-- les identités globales. Sans privilège de table, PostgreSQL refuse la requête
-- avant même d'évaluer les policies propriétaires/agents/plateforme.
-- Impact ShowScore: SS-T. Les lectures restent filtrées par les mêmes policies.

grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.horses to authenticated;
grant select, insert, update, delete on public.horse_contacts to authenticated;
grant select, insert, update, delete on public.contact_roles to authenticated;

notify pgrst, 'reload schema';
