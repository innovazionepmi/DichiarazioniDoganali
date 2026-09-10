"use client"

import { useEffect, useState } from "react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { cercaProvince, cercaComuniPerProvincia, type Provincia, type Comune } from "@/lib/actions/comuni"
import { Input } from "@/components/ui/input"
import {
  Combobox,
  ComboboxClear,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

// Cache in-memory a livello di modulo: le province sono dati statici,
// nessun bisogno di ricaricarle ogni volta che il form viene montato (es.
// passando da un impianto all'altro nella stessa sessione).
let provinceCache: Provincia[] | null = null

type ItemProvincia = { value: string; label: string }
type ItemComune = { value: string; label: string }

// Tendine provincia → comune con auto-popolamento di CAP (e, quando il
// campo è passato, codice catastale) dalla tabella `comuni` (brief: "può
// essere auto-popolato da tabella comuni ISTAT/catastale"). Combobox
// (ricerca testuale) invece di un semplice Select: con 107 province e fino
// a qualche centinaio di comuni per provincia uno scroll-to-find è
// scomodo — qui l'operatore digita e filtra. Generico sul tipo di form
// perché è condiviso da ClienteForm e ImpiantoForm, che hanno schemi
// diversi ma la stessa forma di indirizzo (via/cap/provincia/città).
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
    if (!comune) {
      form.setValue(campoCitta, "" as never, { shouldDirty: true })
      return
    }
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

  const itemsProvincia: ItemProvincia[] = province.map((p) => ({
    value: p.sigla,
    label: `${p.nome} (${p.sigla})`,
  }))
  const itemsComune: ItemComune[] = comuni.map((c) => ({
    value: c.codice_catastale,
    label: c.nome,
  }))
  // Value = l'oggetto {value,label} intero (non solo la stringa): è quanto
  // serve a Combobox per riconoscere automaticamente la forma {value,label}
  // e mostrare la label nell'input dopo la selezione, invece del valore
  // grezzo — coerente con isItemEqualToValue qui sotto.
  const valoreProvincia = itemsProvincia.find((p) => p.value === provinciaSelezionata) ?? null
  const valoreComune = itemsComune.find((c) => c.value === comuneCorrente?.codice_catastale) ?? null
  const confrontaItem = (a: { value: string }, b: { value: string }) => a.value === b.value

  return (
    <>
      <FormField
        control={form.control}
        name={campoProvincia}
        render={() => (
          <FormItem>
            <FormLabel>Provincia</FormLabel>
            <Combobox
              items={itemsProvincia}
              value={valoreProvincia}
              onValueChange={(item) => selezionaProvincia(item?.value ?? null)}
              isItemEqualToValue={confrontaItem}
              disabled={disabled}
            >
              <FormControl>
                <ComboboxInputGroup>
                  <ComboboxInput placeholder="Cerca provincia…" />
                  <ComboboxClear />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
              </FormControl>
              <ComboboxPortal>
                <ComboboxPositioner>
                  <ComboboxPopup>
                    <ComboboxEmpty>Nessuna provincia trovata.</ComboboxEmpty>
                    <ComboboxList>
                      {(item: ItemProvincia) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxPopup>
                </ComboboxPositioner>
              </ComboboxPortal>
            </Combobox>
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
            <Combobox
              items={itemsComune}
              value={valoreComune}
              onValueChange={(item) => selezionaComune(item?.value ?? null)}
              isItemEqualToValue={confrontaItem}
              disabled={disabled || !provinciaSelezionata}
            >
              <FormControl>
                <ComboboxInputGroup>
                  <ComboboxInput
                    placeholder={
                      provinciaSelezionata
                        ? "Cerca comune…"
                        : "Seleziona prima la provincia"
                    }
                  />
                  <ComboboxClear />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
              </FormControl>
              <ComboboxPortal>
                <ComboboxPositioner>
                  <ComboboxPopup>
                    <ComboboxEmpty>Nessun comune trovato.</ComboboxEmpty>
                    <ComboboxList>
                      {(item: ItemComune) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxPopup>
                </ComboboxPositioner>
              </ComboboxPortal>
            </Combobox>
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
