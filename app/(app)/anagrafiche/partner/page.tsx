import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { PartnerTable } from "@/components/partner/partner-table"

export default async function PartnerListPage() {
  const supabase = await createClient()
  const { data: partner, error } = await supabase
    .from("partner")
    .select("id, ragione_sociale, note, attivo")
    .order("ragione_sociale")

  if (error) {
    return <p className="text-destructive">Errore nel caricamento: {error.message}</p>
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Partner</h1>
        <Button render={<Link href="/anagrafiche/partner/nuovo">Nuovo partner</Link>} />
      </div>
      <PartnerTable data={partner ?? []} />
    </div>
  )
}
