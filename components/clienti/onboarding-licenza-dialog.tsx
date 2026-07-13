"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  analizzaLicenzaPdf,
  cercaClientePerCodiceFiscale,
  confermaOnboardingLicenza,
  type ClienteCorrispondente,
} from "@/lib/actions/onboarding"
import {
  clienteOnboardingSchema,
  impiantoOnboardingSchema,
  type ClienteOnboardingInput,
  type ImpiantoOnboardingInput,
} from "@/lib/validation/licenza.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

const CLIENTE_DEFAULT: ClienteOnboardingInput = {
  ragione_sociale: "",
  codice_fiscale: "",
  partita_iva: "",
  codice_licenza: "",
  referente_nome: "",
  referente_cognome: "",
  referente_codice_fiscale: "",
  indirizzo_via: "",
  indirizzo_cap: "",
  indirizzo_citta: "",
  indirizzo_provincia: "",
}

const IMPIANTO_DEFAULT: ImpiantoOnboardingInput = {
  nome_impianto: "",
  tipo_soggetto: "con_licenza",
  tipologia: "fotovoltaico",
  diritto_licenza_dovuto: false,
  diritto_licenza_importo: "",
  indirizzo_via: "",
  indirizzo_cap: "",
  indirizzo_citta: "",
  indirizzo_provincia: "",
  codice_impianto_f24: "",
  protocollo: "",
  data_rilascio: "",
  ufficio_dogane: "",
}

// Estrazione automatica (vision) da un documento scansionato: mai certa al
// 100%, quindi ogni campo resta editabile e la conferma finale è sempre un
// click esplicito di Paolo — nessuna scrittura avviene durante l'analisi.
export function OnboardingLicenzaDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"upload" | "revisione">("upload")
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [avvisi, setAvvisi] = useState<string[]>([])
  const [clienteCorrispondente, setClienteCorrispondente] =
    useState<ClienteCorrispondente>(null)
  const [useEsistente, setUseEsistente] = useState(false)

  const clienteForm = useForm<ClienteOnboardingInput>({
    resolver: zodResolver(clienteOnboardingSchema),
    defaultValues: CLIENTE_DEFAULT,
  })
  const impiantoForm = useForm<ImpiantoOnboardingInput>({
    resolver: zodResolver(impiantoOnboardingSchema),
    defaultValues: IMPIANTO_DEFAULT,
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setStep("upload")
      setFile(null)
      setAvvisi([])
      setClienteCorrispondente(null)
      setUseEsistente(false)
      clienteForm.reset(CLIENTE_DEFAULT)
      impiantoForm.reset(IMPIANTO_DEFAULT)
    }
  }

  function handleAnalizza(formData: FormData) {
    const selezionato = formData.get("file")
    if (!(selezionato instanceof File) || selezionato.size === 0) {
      toast.error("Seleziona un file PDF")
      return
    }

    startTransition(async () => {
      const risultato = await analizzaLicenzaPdf(formData)
      if ("error" in risultato) {
        toast.error(risultato.error)
        return
      }

      const { dati } = risultato
      setFile(selezionato)
      setAvvisi(risultato.avvisi)

      clienteForm.reset({
        ragione_sociale: dati.ragioneSociale ?? "",
        codice_fiscale: dati.codiceFiscaleDitta ?? "",
        partita_iva: dati.partitaIvaDitta ?? "",
        codice_licenza: dati.codiceLicenza ?? "",
        referente_nome: dati.referenteNome ?? "",
        referente_cognome: dati.referenteCognome ?? "",
        referente_codice_fiscale: dati.referenteCodiceFiscale ?? "",
        indirizzo_via: dati.indirizzoDitta?.via ?? "",
        indirizzo_cap: dati.indirizzoDitta?.cap ?? "",
        indirizzo_citta: dati.indirizzoDitta?.citta ?? "",
        indirizzo_provincia: dati.indirizzoDitta?.provincia ?? "",
      })
      impiantoForm.reset({
        nome_impianto: "",
        tipo_soggetto: "con_licenza",
        tipologia: "fotovoltaico",
        diritto_licenza_dovuto: dati.dirittoLicenzaImporto != null,
        diritto_licenza_importo:
          dati.dirittoLicenzaImporto != null ? String(dati.dirittoLicenzaImporto) : "",
        indirizzo_via: dati.indirizzoImpianto?.via ?? dati.indirizzoDitta?.via ?? "",
        indirizzo_cap: dati.indirizzoImpianto?.cap ?? dati.indirizzoDitta?.cap ?? "",
        indirizzo_citta: dati.indirizzoImpianto?.citta ?? dati.indirizzoDitta?.citta ?? "",
        indirizzo_provincia:
          dati.indirizzoImpianto?.provincia ?? dati.indirizzoDitta?.provincia ?? "",
        codice_impianto_f24: dati.codiceImpiantoF24 ?? dati.codiceLicenza ?? "",
        protocollo: dati.protocollo ?? "",
        data_rilascio: dati.dataRilascio ?? "",
        ufficio_dogane: dati.ufficioDogane ?? "",
      })

      const corrispondente = await cercaClientePerCodiceFiscale(
        dati.codiceFiscaleDitta ?? ""
      )
      setClienteCorrispondente(corrispondente)
      setUseEsistente(Boolean(corrispondente))

      setStep("revisione")
    })
  }

  async function handleConferma() {
    if (!file) return
    const impiantoValido = await impiantoForm.trigger()
    const clienteValido = useEsistente || (await clienteForm.trigger())
    if (!impiantoValido || !clienteValido) {
      toast.error("Correggi i campi evidenziati prima di confermare")
      return
    }

    const formData = new FormData()
    formData.set("file", file)
    formData.set(
      "dati",
      JSON.stringify({
        clienteEsistenteId: useEsistente ? clienteCorrispondente?.id ?? "" : "",
        cliente: useEsistente ? undefined : clienteForm.getValues(),
        impianto: impiantoForm.getValues(),
      })
    )

    startTransition(async () => {
      const result = await confermaOnboardingLicenza(formData)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success("Cliente/impianto creato")
      handleOpenChange(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Importa da licenza PDF
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importa cliente/impianto da licenza PDF</DialogTitle>
          </DialogHeader>

          {step === "upload" ? (
            <form action={handleAnalizza} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="file">
                  File PDF della licenza (Agenzia Dogane e Monopoli)
                </Label>
                <Input id="file" name="file" type="file" accept="application/pdf" required />
                <p className="text-xs text-muted-foreground">
                  Vengono analizzate tutte le pagine del documento. Nessun
                  dato viene salvato finché non confermi nel passaggio
                  successivo.
                </p>
              </div>
              <Button type="submit" disabled={pending} className="w-fit">
                {pending ? "Analisi in corso…" : "Analizza"}
              </Button>
            </form>
          ) : (
            <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
              {avvisi.length > 0 && (
                <ul className="list-disc rounded-md border bg-muted/30 p-3 pl-6 text-sm text-muted-foreground">
                  {avvisi.map((avviso) => (
                    <li key={avviso}>{avviso}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="usa-esistente"
                  checked={useEsistente}
                  onCheckedChange={(checked) => setUseEsistente(checked === true)}
                  disabled={!clienteCorrispondente}
                />
                <Label htmlFor="usa-esistente" className="text-sm">
                  {clienteCorrispondente
                    ? `Usa il cliente esistente "${clienteCorrispondente.ragioneSociale}" invece di crearne uno nuovo`
                    : "Nessun cliente esistente trovato con questo codice fiscale — verrà creato un nuovo cliente"}
                </Label>
              </div>

              {!useEsistente && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    Dati cliente (nuovo)
                  </h3>
                  <Form {...clienteForm}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={clienteForm.control}
                        name="ragione_sociale"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>Ragione sociale</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="codice_fiscale"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Codice fiscale</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="partita_iva"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Partita IVA</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="codice_licenza"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Codice licenza (codice ditta)</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="referente_nome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome referente</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="referente_cognome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cognome referente</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="referente_codice_fiscale"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>Codice fiscale referente</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="indirizzo_via"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>Via (con civico)</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="indirizzo_cap"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CAP</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="indirizzo_provincia"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Provincia</FormLabel>
                            <FormControl>
                              <Input placeholder="es. TV" maxLength={4} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clienteForm.control}
                        name="indirizzo_citta"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>Città</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </Form>
                </div>
              )}

              <Separator />

              <div>
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                  Dati impianto
                </h3>
                <Form {...impiantoForm}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={impiantoForm.control}
                      name="nome_impianto"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Nome impianto</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Non presente nel documento: da compilare"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="tipo_soggetto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo soggetto</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="con_licenza">Con licenza</SelectItem>
                              <SelectItem value="con_autorizzazione">
                                Con autorizzazione
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="tipologia"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipologia</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="fotovoltaico">Fotovoltaico</SelectItem>
                              <SelectItem value="eolico">Eolico</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="codice_impianto_f24"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Codice impianto (per F24)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="diritto_licenza_importo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Importo diritto di licenza (€)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="diritto_licenza_dovuto"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-2 self-end">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                            />
                          </FormControl>
                          <FormLabel className="mt-0">Diritto di licenza dovuto</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="indirizzo_via"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Via impianto (con civico)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="indirizzo_cap"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CAP</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="indirizzo_provincia"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provincia</FormLabel>
                          <FormControl>
                            <Input placeholder="es. TV" maxLength={4} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={impiantoForm.control}
                      name="indirizzo_citta"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Città</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Form>
                <p className="mt-3 text-xs text-muted-foreground">
                  Potenza (kW) e registro letture non sono rilevabili dal
                  documento: si compilano dopo, nella scheda impianto.
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("upload")}
                  disabled={pending}
                >
                  Indietro
                </Button>
                <Button onClick={handleConferma} disabled={pending}>
                  {pending ? "Salvataggio…" : "Conferma e crea"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
