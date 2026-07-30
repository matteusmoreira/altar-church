"use client"

import { useEffect, useRef, useState } from "react"
import { Bold, ExternalLink, Italic, List, ListOrdered, Underline } from "lucide-react"
import { Button } from "@/components/ui/button"

type RichTextEditorProps = {
  name: string
  label?: string
  placeholder?: string
  maxLength?: number
}

function runCommand(command: string, value?: string) {
  document.execCommand(command, false, value)
}

export function RichTextEditor({ name, label, placeholder, maxLength }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    const form = editorRef.current?.closest("form")
    if (!form) return
    const reset = () => {
      setValue("")
      if (editorRef.current) editorRef.current.innerHTML = ""
    }
    form.addEventListener("reset", reset)
    return () => form.removeEventListener("reset", reset)
  }, [])

  function updateValue() {
    setValue(editorRef.current?.innerHTML ?? "")
  }

  function insertButton() {
    const label = window.prompt("Texto do botão", "Saiba mais")?.trim()
    const url = window.prompt("URL do botão (http:// ou https://)", "https://")?.trim()
    if (!label || !url || !/^https?:\/\//i.test(url)) return
    editorRef.current?.focus()
    runCommand("insertHTML", `<a href="${url.replaceAll('"', "&quot;")}" data-cell-button="true">${label.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</a>`)
    updateValue()
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="flex flex-wrap gap-1 border-b bg-muted/40 p-2" aria-label="Formatação do aviso">
          <Button type="button" variant="ghost" size="icon-sm" title="Negrito" aria-label="Negrito" onMouseDown={(event) => event.preventDefault()} onClick={() => { editorRef.current?.focus(); runCommand("bold"); updateValue() }}><Bold /></Button>
          <Button type="button" variant="ghost" size="icon-sm" title="Itálico" aria-label="Itálico" onMouseDown={(event) => event.preventDefault()} onClick={() => { editorRef.current?.focus(); runCommand("italic"); updateValue() }}><Italic /></Button>
          <Button type="button" variant="ghost" size="icon-sm" title="Sublinhado" aria-label="Sublinhado" onMouseDown={(event) => event.preventDefault()} onClick={() => { editorRef.current?.focus(); runCommand("underline"); updateValue() }}><Underline /></Button>
          <Button type="button" variant="ghost" size="icon-sm" title="Lista" aria-label="Lista" onMouseDown={(event) => event.preventDefault()} onClick={() => { editorRef.current?.focus(); runCommand("insertUnorderedList"); updateValue() }}><List /></Button>
          <Button type="button" variant="ghost" size="icon-sm" title="Lista numerada" aria-label="Lista numerada" onMouseDown={(event) => event.preventDefault()} onClick={() => { editorRef.current?.focus(); runCommand("insertOrderedList"); updateValue() }}><ListOrdered /></Button>
          <Button type="button" variant="ghost" size="icon-sm" title="Inserir link" aria-label="Inserir link" onMouseDown={(event) => event.preventDefault()} onClick={() => { const url = window.prompt("URL (http:// ou https://)")?.trim(); if (!url || !/^https?:\/\//i.test(url)) return; editorRef.current?.focus(); runCommand("createLink", url); updateValue() }}><ExternalLink /></Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={insertButton}><ExternalLink />Inserir botão</Button>
        </div>
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          className="min-h-36 p-3 text-sm outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a[data-cell-button=true]]:inline-flex [&_a[data-cell-button=true]]:items-center [&_a[data-cell-button=true]]:rounded-lg [&_a[data-cell-button=true]]:bg-primary [&_a[data-cell-button=true]]:px-3 [&_a[data-cell-button=true]]:py-2 [&_a[data-cell-button=true]]:font-semibold [&_a[data-cell-button=true]]:text-primary-foreground"
          onInput={updateValue}
          suppressContentEditableWarning
        />
      </div>
      <input type="hidden" name={name} value={value} required={Boolean(maxLength)} maxLength={maxLength} />
    </div>
  )
}
