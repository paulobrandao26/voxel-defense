-- Modo automático (idle): o progresso (essência, melhorias, recordes, ganho offline) fica salvo na conta.
-- O jogo guarda um JSON em jogadores.idle; cada jogador só grava a própria linha (regra de update já existente).
alter table public.jogadores add column if not exists idle jsonb;
grant update (idle) on public.jogadores to authenticated;
