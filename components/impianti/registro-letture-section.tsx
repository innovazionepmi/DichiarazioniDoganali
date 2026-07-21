"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  generaRegistroLetture,
  inviaRegistroLettureVuotoEmail,
} from "@/lib/actions/registro-letture"

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

// Registro letture (Mod. M-bis 36, brief Fase 4/5): documento annuale con le
// letture progressive di tutti i contatori dell'impianto — non legato alla
// periodicità della dichiarazione (che dal 2026 è semestrale), il registro
// resta un libro annuale. Visibile solo se `ha_registro_letture` (mirror
// della condizione già usata per "Diritto di licenza").
export function RegistroLettureSection({
  impiantoId,
  clienteEmail,
}: {
  impiantoId: string
  clienteEmail: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [anno, setAnno] = useState(new Date().getFullYear())

  function handleGenera() {
    startTransition(async () => {
      const result = await generaRegistroLetture(impiantoId, anno)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      scaricaBase64(result.pdfBase64, result.nomeFile)
      toast.success("Registro letture generato")
    })
  }

  function handleInviaVuoto() {
    if (!clienteEmail) {
      toast.error("Il cliente non ha un'email del referente impostata in anagrafica")
      return
    }
    if (
      !window.confirm(
        `Inviare il registro letture ${anno} in bianco (da compilare a mano) al cliente all'indirizzo ${clienteEmail}?`
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await inviaRegistroLettureVuotoEmail(impiantoId, anno)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success("Registro letture (vuoto) inviato al cliente")
    })
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Registro letture</h2>
      <div className="flex items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="registro-anno">Anno</Label>
          <Input
            id="registro-anno"
            type="number"
            className="w-28"
            value={anno}
            onChange={(e) => setAnno(Number(e.target.value))}
          />
        </div>
        <Button size="sm" disabled={pending} onClick={handleGenera}>
          {pending ? "Generazione…" : "Genera registro"}
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={handleInviaVuoto}>
          Invia registro vuoto al cliente
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        &quot;Genera registro&quot; scarica il registro con le letture già
        inserite finora. &quot;Invia registro vuoto al cliente&quot; manda per
        email una versione con le caselle mensili in bianco, da stampare e
        compilare a mano — come previsto a inizio anno dalla normativa.
      </p>
    </div>
  )
}
