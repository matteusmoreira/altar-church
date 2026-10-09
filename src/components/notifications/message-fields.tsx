"use client"

import { useState, type ReactNode } from "react"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function NotificationMessageFields({ children }: { children: ReactNode }) {
  const [method, setMethod] = useState("push")
  return <div className="space-y-4">
    <div className="grid gap-2">
      <Label htmlFor="notificationMethod">Canal *</Label>
      <select id="notificationMethod" name="method" value={method} onChange={(event) => setMethod(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
        <option value="push">Push</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option>
      </select>
      {method === "push" && <p className="text-xs text-muted-foreground">Cada destinatário precisa ativar os avisos no próprio dispositivo, em Preferências de comunicação.</p>}
    </div>
    {children}
    <div className="grid gap-2 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_a]:text-primary [&_a]:underline">
      {method === "push" ? <>
        <RichTextEditor name="content" label="Conteúdo *" placeholder="Escreva a mensagem e inclua links ou botões." maxLength={20000} />
        <p className="text-xs text-muted-foreground">O push mostra uma prévia em texto simples. Ao tocar no aviso, a pessoa abre a mensagem completa no PWA, com formatação e links.</p>
      </> : <><Label htmlFor="content">Conteúdo *</Label><Textarea id="content" name="content" rows={4} required /></>}
    </div>
  </div>
}
