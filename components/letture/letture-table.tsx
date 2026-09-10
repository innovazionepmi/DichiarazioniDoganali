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
import { upsertLetture, aggiornaLetturaIniziale } from "@/lib/actions/letture"
import {
  autoconsumoMensile,
  autoconsumoNegativo,
  energiaDaLetturaCumulativa,
  letturaRegistro,
  ordineGrandezzaPlausibile,
  riconciliazione,
  ultimoGiornoMese,
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
  modalita_letture: "mensile" | "cumulativa"
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
// Contatori "cumulativa" (feedback Paolo: alcuni clienti mandano la lettura
// progressiva del contatore invece del kWh mensile già calcolato): qui si
// digita direttamente quel numero, non i tre campi F1/F2/F3.
type GrigliaCumulativa = Record<string, string>

function chiave(contatoreId: string, mese: number) {
  return `${contatoreId}-${mese}`
}

function numero(value: string): number {
  const n = Number(value.replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function storiaContatore(lettureEsistenti: LetturaEsistente[], contatoreId: string) {
  return lettureEsistenti
    .filter((l) => l.contatore_id === contatoreId)
    .map((l) => ({
      anno: l.periodo_anno,
      mese: l.periodo_mese,
      valore_periodo: (l.valore_f1 ?? 0) + (l.valore_f2 ?? 0) + (l.valore_f3 ?? 0),
    }))
}

function costruisciGriglia(lettureEsistenti: LetturaEsistente[], anno: number): Griglia {
  const griglia: Griglia = {}
  for (const l of lettureEsistenti) {
    if (l.periodo_anno !== anno) continue
    griglia[chiave(l.contatore_id, l.periodo_mese)] = {
      f1: l.valore_f1?.toString() ?? "",
      f2: l.valore_f2?.toString() ?? "",
      f3: l.valore_f3?.toString() ?? "",
    }
  }
  return griglia
}

// Ricostruisce, per i contatori in modalità "cumulativa", la lettura
// progressiva di fine mese da riesporre nell'input — a partire dai delta
// (kWh) già salvati, è l'esatto inverso di come li salviamo in handleSalva
// (lettura × K → kwh, quindi qui letturaRegistro già fa kwh / K per
// tornare alla lettura). Solo per i mesi con un dato salvato: gli altri
// restano vuoti, non a zero.
function costruisciGrigliaCumulativa(
  contatori: ContatoreLetture[],
  lettureEsistenti: LetturaEsistente[],
  anno: number
): GrigliaCumulativa {
  const griglia: GrigliaCumulativa = {}
  for (const c of contatori) {
    if (c.modalita_letture !== "cumulativa") continue
    const storia = storiaContatore(lettureEsistenti, c.id)
    for (let mese = 1; mese <= 12; mese++) {
      const esisteMese = storia.some((l) => l.anno === anno && l.mese === mese)
      if (!esisteMese) continue
      const valore = letturaRegistro(c.lettura_iniziale, c.costante_k ?? 1, storia, {
        anno,
        mese,
      })
      griglia[chiave(c.id, mese)] = String(valore)
    }
  }
  return griglia
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

  const [griglia, setGriglia] = useState<Griglia>(() =>
    costruisciGriglia(lettureEsistenti, anno)
  )
  const [grigliaCumulativa, setGrigliaCumulativa] = useState<GrigliaCumulativa>(() =>
    costruisciGrigliaCumulativa(contatori, lettureEsistenti, anno)
  )

  // "Lettura iniziale" (fix richiesto da Paolo): normalmente è la lettura di
  // registro calcolata al 31/12 dell'anno precedente, a partire dallo
  // storico completo del contatore — se non c'è storico (contatore nuovo
  // subentrato ad anno iniziato), letturaRegistro ritorna semplicemente
  // lettura_iniziale così com'è, che l'operatore può correggere a mano.
  function calcolaLetturaInizialeDefault(c: ContatoreLetture): number {
    const storia = storiaContatore(lettureEsistenti, c.id)
    return letturaRegistro(c.lettura_iniziale, c.costante_k ?? 1, storia, {
      anno: anno - 1,
      mese: 12,
    })
  }

  const [letturaInizialeInput, setLetturaInizialeInput] = useState<Record<string, string>>(() =>
    Object.fromEntries(contatori.map((c) => [c.id, String(calcolaLetturaInizialeDefault(c))]))
  )

  function setCella(contatoreId: string, mese: number, campo: keyof Cella, value: string) {
    setGriglia((prev) => ({
      ...prev,
      [chiave(contatoreId, mese)]: {
        ...(prev[chiave(contatoreId, mese)] ?? { f1: "", f2: "", f3: "" }),
        [campo]: value,
      },
    }))
  }

  function setCellaCumulativa(contatoreId: string, mese: number, value: string) {
    setGrigliaCumulativa((prev) => ({ ...prev, [chiave(contatoreId, mese)]: value }))
  }

  // Lettura di registro nota immediatamente prima di `mese`, dentro alla
  // griglia in modifica: l'ultimo valore digitato nei mesi precedenti (per
  // gestire mesi saltati/non ancora inseriti), altrimenti la lettura
  // iniziale dell'anno (31/12 anno precedente).
  function letturaPrecedenteAlMese(c: ContatoreLetture, mese: number): number {
    for (let m = mese - 1; m >= 1; m--) {
      const valore = grigliaCumulativa[chiave(c.id, m)]
      if (valore) return numero(valore)
    }
    return calcolaLetturaInizialeDefault(c)
  }

  function valorePeriodo(c: ContatoreLetture, mese: number): number {
    if (c.modalita_letture === "cumulativa") {
      const valore = grigliaCumulativa[chiave(c.id, mese)]
      if (!valore) return 0
      return energiaDaLetturaCumulativa(
        numero(valore),
        letturaPrecedenteAlMese(c, mese),
        c.costante_k ?? 1
      )
    }
    const cella = griglia[chiave(c.id, mese)]
    if (!cella) return 0
    return numero(cella.f1) + numero(cella.f2) + numero(cella.f3)
  }

  const produzioneContatori = contatori.filter((c) => c.tipo === "produzione")
  const immissioneContatori = contatori.filter((c) => c.tipo === "immissione")

  // Dataset piccolo (12 mesi × pochi contatori): niente useMemo, si
  // ricalcola ad ogni render senza bisogno di gestire le dipendenze di
  // `valorePeriodo` (chiude su `griglia`/`grigliaCumulativa`, che cambiano
  // ad ogni input).
  const righeMensili = MESI.map((nome, index) => {
    const mese = index + 1
    const nomeConGiorno = `${nome} ${ultimoGiornoMese(anno, mese)}`
    const produzioneTot = produzioneContatori.reduce(
      (acc, c) => acc + valorePeriodo(c, mese),
      0
    )
    const immissioneTot = immissioneContatori.reduce(
      (acc, c) => acc + valorePeriodo(c, mese),
      0
    )
    const autoconsumo = autoconsumoMensile(produzioneTot, immissioneTot)
    return {
      mese,
      nome: nomeConGiorno,
      produzioneTot,
      immissioneTot,
      autoconsumo,
      negativo: autoconsumoNegativo(autoconsumo),
      ordineOk: ordineGrandezzaPlausibile(produzioneTot, potenzaKw ?? 0),
    }
  })

  const riconciliazioni = useMemo(() => {
    return contatori.map((c) => {
      const tutteLeLetture = storiaContatore(lettureEsistenti, c.id)
      const risultato = riconciliazione(c.lettura_iniziale, c.costante_k ?? 1, tutteLeLetture, {
        inizio: { anno, mese: 1 },
        fine: { anno, mese: 12 },
      })
      return { contatore: c, ...risultato }
    })
  }, [contatori, lettureEsistenti, anno])

  function handleSalva() {
    const righe = contatori.flatMap((c) => {
      if (c.modalita_letture === "cumulativa") {
        // In ordine di mese: ogni delta è relativo all'ultima lettura nota
        // (digitata qui o, se il mese è il primo della sequenza, la lettura
        // iniziale dell'anno) — stesso ordine con cui l'operatore le legge
        // dal contatore fisico.
        let letturaPrecedente = calcolaLetturaInizialeDefault(c)
        const righeContatore: NonNullable<ReturnType<typeof rigaCumulativa>>[] = []
        function rigaCumulativa(mese: number) {
          const valore = grigliaCumulativa[chiave(c.id, mese)]
          if (!valore) return null
          const letturaAttuale = numero(valore)
          const kwh = energiaDaLetturaCumulativa(letturaAttuale, letturaPrecedente, c.costante_k ?? 1)
          letturaPrecedente = letturaAttuale
          return {
            contatore_id: c.id,
            periodo_mese: mese,
            periodo_anno: anno,
            valore_f1: kwh,
            valore_f2: null,
            valore_f3: null,
          }
        }
        for (let mese = 1; mese <= 12; mese++) {
          const riga = rigaCumulativa(mese)
          if (riga) righeContatore.push(riga)
        }
        return righeContatore
      }

      return MESI.map((_, index) => {
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
      }).filter((r): r is NonNullable<typeof r> => r !== null)
    })

    startTransition(async () => {
      const result = await upsertLetture(impiantoId, righe)
      if (result?.error) {
        toast.error(result.error)
        return
      }

      for (const c of contatori) {
        const valoreInput = numero(letturaInizialeInput[c.id] ?? "")
        const valoreDefault = calcolaLetturaInizialeDefault(c)
        if (Math.abs(valoreInput - valoreDefault) < 0.0001) continue
        const risultatoLI = await aggiornaLetturaIniziale(impiantoId, c.id, valoreInput)
        if (risultatoLI?.error) {
          toast.error(`Lettura iniziale ${c.matricola}: ${risultatoLI.error}`)
          return
        }
      }

      toast.success("Letture salvate")
      router.refresh()
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
                <TableHead key={c.id} colSpan={4} className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-medium">{c.matricola}</span>
                    <div className="flex gap-1">
                      <Badge variant="outline">
                        {c.tipo === "produzione" ? "Produzione" : "Immissione"}
                      </Badge>
                      {c.modalita_letture === "cumulativa" && (
                        <Badge variant="secondary">Lettura cumulativa</Badge>
                      )}
                    </div>
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-right">Produzione tot.</TableHead>
              <TableHead className="text-right">Immissione tot.</TableHead>
              <TableHead className="text-right">Autoconsumo</TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="sticky left-0 bg-background" />
              {contatori.map((c) =>
                c.modalita_letture === "cumulativa" ? (
                  <TableHead key={c.id} colSpan={4} className="text-center text-xs">
                    Lettura progressiva
                  </TableHead>
                ) : (
                  <Fragment key={c.id}>
                    <TableHead className="text-center text-xs">F1</TableHead>
                    <TableHead className="text-center text-xs">F2</TableHead>
                    <TableHead className="text-center text-xs">F3</TableHead>
                    <TableHead className="text-center text-xs">Tot.</TableHead>
                  </Fragment>
                )
              )}
              <TableHead />
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/30">
              <TableCell className="sticky left-0 bg-muted/30 font-medium">
                Lettura iniziale
              </TableCell>
              {contatori.map((c) => (
                <TableCell key={c.id} colSpan={4} className="p-1">
                  <Input
                    className="h-8 w-28 text-right"
                    inputMode="decimal"
                    value={letturaInizialeInput[c.id] ?? ""}
                    onChange={(e) =>
                      setLetturaInizialeInput((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                  />
                </TableCell>
              ))}
              <TableCell />
              <TableCell />
              <TableCell />
            </TableRow>
            {righeMensili.map((riga) => (
              <TableRow key={riga.mese} className={riga.negativo ? "bg-destructive/5" : undefined}>
                <TableCell className="sticky left-0 bg-background font-medium">
                  {riga.nome}
                </TableCell>
                {contatori.map((c) => {
                  if (c.modalita_letture === "cumulativa") {
                    return (
                      <TableCell key={c.id} colSpan={4} className="p-1">
                        <div className="flex items-center justify-end gap-2">
                          <Input
                            className="h-8 w-28 text-right"
                            inputMode="decimal"
                            value={grigliaCumulativa[chiave(c.id, riga.mese)] ?? ""}
                            onChange={(e) => setCellaCumulativa(c.id, riga.mese, e.target.value)}
                          />
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {valorePeriodo(c, riga.mese).toLocaleString("it-IT")} kWh
                          </span>
                        </div>
                      </TableCell>
                    )
                  }
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
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {valorePeriodo(c, riga.mese).toLocaleString("it-IT")}
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
