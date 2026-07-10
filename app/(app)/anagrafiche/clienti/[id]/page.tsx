import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ClienteForm } from "@/components/clienti/cliente-form"
import { ClienteCredenzialiForm } from "@/components/clienti/cliente-credenziali-form"
import { updateCliente } from "@/lib/actions/clienti"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: cliente }, { data: partnerOptions }, { data: impianti }] =
    await Promise.all([
      supabase.from("clienti").select("*").eq("id", id).single(),
      supabase
        .from("partner")
        .select("id, ragione_sociale")
        .eq("attivo", true)
        .order("ragione_sociale"),
      supabase
        .from("impianti")
        .select("id, nome_impianto, tipo_soggetto, attivo")
        .eq("cliente_id", id)
        .order("nome_impianto"),
    ])

  if (!cliente) notFound()

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-xl font-semibold">{cliente.ragione_sociale}</h1>
        <ClienteForm
          partnerOptions={partnerOptions ?? []}
          defaultValues={{
            ragione_sociale: cliente.ragione_sociale,
            codice_fiscale: cliente.codice_fiscale ?? "",
            partita_iva: cliente.partita_iva ?? "",
            codice_licenza: cliente.codice_licenza ?? "",
            referente_nome: cliente.referente_nome ?? "",
            referente_telefono: cliente.referente_telefono ?? "",
            referente_email: cliente.referente_email ?? "",
            referente_data_nascita: cliente.referente_data_nascita ?? "",
            indirizzo: cliente.indirizzo ?? "",
            partner_id: cliente.partner_id ?? "",
            note: cliente.note ?? "",
          }}
          onSubmit={(formData) => updateCliente(id, formData)}
        />
      </div>

      <Separator />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Credenziali portali</h2>
        <ClienteCredenzialiForm
          clienteId={id}
          edistribuzioneUser={cliente.credenziali_edistribuzione_user}
          gseUser={cliente.credenziali_gse_user}
        />
      </div>

      <Separator />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Impianti collegati</h2>
          <Button
            size="sm"
            render={
              <Link href={`/anagrafiche/impianti/nuovo?cliente_id=${id}`}>
                Nuovo impianto
              </Link>
            }
          />
        </div>
        {impianti && impianti.length > 0 ? (
          <ul className="grid gap-2">
            {impianti.map((impianto) => (
              <li key={impianto.id}>
                <Link
                  href={`/anagrafiche/impianti/${impianto.id}`}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted"
                >
                  <span className="font-medium">{impianto.nome_impianto}</span>
                  <Badge variant="outline">{impianto.tipo_soggetto}</Badge>
                  {!impianto.attivo && (
                    <Badge variant="secondary">Archiviato</Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nessun impianto collegato a questo cliente.
          </p>
        )}
      </div>
    </div>
  )
}
