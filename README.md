# Dichiarazione energia dogane

App per la gestione degli adempimenti fiscali/amministrativi degli impianti
fotovoltaici (anagrafiche, letture, dichiarazioni doganali, comunicazioni,
tracking). Vedi [`CLAUDE.md`](./CLAUDE.md) per lo standard di governance e
workflow Git del progetto.

Stato attuale: **Fase 1** (fondamenta) — schema DB completo e CRUD delle
anagrafiche (clienti, partner, impianti, contatori, relazione produzione↔
immissione). I moduli di letture/dichiarazioni/comunicazioni non sono ancora
implementati.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui (stile `base-nova`, primitive Base UI)
- react-hook-form + zod
- Supabase (Postgres + Row Level Security + Supabase Auth + Vault)

## Setup locale

1. Installa le dipendenze:
   ```bash
   npm install
   ```
2. Crea un progetto Supabase (dashboard supabase.com, regione EU) e copia
   `.env.example` in `.env.local`, valorizzando:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (mai esporre lato client)
3. Collega il progetto locale a quello Supabase e applica le migration:
   ```bash
   npx supabase login
   npm run db:link       # chiede il project ref (Project Settings > General)
   npm run db:push       # applica supabase/migrations/ al progetto remoto
   ```
4. (Opzionale) genera i tipi TypeScript dal DB dopo ogni modifica di schema:
   ```bash
   npm run types:generate
   ```
5. Crea un utente in Supabase Auth (Dashboard > Authentication > Users, oppure
   `supabase auth`) — il signup pubblico è disattivato, gli utenti (Paolo e
   eventuali collaboratori) vanno creati manualmente.
6. Avvia il dev server:
   ```bash
   npm run dev
   ```
   e apri [http://localhost:3000](http://localhost:3000) (reindirizza a `/login`).

## Note operative importanti

- **Credenziali portali (E-distribuzione, GSE)**: cifrate in Supabase Vault,
  mai in chiaro. I secret non sono portabili tra ambienti diversi (dev/
  staging/prod hanno root key pgsodium distinte): vanno reinseriti
  manualmente in ciascun ambiente tramite l'app, mai via seed SQL.
- **Cancellazioni**: tutti i bottoni "Archivia" impostano un flag `attivo`
  (soft-delete). Non c'è DELETE fisico esposto in UI, per i probabili
  obblighi di conservazione dei dati fiscali.
- **`attributi_extra`** (colonna JSONB su `impianti`): riservata per
  attributi impianto futuri non ancora previsti a schema, così da evitare
  migrazioni distruttive. Nessuna UI dedicata in Fase 1.

## Comandi Supabase utili

```bash
npm run db:start          # stack Supabase locale (Docker)
npm run db:reset          # riapplica tutte le migration da zero (locale)
npm run db:migration:new -- <nome>   # crea una nuova migration con timestamp
npm run db:push           # applica le migration al progetto collegato
```

## Deploy

Vedi `CLAUDE.md` per branching (`main`/`staging`) e workflow di deploy su
Vercel.
