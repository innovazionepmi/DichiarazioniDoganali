"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  contatoreSchema,
  type ContatoreInput,
} from "@/lib/validation/contatore.schema"
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

export function ContatoreForm({
  defaultValues,
  onSubmit,
  onSuccess,
}: {
  defaultValues?: Partial<ContatoreInput>
  onSubmit: (formData: FormData) => Promise<{ error?: string } | void>
  onSuccess?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const form = useForm<ContatoreInput>({
    resolver: zodResolver(contatoreSchema),
    defaultValues: {
      matricola: "",
      pod: "",
      tipo: "produzione",
      costante_k: "",
      data_attivazione: "",
      data_cessazione: "",
      modello: "",
      note: "",
      ...defaultValues,
    },
  })

  function handleSubmit(values: ContatoreInput) {
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
        onSuccess?.()
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="pod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>POD</FormLabel>
                <FormControl>
                  <Input placeholder="IT001E… / IT001P…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="matricola"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Matricola</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="produzione">Produzione</SelectItem>
                    <SelectItem value="immissione">Immissione</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="costante_k"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Costante K</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="data_attivazione"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data attivazione</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="data_cessazione"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data cessazione</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="modello"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modello</FormLabel>
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
                <Textarea rows={3} {...field} />
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
