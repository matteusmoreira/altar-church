-- Mensagem interativa do WhatsApp (botões/lista/carrossel) nas campanhas,
-- incluindo as do ministério. Nulo = campanha de texto simples (content).
alter table public.notifications
  add column if not exists whatsapp_message jsonb;
