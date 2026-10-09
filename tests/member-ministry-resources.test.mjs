import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import test from "node:test"
import ts from "typescript"
import { PGlite } from "@electric-sql/pglite"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const require = createRequire(import.meta.url)
function load(path, bindings) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const loadedModule = { exports: {} }
  new Function("require", "module", "exports", source)(name => name in bindings ? bindings[name] : require(name), loadedModule, loadedModule.exports)
  return loadedModule.exports
}

test("ministry information returns every allowed resource and signs only files in the same church", async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`create table ministry_resources(id uuid,company_id uuid,ministry_id uuid,title text,description text default '',category text default 'geral',external_url text,file_id uuid,visibility text,sort_order int default 0,deleted_at timestamptz);
    create table app_files(id uuid,company_id uuid,original_name text,storage_path text,mime_type text,is_active boolean default true,deleted_at timestamptz);`)
  const companyId = randomUUID(), ministryId = randomUUID(), otherChurch = randomUUID(), otherMinistry = randomUUID(), image = randomUUID(), foreignFile = randomUUID()
  const access = { companyId, ministryId, canManage: false }
  await db.query("insert into app_files(id,company_id,original_name,storage_path,mime_type) values($1,$2,'foto.png','church/foto.png','image/png'),($3,$4,'privado.png','other/privado.png','image/png')", [image, companyId, foreignFile, otherChurch])
  const insert = async (title, visibility = 'members', church = companyId, ministry = ministryId, file = null, deleted = null, url = null) => db.query("insert into ministry_resources(id,company_id,ministry_id,title,visibility,file_id,deleted_at,external_url) values($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(),church,ministry,title,visibility,file,deleted,url])
  await insert('Imagem', 'members', companyId, ministryId, image)
  await insert('Link', 'public', companyId, ministryId, null, null, 'https://example.com/material')
  await insert('Liderança', 'leaders')
  await insert('Outra igreja', 'members', otherChurch)
  await insert('Outro ministério', 'members', companyId, otherMinistry)
  await insert('Excluído', 'members', companyId, ministryId, image, new Date())
  await insert('Arquivo de outra igreja', 'members', companyId, ministryId, foreignFile)
  for (let i = 0; i < 25; i++) await insert(`Material ${i}`)
  let signedPaths
  const sql = async (strings, ...params) => {
    const query = strings.reduce((text, part, i) => text + part + (i < params.length ? `$${i + 1}` : ''), '')
    if (query.includes('from public.ministry_resources')) return (await db.query(query, params)).rows
    if (query.includes('from public.ministries')) return [{ id: ministryId, name: 'Tecnologia' }]
    return []
  }
  const { getMemberMinistryDetails } = load('src/lib/member/ministry-details.ts', {
    'server-only': {}, '@/lib/db/client': { getSql: () => sql },
    '@/lib/ministries/access': { resolveMinistryAccess: async () => access },
    '@/lib/api/errors': { badRequest: message => new Error(message) },
    '@/lib/files/server': { createSignedUrlsByStoragePath: async paths => { signedPaths = paths; return new Map(paths.map(path => [path, `https://example.com/signed/${path}`])) } },
  })
  const result = await getMemberMinistryDetails(ministryId)
  assert.equal(result.resources.length, 28)
  assert.deepEqual(signedPaths, ['church/foto.png'])
  assert.equal(result.resources.find(r => r.title === 'Imagem').mimeType, 'image/png')
  assert.equal(result.resources.find(r => r.title === 'Imagem').fileUrl, 'https://example.com/signed/church/foto.png')
  assert.equal(result.resources.find(r => r.title === 'Arquivo de outra igreja').fileUrl, null)
  assert.equal(result.resources.find(r => r.title === 'Link').externalUrl, 'https://example.com/material')
  access.canManage = true
  assert.equal((await getMemberMinistryDetails(ministryId)).resources.length, 29)
})

test("information dialog renders image previews, documents, external links and empty state", () => {
  const data = { activities: [], resources: [
    { id: 'image', title: 'Foto do ministério', category: 'Fotos', mimeType: 'image/png', fileUrl: 'https://example.com/foto.png', fileName: 'foto.png' },
    { id: 'pdf', title: 'Manual', category: 'Materiais', mimeType: 'application/pdf', fileUrl: 'https://example.com/manual.pdf', fileName: 'manual.pdf' },
    { id: 'link', title: 'Site', externalUrl: 'https://example.com/site' },
  ] }
  const wrapper = ({ children }) => React.createElement('div', null, children)
  const { MinistryInformation } = load('src/components/member/ministry-information.tsx', {
    react: { ...React, useEffect: () => {}, useRef: () => ({ current: 0 }), useState: initial => [initial === null ? data : initial, () => {}] },
    '@/components/ui/button': { Button: wrapper },
    '@/components/ui/dialog': Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(name => [name, wrapper])),
    '@/components/ministries/chat-client': {}, './assignment-absence': {}, '@/lib/utils': { cn: () => '' },
  })
  const render = () => renderToStaticMarkup(React.createElement(MinistryInformation, { ministryId: 'ministry', name: 'Tecnologia', open: true, onOpenChange() {} }))
  const html = render()
  assert.ok(html.indexOf('Próximas atividades e escalas</h3>') < html.indexOf('Recursos</h3>'))
  assert.match(html, /<img[^>]+src="https:\/\/example.com\/foto.png"[^>]+alt="Foto do ministério"/)
  assert.match(html, /href="https:\/\/example.com\/manual.pdf"/)
  assert.match(html, /href="https:\/\/example.com\/site"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.equal((html.match(/<img/g) || []).length, 1)
  data.resources = []
  assert.match(render(), /Nenhum recurso disponível neste ministério/)
})
