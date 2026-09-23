-- Private program PDFs. Apply before deploying the storage-backed generator.
-- No client-facing storage policies: files are served only through authenticated
-- Coach OS routes after checking program ownership/status via public.programs RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ims-program-pdfs', 'ims-program-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
