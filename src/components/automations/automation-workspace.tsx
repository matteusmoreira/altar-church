"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Workflow,
  Plus,
  Sparkles,
  Clock,
  CheckCircle2,
  MessageSquare,
  Archive,
  Pause,
  Play,
  Pencil,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared";
import { hasPermission } from "@/lib/types";
import { TEMPLATES,cellInvitationTemplate } from "@/lib/automations/templates";
import type { FlowDefinition } from "@/lib/automations/contract";
import type { FlowItem, Workspace } from "@/lib/automations/workspace-types";
import {
  setAutomationStatus,
  deleteAutomation,
  deleteAutomationTemplate,
  clearAutomationHistory,
  operateAutomationTask,
  saveAutomationSettings,
  saveAutomationGroup,
  connectAutomationWebhook,
  cancelAutomationRun,
  startAutomationManually,
  simulateAutomation,
} from "@/lib/automations/actions";
import dynamic from "next/dynamic";
const FlowEditor = dynamic(
  () => import("./flow-editor").then((m) => m.FlowEditor),
  {
    ssr: false,
    loading: () => <p className="p-8 text-sm">Carregando construtor…</p>,
  },
);

const tabs = [
  "Fluxos",
  "Modelos prontos",
  "Execuções",
  "Tarefas",
  "Configurações",
  "Histórico arquivado",
] as const;
const labels: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  paused: "Pausado",
  archived: "Arquivado",
  ready: "Na fila",
  working: "Processando",
  waiting: "Aguardando",
  human: "Com a equipe",
  review: "Revisão necessária",
  completed: "Concluído",
  failed: "Falha",
  canceled: "Cancelado",
  skipped: "Ignorado",
  open: "Aberta",
  in_progress: "Em atendimento",
  accepted: "Aceita pela API",
  sending: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  uncertain: "Entrega incerta",
};
export function AutomationWorkspace({
  workspace,
  preview = false,
  initialTab,
}: {
  workspace: Workspace;
  preview?: boolean;
  initialTab?: string;
}) {
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString("pt-BR", {
      timeZone: workspace.settings?.timezone ?? "America/Sao_Paulo",
    }) : "—";
  const router = useRouter(),
    [tab, setTab] = useState(
      initialTab && tabs.includes(initialTab as (typeof tabs)[number])
        ? initialTab
        : "Fluxos",
    ),
    [editor, setEditor] = useState<{
      flow?: FlowItem;
      definition?: FlowDefinition;
      name?: string;
      template?: { id: string; revision: number };
    } | null>(null),
    [busy, setBusy] = useState(false),
    [selectedRun, setSelectedRun] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [archiveKind, setArchiveKind] = useState("all");
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; run: () => Promise<unknown>; success: string } | null>(null);
  const templates = TEMPLATES.flatMap(t => {
    const saved = workspace.templates?.find(item => item.id === t.id);
    if (saved?.deleted_at) return [];
    return [{ ...t, name: saved?.name ?? t.name, definition: saved?.definition ?? (t.id === "cell_invite" ? cellInvitationTemplate(workspace.cells) : t.definition), revision: saved?.revision ?? 0 }];
  });
  const [settings, setSettings] = useState({
    timezone: workspace.settings?.timezone ?? "America/Sao_Paulo",
    start: (workspace.settings?.quiet_start ?? "08:00").slice(0, 5),
    end: (workspace.settings?.quiet_end ?? "20:00").slice(0, 5),
    knowledge: workspace.settings?.knowledge ?? "",
    models: workspace.settings?.allowed_models.join("\n") ?? "",
    budget: Number(workspace.settings?.monthly_budget_usd ?? 0),
  });
  const [group, setGroup] = useState(""),
    [chat, setChat] = useState(""),
    [instance, setInstance] = useState(workspace.instances[0]?.id ?? ""),
    [manual, setManual] = useState<{
      flow: FlowItem;
      people: { id: string; name: string; reason: string }[];
      selected: string[];
    } | null>(null);
  const edit = hasPermission(workspace.role, "automations.edit"),
    operate = hasPermission(workspace.role, "automations.operate"),
    tasks = hasPermission(workspace.role, "automations.tasks");
  async function action(fn: () => Promise<unknown>, success?: string) {
    if (preview) {
      toast.info("Esta prévia não grava nem envia mensagens");
      return;
    }
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir");
    } finally {
      setBusy(false);
    }
  }
  if (editor)
    return (
      <FlowEditor
        workspace={workspace}
        flow={editor.flow}
        initial={editor.definition}
        initialName={editor.name}
        template={editor.template}
        preview={preview}
        onClose={() => {
          setEditor(null);
          router.refresh();
        }}
      />
    );
  const totalCost = workspace.usage.reduce((sum, u) => sum + Number(u.cost), 0);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Automações"
        description="Cuide das pessoas com fluxos, mensagens e acompanhamento no momento certo."
        actions={
          edit ? (
            <Button onClick={() => setEditor({})}>
              <Plus className="h-4 w-4" />
              Nova automação
            </Button>
          ) : undefined
        }
      />
      {preview && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Prévia com dados fictícios. Nenhuma gravação, mensagem ou chamada de
          IA.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Fluxos ativos",
            value: workspace.flows.filter((f) => f.status === "active").length,
            icon: Workflow,
          },
          {
            label: "Aguardando resposta",
            value: workspace.runs.filter((r) => r.status === "waiting").length,
            icon: MessageSquare,
          },
          {
            label: "Tarefas abertas",
            value: workspace.tasks.filter((t) =>
              ["open", "in_progress"].includes(t.status),
            ).length,
            icon: Clock,
          },
          {
            label: "IA neste mês",
            value: `US$ ${totalCost.toFixed(4)}`,
            icon: Sparkles,
          },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <m.icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-semibold">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <nav
        className="flex overflow-x-auto rounded-lg bg-muted/40 p-1"
        aria-label="Seções de automações"
      >
        {tabs.map((t) => (
          <button
            key={t}
            className={`shrink-0 rounded-md px-4 py-2 text-sm ${tab === t ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "Tarefas" &&
              workspace.tasks.some((a) => a.status === "open") && (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              )}
          </button>
        ))}
      </nav>
      <AlertDialog open={!!confirmation} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={busy} onClick={() => { if (confirmation) void action(async () => { await confirmation.run(); setConfirmation(null); }, confirmation.success); }}>{busy ? "Aguarde…" : "Confirmar"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {(tab === "Histórico arquivado" || tab === "Execuções") && edit && operate && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <p className="text-sm text-muted-foreground">Limpe o histórico arquivado e as execuções encerradas desta igreja.</p>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmation({ title: "Limpar todo o histórico?", description: "Remove todos os registros de Follow-up e Trilhas do histórico arquivado e limpa as execuções concluídas, canceladas, ignoradas ou com falha. Execuções em andamento, fluxos, modelos e consumo de IA serão preservados. Esta ação não pode ser desfeita.", run: async () => { await clearAutomationHistory(); setSelectedRun(null); }, success: "Histórico limpo" })}><Trash2 className="h-4 w-4" />Limpar todo o histórico</Button>
        </div>
      )}
      {tab === "Fluxos" && (
        <>
          <Input
            aria-label="Buscar automações"
            placeholder="Buscar automações…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {workspace.flows.length === 0 ? (
            <div className="rounded-xl border border-dashed py-14 text-center">
              <Workflow className="mx-auto mb-3 h-9 w-9 text-primary" />
              <h2 className="font-semibold">
                Comece com uma ideia ou um modelo
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Aniversários, células, visitantes e outros momentos podem virar
                um fluxo que funciona sozinho.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setTab("Modelos prontos")}
              >
                Explorar modelos
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspace.flows
                .filter((f) =>
                  f.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((f) => (
                  <Card key={f.id}>
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <Workflow className="h-5 w-5 text-primary" />
                        </div>
                        <Badge
                          variant={
                            f.status === "active" ? "default" : "outline"
                          }
                        >
                          {labels[f.status]}
                        </Badge>
                      </div>
                      <div>
                        <h3 className="font-semibold">{f.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {f.description ||
                            `${f.draft.nodes.length} blocos · atualizado ${date(f.updated_at)}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditor({ flow: f })}
                        >
                          <Pencil className="h-3 w-3" />
                          {edit ? "Editar" : "Ver fluxo"}
                        </Button>
                        {operate && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy || !f.published_version_id}
                              onClick={() =>
                                void action(
                                  () =>
                                    setAutomationStatus(
                                      f.id,
                                      f.status === "active"
                                        ? "paused"
                                        : "active",
                                    ),
                                  f.status === "active"
                                    ? "Fluxo pausado"
                                    : "Fluxo retomado",
                                )
                              }
                            >
                              {f.status === "active" ? (
                                <Pause className="h-3 w-3" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                              {f.status === "active" ? "Pausar" : "Retomar"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void action(
                                  () => setAutomationStatus(f.id, "archived"),
                                  "Fluxo arquivado e pendências canceladas",
                                )
                              }
                            >
                              <Archive className="h-3 w-3" />
                              Arquivar
                            </Button>
                          </>
                        )}
                        {edit && operate && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmation({
                          title: `Excluir “${f.name}”?`,
                          description: "O fluxo, suas versões, execuções e tarefas serão excluídos definitivamente. Os envios pendentes serão interrompidos. Mensagens já enviadas e o consumo de IA permanecem registrados. Esta ação não pode ser desfeita.",
                          run: () => deleteAutomation(f.id), success: "Fluxo excluído",
                        })}><Trash2 className="h-3 w-3" />Excluir</Button>}
                        {operate &&
                          f.status === "active" &&
                          f.draft.nodes.find((n) => n.kind === "trigger")
                            ?.config.mode === "manual" && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  const sim = await simulateAutomation(f.draft);
                                  setManual({
                                    flow: f,
                                    people: sim.included,
                                    selected: sim.included.map((p) => p.id),
                                  });
                                })
                              }
                            >
                              Incluir pessoas
                            </Button>
                          )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </>
      )}
      {manual && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="font-semibold">
            Iniciar “{manual.flow.name}” para pessoas selecionadas
          </h3>
          <p className="text-xs text-muted-foreground">
            Revise os destinatários. Esta ação agenda execuções reais.
          </p>
          <div className="max-h-48 overflow-y-auto">
            {manual.people.map((p) => (
              <label key={p.id} className="flex gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={manual.selected.includes(p.id)}
                  onChange={(e) =>
                    setManual({
                      ...manual,
                      selected: e.target.checked
                        ? [...manual.selected, p.id]
                        : manual.selected.filter((id) => id !== p.id),
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              disabled={busy || manual.selected.length === 0}
              onClick={() =>
                void action(async () => {
                  const result = await startAutomationManually(
                    manual.flow.id,
                    manual.selected,
                  );
                  toast.success(`${result.count} execuções agendadas`);
                  setManual(null);
                })
              }
            >
              Iniciar {manual.selected.length} execuções
            </Button>
            <Button variant="ghost" onClick={() => setManual(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {tab === "Modelos prontos" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.length === 0 && <Empty text="Nenhum modelo pronto nesta igreja." />}
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-3 p-5">
                <Workflow className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{t.name}</h3>
                <p className="min-h-10 text-sm text-muted-foreground">
                  {t.description}
                </p>
                <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!edit || busy}
                  onClick={() =>
                    setEditor({
                      definition: structuredClone(t.definition),
                      name: t.name,
                    })
                  }
                >
                  Usar modelo
                  <ChevronRight className="h-3 w-3" />
                </Button>
                {edit && <>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditor({ definition: structuredClone(t.definition), name: t.name, template: { id: t.id, revision: t.revision } })}><Pencil className="h-3 w-3" />Editar modelo</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmation({ title: `Excluir o modelo “${t.name}”?`, description: "O modelo será removido dos modelos prontos desta igreja. Fluxos já criados a partir dele continuam funcionando. Esta ação não pode ser desfeita.", run: () => deleteAutomationTemplate(t.id), success: "Modelo excluído" })}><Trash2 className="h-3 w-3" />Excluir modelo</Button>
                </>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {tab === "Execuções" && (
        <div className="space-y-3">
          {workspace.runs.length === 0 && (
            <Empty text="As execuções aparecerão aqui quando seus fluxos forem iniciados." />
          )}
          {workspace.runs.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                  onClick={() =>
                    setSelectedRun(selectedRun === r.id ? null : r.id)
                  }
                >
                  <div>
                    <p className="text-sm font-semibold">{r.flow_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.person_name ?? "Conversa"} · {date(r.created_at)}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {labels[r.status] ?? r.status}
                  </Badge>
                </button>
                {selectedRun === r.id && (
                  <div className="mt-4 space-y-2 border-t pt-3">
                    {r.last_error && (
                      <p className="text-sm text-amber-700">{r.last_error}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Próxima verificação: {date(r.due_at)}
                    </p>
                    {workspace.steps
                      .filter((s) => s.run_id === r.id)
                      .map((s) => (
                        <div key={s.id} className="flex gap-2 text-xs">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          {workspace.flows
                            .find((f) => f.id === r.flow_id)
                            ?.draft.nodes.find((n) => n.id === s.node_id)
                            ?.label ?? "Etapa"}{" "}
                          · {labels[s.status] ?? s.status}
                          {s.detail.error ? ` · ${String(s.detail.error)}` : ""}
                        </div>
                      ))}
                    {workspace.deliveries
                      .filter((d) => d.run_id === r.id)
                      .map((d) => (
                        <p key={d.id} className="text-xs">
                          WhatsApp: {labels[d.status] ?? d.status}
                          {d.last_error ? ` · ${d.last_error}` : ""}
                          {d.chat_id.endsWith("@g.us")&&Object.keys(d.receipts??{}).length>0?` · ${Object.keys(d.receipts).length} participantes com recibo (não confirma leitura de todo o grupo)`:""}
                        </p>
                      ))}
                    {workspace.usage.some(u=>u.run_id===r.id)&&<p className="text-xs">IA nesta execução: US$ {workspace.usage.filter(u=>u.run_id===r.id).reduce((sum,u)=>sum+Number(u.cost),0).toFixed(4)}</p>}
                    {operate &&
                      !["completed", "canceled"].includes(r.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              () => cancelAutomationRun(r.id),
                              "Execução cancelada",
                            )
                          }
                        >
                          Cancelar execução
                        </Button>
                      )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {tab === "Tarefas" && (
        <div className="space-y-3">
          {workspace.tasks.length === 0 && (
            <Empty text="Os fluxos podem criar tarefas, atribuir responsáveis e pausar para atendimento no WhatsApp." />
          )}
          {workspace.tasks.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h3 className="text-sm font-semibold">{t.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t.person_name ?? "Conversa"} ·{" "}
                    {t.responsible_name ?? "Sem responsável"} · Prazo:{" "}
                    {date(t.due_at)}
                  </p>
                  <Badge variant="outline" className="mt-2">
                    {labels[t.status]}
                  </Badge>
                </div>
                {tasks && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || t.status === "completed"}
                      onClick={() =>
                        void action(
                          () => operateAutomationTask(t.id, "claim"),
                          "Tarefa assumida",
                        )
                      }
                    >
                      Assumir
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || t.status === "completed"}
                      onClick={() =>
                        void action(
                          () => operateAutomationTask(t.id, "complete"),
                          "Tarefa concluída",
                        )
                      }
                    >
                      Concluir
                    </Button>
                    {t.kind === "handoff" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () => operateAutomationTask(t.id, "resume"),
                            "Automação liberada para continuar",
                          )
                        }
                      >
                        Retomar automação
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {workspace.interests.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-semibold">Interesses registrados</h3>
                {workspace.interests.map((i, index) => (
                  <p key={index} className="py-1 text-sm">
                    {i.person_name} · {i.interest}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {tab === "Configurações" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="font-semibold">
                Horários e informações da igreja
              </h3>
              <label className="block text-sm">
                Fuso horário
                <Input
                  value={settings.timezone}
                  onChange={(e) =>
                    setSettings({ ...settings, timezone: e.target.value })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Enviar a partir de
                  <Input
                    type="time"
                    value={settings.start}
                    onChange={(e) =>
                      setSettings({ ...settings, start: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Enviar até
                  <Input
                    type="time"
                    value={settings.end}
                    onChange={(e) =>
                      setSettings({ ...settings, end: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="block text-sm">
                Informações que a IA pode usar
                <Textarea
                  rows={5}
                  placeholder="Horários dos cultos, endereço, contatos e orientações de acolhimento…"
                  value={settings.knowledge}
                  onChange={(e) =>
                    setSettings({ ...settings, knowledge: e.target.value })
                  }
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Não inclua notas pastorais privadas ou informações sensíveis de
                pessoas.
              </p>
              <Button
                disabled={!edit || busy}
                onClick={() =>
                  void action(
                    () =>
                      saveAutomationSettings({
                        timezone: settings.timezone,
                        start: settings.start,
                        end: settings.end,
                        knowledge: settings.knowledge,
                      }),
                    "Configurações salvas",
                  )
                }
              >
                Salvar configurações
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="font-semibold">
                OpenRouter · orçamento e modelos
              </h3>
              <p className="text-sm text-muted-foreground">
                A chave é central e permanece no servidor do SaaS.
              </p>
              <p className="text-sm">
                Consumo: US$ {totalCost.toFixed(4)} / US${" "}
                {Number(workspace.settings?.monthly_budget_usd ?? 0).toFixed(2)}
              </p>
              <label className="block text-sm">
                Modelos autorizados (um por linha)
                <Textarea
                  rows={4}
                  disabled={workspace.role !== "superadmin"}
                  value={settings.models}
                  onChange={(e) =>
                    setSettings({ ...settings, models: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                Orçamento mensal em US$
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={workspace.role !== "superadmin"}
                  value={settings.budget}
                  onChange={(e) =>
                    setSettings({ ...settings, budget: Number(e.target.value) })
                  }
                />
              </label>
              {workspace.role === "superadmin" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(
                      () =>
                        saveAutomationSettings({
                          timezone: settings.timezone,
                          start: settings.start,
                          end: settings.end,
                          knowledge: settings.knowledge,
                          models: settings.models
                            .split("\n")
                            .map((m) => m.trim())
                            .filter(Boolean),
                          budget: settings.budget,
                        }),
                      "Orçamento atualizado",
                    )
                  }
                >
                  Salvar autorização de IA
                </Button>
              )}
              {workspace.usage.map((u, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {u.model} · {u.calls} chamadas · US${" "}
                  {Number(u.cost).toFixed(4)}
                  {` · ${workspace.flows.find(f=>f.id===u.flow_id)?.name??"Criação de rascunho"}`}
                </p>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="font-semibold">Grupos das células</h3>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                aria-label="Célula para vincular grupo"
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value);
                  setChat(
                    workspace.cells.find((c) => c.id === e.target.value)
                      ?.automation_whatsapp_chat_id ?? "",
                  );
                }}
              >
                <option value="">Escolha a célula…</option>
                {workspace.cells.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Input
                aria-label="Identificador do grupo WhatsApp"
                placeholder="Identificador do grupo WhatsApp (@g.us)"
                value={chat}
                onChange={(e) => setChat(e.target.value)}
              />
              <Button
                disabled={!edit || !group || busy}
                onClick={() =>
                  void action(
                    () => saveAutomationGroup(group, chat),
                    "Grupo vinculado",
                  )
                }
              >
                Salvar vínculo
              </Button>
              <p className="text-xs text-muted-foreground">
                O envio para grupo é único por ocorrência. A IA conversacional
                atua somente no privado.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="font-semibold">Respostas do WhatsApp</h3>
              <p className="text-sm text-muted-foreground">
                Conecte o webhook para receber respostas, entrega e alterações
                de conexão.
              </p>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                aria-label="Instância para webhook"
                value={instance}
                onChange={(e) => setInstance(e.target.value)}
              >
                {workspace.instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.status}
                  </option>
                ))}
              </select>
              <Button
                disabled={
                  !hasPermission(workspace.role, "automations.publish") ||
                  !instance ||
                  busy
                }
                onClick={() =>
                  void action(
                    () => connectAutomationWebhook(instance),
                    "Webhook adicional conectado",
                  )
                }
              >
                Conectar respostas
              </Button>
              <p className="text-xs text-muted-foreground">
                Preserva os webhooks existentes. SAIR e PARAR descadastram o
                contato dos envios automáticos.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {tab === "Histórico arquivado" && (
        <div className="space-y-3">
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            Follow-up e Trilhas foram encerrados. O histórico foi preservado
            para consulta; tarefas, inscrições e regras antigas não são
            retomadas automaticamente.
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Buscar histórico"
              placeholder="Buscar no histórico…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-md border bg-background px-2 text-sm"
              aria-label="Tipo de histórico"
              value={archiveKind}
              onChange={(e) => setArchiveKind(e.target.value)}
            >
              <option value="all">Todos</option>
              {[
                ["task", "Tarefas"],
                ["rule", "Regras"],
                ["journey", "Trilhas"],
                ["journey_step", "Etapas"],
                ["enrollment", "Inscrições"],
                ["progress", "Progresso"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {workspace.archive
            .filter(
              (a) =>
                (archiveKind === "all" || a.kind === archiveKind) &&
                JSON.stringify(a.snapshot)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
            )
            .map((a) => (
              <Card key={`${a.kind}:${a.source_id}`}>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold">
                    {String(
                      a.snapshot.name ??
                        a.snapshot.title ??
                        {
                          enrollment: "Inscrição em trilha",
                          progress: "Progresso registrado",
                          journey_step: "Etapa",
                        }[a.kind] ??
                        "Registro arquivado",
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {String(a.snapshot.status ?? "")} · {date(a.archived_at)}
                  </p>
                  {Boolean(a.snapshot.notes ?? a.snapshot.description) && (
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {String(a.snapshot.notes ?? a.snapshot.description)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          {workspace.archive.length === 0 && (
            <Empty text="Nenhum registro antigo nesta igreja." />
          )}
        </div>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
