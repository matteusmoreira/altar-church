# Eventos profissionais, sem pagamentos

Implementação de 09/10/2026. Alterações de aplicação permanecem no checkout; não houve publicação desta entrega.

## Fluxo

- `/eventos`: lista por padrão, preferência de grade persistida, calendário secundário mensal/semanal, busca e filtros no servidor, páginas de 24 eventos e totais da busca inteira.
- `/eventos/novo`: informações, data/local, inscrições/divulgação e revisão. Capa usa arquivos gerenciados existentes. Salvar cria rascunho; publicação é explícita.
- Evento: visão geral, inscrições, check-in, equipe/escala, comunicação, materiais e relatórios. Edição fica em área própria.
- Valor em centavos, com formato brasileiro (`150,50`) e orientações. Não há cobrança, situação de pagamento ou condicionamento da entrada ao valor.
- Inscrições: portal do membro, link público e cadastro pela recepção. Capacidade e promoção cronológica são compartilhadas entre membros e visitantes.
- Comprovantes privados recuperáveis e QR individual para inscrição confirmada. Espera não autoriza entrada.
- Check-in: sessão recuperável após recarregar, QR individual, busca manual, leitor de câmera e QR da sessão para autoatendimento com consentimento. Entrada sem inscrição respeita configuração e vagas.
- Equipe: posições, pessoas, instruções e horários usam dados e ações do Voluntariado. Rascunho permitido; publicação da escala exige evento publicado, permissão própria e vagas preenchidas.

## Banco e preservação

Migration aditiva `20261009184330_professional_events.sql`, aplicada ao banco configurado e registrada com checksum: `value_cents`, `value_instructions`, `allow_walk_ins`, `cover_file_id`, índice e tokens individuais para inscrições confirmadas anteriores. Eventos existentes permanecem gratuitos e permitem entrada sem inscrição. Nenhuma inscrição, presença ou escala existente foi removida.

Inscrição, cancelamento, promoção e entrada bloqueiam o evento dentro da transação. Check-in repetido preserva o primeiro horário. Presença usa o fuso da igreja; criação, edição, listagem e página pública também usam esse fuso. Inscrições fecham no fim do evento ou, sem fim, três horas após início.

Uma escala criada depois da publicação mensal não herda essa publicação: precisa publicar a escala do evento. A publicação mensal anterior continua válida para os turnos que já existiam naquele momento.

## Evidências

- 32 testes focados aprovados: regras de eventos em PostgreSQL isolado (PGlite), migração real, inscrição mista, cancelamento/promoção, QR do membro promovido, consentimento, capacidade, repetição, sessões encerradas/expiradas, igreja/evento incorretos, portal e agendamento de voluntários.
- A concorrência da suíte PGlite é serializada pelo adaptador transacional. O piloto complementou essa cobertura com inscrições simultâneas pelo portal do membro e página pública, disputando uma vaga no PostgreSQL remoto: exatamente uma confirmada e uma em espera; cancelamento promoveu a segunda.
- TypeScript, ESLint dos arquivos envolvidos e build de produção aprovados.
- Piloto autenticado com igreja de teste e dados fictícios: mais de 500 eventos, paginação, preferência de grade, criação com valor e capa, escala no rascunho/publicada, inscrição de membro e visitante, comprovante, QR individual, releitura e sessão recarregada, câmera negada, autoatendimento e encerramento da sessão, relatório/exportação e escala no portal. Também passaram cadastro pela recepção em espera, cancelamento com promoção e emissão de QR, duplicação preservando capa/valor, edição para evento online com novo valor e cancelamento do evento duplicado. Fixtures removidas ao final.
- Roteiro reproduzível: `tests/e2e/events-professional-pilot.mjs`. Usa contas locais ignoradas pelo Git, somente igreja com status `test`, sem automações ativas. A abertura pública desse tenant exige `E2E_COMPANY_LEGACY_ID` no servidor local/CI. Confirmações de visitante não são enviadas para tenants de teste.

## Ajustes de criação e página pública — 09/10/2026

- A revisão permite **Criar e publicar agora** ou salvar um rascunho. Rascunhos, eventos internos e cancelados não oferecem botões de divulgação que levariam a uma página indisponível.
- **Gerenciar tipos** adiciona e remove opções por igreja. Remover uma opção preserva o tipo e o histórico dos eventos anteriores, inclusive durante a edição; filtros e cartões exibem os tipos personalizados.
- Capas JPEG, PNG e WebP aceitam até **20 MB**, com prévia imediata. O envio utiliza URL assinada diretamente para Storage, sem encaminhar a imagem pelo limite de corpo da hospedagem; a finalização valida tamanho, formato e propriedade antes de permitir o vínculo ao evento.
- Modelos de escala aparecem sem sufixos técnicos de ID; nomes repetidos recebem uma numeração legível.
- Página pública com capa de destaque, data, informações de participação, inscrição lateral em desktop e layout em coluna no celular, mantendo os fluxos de inscrição interna e plataforma externa.
- Migration `20261009200013_event_type_catalog.sql` aplicada e consultada no banco configurado. O bucket já aceitava 30 MB e esse limite foi preservado; a aplicação limita a capa a 20 MB.
- 19 testes focados, TypeScript e ESLint aprovados. Piloto autenticado `tests/e2e/events-public-polish-pilot.mjs` comprovou upload real de exatamente 20 MB, prévia, tipos persistidos, exclusão sem perda de histórico, rascunho sem link inválido, publicação posterior e direta com página HTTP 200, chamada de inscrição, temas e larguras 320/390/768/1440 px sem rolagem horizontal. Dados fictícios e arquivos removidos ao final.

## Validações externas pendentes

- Publicação da aplicação e verificação no endereço de produção.
- Leitura de QR com câmera em aparelho físico, incluindo permissão, foco e iluminação.
- Entrega efetiva dos canais configurados e recebimento no destino. O piloto não afirma entrega de WhatsApp, e-mail ou push.

Os trabalhos paralelos já presentes no checkout foram preservados. Nenhum commit ou push foi feito nesta entrega.
