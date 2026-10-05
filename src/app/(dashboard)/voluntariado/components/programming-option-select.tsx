"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConfirmAction } from "@/components/shared/use-confirm-action";
import { changeVolunteerProgrammingOption } from "@/lib/volunteers/client-actions";
import { programmingOptionLabel } from "@/lib/volunteers/programming-options";

export function ProgrammingOptionSelect({ field, value, options: initialOptions, onChange }: {
  field: "kind" | "location";
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const router = useRouter();
  const confirmDelete = useConfirmAction();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(initialOptions);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const label = field === "kind" ? "Tipo" : "Local";
  const id = `activity-${field}`;

  async function change(operation: "add" | "delete", option: string) {
    setBusy(true);
    try {
      const result = await changeVolunteerProgrammingOption({ field, operation, value: option });
      if (!result.ok) return toast.error(result.error ?? "Não foi possível salvar a opção");
      setOptions(result.data as string[]);
      if (operation === "add") {
        onChange(option.trim());
        setName("");
        setOpen(false);
      } else if (value === option) onChange("");
      toast.success(operation === "add" ? "Opção cadastrada" : "Opção excluída");
      router.refresh();
    } catch {
      toast.error("Não foi possível salvar a opção. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} id={`${id}-label`}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button type="button" variant="outline" />} id={id}
          aria-labelledby={`${id}-label ${id}-value`} className="h-10 w-full justify-between font-normal">
          <span id={`${id}-value`} className="truncate">{value ? programmingOptionLabel(value, field) : `Selecione ${label.toLowerCase()}`}</span>
          <ChevronDown className="size-4 shrink-0" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-64 max-w-[calc(100vw-2rem)]">
          <div role="group" aria-label={`Opções de ${label.toLowerCase()}`} className="max-h-52 overflow-y-auto">
            {field === "location" && <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => { onChange(""); setOpen(false); }}>Sem local</Button>}
            {options.map((option) => (
              <div key={option} className="flex items-center gap-1">
                <Button type="button" variant={value === option ? "secondary" : "ghost"} className="min-w-0 flex-1 justify-start" disabled={busy}
                  onClick={() => { onChange(option); setOpen(false); }}>
                  <span className="truncate">{programmingOptionLabel(option, field)}</span>
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={`Excluir ${programmingOptionLabel(option, field)}`}
                  onClick={() => {
                    setOpen(false);
                    confirmDelete.confirm({ title: "Excluir opção?", message: `“${programmingOptionLabel(option, field)}” será removida da lista. As escalas já cadastradas serão preservadas.`, confirmLabel: "Excluir opção", action: () => void change("delete", option) });
                  }}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            {options.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nenhuma opção cadastrada.</p>}
          </div>
          <div className="space-y-2 border-t pt-2">
            <Label htmlFor={`${id}-new`}>Cadastrar {field === "kind" ? "tipo" : "local"}</Label>
            <div className="flex gap-2">
              <Input id={`${id}-new`} value={name} onChange={(event) => setName(event.target.value)} disabled={busy}
                maxLength={field === "kind" ? 100 : 240} placeholder={field === "kind" ? "Novo tipo" : "Novo local"}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (name.trim() && !busy) void change("add", name); } }} />
              <Button type="button" size="icon" disabled={busy || !name.trim()} aria-label={`Cadastrar ${label.toLowerCase()}`} onClick={() => void change("add", name)}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {confirmDelete.dialog()}
    </div>
  );
}
