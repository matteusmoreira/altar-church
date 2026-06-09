update public.system_modules
set route = values.route
from (
  values
    ('attendance', '/presenca'),
    ('cells', '/celulas'),
    ('church-info', '/informacoes'),
    ('communication', '/comunicacao'),
    ('congregations', '/congregacoes'),
    ('content', '/conteudo'),
    ('donations', '/doacao'),
    ('events', '/eventos'),
    ('finance', '/financeiro'),
    ('groups', '/gceus'),
    ('members', '/pessoas'),
    ('ministries', '/ministerios'),
    ('notifications', '/notificacao'),
    ('prayer', '/intercessao'),
    ('programming', '/programacao'),
    ('reading-plans', '/discipulado'),
    ('reports', '/relatorios'),
    ('settings', '/configuracoes'),
    ('songs', '/louvor'),
    ('visitors', '/visitantes')
) as values(id, route)
where public.system_modules.id = values.id;
