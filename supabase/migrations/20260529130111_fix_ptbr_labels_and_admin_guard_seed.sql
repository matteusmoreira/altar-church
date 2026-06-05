update public.system_modules
set label = values.label,
    description = values.description,
    menu_group = values.menu_group,
    updated_at = now()
from (
  values
    ('dashboard', 'Dashboard', 'Visão geral da empresa.', 'Início'),
    ('church-info', 'Informações', 'Dados institucionais da igreja.', 'Sobre a Igreja'),
    ('ministries', 'Ministérios', 'Cadastro e gestão de ministérios.', 'Sobre a Igreja'),
    ('programming', 'Programação', 'Agenda de programações recorrentes.', 'Sobre a Igreja'),
    ('songs', 'Louvor', 'Repertório e músicas.', 'Sobre a Igreja'),
    ('congregations', 'Congregações', 'Unidades e congregações vinculadas.', 'Sobre a Igreja'),
    ('members', 'Pessoas', 'Membros, visitantes e cadastros.', 'Cuidar'),
    ('visitors', 'Visitantes', 'Acompanhamento de visitantes.', 'Cuidar'),
    ('groups', 'GCEUs', 'Grupos, classes e departamentos.', 'Cuidar'),
    ('cells', 'Células', 'Células e relatórios de encontro.', 'Cuidar'),
    ('prayer', 'Intercessão', 'Pedidos e acompanhamento de oração.', 'Cuidar'),
    ('reading-plans', 'Discipulado', 'Planos de leitura e trilhas.', 'Cuidar'),
    ('events', 'Eventos', 'Eventos públicos e internos.', 'Comunicar'),
    ('content', 'Conteúdo', 'Notícias, devocionais e publicações.', 'Comunicar'),
    ('notifications', 'Notificação', 'Envio e agenda de notificações.', 'Comunicar'),
    ('communication', 'Comunicação', 'Campanhas e comunicação com pessoas.', 'Comunicar'),
    ('inpeace-play', 'InPeace Play', 'Conteúdos de vídeo e assinaturas.', 'Comunicar'),
    ('attendance', 'Presença', 'Registros de presença por evento.', 'Administrar'),
    ('crm', 'CRM', 'Pipeline de relacionamento.', 'Administrar'),
    ('finance', 'Financeiro', 'Receitas, despesas e contas.', 'Administrar'),
    ('donations', 'Doação', 'Doações e recorrências.', 'Administrar'),
    ('reports', 'Relatórios', 'Indicadores e relatórios gerenciais.', 'Administrar'),
    ('settings', 'Configurações', 'Configurações gerais da empresa.', 'Administrar')
) as values(id, label, description, menu_group)
where public.system_modules.id = values.id;

update public.system_plans
set name = values.name,
    description = values.description,
    updated_at = now()
from (
  values
    ('free', 'Gratuito', 'Plano inicial para validar a plataforma.'),
    ('basic', 'Básico', 'Operação essencial de igreja local.'),
    ('premium', 'Premium', 'Gestão completa com comunicação e financeiro.'),
    ('enterprise', 'Enterprise', 'Pacote completo com todos os módulos.')
) as values(code, name, description)
where public.system_plans.code = values.code;

update public.companies
set name = values.name,
    responsible_name = values.responsible_name,
    address = values.address,
    city = values.city,
    updated_at = now()
from (
  values
    ('c1', 'Igreja Batista Central', 'Pastor João Silva', 'Rua das Flores, 123', 'São Paulo'),
    ('c2', 'Comunidade Graça Viva', 'Pastor Carlos Mendes', 'Av. Brasil, 456', 'Rio de Janeiro'),
    ('c3', 'Igreja Presbiteriana Renovada', 'Pastor Roberto Lima', 'Rua da Paz, 789', 'Belo Horizonte'),
    ('c4', 'Assembleia de Deus Ministério', 'Pastor Marcos Souza', 'Rua Esperança, 321', 'Curitiba'),
    ('c5', 'Igreja do Evangelho Quadrangular', 'Pastora Lucia Ferreira', 'Av. da Fé, 654', 'Salvador')
) as values(legacy_id, name, responsible_name, address, city)
where public.companies.legacy_id = values.legacy_id;

update public.profiles
set name = values.name,
    updated_at = now()
from (
  values
    ('u2', 'Pastor João Silva'),
    ('u7', 'Juliana Mendes')
) as values(legacy_id, name)
where public.profiles.legacy_id = values.legacy_id;
