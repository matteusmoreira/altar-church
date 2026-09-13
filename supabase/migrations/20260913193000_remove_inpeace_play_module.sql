-- Migration: Remover módulo InPeace Play e tabelas associadas

-- 1. Remove o registro do módulo em system_modules (cascata em plan_modules e company_modules)
delete from public.system_modules where id = 'inpeace-play';

-- 2. Drop das tabelas exclusivas do módulo inpeace-play / assinaturas de streaming
drop table if exists public.subscription_contents cascade;
drop table if exists public.subscription_collections cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.subscription_plans cascade;
drop table if exists public.subscription_tags cascade;
