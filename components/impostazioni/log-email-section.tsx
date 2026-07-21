"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { LogEmail } from "@/lib/actions/email-log"

const TIPO_LABEL: Record<string, string> = {
  f24: "F24",
  ricevuta_dichiarazione: "Ricevuta dichiarazione",
  registro_letture_vuoto: "Registro letture (vuoto)",
  altro: "Altro",
}

// Traccia ogni chiamata a inviaEmail (lib/email/client.ts), riuscita o no —
// richiesto dall'utente dopo un invio "registro letture vuoto" risultato
// non arrivato, senza nessuna traccia diagnosticabile da nessuna parte.
// "Inviata" significa solo che il server SMTP l'ha accettata: bounce/spam
// vanno verificati sul pannello del provider (es. Brevo → Statistiche), non
// qui — questo log copre solo il lato nostro della catena.
export function LogEmailSection({ log }: { log: LogEmail[] }) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Log invii email</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Ogni tentativo di invio email (F24, ricevuta dichiarazione, registro
        letture) viene registrato qui con l&apos;esito lato server SMTP.
        &quot;Inviata&quot; significa che il provider (es. Brevo) l&apos;ha
        accettata — se poi non arriva, controlla il pannello del provider per
        bounce o filtri spam su quell&apos;indirizzo.
      </p>

      {log.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun invio registrato finora.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/ora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Oggetto</TableHead>
                <TableHead>Allegati</TableHead>
                <TableHead>Esito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.map((riga) => (
                <TableRow key={riga.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(riga.createdAt).toLocaleString("it-IT")}
                  </TableCell>
                  <TableCell className="text-xs">{TIPO_LABEL[riga.tipo] ?? riga.tipo}</TableCell>
                  <TableCell className="text-xs">{riga.destinatario}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs" title={riga.oggetto}>
                    {riga.oggetto}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {riga.allegati ?? "—"}
                  </TableCell>
                  <TableCell>
                    {riga.esito === "inviata" ? (
                      <Badge variant="success">Inviata</Badge>
                    ) : (
                      <Badge variant="destructive">Errore</Badge>
                    )}
                    {riga.esito === "errore" && riga.messaggioErrore && (
                      <div className="mt-1 max-w-xs text-xs text-destructive">
                        {riga.messaggioErrore}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
