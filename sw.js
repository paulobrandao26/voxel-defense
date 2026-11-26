// Guarda os arquivos do jogo para abrir sem internet.
// Ao mudar o jogo, troque o número da versão para os celulares baixarem a versão nova.
const CACHE = 'voxel-defense-v32';
const ASSETS = [
  './', './index.html', './conta.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Só guarda arquivos do jogo e das bibliotecas; a conexão online (PeerJS) nunca vai para o cache.
  const host = new URL(req.url).hostname;
  if (host !== location.hostname && host !== 'cdn.jsdelivr.net') return;
  const save = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  // Página: tenta a internet primeiro (pega atualizações); sem internet, usa a cópia.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(save).catch(() => caches.match('./index.html')));
    return;
  }
  // Resto: usa a cópia guardada; se não tiver, baixa e guarda.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(save)));
});
