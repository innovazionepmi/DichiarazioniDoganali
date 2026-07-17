"use client"

import { useState, useTransition } from "react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ErrorePersistenteDialog,
  type ErroreOperazione,
} from "@/components/shared/errore-persistente-dialog"
import {
  generaXmlTestAdm,
  inviaXmlTestAdm,
  controllaStatoTestAdm,
} from "@/lib/actions/adm-test"

function scaricaBase64(base64: string, nomeFile: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: "application/xml" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nomeFile
  a.click()
  URL.revokeObjectURL(url)
}

// Sandbox per validare l'intera catena di invio S2S (firma esterna Aruba +
// client SOAP + esito ADM) con dati fittizi, prima di collegarla alla
// dichiarazione reale — vedi piano Fase 4. Gli errori di invio/controllo
// stato usano il Dialog persistente (mai un toast che sparisce da solo,
// vedi memoria project-gestione-errori-invio-adm); gli errori di semplice
// validazione del form (file mancante, ecc.) restano un toast normale.
export function TestInvioAdmSection() {
  const [pending, startTransition] = useTransition()
  const [periodoRiferimento, setPeriodoRiferimento] = useState<1 | 2>(1)
  const [dichiarante, setDichiarante] = useState("")
  const [errore, setErrore] = useState<ErroreOperazione | null>(null)
  const [risultatoInvio, setRisultatoInvio] = useState<{
    iut: string
    esitoCodice: string
    esitoMessaggi: string[]
  } | null>(null)
  const [risultatoStato, setRisultatoStato] = useState<{ codice: string; descrizione: string } | null>(
    null
  )
  // Separato da risultatoInvio: ADM può assegnare uno IUT anche a un invio
  // respinto (es. codice 16, certificato non valido) — l'operatore deve
  // poter controllare lo stato di quello IUT anche se l'invio non è "ok".
  const [iutDisponibile, setIutDisponibile] = useState<string | null>(null)

  function handleGenera() {
    startTransition(async () => {
      const result = await generaXmlTestAdm(periodoRiferimento)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      scaricaBase64(result.xmlBase64, result.nomeFile)
      toast.success("XML di test generato e scaricato")
    })
  }

  function handleInvia(formData: FormData) {
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Seleziona il file XML firmato")
      return
    }
    if (!dichiarante.trim()) {
      toast.error("Inserisci il codice fiscale del sottoscrittore")
      return
    }
    formData.set("dichiarante", dichiarante.trim())

    startTransition(async () => {
      const result = await inviaXmlTestAdm(formData)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      if (!result.ok) {
        setErrore(result)
        setRisultatoInvio(null)
        setRisultatoStato(null)
        setIutDisponibile(result.iut ?? null)
        return
      }
      setRisultatoInvio(result)
      setRisultatoStato(null)
      setIutDisponibile(result.iut)
      toast.success("Inviato ad ADM (ambiente di test)")
    })
  }

  function handleControllaStato() {
    if (!iutDisponibile) return
    startTransition(async () => {
      const result = await controllaStatoTestAdm(iutDisponibile)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      if (!result.ok) {
        setErrore(result)
        return
      }
      setRisultatoStato(result)
    })
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Test invio ADM (dati fittizi)</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Sandbox per verificare tutta la catena tecnica (firma esterna con
        Aruba Sign, invio SOAP, esito ADM) con dati completamente inventati —
        nessun cliente o impianto reale coinvolto. Usa il certificato
        dell&apos;ambiente di test caricato sopra.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>1. Genera XML di test</CardTitle>
            <CardDescription>Dati fittizi, Quadro A + Quadro G.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor="periodo-test">Semestre</Label>
            <Select
              value={String(periodoRiferimento)}
              onValueChange={(v) => setPeriodoRiferimento(v === "2" ? 2 : 1)}
            >
              <SelectTrigger id="periodo-test">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1° semestre (gen-giu)</SelectItem>
                <SelectItem value="2">2° semestre (lug-dic)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
          <CardFooter>
            <Button size="sm" disabled={pending} onClick={handleGenera}>
              Genera e scarica
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Carica firmato e invia</CardTitle>
            <CardDescription>
              Firma prima il file con Aruba Sign, poi caricalo qui.
            </CardDescription>
          </CardHeader>
          <form action={handleInvia}>
            <CardContent className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="dichiarante">Codice fiscale sottoscrittore</Label>
                <Input
                  id="dichiarante"
                  value={dichiarante}
                  onChange={(e) => setDichiarante(e.target.value.toUpperCase())}
                  placeholder="RSSMRA80A01H501U"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="xml-firmato">XML firmato</Label>
                <Input id="xml-firmato" name="file" type="file" accept=".xml" />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" size="sm" disabled={pending}>
                Invia (ambiente di test)
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Risultato</CardTitle>
            <CardDescription>Esito dell&apos;invio e stato ADM.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {!iutDisponibile ? (
              <p className="text-muted-foreground">Nessun invio ancora effettuato.</p>
            ) : (
              <>
                <p>
                  IUT: <span className="font-medium">{iutDisponibile}</span>
                </p>
                {risultatoInvio ? (
                  <>
                    <p className="flex items-center gap-2">
                      Esito accoglienza: <Badge variant="success">{risultatoInvio.esitoCodice}</Badge>
                    </p>
                    {risultatoInvio.esitoMessaggi.length > 0 && (
                      <p className="text-muted-foreground">{risultatoInvio.esitoMessaggi.join(" — ")}</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Invio respinto (vedi errore) — IUT assegnato comunque da ADM.
                  </p>
                )}
                {risultatoStato && (
                  <p className="flex items-center gap-2">
                    Stato: <Badge variant="info">{risultatoStato.codice}</Badge>
                    {risultatoStato.descrizione}
                  </p>
                )}
              </>
            )}
          </CardContent>
          {iutDisponibile && (
            <CardFooter>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={handleControllaStato}
              >
                Controlla stato
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      <ErrorePersistenteDialog errore={errore} onChiudi={() => setErrore(null)} />
    </div>
  )
}
