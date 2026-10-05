"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VARIABLES, type AutomationMessage } from "@/lib/automations/contract";
import { uploadAutomationMedia } from "@/lib/automations/actions";
import { toast } from "sonner";
import { MediaThumbnail, MessagePreview } from "./message-preview";
const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
type Buttons = Extract<AutomationMessage, { type: "button" }>["buttons"];
function move<T>(items: T[], index: number, delta: number) {
  const next = [...items],
    target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
function Order({
  index,
  length,
  change,
}: {
  index: number;
  length: number;
  change: (delta: number) => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="ghost"
        aria-label="Mover para cima"
        disabled={index === 0}
        onClick={() => change(-1)}
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Mover para baixo"
        disabled={index === length - 1}
        onClick={() => change(1)}
      >
        ↓
      </Button>
    </div>
  );
}
function ButtonFields({
  items,
  onChange,
}: {
  items: Buttons;
  onChange: (items: Buttons) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((b, i) => {
        const invalid =
          !b.label.trim() ||
          !b.value.trim() ||
          (b.action === "url" && !/^https?:\/\//i.test(b.value));
        const set = (patch: Partial<Buttons[number]>) =>
          onChange(items.map((v, j) => (i === j ? { ...v, ...patch } : v)));
        return (
          <div className="space-y-2 rounded-md border p-2" key={i}>
            <label className="block text-xs">
              Texto do botão
              <Input
                aria-label={`Texto do botão ${i + 1}`}
                value={b.label}
                maxLength={120}
                onChange={(e) => set({ label: e.target.value })}
              />
            </label>
            <label className="block text-xs">
              Ação
              <select
                aria-label="Ação do botão"
                className={selectClass}
                value={b.action}
                onChange={(e) =>
                  set({ action: e.target.value as typeof b.action })
                }
              >
                <option value="reply">Responder</option>
                <option value="url">Abrir link</option>
                <option value="call">Ligar</option>
                <option value="copy">Copiar</option>
              </select>
            </label>
            <label className="block text-xs">
              {b.action === "reply"
                ? "Resposta enviada ao fluxo"
                : b.action === "url"
                  ? "Link completo (https://...)"
                  : b.action === "call"
                    ? "Telefone com DDI"
                    : "Texto para copiar"}
              <Input
                aria-label="Valor da ação"
                value={b.value}
                maxLength={500}
                onChange={(e) => set({ value: e.target.value })}
              />
            </label>
            {invalid && (
              <p role="alert" className="text-xs text-amber-600">
                Complete o texto e o destino da ação. Links devem começar com
                http:// ou https://.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between">
              <Order
                index={i}
                length={items.length}
                change={(delta) => onChange(move(items, i, delta))}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                Excluir botão
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        disabled={items.length >= 3}
        onClick={() =>
          onChange([
            ...items,
            {
              label: "Nova opção",
              action: "reply",
              value: `opcao_${crypto.randomUUID()}`,
            },
          ])
        }
      >
        Adicionar botão
      </Button>
      {!items.length && (
        <p role="alert" className="text-xs text-amber-600">
          Adicione pelo menos um botão.
        </p>
      )}
    </div>
  );
}
export function MessageEditor({
  value,
  onChange,
  preview,
  variables = [],
}: {
  value: AutomationMessage;
  onChange: (value: AutomationMessage) => void;
  preview?: boolean;
  variables?: string[];
}) {
  const [uploading, setUploading] = useState(false);
  const mounted = useRef(true),
    latest = useRef(value),
    formats = useRef<
      Partial<Record<AutomationMessage["type"], AutomationMessage>>
    >({});
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function changeType(type: AutomationMessage["type"]) {
    formats.current[value.type] = structuredClone(value);
    const saved = formats.current[type];
    if (saved) {
      onChange({ ...saved, text: value.text });
      return;
    }
    const text = value.text || "Olá, {{primeiro_nome}}!";
    if (type === "text") onChange({ type, text });
    else if (type === "button")
      onChange({
        type,
        text,
        footer: "",
        buttons: [{ label: "Sim", action: "reply", value: "sim" }],
      });
    else if (type === "list")
      onChange({
        type,
        text,
        footer: "",
        listButton: "Ver opções",
        sections: [
          {
            title: "Opções",
            items: [
              {
                label: "Quero saber mais",
                id: `item_${crypto.randomUUID()}`,
                description: "",
              },
            ],
          },
        ],
      });
    else if (type === "carousel")
      onChange({
        type,
        text,
        cards: [
          {
            text: "Cartão 1",
            mediaFileId: "",
            mediaType: "image",
            filename: "",
            buttons: [
              {
                label: "Quero participar",
                action: "reply",
                value: `card_${crypto.randomUUID()}`,
              },
            ],
          },
        ],
      });
    else onChange({ type, text, mediaFileId: "", filename: "" });
  }
  async function upload(file: File, index?: number) {
    if (preview) {
      toast.info("Envio de arquivos está desabilitado nesta prévia");
      return;
    }
    if (uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await uploadAutomationMedia(form);
      if (!mounted.current) return;
      const current = latest.current;
      if (current.type === "carousel" && index !== undefined)
        onChange({
          ...current,
          cards: current.cards.map((card, i) =>
            i === index
              ? { ...card, mediaFileId: result.id, filename: result.name }
              : card,
          ),
        });
      else if ("mediaFileId" in current)
        onChange({ ...current, mediaFileId: result.id, filename: result.name });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível enviar o arquivo",
      );
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  return (
    <fieldset disabled={uploading} className="min-w-0 space-y-3">
      <label className="block text-xs">
        Formato
        <select
          aria-label="Formato da mensagem"
          className={selectClass}
          value={value.type}
          onChange={(e) =>
            changeType(e.target.value as AutomationMessage["type"])
          }
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
      <label className="block text-xs">
        Mensagem
        <Textarea
          aria-label="Texto da mensagem"
          rows={4}
          maxLength={4096}
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      </label>
      {!value.text.trim() && (
        <p role="alert" className="text-xs text-amber-600">
          Escreva o texto da mensagem.
        </p>
      )}
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
        {[...new Set([...VARIABLES, ...variables])].map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {"footer" in value && (
        <label className="block text-xs">
          Rodapé
          <Input
            aria-label="Rodapé da mensagem"
            maxLength={4096}
            value={value.footer}
            onChange={(e) => onChange({ ...value, footer: e.target.value })}
          />
        </label>
      )}
      {value.type === "button" && (
        <ButtonFields
          items={value.buttons}
          onChange={(buttons) => onChange({ ...value, buttons })}
        />
      )}
      {value.type === "list" && (
        <>
          <label className="block text-xs">
            Texto do botão da lista
            <Input
              aria-label="Botão da lista"
              value={value.listButton}
              onChange={(e) =>
                onChange({ ...value, listButton: e.target.value })
              }
            />
          </label>
          {!value.listButton.trim() && (
            <p role="alert" className="text-xs text-amber-600">
              Informe o texto do botão da lista.
            </p>
          )}
          {value.sections.map((section, i) => {
            const set = (patch: Partial<typeof section>) =>
              onChange({
                ...value,
                sections: value.sections.map((s, j) =>
                  i === j ? { ...s, ...patch } : s,
                ),
              });
            return (
              <div className="space-y-2 rounded-md border p-2" key={i}>
                <label className="block text-xs">
                  Seção
                  <Input
                    aria-label="Seção da lista"
                    value={section.title}
                    maxLength={4096}
                    onChange={(e) => set({ title: e.target.value })}
                  />
                </label>
                <Order
                  index={i}
                  length={value.sections.length}
                  change={(delta) =>
                    onChange({
                      ...value,
                      sections: move(value.sections, i, delta),
                    })
                  }
                />
                {section.items.map((item, k) => {
                  const setItem = (patch: Partial<typeof item>) =>
                    set({
                      items: section.items.map((x, j) =>
                        k === j ? { ...x, ...patch } : x,
                      ),
                    });
                  const duplicate =
                    value.sections
                      .flatMap((s) => s.items)
                      .filter((x) => x.id === item.id).length > 1;
                  return (
                    <div className="space-y-1 border-l-2 pl-2" key={k}>
                      <label className="block text-xs">
                        Nome do item
                        <Input
                          aria-label="Nome do item"
                          value={item.label}
                          maxLength={4096}
                          onChange={(e) => setItem({ label: e.target.value })}
                        />
                      </label>
                      <label className="block text-xs">
                        Resposta enviada ao fluxo
                        <Input
                          aria-label="Resposta do item"
                          value={item.id}
                          maxLength={4096}
                          onChange={(e) => setItem({ id: e.target.value })}
                        />
                      </label>
                      <label className="block text-xs">
                        Descrição
                        <Input
                          aria-label="Descrição do item"
                          value={item.description}
                          maxLength={4096}
                          onChange={(e) =>
                            setItem({ description: e.target.value })
                          }
                        />
                      </label>
                      {(!item.label.trim() || !item.id.trim() || duplicate) && (
                        <p role="alert" className="text-xs text-amber-600">
                          Informe nome e resposta única para este item.
                        </p>
                      )}
                      <Order
                        index={k}
                        length={section.items.length}
                        change={(delta) =>
                          set({ items: move(section.items, k, delta) })
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          set({
                            items: section.items.filter((_, j) => j !== k),
                          })
                        }
                      >
                        Excluir item
                      </Button>
                    </div>
                  );
                })}
                {!section.items.length && (
                  <p role="alert" className="text-xs text-amber-600">
                    Adicione pelo menos um item nesta seção.
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      value.sections.reduce(
                        (total, s) => total + s.items.length,
                        0,
                      ) >= 10
                    }
                    onClick={() =>
                      set({
                        items: [
                          ...section.items,
                          {
                            label: "Nova opção",
                            id: `item_${crypto.randomUUID()}`,
                            description: "",
                          },
                        ],
                      })
                    }
                  >
                    Adicionar item
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onChange({
                        ...value,
                        sections: value.sections.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Excluir seção
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            disabled={value.sections.length >= 10}
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
          {!value.sections.length && (
            <p role="alert" className="text-xs text-amber-600">
              Adicione pelo menos uma seção.
            </p>
          )}
        </>
      )}
      {value.type === "carousel" && (
        <>
          {value.cards.map((card, i) => {
            const set = (patch: Partial<typeof card>) =>
              onChange({
                ...value,
                cards: value.cards.map((c, j) =>
                  i === j ? { ...c, ...patch } : c,
                ),
              });
            return (
              <div className="space-y-2 rounded-md border p-2" key={i}>
                <p className="text-xs font-medium">Cartão {i + 1}</p>
                <MediaThumbnail
                  key={card.mediaFileId}
                  id={card.mediaFileId}
                  name={card.filename}
                  preview={preview}
                />
                <label className="block text-xs">
                  Imagem do cartão
                  <input
                    className="block w-full text-xs"
                    aria-label={`Imagem do cartão ${i + 1}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(file, i);
                    }}
                  />
                </label>
                {!card.mediaFileId && (
                  <p role="alert" className="text-xs text-amber-600">
                    Selecione a imagem do cartão.
                  </p>
                )}
                <label className="block text-xs">
                  Texto do cartão
                  <Textarea
                    aria-label="Texto do cartão"
                    maxLength={4096}
                    value={card.text}
                    onChange={(e) => set({ text: e.target.value })}
                  />
                </label>
                {!card.text.trim() && (
                  <p role="alert" className="text-xs text-amber-600">
                    Escreva o texto do cartão.
                  </p>
                )}
                <ButtonFields
                  items={card.buttons}
                  onChange={(buttons) => set({ buttons })}
                />
                <Order
                  index={i}
                  length={value.cards.length}
                  change={(delta) =>
                    onChange({ ...value, cards: move(value.cards, i, delta) })
                  }
                />
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
            );
          })}
          <Button
            size="sm"
            variant="outline"
            disabled={value.cards.length >= 10}
            onClick={() =>
              onChange({
                ...value,
                cards: [
                  ...value.cards,
                  {
                    text: `Cartão ${value.cards.length + 1}`,
                    mediaFileId: "",
                    mediaType: "image",
                    filename: "",
                    buttons: [
                      {
                        label: "Quero participar",
                        action: "reply",
                        value: `card_${crypto.randomUUID()}`,
                      },
                    ],
                  },
                ],
              })
            }
          >
            Adicionar cartão
          </Button>
          {!value.cards.length && (
            <p role="alert" className="text-xs text-amber-600">
              Adicione pelo menos um cartão.
            </p>
          )}
        </>
      )}
      {"mediaFileId" in value && (
        <label className="block text-xs">
          {value.filename || "Selecionar arquivo"}
          <input
            className="block w-full text-xs"
            aria-label="Arquivo da mensagem"
            type="file"
            accept={
              value.type === "document" ? "application/pdf" : `${value.type}/*`
            }
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      )}
      {uploading && (
        <p role="status" className="text-xs">
          Enviando arquivo…
        </p>
      )}
      <MessagePreview message={value} preview={preview} />
    </fieldset>
  );
}
