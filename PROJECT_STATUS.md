# Project status — Dichiarazione energia dogane

Ultimo aggiornamento: 2026-07-14. Scritto per riprendere il lavoro in una
sessione futura senza dover rileggere tutta la conversazione.

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
- **Supabase**: progetto creato e collegato, migration applicate manualmente dall'utente via SQL Editor (non tramite `supabase db push` — l'ambiente Claude Code non ha login CLI Supabase).

## Cosa è stato costruito — Fase 1 (completa)

Schema DB (`supabase/migrations/`, in ordine):
- `partner`, `clienti`, `impianti`, `contatori`, `contatori_relazioni` (M:N produzione↔immissione con trigger di integrità)
- Credenziali portali (E-distribuzione, GSE) cifrate in Supabase Vault — mai testo in chiaro (`set_cliente_credential`/`get_cliente_credential`, RPC service-role only)
- RLS: qualunque utente autenticato ha accesso pieno (nessuna segmentazione per ruolo ancora)
- Soft-delete ovunque (`attivo boolean`), nessun DELETE fisico esposto in UI
- `impianti.attributi_extra` (jsonb): cassetto per attributi futuri senza migrazioni distruttive
- Indirizzo **strutturato** (via/CAP/città/provincia) sia su `clienti` che su `impianti` (migration `20260714090001` e `20260714090002` — sostituiscono il vecchio campo unico `indirizzo`)

App Next.js 16 (App Router) + Supabase Auth + shadcn/ui (stile `base-nova`,
primitive **Base UI**, non Radix — attenzione alle differenze API, vedi
sezione "Insidie" sotto):
- Login/logout, route protette da `proxy.ts` (ex `middleware.ts`, rinominato per Next.js 16)
- CRUD completo: Partner, Clienti (+ form credenziali separato via Vault), Impianti, Contatori + gestione relazioni produzione/immissione dentro il dettaglio impianto
- Liste con filtro per ditta committente/partner (`components/shared/partner-filter.tsx`), ricerca testuale, tabelle `@tanstack/react-table`
- Pattern CRUD di riferimento: `lib/actions/partner.ts` + `components/partner/partner-form.tsx` (replicato per le altre entità)

## Bug importanti risolti in questa sessione (da ricordare)

1. **Closure non serializzabile Server→Client**: passare `onSubmit={(formData) => updateX(id, formData)}` da una pagina Server Component a un form Client Component causava un crash in produzione (build locale non lo intercetta, solo runtime). Fix: usare sempre `updateX.bind(null, id)`. **Se aggiungi nuove pagine di dettaglio, usa questo pattern fin da subito.**
2. `create-next-app` aveva sovrascritto `CLAUDE.md` di root durante lo scaffold iniziale — ripristinato.
3. Next.js 16 rinomina `middleware.ts`→`proxy.ts` e la funzione `middleware()`→`proxy()`.
4. Lo stile shadcn `base-nova` (Base UI) non ha il componente `form` nel registry ufficiale (files vuoti) — `components/ui/form.tsx` è stato scritto a mano adattando la versione Radix (usa `@radix-ui/react-slot` solo per questo file).
5. Base UI `Button` con `render={<Link ... />}` richiede `nativeButton={false}` altrimenti warning in console.
6. `VERCEL_ENV` non va mai in `.env.example`/Project Settings: Vercel la rifiuta, è automatica.

## Prossimi passi immediati (da fare tu)

1. Conferma di aver applicato **entrambe** le migration indirizzo via SQL Editor Supabase (clienti + impianti) — vedi messaggi precedenti per l'SQL esatto, oppure semplicemente applica tutti i file in `supabase/migrations/` che non hai ancora eseguito, in ordine di timestamp.
2. Testa il flusso end-to-end in staging: crea partner → cliente (con indirizzo strutturato) → impianto (con indirizzo strutturato) → 2 contatori (produzione+immissione) → collega la relazione → verifica che l'archiviazione di un cliente con impianti attivi sia bloccata (RESTRICT).
3. (Opzionale) elimina l'utente di test `claude-test@example.com` da Supabase Auth Dashboard.
4. Quando tutto funziona: dammi conferma esplicita e ti guido nel merge `staging` → `main` (primo deploy di produzione).

## Cosa NON è ancora stato costruito (Fase 2+)

Volutamente fuori scope finora, in attesa di conferma esplicita dell'utente prima di partire:

- **Import Excel esistenti + onboarding cliente da licenza PDF** — servono i file reali dal cliente (brief §8), non ancora ricevuti
- **Raccolta letture**: parsing PDF stampa pagina E-distribuzione, screenshot, tabella letture editabile
- **Motore calcoli K** (divisione per registro, moltiplicazione per dichiarazione — logica controintuitiva, vedi brief §4.1)
- **Validazioni/alert**: sostituzione contatore, ordini di grandezza, autoconsumo negativo
- **F24 diritto di licenza** (generazione + invio con conferma manuale)
- **Registro letture PDF** (generazione + invio email inizio anno)
- **Email protocollo + tabellina letture** dopo upload TXT/PDF ricezione Dogane
- **Generatore XML Dogane** (Quadri A/G/L)
- **Dashboard tracking dichiarazioni/fatturazione**

### Materiali ancora da ricevere dal cliente (brief §8)

Facsimile F24, template registro cartaceo (Word/Excel), PDF stampa pagina
E-distribuzione di esempio, esempio dichiarazione doganale PDF, Excel con i
calcoli attuali di Paolo, licenza PDF di esempio.

## File utili per orientarsi

- Schema: `supabase/migrations/` (leggere in ordine di timestamp)
- Pattern CRUD di riferimento: `lib/actions/partner.ts`, `components/partner/partner-form.tsx`
- Vault/credenziali: `lib/actions/clienti-credenziali.ts`, `lib/supabase/service-role.ts`
- Auth: `lib/actions/auth.ts`, `proxy.ts`, `lib/supabase/middleware.ts`
- Setup locale: [`README.md`](./README.md)
