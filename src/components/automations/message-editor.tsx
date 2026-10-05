"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  VARIABLES,
  renderText,
  type AutomationMessage,
} from "@/lib/automations/contract";
import { uploadAutomationMedia } from "@/lib/automations/actions";
import { toast } from "sonner";
const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
type Props = {
  value: AutomationMessage;
  onChange: (value: AutomationMessage) => void;
  preview?: boolean;
};
export function MessageEditor({ value, onChange, preview }: Props) {
  const type = value.type;
  function changeType(next: string) {
    const text = value.text || "Olá, {{primeiro_nome}}!";
    if (next === "text") onChange({ type: "text", text });
    else if (next === "button")
      onChange({
        type: "button",
        text,
        footer: "",
        buttons: [{ label: "Sim", action: "reply", value: "sim" }],
      });
    else if (next === "list")
      onChange({
        type: "list",
        text,
        footer: "",
        listButton: "Ver opções",
        sections: [
          {
            title: "Opções",
            items: [{ label: "Quero saber mais", id: "mais", description: "" }],
          },
        ],
      });
    else if (next === "carousel")
      onChange({ type: "carousel", text, cards: [] });
    else
      onChange({
        type: next as "image" | "video" | "audio" | "document",
        text,
        mediaFileId: "",
        filename: "",
      });
  }
  async function upload(file: File, index?: number) {
    if (preview) {
      toast.info("Envio de arquivos está desabilitado nesta prévia");
      return;
    }
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await uploadAutomationMedia(form);
      if (value.type === "carousel")
        onChange({
          ...value,
          cards: [
            ...value.cards,
            {
              text: `Cartão ${value.cards.length + 1}`,
              mediaFileId: result.id,
              mediaType: "image",
              filename: file.name,
              buttons: [
                {
                  label: "Quero participar",
                  action: "reply",
                  value: `card_${value.cards.length + 1}`,
                },
              ],
            },
          ],
        });
      else if ("mediaFileId" in value)
        onChange({ ...value, mediaFileId: result.id, filename: file.name });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível enviar o arquivo",
      );
    }
    void index;
  }
  const buttons = (
    list: Extract<AutomationMessage, { type: "button" }>["buttons"],
    change: (b: typeof list) => void,
  ) => (
    <div className="space-y-2">
      {list.map((b, i) => (
        <div key={i} className="rounded-md border p-2 space-y-2">
          <Input
            aria-label={`Texto do botão ${i + 1}`}
            value={b.label}
            onChange={(e) =>
              change(
                list.map((x, j) =>
                  j === i ? { ...x, label: e.target.value } : x,
                ),
              )
            }
          />
          <div className="flex gap-1">
            <select
              aria-label="Ação do botão"
              className={selectClass}
              value={b.action}
              onChange={(e) =>
                change(
                  list.map((x, j) =>
                    j === i
                      ? { ...x, action: e.target.value as typeof b.action }
                      : x,
                  ),
                )
              }
            >
              <option value="reply">Responder</option>
              <option value="url">Abrir link</option>
              <option value="call">Ligar</option>
              <option value="copy">Copiar</option>
            </select>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => change(list.filter((_, j) => j !== i))}
            >
              Excluir
            </Button>
          </div>
          <Input
            aria-label="Valor da ação"
            placeholder={
              b.action === "reply"
                ? "Resposta que seguirá no fluxo"
                : "Destino da ação"
            }
            value={b.value}
            onChange={(e) =>
              change(
                list.map((x, j) =>
                  j === i ? { ...x, value: e.target.value } : x,
                ),
              )
            }
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={list.length >= 3}
        onClick={() =>
          change([
            ...list,
            {
              label: "Nova opção",
              action: "reply",
              value: `opcao_${list.length + 1}`,
            },
          ])
        }
      >
        Adicionar botão
      </Button>
    </div>
  );
  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium">
        Formato
        <select
          aria-label="Formato da mensagem"
          className={selectClass}
          value={type}
          onChange={(e) => changeType(e.target.value)}
        >
          {[
            ["text", "Texto"],
            ["button", "Botões"],
            ["list", "Lista"],
            ["carousel", "Carrossel"],
            ["image", "Imagem"],
            ["video", "Vídeo"],
            ["audio", "Áudio gravado"],
            ["document", "Documento"],
          ].map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Textarea
        aria-label="Texto da mensagem"
        rows={4}
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      <select
        aria-label="Inserir variável"
        className={selectClass}
        value=""
        onChange={(e) => {
          if (e.target.value)
            onChange({ ...value, text: value.text + ` {{${e.target.value}}}` });
        }}
      >
        <option value="">Inserir variável…</option>
        {VARIABLES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {value.type === "button" &&
        buttons(value.buttons, (b) => onChange({ ...value, buttons: b }))}
      {value.type === "list" && (
        <>
          <Input
            aria-label="Botão da lista"
            value={value.listButton}
            onChange={(e) => onChange({ ...value, listButton: e.target.value })}
          />
          {value.sections.map((s, i) => (
            <div className="space-y-2 rounded-md border p-2" key={i}>
              <Input
                aria-label="Seção da lista"
                value={s.title}
                onChange={(e) =>
                  onChange({
                    ...value,
                    sections: value.sections.map((x, j) =>
                      j === i ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
              {s.items.map((item, k) => (
                <div className="space-y-1 border-l-2 pl-2" key={k}>
                  <Input
                    aria-label="Nome do item"
                    value={item.label}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        sections: value.sections.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                items: x.items.map((a, b) =>
                                  b === k ? { ...a, label: e.target.value } : a,
                                ),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label="Resposta do item"
                    value={item.id}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        sections: value.sections.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                items: x.items.map((a, b) =>
                                  b === k ? { ...a, id: e.target.value } : a,
                                ),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label="Descrição do item"
                    placeholder="Descrição"
                    value={item.description}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        sections: value.sections.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                items: x.items.map((a, b) =>
                                  b === k
                                    ? { ...a, description: e.target.value }
                                    : a,
                                ),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onChange({
                        ...value,
                        sections: value.sections.map((x, j) =>
                          j === i
                            ? { ...x, items: x.items.filter((_, b) => b !== k) }
                            : x,
                        ),
                      })
                    }
                  >
                    Excluir item
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onChange({
                    ...value,
                    sections: value.sections.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            items: [
                              ...x.items,
                              {
                                label: "Nova opção",
                                id: `opcao_${x.items.length + 1}`,
                                description: "",
                              },
                            ],
                          }
                        : x,
                    ),
                  })
                }
              >
                Adicionar item
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...value,
                sections: [
                  ...value.sections,
                  { title: "Nova seção", items: [] },
                ],
              })
            }
          >
            Adicionar seção
          </Button>
        </>
      )}
      {value.type === "carousel" && (
        <>
          {value.cards.map((card, i) => (
            <div className="rounded-md border p-2 space-y-2" key={i}>
              <p className="text-xs text-muted-foreground">
                {card.filename || `Cartão ${i + 1}`}
              </p>
              <Textarea
                aria-label="Texto do cartão"
                value={card.text}
                onChange={(e) =>
                  onChange({
                    ...value,
                    cards: value.cards.map((x, j) =>
                      j === i ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
              />
              {buttons(card.buttons, (b) =>
                onChange({
                  ...value,
                  cards: value.cards.map((x, j) =>
                    j === i ? { ...x, buttons: b } : x,
                  ),
                }),
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...value,
                    cards: value.cards.filter((_, j) => j !== i),
                  })
                }
              >
                Excluir cartão
              </Button>
            </div>
          ))}
          <label className="block text-xs">
            Adicionar cartão com imagem
            <input
              aria-label="Imagem do carrossel"
              type="file"
              accept="image/*"
              disabled={value.cards.length >= 10}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </label>
        </>
      )}
      {"mediaFileId" in value && (
        <label className="block text-xs">
          {value.filename || "Selecionar arquivo"}
          <input
            aria-label="Arquivo da mensagem"
            type="file"
            accept={type === "document" ? "application/pdf" : `${type}/*`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      )}
      <div className="rounded-xl bg-emerald-50 p-3 text-sm text-slate-800 dark:bg-emerald-950 dark:text-slate-100">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          Prévia da mensagem
        </p>
        <p className="whitespace-pre-wrap">
          {renderText(value.text, {
            nome: "Ana Silva",
            primeiro_nome: "Ana",
            igreja: "Sua igreja",
            celula: "Célula Esperança",
            lider: "João",
            horario: "19:30",
            evento: "Encontro da igreja",
            resposta: "Sim",
            ai_text: "Mensagem personalizada",
          })}
        </p>
        {value.type === "button" &&
          value.buttons.map((b, i) => (
            <div
              className="mt-2 rounded-md border border-emerald-200 p-1 text-center"
              key={i}
            >
              {b.label}
            </div>
          ))}
        {value.type === "carousel" && (
          <p className="mt-2 text-xs">
            {value.cards.length} cartões com imagem e botões
          </p>
        )}
        {value.type === "list" && (
          <p className="mt-2 text-center">☰ {value.listButton}</p>
        )}
      </div>
    </div>
  );
}
