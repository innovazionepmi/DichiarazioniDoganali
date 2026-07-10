"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { clienteSchema, type ClienteInput } from "@/lib/validation/cliente.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

const NESSUN_PARTNER = "__nessun_partner__"

export function ClienteForm({
  defaultValues,
  partnerOptions,
  onSubmit,
}: {
  defaultValues?: Partial<ClienteInput>
  partnerOptions: { id: string; ragione_sociale: string }[]
  onSubmit: (formData: FormData) => Promise<{ error?: string } | void>
}) {
  const [pending, startTransition] = useTransition()
  const form = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      ragione_sociale: "",
      codice_fiscale: "",
      partita_iva: "",
      codice_licenza: "",
      referente_nome: "",
      referente_telefono: "",
      referente_email: "",
      referente_data_nascita: "",
      indirizzo: "",
      partner_id: "",
      note: "",
      ...defaultValues,
    },
  })

  function handleSubmit(values: ClienteInput) {
    const formData = new FormData()
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value ?? "")
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
            control={form.control}
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
            control={form.control}
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
            control={form.control}
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
            control={form.control}
            name="partner_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ditta committente (subappalto)</FormLabel>
                <Select
                  value={field.value || NESSUN_PARTNER}
                  onValueChange={(value) =>
                    field.onChange(value === NESSUN_PARTNER ? "" : value)
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Diretto (nessun partner)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NESSUN_PARTNER}>
                      Diretto (nessun partner)
                    </SelectItem>
                    {partnerOptions.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.ragione_sociale}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
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
            control={form.control}
            name="referente_data_nascita"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data di nascita referente</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="referente_telefono"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefono referente</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="referente_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email referente</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="indirizzo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Indirizzo cliente</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
