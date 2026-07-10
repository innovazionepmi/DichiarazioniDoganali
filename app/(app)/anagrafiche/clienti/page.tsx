import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { ClienteTable } from "@/components/clienti/cliente-table"
import {
  PartnerFilter,
  PARTNER_FILTER_DIRETTI,
} from "@/components/shared/partner-filter"

export default async function ClientiListPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>
}) {
  const { partner } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from("clienti")
    .select(
      "id, ragione_sociale, codice_fiscale, partita_iva, attivo, partner:partner_id(ragione_sociale)"
    )
    .order("ragione_sociale")

  if (partner === PARTNER_FILTER_DIRETTI) {
    query = query.is("partner_id", null)
  } else if (partner) {
    query = query.eq("partner_id", partner)
  }

  const [{ data: clienti, error }, { data: partnerOptions }] = await Promise.all([
    query,
    supabase
      .from("partner")
      .select("id, ragione_sociale")
      .eq("attivo", true)
      .order("ragione_sociale"),
  ])

  if (error) {
    return <p className="text-destructive">Errore nel caricamento: {error.message}</p>
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clienti</h1>
        <Button render={<Link href="/anagrafiche/clienti/nuovo">Nuovo cliente</Link>} />
      </div>
      <PartnerFilter partnerOptions={partnerOptions ?? []} />
      <ClienteTable
        data={(clienti ?? []).map((c) => ({
          ...c,
          partner: Array.isArray(c.partner) ? c.partner[0] ?? null : c.partner,
        }))}
      />
    </div>
  )
}
