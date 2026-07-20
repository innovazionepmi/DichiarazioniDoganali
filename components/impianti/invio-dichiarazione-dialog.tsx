"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ErrorePersistenteDialog,
  type ErroreOperazione,
} from "@/components/shared/errore-persistente-dialog"
import {
  recuperaRiepilogoDichiarazione,
  inviaDichiarazioneReale,
  type RiepilogoDichiarazioneResult,
} from "@/lib/actions/dichiarazioni"

type Riepilogo = Extract<RiepilogoDichiarazioneResult, { dati: unknown }>

// Requisito esplicito dell'utente (memoria project-riepilogo-pre-invio-reale):
// prima di inviare una dichiarazione reale ad ADM, l'operatore deve vedere
// una schermata con TUTTI i dati effettivi (non un riassunto generico) e
// confermare esplicitamente — sono dichiarazioni ufficiali con conseguenze
// fiscali/legali reali. L'invio va sempre all'ambiente "produzione" (mai
// addestramento, quello è solo per la sandbox di validazione tecnica).
export function InvioDichiarazioneDialog({
  dichiarazioneId,
  open,
  onOpenChange,
}: {
  dichiarazioneId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [caricamento, setCaricamento] = useState(false)
  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null)
  const [erroreCaricamento, setErroreCaricamento] = useState<string | null>(null)
  const [dichiarante, setDichiarante] = useState("")
  const [errore, setErrore] = useState<ErroreOperazione | null>(null)

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (nextOpen && !riepilogo && !caricamento) {
      setCaricamento(true)
      setErroreCaricamento(null)
      startTransition(async () => {
        const result = await recuperaRiepilogoDichiarazione(dichiarazioneId)
        setCaricamento(false)
        if ("error" in result) {
          setErroreCaricamento(result.error)
          return
        }
        setRiepilogo(result)
        setDichiarante(result.dichiaranteSuggerito)
      })
    }
    if (!nextOpen) {
      // Reset per il prossimo invio (potrebbe essere una dichiarazione diversa)
      setRiepilogo(null)
      setErroreCaricamento(null)
    }
  }

  function handleInvia(formData: FormData) {
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Seleziona il file XML firmato")
      return
    }
    if (!dichiarante.trim()) {
      toast.error("Inserisci il codice fiscale/P.IVA del dichiarante")
      return
    }
    formData.set("dichiarante", dichiarante.trim())

    startTransition(async () => {
      const result = await inviaDichiarazioneReale(dichiarazioneId, formData)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      if (!result.ok) {
        setErrore(result)
        return
      }
      toast.success(`Dichiarazione inviata ad ADM — IUT ${result.iut}`)
      onOpenChange(false)
      setRiepilogo(null)
      router.refresh()
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferma invio dichiarazione ad ADM</DialogTitle>
            <DialogDescription>
              Controlla i dati prima di inviare: questa è una dichiarazione ufficiale
              con effetti fiscali reali.
            </DialogDescription>
          </DialogHeader>

          {caricamento && <p className="text-sm text-muted-foreground">Caricamento dati…</p>}
          {erroreCaricamento && <p className="text-sm text-destructive">{erroreCaricamento}</p>}

          {riepilogo && (
            <form action={handleInvia} className="grid gap-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Impianto: </span>
                  {riepilogo.impiantoNome}
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente: </span>
                  {riepilogo.clienteRagioneSociale}
                </div>
                <div>
                  <span className="text-muted-foreground">CodDitta: </span>
                  {riepilogo.dati.codDitta}
                </div>
                <div>
                  <span className="text-muted-foreground">Periodo: </span>
                  {riepilogo.dati.anno} — {riepilogo.dati.periodoRiferimento}° semestre
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="dichiarante">Codice fiscale/P.IVA del dichiarante</Label>
                <Input
                  id="dichiarante"
                  value={dichiarante}
                  onChange={(e) => setDichiarante(e.target.value.toUpperCase())}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="xml-firmato-reale">XML firmato (firma qualificata di Paolo su Aruba)</Label>
                <Input id="xml-firmato-reale" name="file" type="file" accept=".xml" />
              </div>

              <div>
                <p className="mb-1 text-sm font-medium">Quadro A — Produzione</p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mese</TableHead>
                        <TableHead>Contatore</TableHead>
                        <TableHead className="text-right">kWh</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {riepilogo.dati.quadroA.flatMap((mese) =>
                        mese.contatori.map((c) => (
                          <TableRow key={`A-${mese.numMese}-${c.matricola}`}>
                            <TableCell>{mese.numMese}</TableCell>
                            <TableCell>{c.matricola}</TableCell>
                            <TableCell className="text-right">{c.kwh}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {riepilogo.dati.quadroG && (
                <div>
                  <p className="mb-1 text-sm font-medium">Quadro G — Cessione alla rete</p>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mese</TableHead>
                          <TableHead>Contatore</TableHead>
                          <TableHead>Distributore</TableHead>
                          <TableHead className="text-right">kWh</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {riepilogo.dati.quadroG.flatMap((mese) =>
                          mese.contatori.map((c) => (
                            <TableRow key={`G-${mese.numMese}-${c.matricola}`}>
                              <TableCell>{mese.numMese}</TableCell>
                              <TableCell>{c.matricola}</TableCell>
                              <TableCell>{c.id}</TableCell>
                              <TableCell className="text-right">{c.kwh}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="submit" disabled={pending} variant="destructive">
                  {pending ? "Invio…" : "Conferma e invia ad ADM"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ErrorePersistenteDialog errore={errore} onChiudi={() => setErrore(null)} />
    </>
  )
}
