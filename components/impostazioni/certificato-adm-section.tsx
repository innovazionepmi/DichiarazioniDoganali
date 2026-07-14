"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  caricaCertificatoAdm,
  eliminaCertificatoAdm,
  type CertificatoAdmInfo,
} from "@/lib/actions/certificati-adm"

const AMBIENTI: { valore: "test" | "produzione"; titolo: string; descrizione: string }[] = [
  {
    valore: "test",
    titolo: "Ambiente di test (addestramento)",
    descrizione: "Usato per verificare l'invio prima di quello reale — nessun effetto legale.",
  },
  {
    valore: "produzione",
    titolo: "Ambiente reale (produzione)",
    descrizione: "Usato per l'invio effettivo delle dichiarazioni ad ADM.",
  },
]

function scadenzaBadge(dataScadenza: string | null) {
  if (!dataScadenza) return null
  const oggi = new Date()
  const scadenza = new Date(dataScadenza)
  const giorniMancanti = Math.round((scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24))

  if (giorniMancanti < 0) {
    return <Badge variant="destructive">Scaduto</Badge>
  }
  if (giorniMancanti <= 30) {
    return <Badge variant="warning">Scade tra {giorniMancanti} giorni</Badge>
  }
  return <Badge variant="success">Valido</Badge>
}

// Certificato di autenticazione ADM (Fase 4, invio S2S) — non va confuso con
// la firma digitale Aruba del sottoscrittore: questo autentica la
// connessione tecnica al servizio web di ADM, non firma il contenuto della
// dichiarazione (quello resta un passaggio manuale fuori dall'app, vedi
// piano Fase 4). Un certificato per ambiente, il ricaricamento sullo stesso
// ambiente sostituisce il precedente — così si gestisce anche il rinnovo
// alla scadenza.
export function CertificatoAdmSection({
  certificati,
}: {
  certificati: CertificatoAdmInfo[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ambienteInModifica, setAmbienteInModifica] = useState<"test" | "produzione" | null>(
    null
  )

  function handleCarica(ambiente: "test" | "produzione", formData: FormData) {
    formData.set("ambiente", ambiente)
    startTransition(async () => {
      const result = await caricaCertificatoAdm(formData)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success("Certificato caricato")
      setAmbienteInModifica(null)
      router.refresh()
    })
  }

  function handleElimina(ambiente: "test" | "produzione") {
    startTransition(async () => {
      const result = await eliminaCertificatoAdm(ambiente)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success("Certificato eliminato")
      router.refresh()
    })
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Certificato di autenticazione ADM</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Autentica le chiamate al servizio di invio dichiarazioni verso
        l&apos;Agenzia delle Dogane — non è la firma digitale della
        dichiarazione (quella resta un passaggio separato di Paolo tramite
        Aruba Sign).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {AMBIENTI.map((amb) => {
          const info = certificati.find((c) => c.ambiente === amb.valore)
          const inModifica = ambienteInModifica === amb.valore
          return (
            <Card key={amb.valore}>
              <CardHeader>
                <CardTitle>{amb.titolo}</CardTitle>
                <CardDescription>{amb.descrizione}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {info ? (
                  <>
                    <p>
                      File: <span className="font-medium">{info.nome_file}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Caricato il {new Date(info.updated_at).toLocaleDateString("it-IT")}
                    </p>
                    {info.data_scadenza && (
                      <p className="flex items-center gap-2">
                        Scadenza: {new Date(info.data_scadenza).toLocaleDateString("it-IT")}
                        {scadenzaBadge(info.data_scadenza)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Nessun certificato caricato.</p>
                )}
              </CardContent>
              <CardFooter className="flex flex-col items-stretch gap-3">
                {inModifica ? (
                  <form
                    action={(formData) => handleCarica(amb.valore, formData)}
                    className="grid w-full gap-3"
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor={`file-${amb.valore}`}>File certificato</Label>
                      <Input id={`file-${amb.valore}`} name="file" type="file" required />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`password-${amb.valore}`}>
                        Password (se richiesta dal certificato)
                      </Label>
                      <Input
                        id={`password-${amb.valore}`}
                        name="password"
                        type="password"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`scadenza-${amb.valore}`}>Data di scadenza (opzionale)</Label>
                      <Input id={`scadenza-${amb.valore}`} name="dataScadenza" type="date" />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={pending}>
                        {pending ? "Caricamento…" : "Salva"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => setAmbienteInModifica(null)}
                      >
                        Annulla
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setAmbienteInModifica(amb.valore)}
                    >
                      {info ? "Sostituisci" : "Carica certificato"}
                    </Button>
                    {info && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => handleElimina(amb.valore)}
                      >
                        Elimina
                      </Button>
                    )}
                  </div>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
