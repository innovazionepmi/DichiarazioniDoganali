"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

export type CategoriaErrore = "certificato" | "xml_malformato" | "rete" | "esito_negativo" | "altro"

export interface ErroreOperazione {
  categoria: CategoriaErrore
  messaggio: string
  dettaglioTecnico?: string
  iut?: string
}

const CATEGORIA_INFO: Record<CategoriaErrore, { titolo: string; suggerimento?: string }> = {
  certificato: {
    titolo: "Problema con il certificato",
    suggerimento:
      'Controlla il certificato di autenticazione in Impostazioni: potrebbe essere scaduto, mancante o con password errata.',
  },
  xml_malformato: {
    titolo: "XML non conforme",
    suggerimento: "Il file inviato non rispetta il formato richiesto da ADM — verifica come è stato generato/firmato.",
  },
  rete: {
    titolo: "Servizio ADM non raggiungibile",
    suggerimento: "Riprova tra qualche minuto: potrebbe essere un problema temporaneo di rete o del servizio ADM.",
  },
  esito_negativo: {
    titolo: "ADM ha respinto l'invio",
    suggerimento: undefined,
  },
  altro: {
    titolo: "Errore imprevisto",
    suggerimento: undefined,
  },
}

// Requisito esplicito dell'utente (vedi memoria project-gestione-errori-invio-adm):
// gli errori di invio verso ADM devono restare visibili finché l'operatore
// non li chiude esplicitamente — mai un toast che sparisce da solo. Per
// questo il Dialog ignora la chiusura da backdrop/ESC (onOpenChange
// volutamente no-op) e nasconde la X in alto a destra: l'unico modo per
// chiuderlo è il bottone "OK, capito".
export function ErrorePersistenteDialog({
  errore,
  onChiudi,
}: {
  errore: ErroreOperazione | null
  onChiudi: () => void
}) {
  if (!errore) return null
  const info = CATEGORIA_INFO[errore.categoria]

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">{info.titolo}</Badge>
          </div>
          <DialogTitle className="sr-only">{info.titolo}</DialogTitle>
        </DialogHeader>

        <p className="text-sm">{errore.messaggio}</p>

        {errore.iut && (
          <p className="text-sm text-muted-foreground">
            IUT assegnato comunque: <span className="font-medium">{errore.iut}</span> — il messaggio
            è stato registrato da ADM anche se respinto, puoi verificarne lo stato.
          </p>
        )}

        {info.suggerimento && (
          <p className="text-sm text-muted-foreground">{info.suggerimento}</p>
        )}

        {errore.dettaglioTecnico && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Dettaglio tecnico</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2">
              {errore.dettaglioTecnico}
            </pre>
          </details>
        )}

        <DialogFooter>
          <Button onClick={onChiudi}>OK, capito</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
