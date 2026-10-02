import type { ReactNode } from "react"

// Cartella collassata "Archiviati": gli elementi archiviati non devono
// mescolarsi alla lista degli attivi (feedback Paolo: disturbano), ma devono
// restare raggiungibili per poterli ripristinare. Nascosta del tutto se non
// ce ne sono.
export function SezioneArchiviati({ count, children }: { count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted-foreground">
        Archiviati ({count})
      </summary>
      <div className="p-3">{children}</div>
    </details>
  )
}
