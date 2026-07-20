import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const readBinary = (path) => readFileSync(new URL(`../${path}`, import.meta.url))

function pngSize(path) {
  const png = readBinary(path)
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG")
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  }
}

test("PWA manifest has stable identity, adaptive entry and dedicated icons", () => {
  const manifest = read("src/app/manifest.ts")
  const entry = read("src/app/page.tsx")
  assert.match(manifest, /id: "\/"/)
  assert.match(manifest, /start_url: "\/"/)
  assert.match(manifest, /scope: "\/"/)
  assert.match(manifest, /display: "standalone"/)
  assert.match(manifest, /icon-192\.png/)
  assert.match(manifest, /icon-512\.png/)
  assert.match(manifest, /icon-maskable-512\.png/)
  assert.match(entry, /LandingPage/)
  assert.match(entry, /isPortalRole\(user\.role\)[\s\S]*redirect\("\/membro"\)/)
  assert.match(entry, /redirect\("\/dashboard"\)/)

  assert.deepEqual(pngSize("public/icons/icon-192.png"), { width: 192, height: 192 })
  assert.deepEqual(pngSize("public/icons/icon-512.png"), { width: 512, height: 512 })
  assert.deepEqual(pngSize("public/icons/icon-maskable-512.png"), { width: 512, height: 512 })
  assert.deepEqual(pngSize("public/icons/apple-touch-icon.png"), { width: 180, height: 180 })
})

test("global installer handles native prompt, cancellation, installed state and fallbacks", () => {
  const installer = read("src/components/pwa-install.tsx")
  assert.match(installer, /beforeinstallprompt/)
  assert.match(installer, /installPrompt\.prompt\(\)/)
  assert.match(installer, /installPrompt\.userChoice/)
  assert.match(installer, /choice\.outcome === "accepted"/)
  assert.match(installer, /appinstalled/)
  assert.match(installer, /display-mode: standalone/)
  assert.match(installer, /standalone\?: boolean/)
  assert.match(installer, /iPad\|iPhone\|iPod/)
  assert.match(installer, /Android/)
  assert.match(installer, /Adicionar à Tela de Início/)
  assert.match(installer, /Abrir no Safari/)
  assert.match(installer, /Abrir no\s+Chrome/)
})

test("install CTA is global while push permission remains separate", () => {
  const layout = read("src/app/layout.tsx")
  const dashboard = read("src/components/layout/dashboard-layout.tsx")
  const family = read("src/app/(portal)/familia/kids/familia-kids-client.tsx")
  const login = read("src/app/(auth)/login/page.tsx")
  const volunteer = read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx")

  assert.match(layout, /PwaInstallProvider/)
  assert.match(dashboard, /PwaInstallBanner/)
  assert.match(dashboard, /PwaInstallButton/)
  assert.match(family, /PwaInstallBanner/)
  assert.match(family, /PwaInstallButton/)
  assert.match(login, /PwaInstallButton/)
  assert.doesNotMatch(volunteer, /beforeinstallprompt/)
  assert.match(volunteer, /PushControls/)
  assert.match(volunteer, /Notification\.requestPermission/)
})

test("service worker precaches current PWA assets", () => {
  const worker = read("public/sw.js")
  assert.match(worker, /altar-static-v3/)
  for (const icon of [
    "icon-192.png",
    "icon-512.png",
    "icon-maskable-512.png",
    "apple-touch-icon.png",
  ]) {
    assert.match(worker, new RegExp(icon.replace(".", "\\.")))
  }
})
