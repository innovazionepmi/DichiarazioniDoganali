// Coordinate (in punti PDF, origine in basso a sinistra) misurate sul
// facsimile F24 reale fornito dal cliente, con pdfjs-dist, confrontando
// posizione di ogni valore scritto nel documento. Il modulo ufficiale
// "Mod. F24 Accise" scaricato dal sito dell'Agenzia delle Entrate ha le
// stesse identiche dimensioni pagina (595×842pt, A4) e nessuno dei due ha
// campi AcroForm: queste coordinate sono quindi riusabili per sovrapporre il
// testo sul modulo vuoto. Sono numeri di geometria di un modulo pubblico,
// non dati del cliente — a differenza dei valori reali (mai presenti qui).
//
// Ogni pagina del PDF F24 Accise contiene 3 copie identiche (banca, banca,
// contribuente): le coordinate sono le stesse su tutte e 3 le pagine.

export const F24_COORD = {
  // Sezione "CONTRIBUENTE" (anagrafica: codice fiscale, cognome/nome, data
  // e comune di nascita, domicilio) deliberatamente non compilata — richiesta
  // esplicita di Paolo: non è mai sicuro di chi sia effettivamente la
  // persona tenuta al pagamento, meglio lasciare quella sezione in bianco e
  // farla compilare a mano da chi paga davvero. Le coordinate misurate sono
  // rimaste in `git log` se mai servisse ripristinarle.

  // Sezione Accise/Monopoli: righe verso il basso, passo 12pt. Nell'esempio
  // reale erano visibili 3 righe piene; il modulo ufficiale potrebbe averne
  // di più disponibili più in alto — da verificare visivamente. Per ora
  // definiamo le prime 6 posizioni possibili (3 osservate + 3 stimate con
  // lo stesso passo), il generatore va in "pagina aggiuntiva" oltre queste.
  //
  // `codiceIdentificativo`: colonna larga da x=111.6 a x=198.0 (misurato sui
  // bordi casella del modulo vuoto) — `x` e `maxWidth` tengono il testo
  // dentro il bordo anche per codici lunghi (il generatore riduce il
  // font-size se serve, vedi f24-generator.ts).
  // `importoCommaX`: la colonna "importi a debito versati" ha una virgola
  // pre-stampata sul modulo per guidare l'allineamento dei decimali
  // (misurata a x≈386); il generatore ancora la virgola del valore scritto
  // a questa x invece di allineare a sinistra, così l'allineamento è
  // corretto per qualunque numero di cifre intere.
  accise: {
    primaRigaY: 233,
    passoRiga: 12,
    numeroRigheMassimo: 6,
    ente: 22,
    provincia: [44, 57],
    codiceTributo: 80,
    codiceIdentificativo: { x: 114, maxWidth: 82 },
    anno: 283,
    importoCommaX: 386,
  },

  // Stessa virgola pre-stampata anche per TOTALE O (stessa colonna
  // dell'importo accise, quindi stesso commaX) e per SALDO (O) / SALDO
  // FINALE (colonna più a destra, commaX misurato a x≈556).
  totaleO: { commaX: 386, y: 149 },
  saldoO: { commaX: 556, y: 149 },
  saldoFinale: { commaX: 556, y: 123 },

  dataScadenza: {
    // giorno(2) mese(2) anno(4) = 8 caselle, ESTREMI DEL VERSAMENTO
    xs: [31, 45, 60, 73, 88, 102, 116, 130],
    y: 58,
  },
} as const
