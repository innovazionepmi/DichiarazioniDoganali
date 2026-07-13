# Project status — Dichiarazione energia dogane

Ultimo aggiornamento: sessione Fase 2 (parte 1). Scritto per riprendere il
lavoro in una sessione futura senza dover rileggere tutta la conversazione.

## Cos'è questo progetto

App per Paolo Rinaldin (cliente: Jule Tech / tramite Emilio Zucca Web
Strategies) per gestire gli adempimenti fiscali di ~86 impianti fotovoltaici:
anagrafiche, letture, dichiarazioni doganali (Quadri A/G/L), F24, email
automatiche, tracking. Il brief funzionale completo è stato fornito in chat
il 10/07/2026 (riunione cliente del 02/07/2026) — se serve consultarlo di
nuovo, chiedilo all'utente o cerca nella cronologia della conversazione, non
è salvato come file nel repo.

Governance/workflow Git (branch `main`/`staging`, naming commit, ecc.):
[`CLAUDE.md`](./CLAUDE.md).

## Infrastruttura (attiva)

- **Repo GitHub**: `innovazionepmi/DichiarazioniDoganali`, branch `staging` collegato e pushato.
  Branch `main` **non ha ancora nessun commit** — verrà creato al primo merge da `staging`, dopo validazione esplicita dell'utente (vedi CLAUDE.md).
- **Vercel**: deploy attivo su `dichiarazioni-doganali.vercel.app` (branch `staging`). Env vars configurate su Vercel (Supabase URL/anon/service-role). `VERCEL_ENV` NON va mai impostata manualmente (è automatica).
- **Supabase**: progetto creato e collegato, migration applicate manualmente dall'utente via SQL Editor (non tramite `supabase db push` — l'ambiente Claude Code non ha login CLI Supabase). **Le migration di Fase 2 (`20260714090003`→`20260714090006`) non risultano ancora applicate** — vedi "Prossimi passi".
- **Materiali cliente reali**: ricevuti e letti (cartella locale `File-reali-esempio`, OneDrive di Emilio) — PDF E-distribuzione, licenza, F24 facsimile, dichiarazione doganale esempio, esito protocollo TXT, Excel storico calcoli. **Non copiare mai dati/nomi reali del cliente finale in file committati** (vedi "Bug importanti" più sotto — è già successo una volta con i test).

## Cosa è stato costruito — Fase 1 (completa)

Schema DB (`supabase/migrations/`, in ordine):
- `partner`, `clienti`, `impianti`, `contatori`, `contatori_relazioni` (M:N produzione↔immissione con trigger di integrità)
- Credenziali portali (E-distribuzione, GSE) cifrate in Supabase Vault — mai testo in chiaro (`set_cliente_credential`/`get_cliente_credential`, RPC service-role only)
- RLS: qualunque utente autenticato ha accesso pieno (nessuna segmentazione per ruolo ancora)
- Soft-delete ovunque (`attivo boolean`), nessun DELETE fisico esposto in UI
- `impianti.attributi_extra` (jsonb): cassetto per attributi futuri senza migrazioni distruttive
- Indirizzo **strutturato** (via/CAP/città/provincia) sia su `clienti` che su `impianti`

App Next.js 16 (App Router) + Supabase Auth + shadcn/ui (stile `base-nova`,
primitive **Base UI**, non Radix — attenzione alle differenze API):
- Login/logout, route protette da `proxy.ts` (ex `middleware.ts`, rinominato per Next.js 16)
- CRUD completo: Partner, Clienti (+ form credenziali separato via Vault), Impianti, Contatori + gestione relazioni produzione/immissione dentro il dettaglio impianto
- Liste con filtro per ditta committente/partner (`components/shared/partner-filter.tsx`), ricerca testuale, tabelle `@tanstack/react-table`
- Pattern CRUD di riferimento: `lib/actions/partner.ts` + `components/partner/partner-form.tsx` (replicato per le altre entità)

## Cosa è stato costruito — Fase 2, parte 1 (completa)

Dopo aver ricevuto ed esaminato i materiali reali del cliente:

- **Schema esteso**: `contatori.lettura_iniziale` (baseline per onboarding contatori già in uso), campi `clienti.referente_*` per F24 (cognome, codice fiscale personale, sesso, comune/prov. nascita, domicilio fiscale via/CAP/città/prov — dati richiesti dal facsimile F24 reale ma assenti dal brief originale), tabella `documenti` (+ bucket Storage privato `documenti`), tabella `letture` (F1/F2/F3, `valore_periodo` generato, unique per contatore+mese+anno)
- **Motore di calcolo** (`lib/calc/registro.ts`): lettura progressiva di registro (÷K), autoconsumo mensile (produzione−immissione), riconciliazione, alert ordine di grandezza — validato con test (`lib/calc/registro.test.ts`, `npm run test`) contro numeri reali del cliente (fonte anonimizzata nei commenti)
- **Nuova sezione "Letture"** (`/letture`): lista impianti → tabella editabile stile Excel (mesi × contatori × F1/F2/F3) con salvataggio bulk (`lib/actions/letture.ts`) e alert non bloccanti (autoconsumo negativo, riconciliazione, ordine di grandezza)

**Deliberatamente rimandato al prossimo incremento** (non ancora costruito):
- Parser PDF E-distribuzione (ho verificato che il PDF ha un layer di testo pulito: consigliato un parser deterministico testo+regex invece di Claude vision/OCR — più veloce, gratis, affidabile per questo formato)
- Import screenshot (serve Claude vision/OCR, lo screenshot non ha testo)
- Alert sostituzione contatore (dipende dal parser)
- Import CSV (esplicitamente rimandato dal brief)
- Onboarding cliente da licenza PDF, generazione F24/registro PDF, XML Dogane, tracking — Fase 3/4/5 del brief, non ancora iniziate
- **Punto aperto**: il PDF E-distribuzione riporta sia "immessa" che "prelevata" per lo stesso contatore/POD; l'ipotesi è che "prelevata" sia fuori scope (rilevante solo per GSE/fatturazione, non per la dichiarazione doganale) — da confermare quando si costruisce il parser
- **Punto aperto**: regola "autoconsumo >70% → nessuna accisa dovuta" vista nell'Excel storico del cliente, non nel brief — rimandata su richiesta esplicita dell'utente, da chiarire prima di Fase 4 (dichiarazione)

## Bug importanti risolti in questa sessione (da ricordare)

1. **Closure non serializzabile Server→Client**: passare `onSubmit={(formData) => updateX(id, formData)}` da una pagina Server Component a un form Client Component causava un crash in produzione (build locale non lo intercetta, solo runtime). Fix: usare sempre `updateX.bind(null, id)`. **Se aggiungi nuove pagine di dettaglio, usa questo pattern fin da subito.**
2. `create-next-app` aveva sovrascritto `CLAUDE.md` di root durante lo scaffold iniziale — ripristinato.
3. Next.js 16 rinomina `middleware.ts`→`proxy.ts` e la funzione `middleware()`→`proxy()`.
4. Lo stile shadcn `base-nova` (Base UI) non ha il componente `form` nel registry ufficiale (files vuoti) — `components/ui/form.tsx` è stato scritto a mano adattando la versione Radix (usa `@radix-ui/react-slot` solo per questo file).
5. Base UI `Button` con `render={<Link ... />}` richiede `nativeButton={false}` altrimenti warning in console.
6. `VERCEL_ENV` non va mai in `.env.example`/Project Settings: Vercel la rifiuta, è automatica.
7. **Non committare mai dati reali del cliente finale nei file sorgente** (nomi ditta, matricole, cifre di produzione) — è successo scrivendo i test del motore di calcolo con le fixture prese di peso dai documenti reali del cliente (nome ditta incluso nei commenti); bloccato dal classificatore prima del commit, sistemato anonimizzando i commenti mantenendo solo i numeri. I numeri "nudi" nei test vanno bene, i riferimenti a nomi/ditte reali no.

## Prossimi passi immediati (da fare tu)

1. **Applica le migration di Fase 2** via SQL Editor Supabase (`20260714090003` → `20260714090006`, in ordine — aggiungono `lettura_iniziale`, i campi referente F24, `documenti`+bucket Storage, `letture`). Senza queste la sezione Letture mostra "nessun contatore" anche quando i contatori esistono (fallback silenzioso, non crash — ma dati non visibili finché non applichi).
2. Testa il flusso end-to-end in staging: apri un impianto con contatori produzione+immissione collegati → vai su Letture → inserisci F1/F2/F3 per un paio di mesi → verifica che l'autoconsumo mensile calcolato sia corretto e gli alert compaiano/scompaiano come atteso.
3. Verifica che i nuovi campi referente (per F24) compaiano nel form cliente e si salvino.
4. (Opzionale) elimina l'utente di test `claude-test@example.com` da Supabase Auth Dashboard.
5. Quando tutto funziona: dammi conferma esplicita e ti guido nel merge `staging` → `main` (primo deploy di produzione) — oppure procediamo con il prossimo incremento (parser PDF E-distribuzione) prima del merge, a tua scelta.

## File utili per orientarsi

- Schema: `supabase/migrations/` (leggere in ordine di timestamp)
- Pattern CRUD di riferimento: `lib/actions/partner.ts`, `components/partner/partner-form.tsx`
- Vault/credenziali: `lib/actions/clienti-credenziali.ts`, `lib/supabase/service-role.ts`
- Auth: `lib/actions/auth.ts`, `proxy.ts`, `lib/supabase/middleware.ts`
- Motore di calcolo: `lib/calc/registro.ts` (+ `registro.test.ts`, `npm run test`)
- Sezione Letture: `app/(app)/letture/`, `components/letture/`, `lib/actions/letture.ts`
- Setup locale: [`README.md`](./README.md)
