# Plano de desenvolvimento — Novas features

Status: planejamento aprovado para implementação futura  
Data: 31/07/2026  
Sistema: Altar Church

## 1. Objetivo

Transformar a base atual em operação mais automática, mensurável e útil para membros, líderes, voluntários e administração.

O plano parte do que já existe: multi-tenant, RLS, auditoria, API REST, CRM, células, Kids, voluntariado, portal de membro, integrações Uazapi/Resend/Web Push e exports.

## 2. Fora do escopo agora

Item 5 da ordem recomendada anterior está adiado:

- pagamentos online;
- doação online;
- Pix/cartão por gateway;
- doação recorrente conectada a provedor;
- webhook financeiro de pagamento;
- recibo automático dependente de pagamento.

Não criar migration, provider, secret, endpoint ou tela para esse item nesta etapa.

## 3. Regras para toda implementação

Toda feature nova deve cumprir:

- `company_id` em dados operacionais;
- RLS tenant-scoped;
- índice por tenant e filtros principais;
- validação Zod no servidor;
- autorização server-side;
- auditoria em ações sensíveis;
- estados loading, erro, vazio e sucesso;
- API V1/OpenAPI quando houver integração externa;
- testes unitários/service;
- E2E dos fluxos críticos;
- migration aplicada antes de publicar frontend que a utiliza;
- smoke em staging antes de produção.

## 4. Fase 0 — base de release e observabilidade

### Objetivo

Criar segurança operacional para as próximas features não dependerem de diagnóstico manual.

### Entregas

1. Atualizar roadmap e status de migrations, separando `local`, `staging` e `produção`.
2. Confirmar projeto Supabase alvo antes de qualquer migration.
3. Aplicar e verificar migrations recentes de células somente no ambiente aprovado.
4. Criar health checks para banco, Storage, Auth e workers.
5. Criar painel operacional com:
   - último cron executado;
   - filas pendentes;
   - falhas e dead letters;
   - atraso do worker;
   - saúde de Uazapi, Resend e Web Push;
   - uso por tenant;
   - última execução de backup.
6. Documentar rollback, restore e rotação de secrets.

### Gate

- typecheck verde;
- lint verde;
- testes verdes;
- build verde;
- E2E crítico verde em staging;
- migrations verificadas no projeto correto;
- falhas de worker visíveis e reenviáveis.

## 5. Fase 1 — notificações multicanal reais

### Objetivo

Transformar `/notificacao` de cadastro persistido em campanha entregue e rastreável.

### Entregas

1. Corrigir formulário para permitir canal explícito: Push, e-mail ou WhatsApp.
2. Corrigir seleção de público: todos, célula, ministério, visitantes, aniversariantes ou seleção manual.
3. Reaproveitar tabelas/outbox existentes quando possível; criar somente entidades ausentes.
4. Criar snapshot de destinatários no momento do agendamento.
5. Criar entrega por destinatário com estados:
   - `pending`;
   - `processing`;
   - `sent`;
   - `failed`;
   - `canceled`;
   - `dead`.
6. Implementar worker com:
   - `FOR UPDATE SKIP LOCKED`;
   - retry exponencial;
   - idempotência;
   - backoff;
   - limite por tenant;
   - remoção de endpoints inválidos.
7. Implementar preferências e opt-out por canal.
8. Adicionar tela de detalhes da campanha e entrega por destinatário.
9. Adicionar reenvio manual de falhas.
10. Registrar webhook/status de Resend e Uazapi quando disponível.

### Gate

- campanha teste chega em cada canal configurado;
- retry comprovado;
- duplicidade bloqueada;
- opt-out respeitado;
- tenant A nunca recebe campanha do tenant B;
- dashboard mostra sucesso, falha e pendência reais.

## 6. Fase 2 — Pessoa 360° e follow-up pastoral

### Objetivo

Transformar cadastro de pessoa em histórico único de relacionamento.

### Entregas

1. Adicionar aba `Linha do tempo` no detalhe de pessoa.
2. Consolidar eventos existentes sem duplicar dados:
   - cadastro e alterações;
   - visitas;
   - presenças;
   - células;
   - ministérios;
   - Kids;
   - voluntariado;
   - CRM;
   - oração;
   - comunicações;
   - exports e consentimentos.
3. Criar tarefas de follow-up com:
   - responsável;
   - prazo;
   - prioridade;
   - status;
   - origem;
   - observação auditada.
4. Criar gatilhos configuráveis:
   - novo visitante;
   - visitante sem contato;
   - ausência recorrente;
   - pedido de oração novo;
   - pessoa sem célula;
   - membro sem acesso ao portal.
5. Integrar tarefas ao CRM, sem criar card duplicado.
6. Adicionar filtros por jornada, status, célula e responsável.

### Gate

- timeline respeita tenant e permissões;
- eventos não vazam dados clínicos ou sensíveis;
- follow-up cria auditoria;
- gatilho não gera tarefas duplicadas;
- pessoa pode ser exportada com histórico autorizado.

## 7. Fase 3 — Portal do membro 2.0

### Objetivo

Fazer portal virar ponto principal de relacionamento da igreja.

### Entregas

1. Adicionar calendário geral de cultos, eventos, células e programações.
2. Permitir RSVP para eventos, com limite e lista de espera quando necessário.
3. Exibir detalhes do evento, local, horário, responsável e link externo.
4. Adicionar pedido de oração pelo portal.
5. Adicionar atualização segura do próprio cadastro.
6. Adicionar preferências de comunicação e push.
7. Exibir histórico de células, presenças e participações autorizadas.
8. Adicionar notificações de:
   - alteração de evento;
   - novo aviso;
   - escala do voluntário;
   - resposta de ministério;
   - aviso da célula.
9. Melhorar PWA com cache de leitura.
10. Avaliar check-in offline somente depois de definir token curto, expiração e reconciliação idempotente.

### Gate

- membro só acessa seus dados;
- RSVP é idempotente;
- lotação não pode ser excedida por corrida concorrente;
- portal funciona em mobile real;
- push exige consentimento explícito;
- nenhum dado sensível entra em cache público.

## 8. Fase 4 — Saúde das células

### Objetivo

Dar líder e supervisor visão rápida de saúde, presença e cuidado.

### Entregas

1. Dashboard por célula e supervisor.
2. Indicadores:
   - presença semanal;
   - tendência de presença;
   - membros ativos/inativos;
   - novos participantes;
   - capacidade;
   - frequência de relatórios;
   - pedidos de oração abertos;
   - última comunicação.
3. Lista de membros para follow-up.
4. Alertas de ausência configuráveis.
5. Meta de crescimento e multiplicação.
6. Relatório mensal exportável.
7. Acesso de líder limitado às células atribuídas.
8. Acesso de supervisor consolidado somente no escopo permitido.

### Gate

- cálculo usa presença real;
- líder não consulta outra célula;
- métricas ficam consistentes com dashboard geral;
- alertas não duplicam tarefas;
- exportação é auditada.

## 9. Pacote Kids — evolução operacional

Executar depois da base de release e da entrega de notificações.

### Entregas

- pré-cadastro familiar;
- renovação periódica de consentimentos;
- alertas de saúde somente para perfis autorizados;
- lista de espera por sala;
- notificação automática ao responsável;
- relatório de frequência e ausência;
- acompanhamento de capacidade por culto;
- trilha de auditoria de alterações familiares.

Preservar PIN, QR, fotos privadas, criptografia de saúde, vínculo de responsável e impressão já existentes.

## 10. Pacote Voluntariado — evolução operacional

Executar após notificações multicanal.

### Entregas

- horas servidas por pessoa e equipe;
- treinamentos e certificações;
- validade de documentos;
- controle de no-show;
- reconhecimento mensal;
- histórico de feedback;
- relatório de carga por voluntário;
- alertas de escala sem resposta;
- melhoria de funcionamento em conexão instável.

Preservar RLS departamental, escalas, swaps, check-in, chat, push e outbox existentes.

## 11. Pacote público e aquisição

### Entregas

- calendário público de eventos;
- landing pages por campanha;
- QR codes para visitante, célula e evento;
- origem da entrada: QR, Instagram, site, indicação ou evento;
- conversão automática para Pessoa + CRM;
- follow-up automático após formulário;
- métricas de visita, cadastro e conversão;
- SEO básico por igreja e evento.

## 12. Ordem recomendada

1. Fase 0: release, migration, workers e observabilidade.
2. Fase 1: notificações reais.
3. Fase 2: Pessoa 360° e follow-up.
4. Fase 3: portal do membro.
5. Fase 4: saúde das células.
6. Pacote Kids.
7. Pacote Voluntariado.
8. Pacote público e aquisição.

Item 5 anterior — pagamentos e doações online — continua fora desta ordem e deve ser reavaliado em plano separado.

## 13. Definition of Done

Feature só fica pronta quando:

- código, migration e documentação estão alinhados;
- RLS e permissões foram testadas;
- tenant isolation foi testado;
- logs e auditoria existem;
- retry/idempotência existem quando houver entrega;
- testes automatizados passaram;
- E2E principal passou em staging;
- smoke mobile passou quando houver portal/PWA;
- rollback conhecido;
- nenhum segredo foi salvo no repositório;
- produção recebeu evidência separada de staging.

## 14. Próximo passo

Implementar somente Fase 0 após confirmar projeto Supabase e ambiente alvo. Depois publicar Fase 1 em lote controlado.

