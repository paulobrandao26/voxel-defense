-- Recompensa por voto no TopIdle (https://topidle.com/integracao.html)
-- O aviso de voto chega em /api/topidle-voto (Vercel), que repassa o corpo cru para topidle_voto().
-- A assinatura é conferida aqui no banco, com o segredo guardado numa tabela que ninguém lê pela API.
-- Prêmio: cada voto dá VOTO_OURO de ouro no começo da próxima partida (jogadores.bonus_ouro).

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.topidle_cfg (id int primary key default 1 check (id = 1), segredo text not null);
alter table public.topidle_cfg enable row level security;   -- sem regras: ninguém lê nem grava pela API

create table if not exists public.votos (
  event_id text primary key,
  jogador uuid not null references public.jogadores(id) on delete cascade,
  votado_em timestamptz,
  recebido_em timestamptz not null default now()
);
alter table public.votos enable row level security;
drop policy if exists "ver votos" on public.votos;
create policy "ver votos" on public.votos for select using (jogador = auth.uid() or public.is_admin());

alter table public.jogadores add column if not exists bonus_ouro int not null default 0;
alter table public.jogadores add column if not exists votos int not null default 0;

-- O jogador só pode mudar estas colunas da própria linha (não dá para se dar ouro de voto).
revoke update on public.jogadores from authenticated, anon;
grant update (ultimo_acesso, melhor_onda) on public.jogadores to authenticated;

-- Recebe o aviso do TopIdle. Devolve { status, error } e a rota da Vercel responde com esse status.
create or replace function public.topidle_voto(corpo text, ts text, assinatura text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  VOTO_OURO constant int := 300;
  seg text; esperada text; ev json; jid uuid; eid text;
begin
  select segredo into seg from topidle_cfg where id = 1;
  if seg is null then return json_build_object('status', 503, 'error', 'segredo não configurado'); end if;
  if ts is null or ts !~ '^\d{1,12}$' or abs(extract(epoch from now()) - ts::bigint) > 300 then
    return json_build_object('status', 400, 'error', 'timestamp ausente ou velho demais');
  end if;
  esperada := 'sha256=' || encode(hmac(convert_to(ts || '.' || corpo, 'UTF8'), convert_to(seg, 'UTF8'), 'sha256'), 'hex');
  if assinatura is null or assinatura <> esperada then return json_build_object('status', 401, 'error', 'assinatura inválida'); end if;
  begin ev := corpo::json; exception when others then return json_build_object('status', 400, 'error', 'json inválido'); end;
  if ev->>'type' = 'vote.test' then return json_build_object('status', 200); end if;
  if ev->>'type' is distinct from 'vote.created' then return json_build_object('status', 422, 'error', 'tipo desconhecido'); end if;
  eid := ev->>'eventId';
  if eid is null or length(eid) > 64 then return json_build_object('status', 400, 'error', 'eventId inválido'); end if;
  if exists (select 1 from votos where event_id = eid) then return json_build_object('status', 409, 'error', 'já entregue'); end if;
  select id into jid from jogadores where lower(nick) = lower(trim(ev->>'playerIdentifier')) limit 1;
  if jid is null then return json_build_object('status', 404, 'error', 'nickname não encontrado'); end if;   -- sem gravar o eventId
  insert into votos (event_id, jogador, votado_em) values (eid, jid, (ev->>'votedAt')::timestamptz);
  update jogadores set bonus_ouro = bonus_ouro + VOTO_OURO, votos = votos + 1 where id = jid;
  return json_build_object('status', 200);
exception when unique_violation then
  return json_build_object('status', 409, 'error', 'já entregue');
end $$;
revoke all on function public.topidle_voto(text, text, text) from public;
grant execute on function public.topidle_voto(text, text, text) to anon, authenticated;

-- O jogo pega o ouro dos votos ao começar uma partida (e zera).
create or replace function public.resgatar_bonus()
returns int language plpgsql security definer set search_path = public as $$
declare b int;
begin
  select bonus_ouro into b from jogadores where id = auth.uid() for update;
  if coalesce(b, 0) > 0 then update jogadores set bonus_ouro = 0 where id = auth.uid(); end if;
  return coalesce(b, 0);
end $$;
revoke all on function public.resgatar_bonus() from public;
grant execute on function public.resgatar_bonus() to authenticated;

-- Guarda o segredo do webhook uma vez só (a primeira chamada vence). Depois de usar, esta função é apagada.
create or replace function public.definir_segredo_topidle(s text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from topidle_cfg) or s is null or length(s) < 16 then return false; end if;
  insert into topidle_cfg (id, segredo) values (1, s);
  return true;
end $$;
revoke all on function public.definir_segredo_topidle(text) from public;
grant execute on function public.definir_segredo_topidle(text) to anon;
-- depois:  drop function public.definir_segredo_topidle(text);
