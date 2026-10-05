import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import postgres from "postgres";

// Use the same template and validator as the editor; no second copy of the graph.
const require = createRequire(import.meta.url), cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("require", "module", "exports", compiled)(
    name => name.startsWith(".") ? load(resolve(dirname(file), `${name}.ts`)) : require(name), loaded, loaded.exports,
  );
  return loaded.exports;
}
const slug = process.argv.find(a => a.startsWith("--company="))?.slice(10);
if (!slug || !process.env.POSTGRES_URL) throw new Error("Informe a igreja e configure a conexão local do banco");
const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false });
try {
  const [company] = await sql`select id from public.companies where slug=${slug} and active`;
  if (!company) throw new Error("Igreja ativa não encontrada");
  const instances = await sql`select id from public.uazapi_instances where company_id=${company.id} and active and status='connected'`;
  if (instances.length !== 1) throw new Error("É necessário selecionar uma única instância WhatsApp conectada");
  const [actor] = await sql`select p.id from public.profiles p where p.active and (p.role='superadmin' or (p.company_id=${company.id} and p.role='admin')) order by (p.role='superadmin') desc,p.created_at limit 1`;
  if (!actor) throw new Error("Responsável pelo fluxo não encontrado");
  const [congregations] = await sql`select count(*)::int total from public.congregations where company_id=${company.id} and is_active and deleted_at is null`;
  if (!congregations.total) throw new Error("Cadastre ao menos uma congregação ativa");
  const definition = load("src/lib/automations/templates.ts").registrationTemplate();
  for (const node of definition.nodes) if (["trigger", "question", "whatsapp"].includes(node.kind)) node.config.instanceId = instances[0].id;
  const issues = load("src/lib/automations/contract.ts").validateFlow(definition);
  if (issues.length) throw new Error(issues.map(i => i.message).join("; "));
  const name = "Cadastro pelo WhatsApp — culto";
  mkdirSync(".codex-local/automation-queue", { recursive: true });
  writeFileSync(".codex-local/automation-queue/registration-flow.json", JSON.stringify({ name, definition }, null, 2));
  if (process.argv.includes("--apply")) {
    const flow = await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtext(${`registration-draft:${company.id}`}))`;
      const [existing] = await tx`select id,status from public.automation_flows where company_id=${company.id} and name=${name} and status<>'archived'`;
      if (existing) return existing;
      const [created] = await tx`insert into public.automation_flows(company_id,name,description,draft,created_by)
        values(${company.id},${name},'Mensagem cadastro → nome completo → e-mail → congregação → pessoa e acesso → confirmação',${JSON.stringify(definition)}::jsonb,${actor.id}) returning id,status`;
      return created;
    });
    console.log(JSON.stringify({ ...flow, congregations: congregations.total, instanceSelected: true, published: false }));
  } else console.log(JSON.stringify({ valid: true, savedLocally: true, congregations: congregations.total }));
} finally { await sql.end({ timeout: 5 }); }
