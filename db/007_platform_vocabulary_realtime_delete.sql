-- Preserve the full deleted row in Realtime events so every Cursos session can
-- remove the same normalized word immediately.

alter table public.platform_vocabulary replica identity full;
