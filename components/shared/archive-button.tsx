"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

// Bottone "Archivia/Ripristina" riusato da tutte le liste anagrafiche.
// Non esegue mai un DELETE reale: imposta solo il flag `attivo`.
export function ArchiveButton({
  attivo,
  onToggle,
}: {
  attivo: boolean
  onToggle: (nextAttivo: boolean) => Promise<{ error?: string } | void>
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    const next = !attivo
    const confirmMessage = next
      ? "Ripristinare questo elemento nelle liste attive?"
      : "Archiviare questo elemento? Non verrà più mostrato nelle liste attive, ma i dati restano conservati."

    if (!window.confirm(confirmMessage)) return

    startTransition(async () => {
      const result = await onToggle(next)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(next ? "Ripristinato" : "Archiviato")
        router.refresh()
      }
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleClick}
    >
      {attivo ? "Archivia" : "Ripristina"}
    </Button>
  )
}
