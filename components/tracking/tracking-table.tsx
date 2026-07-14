"use client"

import { Fragment, useMemo, useState, useTransition } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toggleDichiarazione, toggleFattura } from "@/lib/actions/tracking"

type Cliente = { id: string; ragione_sociale: string; partner_id: string | null }
type Impianto = {
  id: string
  nome_impianto: string
  cliente_id: string
  diritto_licenza_dovuto: boolean
}
type Dichiarazione = { impianto_id: string; periodo: number; inviata: boolean }
type Fattura = { cliente_id: string; emessa: boolean }

function chiaveDichiarazione(impiantoId: string, periodo: number) {
  return `${impiantoId}-${periodo}`
}

// Ogni impianto ha 1 (annuale, periodo=0) o 2 (semestrale, periodo=1/2)
// periodi da tracciare a seconda di diritto_licenza_dovuto — decisione presa
// qui in UI, non a schema (brief §9: la regola serve anche più avanti per la
// generazione XML della dichiarazione, Fase 4).
function periodiPerImpianto(impianto: Impianto): { periodo: 0 | 1 | 2; label: string }[] {
  if (impianto.diritto_licenza_dovuto) {
    return [
      { periodo: 1, label: "1° semestre" },
      { periodo: 2, label: "2° semestre" },
    ]
  }
  return [{ periodo: 0, label: "Annuale" }]
}

export function TrackingTable({
  anno,
  clienti,
  impianti,
  dichiarazioni,
  fatture,
}: {
  anno: number
  clienti: Cliente[]
  impianti: Impianto[]
  dichiarazioni: Dichiarazione[]
  fatture: Fattura[]
}) {
  const [pending, startTransition] = useTransition()
  const [espansi, setEspansi] = useState<Set<string>>(new Set())

  const [statoDichiarazioni, setStatoDichiarazioni] = useState<Record<string, boolean>>(() => {
    const stato: Record<string, boolean> = {}
    for (const d of dichiarazioni) {
      stato[chiaveDichiarazione(d.impianto_id, d.periodo)] = d.inviata
    }
    return stato
  })
  const [statoFatture, setStatoFatture] = useState<Record<string, boolean>>(() => {
    const stato: Record<string, boolean> = {}
    for (const f of fatture) {
      stato[f.cliente_id] = f.emessa
    }
    return stato
  })

  const impiantiPerCliente = useMemo(() => {
    const mappa = new Map<string, Impianto[]>()
    for (const impianto of impianti) {
      const lista = mappa.get(impianto.cliente_id) ?? []
      lista.push(impianto)
      mappa.set(impianto.cliente_id, lista)
    }
    return mappa
  }, [impianti])

  function toggleEspanso(clienteId: string) {
    setEspansi((prev) => {
      const next = new Set(prev)
      if (next.has(clienteId)) next.delete(clienteId)
      else next.add(clienteId)
      return next
    })
  }

  function handleToggleFattura(clienteId: string, emessa: boolean) {
    setStatoFatture((prev) => ({ ...prev, [clienteId]: emessa }))
    startTransition(async () => {
      const result = await toggleFattura(clienteId, anno, emessa)
      if (result?.error) {
        toast.error(result.error)
        setStatoFatture((prev) => ({ ...prev, [clienteId]: !emessa }))
      }
    })
  }

  function handleToggleDichiarazione(impiantoId: string, periodo: 0 | 1 | 2, inviata: boolean) {
    const chiave = chiaveDichiarazione(impiantoId, periodo)
    setStatoDichiarazioni((prev) => ({ ...prev, [chiave]: inviata }))
    startTransition(async () => {
      const result = await toggleDichiarazione(impiantoId, anno, periodo, inviata)
      if (result?.error) {
        toast.error(result.error)
        setStatoDichiarazioni((prev) => ({ ...prev, [chiave]: !inviata }))
      }
    })
  }

  if (clienti.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun cliente trovato.</p>
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead>Cliente / Impianto</TableHead>
            <TableHead>Dichiarazioni</TableHead>
            <TableHead className="text-right">Fattura {anno}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clienti.map((cliente) => {
            const impiantiCliente = impiantiPerCliente.get(cliente.id) ?? []
            const isEspanso = espansi.has(cliente.id)

            const periodiTotali = impiantiCliente.flatMap(periodiPerImpianto)
            const periodiInviati = impiantiCliente.flatMap((impianto) =>
              periodiPerImpianto(impianto).filter(
                ({ periodo }) => statoDichiarazioni[chiaveDichiarazione(impianto.id, periodo)]
              )
            )

            return (
              <Fragment key={cliente.id}>
                <TableRow className="cursor-pointer hover:bg-muted/40">
                  <TableCell
                    className="w-8"
                    onClick={() => toggleEspanso(cliente.id)}
                  >
                    {impiantiCliente.length > 0 &&
                      (isEspanso ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      ))}
                  </TableCell>
                  <TableCell
                    className="font-medium"
                    onClick={() => toggleEspanso(cliente.id)}
                  >
                    {cliente.ragione_sociale}
                  </TableCell>
                  <TableCell onClick={() => toggleEspanso(cliente.id)}>
                    {periodiTotali.length > 0 ? (
                      <Badge
                        variant={
                          periodiInviati.length === periodiTotali.length
                            ? "success"
                            : "outline"
                        }
                      >
                        {periodiInviati.length}/{periodiTotali.length} inviate
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Nessun impianto
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <Checkbox
                        checked={statoFatture[cliente.id] ?? false}
                        disabled={pending}
                        onCheckedChange={(checked) =>
                          handleToggleFattura(cliente.id, checked === true)
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>

                {isEspanso &&
                  impiantiCliente.map((impianto) => (
                    <TableRow key={impianto.id} className="bg-muted/20">
                      <TableCell />
                      <TableCell className="pl-6 text-sm">{impianto.nome_impianto}</TableCell>
                      <TableCell colSpan={2}>
                        <div className="flex flex-wrap items-center gap-4">
                          {periodiPerImpianto(impianto).map(({ periodo, label }) => {
                            const chiave = chiaveDichiarazione(impianto.id, periodo)
                            return (
                              <label
                                key={periodo}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={statoDichiarazioni[chiave] ?? false}
                                  disabled={pending}
                                  onCheckedChange={(checked) =>
                                    handleToggleDichiarazione(
                                      impianto.id,
                                      periodo,
                                      checked === true
                                    )
                                  }
                                />
                                {label}
                              </label>
                            )
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
