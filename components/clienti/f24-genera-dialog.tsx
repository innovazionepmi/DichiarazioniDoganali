"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { generaF24 } from "@/lib/actions/f24"

export interface ImpiantoConDiritto {
  id: string
  nome_impianto: string
  codice_impianto_f24: string | null
  diritto_licenza_importo: number | null
}

function scaricaBase64(base64: string, nomeFile: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nomeFile
  a.click()
  URL.revokeObjectURL(url)
}

// Importi precompilati da `diritto_licenza_importo` ma modificabili riga per
// riga (brief: l'importo va lasciato correggibile a mano, es. impianto
// entrato in esercizio a metà anno).
export function F24GeneraDialog({
  clienteId,
  impianti,
}: {
  clienteId: string
  impianti: ImpiantoConDiritto[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const annoDefault = new Date().getFullYear()
  const [anno, setAnno] = useState(annoDefault)
  const [scadenza, setScadenza] = useState(`${annoDefault + 1}-12-16`)
  const [selezionati, setSelezionati] = useState<Set<string>>(
    () => new Set(impianti.map((i) => i.id))
  )
  const [importi, setImporti] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      impianti.map((i) => [i.id, i.diritto_licenza_importo?.toFixed(2) ?? ""])
    )
  )

  function toggle(id: string) {
    setSelezionati((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleGenera() {
    const righe = impianti
      .filter((i) => selezionati.has(i.id))
      .map((i) => ({ impiantoId: i.id, importo: Number(importi[i.id]) }))

    if (righe.length === 0) {
      toast.error("Seleziona almeno un impianto")
      return
    }
    if (righe.some((r) => !Number.isFinite(r.importo) || r.importo <= 0)) {
      toast.error("Importo mancante o non valido per uno o più impianti")
      return
    }

    startTransition(async () => {
      const result = await generaF24({
        clienteId,
        annoRiferimento: anno,
        dataScadenza: scadenza,
        righe,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      scaricaBase64(result.pdfBase64, result.nomeFile)
      toast.success("F24 generato e scaricato")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Genera F24
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Genera F24 diritto di licenza</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="anno">Anno di riferimento</Label>
                <Input
                  id="anno"
                  type="number"
                  value={anno}
                  onChange={(e) => setAnno(Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scadenza">Data di scadenza</Label>
                <Input
                  id="scadenza"
                  type="date"
                  value={scadenza}
                  onChange={(e) => setScadenza(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Impianto</TableHead>
                    <TableHead>Codice F24</TableHead>
                    <TableHead>Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {impianti.map((impianto) => (
                    <TableRow key={impianto.id}>
                      <TableCell>
                        <Checkbox
                          checked={selezionati.has(impianto.id)}
                          onCheckedChange={() => toggle(impianto.id)}
                        />
                      </TableCell>
                      <TableCell>{impianto.nome_impianto}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {impianto.codice_impianto_f24 ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-28"
                          value={importi[impianto.id] ?? ""}
                          onChange={(e) =>
                            setImporti((prev) => ({
                              ...prev,
                              [impianto.id]: e.target.value,
                            }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleGenera} disabled={pending}>
              {pending ? "Generazione…" : "Genera e scarica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
