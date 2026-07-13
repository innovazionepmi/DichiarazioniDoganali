"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
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
import {
  F24GeneraDialog,
  type ImpiantoConDiritto,
} from "@/components/clienti/f24-genera-dialog"
import { inviaEmailF24, scaricaF24 } from "@/lib/actions/f24"

export interface F24GenerazioneStorico {
  id: string
  anno_riferimento: number
  data_scadenza: string
  stato: "generato" | "inviato"
  data_invio: string | null
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

// Visibile solo se il cliente ha almeno un impianto con
// diritto_licenza_dovuto=true (filtro già applicato lato server in page.tsx).
// L'invio email non è mai automatico: "OK invio" è un bottone separato che
// compare solo dopo che il PDF è stato generato/scaricato.
export function F24Section({
  clienteId,
  impiantiConDiritto,
  generazioni,
  emailConfigurata,
}: {
  clienteId: string
  impiantiConDiritto: ImpiantoConDiritto[]
  generazioni: F24GenerazioneStorico[]
  emailConfigurata: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleScarica(id: string) {
    startTransition(async () => {
      const result = await scaricaF24(id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      scaricaBase64(result.pdfBase64, result.nomeFile)
    })
  }

  function handleInvia(id: string) {
    startTransition(async () => {
      const result = await inviaEmailF24(id)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success("Email inviata")
      router.refresh()
    })
  }

  if (impiantiConDiritto.length === 0) return null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Diritto di licenza</h2>
        <F24GeneraDialog clienteId={clienteId} impianti={impiantiConDiritto} />
      </div>

      {!emailConfigurata && (
        <p className="mb-3 text-sm text-muted-foreground">
          Servizio email non ancora configurato: generazione e download
          funzionano comunque; l&apos;invio si sbloccherà quando le
          credenziali SMTP saranno impostate su Vercel.
        </p>
      )}

      {generazioni.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessun F24 generato finora per questo cliente.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anno</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Data invio</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {generazioni.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>{g.anno_riferimento}</TableCell>
                  <TableCell>
                    {new Date(g.data_scadenza).toLocaleDateString("it-IT")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.stato === "inviato" ? "success" : "outline"}>
                      {g.stato === "inviato" ? "Inviato" : "Generato"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {g.data_invio
                      ? new Date(g.data_invio).toLocaleDateString("it-IT")
                      : "—"}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleScarica(g.id)}
                    >
                      Scarica
                    </Button>
                    {g.stato === "generato" && (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => handleInvia(g.id)}
                      >
                        OK invio
                      </Button>
                    )}
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
