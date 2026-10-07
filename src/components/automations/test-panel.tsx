"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  simulateAutomation,
  sendAutomationDraftTest,
} from "@/lib/automations/actions";
import {
  advanceSimulation,
  simulationPrompt,
  type SimulationState,
} from "@/lib/automations/simulation";
import type { FlowDefinition } from "@/lib/automations/contract";
import type { Workspace } from "@/lib/automations/workspace-types";
import { hasPermission } from "@/lib/types";
import { MessagePreview } from "./message-preview";

export function AutomationTestPanel({
  definition,
  workspace,
  preview,
}: {
  definition: FlowDefinition;
  workspace: Workspace;
  preview?: boolean;
}) {
  const [personId, setPersonId] = useState(workspace.people[0]?.id ?? "");
  const [state, setState] = useState<SimulationState | null>(null);
  const [audiences, setAudiences] = useState<Record<string, string[]>>({});
  const [answer, setAnswer] = useState("");
  const [phone, setPhone] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const requests = useRef(new Map<number, string>());
  const [results, setResults] = useState<Record<number, string>>({});
  const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  const node = definition.nodes.find((n) => n.id === state?.nodeId);
  const allowsGuest = definition.nodes.some(n => n.kind === "trigger" && n.config.allowUnknownContacts);
  const congregationPage = Number(state?.context.question_page ?? 0);
  const congregationChoices = workspace.congregations.length > 10 ? workspace.congregations.slice(congregationPage * 8, congregationPage * 8 + 8) : workspace.congregations;
  async function start() {
    setBusy(true);
    try {
      let context: Record<string, string>;
      if (personId === "guest" && allowsGuest) {
        context = { nome: "", primeiro_nome: "", igreja: "Sua igreja", chat_id: "5511999999999@s.whatsapp.net" };
        setAudiences({});
      } else if (preview) {
        const person = workspace.people.find((p) => p.id === personId)!;
        context = {
          nome: person.full_name,
          primeiro_nome: person.full_name.split(" ")[0],
          igreja: "Sua igreja",
          status: "active",
          person_type: "member",
        };
        setAudiences({});
      } else {
        const result = await simulateAutomation(definition);
        const person = [...result.included, ...result.excluded].find(
          (p) => p.id === personId,
        );
        if (!person) throw new Error("Pessoa não disponível para simular");
        context = Object.fromEntries(
          Object.entries(person.context).map(([k, v]) => [k, String(v ?? "")]),
        );
        setAudiences(result.audiences);
      }
      const root = definition.nodes.find((n) => n.kind === "trigger");
      if (!root) throw new Error("Adicione o bloco Início");
      setState({ nodeId: root.id, context, entries: [] });
      setAnswer("");
      setResults({});
      requests.current.clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível simular");
    } finally {
      setBusy(false);
    }
  }
  async function send(index: number) {
    if (sending.current || preview || !state) return;
    sending.current = true;
    setBusy(true);
    // Keep the same key even after a transport error: retrying cannot send twice.
    const requestId = requests.current.get(index) ?? crypto.randomUUID();
    requests.current.set(index, requestId);
    const entry = state.entries[index];
    try {
      const result = await sendAutomationDraftTest({
        definition,
        nodeId: entry.nodeId,
        personId,
        context: entry.context,
        phone,
        instanceId,
        requestId,
      });
      setResults((r) => ({
        ...r,
        [index]:
          result.status === "accepted"
            ? "Aceita pelo provedor; confira no WhatsApp"
            : result.error,
      }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [index]:
          e instanceof Error
            ? e.message
            : "Resultado não confirmado; confira no WhatsApp",
      }));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Teste da automação"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <h3 className="font-semibold">Testar rascunho</h3>
      <p className="text-xs text-muted-foreground">
        Simule os caminhos sem alterar cadastros. O envio real ocorre somente ao
        clicar em uma mensagem e usa exclusivamente o número de teste.
      </p>
      <label className="block text-sm">
        Pessoa para contexto
        <select
          aria-label="Pessoa para contexto"
          className={selectClass}
          value={personId}
          disabled={busy}
          onChange={(e) => {
            setPersonId(e.target.value);
            setState(null);
            setResults({});
            requests.current.clear();
          }}
        >
          {allowsGuest && <option value="guest">Contato novo (simulado)</option>}
          {workspace.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </label>
      <Button onClick={() => void start()} disabled={busy || !personId}>
        {state ? "Reiniciar simulação" : "Iniciar simulação"}
      </Button>
      {state && (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-sm">
              Número de teste
              <Input
                aria-label="Número de teste"
                type="tel"
                value={phone}
                disabled={busy}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="55 11 99999-9999"
              />
            </label>
            <label className="text-sm">
              Instância de teste
              <select
                aria-label="Instância de teste"
                className={selectClass}
                value={instanceId}
                disabled={busy}
                onChange={(e) => setInstanceId(e.target.value)}
              >
                <option value="">Selecione uma instância conectada</option>
                {workspace.instances
                  .filter((i) => i.status === "connected")
                  .map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <ol className="space-y-3">
            {state.entries.map((entry, index) => {
              const visited = definition.nodes.find(
                (n) => n.id === entry.nodeId,
              )!;
              return (
                <li key={index} className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {index + 1}. {entry.label}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-xs">
                    {visited.kind === "kanban_move"
                      ? `Moveria ou criaria card em ${workspace.stages.find((s) => s.id === visited.config.stageId)?.name ?? "coluna não configurada"}`
                      : entry.detail}
                  </p>
                  {visited.kind === "whatsapp" && visited.config.message && (
                    <>
                      <MessagePreview
                        message={visited.config.message}
                        context={entry.context}
                        preview={preview}
                      />
                      <Button
                        variant="outline"
                        className="max-w-full whitespace-normal"
                        disabled={
                          busy ||
                          !!results[index] ||
                          !phone ||
                          !instanceId ||
                          preview ||
                          !hasPermission(
                            workspace.roles ?? [workspace.role],
                            "communication.send",
                          ) ||
                          !hasPermission(workspace.roles ?? [workspace.role], "automations.operate")
                        }
                        onClick={() => void send(index)}
                      >
                        Enviar ao WhatsApp de teste
                      </Button>
                      {results[index] && (
                        <p role="status" className="text-xs">
                          {results[index]}
                        </p>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          {node ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Próximo: {node.label}</p>
              <p className="text-xs">{simulationPrompt(node)}</p>
              {node.kind === "question" && node.config.questionType === "congregation" && (
                <label className="block text-sm">Congregação simulada
                  <select aria-label="Congregação simulada" className={selectClass} value={answer} onChange={e => setAnswer(e.target.value)}>
                    <option value="">Selecione…</option>
                    {congregationChoices.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    {congregationPage > 0 && <option value="__previous">Página anterior</option>}
                    {workspace.congregations.length > 10 && (congregationPage + 1) * 8 < workspace.congregations.length && <option value="__next">Próxima página</option>}
                  </select>
                </label>
              )}
              {(node.kind === "response" || node.kind === "ai" || (node.kind === "question" && node.config.questionType !== "congregation")) && (
                <Textarea
                  aria-label={
                    node.kind === "ai"
                      ? "Resultado simulado da IA"
                      : "Resposta simulada"
                  }
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {(node.kind === "response" || node.kind === "task_wait" || node.kind === "question"
                  ? ["response", "timeout", "error"]
                  : node.kind === "register_person" ? ["next", "error"] : ["next"]
                ).map((port) => (
                  <Button
                    key={port}
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setState(
                        advanceSimulation(definition, state, {
                          response: answer,
                          aiText: answer,
                          port,
                          congregations: workspace.congregations,
                          audienceMatches: preview || personId === "guest"
                            ? true
                            : audiences[node.id]?.includes(personId),
                        }),
                      );
                      setAnswer("");
                    }}
                  >
                    {port === "timeout"
                      ? "Simular prazo vencido"
                      : port === "error"
                        ? "Simular erro"
                        : node.kind === "wait"
                          ? "Avançar espera"
                          : node.kind === "task_wait"
                            ? "Concluir tarefa"
                            : "Avançar bloco"}
                  </Button>
                ))}
              </div>
              {state.error && <p role="alert" className="text-sm text-amber-700">{state.error}</p>}
            </div>
          ) : (
            <p role="status" className="text-sm">
              {state.error ??
                "Simulação concluída. Nenhum cadastro foi alterado."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
