import { CertificatoAdmSection } from "@/components/impostazioni/certificato-adm-section"
import { TestInvioAdmSection } from "@/components/impostazioni/test-invio-adm-section"
import { listaCertificatiAdm } from "@/lib/actions/certificati-adm"
import { Separator } from "@/components/ui/separator"

export default async function ImpostazioniPage() {
  const certificati = await listaCertificatiAdm()

  return (
    <div className="grid gap-8">
      <h1 className="text-xl font-semibold">Impostazioni</h1>
      <CertificatoAdmSection certificati={certificati} />
      <Separator />
      <TestInvioAdmSection />
    </div>
  )
}
