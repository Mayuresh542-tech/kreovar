-- Add text documents without deleting assets, changing ownership, or widening access.
begin;
alter table public.studio_assets add constraint studio_assets_kind_extended_check check(kind in ('video','image','audio','caption','document')) not valid;
alter table public.studio_assets drop constraint studio_assets_kind_check;
alter table public.studio_assets validate constraint studio_assets_kind_extended_check;
alter table public.studio_assets rename constraint studio_assets_kind_extended_check to studio_assets_kind_check;
commit;
