"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { generaDichiarazioneSemestrale, caricaEsitoDichiarazione } from "@/lib/actions/dichiarazioni"
import { scaricaDocumento } from "@/lib/actions/documenti"

export interface DichiarazioneStorico {
  id: string
  anno: number
  periodo_riferimento: 1 | 2
  stato: "generata" | "inviata"
  documento_xml_id: string | null
  documento_pdf_id: string | null
  documento_protocollo_id: string | null
  data_generazione: string
  data_invio: string | null
}

function scaricaBase64(base64: string, nomeFile: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nomeFile
  a.click()
  URL.revokeObjectURL(url)
}

// Genera l'XML della dichiarazione semestrale (Quadro A + Quadro G, brief
// Fase 4 incremento 1) e permette di archiviare il PDF/protocollo che ADM
// restituisce dopo il caricamento manuale sul portale — l'app non invia mai
// nulla direttamente (nessuna firma digitale/SOAP, vedi piano).
export function DichiarazioneSection({
  impiantoId,
  dichiarazioni,
}: {
  impiantoId: string
  dichiarazioni: DichiarazioneStorico[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const annoDefault = new Date().getFullYear()
  const [anno, setAnno] = useState(annoDefault)
  const [semestre, setSemestre] = useState<1 | 2>(1)
  const pdfInputRef = useRef<Record<string, HTMLInputElement | null>>({})
  const protocolloInputRef = useRef<Record<string, HTMLInputElement | null>>({})

  function handleGenera() {
    startTransition(async () => {
      const result = await generaDichiarazioneSemestrale(impiantoId, anno, semestre)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      scaricaBase64(result.xmlBase64, result.nomeFile, "application/xml")
      toast.success("Dichiarazione generata e scaricata")
      setOpen(false)
      router.refresh()
    })
  }

  function handleScaricaXml(documentoId: string) {
    startTransition(async () => {
      const result = await scaricaDocumento(documentoId)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      scaricaBase64(result.base64, result.nomeFile, result.mimeType)
    })
  }

  function handleCaricaEsito(
    dichiarazioneId: string,
    tipo: "dichiarazione" | "protocollo",
    file: File
  ) {
    const formData = new FormData()
    formData.set("file", file)
    startTransition(async () => {
      const result = await caricaEsitoDichiarazione(dichiarazioneId, tipo, formData)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(tipo === "dichiarazione" ? "PDF caricato" : "Protocollo caricato")
      router.refresh()
    })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dichiarazione energia elettrica (semestrale)</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          Genera dichiarazione
        </Button>
      </div>

      {dichiarazioni.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessuna dichiarazione generata finora per questo impianto.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Generata il</TableHead>
                <TableHead>PDF ADM</TableHead>
                <TableHead>Protocollo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dichiarazioni.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    {d.anno} — {d.periodo_riferimento}° semestre
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.stato === "inviata" ? "success" : "outline"}>
                      {d.stato === "inviata" ? "Inviata" : "Generata"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(d.data_generazione).toLocaleDateString("it-IT")}
                  </TableCell>
                  <TableCell>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      ref={(node) => {
                        pdfInputRef.current[d.id] = node
                      }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleCaricaEsito(d.id, "dichiarazione", file)
                        e.target.value = ""
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => pdfInputRef.current[d.id]?.click()}
                    >
                      {d.documento_pdf_id ? "Sostituisci" : "Carica PDF"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <input
                      type="file"
                      accept="text/plain"
                      className="hidden"
                      ref={(node) => {
                        protocolloInputRef.current[d.id] = node
                      }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleCaricaEsito(d.id, "protocollo", file)
                        e.target.value = ""
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => protocolloInputRef.current[d.id]?.click()}
                    >
                      {d.documento_protocollo_id ? "Sostituisci" : "Carica protocollo"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {d.documento_xml_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleScaricaXml(d.documento_xml_id!)}
                      >
                        Scarica XML
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Genera dichiarazione semestrale</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="dich-anno">Anno</Label>
              <Input
                id="dich-anno"
                type="number"
                value={anno}
                onChange={(e) => setAnno(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Semestre</Label>
              <Select
                value={String(semestre)}
                onValueChange={(v) => setSemestre(v === "2" ? 2 : 1)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1° semestre (gen-giu)</SelectItem>
                  <SelectItem value="2">2° semestre (lug-dic)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            L&apos;XML generato va caricato a mano sul portale ADM (PUDM). Dopo
            il caricamento, torna qui per archiviare il PDF e il protocollo
            che ADM restituisce.
          </p>
          <DialogFooter>
            <Button onClick={handleGenera} disabled={pending}>
              {pending ? "Generazione…" : "Genera e scarica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
