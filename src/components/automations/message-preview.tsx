"use client";
import { useEffect, useState } from "react";
import { renderText, type AutomationMessage } from "@/lib/automations/contract";
import { automationMediaPreview } from "@/lib/automations/actions";

export function MediaThumbnail({
  id,
  name,
  preview,
}: {
  id: string;
  name: string;
  preview?: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!id || preview) return;
    let active = true;
    void automationMediaPreview(id)
      .then((result) => {
        if (active) setUrl(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, preview]);
  // Private storage URLs are short lived and scoped by the server to this church.
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className="h-28 w-full rounded-md object-cover" />
  ) : (
    <div className="flex h-20 items-center justify-center rounded-md bg-muted text-xs">
      {name || "Imagem não selecionada"}
    </div>
  );
}

const example = {
  nome: "Ana Silva",
  primeiro_nome: "Ana",
  igreja: "Sua igreja",
  celula: "Célula Esperança",
  lider: "João",
  horario: "19:30",
  evento: "Encontro",
  resposta: "Sim",
  ai_text: "Mensagem personalizada",
};
export function MessagePreview({
  message,
  context = example,
  preview,
}: {
  message: AutomationMessage;
  context?: Record<string, string>;
  preview?: boolean;
}) {
  const render = (s: string) => renderText(s, context);
  return (
    <div
      aria-label="Prévia da mensagem"
      className="space-y-2 rounded-xl bg-emerald-50 p-3 text-sm text-slate-800 dark:bg-emerald-950 dark:text-slate-100"
    >
      <p className="text-[10px] uppercase tracking-wider">Prévia da mensagem</p>
      <p className="whitespace-pre-wrap break-words">{render(message.text)}</p>
      {message.type === "button" &&
        message.buttons.map((b, i) => (
          <div
            key={i}
            className="rounded-md border p-1 text-center break-words"
          >
            {render(b.label)}
          </div>
        ))}
      {message.type === "list" && (
        <>
          <p className="text-center">☰ {render(message.listButton)}</p>
          {message.sections.map((s, i) => (
            <div key={i}>
              <p className="font-medium">{render(s.title)}</p>
              {s.items.map((item, j) => (
                <div key={j} className="border-b py-1">
                  <p className="break-words">{render(item.label)}</p>
                  <p className="break-words text-xs opacity-70">
                    {render(item.description)}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
      {message.type === "carousel" && (
        <div className="flex gap-2 overflow-x-auto">
          {message.cards.map((card, i) => (
            <div
              key={`${card.mediaFileId}:${i}`}
              className="w-44 shrink-0 space-y-2 rounded-md border p-2"
            >
              <MediaThumbnail
                id={card.mediaFileId}
                name={card.filename || `Cartão ${i + 1}`}
                preview={preview}
              />
              <p className="break-words whitespace-pre-wrap">
                {render(card.text)}
              </p>
              {card.buttons.map((b, j) => (
                <p className="border p-1 text-center break-words" key={j}>
                  {render(b.label)}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
      {"footer" in message && message.footer && (
        <p className="break-words text-xs opacity-70">
          {render(message.footer)}
        </p>
      )}
      {"mediaFileId" in message && (
        <p className="text-xs">{message.filename || "Mídia"}</p>
      )}
    </div>
  );
}
