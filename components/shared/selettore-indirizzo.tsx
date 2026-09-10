"use client"

import { useEffect, useState } from "react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { cercaProvince, cercaComuniPerProvincia, type Provincia, type Comune } from "@/lib/actions/comuni"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

// Cache in-memory a livello di modulo: le province sono dati statici,
// nessun bisogno di ricaricarle ogni volta che il form viene montato (es.
// passando da un impianto all'altro nella stessa sessione).
let provinceCache: Provincia[] | null = null

// Tendine provincia → comune con auto-popolamento di CAP (e, quando il
// campo è passato, codice catastale) dalla tabella `comuni` (brief: "può
// essere auto-popolato da tabella comuni ISTAT/catastale"). Generico sul
// tipo di form perché è condiviso da ClienteForm e ImpiantoForm, che hanno
// schemi diversi ma la stessa forma di indirizzo (via/cap/provincia/città).
export function SelettoreIndirizzo<T extends FieldValues>({
  form,
  campoProvincia,
  campoCitta,
  campoCap,
  campoCodiceCatastale,
  disabled,
}: {
  form: UseFormReturn<T>
  campoProvincia: Path<T>
  campoCitta: Path<T>
  campoCap: Path<T>
  campoCodiceCatastale?: Path<T>
  disabled?: boolean
}) {
  const [province, setProvince] = useState<Provincia[]>(provinceCache ?? [])
  const [comuni, setComuni] = useState<Comune[]>([])

  const provinciaSelezionata = form.watch(campoProvincia) as string

  useEffect(() => {
    if (provinceCache) return
    cercaProvince().then((risultato) => {
      if (Array.isArray(risultato)) {
        provinceCache = risultato
        setProvince(risultato)
      }
    })
  }, [])

  useEffect(() => {
    // Niente reset esplicito a lista vuota quando la provincia non è
    // (ancora) selezionata: lo stato iniziale è già [] e il comune resta
    // comunque disabilitato in UI finché non c'è una provincia.
    if (!provinciaSelezionata) return
    let annullato = false
    cercaComuniPerProvincia(provinciaSelezionata).then((risultato) => {
      if (!annullato && Array.isArray(risultato)) setComuni(risultato)
    })
    return () => {
      annullato = true
    }
  }, [provinciaSelezionata])

  function selezionaComune(codiceCatastale: string | null) {
    const comune = comuni.find((c) => c.codice_catastale === codiceCatastale)
    if (!comune) return
    form.setValue(campoCitta, comune.nome as never, { shouldDirty: true })
    form.setValue(campoCap, comune.cap as never, { shouldDirty: true })
    if (campoCodiceCatastale) {
      form.setValue(campoCodiceCatastale, comune.codice_catastale as never, {
        shouldDirty: true,
      })
    }
  }

  function selezionaProvincia(sigla: string | null) {
    form.setValue(campoProvincia, (sigla ?? "") as never, { shouldDirty: true })
    // Cambiare provincia invalida il comune scelto in precedenza: non ha
    // senso lasciare un comune di un'altra provincia selezionato.
    form.setValue(campoCitta, "" as never, { shouldDirty: true })
  }

  const comuneCorrente = comuni.find((c) => c.nome === form.watch(campoCitta))

  return (
    <>
      <FormField
        control={form.control}
        name={campoProvincia}
        render={() => (
          <FormItem>
            <FormLabel>Provincia</FormLabel>
            <Select
              value={provinciaSelezionata || undefined}
              onValueChange={selezionaProvincia}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona provincia" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {province.map((p) => (
                  <SelectItem key={p.sigla} value={p.sigla}>
                    {p.nome} ({p.sigla})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={campoCitta}
        render={() => (
          <FormItem className="sm:col-span-3">
            <FormLabel>Comune</FormLabel>
            <Select
              value={comuneCorrente?.codice_catastale}
              onValueChange={selezionaComune}
              disabled={disabled || !provinciaSelezionata}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      provinciaSelezionata
                        ? "Seleziona comune"
                        : "Seleziona prima la provincia"
                    }
                  >
                    {comuneCorrente ? comuneCorrente.nome : (form.watch(campoCitta) as string) || undefined}
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {comuni.map((c) => (
                  <SelectItem key={c.codice_catastale} value={c.codice_catastale}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={campoCap}
        render={({ field }) => (
          <FormItem>
            <FormLabel>CAP</FormLabel>
            <FormControl>
              <Input {...field} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}
