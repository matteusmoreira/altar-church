# Chat interno dos ministérios

Cada ministério ativo possui uma conversa independente de escalas e campanhas. A aba Chat usa o mesmo componente da central `/membro/chats`; administradores também podem abrir `/ministerios/[id]/chat` diretamente.

## Acesso e conteúdo

O servidor e o Realtime exigem perfil ativo, igreja correta e participação ativa, com pessoa ativa vinculada, ou papel administrativo. Participações pendentes/inativas e pessoas removidas não dão acesso. Novos participantes veem o histórico completo. APIs exigem sessão; chaves de integração não podem conversar.

Mensagens aceitam até 5.000 caracteres e cinco anexos de até 10 MB. Fotos, PDF, DOCX, XLSX e áudios WebM/Ogg/MP4 são validados no servidor; áudios são analisados para verificar duração de até 180 segundos e ausência de vídeo. Gravação requer navegador compatível, HTTPS e permissão de microfone.

O autor edita e exclui suas mensagens; liderança e administração excluem qualquer mensagem e mantêm até cinco fixadas. Exclusão preserva o registro “Mensagem removida”, mas bloqueia novos downloads. Respostas são restritas ao mesmo ministério e reações usam 👍 ❤️ 🙏 😂 🎉.

## Persistência e recuperação

Migration: `20261006225520_ministry_internal_chat.sql`. Tabelas de mensagens, anexos, reações, leitura/preferências e outbox pertencem ao ministério e à igreja. O cliente só tem SELECT nas tabelas de mensagens, reações e leitura própria, protegido por RLS; alterações passam pelo servidor. Helpers privados não expõem consultas arbitrárias de perfis.

Paginação usa pares de data/ID, 50 mensagens por página. Envios usam chave idempotente por autor/ministério. Datas de envio são monotônicas por conversa. Reconexão atualiza o histórico já carregado em lotes, incluindo edições, reações e exclusões. O cliente mantém o rascunho em falhas e registra leitura somente de mensagens visíveis com a página em foco.

Uploads usam tokens temporários no bucket privado `ministry-chat-assets`. Metadados e conteúdo são verificados antes de associar o arquivo à mensagem. Downloads são transmitidos por rota autenticada, com suporte a Range e `private, no-store`; URLs assinadas de leitura não são expostas ao cliente. Uploads abandonados há mais de 24 horas são removidos pelo worker em lotes.

## Push e operação

Dispositivos gerais passam a guardar `profile_id`; pessoas continuam sendo necessárias para campanhas, mas perfis sem pessoa podem cadastrar dispositivos para chats. Administradores precisam optar por receber push em cada ministério. Integrantes ativos recebem quando há dispositivo autorizado e o canal não está bloqueado; silenciar mantém os contadores internos.

A fila é gravada junto da mensagem. O worker revalida acesso, leitura, dispositivo e preferências antes de enviar “Nova mensagem”, sem texto privado na tela bloqueada. Cada dispositivo tem uma entrega única; falhas transitórias têm até oito tentativas, endpoints 404/410 são desativados e tarefas interrompidas são recuperadas depois de dez minutos. Tags do service worker agrupam avisos por ministério. Links respeitam painel administrativo ou portal do membro.

O dispatch geral de integrações inclui o chat. Também existe `/api/internal/ministries/chat/dispatch`, protegido pelo segredo do worker: GET verifica a configuração sem enviar; POST processa um lote. `scripts/setup-ministry-chat-cron.mjs` permite cron dedicado de um minuto após validar o endpoint HTTPS publicado, armazenando URL/segredo no Vault. Não habilitar ambos os agendamentos dedicados desnecessariamente; o claim evita processamento simultâneo do mesmo registro, mas um único agendamento basta.

`scripts/verify-ministry-chat.mjs` verifica RLS, grants, publicação Realtime, bucket e fila. A opção `--apply` aplica somente a migration desta funcionalidade, preservando migrations de outras tarefas.

## Evidência e limites da entrega

- Testes do contrato e backend com PostgreSQL embutido: isolamento por igreja/ministério, autoria/moderação, respostas, reações, fixadas, paginação, leitura monotônica, idempotência, anexos e acesso revogado.
- Testes da fila com provedor simulado: opt-in administrativo, leitura/silenciamento/revogação antes do envio, recuperação de locks, ausência de duplicata de claim e endpoints expirados.
- E2E autenticado passou com duas sessões independentes e uma administração: texto, resposta, reação, edição recuperada após reconexão, upload/download reais no Supabase, gravação com dispositivo de áudio simulado, microfone/push negados, moderação, fixação, envio repetido, falha de conexão com rascunho/reenvio, histórico paginado, aviso de novas mensagens, leitura/contadores e perda de acesso. Também verificou teclado, largura mobile e modo escuro. Push dos participantes da fixture fica desabilitado. Fixtures e arquivos foram removidos ao terminar; a verificação final encontrou zero mensagens e anexos de teste.
- A migration foi aplicada e sua configuração foi verificada no Supabase em 06/10/2026. Isso não comprova publicação do código nem recebimento físico de push. Esses gates devem ser registrados separadamente após uma liberação e teste em dispositivo autorizado.
- O build de produção isolado, typecheck, lint dos arquivos alterados, 17 testes de regressão de notificações/Kids/chat de voluntários e seis testes de segurança Kids passaram. A suíte da agenda possui uma expectativa antiga de confirmação de presença que não corresponde à interface atual; essa falha não foi alterada nesta entrega.

O destinatário indicado para a validação física ainda não tem dispositivo push cadastrado. Após publicar o código, deve usar **Notificações → Ativar notificações push** no dispositivo escolhido. A publicação, a aceitação pelo provedor e o recebimento/abertura da conversa continuam pendentes e devem ser comprovados separadamente. Nenhum push real foi enviado nesta implementação.

O build exigiu separar `maskPhone` do módulo servidor Kids para impedir importação de `node:crypto` no navegador; o export anterior e os testes de segurança Kids foram preservados.
