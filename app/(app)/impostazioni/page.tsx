import { CertificatoAdmSection } from "@/components/impostazioni/certificato-adm-section"
import { listaCertificatiAdm } from "@/lib/actions/certificati-adm"

export default async function ImpostazioniPage() {
  const certificati = await listaCertificatiAdm()

  return (
    <div className="grid gap-8">
      <h1 className="text-xl font-semibold">Impostazioni</h1>
      <CertificatoAdmSection certificati={certificati} />
    </div>
  )
}
