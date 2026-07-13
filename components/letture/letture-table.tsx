"use client"

import { Fragment, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { upsertLetture } from "@/lib/actions/letture"
import {
  autoconsumoMensile,
  autoconsumoNegativo,
  ordineGrandezzaPlausibile,
  riconciliazione,
} from "@/lib/calc/registro"

const MESI = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
]

export type ContatoreLetture = {
  id: string
  matricola: string
  pod: string
  tipo: "produzione" | "immissione"
  costante_k: number | null
  lettura_iniziale: number
}

export type LetturaEsistente = {
  contatore_id: string
  periodo_mese: number
  periodo_anno: number
  valore_f1: number | null
  valore_f2: number | null
  valore_f3: number | null
}

type Cella = { f1: string; f2: string; f3: string }
type Griglia = Record<string, Cella>

function chiave(contatoreId: string, mese: number) {
  return `${contatoreId}-${mese}`
}

function numero(value: string): number {
  const n = Number(value.replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

export function LettureTable({
  impiantoId,
  anno,
  potenzaKw,
  contatori,
  lettureEsistenti,
}: {
  impiantoId: string
  anno: number
  potenzaKw: number | null
  contatori: ContatoreLetture[]
  lettureEsistenti: LetturaEsistente[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [griglia, setGriglia] = useState<Griglia>(() => {
    const iniziale: Griglia = {}
    for (const l of lettureEsistenti) {
      if (l.periodo_anno !== anno) continue
      iniziale[chiave(l.contatore_id, l.periodo_mese)] = {
        f1: l.valore_f1?.toString() ?? "",
        f2: l.valore_f2?.toString() ?? "",
        f3: l.valore_f3?.toString() ?? "",
      }
    }
    return iniziale
  })

  function setCella(contatoreId: string, mese: number, campo: keyof Cella, value: string) {
    setGriglia((prev) => ({
      ...prev,
      [chiave(contatoreId, mese)]: {
        ...(prev[chiave(contatoreId, mese)] ?? { f1: "", f2: "", f3: "" }),
        [campo]: value,
      },
    }))
  }

  function valorePeriodo(contatoreId: string, mese: number): number {
    const cella = griglia[chiave(contatoreId, mese)]
    if (!cella) return 0
    return numero(cella.f1) + numero(cella.f2) + numero(cella.f3)
  }

  const produzioneContatori = contatori.filter((c) => c.tipo === "produzione")
  const immissioneContatori = contatori.filter((c) => c.tipo === "immissione")

  // Dataset piccolo (12 mesi × pochi contatori): niente useMemo, si
  // ricalcola ad ogni render senza bisogno di gestire le dipendenze di
  // `valorePeriodo` (chiude su `griglia`, che cambia ad ogni input).
  const righeMensili = MESI.map((nome, index) => {
    const mese = index + 1
    const produzioneTot = produzioneContatori.reduce(
      (acc, c) => acc + valorePeriodo(c.id, mese),
      0
    )
    const immissioneTot = immissioneContatori.reduce(
      (acc, c) => acc + valorePeriodo(c.id, mese),
      0
    )
    const autoconsumo = autoconsumoMensile(produzioneTot, immissioneTot)
    return {
      mese,
      nome,
      produzioneTot,
      immissioneTot,
      autoconsumo,
      negativo: autoconsumoNegativo(autoconsumo),
      ordineOk: ordineGrandezzaPlausibile(produzioneTot, potenzaKw ?? 0),
    }
  })

  const riconciliazioni = useMemo(() => {
    return contatori.map((c) => {
      const tutteLeLetture = lettureEsistenti
        .filter((l) => l.contatore_id === c.id)
        .map((l) => ({
          anno: l.periodo_anno,
          mese: l.periodo_mese,
          valore_periodo:
            (l.valore_f1 ?? 0) + (l.valore_f2 ?? 0) + (l.valore_f3 ?? 0),
        }))
      const risultato = riconciliazione(c.lettura_iniziale, c.costante_k ?? 1, tutteLeLetture, {
        inizio: { anno, mese: 1 },
        fine: { anno, mese: 12 },
      })
      return { contatore: c, ...risultato }
    })
  }, [contatori, lettureEsistenti, anno])

  function handleSalva() {
    const righe = contatori.flatMap((c) =>
      MESI.map((_, index) => {
        const mese = index + 1
        const cella = griglia[chiave(c.id, mese)]
        if (!cella || (!cella.f1 && !cella.f2 && !cella.f3)) return null
        return {
          contatore_id: c.id,
          periodo_mese: mese,
          periodo_anno: anno,
          valore_f1: cella.f1 ? numero(cella.f1) : null,
          valore_f2: cella.f2 ? numero(cella.f2) : null,
          valore_f3: cella.f3 ? numero(cella.f3) : null,
        }
      })
    ).filter((r): r is NonNullable<typeof r> => r !== null)

    startTransition(async () => {
      const result = await upsertLetture(impiantoId, righe)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Letture salvate")
        router.refresh()
      }
    })
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background">Mese</TableHead>
              {contatori.map((c) => (
                <TableHead key={c.id} colSpan={3} className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-medium">{c.matricola}</span>
                    <Badge variant="outline">
                      {c.tipo === "produzione" ? "Produzione" : "Immissione"}
                    </Badge>
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-right">Produzione tot.</TableHead>
              <TableHead className="text-right">Immissione tot.</TableHead>
              <TableHead className="text-right">Autoconsumo</TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="sticky left-0 bg-background" />
              {contatori.map((c) => (
                <Fragment key={c.id}>
                  <TableHead className="text-center text-xs">F1</TableHead>
                  <TableHead className="text-center text-xs">F2</TableHead>
                  <TableHead className="text-center text-xs">F3</TableHead>
                </Fragment>
              ))}
              <TableHead />
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {righeMensili.map((riga) => (
              <TableRow key={riga.mese} className={riga.negativo ? "bg-destructive/5" : undefined}>
                <TableCell className="sticky left-0 bg-background font-medium">
                  {riga.nome}
                </TableCell>
                {contatori.map((c) => {
                  const cella = griglia[chiave(c.id, riga.mese)] ?? { f1: "", f2: "", f3: "" }
                  return (
                    <Fragment key={c.id}>
                      <TableCell className="p-1">
                        <Input
                          className="h-8 w-20 text-right"
                          inputMode="decimal"
                          value={cella.f1}
                          onChange={(e) => setCella(c.id, riga.mese, "f1", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          className="h-8 w-20 text-right"
                          inputMode="decimal"
                          value={cella.f2}
                          onChange={(e) => setCella(c.id, riga.mese, "f2", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          className="h-8 w-20 text-right"
                          inputMode="decimal"
                          value={cella.f3}
                          onChange={(e) => setCella(c.id, riga.mese, "f3", e.target.value)}
                        />
                      </TableCell>
                    </Fragment>
                  )
                })}
                <TableCell className="text-right tabular-nums">
                  {riga.produzioneTot.toLocaleString("it-IT")}
                  {!riga.ordineOk && (
                    <Badge variant="secondary" className="ml-1">
                      controlla ordine di grandezza
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {riga.immissioneTot.toLocaleString("it-IT")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {riga.autoconsumo.toLocaleString("it-IT")}
                  {riga.negativo && (
                    <Badge variant="destructive" className="ml-1">
                      negativo
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Button onClick={handleSalva} disabled={pending} className="w-fit">
        {pending ? "Salvataggio…" : "Salva letture"}
      </Button>

      {riconciliazioni.length > 0 && (
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Riconciliazione annuale (somma mensile vs. delta di registro × K)
          </h3>
          <div className="flex flex-wrap gap-2">
            {riconciliazioni.map(({ contatore, verificato }) => (
              <Badge key={contatore.id} variant={verificato ? "default" : "destructive"}>
                {contatore.matricola}: {verificato ? "verificato" : "non verificato"}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
