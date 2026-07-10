import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PartnerForm } from "@/components/partner/partner-form"
import { updatePartner } from "@/lib/actions/partner"

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: partner } = await supabase
    .from("partner")
    .select("id, ragione_sociale, note")
    .eq("id", id)
    .single()

  if (!partner) notFound()

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">{partner.ragione_sociale}</h1>
      <PartnerForm
        defaultValues={{
          ragione_sociale: partner.ragione_sociale,
          note: partner.note ?? "",
        }}
        onSubmit={(formData) => updatePartner(id, formData)}
      />
    </div>
  )
}
