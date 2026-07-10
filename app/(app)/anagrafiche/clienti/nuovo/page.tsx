import { createClient } from "@/lib/supabase/server"
import { ClienteForm } from "@/components/clienti/cliente-form"
import { createCliente } from "@/lib/actions/clienti"

export default async function NuovoClientePage() {
  const supabase = await createClient()
  const { data: partnerOptions } = await supabase
    .from("partner")
    .select("id, ragione_sociale")
    .eq("attivo", true)
    .order("ragione_sociale")

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Nuovo cliente</h1>
      <ClienteForm partnerOptions={partnerOptions ?? []} onSubmit={createCliente} />
    </div>
  )
}
