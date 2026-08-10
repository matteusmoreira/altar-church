export function JsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://altarchurch.com.br/#organization",
        "name": "Altar Church",
        "url": "https://altarchurch.com.br",
        "logo": "https://altarchurch.com.br/icons/logo.png",
        "description": "Sistema completo e inteligente de gestão para igrejas, células, eventos, financeiro e voluntários.",
        "sameAs": [
          "https://instagram.com/altarchurch",
          "https://linkedin.com/company/altarchurch"
        ]
      },
      {
        "@type": "WebSite",
        "@id": "https://altarchurch.com.br/#website",
        "url": "https://altarchurch.com.br",
        "name": "Altar Church",
        "inLanguage": "pt-BR",
        "publisher": {
          "@id": "https://altarchurch.com.br/#organization"
        }
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://altarchurch.com.br/#application",
        "name": "Altar Church",
        "operatingSystem": "All",
        "applicationCategory": "BusinessApplication",
        "description": "Sistema completo de gestão inteligente para igrejas. Gerencie membros, células, finanças, voluntários e Altar Kids.",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "BRL"
        }
      }
    ]
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
