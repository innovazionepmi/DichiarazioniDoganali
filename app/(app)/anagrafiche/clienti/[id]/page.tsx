import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ClienteForm } from "@/components/clienti/cliente-form"
import { ClienteCredenzialiForm } from "@/components/clienti/cliente-credenziali-form"
import { F24Section } from "@/components/clienti/f24-section"
import { DocumentiSection } from "@/components/shared/documenti-section"
import { updateCliente } from "@/lib/actions/clienti"
import { isEmailConfigured } from "@/lib/email/client"
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

  const [
    { data: cliente },
    { data: partnerOptions },
    { data: impianti },
    { data: impiantiConDiritto },
    { data: generazioniF24 },
    { data: documenti },
  ] = await Promise.all([
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
    supabase
      .from("impianti")
      .select("id, nome_impianto, codice_impianto_f24, diritto_licenza_importo")
      .eq("cliente_id", id)
      .eq("diritto_licenza_dovuto", true)
      .eq("attivo", true)
      .order("nome_impianto"),
    supabase
      .from("f24_generazioni")
      .select("id, anno_riferimento, data_scadenza, stato, data_invio")
      .eq("cliente_id", id)
      .order("anno_riferimento", { ascending: false }),
    // 'f24' escluso: ha già una vista dedicata più ricca nella sezione
    // "Diritto di licenza" più sotto (stato generato/inviato).
    supabase
      .from("documenti")
      .select("id, tipo, nome_file, created_at")
      .eq("cliente_id", id)
      .neq("tipo", "f24")
      .order("created_at", { ascending: false }),
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
            referente_cognome: cliente.referente_cognome ?? "",
            referente_telefono: cliente.referente_telefono ?? "",
            referente_email: cliente.referente_email ?? "",
            referente_data_nascita: cliente.referente_data_nascita ?? "",
            referente_codice_fiscale: cliente.referente_codice_fiscale ?? "",
            referente_sesso: cliente.referente_sesso ?? "",
            referente_comune_nascita: cliente.referente_comune_nascita ?? "",
            referente_provincia_nascita: cliente.referente_provincia_nascita ?? "",
            referente_domicilio_via: cliente.referente_domicilio_via ?? "",
            referente_domicilio_cap: cliente.referente_domicilio_cap ?? "",
            referente_domicilio_citta: cliente.referente_domicilio_citta ?? "",
            referente_domicilio_provincia: cliente.referente_domicilio_provincia ?? "",
            indirizzo_via: cliente.indirizzo_via ?? "",
            indirizzo_cap: cliente.indirizzo_cap ?? "",
            indirizzo_citta: cliente.indirizzo_citta ?? "",
            indirizzo_provincia: cliente.indirizzo_provincia ?? "",
            partner_id: cliente.partner_id ?? "",
            note: cliente.note ?? "",
          }}
          onSubmit={updateCliente.bind(null, id)}
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
            nativeButton={false}
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

      <Separator />

      <F24Section
        clienteId={id}
        impiantiConDiritto={impiantiConDiritto ?? []}
        generazioni={generazioniF24 ?? []}
        emailConfigurata={isEmailConfigured()}
      />

      <Separator />

      <DocumentiSection documenti={documenti ?? []} />
    </div>
  )
}
