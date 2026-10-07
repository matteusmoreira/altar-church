"use client"

import { useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileText, Plug, Search, ShieldCheck, Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AccessEditor, AccessDeleteDialog } from "./access-editor"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/shared"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { IntegrationsPanel } from "./integrations-panel"
import { UazapiInstancesPanel } from "./uazapi-instances-panel"
import type { SettingsData, SettingsProfile } from "@/lib/settings/data"
import type { UazapiInstancesData } from "@/lib/uazapi/types"
import type { UserRole } from "@/lib/types"

const roleLabels: Record<UserRole, string> = {
  superadmin: "SuperAdmin",
  admin: "Admin",
  pastor: "Pastor",
  ministry_leader: "Líder de ministério",
  cell_supervisor: "Supervisor de células",
  cell_leader: "Líder de célula",
  communication: "Comunicação",
  finance: "Financeiro",
  volunteer: "Voluntário",
  member: "Membro",
}

const roleColors: Record<UserRole, string> = {
  superadmin: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700",
  admin: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-700",
  pastor: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-700",
  ministry_leader: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-700",
  cell_supervisor: "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-200 dark:border-cyan-700",
  cell_leader: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-700",
  communication: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950 dark:text-pink-200 dark:border-pink-700",
  finance: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700",
  volunteer: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-700",
  member: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
}

function formatDate(value: string) {
  return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR })
}

export function SettingsClient({
  settingsData,
  uazapiData,
}: {
  settingsData: SettingsData
  uazapiData: UazapiInstancesData | null
}) {
  const [accessSearch, setAccessSearch] = useState("")
  const [editing, setEditing] = useState<SettingsProfile | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<SettingsProfile | null>(null)
  const query = accessSearch.trim().toLowerCase()
  const filteredProfiles = useMemo(() => {
    if (!query) return settingsData.profiles
    return settingsData.profiles.filter((profile) => {
      return (
        profile.name.toLowerCase().includes(query) ||
        profile.email.toLowerCase().includes(query) ||
        profile.id.toLowerCase().includes(query) ||
        (profile.companyName ?? "").toLowerCase().includes(query)
      )
    })
  }, [query, settingsData.profiles])

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Conta, acessos e integrações externas (API / webhooks)." />

      <Tabs defaultValue="conta" className="space-y-6">
        <TabsList>
          <TabsTrigger value="conta">
            <FileText className="h-4 w-4" />
            Conta
          </TabsTrigger>
          <TabsTrigger value="acessos">
            <ShieldCheck className="h-4 w-4" />
            Gestão de acessos
          </TabsTrigger>
          <TabsTrigger value="integracoes">
            <Plug className="h-4 w-4" />
            Integrações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conta" className="mt-0">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Dados da empresa</CardTitle>
            </CardHeader>
            <CardContent>
              {settingsData.company ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nome</p>
                    <p className="font-medium">{settingsData.company.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Slug</p>
                    <p className="font-medium">{settingsData.company.slug}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Plano</p>
                    <p className="font-medium">{settingsData.company.planName ?? "Sem plano"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline">{settingsData.company.status}</Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  SuperAdmin visualiza acessos globais. Selecione uma empresa no console para editar plano e módulos.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acessos" className="mt-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{settingsData.profiles.length} acesso(s). Gerencie os logins e as funções da equipe.</p>
            {settingsData.company && <Button onClick={() => setEditing(null)}><Plus className="mr-2 h-4 w-4" />Novo acesso</Button>}
          </div>
          <Card className="glass">
            <CardHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, e-mail, empresa ou ID"
                  value={accessSearch}
                  onChange={(event) => setAccessSearch(event.target.value)}
                  className="pl-9 md:pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Perfis</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Ativo</TableHead>
                    {settingsData.company && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium text-sm">{profile.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profile.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">{profile.roles.map((role) => <Badge key={role} variant="outline" className={roleColors[role]}>
                          {roleLabels[role]}
                        </Badge>)}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profile.companyName ?? "Global"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(profile.createdAt)}</TableCell>
                      <TableCell>
                        <Badge className={profile.active ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                          {profile.active ? "Sim" : "Não"}
                        </Badge>
                      </TableCell>
                      {settingsData.company && <TableCell><div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing(profile)} disabled={profile.role === "superadmin"} aria-label={`Editar acesso de ${profile.name}`}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                        <Button size="icon-sm" variant="ghost" className="text-destructive" disabled={profile.id === settingsData.actorId || profile.role === "superadmin"} onClick={() => setDeleting(profile)} aria-label={`Excluir acesso de ${profile.name}`}><Trash2 className="h-4 w-4" /></Button>
                      </div></TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredProfiles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-sm text-muted-foreground">Nenhum usuário encontrado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integracoes" className="mt-0 space-y-6">
          {uazapiData && <UazapiInstancesPanel data={uazapiData} />}
          {settingsData.company && settingsData.integrations ? (
            <IntegrationsPanel
              companyId={settingsData.company.id}
              webhooks={settingsData.integrations.webhooks}
              apiKeys={settingsData.integrations.apiKeys}
              deliveries={settingsData.integrations.deliveries}
            />
          ) : (
            <Card className="glass">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Integrações ficam disponíveis no contexto de uma igreja. SuperAdmin: abra as
                configurações a partir de uma empresa específica.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      {editing !== undefined && <AccessEditor key={editing?.id ?? "new"} profile={editing} cells={settingsData.cells} actorId={settingsData.actorId} onClose={() => setEditing(undefined)} />}
      {deleting && <AccessDeleteDialog profile={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}
