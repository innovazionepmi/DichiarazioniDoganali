-- L'elenco province per la tendina va letto qui, non derivato lato
-- applicazione dalle 7904 righe di `comuni`: quella query supera il limite
-- di default di Supabase/PostgREST (1000 righe per risposta), troncando
-- l'elenco a metà (bug osservato: la tendina si fermava a "Bergamo",
-- ordinata alfabeticamente, e non trovava le province successive tipo
-- "Oristano"). Una vista con solo le 107 righe distinte resta sempre sotto
-- quel limite.
create view province as
  select distinct provincia_sigla, provincia_nome
  from comuni
  order by provincia_nome;

grant select on province to authenticated;
