import { PartnerForm } from "@/components/partner/partner-form"
import { createPartner } from "@/lib/actions/partner"

export default function NuovoPartnerPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Nuovo partner</h1>
      <PartnerForm onSubmit={createPartner} />
    </div>
  )
}
