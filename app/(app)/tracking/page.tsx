import { createClient } from "@/lib/supabase/server"
import { AnnoSelector } from "@/components/letture/anno-selector"
import { TrackingTable } from "@/components/tracking/tracking-table"
import {
  PartnerFilter,
  PARTNER_FILTER_DIRETTI,
} from "@/components/shared/partner-filter"

export default async function TrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; partner?: string }>
}) {
  const { anno: annoParam, partner } = await searchParams
  const anno = annoParam ? Number(annoParam) : new Date().getFullYear()

  const supabase = await createClient()

  let clientiQuery = supabase
    .from("clienti")
    .select("id, ragione_sociale, partner_id")
    .eq("attivo", true)
    .order("ragione_sociale")

  if (partner === PARTNER_FILTER_DIRETTI) {
    clientiQuery = clientiQuery.is("partner_id", null)
  } else if (partner) {
    clientiQuery = clientiQuery.eq("partner_id", partner)
  }

  const [{ data: clienti, error }, { data: partnerOptions }] = await Promise.all([
    clientiQuery,
    supabase
      .from("partner")
      .select("id, ragione_sociale")
      .eq("attivo", true)
      .order("ragione_sociale"),
  ])

  if (error) {
    return <p className="text-destructive">Errore nel caricamento: {error.message}</p>
  }

  const clienteIds = (clienti ?? []).map((c) => c.id)

  const [{ data: impianti }, { data: fatture }] = await Promise.all([
    clienteIds.length > 0
      ? supabase
          .from("impianti")
          .select("id, nome_impianto, cliente_id, diritto_licenza_dovuto")
          .in("cliente_id", clienteIds)
          .eq("attivo", true)
          .order("nome_impianto")
      : Promise.resolve({ data: [] as never[] }),
    clienteIds.length > 0
      ? supabase
          .from("tracking_fatture")
          .select("cliente_id, emessa")
          .in("cliente_id", clienteIds)
          .eq("anno", anno)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const impiantoIds = (impianti ?? []).map((i) => i.id)
  const { data: dichiarazioni } =
    impiantoIds.length > 0
      ? await supabase
          .from("tracking_dichiarazioni")
          .select("impianto_id, periodo, inviata")
          .in("impianto_id", impiantoIds)
          .eq("anno", anno)
      : { data: [] }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Tracking — Anno <span className="text-primary">{anno}</span>
        </h1>
        <AnnoSelector anno={anno} />
      </div>
      <p className="text-sm text-muted-foreground">
        Spunta la dichiarazione doganale inviata per ogni impianto (semestrale
        per gli impianti con diritto di licenza dovuto, annuale per gli
        altri) e la fattura emessa al cliente per l&apos;anno.
      </p>
      <PartnerFilter partnerOptions={partnerOptions ?? []} />
      <TrackingTable
        anno={anno}
        clienti={clienti ?? []}
        impianti={impianti ?? []}
        dichiarazioni={dichiarazioni ?? []}
        fatture={fatture ?? []}
      />
    </div>
  )
}
