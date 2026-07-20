import { Church } from "lucide-react"

type AuthCardProps = {
  title: string
  subtitle: string
  children: React.ReactNode
  /** conteúdo extra exibido abaixo do formulário (ex.: botão de instalação PWA) */
  below?: React.ReactNode
}

/**
 * Cartão de autenticação com glassmorphism escuro real.
 * Cores fixas (não seguem o tema do sistema) para combinar com o AuthBackdrop.
 */
export function AuthCard({ title, subtitle, children, below }: AuthCardProps) {
  return (
    <div className="relative z-10 w-full max-w-[420px]">
      <div className="animate-fade-up rounded-3xl bg-gradient-to-b from-white/15 via-white/5 to-transparent p-px shadow-[0_24px_80px_-24px_rgba(2,6,23,0.9)]">
        <div className="rounded-[calc(1.5rem-1px)] bg-[#0a0f1e]/85 px-6 py-8 backdrop-blur-2xl sm:px-8 sm:py-9">
          <div className="animate-fade-up mb-7 flex flex-col items-center text-center [animation-delay:80ms]">
            <div className="relative mb-5">
              <div className="animate-glow absolute inset-0 rounded-2xl bg-blue-500/50 blur-xl" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-sky-400 shadow-lg ring-1 ring-white/25">
                <Church className="h-7 w-7 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
            <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-balance text-slate-400">{subtitle}</p>
          </div>

          <div className="animate-fade-up [animation-delay:160ms]">{children}</div>

          {below ? <div className="animate-fade-up mt-5 [animation-delay:240ms]">{below}</div> : null}
        </div>
      </div>

      <p className="animate-fade-up mt-6 text-center text-xs text-slate-500 [animation-delay:320ms]">
        © 2026 Altar Church · Gestão inteligente para igrejas
      </p>
    </div>
  )
}
