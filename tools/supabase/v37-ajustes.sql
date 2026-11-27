-- v37: ajustes de segurança do banco (revisão final).
-- 1) O progresso do modo automático (jogadores.idle) tem de ser um objeto JSON pequeno (até ~20 KB).
alter table public.jogadores drop constraint if exists idle_ok;
alter table public.jogadores add constraint idle_ok check (idle is null or (jsonb_typeof(idle) = 'object' and pg_column_size(idle) <= 20000));
-- 2) A função que grava o segredo do TopIdle só servia uma vez; o segredo já está guardado.
drop function if exists public.definir_segredo_topidle(text);
-- 3) Garante que o jogador ainda pode gravar o próprio progresso do modo automático.
grant update (ultimo_acesso, melhor_onda, idle) on public.jogadores to authenticated;
