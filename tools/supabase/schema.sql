-- Brand Defense: contas de jogadores (Supabase). Rodar no SQL Editor do projeto.
create table if not exists public.jogadores (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text unique not null check (char_length(nick) between 3 and 20),
  nome text not null,
  nascimento date not null,
  email text not null,
  origem text,
  termos_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz,
  melhor_onda int not null default 0
);
create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.jogadores enable row level security;
alter table public.admins enable row level security;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
drop policy if exists "ver proprio ou admin" on public.jogadores;
create policy "ver proprio ou admin" on public.jogadores for select using (auth.uid() = id or public.is_admin());
drop policy if exists "atualizar proprio" on public.jogadores;
create policy "atualizar proprio" on public.jogadores for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "admin ve admins" on public.admins;
create policy "admin ve admins" on public.admins for select using (user_id = auth.uid());
-- Cria a linha do jogador a partir dos dados do cadastro (auth.signUp options.data).
create or replace function public.novo_jogador() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.jogadores (id, nick, nome, nascimento, email, origem)
  values (new.id, new.raw_user_meta_data->>'nick', new.raw_user_meta_data->>'nome',
          (new.raw_user_meta_data->>'nascimento')::date, new.email, nullif(new.raw_user_meta_data->>'origem', ''));
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users for each row execute function public.novo_jogador();
-- Nick livre? (o cadastro consulta antes de criar a conta)
create or replace function public.nick_livre(n text) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.jogadores where lower(nick) = lower(n));
$$;
grant execute on function public.nick_livre(text) to anon, authenticated;
-- Painel do admin atualiza sozinho quando entra cadastro novo.
alter publication supabase_realtime add table public.jogadores;
-- Depois que o dono criar a conta no jogo, torná-lo administrador:
-- insert into public.admins (user_id) select id from auth.users where email = '<email do dono>';
