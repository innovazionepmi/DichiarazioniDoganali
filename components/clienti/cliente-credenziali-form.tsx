"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { setCredenzialeCliente } from "@/lib/actions/clienti-credenziali"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Form separato dall'anagrafica principale: le password non transitano mai
// per updateCliente(). Ogni submit passa da setCredenzialeCliente, che scrive
// la password in Supabase Vault tramite RPC service-role.
function CredenzialeCard({
  clienteId,
  campo,
  titolo,
  username,
}: {
  clienteId: string
  campo: "edistribuzione" | "gse"
  titolo: string
  username: string | null
}) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    formData.set("campo", campo)
    startTransition(async () => {
      const result = await setCredenzialeCliente(clienteId, formData)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Credenziali aggiornate")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titolo}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${campo}-username`}>Utente</Label>
            <Input
              id={`${campo}-username`}
              name="username"
              defaultValue={username ?? ""}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${campo}-password`}>Password</Label>
            <Input
              id={`${campo}-password`}
              name="password"
              type="password"
              placeholder={username ? "••••••••" : ""}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Cifrata in Supabase Vault. Obbligatoria ad ogni salvataggio
              (utente e password vengono sempre aggiornati insieme).
            </p>
          </div>
          <Button type="submit" disabled={pending} size="sm" className="w-fit">
            {pending ? "Salvataggio…" : "Salva credenziali"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function ClienteCredenzialiForm({
  clienteId,
  edistribuzioneUser,
  gseUser,
}: {
  clienteId: string
  edistribuzioneUser: string | null
  gseUser: string | null
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CredenzialeCard
        clienteId={clienteId}
        campo="edistribuzione"
        titolo="Credenziali E-distribuzione"
        username={edistribuzioneUser}
      />
      <CredenzialeCard
        clienteId={clienteId}
        campo="gse"
        titolo="Credenziali GSE"
        username={gseUser}
      />
    </div>
  )
}
