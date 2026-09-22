"use client"

import { useEffect, useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { recuperaDettaglioEsitoReale } from "@/lib/actions/dichiarazioni"
import type { EsitoRecuperoEsito } from "@/lib/adm/soap-client"

type Risultato = Extract<EsitoRecuperoEsito, { ok: true }>

// Diagnostica on-demand (feedback: il codice esito da solo, es. "10 -
// Verifica xsd fallita", non dice QUALE elemento non va — Paolo non riesce
// ad accedere a MONET per controllarlo lì). Interroga ADM dal vivo
// (InteropService.recuperaEsito) e mostra le "Segnalazioni" di dettaglio,
// quando presenti.
export function DettaglioEsitoDialog({
  dichiarazioneId,
  open,
  onOpenChange,
}: {
  dichiarazioneId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = useTransition()
  const [risultato, setRisultato] = useState<Risultato | null>(null)
  const [erroreCaricamento, setErroreCaricamento] = useState<string | null>(null)
  const [dettaglioTecnico, setDettaglioTecnico] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    startTransition(async () => {
      setErroreCaricamento(null)
      setDettaglioTecnico(null)
      setRisultato(null)
      const result = await recuperaDettaglioEsitoReale(dichiarazioneId)
      if ("error" in result) {
        setErroreCaricamento(result.error)
        return
      }
      if (!result.ok) {
        setErroreCaricamento(result.messaggio)
        if ("dettaglioTecnico" in result && result.dettaglioTecnico) {
          setDettaglioTecnico(result.dettaglioTecnico)
        }
        return
      }
      setRisultato(result)
    })
  }, [open, dichiarazioneId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dettaglio esito ADM</DialogTitle>
          <DialogDescription>
            Recuperato dal vivo da ADM (InteropService.recuperaEsito) per questo IUT.
          </DialogDescription>
        </DialogHeader>

        {pending && !risultato && (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        )}
        {erroreCaricamento && <p className="text-sm text-destructive">{erroreCaricamento}</p>}
        {dettaglioTecnico && (
          <details className="text-xs text-muted-foreground" open>
            <summary className="cursor-pointer select-none">Risposta grezza di ADM</summary>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2">
              {dettaglioTecnico}
            </pre>
          </details>
        )}

        {risultato && (
          <div className="grid gap-3">
            <div className="grid gap-1 text-sm">
              <div>
                <span className="text-muted-foreground">IUT: </span>
                {risultato.iut}
              </div>
              {risultato.codice && (
                <div>
                  <span className="text-muted-foreground">Codice esito: </span>
                  {risultato.codice}
                  {risultato.messaggi.length > 0 ? ` — ${risultato.messaggi.join(" — ")}` : ""}
                </div>
              )}
              {risultato.numeroRegistrazione && (
                <div>
                  <span className="text-muted-foreground">Numero di registrazione: </span>
                  {risultato.numeroRegistrazione}
                </div>
              )}
            </div>

            {risultato.segnalazioni.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sezione</TableHead>
                      <TableHead>Gravità</TableHead>
                      <TableHead>Descrizione</TableHead>
                      <TableHead>Atteso</TableHead>
                      <TableHead>Inviato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {risultato.segnalazioni.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>{s.sezione}</TableCell>
                        <TableCell>
                          <Badge variant={s.gravita?.toLowerCase().includes("err") ? "destructive" : "outline"}>
                            {s.gravita || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>{s.descrizione}</TableCell>
                        <TableCell className="font-mono text-xs">{s.datoAtteso || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.datoInviato || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                ADM non ha restituito segnalazioni di dettaglio per questo IUT (può succedere per i
                messaggi respinti prima della fase di elaborazione sostanziale, come &ldquo;Verifica
                XSD fallita&rdquo;).
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
