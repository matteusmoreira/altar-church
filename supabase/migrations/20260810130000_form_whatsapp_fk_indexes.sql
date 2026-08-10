-- Índices das chaves estrangeiras do envio direto por WhatsApp.
-- Mantêm cascatas, joins e filtros eficientes sem alterar dados existentes.

create index if not exists form_whatsapp_deliveries_form_id_fk_idx
  on public.form_whatsapp_deliveries(form_id);

create index if not exists form_whatsapp_deliveries_person_id_fk_idx
  on public.form_whatsapp_deliveries(person_id);

create index if not exists form_whatsapp_deliveries_submission_id_fk_idx
  on public.form_whatsapp_deliveries(submission_id);

create index if not exists form_whatsapp_deliveries_uazapi_instance_id_fk_idx
  on public.form_whatsapp_deliveries(uazapi_instance_id);

create index if not exists forms_whatsapp_instance_id_fk_idx
  on public.forms(whatsapp_instance_id);
