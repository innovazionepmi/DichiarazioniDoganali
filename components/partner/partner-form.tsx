"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { partnerSchema, type PartnerInput } from "@/lib/validation/partner.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

// Template CRUD di riferimento: lo stesso pattern (react-hook-form + zod +
// server action passata come prop `onSubmit`) va replicato per clienti,
// impianti e contatori.
export function PartnerForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<PartnerInput>
  onSubmit: (formData: FormData) => Promise<{ error?: string } | void>
}) {
  const [pending, startTransition] = useTransition()
  const form = useForm<PartnerInput>({
    resolver: zodResolver(partnerSchema),
    defaultValues: { ragione_sociale: "", note: "", ...defaultValues },
  })

  function handleSubmit(values: PartnerInput) {
    const formData = new FormData()
    formData.set("ragione_sociale", values.ragione_sociale)
    formData.set("note", values.note ?? "")

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
        className="grid max-w-xl gap-4"
      >
        <FormField
          control={form.control}
          name="ragione_sociale"
          render={({ field }) => (
            <FormItem>
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
