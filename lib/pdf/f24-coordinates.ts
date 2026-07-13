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
  codiceFiscale: {
    // 16 caselle, una per carattere
    xs: [119, 133, 147, 162, 176, 190, 204, 218, 232, 247, 261, 275, 289, 303, 317, 332],
    y: 724,
  },
  cognome: { x: 116, y: 701 },
  nome: { x: 420, y: 701 },
  dataNascita: {
    // giorno(2) mese(2) anno(4) = 8 caselle
    xs: [119, 133, 147, 161, 176, 190, 204, 217],
    y: 674,
  },
  sesso: { x: 247, y: 674 },
  comuneNascita: { x: 275, y: 674 },
  provinciaNascita: { xs: [543, 556], y: 674 },
  domicilioComune: { x: 116, y: 653 },
  domicilioProvincia: { xs: [332, 347], y: 653 },
  domicilioVia: { x: 369, y: 653 },

  // Sezione Accise/Monopoli: righe verso il basso, passo 12pt. Nell'esempio
  // reale erano visibili 3 righe piene; il modulo ufficiale potrebbe averne
  // di più disponibili più in alto — da verificare visivamente. Per ora
  // definiamo le prime 6 posizioni possibili (3 osservate + 3 stimate con
  // lo stesso passo), il generatore va in "pagina aggiuntiva" oltre queste.
  accise: {
    primaRigaY: 233,
    passoRiga: 12,
    numeroRigheMassimo: 6,
    ente: 22,
    provincia: [44, 57],
    codiceTributo: 80,
    codiceIdentificativo: 129,
    anno: 283,
    importo: 373,
  },

  totaleO: { x: 373, y: 149 },
  saldoO: { x: 546, y: 149 },
  saldoFinale: { x: 546, y: 123 },

  dataScadenza: {
    // giorno(2) mese(2) anno(4) = 8 caselle, ESTREMI DEL VERSAMENTO
    xs: [31, 45, 60, 73, 88, 102, 116, 130],
    y: 58,
  },
} as const
