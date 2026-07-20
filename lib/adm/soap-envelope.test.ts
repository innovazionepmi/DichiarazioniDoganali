import { describe, expect, it } from "vitest"
import {
  categorizzaCodice,
  categorizzaErroreConnessione,
  costruisciBustaInvio,
  costruisciBustaRecuperaEsito,
  interpretaCodiceStato,
  interpretaRispostaInvio,
  interpretaRispostaRecuperaEsito,
  numeroRegistrazione,
} from "./soap-envelope"

describe("costruisciBustaInvio", () => {
  it("include serviceId, xml in base64 e dichiarante nel namespace corretto", () => {
    const busta = costruisciBustaInvio("PGZha2Uvpg==", "RSSMRA80A01H501U")
    expect(busta).toContain('<Input xmlns="http://eesemestralim24.domest.sogei.it">')
    expect(busta).toContain("<serviceId>invioEnergiaElettricaSemestrale</serviceId>")
    expect(busta).toContain("<xml>PGZha2Uvpg==</xml>")
    expect(busta).toContain("<dichiarante>RSSMRA80A01H501U</dichiarante>")
  })

  it("fa l'escape dei caratteri speciali XML nel dichiarante", () => {
    const busta = costruisciBustaInvio("AAAA", "A&B<C>")
    expect(busta).toContain("<dichiarante>A&amp;B&lt;C&gt;</dichiarante>")
  })
})

describe("interpretaRispostaInvio", () => {
  it("riconosce una risposta di successo (IUT + esito)", () => {
    const xml = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <Output xmlns="http://ws.sogei.it/output/">
      <IUT>20260714M4000000013</IUT>
      <esito><codice>20</codice><messaggio>Acquisito a sistema</messaggio></esito>
      <dataRegistrazione>2026-07-14</dataRegistrazione>
    </Output>
  </soapenv:Body>
</soapenv:Envelope>`
    const risultato = interpretaRispostaInvio(xml)
    expect(risultato.ok).toBe(true)
    if (risultato.ok) {
      expect(risultato.iut).toBe("20260714M4000000013")
      expect(risultato.esitoCodice).toBe("20")
      expect(risultato.esitoMessaggi).toEqual(["Acquisito a sistema"])
      expect(risultato.dataRegistrazione).toBe("2026-07-14")
    }
  })

  it("categorizza un esito di errore certificato (codice 2)", () => {
    const xml = `<Envelope><Body><Output>
      <IUT>X</IUT>
      <esito><codice>2</codice><messaggio>Certificato non valido</messaggio></esito>
      <dataRegistrazione>2026-07-14</dataRegistrazione>
    </Output></Body></Envelope>`
    const risultato = interpretaRispostaInvio(xml)
    expect(risultato.ok).toBe(false)
    if (!risultato.ok) {
      expect(risultato.categoria).toBe("certificato")
      expect(risultato.messaggio).toContain("Certificato non valido")
    }
  })

  it("include lo IUT anche in un esito negativo, quando presente", () => {
    const xml = `<Envelope><Body><Output>
      <IUT>20260717M24014060308</IUT>
      <esito><codice>16</codice><messaggio>Certificato autenticazione non valido</messaggio></esito>
    </Output></Body></Envelope>`
    const risultato = interpretaRispostaInvio(xml)
    expect(risultato.ok).toBe(false)
    if (!risultato.ok) {
      expect(risultato.categoria).toBe("certificato")
      expect(risultato.iut).toBe("20260717M24014060308")
    }
  })

  it("gestisce più messaggi di esito (array)", () => {
    const xml = `<Envelope><Body><Output>
      <IUT>X</IUT>
      <esito><codice>10</codice><messaggio>Errore 1</messaggio><messaggio>Errore 2</messaggio></esito>
      <dataRegistrazione>2026-07-14</dataRegistrazione>
    </Output></Body></Envelope>`
    const risultato = interpretaRispostaInvio(xml)
    expect(risultato.ok).toBe(false)
    if (!risultato.ok) {
      expect(risultato.categoria).toBe("xml_malformato")
      expect(risultato.messaggio).toBe("Errore 1 — Errore 2")
    }
  })

  it("riconosce un SOAP Fault", () => {
    const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
      <soapenv:Body>
        <soapenv:Fault>
          <faultcode>soapenv:Server</faultcode>
          <faultstring>Errore interno del server</faultstring>
        </soapenv:Fault>
      </soapenv:Body>
    </soapenv:Envelope>`
    const risultato = interpretaRispostaInvio(xml)
    expect(risultato.ok).toBe(false)
    if (!risultato.ok) {
      expect(risultato.categoria).toBe("altro")
      expect(risultato.messaggio).toBe("Errore interno del server")
    }
  })

  it("segnala un XML non valido senza andare in crash", () => {
    const risultato = interpretaRispostaInvio("<non chiuso")
    expect(risultato.ok).toBe(false)
  })

  it("segnala un formato inatteso (nessun Output/Fault)", () => {
    const risultato = interpretaRispostaInvio("<Envelope><Body><Altro/></Body></Envelope>")
    expect(risultato.ok).toBe(false)
    if (!risultato.ok) {
      expect(risultato.categoria).toBe("altro")
    }
  })
})

describe("interpretaCodiceStato", () => {
  it("riconosce un codice di successo", () => {
    const risultato = interpretaCodiceStato("20")
    expect(risultato.ok).toBe(true)
    if (risultato.ok) {
      expect(risultato.descrizione).toContain("Acquisito a sistema")
    }
  })

  it("categorizza un codice di rete/interno (0)", () => {
    const risultato = interpretaCodiceStato("0")
    expect(risultato.ok).toBe(false)
  })

  it("gestisce un corpo con virgolette (risposta JSON-string)", () => {
    const risultato = interpretaCodiceStato('"200"')
    expect(risultato.ok).toBe(true)
  })
})

describe("categorizzaCodice", () => {
  it("ritorna null per i codici di successo/in corso", () => {
    expect(categorizzaCodice("20")).toBeNull()
    expect(categorizzaCodice("50")).toBeNull()
    expect(categorizzaCodice("200")).toBeNull()
  })

  it("categorizza i codici noti", () => {
    expect(categorizzaCodice("1")).toBe("certificato")
    expect(categorizzaCodice("10")).toBe("xml_malformato")
    expect(categorizzaCodice("197")).toBe("esito_negativo")
    expect(categorizzaCodice("9999")).toBe("altro")
  })
})

describe("costruisciBustaRecuperaEsito", () => {
  it("include lo IUT nel namespace corretto (http://service.ws.sogei.it)", () => {
    const busta = costruisciBustaRecuperaEsito("20260101X00000000001")
    expect(busta).toContain('<recuperaEsito xmlns="http://service.ws.sogei.it">')
    expect(busta).toContain("<iut>20260101X00000000001</iut>")
  })
})

// Dati interamente inventati (nessun dato reale del cliente) — struttura
// verificata su un esito reale scaricato da MONET, non i valori.
function bustaRecuperaEsitoFinta(esitoXml: string | null): string {
  const dataBase64 = esitoXml ? Buffer.from(esitoXml, "utf-8").toString("base64") : ""
  return `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <ns:recuperaEsitoResponse xmlns:ns="http://service.ws.sogei.it">
      <recuperaEsitoReturn>
        <IUT>20260101X00000000001</IUT>
        <esito><codice>200</codice><messaggio>Elaborazione OK: completata con esito finale</messaggio></esito>
        ${dataBase64 ? `<data>${dataBase64}</data>` : ""}
        <dataRegistrazione>2026-01-01</dataRegistrazione>
      </recuperaEsitoReturn>
    </ns:recuperaEsitoResponse>
  </soapenv:Body>
</soapenv:Envelope>`
}

const ESITO_XML_FINTO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Esito xmlns="http://rendicontazioni.depositifiscali.monopoli.finanze.it"><Segnalazione><Sezione>PROTOCOLLAZIONE</Sezione><Gravita>INFO</Gravita><Descrizione>ABC12345D 2026 - Semestre 1 - Ufficio TEST001: dichiarazione acquisita</Descrizione><DatoAtteso>Ambito 1</DatoAtteso><DatoInviato>2026/A/9999</DatoInviato><Progressivo>1</Progressivo></Segnalazione><Segnalazione><Sezione>CONVALIDA</Sezione><Gravita>WARNING</Gravita><Descrizione>[00027] Identificativo da 11 caratteri: PARTITA IVA FINTA01 non corretta (quadro G)</Descrizione><DatoAtteso></DatoAtteso><DatoInviato></DatoInviato><Progressivo>2</Progressivo></Segnalazione></Esito>`

describe("interpretaRispostaRecuperaEsito", () => {
  it("estrae IUT, codice, dataRegistrazione e numero di registrazione dal documento ESITO", () => {
    const risultato = interpretaRispostaRecuperaEsito(bustaRecuperaEsitoFinta(ESITO_XML_FINTO))
    expect(risultato.ok).toBe(true)
    if (risultato.ok) {
      expect(risultato.iut).toBe("20260101X00000000001")
      expect(risultato.codice).toBe("200")
      expect(risultato.dataRegistrazione).toBe("2026-01-01")
      expect(risultato.numeroRegistrazione).toBe("2026/A/9999")
      expect(risultato.segnalazioni).toHaveLength(2)
      expect(risultato.segnalazioni[1].gravita).toBe("WARNING")
    }
  })

  it("gestisce l'assenza del campo data (nessun esito ancora disponibile)", () => {
    const risultato = interpretaRispostaRecuperaEsito(bustaRecuperaEsitoFinta(null))
    expect(risultato.ok).toBe(true)
    if (risultato.ok) {
      expect(risultato.numeroRegistrazione).toBeNull()
      expect(risultato.segnalazioni).toEqual([])
    }
  })

  it("segnala un formato inatteso (nessun recuperaEsitoReturn)", () => {
    const risultato = interpretaRispostaRecuperaEsito("<Envelope><Body><Altro/></Body></Envelope>")
    expect(risultato.ok).toBe(false)
  })
})

describe("numeroRegistrazione", () => {
  it("ritorna null se non c'è una segnalazione PROTOCOLLAZIONE", () => {
    expect(
      numeroRegistrazione([
        { sezione: "CONVALIDA", gravita: "WARNING", descrizione: "", datoAtteso: "", datoInviato: "", progressivo: 1 },
      ])
    ).toBeNull()
  })
})

describe("categorizzaErroreConnessione", () => {
  it("categorizza errori TLS come problema di certificato", () => {
    const risultato = categorizzaErroreConnessione({ code: "ERR_OSSL_BAD_DECRYPT", message: "bad decrypt" })
    expect(risultato.categoria).toBe("certificato")
  })

  it("categorizza errori di connessione come problema di rete", () => {
    const risultato = categorizzaErroreConnessione({ code: "ECONNREFUSED", message: "connection refused" })
    expect(risultato.categoria).toBe("rete")
  })

  it("usa 'altro' come fallback per errori non riconosciuti", () => {
    const risultato = categorizzaErroreConnessione(new Error("boh"))
    expect(risultato.categoria).toBe("altro")
  })
})
