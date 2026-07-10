"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  creaRelazioneContatori,
  eliminaRelazioneContatori,
} from "@/lib/actions/contatori-relazioni"
import type { ContatoreRow } from "@/components/impianti/contatori-list"

type Relazione = {
  id: string
  contatore_produzione_id: string
  contatore_immissione_id: string
}

function contatoreLabel(c: ContatoreRow) {
  return `${c.matricola} (${c.pod})`
}

export function ContatoriRelazioniManager({
  impiantoId,
  contatori,
  relazioni,
}: {
  impiantoId: string
  contatori: ContatoreRow[]
  relazioni: Relazione[]
}) {
  const [pending, startTransition] = useTransition()

  const produzione = contatori.filter((c) => c.tipo === "produzione")
  const immissione = contatori.filter((c) => c.tipo === "immissione")
  const byId = new Map(contatori.map((c) => [c.id, c]))

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await creaRelazioneContatori(impiantoId, formData)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Relazione creata")
      }
    })
  }

  function handleDelete(relazioneId: string) {
    if (!window.confirm("Eliminare questa relazione produzione↔immissione?")) return
    startTransition(async () => {
      const result = await eliminaRelazioneContatori(impiantoId, relazioneId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Relazione eliminata")
      }
    })
  }

  return (
    <div className="grid gap-3">
      <h2 className="text-lg font-semibold">Relazioni produzione ↔ immissione</h2>
      <p className="text-sm text-muted-foreground">
        L&apos;autoconsumo si calcola come produzione − immissione seguendo
        queste coppie: collegare correttamente i contatori è fondamentale per
        i calcoli successivi.
      </p>

      {relazioni.length > 0 ? (
        <ul className="grid gap-2">
          {relazioni.map((r) => {
            const prod = byId.get(r.contatore_produzione_id)
            const imm = byId.get(r.contatore_immissione_id)
            return (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="text-sm">
                  {prod ? contatoreLabel(prod) : "—"}
                  {" → "}
                  {imm ? contatoreLabel(imm) : "—"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleDelete(r.id)}
                >
                  Rimuovi
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nessuna relazione definita.</p>
      )}

      {produzione.length > 0 && immissione.length > 0 && (
        <form action={handleCreate} className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Contatore produzione</label>
            <Select name="contatore_produzione_id">
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Seleziona" />
              </SelectTrigger>
              <SelectContent>
                {produzione.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {contatoreLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Contatore immissione</label>
            <Select name="contatore_immissione_id">
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Seleziona" />
              </SelectTrigger>
              <SelectContent>
                {immissione.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {contatoreLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Collega
          </Button>
        </form>
      )}
    </div>
  )
}
