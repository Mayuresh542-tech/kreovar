-- Keep existing objects in place; require owner authorization for every legacy bucket.
update storage.buckets set public=false where id in ('videos','voiceovers','images');
drop policy if exists "Public Access videos" on storage.objects;
drop policy if exists "Public Access voiceovers" on storage.objects;
drop policy if exists "Give users authenticated access to folder 1a81anh_0" on storage.objects;
drop policy if exists "Give users authenticated access to folder 1livt5k_0" on storage.objects;
drop policy if exists "VeeloX public media owner read" on storage.objects;
create policy "Kreovar legacy media owner read" on storage.objects for select to authenticated
using (bucket_id in ('videos','voiceovers','images') and
 (owner_id=(select auth.uid())::text or
 (owner_id is null and (starts_with(name,(select auth.uid())::text||'/') or starts_with(name,(select auth.uid())::text||'_'))) or
 (bucket_id='videos' and exists(select 1 from public.render_jobs j where j.user_id=(select auth.uid()) and storage.objects.name='rendered/'||j.id::text||'.mp4'))));
