import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LettureTable } from "@/components/letture/letture-table"
import { AnnoSelector } from "@/components/letture/anno-selector"
import { ImportaPdfDialog } from "@/components/letture/importa-pdf-dialog"

export default async function LettureImpiantoPage({
  params,
  searchParams,
}: {
  params: Promise<{ impiantoId: string }>
  searchParams: Promise<{ anno?: string }>
}) {
  const { impiantoId } = await params
  const { anno: annoParam } = await searchParams
  const anno = annoParam ? Number(annoParam) : new Date().getFullYear()

  const supabase = await createClient()

  const [{ data: impianto }, { data: contatori }] = await Promise.all([
    supabase
      .from("impianti")
      .select("id, nome_impianto, potenza_kw, cliente:cliente_id(id, ragione_sociale)")
      .eq("id", impiantoId)
      .single(),
    supabase
      .from("contatori")
      .select("id, matricola, pod, tipo, costante_k, lettura_iniziale")
      .eq("impianto_id", impiantoId)
      // Non filtriamo su attivo=true: un contatore sostituito a metà anno
      // (brief §5.5) viene cessato ma le letture già inserite sui mesi in cui
      // era attivo devono restare visibili nella vista di quell'anno. Il
      // range di date individua i contatori rilevanti per l'anno selezionato
      // indipendentemente dal flag attivo corrente.
      .lte("data_attivazione", `${anno}-12-31`)
      .or(`data_cessazione.is.null,data_cessazione.gte.${anno}-01-01`)
      .order("tipo")
      .order("matricola"),
  ])

  if (!impianto) notFound()

  const contatoreIds = (contatori ?? []).map((c) => c.id)
  const { data: lettureEsistenti } =
    contatoreIds.length > 0
      ? await supabase
          .from("letture")
          .select("contatore_id, periodo_mese, periodo_anno, valore_f1, valore_f2, valore_f3")
          .in("contatore_id", contatoreIds)
      : { data: [] }

  const cliente = Array.isArray(impianto.cliente) ? impianto.cliente[0] : impianto.cliente

  return (
    <div className="grid gap-4">
      <div>
        {cliente && (
          <Link
            href={`/anagrafiche/impianti/${impianto.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {impianto.nome_impianto} ({cliente.ragione_sociale})
          </Link>
        )}
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            Letture — {impianto.nome_impianto} · Anno{" "}
            <span className="text-primary">{anno}</span>
          </h1>
          <div className="flex items-center gap-2">
            <ImportaPdfDialog impiantoId={impianto.id} annoSelezionato={anno} />
            <AnnoSelector anno={anno} />
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          La tabella sotto mostra solo le letture dell&apos;anno {anno}. Cambia
          anno dal menu a destra per vederne altri: i dati di anni diversi
          restano salvati, non vengono persi.
        </p>
      </div>

      {contatori && contatori.length > 0 ? (
        <LettureTable
          // Forza il remount (e quindi il reset dello stato locale editabile)
          // quando cambia l'anno selezionato o quando i dati salvati cambiano
          // da fuori — es. dopo un import PDF (brief §5.4): senza l'anno in
          // chiave, passare da un anno senza dati a un altro anno senza dati
          // non cambiava `lettureEsistenti` e la vista restava quella vecchia.
          key={`${anno}-${JSON.stringify(lettureEsistenti)}`}
          impiantoId={impianto.id}
          anno={anno}
          potenzaKw={impianto.potenza_kw}
          contatori={contatori}
          lettureEsistenti={lettureEsistenti ?? []}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Questo impianto non ha ancora contatori attivi. Aggiungili dalla{" "}
          <Link href={`/anagrafiche/impianti/${impianto.id}`} className="underline">
            scheda impianto
          </Link>
          .
        </p>
      )}
    </div>
  )
}
