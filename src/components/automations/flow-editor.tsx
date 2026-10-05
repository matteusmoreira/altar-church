"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Node,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  ArrowLeft,
  Copy,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
  Workflow,
  CheckCircle2,
  AlertCircle,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  saveAutomation,
  publishAutomation,
  simulateAutomation,
  generateAutomation,
} from "@/lib/automations/actions";
import {
  KINDS,
  LABELS,
  EVENT_OPTIONS,
  EDITABLE_FIELDS,
  VARIABLES,
  validateFlow,
  requiredPorts,
  type FlowDefinition,
  type FlowNode,
  type NodeKind,
} from "@/lib/automations/contract";
import { newNode } from "@/lib/automations/templates";
import type { Workspace, FlowItem } from "@/lib/automations/workspace-types";
import { hasPermission } from "@/lib/types";
import { MessageEditor } from "./message-editor";
import { AutomationTestPanel } from "./test-panel";

const portLabels: Record<string, string> = {
  next: "Continuar",
  error: "Falha",
  yes: "Sim",
  no: "Não",
  response: "Resposta / conclusão",
  timeout: "Prazo vencido",
  default: "Outra resposta",
};
const portLabel=(node:FlowNode|undefined,port:string)=>node?.kind === "kanban_move" ? (port === "next" ? "Sucesso" : "Erro") : node?.config.cases?.find(c=>c.port===port)?.value??portLabels[port]??port;
type CanvasNode = Node<{ node: FlowNode; issues: string[] }, "automation">;
function AutomationNode({ data, selected }: NodeProps<CanvasNode>) {
  const ports = requiredPorts(data.node);
  return (
    <div
      className={`w-[230px] rounded-xl border bg-card shadow-sm ${selected ? "ring-2 ring-primary" : ""} ${data.issues.length ? "border-amber-500" : "border-border"}`}
    >
      <div className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
        {LABELS[data.node.kind]}
      </div>
      <div className="px-3 py-3">
        <p className="text-sm font-semibold">{data.node.label}</p>
        {data.node.config.message && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {data.node.config.message.text}
          </p>
        )}
        {data.issues.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-600">{data.issues[0]}</p>
        )}
      </div>
      {data.node.kind !== "trigger" && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !bg-primary"
        />
      )}
      <div className="relative flex border-t text-[9px] text-muted-foreground">
        {ports.map((port, index) => (
          <div key={port} className="flex-1 px-1 py-2 text-center">
            {portLabel(data.node,port)}
            <Handle
              type="source"
              id={port}
              position={Position.Bottom}
              style={{ left: `${((index + 0.5) / ports.length) * 100}%` }}
              className="!h-3 !w-3 !bg-primary"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
const nodeTypes = { automation: AutomationNode };
const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
type Props = {
  workspace: Workspace;
  flow?: FlowItem;
  initial?: FlowDefinition;
  initialName?: string;
  onClose: () => void;
  preview?: boolean;
};
export function FlowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
function Editor({
  workspace,
  flow,
  initial,
  initialName,
  onClose,
  preview,
}: Props) {
  const router = useRouter(),
    rf = useReactFlow<CanvasNode>();
  const [definition, setDefinition] = useState<FlowDefinition>(
    flow?.draft ??
      initial ?? {
        schemaVersion: 1,
        nodes: [newNode("trigger", "start"), newNode("end", "end", 80, 300)],
        edges: [
          { id: "start-end", source: "start", target: "end", port: "next" },
        ],
      },
  );
  const [name, setName] = useState(
      flow?.name ?? initialName ?? "Nova automação",
    ),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState("Rascunho"),
    [search, setSearch] = useState(""),
    [mobilePanel, setMobilePanel] = useState<"library" | "config" | null>(null);
  const [simulation, setSimulation] = useState<Awaited<
      ReturnType<typeof simulateAutomation>
    > | null>(null),
    [aiPrompt, setAiPrompt] = useState(""),
    [aiOpen, setAiOpen] = useState(false),
    [model, setModel] = useState(workspace.settings?.allowed_models[0] ?? ""),
    [testOpen, setTestOpen] = useState(false);
  const record = useRef({
      id: flow?.id,
      revision: flow?.revision ?? 0,
      snapshot: flow
        ? JSON.stringify({ name: flow.name, definition: flow.draft })
        : "",
    }),
    saving = useRef<Promise<string | undefined> | null>(null),
    dragKind = useRef<NodeKind | null>(null);
  const history = useRef<FlowDefinition[]>([]),
    future = useRef<FlowDefinition[]>([]);
  const [canvasState, setCanvasState] = useState<Record<string, Pick<CanvasNode, "measured" | "dragging">>>({});
  const [dragging, setDragging] = useState(false);
  const canEdit = hasPermission(workspace.role, "automations.edit"),
    canPublish = hasPermission(workspace.role, "automations.publish");
  const issues = useMemo(() => validateFlow(definition), [definition]),
    active = definition.nodes.find((n) => n.id === selected);
  const commit = useCallback(
    (next: FlowDefinition) => {
      history.current.push(definition);
      if (history.current.length > 50) history.current.shift();
      future.current = [];
      setDefinition(next);
      setSimulation(null);
      setSaved("Alterações pendentes");
    },
    [definition],
  );
  const persist = useCallback(async () => {
    if (preview || !canEdit) return;
    const snapshot = JSON.stringify({ name, definition });
    if (record.current.snapshot === snapshot) return record.current.id;
    if (saving.current) await saving.current;
    if (record.current.snapshot === snapshot) return record.current.id;
    setSaved("Salvando…");
    const pending = (async () => {
      try {
        const result = await saveAutomation({
          id: record.current.id,
          revision: record.current.revision,
          name,
          definition,
        });
        record.current = { ...result, snapshot };
        setSaved("Salvo");
        return result.id;
      } catch (e) {
        setSaved("Revise os blocos para salvar");
        throw e;
      }
    })();
    saving.current = pending;
    try {
      return await pending;
    } finally {
      if (saving.current === pending) saving.current = null;
    }
  }, [definition, name, preview, canEdit]);
  useEffect(() => {
    if (!canEdit || preview || dragging) return;
    const timeout = setTimeout(() => {
      void persist().catch(() => {});
    }, 1600);
    return () => clearTimeout(timeout);
  }, [persist, canEdit, preview, dragging]);
  const nodes: CanvasNode[] = useMemo(() => definition.nodes.map((n) => ({
    id: n.id,
    type: "automation",
    position: n.position,
    ...canvasState[n.id],
    data: {
      node: n,
      issues: issues.filter((i) => i.nodeId === n.id).map((i) => i.message),
    },
    selected: n.id === selected,
  })), [definition.nodes, issues, selected, canvasState]);
  const edges = useMemo(() => definition.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.port,
    label: portLabel(definition.nodes.find(n=>n.id===e.source),e.port),
    type: "smoothstep",
  })), [definition.edges, definition.nodes]);
  const updateConfig = (patch: Partial<FlowNode["config"]>) => {
    if (active)
      commit({
        ...definition,
        nodes: definition.nodes.map((n) =>
          n.id === active.id ? { ...n, config: { ...n.config, ...patch } } : n,
        ),
      });
  };
  function add(kind: NodeKind, point?: { x: number; y: number }) {
    const p = point ?? {
      x: 100 + (definition.nodes.length % 3) * 270,
      y: 80 + Math.floor(definition.nodes.length / 3) * 180,
    };
    const node = newNode(kind, crypto.randomUUID(), p.x, p.y);
    commit({ ...definition, nodes: [...definition.nodes, node] });
    setSelected(node.id);
    setMobilePanel("config");
  }
  function connect(c: Connection) {
    if (!c.source || !c.target) return;
    const next = {
      ...definition,
      edges: [
        ...definition.edges.filter(
          (e) =>
            !(e.source === c.source && e.port === (c.sourceHandle ?? "next")),
        ),
        {
          id: crypto.randomUUID(),
          source: c.source,
          target: c.target,
          port: c.sourceHandle ?? "next",
        },
      ],
    };
    if (
      validateFlow(next).some(
        (i) =>
          i.message.includes("Ciclos") || i.message.includes("início não pode"),
      )
    ) {
      toast.error("Esta conexão criaria um ciclo");
      return;
    }
    commit(next);
  }
  function onNodesChange(changes: NodeChange<CanvasNode>[]) {
    const next = applyNodeChanges(changes, nodes);
    if (changes.some((c) => c.type === "dimensions" || c.type === "position")) {
      setCanvasState(Object.fromEntries(next.map((n) => [n.id, {
        measured: n.measured,
        dragging: n.dragging,
      }])));
    }
    if (changes.some((c) => c.type === "remove")) {
      commit({
        ...definition,
        nodes: next.map((n) => ({ ...n.data.node, position: n.position })),
        edges: definition.edges.filter(
          (e) =>
            next.some((n) => n.id === e.source) &&
            next.some((n) => n.id === e.target),
        ),
      });
    } else if (changes.some((c) => c.type === "position"))
      setDefinition((d) => ({
        ...d,
        nodes: d.nodes.map((n) => ({
          ...n,
          position: next.find((a) => a.id === n.id)?.position ?? n.position,
        })),
      }));
  }
  function onEdgesChange(changes: EdgeChange[]) {
    if (changes.some((c) => c.type === "remove")) {
      const next = applyEdgeChanges(changes, edges);
      commit({
        ...definition,
        edges: definition.edges.filter((e) => next.some((a) => a.id === e.id)),
      });
    }
  }
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir");
    } finally {
      setBusy(false);
    }
  }
  function organize() {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 70, ranksep: 100 });
    g.setDefaultEdgeLabel(() => ({}));
    definition.nodes.forEach((n) =>
      g.setNode(n.id, { width: 230, height: 150 }),
    );
    definition.edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    commit({
      ...definition,
      nodes: definition.nodes.map((n) => ({
        ...n,
        position: { x: g.node(n.id).x - 115, y: g.node(n.id).y - 75 },
      })),
    });
    setTimeout(() => void rf.fitView({ padding: 0.2, duration: 300 }), 30);
  }
  const field = (
    label: string,
    key: keyof FlowNode["config"],
    type = "text",
  ) => (
    <label className="block space-y-1 text-xs font-medium">
      {label}
      <Input
        type={type}
        value={String(active?.config[key] ?? "")}
        onChange={(e) =>
          updateConfig({
            [key]:
              type === "number"
                ? Number(e.target.value)
                : e.target.value || undefined,
          })
        }
      />
    </label>
  );
  const pick = (
    label: string,
    key: keyof FlowNode["config"],
    options: { id: string; name: string }[],
  ) => (
    <label className="block space-y-1 text-xs font-medium">
      {label}
      <select
        aria-label={label}
        className={selectClass}
        value={String(active?.config[key] ?? "")}
        onChange={(e) => updateConfig({ [key]: e.target.value || undefined })}
      >
        <option value="">Selecione…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  const responsible = () =>
    pick(
      "Responsável",
      "responsibleId",
      workspace.responsible.map((r) => ({ id: r.id, name: r.full_name })),
    );
  const instance = () =>
    pick(
      "Instância WhatsApp",
      "instanceId",
      workspace.instances.map((i) => ({
        id: i.id,
        name: `${i.name} · ${i.status}`,
      })),
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          aria-label="Nome do fluxo"
          className="max-w-sm text-lg font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
        />
        <Badge variant="outline">
          {flow?.status === "active"
            ? "Editando rascunho · versão ativa preservada"
            : "Rascunho"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {preview ? "Prévia local" : saved}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !canEdit}
          onClick={() =>
            void action(async () => {
              await persist();
              toast.success(preview ? "Prévia sem gravação" : "Rascunho salvo");
            })
          }
        >
          <Save className="h-4 w-4" />
          Salvar
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              setSimulation(
                preview
                  ? {
                      issues,
                      audiences: {},
                      total: 2,
                      included: workspace.people.slice(0, 2).map((p) => ({
                        id: p.id,
                        name: p.full_name,
                        reason: "Pessoa fictícia para prévia",
                        context: { nome: p.full_name },
                      })),
                      excluded: [],
                      path: definition.nodes.map((n) => ({
                        id: n.id,
                        label: n.label,
                        kind: n.kind,
                      })),
                    }
                  : await simulateAutomation(definition),
              );
            })
          }
        >
          Simular e revisar público
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setTestOpen((v) => !v)}
        >
          <Play className="h-4 w-4" />
          Testar automação
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !canEdit}
          onClick={() => setAiOpen((v) => !v)}
        >
          <Sparkles className="h-4 w-4" />
          Criar com IA
        </Button>
        <Button
          size="sm"
          disabled={
            busy || !canPublish || !simulation || issues.length > 0 || preview
          }
          onClick={() =>
            void action(async () => {
              const id = await persist();
              if (!id) return;
              await publishAutomation(id, record.current.revision);
              toast.success("Versão publicada");
              router.refresh();
              onClose();
            })
          }
        >
          <CheckCircle2 className="h-4 w-4" />
          Publicar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Desfazer"
          disabled={!canEdit}
          onClick={() => {
            const previous = history.current.pop();
            if (previous) {
              future.current.push(definition);
              setDefinition(previous);
              setSimulation(null);
            }
          }}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refazer"
          disabled={!canEdit}
          onClick={() => {
            const next = future.current.pop();
            if (next) {
              history.current.push(definition);
              setDefinition(next);
              setSimulation(null);
            }
          }}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={organize}>
          Organizar fluxo
        </Button>
      </div>
      {aiOpen && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">
            Descreva sua ideia. A IA criará um rascunho para você revisar.
          </p>
          <Textarea
            aria-label="Ideia da automação"
            placeholder="Toda segunda, envie uma mensagem para os participantes da célula e avise o líder se alguém pedir ajuda…"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <select
              className={`${selectClass} max-w-sm`}
              aria-label="Modelo para criar fluxo"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">Modelo autorizado…</option>
              {workspace.settings?.allowed_models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <Button
              disabled={busy || !model || aiPrompt.length < 10 || preview}
              onClick={() =>
                void action(async () => {
                  commit(await generateAutomation(aiPrompt, model));
                  toast.success(
                    "Rascunho criado. Configure instâncias e responsáveis antes de publicar.",
                  );
                })
              }
            >
              Gerar rascunho
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Consumo descontado do orçamento desta igreja. Nenhuma publicação
            automática.
          </p>
        </div>
      )}
      <div className="flex gap-2 xl:hidden">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setMobilePanel(mobilePanel === "library" ? null : "library")
          }
        >
          Blocos
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setMobilePanel(mobilePanel === "config" ? null : "config")
          }
        >
          Configurar bloco
        </Button>
      </div>
      <div className="relative flex h-[min(72vh,850px)] min-h-[480px] overflow-hidden rounded-xl border bg-muted/20">
        <aside
          className={`${mobilePanel === "library" ? "absolute inset-y-0 left-0 z-20 flex" : "hidden"} w-52 shrink-0 flex-col border-r bg-card p-3 xl:relative xl:flex`}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Workflow className="h-4 w-4" />
            Biblioteca de blocos
          </div>
          <div className="mb-3 relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-7"
              placeholder="Localizar bloco"
              aria-label="Localizar bloco"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {search &&
              definition.nodes
                .filter((n) =>
                  n.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map((n) => (
                  <button
                    key={`locate-${n.id}`}
                    className="w-full rounded-md bg-primary/10 p-2 text-left text-xs"
                    onClick={() => {
                      setSelected(n.id);
                      setMobilePanel("config");
                      void rf.setCenter(n.position.x + 115, n.position.y + 75, {
                        zoom: 0.9,
                        duration: 300,
                      });
                    }}
                  >
                    Localizar: {n.label}
                  </button>
                ))}
            {KINDS.filter((k) =>
              LABELS[k].toLowerCase().includes(search.toLowerCase()),
            ).map((kind) => (
              <button
                key={kind}
                disabled={!canEdit}
                className="flex w-full touch-none items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs hover:border-primary/30 hover:bg-primary/5"
                onPointerDown={() => {
                  dragKind.current = kind;
                }}
                onClick={() => {
                  dragKind.current = null;
                  add(kind);
                }}
              >
                <Plus className="h-3 w-3 text-primary" />
                {LABELS[kind]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Arraste para o fluxo ou toque para adicionar.
          </p>
        </aside>
        <div
          className="min-w-0 flex-1"
          onPointerUp={(e) => {
            if (dragKind.current && canEdit) {
              add(
                dragKind.current,
                rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
              );
              dragKind.current = null;
            }
          }}
        >
          <ReactFlow<CanvasNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={connect}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            onNodeClick={(_, node) => {
              setSelected(node.id);
              setMobilePanel("config");
            }}
            onPaneClick={() => {
              setSelected(null);
              setMobilePanel(null);
            }}
            onNodeDragStart={() => {
              history.current.push(definition);
              future.current = [];
              setDragging(true);
            }}
            onNodeDragStop={() => {
              setDragging(false);
              setSimulation(null);
              setSaved("Alterações pendentes");
            }}
            colorMode="system"
            fitView
            minZoom={0.2}
            maxZoom={1.5}
            connectOnClick
          >
            <Background gap={22} size={1} />
            <Controls />
            <MiniMap className="!hidden md:!block" pannable zoomable />
          </ReactFlow>
        </div>
        <aside
          className={`${mobilePanel === "config" ? "absolute inset-y-0 right-0 z-20 block" : "hidden"} w-[min(320px,88vw)] min-w-0 shrink-0 overflow-y-auto overflow-x-hidden border-l bg-background p-4 xl:relative xl:block`}
          key={active?.id}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Configuração</p>
            <Button
              size="sm"
              variant="ghost"
              className="xl:hidden"
              onClick={() => setMobilePanel(null)}
            >
              Fechar
            </Button>
          </div>
          {!active ? (
            <p className="text-xs text-muted-foreground">
              Selecione um bloco no fluxo para editar seu comportamento.
            </p>
          ) : (
            <fieldset disabled={!canEdit} className="min-w-0 w-full space-y-4">
              <Input
                aria-label="Nome do bloco"
                value={active.label}
                onChange={(e) =>
                  commit({
                    ...definition,
                    nodes: definition.nodes.map((n) =>
                      n.id === active.id ? { ...n, label: e.target.value } : n,
                    ),
                  })
                }
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const duplicate = {
                      ...structuredClone(active),
                      id: crypto.randomUUID(),
                      position: {
                        x: active.position.x + 270,
                        y: active.position.y,
                      },
                    };
                    commit({
                      ...definition,
                      nodes: [...definition.nodes, duplicate],
                    });
                    setSelected(duplicate.id);
                  }}
                >
                  <Copy className="h-3 w-3" />
                  Duplicar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    commit({
                      ...definition,
                      nodes: definition.nodes.filter((n) => n.id !== active.id),
                      edges: definition.edges.filter(
                        (e) => e.source !== active.id && e.target !== active.id,
                      ),
                    });
                    setSelected(null);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Excluir
                </Button>
              </div>
              {active.kind === "trigger" && (
                <>
                  {[
                    "form.submitted",
                    "cell.visit_requested",
                    "volunteer.assigned",
                    "volunteer.upcoming",
                  ].includes(active.config.event ?? "") && (
                    <>
                      {pick("Quem envia esta finalidade", "deliveryOwner", [
                        {
                          id: "existing",
                          name: "Integração existente (fluxo sem envios)",
                        },
                        { id: "automation", name: "Esta automação" },
                      ])}
                      <p className="text-xs text-muted-foreground">
                        Transfere o envio{" "}
                        {active.config.event === "form.submitted"
                          ? "do formulário selecionado"
                          : "desta finalidade em toda a igreja"}
                        . Durante a pausa do fluxo, o envio existente também
                        permanece suspenso.
                      </p>
                    </>
                  )}
                  {pick("Quando iniciar", "mode", [
                    { id: "manual", name: "Inclusão manual" },
                    { id: "schedule", name: "Agenda" },
                    { id: "birthday", name: "Aniversário" },
                    { id: "relative_date", name: "Data relativa" },
                    { id: "event", name: "Evento do sistema" },
                    { id: "message", name: "Mensagem recebida" },
                  ])}
                  {active.config.mode === "schedule" && (
                    <>
                      {pick("Recorrência", "schedule", [
                        { id: "once", name: "Uma vez" },
                        { id: "daily", name: "Diariamente" },
                        { id: "weekly", name: "Semanalmente" },
                        { id: "monthly", name: "Mensalmente" },
                      ])}
                      {active.config.schedule === "once"
                        ? field("Data e hora", "at", "datetime-local")
                        : field("Horário", "time", "time")}
                      {active.config.schedule === "weekly" && (
                        <label className="block text-xs">
                          Dia da semana
                          <select
                            className={selectClass}
                            value={active.config.weekday ?? 1}
                            onChange={(e) =>
                              updateConfig({ weekday: Number(e.target.value) })
                            }
                          >
                            {[
                              "Domingo",
                              "Segunda",
                              "Terça",
                              "Quarta",
                              "Quinta",
                              "Sexta",
                              "Sábado",
                            ].map((d, i) => (
                              <option key={d} value={i}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {active.config.schedule === "monthly" &&
                        field("Dia do mês", "monthDay", "number")}
                    </>
                  )}
                  {active.config.mode === "event" && (
                    <>
                      {pick(
                        "Evento",
                        "event",
                        EVENT_OPTIONS.map(([id, name]) => ({ id, name })),
                      )}
                      {active.config.event === "form.submitted" && (
                        <>
                          {pick("Formulário", "formId", workspace.forms)}
                          {active.config.formId &&
                            !workspace.forms.find(
                              (f) => f.id === active.config.formId,
                            )?.creates_person && (
                              <p
                                role="alert"
                                className="text-xs text-amber-600"
                              >
                                Este formulário precisa criar ou vincular uma
                                pessoa.{" "}
                                <a
                                  className="underline"
                                  href={`/formularios/${active.config.formId}`}
                                >
                                  Configurar formulário
                                </a>
                              </p>
                            )}
                        </>
                      )}
                      {["event.upcoming", "volunteer.upcoming"].includes(
                        active.config.event ?? "",
                      ) && field("Dias antes", "offsetDays", "number")}
                    </>
                  )}
                  {active.config.mode === "relative_date" && (
                    <>
                      {pick("Data de referência", "dateField", [
                        { id: "baptism_date", name: "Data do batismo" },
                        { id: "birth_date", name: "Data de nascimento" },
                      ])}
                      {field(
                        "Dias depois (negativo: antes)",
                        "offsetDays",
                        "number",
                      )}
                    </>
                  )}
                  {["birthday", "relative_date"].includes(
                    active.config.mode ?? "",
                  ) && field("Horário", "time", "time")}
                  {active.config.mode === "message" && instance()}
                  <p className="text-xs font-semibold">Quem participa</p>
                  <FilterPanel
                    filter={active.config.filter ?? {}}
                    onChange={(filter) => updateConfig({ filter })}
                    workspace={workspace}
                  />
                </>
              )}
              {active.kind === "audience" && (
                <FilterPanel
                  filter={active.config.filter ?? {}}
                  onChange={(filter) => updateConfig({ filter })}
                  workspace={workspace}
                />
              )}
              {["condition", "switch"].includes(active.kind) && (
                <>
                  {pick(
                    "Campo",
                    "field",
                    [...VARIABLES, "person_type", "status"].map((id) => ({
                      id,
                      name: id,
                    })),
                  )}
                  {active.kind === "condition" && (
                    <>
                      {pick("Comparação", "operator", [
                        { id: "equals", name: "Igual a" },
                        { id: "contains", name: "Contém" },
                        { id: "exists", name: "Está preenchido" },
                        { id: "greater", name: "Maior que" },
                        { id: "less", name: "Menor que" },
                      ])}
                      {field("Valor", "value")}
                    </>
                  )}
                  {active.kind === "switch" && (
                    <div className="space-y-2">
                      {(active.config.cases ?? []).map((c, i) => (
                        <div key={i} className="flex gap-1">
                          <Input
                            aria-label="Resposta para caminho"
                            value={c.value}
                            onChange={(e) =>
                              updateConfig({
                                cases: active.config.cases!.map((x, j) =>
                                  j === i ? { ...x, value: e.target.value } : x,
                                ),
                              })
                            }
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              updateConfig({
                                cases: active.config.cases!.filter(
                                  (_, j) => j !== i,
                                ),
                              })
                            }
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateConfig({
                            cases: [
                              ...(active.config.cases ?? []),
                              {
                                value: `opcao_${(active.config.cases?.length ?? 0) + 1}`,
                                port: `case_${crypto.randomUUID().slice(0, 8)}`,
                              },
                            ],
                          })
                        }
                      >
                        Adicionar caminho
                      </Button>
                    </div>
                  )}
                </>
              )}
              {active.kind === "wait" && (
                <>
                  {field("Aguardar minutos", "minutes", "number")}
                  {field("Ou até data e hora", "until", "datetime-local")}
                </>
              )}
              {active.kind === "kanban_move" && (
                <>
                  {pick("Coluna do Kanban", "stageId", workspace.stages)}
                  <p className="text-xs text-muted-foreground">
                    Move o card desta resposta ou o mais recente da pessoa. Se
                    não houver card, cria na coluna escolhida.
                  </p>
                </>
              )}
              {["response", "task_wait"].includes(active.kind) && (
                <>
                  {field("Prazo em minutos", "minutes", "number")}
                  <p className="text-xs text-muted-foreground">
                    Conecte os caminhos de resposta/conclusão, prazo vencido e
                    falha.
                  </p>
                </>
              )}
              {active.kind === "whatsapp" && (
                <>
                  {instance()}
                  {pick("Enviar para", "destination", [
                    { id: "person", name: "Pessoa no privado" },
                    { id: "group", name: "Grupo da célula" },
                  ])}
                  {active.config.destination === "group" &&
                    pick("Célula vinculada", "cellId", workspace.cells)}
                  <MessageEditor
                    value={active.config.message ?? { type: "text", text: "" }}
                    onChange={(message) => updateConfig({ message })}
                    preview={preview}
                  />
                  <label className="block space-y-1 text-xs">
                    Alternativa em texto (somente em recusa confirmada)
                    <Textarea
                      value={active.config.fallbackText ?? ""}
                      onChange={(e) =>
                        updateConfig({ fallbackText: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              {active.kind === "ai" && (
                <>
                  {pick("Função da IA", "mode", [
                    { id: "write", name: "Escrever mensagem" },
                    { id: "classify", name: "Classificar resposta" },
                    { id: "extract", name: "Extrair informações" },
                    { id: "conversation", name: "Conversar no privado" },
                  ])}
                  {pick(
                    "Modelo autorizado",
                    "model",
                    (workspace.settings?.allowed_models ?? []).map((id) => ({
                      id,
                      name: id,
                    })),
                  )}
                  <label className="block text-xs">
                    Instruções
                    <Textarea
                      rows={6}
                      value={active.config.prompt ?? ""}
                      onChange={(e) => updateConfig({ prompt: e.target.value })}
                    />
                  </label>
                  {field("Máximo de tokens", "maxTokens", "number")}
                  {active.config.mode === "conversation" && (
                    <>
                      {instance()}
                      {field("Máximo de respostas", "maxTurns", "number")}
                      {field(
                        "Prazo de conversa em minutos",
                        "maxMinutes",
                        "number",
                      )}
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Resultados disponíveis em ai_text e ai_result. Alterações de
                    dados precisam de blocos explícitos.
                  </p>
                </>
              )}
              {["task", "notify", "handoff"].includes(active.kind) && (
                <>
                  {field("Título", "title")}
                  {responsible()}
                  {field("Prazo em dias", "dueDays", "number")}
                  {["notify", "handoff"].includes(active.kind) && instance()}
                </>
              )}
              {active.kind === "assign" && responsible()}
              {active.kind === "interest" && field("Interesse", "interest")}
              {active.kind === "update" && (
                <>
                  {pick(
                    "Campo permitido",
                    "field",
                    EDITABLE_FIELDS.map((id) => ({ id, name: id })),
                  )}
                  {field("Novo valor (aceita variáveis)", "value")}
                </>
              )}
              {active.kind === "start_flow" &&
                pick(
                  "Fluxo de destino",
                  "flowId",
                  workspace.flows.filter(
                    (f) => f.status === "active" && f.id !== flow?.id,
                  ),
                )}
              {active.kind === "end" && (
                <p className="text-xs text-muted-foreground">
                  Encerra esta execução e libera a conversa.
                </p>
              )}
              {issues
                .filter((i) => i.nodeId === active.id)
                .map((issue, i) => (
                  <p
                    key={i}
                    className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  >
                    {issue.message}
                  </p>
                ))}
            </fieldset>
          )}
        </aside>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {issues.length ? (
          <>
            <AlertCircle className="h-4 w-4 text-amber-500" />
            {issues.length} pendências para publicar. Selecione os blocos
            destacados.
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Estrutura validada. Revise público e mensagens antes de publicar.
          </>
        )}
      </div>
      {testOpen && (
        <AutomationTestPanel
          key={JSON.stringify(definition)}
          definition={definition}
          workspace={workspace}
          preview={preview}
        />
      )}
      {simulation && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Simulação · {simulation.total} pessoas no público
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSimulation(null)}
            >
              Fechar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Esta simulação não envia mensagens nem chama a IA. Datas e eventos
            ainda determinam quando cada pessoa entra.
          </p>
          <div className="grid max-h-60 gap-3 overflow-y-auto md:grid-cols-2">
            <div>
              {simulation.included.map((p) => (
                <p key={p.id} className="py-1 text-xs">
                  <span className="font-medium">{p.name}</span> · {p.reason}
                </p>
              ))}
            </div>
            <div>
              {simulation.excluded.map((p) => (
                <p key={p.id} className="py-1 text-xs text-muted-foreground">
                  {p.name} · {p.reason}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPanel({
  filter,
  onChange,
  workspace,
}: {
  filter: NonNullable<FlowNode["config"]["filter"]>;
  onChange: (filter: NonNullable<FlowNode["config"]["filter"]>) => void;
  workspace: Workspace;
}) {
  const f = filter;
  const set = (key: string, value: unknown) =>
    onChange({
      ...f,
      [key]: value === false || value === 0 ? value : value || undefined,
    });
  return (
    <div className="space-y-2">
      {[
        [
          "personType",
          "Tipo de pessoa",
          [
            { id: "member", name: "Membro" },
            { id: "visitor", name: "Visitante" },
            { id: "leader", name: "Líder" },
            { id: "volunteer", name: "Voluntário" },
            { id: "attendee", name: "Frequentador" },
          ],
        ],
        [
          "status",
          "Situação",
          [
            { id: "active", name: "Ativo" },
            { id: "inactive", name: "Inativo" },
            { id: "visitor", name: "Visitante" },
          ],
        ],
        ["congregationId", "Congregação", workspace.congregations],
        ["cellId", "Célula", workspace.cells],
        ["ministryId", "Ministério", workspace.ministries],
        ["activityId", "Atividade", workspace.activities],
      ].map(([key, label, opts]) => (
        <label className="block text-xs" key={String(key)}>
          {String(label)}
          <select
            className={selectClass}
            aria-label={String(label)}
            value={String(f[key as keyof typeof f] ?? "")}
            onChange={(e) => set(String(key), e.target.value)}
          >
            <option value="">Todos</option>
            {(opts as { id: string; name: string }[]).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={f.withoutCell ?? false}
          onChange={(e) => set("withoutCell", e.target.checked)}
        />
        Somente pessoas sem célula
      </label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.inCell??false} onChange={e=>set("inCell",e.target.checked)}/>Somente participantes de célula</label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          Idade mínima
          <Input
            type="number"
            value={f.minAge ?? ""}
            onChange={(e) =>
              set("minAge", e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </label>
        <label className="text-xs">
          Idade máxima
          <Input
            type="number"
            value={f.maxAge ?? ""}
            onChange={(e) =>
              set("maxAge", e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </label>
      </div>
      <label className="text-xs">
        Sem presença há quantos dias?
        <Input
          type="number"
          value={f.absenceDays ?? ""}
          onChange={(e) =>
            set(
              "absenceDays",
              e.target.value ? Number(e.target.value) : undefined,
            )
          }
        />
      </label>
    </div>
  );
}
