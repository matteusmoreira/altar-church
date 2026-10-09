// Real editor and reader UI with fictional data; no remote messages or database writes.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createServer } from "node:http"

const root = process.cwd()
const require = createRequire(resolve(root, "package.json"))
const { chromium, expect } = require("@playwright/test")
const vendor = require("next/dist/compiled/webpack/webpack")
const directory = await mkdtemp(resolve(tmpdir(), "notification-rich-"))
const output = resolve(root, "test-results/notification-rich")
let server, browser
try {
  await mkdir(output, { recursive: true })
  await writeFile(resolve(directory, "loader.cjs"), `const ts = require(${JSON.stringify(resolve(root, "node_modules/typescript"))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText; };`)
  await writeFile(resolve(directory, "entry.tsx"), `import React from 'react'; import {createRoot} from 'react-dom/client'; import {NotificationMessageFields} from '@/components/notifications/message-fields'; import {NotificationRichContent} from '@/components/notifications/rich-content'; function App(){ const [content,setContent]=React.useState('');return <main className="mx-auto max-w-2xl space-y-6 p-4"><form onSubmit={e=>{e.preventDefault(); const data=new FormData(e.currentTarget);window.saved=Object.fromEntries(data);setContent(String(data.get('content')))}}><NotificationMessageFields><p>Público: Todas as pessoas</p></NotificationMessageFields><button type="submit">Conferir mensagem</button></form><section aria-label="Mensagem completa"><NotificationRichContent content={content}/></section></main>}createRoot(document.getElementById('root')).render(<App/>);`)
  const compiler = vendor.webpack({ mode: "development", devtool: false, entry: resolve(directory, "entry.tsx"), output: { path: directory, filename: "bundle.js" }, resolve: { extensions: [".tsx", ".ts", ".js"], modules: [resolve(root, "node_modules")], alias: { "@": resolve(root, "src") } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: resolve(directory, "loader.cjs") }] } })
  await new Promise((accept, reject) => compiler.run((error, stats) => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : accept()))
  await new Promise((accept, reject) => compiler.close(error => error ? reject(error) : accept()))
  const css = await require("postcss")([require("@tailwindcss/postcss")({ base: root })]).process(await readFile(resolve(root, "src/app/globals.css"), "utf8"), { from: resolve(root, "src/app/globals.css") })
  await writeFile(resolve(directory, "style.css"), css.css)
  server = createServer(async (request, response) => {
    if (["/bundle.js", "/style.css"].includes(request.url)) {
      response.setHeader("Content-Type", request.url.endsWith(".js") ? "text/javascript" : "text/css")
      response.end(await readFile(resolve(directory, request.url.slice(1))))
    } else response.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>')
  })
  await new Promise(accept => server.listen(0, "127.0.0.1", accept))
  browser = await chromium.launch({ headless: true })
  for (const [name, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport })
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const editor = page.getByRole("textbox", { name: "Conteúdo *", exact: true })
    await editor.fill("Culto especial")
    await editor.selectText()
    await page.getByRole("button", { name: "Negrito", exact: true }).click()
    page.once("dialog", dialog => dialog.accept("https://example.com/evento?a=1&b=2"))
    await page.getByRole("button", { name: "Inserir link", exact: true }).click()
    await page.getByRole("button", { name: "Conferir mensagem" }).click()
    const reader = page.getByRole("region", { name: "Mensagem completa" })
    await expect(reader.getByRole("link", { name: "Culto especial" })).toHaveAttribute("href", "https://example.com/evento?a=1&b=2")
    assert.match((await page.evaluate(() => window.saved.content)), /<(b|strong)>/)
    await editor.focus()
    await page.keyboard.press("Control+End")
    await page.keyboard.press("Enter")
    const answers = ["Inscrever-se", "https://example.com/inscricao"]
    const respond = dialog => dialog.accept(answers.shift())
    page.on("dialog", respond)
    await page.getByRole("button", { name: "Inserir botão", exact: true }).click()
    page.off("dialog", respond)
    await page.getByRole("button", { name: "Conferir mensagem" }).click()
    await expect(reader.getByRole("link", { name: "Inscrever-se" })).toHaveAttribute("data-cell-button", "true")
    await expect(reader.getByRole("link", { name: "Culto especial" })).toBeVisible()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true })
    await page.getByRole("combobox", { name: "Canal *" }).selectOption("whatsapp")
    await expect(page.locator('textarea[name="content"]')).toBeVisible()
    assert.equal(await page.locator('[contenteditable="true"]').count(), 0)
    assert.deepEqual(errors, [])
    console.log(`${name}: editor, links, buttons, reader and channel switch passed`)
    await page.close()
  }
} finally {
  await browser?.close()
  if (server) await new Promise(accept => server.close(accept))
  await rm(directory, { recursive: true, force: true })
}
