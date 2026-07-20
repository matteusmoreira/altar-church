"use client"

import { useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileText, Plug, Search, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import type { SettingsData } from "@/lib/settings/data"
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

const roleColors: Partial<Record<UserRole, string>> = {
  superadmin: "bg-warning/10 text-warning border-warning/20",
  admin: "bg-primary/10 text-primary border-primary/20",
  pastor: "bg-info/10 text-info border-info/20",
  finance: "bg-success/10 text-success border-success/20",
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Configurações</h1>
        <p className="text-muted-foreground">Conta, acessos e integrações externas (API / webhooks).</p>
      </div>

      <Tabs defaultValue="conta">
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

        <TabsContent value="conta" className="mt-4">
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

        <TabsContent value="acessos" className="mt-4 space-y-4">
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
                    <TableHead>Função</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Ativo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium text-sm">{profile.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profile.email}</TableCell>
                      <TableCell>
                        <Badge className={roleColors[profile.role] ?? "bg-secondary/10 text-secondary border-secondary/20"}>
                          {roleLabels[profile.role]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profile.companyName ?? "Global"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(profile.createdAt)}</TableCell>
                      <TableCell>
                        <Badge className={profile.active ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                          {profile.active ? "Sim" : "Não"}
                        </Badge>
                      </TableCell>
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

        <TabsContent value="integracoes" className="mt-4 space-y-4">
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
    </div>
  )
}
