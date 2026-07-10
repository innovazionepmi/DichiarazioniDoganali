"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const PARTNER_FILTER_TUTTI = "__tutti__"
export const PARTNER_FILTER_DIRETTI = "__diretti__"

// Riusato dalle liste clienti e impianti per filtrare per ditta committente
// (brief §3.1: "Deve essere possibile filtrare tutti gli impianti per ditta
// committente"). Filtra lato server via query param, non lato client.
export function PartnerFilter({
  partnerOptions,
}: {
  partnerOptions: { id: string; ragione_sociale: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get("partner") ?? PARTNER_FILTER_TUTTI

  function handleChange(value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === PARTNER_FILTER_TUTTI) {
      params.delete("partner")
    } else {
      params.set("partner", value)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Filtra per ditta committente" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PARTNER_FILTER_TUTTI}>
          Tutte le ditte committenti
        </SelectItem>
        <SelectItem value={PARTNER_FILTER_DIRETTI}>
          Solo diretti (nessun partner)
        </SelectItem>
        {partnerOptions.map((partner) => (
          <SelectItem key={partner.id} value={partner.id}>
            {partner.ragione_sociale}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
