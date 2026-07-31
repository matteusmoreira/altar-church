# Plano de desenvolvimento — Módulo de Eventos

## 1. Objetivo

Transformar Eventos de cadastro simples em central operacional da igreja:

`criar → divulgar → inscrever → escalar → realizar → fazer check-in → acompanhar resultado`.

Princípio: reaproveitar `public.events`, RSVP do membro, presença, `programmings`, Voluntariado, Kids, Ministérios e notificações. Não criar um segundo modelo de evento.

## 2. Estado atual confirmado

- `/eventos` possui criação, listagem e exclusão lógica.
- Cadastro já suporta título, tipo, status, datas, local, capacidade, inscrição, evento público, evento online e template opcional de voluntariado.
- `public.events` é tenant-scoped e possui RLS/auditoria no fluxo existente.
- Portal do membro já possui RSVP, capacidade e lista de espera em `member_event_rsvps`.
- `attendance_records` já suporta presença vinculada por `event_ref_id`.
- Recorrência de Voluntariado já usa `programmings` como série e `events` como ocorrências materializadas.
- APIs de Voluntariado já possuem plano, repertório e roteiro operacional vinculados ao evento.
- Não existe ainda página administrativa detalhada `/eventos/[id]`; tela atual é lista + formulário.

Nota: migrations presentes no checkout não equivalem a produção aplicada. Cada etapa deve confirmar schema, ambiente e deployment antes de declarar GO.

## 3. Resultado esperado

Cada evento terá:

- página operacional própria;
- calendário e filtros;
- edição, duplicação, publicação e cancelamento;
- inscrição pública e RSVP do membro;
- lista de espera e gestão de participantes;
- QR/manual check-in;
- presença e relatório;
- escala de voluntários;
- comunicação agendada;
- acompanhamento pós-evento.

## 4. Roadmap por etapas

### Etapa 0 — Contrato e baseline

**Objetivo:** fechar regras antes de alterar schema/UI.

**Tarefas**

1. Confirmar migrations aplicadas no ambiente alvo.
2. Confirmar permissões `events.view`, `events.create`, `events.edit` e `events.delete`.
3. Definir estados: rascunho, publicado e cancelado. Manter exclusão lógica apenas para administrador autorizado.
4. Definir timezone oficial do tenant, inicialmente `America/Sao_Paulo`.
5. Mapear evento ligado a ministério, programação, escala, Kids e formulário.
6. Definir regras: capacidade `0` significa ilimitada; evento online exige URL válida; fim não pode anteceder início.

**Gate**

- Schema, permissões e regras documentados.
- Nenhuma duplicação de tabela aprovada.

### Etapa 1 — Lista e formulário profissional

**Objetivo:** corrigir experiência atual antes de adicionar complexidade.

**Tarefas**

1. Trocar lista plana por visualizações lista, mês e semana.
2. Adicionar busca e filtros por período, tipo, status, local e ministério.
3. Adicionar ações: abrir, editar, duplicar, publicar, cancelar e excluir lógico.
4. Colocar confirmação em ações destrutivas.
5. Separar formulário em blocos:
   - Informações básicas;
   - Data e local;
   - Inscrição e visibilidade;
   - Operação e voluntariado.
6. Mostrar link online somente quando “Online” estiver ativo.
7. Mostrar capacidade somente quando inscrição estiver ativa.
8. Garantir layout mobile para os controles “Inscrição”, “Online” e “Recorrente”.
9. Preservar feedback de sucesso/erro e bloqueio contra duplo envio.
10. Normalizar datas no servidor com timezone explícito.

**Aceite**

- Usuário encontra evento por busca/filtro.
- Usuário consegue editar e cancelar sem apagar histórico.
- Campos condicionais não bloqueiam criação válida.
- ADM sem permissão não vê ações indevidas.

### Etapa 2 — Página operacional do evento

**Rota proposta:** `/eventos/[id]`

**Objetivo:** tornar evento uma central de trabalho.

**Resumo**

- título, status, data, local e link público;
- inscritos, capacidade, lista de espera e presentes;
- escala preenchida versus pendente;
- checklist operacional;
- últimas comunicações.

**Abas**

1. Resumo.
2. Inscrições.
3. Presença e check-in.
4. Voluntariado.
5. Comunicação.
6. Arquivos e observações.

**Ações rápidas**

- copiar link;
- gerar QR;
- abrir escala;
- enviar comunicação;
- duplicar evento;
- publicar/cancelar.

**Aceite**

- Todos os dados têm escopo por tenant.
- A página não depende de dados mockados.
- Ações retornam feedback visível e escrevem auditoria.

### Etapa 3 — Inscrição pública e participantes

**Objetivo:** fechar ciclo de divulgação e confirmação.

**Tarefas**

1. Criar página pública do evento com banner, descrição, data, local, mapa/link e botão de inscrição.
2. Usar `member_event_rsvps` para membros autenticados.
3. Definir fluxo para visitante sem conta: formulário curto, consentimento e proteção contra duplicidade.
4. Aplicar capacidade dentro de transação, mantendo lista de espera segura contra concorrência.
5. Permitir cancelamento e promoção automática da espera.
6. Criar painel administrativo de participantes:
   - inscritos;
   - espera;
   - cancelados;
   - presença;
   - telefone/e-mail conforme permissão.
7. Exportar lista completa autorizada em Excel-compatible `.xls`.

**Gate de privacidade**

- Página pública não enumera participantes.
- Exportação exige permissão e registra auditoria.
- Dados de visitante ficam ligados ao tenant correto.

### Etapa 4 — Check-in e presença

**Objetivo:** registrar presença real no dia.

**Tarefas**

1. Gerar QR específico por evento.
2. Permitir check-in por:
   - QR do participante;
   - busca manual;
   - lista de inscritos;
   - visitante sem inscrição.
3. Usar `attendance_records` como fonte de presença, com operação idempotente.
4. Criar sessão/token de check-in somente se o contrato atual não suportar QR seguro.
5. Mostrar contador ao vivo e divergência entre inscritos e presentes.
6. Adicionar fallback manual para celular sem câmera ou internet instável.
7. Preparar integração futura com check-in Kids, sem misturar presença adulta e infantil.

**Aceite**

- Mesmo participante não gera presença duplicada.
- Check-in repetido é tratado como atualização/resultado idempotente.
- Administrador consegue corrigir presença com auditoria.
- QR expirado ou de outro tenant é rejeitado.

**Bloqueio físico separado**

Teste de câmera, QR e uso em celular real precisa ser feito em dispositivo físico. Build e E2E não provam essa parte.

### Etapa 5 — Recorrência e programações

**Objetivo:** eliminar uso superficial do booleano `recurring`.

**Tarefas**

1. Usar `programmings` como fonte da série.
2. Usar `events` como ocorrências operacionais.
3. Suportar semanal, mensal, dias da semana e data final.
4. Materializar ocorrências com idempotência.
5. Permitir edição:
   - somente esta ocorrência;
   - esta e próximas;
   - série inteira.
6. Propagar alterações com regra explícita para RSVP, escala e comunicação.
7. Marcar ocorrências com conflito para revisão, sem apagar histórico publicado.

**Aceite**

- Reprocessar materialização não duplica eventos.
- Escala continua ligada à ocorrência correta.
- Evento publicado não é alterado silenciosamente por mudança futura da série.

### Etapa 6 — Voluntariado e operação

**Objetivo:** abrir escala pelo evento, sem duplicar o módulo Voluntariado.

**Tarefas**

1. Exibir template aplicado e status da escala.
2. Criar posições e permitir montagem manual.
3. Mostrar vagas, conflitos, indisponibilidade e descanso mínimo em português simples.
4. Permitir publicar escala somente quando regra de completude for atendida ou houver override autorizado.
5. Linkar plano, repertório e roteiro do evento existentes.
6. Mostrar checklist:
   - escala publicada;
   - responsáveis confirmados;
   - comunicação enviada;
   - local definido;
   - check-in preparado.

**Aceite**

- Evento abre a escala correta.
- Acesso respeita tenant, ministério e papel do usuário.
- Histórico publicado é preservado.

### Etapa 7 — Comunicação automática

**Objetivo:** reduzir trabalho manual e faltas.

**Tarefas**

1. Criar modelos de lembrete:
   - confirmação imediata;
   - 7 dias antes;
   - 24 horas antes;
   - alteração;
   - cancelamento;
   - promoção da lista de espera.
2. Permitir escolher público: inscritos, espera, voluntários, ministério ou público geral.
3. Enviar por push, e-mail e WhatsApp conforme consentimento/configuração.
4. Usar outbox, retry, idempotência e status de entrega.
5. Exibir pendente, enviado, falho e morto no painel.

**Gate de entrega**

- Cron executado não significa mensagem entregue.
- Provar fila processada, tentativa e status final.
- WhatsApp real e push em dispositivo continuam gates físicos separados.

### Etapa 8 — Pós-evento e indicadores

**Objetivo:** transformar presença em cuidado e decisão.

**Indicadores**

- inscritos;
- presentes;
- taxa de comparecimento;
- faltantes;
- capacidade ocupada;
- conversão visitante → acompanhamento;
- horas de voluntariado;
- eventos cancelados;
- desempenho por tipo, ministério e período.

**Tarefas**

1. Criar relatório do evento.
2. Criar lista de faltantes para acompanhamento autorizado.
3. Ligar visitante a CRM/formulário quando houver consentimento.
4. Permitir exportação autorizada.
5. Adicionar dashboard mensal somente após dados operacionais estarem confiáveis.

## 5. Modelo técnico recomendado

### Reutilizar

- `public.events`: evento e ocorrência.
- `public.member_event_rsvps`: RSVP, capacidade e espera.
- `public.attendance_records`: presença.
- `public.programmings`: série recorrente.
- `public.volunteer_*`: equipes, posições, escalas e entregas.
- `public.notifications` e outbox: comunicação.
- auditoria e permissões existentes.

### Criar somente se necessário

- sessão/token de check-in;
- preferências de lembrete do evento;
- tabela de documentos/recursos do evento;
- visão materializada ou RPC para indicadores pesados.

Cada nova tabela precisa ter `company_id`, RLS, índices, auditoria e teste de isolamento.

## 6. Segurança e isolamento

- Toda leitura e escrita filtra `company_id` no servidor.
- Permissão nunca depende apenas da interface.
- Ministérios acessam apenas eventos do próprio escopo.
- QR não expõe dados pessoais.
- Token público deve ser curto, rotacionável e limitado ao evento.
- Exportação e presença têm auditoria.
- Capacidade e promoção da espera usam transação/lock.
- Cancelamento preserva histórico de RSVP, presença e escala.

## 7. Estratégia de testes

### Unitário/contrato

- datas e timezone;
- capacidade ilimitada;
- limite e lista de espera;
- duplicidade de RSVP/check-in;
- recorrência idempotente;
- permissão por papel e ministério;
- isolamento entre tenants.

### Integração

- migration limpa;
- criação/edição/cancelamento;
- RSVP concorrente;
- promoção da espera;
- presença vinculada ao evento;
- escala vinculada à ocorrência;
- fila de comunicação.

### E2E

- ADM cria e edita evento;
- membro confirma e cancela RSVP;
- visitante faz inscrição pública;
- administrador faz check-in;
- usuário sem permissão é bloqueado;
- mobile testa formulário e página pública.

### Gate técnico por release

1. lint;
2. typecheck;
3. testes;
4. build;
5. E2E;
6. migration aplicada no ambiente correto;
7. smoke HTTP/API;
8. verificação de logs e filas;
9. teste físico quando envolver QR, push, câmera ou WhatsApp.

## 8. Ordem recomendada de execução

### Release 1 — Base operacional

Etapas 0, 1 e 2.

Entrega: lista útil, filtros, edição, cancelamento e página detalhada.

### Release 2 — Participação

Etapas 3 e 4.

Entrega: inscrição, espera, participantes, QR e presença.

### Release 3 — Operação recorrente

Etapas 5 e 6.

Entrega: séries, ocorrências, escalas e checklist.

### Release 4 — Engajamento e gestão

Etapas 7 e 8.

Entrega: lembretes, acompanhamento, métricas e exportações.

## 9. Primeiro slice autorizado para implementação

Começar pela Release 1:

1. criar página `/eventos/[id]`;
2. adicionar query detalhada com RSVP, presença e escala;
3. adicionar filtros na lista;
4. adicionar editar/duplicar/cancelar;
5. reorganizar formulário para desktop/mobile;
6. cobrir permissões, auditoria, typecheck, testes e build.

**Definition of Done da Release 1:** usuário consegue localizar, abrir, editar, duplicar, publicar e cancelar evento; nenhuma ação cruza tenant; histórico permanece; erros aparecem na tela; gates técnicos passam.

## 10. Riscos e decisões pendentes

- Schema de produção pode estar atrás das migrations do checkout.
- `recurring` pode conter dados antigos sem `programming_id`; migração precisa preservar histórico.
- RSVP de visitante exige decisão de identidade, consentimento e antiabuso.
- Check-in público precisa de token seguro e fallback offline/manual.
- Comunicação externa depende de configuração e prova real do provedor.
- Relatórios só devem ser liberados após confirmar origem correta dos contadores.

## 11. Próximo passo

Executar auditoria da Release 1: schema real, permissões, consultas atuais e contratos de `events`, `member_event_rsvps`, `attendance_records` e Voluntariado. Depois implementar página detalhada e filtros em uma fatia pequena, validável e reversível.
