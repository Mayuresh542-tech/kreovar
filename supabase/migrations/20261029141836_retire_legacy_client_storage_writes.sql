-- Retire direct browser writes to legacy buckets. All active application uploads
-- use authenticated server routes or scoped signed upload grants. Existing media,
-- owner read/delete policies and service-role render uploads remain intact.
drop policy if exists "VeeloX public media owner insert" on storage.objects;
drop policy if exists "VeeloX public media owner update" on storage.objects;
