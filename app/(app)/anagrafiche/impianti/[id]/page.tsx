import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ImpiantoForm } from "@/components/impianti/impianto-form"
import { ContatoriList } from "@/components/impianti/contatori-list"
import { ContatoriRelazioniManager } from "@/components/impianti/contatori-relazioni-manager"
import { updateImpianto } from "@/lib/actions/impianti"
import { Separator } from "@/components/ui/separator"

export default async function ImpiantoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: impianto }, { data: clienteOptions }, { data: contatori }] =
    await Promise.all([
      supabase
        .from("impianti")
        .select("*, cliente:cliente_id(id, ragione_sociale)")
        .eq("id", id)
        .single(),
      supabase
        .from("clienti")
        .select("id, ragione_sociale")
        .eq("attivo", true)
        .order("ragione_sociale"),
      supabase
        .from("contatori")
        .select("*")
        .eq("impianto_id", id)
        .order("data_attivazione", { ascending: false }),
    ])

  const contatoreIds = (contatori ?? []).map((c) => c.id)
  const { data: relazioni } =
    contatoreIds.length > 0
      ? await supabase
          .from("contatori_relazioni")
          .select("id, contatore_produzione_id, contatore_immissione_id")
          .in("contatore_produzione_id", contatoreIds)
      : { data: [] }

  if (!impianto) notFound()

  const cliente = Array.isArray(impianto.cliente)
    ? impianto.cliente[0]
    : impianto.cliente

  return (
    <div className="grid gap-8">
      <div>
        {cliente && (
          <Link
            href={`/anagrafiche/clienti/${cliente.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {cliente.ragione_sociale}
          </Link>
        )}
        <h1 className="text-xl font-semibold">{impianto.nome_impianto}</h1>
        <ImpiantoForm
          clienteOptions={clienteOptions ?? []}
          defaultValues={{
            cliente_id: impianto.cliente_id,
            nome_impianto: impianto.nome_impianto,
            tipo_soggetto: impianto.tipo_soggetto,
            tipologia: impianto.tipologia,
            diritto_licenza_dovuto: impianto.diritto_licenza_dovuto,
            diritto_licenza_importo:
              impianto.diritto_licenza_importo?.toString() ?? "",
            ha_registro_letture: impianto.ha_registro_letture,
            indirizzo_impianto: impianto.indirizzo_impianto ?? "",
            potenza_kw: impianto.potenza_kw?.toString() ?? "",
            codice_distributore_zona: impianto.codice_distributore_zona ?? "",
            codice_catastale_comune: impianto.codice_catastale_comune ?? "",
            ufficio_amministrativo: impianto.ufficio_amministrativo ?? "",
            codice_impianto_f24: impianto.codice_impianto_f24 ?? "",
            note: impianto.note ?? "",
          }}
          onSubmit={(formData) => updateImpianto(id, formData)}
        />
      </div>

      <Separator />

      <ContatoriList impiantoId={id} contatori={contatori ?? []} />

      <Separator />

      <ContatoriRelazioniManager
        impiantoId={id}
        contatori={contatori ?? []}
        relazioni={relazioni ?? []}
      />
    </div>
  )
}
