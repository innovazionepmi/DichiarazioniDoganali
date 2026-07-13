import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"

export default async function LettureImpiantiPage() {
  const supabase = await createClient()
  const { data: impianti, error } = await supabase
    .from("impianti")
    .select("id, nome_impianto, potenza_kw, attivo, cliente:cliente_id(ragione_sociale)")
    .eq("attivo", true)
    .order("nome_impianto")

  if (error) {
    return <p className="text-destructive">Errore nel caricamento: {error.message}</p>
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">Letture</h1>
        <p className="text-sm text-muted-foreground">
          Seleziona un impianto per inserire o correggere le letture mensili.
        </p>
      </div>
      {impianti && impianti.length > 0 ? (
        <ul className="grid gap-2">
          {impianti.map((impianto) => {
            const cliente = Array.isArray(impianto.cliente)
              ? impianto.cliente[0]
              : impianto.cliente
            return (
              <li key={impianto.id}>
                <Link
                  href={`/letture/${impianto.id}`}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted"
                >
                  <span className="font-medium">{impianto.nome_impianto}</span>
                  {cliente && (
                    <span className="text-sm text-muted-foreground">
                      {cliente.ragione_sociale}
                    </span>
                  )}
                  {impianto.potenza_kw != null && (
                    <Badge variant="outline">{impianto.potenza_kw} kW</Badge>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nessun impianto attivo.</p>
      )}
    </div>
  )
}
