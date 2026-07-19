drop index if exists public.kid_label_revisions_template_idx;

create index if not exists kid_attendances_child_label_revision_idx
  on public.kid_attendances (child_label_revision_id)
  where child_label_revision_id is not null;

create index if not exists kid_attendances_guardian_label_revision_idx
  on public.kid_attendances (guardian_label_revision_id)
  where guardian_label_revision_id is not null;
