-- Allow workbook-backed course vocabulary while retaining the legacy value.
alter table if exists lexical_items
  drop constraint if exists lexical_items_source_type_check;

alter table if exists lexical_items
  add constraint lexical_items_source_type_check
  check (source_type in ('course', 'dli', 'system_advanced', 'user'));
