"use client"
/* eslint-disable @next/next/no-img-element -- exact-size print raster must not pass through image optimization */

import { useEffect, useState } from "react"
import { renderLabelToPng } from "@/lib/kids/label-renderer"
import type { KidPrintableLabel } from "@/lib/kids/types"

export function PrintableLabels({ labels, print = false }: { labels: KidPrintableLabel[]; print?: boolean }) {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    let active = true
    void Promise.all(labels.map((label) => renderLabelToPng({ design: label.design, context: label.context, widthMm: label.widthMm, heightMm: label.heightMm, dpi: label.dpi }))).then((next) => { if (active) setUrls(next) })
    return () => { active = false }
  }, [labels])
  return <div className={print ? "kids-label-print" : "flex flex-wrap justify-center gap-4"}>{labels.map((label, index) => <div key={`${label.kind}-${label.revisionId ?? "legacy"}`} className={print ? "kids-label-page" : "rounded-md border bg-white p-1 shadow"} style={{ width: `${label.widthMm}mm`, height: `${label.heightMm}mm`, breakAfter: index < labels.length - 1 ? "page" : "auto" }}><img src={urls[index] ?? ""} alt={label.kind === "child" ? "Etiqueta da criança" : "Etiqueta do responsável"} className="block h-full w-full" /></div>)}</div>
}
