"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  inviaRicevutaClienteEmail,
  type DichiarazioneInviata,
} from "@/lib/actions/dichiarazioni"

// Verifica il percorso reale di invio email al cliente (brief §5.8) su una
// dichiarazione già accolta da ADM (IUT presente), scelta da un elenco —
// utile per controllare che Brevo/SMTP funzioni davvero senza dover
// navigare fino alla scheda impianto specifica. A differenza della sandbox
// "Test invio ADM" sopra (dati completamente fittizi, nessuna riga a DB),
// qui si usa una dichiarazione reale già esistente: nessun invio SOAP
// aggiuntivo, solo il passo finale "manda l'email".
export function TestEmailClienteSection({
  dichiarazioni,
}: {
  dichiarazioni: DichiarazioneInviata[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selezionataId, setSelezionataId] = useState<string>(dichiarazioni[0]?.id ?? "")

  const selezionata = dichiarazioni.find((d) => d.id === selezionataId) ?? null

  function handleInvia() {
    if (!selezionata) return
    if (!selezionata.clienteEmail) {
      toast.error("Il cliente non ha un'email del referente impostata in anagrafica")
      return
    }
    if (
      !window.confirm(
        `Inviare la ricevuta di ${selezionata.impiantoNome} (${selezionata.anno} — ${selezionata.periodoRiferimento}° semestre) al cliente all'indirizzo ${selezionata.clienteEmail}?`
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await inviaRicevutaClienteEmail(selezionata.id)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success("Email inviata al cliente")
      router.refresh()
    })
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Test invio email al cliente</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Verifica il percorso reale &quot;invia ricevuta al cliente&quot;
        (brief §5.8) su una dichiarazione già accolta da ADM — utile per
        controllare che Brevo/SMTP sia configurato correttamente.
      </p>

      {dichiarazioni.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessuna dichiarazione con IUT disponibile ancora. Invia prima una
          dichiarazione via S2S da una scheda impianto.
        </p>
      ) : (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Scegli una dichiarazione</CardTitle>
            <CardDescription>Solo quelle già accolte da ADM (IUT presente).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Select
              value={selezionataId}
              onValueChange={(v) => setSelezionataId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dichiarazioni.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.clienteRagioneSociale} — {d.impiantoNome} ({d.anno}, {d.periodoRiferimento}° sem.)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selezionata && (
              <div className="text-sm text-muted-foreground">
                <p>
                  IUT: <span className="font-mono">{selezionata.iut}</span>
                </p>
                <p>
                  Destinatario:{" "}
                  {selezionata.clienteEmail ?? (
                    <span className="text-destructive">nessuna email in anagrafica</span>
                  )}
                </p>
                {selezionata.emailClienteInviataAt && (
                  <p>
                    Email già inviata il{" "}
                    {new Date(selezionata.emailClienteInviataAt).toLocaleDateString("it-IT")}
                  </p>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button size="sm" disabled={pending || !selezionata} onClick={handleInvia}>
              {selezionata?.emailClienteInviataAt ? "Reinvia email" : "Invia email al cliente"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
