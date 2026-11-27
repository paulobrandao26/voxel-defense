// Conta do jogador (Supabase): criar conta, entrar, sair e guardar a melhor onda.
// A chave publicável é feita para ficar no navegador; a segurança vem das regras (RLS) do banco.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPA_URL = 'https://rjbzkkmomehneylooqas.supabase.co';
const SUPA_KEY = 'sb_publishable_g55dcfE3Vrjj1u2vvDVvsA_SBfrtyL_';
const sb = createClient(SUPA_URL, SUPA_KEY);
const $ = id => document.getElementById(id);
const IDADE_MIN = 6, IDADE_MAX = 110, NICK_RE = /^[A-Za-z0-9_.\-]{3,20}$/;

let perfil = null, depois = null; // depois: o que fazer quando a pessoa entrar ('play' ou 'online')
const CONVIDADO = /[?&]sala=/.test(location.search) && !/[?&]host/.test(location.search);

/** Idade em anos completos a partir de 'AAAA-MM-DD'. */
export function idade(nasc, hoje = new Date()) {
  const d = new Date(nasc + 'T12:00:00');
  let a = hoje.getFullYear() - d.getFullYear();
  if (hoje.getMonth() < d.getMonth() || (hoje.getMonth() === d.getMonth() && hoje.getDate() < d.getDate())) a--;
  return a;
}

/** Confere os campos do cadastro. Devolve a mensagem do primeiro erro ou ''. */
export function validarCadastro(f) {
  if (!NICK_RE.test(f.nick)) return 'O nickname precisa ter de 3 a 20 letras ou números, sem espaço.';
  if (f.nome.trim().length < 2) return 'Escreva o seu nome.';
  if (!/^\S+@\S+\.\S+$/.test(f.email)) return 'Confira o e-mail.';
  if (f.senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (!f.nascimento) return 'Coloque a data de nascimento.';
  const i = idade(f.nascimento);
  if (isNaN(i) || i < IDADE_MIN || i > IDADE_MAX) return 'Confira a data de nascimento.';
  if (!f.termos) return 'Para criar a conta, aceite os termos e a política de privacidade.';
  return '';
}

function msg(el, t, ok = false) { el.textContent = t; el.className = 'accMsg' + (ok ? ' ok' : ''); el.hidden = !t; if (t) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

function mostrarConta() {
  const btn = $('accBtn');
  btn.hidden = false;
  window.__contaOk = !!perfil;
  $('accClose').hidden = !perfil && CONVIDADO; // convidado da sala online só fecha depois de entrar
  if (perfil && depois) { const d = depois; depois = null; $('acc').classList.remove('show'); setTimeout(() => $(d)?.click(), 300); return true; }
  else if (!perfil && CONVIDADO) { abrir('novo'); msg($('accErr'), 'Para jogar com o seu amigo, crie a sua conta ou entre.', true); }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  btn.innerHTML = (window.__ico?.('user') || '') + (perfil ? `${esc(perfil.nick)} · Minha conta` : 'Criar conta / Entrar');
}

async function carregarPerfil() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { perfil = null; return mostrarConta(); }
  const { data } = await sb.from('jogadores').select('nick,nome,melhor_onda,idle').eq('id', session.user.id).maybeSingle();
  perfil = data || { nick: session.user.user_metadata?.nick || 'Jogador', melhor_onda: 0 };
  perfil.id = session.user.id;
  window.__idleConta = { id: perfil.id, idle: data?.idle || null };   // o jogo lê daqui se ainda não estiver ouvindo
  dispatchEvent(new CustomEvent('vd-idle-conta', { detail: window.__idleConta }));
  const foi = mostrarConta();
  sb.from('jogadores').update({ ultimo_acesso: new Date().toISOString() }).eq('id', perfil.id).then(() => {});
  return foi;
}

function abrir(aba) {
  $('acc').classList.add('show');
  const logado = !!perfil;
  const nova = aba === 'nova';
  $('accTabs').hidden = logado || nova; $('accNovo').hidden = logado || aba !== 'novo'; $('accEntrar').hidden = logado || aba !== 'entrar'; $('accMeu').hidden = !logado || nova; $('accNova').hidden = !nova;
  for (const b of document.querySelectorAll('#accTabs button')) b.setAttribute('aria-selected', b.dataset.aba === aba);
  if (logado && !nova) { $('accNick').textContent = perfil.nick; $('accOnda').textContent = perfil.melhor_onda || 0; }
  msg($('accErr'), '');
}

async function criarConta(e) {
  e.preventDefault();
  const f = { nick: $('fNick').value.trim(), nome: $('fNome').value.trim(), email: $('fEmail').value.trim(), senha: $('fSenha').value,
    nascimento: $('fNasc').value, origem: $('fOrigem').value.trim().slice(0, 200), termos: $('fTermos').checked };
  const erro = validarCadastro(f), out = $('accErr');
  if (erro) return msg(out, erro);
  const go = $('fGo'); go.disabled = true; msg(out, 'Criando a conta…', true);
  try {
    const { data: livre } = await sb.rpc('nick_livre', { n: f.nick });
    if (livre === false) return msg(out, 'Esse nickname já existe. Escolha outro.');
    const { data, error } = await sb.auth.signUp({ email: f.email, password: f.senha,
      options: { data: { nick: f.nick, nome: f.nome, nascimento: f.nascimento, origem: f.origem }, emailRedirectTo: location.origin } });
    if (error) return msg(out, /registered|already/i.test(error.message) ? 'Esse e-mail já tem conta. Use "Entrar".' : /rate|limit/i.test(error.message) ? 'Muitos cadastros agora. Tente de novo em alguns minutos.' : 'Não deu para criar a conta. Tente de novo.');
    if (!data.session) { msg(out, `Conta criada! Abra o e-mail ${f.email} e clique no link para confirmar. Depois é só entrar.`, true); return; }
    if (!(await carregarPerfil())) abrir('meu'); toastConta(`Bem-vindo, ${f.nick}!`);
  } catch { msg(out, 'Sem conexão. Confira a internet e tente de novo.'); }
  finally { go.disabled = false; }
}

async function entrar(e) {
  e.preventDefault();
  const out = $('accErr'), go = $('eGo');
  go.disabled = true; msg(out, 'Entrando…', true);
  try {
    const { error } = await sb.auth.signInWithPassword({ email: $('eEmail').value.trim(), password: $('eSenha').value });
    if (error) return msg(out, /confirm/i.test(error.message) ? 'Falta confirmar o e-mail. Abra o link que mandamos.' : 'E-mail ou senha errados.');
    if (!(await carregarPerfil())) abrir('meu'); toastConta(`Olá, ${perfil.nick}!`);
  } catch { msg(out, 'Sem conexão. Confira a internet e tente de novo.'); }
  finally { go.disabled = false; }
}

async function esqueci() {
  const email = $('eEmail').value.trim(), out = $('accErr');
  if (!/^\S+@\S+\.\S+$/.test(email)) return msg(out, 'Escreva o seu e-mail acima e toque de novo em "Esqueci a senha".');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  msg(out, error ? 'Não deu para mandar agora. Tente mais tarde.' : 'Se esse e-mail tiver conta, mandamos um link para criar uma senha nova.', !error);
}

function toastConta(t) { const el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); }

// Guarda a melhor onda de quem tem conta (o jogo avisa a cada onda nova).
addEventListener('vd-onda', async ev => {
  if (!perfil || !(ev.detail > (perfil.melhor_onda || 0))) return;
  perfil.melhor_onda = ev.detail;
  sb.from('jogadores').update({ melhor_onda: ev.detail }).eq('id', perfil.id).then(() => {});
});

$('accBtn').onclick = () => abrir(perfil ? 'meu' : 'novo');
$('accClose').onclick = () => $('acc').classList.remove('show');
for (const b of document.querySelectorAll('#accTabs button')) b.onclick = () => abrir(b.dataset.aba);
$('accNovo').onsubmit = criarConta;
$('accEntrar').onsubmit = entrar;
$('eForgot').onclick = esqueci;
$('accSair').onclick = async () => { enviarIdle(); dispatchEvent(new Event('vd-idle-sair')); await sb.auth.signOut(); perfil = null; mostrarConta(); $('acc').classList.remove('show'); toastConta('Você saiu da conta.'); };
for (const b of document.querySelectorAll('.olho')) b.onclick = () => { const i = $(b.dataset.for); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Mostrar' : 'Esconder'; };
$('fNasc').max = new Date().toISOString().slice(0, 10);

// Link de "esqueci a senha" ou de convite: abre a tela de senha nova.
const pedeSenha = /type=(recovery|invite)/.test(location.hash);
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') { abrir('nova'); return; }
  if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') carregarPerfil().then(() => { if (pedeSenha && ev === 'SIGNED_IN') abrir('nova'); });
});
$('accNova').onsubmit = async e => {
  e.preventDefault();
  const out = $('accErr'), senha = $('nSenha').value;
  if (senha.length < 6) return msg(out, 'A senha precisa ter pelo menos 6 caracteres.');
  $('nGo').disabled = true;
  const { error } = await sb.auth.updateUser({ password: senha });
  $('nGo').disabled = false;
  if (error) return msg(out, 'Não deu para salvar. Peça o link de novo em "Esqueci a senha".');
  history.replaceState(null, '', location.pathname + location.search);
  if (!(await carregarPerfil())) abrir('meu'); toastConta('Senha nova salva!');
};
carregarPerfil().catch(() => { $('accBtn').hidden = true; });

// Progresso do modo automático (idle) na conta: o jogo avisa a cada salvamento e aqui manda no máximo a cada 15 s.
const IDLE_ENVIO_MS = 15000;
let idleT = 0, idlePend = null;
function enviarIdle() {
  clearTimeout(idleT); idleT = 0;
  if (!perfil || !idlePend || idlePend.dono !== perfil.id) return;
  const d = idlePend; idlePend = null;
  sb.from('jogadores').update({ idle: d }).eq('id', perfil.id).then(() => {});
}
addEventListener('vd-idle-salvar', ev => { idlePend = ev.detail; if (!idleT) idleT = setTimeout(enviarIdle, IDLE_ENVIO_MS); });
addEventListener('pagehide', enviarIdle);
document.addEventListener('visibilitychange', () => { if (document.hidden) enviarIdle(); });

// Voto no TopIdle: o link já leva o nick, e cada voto vira ouro na próxima partida.
const TOPIDLE_JOGO = 'https://topidle.com/jogo/brand-defense-acca3c';
export const linkVoto = nick => TOPIDLE_JOGO + '?votar=1' + (nick ? '&playerIdentifier=' + encodeURIComponent(nick) : '');
$('voteBtn').onclick = () => window.open(linkVoto(perfil?.nick), '_blank', 'noopener');
addEventListener('vd-jogar', async () => {
  if (!perfil) return;
  try { const { data } = await sb.rpc('resgatar_bonus'); if (data > 0) dispatchEvent(new CustomEvent('vd-bonus', { detail: data })); } catch {}
});
window.__pedirConta = d => { depois = d; abrir('novo'); msg($('accErr'), 'Para jogar, crie a sua conta grátis ou toque em "Entrar" se já tiver.', true); };
window.__conta = { sb, idade, validarCadastro, abrir, get perfil() { return perfil; } };
