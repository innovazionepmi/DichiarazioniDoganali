import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { ImpiantoTable } from "@/components/impianti/impianto-table"
import {
  PartnerFilter,
  PARTNER_FILTER_DIRETTI,
} from "@/components/shared/partner-filter"

export default async function ImpiantiListPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>
}) {
  const { partner } = await searchParams
  const supabase = await createClient()

  // `!inner` è necessario per poter filtrare sulla colonna partner_id della
  // risorsa incorporata `cliente` (brief §3.1: filtro impianti per ditta
  // committente).
  let query = supabase
    .from("impianti")
    .select(
      "id, nome_impianto, tipo_soggetto, potenza_kw, attivo, cliente:cliente_id!inner(ragione_sociale, partner_id)"
    )
    .order("nome_impianto")

  if (partner === PARTNER_FILTER_DIRETTI) {
    query = query.is("cliente.partner_id", null)
  } else if (partner) {
    query = query.eq("cliente.partner_id", partner)
  }

  const [{ data: impianti, error }, { data: partnerOptions }] = await Promise.all([
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
        <h1 className="text-xl font-semibold">Impianti</h1>
        <Button
          nativeButton={false}
          render={<Link href="/anagrafiche/impianti/nuovo">Nuovo impianto</Link>}
        />
      </div>
      <PartnerFilter partnerOptions={partnerOptions ?? []} />
      <ImpiantoTable
        data={(impianti ?? []).map((i) => ({
          ...i,
          cliente: Array.isArray(i.cliente) ? i.cliente[0] ?? null : i.cliente,
        }))}
      />
    </div>
  )
}
