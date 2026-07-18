import { getSql } from "@/lib/db/client"
import { xlsResponse, type XlsCell } from "@/lib/export/xls"
import { auditExport, requireExportContext, toExportErrorResponse } from "@/lib/export/server"

export const runtime = "nodejs"

function dateParam(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key)?.trim() ?? ""
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

/**
 * Exportação XLS do módulo Kids — sempre auditada e com permissão kids.reports.export.
 * Nunca inclui detalhes clínicos (somente indicadores sim/não).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const { companyId } = await requireExportContext(searchParams, "kids.reports.export")
    const type = searchParams.get("type")?.trim() ?? ""
    const from = dateParam(searchParams, "from")
    const to = dateParam(searchParams, "to")
    const sql = getSql()

    if (type === "presencas") {
      const rows = await sql<XlsCell[][]>`
        select
          session.title as "Sessão",
          to_char(attendance.checked_in_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as "Data",
          person.full_name as "Criança",
          attendance.classroom_name as "Sala",
          attendance.status as "Status",
          to_char(attendance.checked_in_at at time zone 'America/Sao_Paulo', 'HH24:MI') as "Entrada",
          coalesce(to_char(attendance.checked_out_at at time zone 'America/Sao_Paulo', 'HH24:MI'), '') as "Saída",
          coalesce((
            select guardian_person.full_name
            from public.kid_guardians guardian
            join public.people guardian_person on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
            where guardian.kid_id = attendance.kid_id and guardian.deleted_at is null and guardian.is_primary = true
            limit 1
          ), '') as "Responsável",
          coalesce((
            select guardian_person.phone
            from public.kid_guardians guardian
            join public.people guardian_person on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
            where guardian.kid_id = attendance.kid_id and guardian.deleted_at is null and guardian.is_primary = true
            limit 1
          ), '') as "Telefone"
        from public.kid_attendances attendance
        join public.kid_sessions session on session.id = attendance.session_id
        join public.kid_profiles kid on kid.id = attendance.kid_id
        join public.people person on person.id = kid.person_id
        where attendance.company_id = ${companyId}
          and (${from}::date is null or attendance.checked_in_at >= ${from}::date)
          and (${to}::date is null or attendance.checked_in_at < (${to}::date + 1))
        order by attendance.checked_in_at desc
        limit 5000
      `
      await auditExport("kids.reports.export", "kid_attendances", companyId)
      return xlsResponse(`kids-presencas-${new Date().toISOString().slice(0, 10)}.xls`, [
        ["Sessão", "Data", "Criança", "Sala", "Status", "Entrada", "Saída", "Responsável", "Telefone"],
        ...rows,
      ])
    }

    if (type === "criancas") {
      const rows = await sql<XlsCell[][]>`
        select
          person.full_name as "Nome",
          coalesce(to_char(person.birth_date, 'DD/MM/YYYY'), '') as "Nascimento",
          coalesce(congregation.name, '') as "Congregação",
          case when kid.is_visitor then 'sim' else 'não' end as "Visitante",
          coalesce((
            select string_agg(guardian_person.full_name, ', ' order by guardian.is_primary desc)
            from public.kid_guardians guardian
            join public.people guardian_person on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
            where guardian.kid_id = kid.id and guardian.deleted_at is null
          ), '') as "Responsáveis",
          coalesce((
            select string_agg(consent.consent_type, ', ')
            from public.kid_consents consent
            where consent.kid_id = kid.id and consent.status = 'granted'
          ), '') as "Consentimentos",
          case when coalesce(hp.has_allergy, false) then 'sim' else 'não' end as "Alergia",
          case when coalesce(hp.has_dietary_restriction, false) then 'sim' else 'não' end as "Restrição alimentar",
          case when coalesce(hp.has_medication, false) then 'sim' else 'não' end as "Medicação",
          case when coalesce(hp.has_special_needs, false) then 'sim' else 'não' end as "Necessidades específicas",
          to_char(kid.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as "Cadastro"
        from public.kid_profiles kid
        join public.people person on person.id = kid.person_id and person.deleted_at is null
        left join public.congregations congregation on congregation.id = person.congregation_id
        left join public.kid_health_profiles hp on hp.kid_id = kid.id and hp.deleted_at is null
        where kid.company_id = ${companyId}
          and kid.deleted_at is null
        order by person.full_name
        limit 5000
      `
      await auditExport("kids.reports.export", "kid_profiles", companyId)
      return xlsResponse(`kids-criancas-${new Date().toISOString().slice(0, 10)}.xls`, [
        ["Nome", "Nascimento", "Congregação", "Visitante", "Responsáveis", "Consentimentos", "Alergia", "Restrição alimentar", "Medicação", "Necessidades específicas", "Cadastro"],
        ...rows,
      ])
    }

    return Response.json({ error: "Tipo inválido (use presencas ou criancas)" }, { status: 400 })
  } catch (error) {
    return toExportErrorResponse(error)
  }
}
