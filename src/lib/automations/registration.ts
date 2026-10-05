import { getSql } from "@/lib/db/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeBrazilianWhatsapp } from "@/lib/auth/phone";
import type { FlowNode } from "./contract";
import { validateQuestionAnswer } from "./questions";

export class RegistrationNeedsReview extends Error {}
type RegistrationRun = { id: string; company_id: string; lease_token: string; context: Record<string, unknown> };
type Registration = { id: string; status: string; email: string; phone: string; full_name: string; congregation_id: string; person_id: string | null; profile_id: string | null; auth_user_id: string | null };

export async function registerAutomationPerson(run: RegistrationRun, node: FlowNode, actorId: string) {
  const sql = getSql(), c = node.config;
  const chat = String(run.context.chat_id ?? "");
  if (!chat.endsWith("@s.whatsapp.net")) throw new Error("Cadastro exige uma conversa privada com WhatsApp identificado");
  const phone = normalizeBrazilianWhatsapp(chat.split("@")[0]);
  const name = validateQuestionAnswer("full_name", String(run.context[c.nameVariable ?? ""] ?? ""));
  const email = validateQuestionAnswer("email", String(run.context[c.emailVariable ?? ""] ?? ""));
  if (!phone || !name.value || !email.value) throw new Error("Nome, e-mail ou WhatsApp inválido");
  const congregation = String(run.context[c.congregationVariable ?? ""] ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(congregation)) throw new Error("Selecione uma congregação válida");
  const password = c.initialPassword ?? "@mudar123";
  if (password.length < 8) throw new Error("Senha inicial deve ter pelo menos 8 caracteres");

  const record = await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext(${`registration:email:${email.value}`}))`;
    await tx`select pg_advisory_xact_lock(hashtext(${`registration:phone:${phone}`}))`;
    const [current] = await tx<Registration[]>`select * from public.automation_registrations where company_id=${run.company_id} and run_id=${run.id} and node_id=${node.id} for update`;
    if (current) return current;
    const [activeRun] = await tx`select id from public.automation_runs where company_id=${run.company_id} and id=${run.id} and status='working' and lease_token=${run.lease_token}`;
    if (!activeRun) throw new Error("Execução pausada ou cancelada");
    const [available] = await tx`select id from public.congregations where id=${congregation}::uuid and company_id=${run.company_id} and is_active and deleted_at is null`;
    if (!available) throw new Error("Congregação não está disponível nesta igreja");
    const people = await tx`select id,full_name,email,profile_id,is_active from public.people where company_id=${run.company_id} and deleted_at is null and (regexp_replace(phone,'\\D','','g')=${phone} or regexp_replace(phone,'\\D','','g')=${`55${phone}`}) for update`;
    if (people.length > 1 || (people[0] && !people[0].is_active)) throw new Error("WhatsApp possui cadastro ambíguo ou inativo; procure a administração");
    const p = people[0];
    const effectiveEmail = String(p?.email || email.value).trim().toLowerCase();
    if (!validateQuestionAnswer("email", effectiveEmail).value) throw new Error("E-mail do cadastro existente é inválido");
    const profiles = await tx`select id,company_id,person_id,auth_user_id,email,login_phone,active from public.profiles where lower(email)=${effectiveEmail} or login_phone=${phone} or id=${p?.profile_id ?? null}::uuid for update`;
    const profile = profiles.find(v => v.id === p?.profile_id || (v.company_id === run.company_id && v.person_id === p?.id));
    if (profiles.some(v => v.id !== profile?.id) || (profile && (profile.company_id !== run.company_id || profile.person_id !== p?.id || !profile.active)))
      throw new Error("E-mail ou WhatsApp já pertence a outro acesso");
    if (p?.profile_id && !profile) throw new Error("Vínculo de acesso existente precisa de revisão");
    if (profile && (!profile.auth_user_id || (profile.login_phone && profile.login_phone !== phone))) throw new Error("WhatsApp ou identidade do acesso existente precisa de revisão");
    const conflicting = await tx`select id from public.people where company_id=${run.company_id} and deleted_at is null and lower(email)=${effectiveEmail} and id<>${p?.id ?? "00000000-0000-0000-0000-000000000000"}::uuid`;
    if (conflicting.length) throw new Error("E-mail já pertence a outra pessoa nesta igreja");
    const [pending] = await tx`select id from public.automation_registrations where (email=${effectiveEmail} or phone=${phone}) and status in ('reserved','creating','auth_created')`;
    if (pending) throw new RegistrationNeedsReview("Há um cadastro em andamento para este e-mail ou WhatsApp; revise antes de repetir");
    const [saved] = await tx<Registration[]>`insert into public.automation_registrations(company_id,run_id,node_id,email,phone,full_name,congregation_id,person_id,profile_id,auth_user_id,status) values(${run.company_id},${run.id},${node.id},${effectiveEmail},${phone},${p?.full_name || name.value},${congregation}::uuid,${p?.id ?? null},${profile?.id ?? null},${profile?.auth_user_id ?? null},${profile ? "auth_created" : "reserved"}) returning *`;
    return saved;
  });
  if (record.status === "failed") throw new Error("Criação do acesso recusada; revise o cadastro antes de tentar novamente");
  if (record.status !== "completed" && !record.profile_id) {
    // Recover only identities created by this checkpoint, never an account found by email alone.
    const owned = await sql`select id,email from auth.users where raw_app_meta_data->>'automation_registration_id'=${record.id}`;
    if (owned.length > 1) throw new RegistrationNeedsReview("Mais de uma identidade encontrada para este cadastro");
    if (owned[0]) {
      if (String(owned[0].email).toLowerCase() !== record.email) throw new RegistrationNeedsReview("Identidade do cadastro exige revisão");
      record.auth_user_id = String(owned[0].id);
      await sql`update public.automation_registrations set status='auth_created',auth_user_id=${record.auth_user_id},updated_at=now() where id=${record.id}`;
    } else if (record.auth_user_id || record.status === "creating" || record.status === "auth_created") {
      throw new RegistrationNeedsReview("Criação do acesso não confirmada; reconciliar antes de repetir");
    } else {
      const supabase = createSupabaseAdminClient();
      if (!supabase) throw new Error("Cadastro indisponível: serviço de autenticação não configurado");
      const [claim] = await sql`update public.automation_registrations set status='creating',updated_at=now() where id=${record.id} and status='reserved' returning id`;
      if (!claim) throw new RegistrationNeedsReview("Cadastro já está sendo processado");
      let result;
      try {
        result = await supabase.auth.admin.createUser({ email: record.email, password, email_confirm: true,
          user_metadata: { name: record.full_name }, app_metadata: { automation_registration_id: record.id } });
      } catch { throw new RegistrationNeedsReview("Serviço não confirmou a criação do acesso; reconciliar antes de repetir"); }
      if (result.error || !result.data.user) {
        if (!result.error?.status || result.error.status >= 500) throw new RegistrationNeedsReview("Serviço não confirmou a criação do acesso; reconciliar antes de repetir");
        await sql`update public.automation_registrations set status='failed',updated_at=now() where id=${record.id}`;
        throw new Error("Não foi possível criar o acesso; e-mail já utilizado ou cadastro recusado");
      }
      record.auth_user_id = result.data.user.id;
      await sql`update public.automation_registrations set status='auth_created',auth_user_id=${record.auth_user_id},updated_at=now() where id=${record.id}`;
    }
  }
  return sql.begin(async tx => {
    const [activeRun] = await tx`select id from public.automation_runs where company_id=${run.company_id} and id=${run.id} and status='working' and lease_token=${run.lease_token} for update`;
    if (!activeRun) throw new RegistrationNeedsReview("Acesso preparado, mas execução pausada ou cancelada; revise o cadastro");
    const [checkpoint] = await tx<Registration[]>`select * from public.automation_registrations where id=${record.id} and company_id=${run.company_id} for update`;
    if (checkpoint.status !== "completed") {
      await tx`select pg_advisory_xact_lock(hashtext(${`registration:email:${record.email}`}))`;
      await tx`select pg_advisory_xact_lock(hashtext(${`registration:phone:${record.phone}`}))`;
      const otherPeople = await tx`select id from public.people where company_id=${run.company_id} and deleted_at is null and id<>${record.person_id ?? "00000000-0000-0000-0000-000000000000"}::uuid and (lower(email)=${record.email} or regexp_replace(phone,'\\D','','g')=${record.phone} or regexp_replace(phone,'\\D','','g')=${`55${record.phone}`}) for update`;
      const otherProfiles = await tx`select id from public.profiles where id<>${record.profile_id ?? "00000000-0000-0000-0000-000000000000"}::uuid and (lower(email)=${record.email} or login_phone=${record.phone}) for update`;
      if (otherPeople.length || otherProfiles.length) throw new RegistrationNeedsReview("E-mail ou WhatsApp vinculado durante o cadastro; revise antes de continuar");
      const [available] = await tx`select id from public.congregations where id=${record.congregation_id} and company_id=${run.company_id} and is_active and deleted_at is null`;
      if (!available) throw new RegistrationNeedsReview("Congregação ficou indisponível durante o cadastro");
      await tx`select set_config('app.automation_run_id',${run.id},true)`;
      let profileId = record.profile_id;
      if (!profileId) {
        const [profile] = await tx`insert into public.profiles(company_id,auth_user_id,name,email,login_phone,role,active) values(${run.company_id},${record.auth_user_id},${record.full_name},${record.email},${record.phone},'member',true) returning id`;
        profileId = String(profile.id);
      }
      let personId = record.person_id;
      if (!personId) {
        const parts = record.full_name.split(/\s+/);
        const [person] = await tx`insert into public.people(company_id,first_name,last_name,full_name,email,phone,congregation_id,access_profile,status,person_type,is_active,profile_id,created_by,updated_by) values(${run.company_id},${parts[0]},${parts.slice(1).join(" ")},${record.full_name},${record.email},${record.phone},${record.congregation_id},'member','active','member',true,${profileId},${actorId},${actorId}) returning id`;
        personId = String(person.id);
      } else {
        const [saved] = await tx`update public.people set full_name=coalesce(nullif(trim(full_name),''),${record.full_name}),email=coalesce(nullif(trim(email),''),${record.email}),congregation_id=coalesce(congregation_id,${record.congregation_id}::uuid),profile_id=${profileId},access_profile=coalesce(access_profile,'member'),updated_at=now(),updated_by=${actorId} where id=${personId} and company_id=${run.company_id} and deleted_at is null and is_active and (profile_id is null or profile_id=${profileId}) returning id`;
        if (!saved) throw new RegistrationNeedsReview("Pessoa alterada durante o cadastro; revise o vínculo");
      }
      const [linked] = await tx`update public.profiles set person_id=${personId},login_phone=coalesce(login_phone,${record.phone}),updated_at=now() where id=${profileId} and company_id=${run.company_id} and active and (person_id is null or person_id=${personId}) returning id`;
      if (!linked) throw new RegistrationNeedsReview("Acesso alterado durante o cadastro; revise o vínculo");
      await tx`update public.automation_registrations set status='completed',person_id=${personId},profile_id=${profileId},updated_at=now() where id=${record.id}`;
      await tx`update public.companies set user_count=(select count(*) from public.profiles where company_id=${run.company_id} and active) where id=${run.company_id}`;
      checkpoint.person_id = personId;
    }
    const [person] = await tx`select id,full_name,email from public.people where id=${checkpoint.person_id} and company_id=${run.company_id} and deleted_at is null and is_active`;
    if (!person) throw new RegistrationNeedsReview("Cadastro concluído exige revisão da pessoa");
    await tx`update public.automation_runs set person_id=${person.id},updated_at=now() where id=${run.id}`;
    return { personId: String(person.id), nome: String(person.full_name), primeiro_nome: String(person.full_name).split(" ")[0] };
  }).catch(error => {
    if (error instanceof RegistrationNeedsReview) throw error;
    throw new RegistrationNeedsReview("Acesso preparado, mas o cadastro não foi concluído; reconciliar antes de repetir");
  });
}
