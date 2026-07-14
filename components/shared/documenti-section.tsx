"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { scaricaDocumento } from "@/lib/actions/documenti"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface DocumentoListato {
  id: string
  tipo: string
  nome_file: string
  created_at: string
}

const TIPO_LABEL: Record<string, string> = {
  licenza: "Licenza",
  f24: "F24",
  pdf_letture: "PDF letture",
  screenshot_letture: "Screenshot letture",
  dichiarazione: "Dichiarazione",
  dichiarazione_xml: "Dichiarazione (XML)",
  protocollo: "Protocollo",
  ricevuta: "Ricevuta",
  verbale_sostituzione: "Verbale sostituzione",
  registro_letture: "Registro letture",
  altro: "Altro",
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

// Elenco generico dei file archiviati (bucket privato `documenti`),
// riutilizzabile sia nella scheda cliente che in quella impianto — ogni
// documento caricato dall'app (licenze, PDF letture, ecc.) resta sempre
// recuperabile da qui, non solo al momento dell'upload.
export function DocumentiSection({ documenti }: { documenti: DocumentoListato[] }) {
  const [pending, startTransition] = useTransition()

  function handleScarica(id: string) {
    startTransition(async () => {
      const result = await scaricaDocumento(id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      scaricaBase64(result.base64, result.nomeFile, result.mimeType)
    })
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Documenti</h2>
      {documenti.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun documento archiviato.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Caricato il</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documenti.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <Badge variant="outline">{TIPO_LABEL[doc.tipo] ?? doc.tipo}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{doc.nome_file}</TableCell>
                  <TableCell>
                    {new Date(doc.created_at).toLocaleDateString("it-IT")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleScarica(doc.id)}
                    >
                      Scarica
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
