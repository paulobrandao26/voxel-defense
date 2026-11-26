// Recebe o aviso de voto do TopIdle (POST assinado) e repassa o corpo cru para o banco (Supabase).
// A assinatura e o prêmio são conferidos lá, na função topidle_voto (tools/supabase/topidle.sql),
// então aqui não fica nenhum segredo. Documentação: https://topidle.com/integracao.html
const SUPA_URL = 'https://rjbzkkmomehneylooqas.supabase.co';
const SUPA_KEY = 'sb_publishable_g55dcfE3Vrjj1u2vvDVvsA_SBfrtyL_'; // chave pública (a mesma do jogo)

/** Lê o corpo exatamente como chegou (a assinatura é feita sobre esse texto). */
async function corpoCru(req) {
  const partes = [];
  for await (const p of req) partes.push(typeof p === 'string' ? Buffer.from(p) : p);
  return Buffer.concat(partes).toString('utf8');
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('{"error":"use POST"}'); }
  try {
    const corpo = await corpoCru(req);
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/topidle_voto`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ corpo, ts: req.headers['x-topidle-timestamp'] || '', assinatura: req.headers['x-topidle-signature'] || '' }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) { res.statusCode = 503; return res.end('{"error":"banco indisponível"}'); }
    const out = await r.json();
    res.statusCode = out.status || 500;
    return res.end(JSON.stringify(out.error ? { error: out.error } : { ok: true }));
  } catch (e) {
    res.statusCode = 503; return res.end('{"error":"falha ao falar com o banco"}');
  }
};
module.exports.config = { api: { bodyParser: false } };
