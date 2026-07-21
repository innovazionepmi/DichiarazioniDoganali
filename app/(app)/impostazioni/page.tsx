import { CertificatoAdmSection } from "@/components/impostazioni/certificato-adm-section"
import { TestInvioAdmSection } from "@/components/impostazioni/test-invio-adm-section"
import { TestEmailClienteSection } from "@/components/impostazioni/test-email-cliente-section"
import { LogEmailSection } from "@/components/impostazioni/log-email-section"
import { listaCertificatiAdm } from "@/lib/actions/certificati-adm"
import { listaDichiarazioniInviate } from "@/lib/actions/dichiarazioni"
import { listaLogEmail } from "@/lib/actions/email-log"
import { Separator } from "@/components/ui/separator"

export default async function ImpostazioniPage() {
  const certificati = await listaCertificatiAdm()
  const dichiarazioniResult = await listaDichiarazioniInviate()
  const dichiarazioni = "error" in dichiarazioniResult ? [] : dichiarazioniResult
  const logResult = await listaLogEmail()
  const log = "error" in logResult ? [] : logResult

  return (
    <div className="grid gap-8">
      <h1 className="text-xl font-semibold">Impostazioni</h1>
      <CertificatoAdmSection certificati={certificati} />
      <Separator />
      <TestInvioAdmSection />
      <Separator />
      <TestEmailClienteSection dichiarazioni={dichiarazioni} />
      <Separator />
      <LogEmailSection log={log} />
    </div>
  )
}
