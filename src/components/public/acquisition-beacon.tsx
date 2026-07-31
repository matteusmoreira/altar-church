"use client"

import { useEffect } from "react"

function sessionKey() {
  const storageKey = "altar-public-session"
  const existing = window.sessionStorage.getItem(storageKey)
  if (existing) return existing
  const next = crypto.randomUUID()
  window.sessionStorage.setItem(storageKey, next)
  return next
}

export function AcquisitionBeacon({ companySlug }: { companySlug: string }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const source = params.get("source") || params.get("origem") || params.get("src") || params.get("utm_source") || "direct"
    void fetch("/api/public/acquisition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        companySlug,
        source,
        sourceLabel: params.get("source_label") || params.get("origem_label") || "",
        utmSource: params.get("utm_source") || "",
        utmMedium: params.get("utm_medium") || "",
        utmCampaign: params.get("utm_campaign") || "",
        utmContent: params.get("utm_content") || "",
        utmTerm: params.get("utm_term") || "",
        landingPath: `${window.location.pathname}${window.location.search}`,
        referrer: document.referrer,
        sessionKey: sessionKey(),
      }),
      keepalive: true,
    }).catch(() => undefined)
  }, [companySlug])

  return null
}
