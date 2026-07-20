/**
 * Fundo cinematográfico das telas de autenticação.
 * Sempre escuro (não depende do tema do sistema) e com animações sutis.
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-[#05070f]">
      {/* gradiente base */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(56,89,199,0.35),transparent),radial-gradient(ellipse_60%_50%_at_85%_110%,rgba(14,165,233,0.16),transparent)]" />

      {/* orbes aurora animados */}
      <div className="animate-aurora absolute -top-32 left-1/2 -ml-[340px] h-[420px] w-[680px] rounded-full bg-blue-600/25 blur-[120px]" />
      <div className="animate-aurora absolute top-1/3 -left-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-[110px] [animation-delay:2.5s]" />
      <div className="animate-aurora absolute -right-24 -bottom-40 h-[420px] w-[420px] rounded-full bg-sky-500/15 blur-[130px] [animation-delay:5s]" />

      {/* grade sutil */}
      <div className="auth-grid absolute inset-0" />

      {/* vinheta para foco no centro */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,transparent_40%,rgba(3,5,10,0.75))]" />
    </div>
  )
}
