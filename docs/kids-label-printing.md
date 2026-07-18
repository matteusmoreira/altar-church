# Etiquetas Kids e QZ Tray

## Navegador e PDF

O construtor rasteriza cada etiqueta em PNG antes de imprimir. Logo, fundo, gradiente e fontes fazem parte da imagem final e não dependem da opção "gráficos de segundo plano" do navegador.

Na recepção, use **Navegador/PDF** quando estiver em tablet/Android ou quando o QZ Tray não estiver disponível.

## Impressão direta no Windows

1. Instale QZ Tray 2.2 no computador da recepção.
2. Instale a impressora térmica no Windows e confirme uma página de teste pelo sistema.
3. Abra QZ Tray e mantenha o ícone ativo na bandeja.
4. No Kids, abra **Recepção > Impressora desta estação**.
5. Clique **Detectar**, selecione a impressora e use **Testar impressão**.
6. Marque **Impressão direta**.
7. Na primeira autorização do site, escolha a opção do QZ para memorizar a decisão.

Nome da impressora e preferência ficam somente no navegador daquela estação (`localStorage`). Cada computador configura sua própria impressora.

Esta integração não inclui certificado comercial de assinatura QZ. Se a confiança local for removida, o QZ pode pedir nova confirmação. Falha ou ausência do QZ abre automaticamente a impressão do navegador.

## Tamanhos

Modelos criança e responsável podem usar dimensões diferentes. QZ envia um trabalho por etiqueta com tamanho em milímetros. No navegador, cada etiqueta vira uma página separada; confirme tamanho, escala 100% e margens zero no diálogo da impressora.

## Privacidade

Campos clínicos, foto, nome completo, telefone, e-mail e campos personalizados são marcados como sensíveis. Publicação exige `kids.health.view`, confirmação explícita e gera auditoria. Hashes, conteúdo cifrado, IDs internos e segredo bruto da credencial nunca entram no catálogo do editor.
