import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("ERRO: POSTGRES_URL não definida.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

const COMPANY_ID = "d2f5b9c0-029e-4d7d-9c8b-feb9de7e4680";
const ADMIN_PROFILE_ID = "2d67aa6e-7a9e-4533-bb2d-6312e570cfb4";

const CATEGORIES_DATA = [
  { name: "Jovens", description: "Células focadas em juventude, adolescentes e universitários", sortOrder: 1 },
  { name: "Casais", description: "Células para fortalecimento de casais e lares", sortOrder: 2 },
  { name: "Mulheres", description: "Células voltadas para comunhão e edificação feminina", sortOrder: 3 },
  { name: "Homens", description: "Células voltadas para comunhão e liderança masculina", sortOrder: 4 },
  { name: "Família", description: "Células multifamiliares com integração de pais e filhos", sortOrder: 5 },
];

const LEADERS_DATA = [
  { firstName: "Lucas", lastName: "Oliveira", fullName: "Lucas Oliveira", phone: "22998124011", gender: "male" },
  { firstName: "Priscila", lastName: "Souza", fullName: "Priscila Souza", phone: "22997235522", gender: "female" },
  { firstName: "Gabriel", lastName: "Santos", fullName: "Gabriel Santos", phone: "22996347733", gender: "male" },
  { firstName: "Camila", lastName: "Rodrigues", fullName: "Camila Rodrigues", phone: "22995458844", gender: "female" },
  { firstName: "Thiago", lastName: "Ferreira", fullName: "Thiago Ferreira", phone: "22994569955", gender: "male" },
  { firstName: "Beatriz", lastName: "Lima", fullName: "Beatriz Lima", phone: "22993671166", gender: "female" },
  { firstName: "Rodrigo", lastName: "Almeida", fullName: "Rodrigo Almeida", phone: "22992782277", gender: "male" },
  { firstName: "Juliana", lastName: "Costa", fullName: "Juliana Costa", phone: "22991893388", gender: "female" },
  { firstName: "Felipe", lastName: "Martins", fullName: "Felipe Martins", phone: "22990904499", gender: "male" },
  { firstName: "Mariana", lastName: "Ribeiro", fullName: "Mariana Ribeiro", phone: "22989015500", gender: "female" },
];

const CELLS_DATA = [
  {
    name: "Célula Conectados",
    categoryName: "Jovens",
    congregationName: "Centro",
    leaderName: "Lucas Oliveira",
    neighborhood: "Costazul",
    meetingLocation: "Av. Roberto Silveira",
    addressNumber: "340",
    addressComplement: "Casa 2",
    postalCode: "28895114",
    latitude: -22.5234158,
    longitude: -41.9240227,
    meetingDay: "Sábado",
    meetingTime: "19:30:00",
    description: "Comunhão, louvor, palavra relevante e conexão para a juventude e universitários em Costazul.",
    maxCapacity: 15,
    minAge: 16,
    maxAge: 29,
  },
  {
    name: "Célula Betel Casais",
    categoryName: "Casais",
    congregationName: "Centro",
    leaderName: "Priscila Souza",
    neighborhood: "Centro",
    meetingLocation: "Rua Bento Costa",
    addressNumber: "125",
    addressComplement: "Apto 302",
    postalCode: "28893054",
    latitude: -22.5256989,
    longitude: -41.9412517,
    meetingDay: "Quinta",
    meetingTime: "20:00:00",
    description: "Fortalecendo lares, casamentos e famílias com princípios bíblicos no coração de Rio das Ostras.",
    maxCapacity: 14,
    minAge: null,
    maxAge: null,
  },
  {
    name: "Célula Graça & Vida",
    categoryName: "Geral",
    congregationName: "Centro",
    leaderName: "Gabriel Santos",
    neighborhood: "Recreio",
    meetingLocation: "Rua Jane Maria Martins",
    addressNumber: "88",
    addressComplement: "",
    postalCode: "28895475",
    latitude: -22.5120100,
    longitude: -41.9236578,
    meetingDay: "Quarta",
    meetingTime: "19:30:00",
    description: "Ambiente caloroso e acolhedor para estudo bíblico prático, oração e comunhão fraterna.",
    maxCapacity: 16,
    minAge: null,
    maxAge: null,
  },
  {
    name: "Célula Manancial",
    categoryName: "Mulheres",
    congregationName: "Village",
    leaderName: "Camila Rodrigues",
    neighborhood: "Jardim Mariléa",
    meetingLocation: "Rua Niterói",
    addressNumber: "512",
    addressComplement: "Casa dos Fundos",
    postalCode: "28896061",
    latitude: -22.5023050,
    longitude: -41.9298380,
    meetingDay: "Terça",
    meetingTime: "19:30:00",
    description: "Encontro feminino para edificação mútua, discipulado, oração fervorosa e crescimento espiritual.",
    maxCapacity: 18,
    minAge: 18,
    maxAge: null,
  },
  {
    name: "Célula Videira Verdadeira",
    categoryName: "Geral",
    congregationName: "Village",
    leaderName: "Thiago Ferreira",
    neighborhood: "Cidade Praiana",
    meetingLocation: "Rua Santa Catarina",
    addressNumber: "230",
    addressComplement: "",
    postalCode: "28890120",
    latitude: -22.5472085,
    longitude: -41.9813890,
    meetingDay: "Quarta",
    meetingTime: "20:00:00",
    description: "Permanecendo firmes em Cristo, gerando frutos de amor, acolhimento e amizade verdadeira.",
    maxCapacity: 12,
    minAge: null,
    maxAge: null,
  },
  {
    name: "Célula Nova Vida",
    categoryName: "Família",
    congregationName: "Village",
    leaderName: "Beatriz Lima",
    neighborhood: "Enseada das Gaivotas",
    meetingLocation: "Rua dos Cravos",
    addressNumber: "45",
    addressComplement: "Condomínio Gaivotas, Bloco B",
    postalCode: "28899455",
    latitude: -22.4947262,
    longitude: -41.9092789,
    meetingDay: "Quinta",
    meetingTime: "20:00:00",
    description: "Uma família para pertencer! Palavra viva para todas as idades, amizade sincera e apoio mútuo.",
    maxCapacity: 15,
    minAge: null,
    maxAge: null,
  },
  {
    name: "Célula Farol dos Homens",
    categoryName: "Homens",
    congregationName: "Village",
    leaderName: "Rodrigo Almeida",
    neighborhood: "Mar do Norte",
    meetingLocation: "Alameda das Garças",
    addressNumber: "102",
    addressComplement: "",
    postalCode: "28898028",
    latitude: -22.4483569,
    longitude: -41.8663001,
    meetingDay: "Segunda",
    meetingTime: "20:00:00",
    description: "Homens reunidos para compartilhar a fé, desenvolver liderança cristã no lar e discipulado bíblico.",
    maxCapacity: 12,
    minAge: 18,
    maxAge: null,
  },
  {
    name: "Célula Ágape",
    categoryName: "Geral",
    congregationName: "Village",
    leaderName: "Juliana Costa",
    neighborhood: "Âncora",
    meetingLocation: "Rua das Violetas",
    addressNumber: "78",
    addressComplement: "Casa 1",
    postalCode: "28899374",
    latitude: -22.4814971,
    longitude: -41.9130247,
    meetingDay: "Quarta",
    meetingTime: "19:30:00",
    description: "O amor de Deus em ação, discipulado bíblico e transformação de vidas no bairro Âncora.",
    maxCapacity: 15,
    minAge: null,
    maxAge: null,
  },
  {
    name: "Célula Elo de Amor",
    categoryName: "Família",
    congregationName: "Centro",
    leaderName: "Felipe Martins",
    neighborhood: "Ouro Verde",
    meetingLocation: "Rua das Flores",
    addressNumber: "160",
    addressComplement: "",
    postalCode: "28895475",
    latitude: -22.5098196,
    longitude: -41.9209434,
    meetingDay: "Sexta",
    meetingTime: "20:00:00",
    description: "Reunião de famílias com partilha abençoada, oração pelos lares e fortalecimento dos relacionamentos.",
    maxCapacity: 20,
    minAge: null,
    maxAge: null,
  },
  {
    name: "Célula Esperança Viva",
    categoryName: "Jovens",
    congregationName: "Centro",
    leaderName: "Mariana Ribeiro",
    neighborhood: "Nova Esperança",
    meetingLocation: "Rua Esperança",
    addressNumber: "95",
    addressComplement: "Sobrado",
    postalCode: "28893570",
    latitude: -22.5223143,
    longitude: -41.9327169,
    meetingDay: "Sexta",
    meetingTime: "19:45:00",
    description: "Juventude apaixonada pelo Reino de Deus, música, bate-papo descontraído e propósito no Nova Esperança.",
    maxCapacity: 16,
    minAge: 15,
    maxAge: 28,
  },
];

async function main() {
  console.log("Iniciando criação de 10 células de demonstração em Rio das Ostras - RJ...");

  // 1. Congregações
  const congregRows = await sql`
    select id, name from public.congregations where company_id = ${COMPANY_ID} and deleted_at is null
  `;
  const congregMap = new Map();
  for (const c of congregRows) {
    congregMap.set(c.name.toLowerCase().trim(), c.id);
  }

  // 2. Garantir categorias
  for (const cat of CATEGORIES_DATA) {
    const existing = await sql`
      select id from public.group_categories
      where company_id = ${COMPANY_ID} and lower(name) = lower(${cat.name}) and deleted_at is null
      limit 1
    `;
    if (!existing[0]) {
      await sql`
        insert into public.group_categories (company_id, name, description, sort_order, is_active, created_by, updated_by)
        values (${COMPANY_ID}, ${cat.name}, ${cat.description}, ${cat.sortOrder}, true, ${ADMIN_PROFILE_ID}, ${ADMIN_PROFILE_ID})
      `;
      console.log(`[Categoria criada] ${cat.name}`);
    }
  }

  const catRows = await sql`
    select id, name from public.group_categories where company_id = ${COMPANY_ID} and deleted_at is null
  `;
  const catMap = new Map();
  for (const c of catRows) {
    catMap.set(c.name.toLowerCase().trim(), c.id);
  }

  // 3. Garantir líderes (pessoas)
  const leaderMap = new Map();
  for (const l of LEADERS_DATA) {
    const existing = await sql`
      select id from public.people
      where company_id = ${COMPANY_ID} and lower(full_name) = lower(${l.fullName}) and deleted_at is null
      limit 1
    `;
    if (existing[0]) {
      leaderMap.set(l.fullName, existing[0].id);
    } else {
      const inserted = await sql`
        insert into public.people (
          company_id, first_name, last_name, full_name, phone, gender,
          person_type, status, city, state, is_active, created_by, updated_by
        )
        values (
          ${COMPANY_ID}, ${l.firstName}, ${l.lastName}, ${l.fullName}, ${l.phone}, ${l.gender},
          'leader', 'active', 'Rio das Ostras', 'RJ', true, ${ADMIN_PROFILE_ID}, ${ADMIN_PROFILE_ID}
        )
        returning id
      `;
      leaderMap.set(l.fullName, inserted[0].id);
      console.log(`[Líder criado] ${l.fullName} (${l.phone})`);
    }
  }

  // 4. Criar ou atualizar as 10 células
  let createdCount = 0;
  let updatedCount = 0;

  for (const cell of CELLS_DATA) {
    const categoryId = catMap.get(cell.categoryName.toLowerCase().trim()) || catMap.get("geral") || null;
    const congregationId = congregMap.get(cell.congregationName.toLowerCase().trim()) || congregRows[0]?.id || null;
    const leaderId = leaderMap.get(cell.leaderName) || null;

    const existingCell = await sql`
      select id from public.groups
      where company_id = ${COMPANY_ID}
        and lower(name) = lower(${cell.name})
        and type = 'cell'
        and deleted_at is null
      limit 1
    `;

    if (existingCell[0]) {
      await sql`
        update public.groups
        set
          category_id = ${categoryId},
          congregation_id = ${congregationId},
          leader_person_id = ${leaderId},
          description = ${cell.description},
          meeting_day = ${cell.meetingDay},
          meeting_time = ${cell.meetingTime},
          meeting_location = ${cell.meetingLocation},
          postal_code = ${cell.postalCode},
          address_number = ${cell.addressNumber},
          address_complement = ${cell.addressComplement},
          neighborhood = ${cell.neighborhood},
          city = 'Rio das Ostras',
          state = 'RJ',
          max_capacity = ${cell.maxCapacity},
          min_age = ${cell.minAge},
          max_age = ${cell.maxAge},
          accepts_requests = true,
          is_active = true,
          latitude = ${cell.latitude},
          longitude = ${cell.longitude},
          is_address_public = true,
          is_leader_whatsapp_public = true,
          updated_by = ${ADMIN_PROFILE_ID},
          updated_at = now()
        where id = ${existingCell[0].id}
      `;
      updatedCount++;
      console.log(`[Célula atualizada] ${cell.name} (${cell.neighborhood})`);
    } else {
      await sql`
        insert into public.groups (
          company_id,
          category_id,
          congregation_id,
          name,
          description,
          type,
          leader_person_id,
          meeting_day,
          meeting_time,
          meeting_location,
          postal_code,
          address_number,
          address_complement,
          neighborhood,
          city,
          state,
          max_capacity,
          min_age,
          max_age,
          accepts_requests,
          is_active,
          latitude,
          longitude,
          is_address_public,
          is_leader_whatsapp_public,
          created_by,
          updated_by
        )
        values (
          ${COMPANY_ID},
          ${categoryId},
          ${congregationId},
          ${cell.name},
          ${cell.description},
          'cell',
          ${leaderId},
          ${cell.meetingDay},
          ${cell.meetingTime},
          ${cell.meetingLocation},
          ${cell.postalCode},
          ${cell.addressNumber},
          ${cell.addressComplement},
          ${cell.neighborhood},
          'Rio das Ostras',
          'RJ',
          ${cell.maxCapacity},
          ${cell.minAge},
          ${cell.maxAge},
          true,
          true,
          ${cell.latitude},
          ${cell.longitude},
          true,
          true,
          ${ADMIN_PROFILE_ID},
          ${ADMIN_PROFILE_ID}
        )
      `;
      createdCount++;
      console.log(`[Célula criada] ${cell.name} no bairro ${cell.neighborhood}`);
    }
  }

  // 5. Verificação final
  const allCells = await sql`
    select
      g.id,
      g.name,
      g.neighborhood,
      g.city,
      g.meeting_day,
      g.meeting_time,
      g.latitude,
      g.longitude,
      gc.name as category,
      p.full_name as leader,
      p.phone as leader_phone
    from public.groups g
    left join public.group_categories gc on gc.id = g.category_id
    left join public.people p on p.id = g.leader_person_id
    where g.company_id = ${COMPANY_ID}
      and g.type = 'cell'
      and g.deleted_at is null
      and g.is_active = true
    order by g.neighborhood asc
  `;

  console.log("\n=======================================================");
  console.log(`Sucesso! Total de células ativas no sistema: ${allCells.length}`);
  console.log(`Criadas: ${createdCount} | Atualizadas: ${updatedCount}`);
  console.log("=======================================================\n");
  console.table(
    allCells.map((c, i) => ({
      "#": i + 1,
      Nome: c.name,
      Bairro: c.neighborhood,
      Categoria: c.category || "Geral",
      Dia: c.meeting_day,
      Horário: c.meeting_time?.slice(0, 5),
      Líder: c.leader,
      Lat: c.latitude,
      Lng: c.longitude,
    }))
  );
}

try {
  await main();
} catch (err) {
  console.error("Erro ao executar script de seed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
