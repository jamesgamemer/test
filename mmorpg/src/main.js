import { Game } from './game/game.js';
import { WsTransport } from './game/transport.js';
import { LOOKS } from './gfx/actors.js';
import { t } from './ui/i18n.js';

const $ = (s) => document.querySelector(s);
const P = new URLSearchParams(location.search);
const title = $('#title');
title.classList.add('loading');

function fatal(msg) {
  $('#loader').classList.add('hidden'); $('#create').classList.add('hidden');
  const f = $('#fatal'); f.classList.remove('hidden'); f.textContent = msg;
}

async function boot() {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) return fatal('WebGL2 is required to play Nightglade Online. / เบราว์เซอร์นี้ไม่รองรับ WebGL2');
  const game = new Game($('#view'));
  window.__game = game;
  $('#title-sub').textContent = t('title_sub');
  $('#load-text').textContent = t('loading');

  // look for a multiplayer server next to the page (or ?server=wss://…) while the world builds
  let socket = null;
  const serverUrl = P.get('server') || (/^https?:$/.test(location.protocol) && !P.get('solo') ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws` : null);
  const probing = serverUrl ? WsTransport.probe(serverUrl).then((ws) => { socket = ws; }) : Promise.resolve();

  await game.init((p, stage) => {
    $('#load-fill').style.width = Math.round(p * 100) + '%';
    $('#load-text').textContent = t('load_' + stage);
  });
  title.classList.remove('loading');
  $('#loader').classList.add('hidden');
  $('#create').classList.remove('hidden');

  // character creation
  const looks = $('#looks');
  let look = game.prefs.look || 0;
  LOOKS.forEach((L, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = '#' + L.cloak.toString(16).padStart(6, '0');
    b.style.setProperty('--b', '#' + L.blade.toString(16).padStart(6, '0'));
    b.classList.toggle('on', i === look);
    b.addEventListener('click', () => { look = i; [...looks.children].forEach((c, j) => c.classList.toggle('on', j === i)); game.setPreview(i); });
    looks.appendChild(b);
  });
  $('#in-name').value = game.prefs.name || '';
  const mode = $('#mode');
  const showMode = () => { mode.textContent = socket ? t('mode_online') : t('mode_solo'); mode.classList.toggle('online', !!socket); };
  mode.textContent = serverUrl ? t('mode_connecting') : t('mode_solo');
  probing.then(showMode);
  $('#t-lang').value = game.prefs.lang;
  $('#t-quality').value = $('#set-quality').value = game.prefs.quality;
  $('#set-vol').value = Math.round(game.prefs.vol * 100);
  $('#set-fps').checked = !!game.prefs.fps; $('#fps').classList.toggle('hidden', !game.prefs.fps);
  $('#t-lang').addEventListener('change', (e) => { game.setLanguage(e.target.value); showMode(); });
  $('#t-quality').addEventListener('change', (e) => game.setQuality(e.target.value));

  let entering = false;
  const enter = async () => {
    if (entering) return; entering = true;
    await probing;
    const name = ($('#in-name').value || '').trim() || (game.prefs.lang === 'th' ? 'นักเดินทาง' : 'Wanderer');
    await game.enter({ name, look, socket: socket && socket.readyState === 1 ? socket : null });
    title.classList.add('out');
    setTimeout(() => title.remove(), 1000);
  };
  $('#create').addEventListener('submit', (e) => { e.preventDefault(); enter(); });
  if (P.get('auto')) { $('#in-name').value = P.get('auto') === '1' ? '' : P.get('auto'); enter(); }
}

boot().catch((e) => { console.error(e); fatal(String(e && e.message || e)); });
