-- Migration: Adicionar slug amigável para ministérios
-- Permite URLs como /ministerios/homens em vez de /ministerios/<uuid>

alter table public.ministries
  add column if not exists slug text;

-- Backfill slug para ministérios existentes
update public.ministries
set slug = case
  when id = '232f976e-c0e0-4788-9060-d721181d824a' then 'homens'
  else lower(
    regexp_replace(
      regexp_replace(
        translate(
          regexp_replace(
            name,
            '^(?:minist[eé]rio\s+(?:d[eoa]s?\s+)?|min\.?\s+(?:d[eoa]s?\s+)?)',
            '',
            'i'
          ),
          'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
          'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
        ),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      ),
      '^-+|-+$',
      '',
      'g'
    )
  )
end
where slug is null or slug = '';

-- Se ainda houver algum registro vazio após o tratamento, fallback
update public.ministries
set slug = 'ministerio-' || substring(id::text, 1, 8)
where slug is null or slug = '';

-- Desempata eventuais duplicatas no mesmo company_id
with ranked as (
  select id, slug,
    row_number() over (partition by company_id, slug order by created_at asc) as rn
  from public.ministries
  where deleted_at is null and slug is not null and slug <> ''
)
update public.ministries m
set slug = m.slug || '-' || ranked.rn
from ranked
where m.id = ranked.id and ranked.rn > 1;

alter table public.ministries drop constraint if exists ministries_slug_format;
alter table public.ministries add constraint ministries_slug_format check (slug is null or slug ~ '^[a-z0-9-]+$');

create unique index if not exists ministries_company_slug_unique
  on public.ministries(company_id, slug)
  where deleted_at is null;
