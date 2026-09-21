# DESIGN.md — Design System do Altar Church

Fonte única de verdade para **layout, tipografia, cor, espaçamento e componentes de UI**.
Tudo que for visual neste projeto deriva deste documento. Se algo aqui não cobre o seu caso,
a resposta é **estender o design system**, não escrever um estilo local.

> Este arquivo é normativo. Onde ele e o código divergirem, o código está errado.

---

## 1. Princípios

1. **Um caminho para cada coisa.** Existe um `PageHeader`, um `MetricCard`, um `EmptyState`.
   Nunca reimplemente um deles localmente.
2. **Tokens, nunca literais.** Cor, raio, sombra e espaçamento vêm de tokens do tema
   (`globals.css`). `bg-[#0a0f1e]`, `text-slate-300` e `style={{ color: "#fff" }}` são dívida
   técnica visual e não passam em revisão.
3. **Ritmo, não ajuste.** Espaçamento vertical é sempre múltiplo do passo base (4px) e as
   páginas usam o mesmo ritmo (`space-y-6`). Não invente margens para "encaixar" um bloco.
4. **Tema-consciente por padrão.** Todo componente funciona em claro e escuro usando
   `bg-background` / `bg-card` / `text-foreground` / `border-border`. Exceções deliberadas
   (superfícies de marca) estão listadas em §8.
5. **Hierarquia por peso e cor, não por tamanho.** Evite escalar fonte para criar destaque.
   Use `font-semibold`, `text-muted-foreground` e espaçamento.

---

## 2. Tokens

Definidos em `src/app/globals.css`. **Nunca** use o valor literal; use a variável/utilitário.

### 2.1 Cor

| Papel | Token | Classe Tailwind |
| --- | --- | --- |
| Fundo da aplicação | `--background` | `bg-background` |
| Texto padrão | `--foreground` | `text-foreground` |
| Texto secundário | `--muted-foreground` | `text-muted-foreground` |
| Superfície (card) | `--card` | `bg-card` / `text-card-foreground` |
| Superfície elevada (popover) | `--popover` | `bg-popover` |
| Ação / marca | `--primary` | `bg-primary` / `text-primary` |
| Ação secundária | `--secondary` | `bg-secondary` |
| Preenchimento neutro | `--muted` | `bg-muted` |
| Hover de item neutro | `--accent` | `bg-accent` |
| Borda | `--border` | `border-border` |
| Contorno de foco | `--ring` | `ring-ring` |
| Sucesso | `--success` | `text-success` / `bg-success/10` |
| Atenção | `--warning` | `text-warning` / `bg-warning/15` |
| Informação | `--info` | `text-info` / `bg-info/10` |
| Erro / destrutivo | `--destructive` | `text-destructive` / `bg-destructive/10` |

**Tinta de status.** Nunca preencha um bloco com a cor sólida de status. Use o padrão
`bg-{tom}/10 text-{tom} ring-1 ring-inset ring-{tom}/15`. Exceção: ícone sobre `gradient-primary`.

**Cores de gráfico** são `--chart-1..5`, expostas via `var(--color-chart-*)`. Séries de gráfico
nunca recebem hex literal.

**Cores categóricas** (etiquetas de CRM, categorias financeiras) são dado do usuário e podem vir
de `style={{ backgroundColor: row.color }}` — é a única exceção legítima a `style` inline.

### 2.2 Tipografia

Fonte: **Geist** (`--font-sans`, `--font-heading`), mono **Geist Mono** para PIN, códigos e
números tabulares fora de tabela.

| Nível | Classes | Uso |
| --- | --- | --- |
| Título de página | `text-2xl font-bold tracking-tight md:text-3xl` | dentro do `PageHeader` |
| Título de seção | `text-base font-semibold tracking-tight` | dentro do `SectionHeader` |
| Título de card | `text-base font-medium` | `CardTitle` |
| Corpo | `text-sm` | padrão de interface |
| Apoio / legenda | `text-sm text-muted-foreground` | descrições |
| Micro-rótulo | `text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70` | grupos da sidebar, rótulos de eixo |
| Métrica | `text-2xl font-bold tracking-tight tabular-nums` | dentro do `MetricCard` |

`h1`–`h4` já recebem `font-heading` e `text-wrap: balance`; `p` recebe `text-wrap: pretty`.
Não repita essas classes.

**Números**: toda métrica, valor monetário e célula de tabela usa `tabular-nums`
(tabelas já aplicam isso via `[data-slot="table"]`).

### 2.3 Espaçamento

Escala 4px. Os únicos passos usados no layout:

| Passo | Onde |
| --- | --- |
| `gap-1` / `gap-2` | ícone + texto, ações de toolbar |
| `gap-3` | formulários densos, linhas internas de card |
| `gap-4` | **grades de métrica e de cards** (via `MetricGrid`) |
| `gap-6` / `space-y-6` | **ritmo vertical de página e entre seções** |
| `p-4` | conteúdo de card em variante compacta |
| `p-5` | conteúdo de card padrão (`MetricCard`) |
| `p-6` | painel de destaque |
| `p-8` | padding de página (desktop, no shell) |

Ritmo vertical de uma página:

```
PageHeader
   ↓ space-y-6
Filtros / toolbar
   ↓ space-y-6
Conteúdo (seções, cards, tabela)
   ↓ space-y-6
```

### 2.4 Raio

| Token | Classe | Uso |
| --- | --- | --- |
| `--radius-control` | `rounded-control` | botões, inputs, selects, tabs, itens de nav |
| `--radius-card` | `rounded-card` | cards, tiles de métrica, cascas de tabela |
| `--radius-panel` | `rounded-panel` | dialogs, sheets, popovers, tiles de ícone |
| `--radius-hero` | `rounded-hero` | painéis de destaque e blocos de marketing |

Não use `rounded-2xl` / `rounded-3xl` / `rounded-[2rem]` em código novo — os aliases acima
existem justamente para que o raio global seja ajustável em um lugar só.
`rounded-full` continua válido para pills e avatares.

### 2.5 Elevação

| Token | Classe | Uso |
| --- | --- | --- |
| — | `shadow-none` | superfícies planas dentro de outra superfície |
| `--elevation-1` | `shadow-elevation-1` | card em repouso |
| `--elevation-2` | `shadow-elevation-2` | card sob hover, elemento "levantado" |
| `--elevation-3` | `shadow-elevation-3` | dropdown, popover, tooltip |
| `--elevation-4` | `shadow-elevation-4` | dialog, sheet, overlay |

`shadow-glow` / `shadow-glow-sm` são **decoração de marca** (logo, item ativo da sidebar,
CTA). Nunca use glow como indicador de elevação.

### 2.6 Movimento

- Transições: `duration-200 ease-out`. Interações de card: `transition-[...] duration-200`.
- Entrada de página/bloco: `animate-fade-up`.
- Respeite `prefers-reduced-motion`: qualquer animação nova precisa entrar no bloco
  `@media (prefers-reduced-motion: reduce)` de `globals.css` ou usar `motion-reduce:`.
- Nunca anime `width`/`height` em listas longas.

---

## 3. Superfícies

Duas famílias, e a diferença importa:

**A. `Card` (componente shadcn).** Desenha **uma** borda (`ring-1 ring-foreground/10`) e a
elevação de repouso. Toda superfície de conteúdo é um `Card`.

```tsx
<Card className="glass">…</Card>          // ✅ card translúcido padrão do dashboard
<Card>…</Card>                            // ✅ card sólido (formulários, tabelas)
<Card className="glass rounded-3xl">…</Card>  // ❌ raio local, quebra a escala
```

**B. `.glass` / `.glass-strong` / `.glass-subtle`.** São **só fundo + blur** — não desenham
borda. Existem para compor com `Card` (ou com o shell) sem gerar borda dupla.

Para superfícies escritas à mão (fora do `Card`), use as classes de `globals.css`:

| Classe | Uso |
| --- | --- |
| `.surface` | casca plana com uma borda |
| `.surface-raised` | casca + `shadow-elevation-1` |
| `.surface-muted` | bloco neutro (filtros, faixas de contexto) |
| `.surface-inset` | bloco vazio / tracejado |
| `.surface-interactive` | casca clicável (adiciona hover de elevação e translate) |
| `.focus-ring` | anel de foco de teclado para superfícies e links |

---

## 4. Componentes compartilhados

Todos em `src/components/shared` e reexportados pelo barrel `@/components/shared`.

### 4.1 `PageHeader`

Obrigatório em toda página. Substitui qualquer `<h1>` escrito à mão.

```tsx
<PageHeader
  title="Pessoas"
  description="Cadastro, jornada e acompanhamento pastoral."
  icon={Users}                       // opcional: tile tintado
  badge={<Badge variant="outline">1.234</Badge>}   // opcional: metadados
  back={{ href: "/celulas", label: "Células" }}    // opcional: subpágina
  actions={<><Button variant="outline">Exportar</Button><Button variant="brand">Novo</Button></>}
/>
```

Regras: **uma** `variant="brand"` por header, à direita, como última ação.
Nunca coloque filtros dentro do header — eles vão na barra de filtros abaixo.

**Armadilha do parser (TypeScript):** um template literal dentro de um atributo JSX de um
elemento que já está dentro de outro atributo (`actions={ <div>…</div> }`) quebra o parser
(`TS2657` / `TS1003`). Quando as ações precisarem de template literal, passe-as como
`children` do `PageHeader` em vez de `actions`.

### 4.2 `SectionHeader`

Nível abaixo do `PageHeader`, para seções dentro da página.

```tsx
<SectionHeader title="Últimos encontros" description="12 registros" action={<Button size="sm" variant="ghost">Ver todos</Button>} />
```

### 4.3 `MetricCard` + `MetricGrid`

Único tile de KPI do sistema.

```tsx
<MetricGrid columns={4}>
  <MetricCard title="Membros ativos" value={1234} icon={Users} tone="primary" hint="+8% no mês" />
  <MetricCard title="Visitantes" value={56} icon={UsersRound} tone="info" trend="up" trendValue="12%" />
  <MetricCard title="Células" value={18} icon={Network} tone="success" variant="compact" />
</MetricGrid>
```

- `tone`: `primary | success | warning | info | destructive | neutral`
- `variant`: `default` (p-5, valor `text-2xl`) · `compact` (p-4, valor `text-xl`) ·
  `executive` (p-4, rótulo `text-xs`, ícone pequeno — KPIs densos de finanças)
- `hint`: linha de contexto sob o valor. `badge`: chip de status ao lado do valor
  (ex.: `Revisar`).
- `href` torna o tile um link; `onClick` torna-o um botão.
- Nunca aninhe um `MetricCard` dentro de outro card.
- **`tone` carrega significado, não decoração.** Use `success`/`warning`/`destructive`
  quando o número é bom/atenção/problema; para contagens neutras use `primary`.
  Se uma fileira de KPIs não tem hierarquia de status, todos ficam `primary`.

### 4.4 `EmptyState`

```tsx
<EmptyState
  icon={CalendarDays}
  title="Nenhum evento cadastrado"
  description="Crie o primeiro evento para começar a acompanhar inscrições."
  action={<Button variant="brand">Novo evento</Button>}
  variant="card"     // "card" = painel tracejado próprio; "plain" = dentro de um card existente
/>
```

### 4.5 `ViewToggle`

Substitui qualquer grupo de botões lista/grade/período.

```tsx
<ViewToggle value={viewMode} onChange={setViewMode} ariaLabel="Modo de visualização"
  options={[{ value: "list", label: "Lista", icon: List }, { value: "grid", label: "Grade", icon: LayoutGrid }]} />
```

### 4.6 `Button`

| `variant` | Uso |
| --- | --- |
| `brand` | **a** ação mais importante da tela (gradiente). Uma por bloco de decisão. |
| `default` | ação primária em contexto: submit de formulário, confirmar em dialog |
| `outline` | ação secundária lado a lado com a primária |
| `ghost` | ação terciária, ícones de toolbar, ações em linha de tabela |
| `secondary` | item ativo de `ViewToggle` / `TabsList` |
| `destructive` | exclusão e ações irreversíveis |
| `link` | navegação inline dentro de texto |

Nunca escreva `<Button className="gradient-primary">` — use `variant="brand"`.
Nunca sobrescreva `h-*`/`min-h-*`: o tamanho vem de `size` (`xs`, `sm`, `default`, `lg`, `icon*`),
que já garante alvo de toque de 44px no mobile.

### 4.7 `Badge`

Metadado curto: contagem, status, categoria. `variant="outline"` para neutro,
`default` para contagem ativa, `destructive` para alerta. Nunca use Badge como botão.

---

## 5. Layout

### 5.1 Moldura de página

O shell (`DashboardLayout`) fornece largura máxima, padding e ritmo. A página só declara o
próprio conteúdo:

```tsx
export function MinhaPagina() {
  return (
    <div className="space-y-6">
      <PageHeader … />
      {/* toolbar */}
      {/* conteúdo */}
    </div>
  )
}
```

Proibido na página: `max-w-*` no wrapper raiz, `p-8` próprio, `min-h-screen`, cor de fundo.
Uma exceção só: `max-w-*` em controles internos (input de busca, célula de tabela).

### 5.2 Grades

| Conteúdo | Grade |
| --- | --- |
| KPIs | `<MetricGrid columns={3|4|5}>` |
| Cards de módulo / lista em grade | `grid gap-4 sm:grid-cols-2 xl:grid-cols-3` |
| Split de duas colunas | `grid gap-6 lg:grid-cols-2` |
| Formulário denso | `grid gap-4 md:grid-cols-2` ou `lg:grid-cols-6` |

### 5.3 Abas

```tsx
<Tabs defaultValue="a" className="space-y-6">
  <TabsList>…</TabsList>
  <TabsContent value="a" className="mt-0 space-y-6">…</TabsContent>
</Tabs>
```

`TabsContent` sempre com `mt-0` — o ritmo vem do `space-y-6` do `Tabs`.

### 5.4 Barra de filtros

Logo abaixo do `PageHeader`:

```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
  {/* controles com largura própria: w-full sm:w-[200px] */}
  <ViewToggle … className="sm:ml-auto" />
</div>
```

Controles de busca nunca têm `max-w` fixo em mobile — ocupam a linha inteira.

### 5.5 Tabelas e listas

- Casca: `<Card className="glass p-0">` + `<CardContent className="p-0">`.
- Em mobile, tabela densa vira lista de cards (`hidden md:block` + `md:hidden`), como em
  `congregacoes`.
- Ações de linha: `Button variant="ghost" size="icon-sm"`, agrupadas à direita.

---

## 6. Acessibilidade

- Um `<h1>` por página — sempre o do `PageHeader`. A marca na sidebar **não** é heading.
- Toda ação só com ícone tem `aria-label` (e `title` quando ajudar).
- Item de navegação ativo: `aria-current="page"`. Toggle: `aria-pressed`.
- Foco visível sempre: use `.focus-ring` ou as variantes do `Button`. Nunca `outline-none` sem
  substituto.
- Contraste mínimo AA (4.5:1 em texto normal). Ao usar tinta de status, garanta o par
  claro/escuro — é a razão de existir do `tone` no `MetricCard`.
- Alvo de toque mínimo 44px em mobile (`min-h-11`), já embutido nos componentes base.

---

## 7. Checklist de revisão de UI

- [ ] Usa `PageHeader`, `MetricCard`, `EmptyState`, `SectionHeader`, `ViewToggle` — nada local.
- [ ] Nenhuma cor literal, hex, `rgb()`, `text-slate-*` ou `bg-[#…]`.
- [ ] Raio vem de `rounded-control|card|panel|hero|full`.
- [ ] Espaçamento em passos de 4px; ritmo da página em `space-y-6`.
- [ ] Funciona em tema claro **e** escuro.
- [ ] Ação primária é `variant="brand"` (no máximo uma por bloco).
- [ ] Um `<h1>` na página; ícones-ação com `aria-label`.
- [ ] `tabular-nums` em métricas, dinheiro e tabelas.
- [ ] Nada quebra em 360px de largura.

---

## 8. Exceções deliberadas

Estas superfícies **não** usam os tokens do tema, por decisão de marca. Não as "corrija"
para `bg-background`, e não replique o estilo delas dentro do app autenticado.

| Superfície | Motivo | O que é permitido |
| --- | --- | --- |
| `(auth)` — login, cadastro, recuperação | Tela de marca, sempre escura | Paleta local escura, gradiente da marca, `animate-aurora`, `.auth-grid` |
| Landing (`/`) | Marketing, sempre escura | Paleta local escura, gradiente, `rounded-full`, animações de entrada |
| Mapa 3D de células / `(public)/church/[slug]/celulas` | Experiência imersiva com tema próprio controlado em runtime | `themeMode` local, paleta do mapa, cores do skybox |
| Páginas públicas de formulário/evento/check-in | Vitrine pública | `gradient-hero`/`gradient-primary`, `Card` com `shadow-elevation-*` |
| Marcas de terceiros (ícones de Instagram, Facebook, YouTube, X; logo WhatsApp no mock de telefone) | A cor **é** a marca, não um status | Paleta própria da plataforma, sem token |

Regra de fronteira: **exceção não vaza**. Componente dentro de `/dashboard`, `/membro`,
`/portal` ou `/admin` segue este documento integralmente.

---

## 9. Onde mexer

| Preciso de… | Vá para |
| --- | --- |
| Novo token / utilitário de superfície | `src/app/globals.css` |
| Novo primitivo compartilhado | `src/components/shared/` + barrel `index.ts` |
| Novo primitivo base (shadcn) | `src/components/ui/` |
| Moldura, sidebar, topbar, nav mobile | `src/components/layout/dashboard-layout.tsx` |
| Rotas e rótulos da navegação | `src/lib/navigation/routes.ts` |
