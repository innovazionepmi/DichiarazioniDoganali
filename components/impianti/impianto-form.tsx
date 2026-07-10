"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { impiantoSchema, type ImpiantoInput } from "@/lib/validation/impianto.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

const TIPO_SOGGETTO_LABEL: Record<string, string> = {
  con_licenza: "Con licenza",
  con_autorizzazione: "Con autorizzazione",
}

const TIPOLOGIA_LABEL: Record<string, string> = {
  fotovoltaico: "Fotovoltaico",
  eolico: "Eolico",
}

export function ImpiantoForm({
  defaultValues,
  clienteOptions,
  onSubmit,
}: {
  defaultValues?: Partial<ImpiantoInput>
  clienteOptions: { id: string; ragione_sociale: string }[]
  onSubmit: (formData: FormData) => Promise<{ error?: string } | void>
}) {
  const [pending, startTransition] = useTransition()
  const form = useForm<ImpiantoInput>({
    resolver: zodResolver(impiantoSchema),
    defaultValues: {
      cliente_id: "",
      nome_impianto: "",
      tipo_soggetto: "con_licenza",
      tipologia: "fotovoltaico",
      diritto_licenza_dovuto: false,
      diritto_licenza_importo: "",
      ha_registro_letture: false,
      indirizzo_via: "",
      indirizzo_cap: "",
      indirizzo_citta: "",
      indirizzo_provincia: "",
      potenza_kw: "",
      codice_distributore_zona: "",
      codice_catastale_comune: "",
      ufficio_amministrativo: "",
      codice_impianto_f24: "",
      note: "",
      ...defaultValues,
    },
  })

  function handleSubmit(values: ImpiantoInput) {
    const formData = new FormData()
    Object.entries(values).forEach(([key, value]) => {
      if (typeof value === "boolean") {
        formData.set(key, value ? "true" : "false")
      } else {
        formData.set(key, value ?? "")
      }
    })

    startTransition(async () => {
      const result = await onSubmit(formData)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Salvato")
      }
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-3xl gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="cliente_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cliente</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleziona cliente" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {clienteOptions.map((cliente) => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.ragione_sociale}
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
            name="nome_impianto"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome impianto</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
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
                    {Object.entries(TIPO_SOGGETTO_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
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
                    {Object.entries(TIPOLOGIA_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
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
            name="potenza_kw"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Potenza (kW)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <FormField
            control={form.control}
            name="indirizzo_via"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Via impianto (con numero civico)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
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
            control={form.control}
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
            control={form.control}
            name="indirizzo_citta"
            render={({ field }) => (
              <FormItem className="sm:col-span-3">
                <FormLabel>Città impianto</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="diritto_licenza_dovuto"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">
                  Diritto di licenza dovuto
                </FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ha_registro_letture"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">
                  Tiene registro letture
                </FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="diritto_licenza_importo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Importo diritto di licenza (€)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" placeholder="23.24 / 77.47" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="codice_distributore_zona"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Codice distributore di zona</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="codice_catastale_comune"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Codice catastale comune</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ufficio_amministrativo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ufficio amministrativo</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="codice_impianto_f24"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Codice identificativo F24</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </form>
    </Form>
  )
}
