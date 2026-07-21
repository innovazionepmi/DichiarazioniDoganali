import { CertificatoAdmSection } from "@/components/impostazioni/certificato-adm-section"
import { TestInvioAdmSection } from "@/components/impostazioni/test-invio-adm-section"
import { TestEmailClienteSection } from "@/components/impostazioni/test-email-cliente-section"
import { listaCertificatiAdm } from "@/lib/actions/certificati-adm"
import { listaDichiarazioniInviate } from "@/lib/actions/dichiarazioni"
import { Separator } from "@/components/ui/separator"

export default async function ImpostazioniPage() {
  const certificati = await listaCertificatiAdm()
  const dichiarazioniResult = await listaDichiarazioniInviate()
  const dichiarazioni = "error" in dichiarazioniResult ? [] : dichiarazioniResult

  return (
    <div className="grid gap-8">
      <h1 className="text-xl font-semibold">Impostazioni</h1>
      <CertificatoAdmSection certificati={certificati} />
      <Separator />
      <TestInvioAdmSection />
      <Separator />
      <TestEmailClienteSection dichiarazioni={dichiarazioni} />
    </div>
  )
}
