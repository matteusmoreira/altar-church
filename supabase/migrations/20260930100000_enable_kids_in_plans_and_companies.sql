-- Inclusão do módulo kids nos planos premium e enterprise por padrão
-- e garantia de consistência de company_modules com system_modules

insert into public.plan_modules (plan_id, module_id, included)
select p.id, 'kids', true
from public.system_plans p
where p.code in ('premium', 'enterprise')
on conflict (plan_id, module_id) do update
set included = true,
    updated_at = now();
