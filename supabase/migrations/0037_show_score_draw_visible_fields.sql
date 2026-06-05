alter table public.show_score_publication_states
alter column visible_fields
set default '["draw","backNumber","rider","horse","owner","divisionNames","scoreTotal","status"]'::jsonb;

update public.show_score_publication_states
set visible_fields = visible_fields || '["divisionNames"]'::jsonb
where not (visible_fields ? 'divisionNames');
