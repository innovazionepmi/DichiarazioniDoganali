import { createClient } from "@/lib/supabase/server"
import { ImpiantoForm } from "@/components/impianti/impianto-form"
import { createImpianto } from "@/lib/actions/impianti"

export default async function NuovoImpiantoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente_id?: string }>
}) {
  const { cliente_id } = await searchParams
  const supabase = await createClient()
  const { data: clienteOptions } = await supabase
    .from("clienti")
    .select("id, ragione_sociale")
    .eq("attivo", true)
    .order("ragione_sociale")

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Nuovo impianto</h1>
      <ImpiantoForm
        clienteOptions={clienteOptions ?? []}
        defaultValues={cliente_id ? { cliente_id } : undefined}
        onSubmit={createImpianto}
      />
    </div>
  )
}
