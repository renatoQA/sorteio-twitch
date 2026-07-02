import { kv } from '@vercel/kv';
import { createHmac } from 'crypto';

const STATE_KEY = 'sorteio_state';

function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = s.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpAt(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  ) % 1_000_000;
  return String(code).padStart(6, '0');
}

function verifyTotp(secret, token) {
  if (!secret || !token) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (const delta of [-1, 0, 1]) {
    if (totpAt(secret, counter + delta) === String(token).trim()) return true;
  }
  return false;
}

const ADMIN_ACTIONS = new Set([
  'check_admin', 'open_live', 'close_live', 'draw', 'draw_specific',
  'draw_monthly_specific', 'clear_monthly_winner',
  'end_cycle', 'reset', 'set_prize', 'toggle_prize', 'clear_prize',
  'get_prize_code', 'delete_viewer', 'add_xp', 'add_time',
  'add_schedule', 'remove_schedule',
  'set_bonus_stars', 'set_eligible_override', 'reset_ranking',
]);

const DISCORD_WEBHOOKS = [
  process.env.DISCORD_WEBHOOK_AVISO,
  process.env.DISCORD_WEBHOOK_PAPO,
].filter(Boolean);

async function notifyDiscordLive(liveTitle) {
  const titleLine = liveTitle ? `**${liveTitle}**\n\n` : '';
  const body = JSON.stringify({
    content: '@everyone',
    username: 'Area do Tailung',
    avatar_url: 'https://area-tailung.vercel.app/favicon.ico',
    embeds: [{
      color: 0x9146FF,
      title: '🔴 oTaiLungg está AO VIVO!',
      description: `${titleLine}Não se esqueça de fazer o seu checkin na **Area do Tailung** para participar dos sorteios! 🎮🎁`,
      url: 'https://www.twitch.tv/otailungg',
      fields: [
        { name: '📺 Assistir agora', value: '[twitch.tv/otailungg](https://www.twitch.tv/otailungg)', inline: true },
        { name: '🌐 Area do Tailung', value: '[area-tailung.vercel.app](https://area-tailung.vercel.app)', inline: true },
      ],
      footer: { text: 'Area do Tailung • Sorteio Semanal' },
      timestamp: new Date().toISOString(),
    }],
  });
  await Promise.all(
    DISCORD_WEBHOOKS.map(url =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
    )
  );
}
const MIN_MINS_LIVE = 60;
const MIN_DAYS = 4;
const SE_CHANNEL_ID = '69ebaa7d3d08d0ab3cd6f917';
const WEEKLY_POINTS_FOR_FULL_BAR = 600; // 10h de atividade (pts) enche as 4 estrelas de uma vez
const POINTS_PER_WEEKLY_STAR = WEEKLY_POINTS_FOR_FULL_BAR / MIN_DAYS;

const defaultState = {
  viewers: {},
  liveActive: false,
  liveDate: null,
  winner: null,
  monthlyWinner: null,
  cycleHistory: [],
  cycleStart: null,
  prizes: [],
  botCycle: 0,
};

function seToMins(pts, hasSub) { return Math.round(pts * (hasSub ? 10 / 15 : 2)); }

// Fetches current SE points per viewer (nick -> pts). Returns null on failure so
// callers can tell "no data" apart from "legitimately zero", and avoid crediting
// a viewer's whole lifetime SE balance as if it were earned in one live.
async function fetchSEPoints() {
  try {
    const r = await fetch(`https://api.streamelements.com/kappa/v2/points/${SE_CHANNEL_ID}/top?limit=200`);
    if (!r.ok) return null;
    const data = await r.json();
    const map = {};
    for (const u of data.users || []) map[u.username.toLowerCase()] = u.points;
    return map;
  } catch {
    return null;
  }
}

// A day only "qualifies" for a star if there was a check-in AND at least 1h of
// real activity that day (chat credit + SE gained during the live, baked into
// session.minutes at close_live).
function qualifiedDays(sessions) {
  return sessions.filter(s => (s.minutes || 0) >= MIN_MINS_LIVE).length;
}
function weeklyPoints(sessions) {
  return sessions.length * MIN_MINS_LIVE + sessions.reduce((a, s) => a + (s.minutes || 0), 0);
}
// Stars fill either by qualified days, or all at once once weekly points cross
// the 10h bar — like an XP bar, whichever gives more stars wins.
function calcStars(v) {
  const daily = Math.min(MIN_DAYS, qualifiedDays(v.sessions));
  const weekly = Math.min(MIN_DAYS, Math.floor(weeklyPoints(v.sessions) / POINTS_PER_WEEKLY_STAR));
  return Math.max(daily, weekly);
}
function isEligible(v) {
  if (v.eligibleOverride !== undefined && v.eligibleOverride !== null) return v.eligibleOverride;
  const starCount = Math.min(MIN_DAYS, calcStars(v) + (v.bonusStars || 0));
  return starCount >= MIN_DAYS;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const state = await kv.get(STATE_KEY) || defaultState;
    // never expose giftcard codes in public state
    const safe = { ...state };
    if (safe.prizes) safe.prizes = safe.prizes.map(p => ({ ...p, giftcard: undefined }));
    return res.status(200).json(safe);
  }

  if (req.method === 'POST') {
    const { action, payload } = req.body;

    if (ADMIN_ACTIONS.has(action)) {
      const secret = req.headers['x-admin-secret'];
      if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }
    }

    if (action === 'check_admin') {
      if (process.env.TOTP_SECRET) {
        const totpToken = req.headers['x-admin-totp'];
        if (!verifyTotp(process.env.TOTP_SECRET, totpToken)) {
          return res.status(401).json({ error: 'Código 2FA inválido.' });
        }
      }
      return res.status(200).json({ ok: true });
    }

    let state = await kv.get(STATE_KEY) || { ...defaultState };
    if (!state.cycleHistory) state.cycleHistory = [];

    if (action === 'register') {
      const { twitch_id, nick, display_name } = payload;
      if (state.viewers[twitch_id]) return res.status(200).json(state);
      const code = Math.random().toString(36).slice(2, 7).toUpperCase();
      state.viewers[twitch_id] = { twitch_id, nick, display_name, code, sessions: [], checkedInToday: false };
      if (!state.cycleStart) state.cycleStart = new Date().toISOString().slice(0, 10);
    }

    else if (action === 'checkin') {
      const { twitch_id } = payload;
      const v = state.viewers[twitch_id];
      if (!v) return res.status(404).json({ error: 'Viewer não cadastrado!' });
      if (!state.liveActive) return res.status(400).json({ error: 'Nenhuma live ativa!' });
      if (v.checkedInToday) return res.status(400).json({ error: 'Você já fez check-in hoje!' });
      const snap = state.seSnapshotOpen;
      const seStart = snap ? (snap[(v.nick || '').toLowerCase()] ?? 0) : null;
      state.viewers[twitch_id].sessions.push({ date: state.liveDate, minutes: 0, seStart });
      state.viewers[twitch_id].checkedInToday = true;
    }

    else if (action === 'open_live') {
      const { liveTitle, testMode } = payload || {};
      Object.keys(state.viewers).forEach(id => { state.viewers[id].checkedInToday = false; });
      state.liveActive = true;
      state.liveDate = new Date().toISOString().slice(0, 10);
      if (!state.cycleStart) state.cycleStart = state.liveDate;
      state.seSnapshotOpen = await fetchSEPoints();
      if (!testMode) notifyDiscordLive(liveTitle).catch(() => {});
    }

    else if (action === 'close_live') {
      const seNow = await fetchSEPoints();
      if (seNow) {
        Object.values(state.viewers).forEach(v => {
          const idx = v.sessions.findLastIndex(s => s.date === state.liveDate);
          if (idx === -1) return;
          const session = v.sessions[idx];
          if (session.seCredited || session.seStart === null || session.seStart === undefined) return;
          const current = seNow[(v.nick || '').toLowerCase()] ?? 0;
          const delta = Math.max(0, current - session.seStart);
          if (delta > 0) session.minutes += seToMins(delta, v.hasSub);
          session.seCredited = true;
        });
      }
      state.liveActive = false;
      delete state.seSnapshotOpen;
    }

    else if (action === 'add_time') {
      const { twitch_id, minutes } = payload;
      const v = state.viewers[twitch_id];
      if (!v) return res.status(404).json({ error: 'Viewer não encontrado' });
      const idx = v.sessions.findLastIndex(s => s.date === state.liveDate);
      if (idx === -1) return res.status(400).json({ error: 'Sem sessão hoje' });
      state.viewers[twitch_id].sessions[idx].minutes += minutes;
    }

    else if (action === 'draw') {
      const eligible = Object.values(state.viewers).filter(isEligible);
      if (!eligible.length) return res.status(400).json({ error: 'Nenhum elegível!' });
      state.winner = eligible[Math.floor(Math.random() * eligible.length)];
    }

    else if (action === 'tick_cycle') {
      state.botCycle = (state.botCycle || 0) + 1;
      if (payload?.botIntervalMins) state.botIntervalMins = payload.botIntervalMins;
    }

    else if (action === 'set_sub') {
      const { twitch_id } = payload;
      if (state.viewers[twitch_id]) state.viewers[twitch_id].hasSub = true;
    }

    else if (action === 'add_xp') {
      const { twitch_id, xp } = payload;
      const amount = parseInt(xp);
      if (!state.viewers[twitch_id]) return res.status(404).json({ error: 'Viewer não encontrado' });
      if (!amount || isNaN(amount)) return res.status(400).json({ error: 'XP inválido' });
      state.viewers[twitch_id].permanentXP = (state.viewers[twitch_id].permanentXP || 0) + amount;
    }

    else if (action === 'set_bonus_stars') {
      const { twitch_id, bonusStars } = payload;
      if (!state.viewers[twitch_id]) return res.status(404).json({ error: 'Viewer não encontrado' });
      const amount = parseInt(bonusStars);
      if (isNaN(amount)) return res.status(400).json({ error: 'Valor inválido' });
      state.viewers[twitch_id].bonusStars = Math.max(-4, Math.min(4, amount));
    }

    else if (action === 'set_eligible_override') {
      const { twitch_id, eligible } = payload;
      if (!state.viewers[twitch_id]) return res.status(404).json({ error: 'Viewer não encontrado' });
      if (eligible === null || eligible === undefined || eligible === 'auto') {
        delete state.viewers[twitch_id].eligibleOverride;
      } else {
        state.viewers[twitch_id].eligibleOverride = !!eligible;
      }
    }

    else if (action === 'reset_ranking') {
      // Season reset: keeps identity but wipes all progress
      Object.keys(state.viewers).forEach(id => {
        const v = state.viewers[id];
        state.viewers[id] = {
          twitch_id: v.twitch_id,
          nick: v.nick,
          display_name: v.display_name,
          code: v.code,
          hasSub: v.hasSub || false,
          sessions: [],
          checkedInToday: false,
          history: [],
          permanentXP: 0,
        };
      });
      state.liveActive = false;
      state.liveDate = null;
      state.winner = null;
      state.monthlyWinner = null;
      state.cycleStart = new Date().toISOString().slice(0, 10);
      state.cycleHistory = [];
      state.prizes = [];
    }

    else if (action === 'draw_specific') {
      const { twitch_id } = payload;
      const v = state.viewers[twitch_id];
      if (!v) return res.status(404).json({ error: 'Viewer não encontrado' });
      state.winner = v;
    }

    else if (action === 'clear_winner') {
      state.winner = null;
    }

    else if (action === 'draw_monthly_specific') {
      const { twitch_id } = payload;
      const v = state.viewers[twitch_id];
      if (!v) return res.status(404).json({ error: 'Viewer não encontrado' });
      state.monthlyWinner = v;
    }

    else if (action === 'clear_monthly_winner') {
      state.monthlyWinner = null;
    }

    else if (action === 'delete_viewer') {
      const { twitch_id } = payload;
      if (!state.viewers[twitch_id]) return res.status(404).json({ error: 'Viewer não encontrado' });
      delete state.viewers[twitch_id];
    }

    else if (action === 'end_cycle') {
      const allViewers = Object.values(state.viewers);
      const allDates = new Set(allViewers.flatMap(v => v.sessions.map(s => s.date)));
      const totalMinutes = allViewers.reduce((a, v) => a + v.sessions.reduce((b, s) => b + (s.minutes || 0), 0), 0);
      const eligible = allViewers.filter(isEligible);
      const endDate = new Date().toISOString().slice(0, 10);

      const cycle = {
        endDate,
        startDate: state.cycleStart,
        winner: state.winner || null,
        stats: {
          totalViewers: allViewers.length,
          eligibleViewers: eligible.length,
          totalMinutes,
          totalLives: allDates.size,
        },
      };

      state.cycleHistory.unshift(cycle);

      // purge cutoff: 2 months ago
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 2);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const winnerId = state.winner?.twitch_id;

      Object.keys(state.viewers).forEach(id => {
        const v = state.viewers[id];
        const viewerMins = v.sessions.reduce((a, s) => a + (s.minutes || 0), 0);
        if (!state.viewers[id].history) state.viewers[id].history = [];

        // save this cycle to viewer personal history
        const cycleEntry = {
          cycleEnd: endDate,
          cycleStart: state.cycleStart,
          sessions: v.sessions,
          totalMinutes: viewerMins,
          lives: new Set(v.sessions.map(s => s.date)).size,
          eligible: isEligible(v),
          won: winnerId === id,
        };
        state.viewers[id].history.unshift(cycleEntry);

        // accumulate XP from entries about to be purged into permanentXP
        const toPurge = state.viewers[id].history.filter(h => h.cycleEnd < cutoffStr);
        const purgedXP = toPurge.reduce((acc, h) => {
          let xp = (h.totalMinutes || 0) + (h.lives || 0) * 25;
          for (const s of h.sessions || []) { if ((s.minutes || 0) >= MIN_MINS_LIVE) xp += 50; }
          if (h.eligible) xp += 100;
          if (h.won) xp += 500;
          return acc + xp;
        }, 0);
        state.viewers[id].permanentXP = (state.viewers[id].permanentXP || 0) + purgedXP;

        // purge entries older than 2 months (XP preserved in permanentXP)
        state.viewers[id].history = state.viewers[id].history.filter(h => h.cycleEnd >= cutoffStr);

        state.viewers[id].sessions = [];
        state.viewers[id].checkedInToday = false;
        state.viewers[id].bonusStars = 0;
        delete state.viewers[id].eligibleOverride;
      });

      state.liveActive = false;
      state.liveDate = null;
      state.winner = null;
      state.prizes = [];
      state.cycleStart = endDate;
    }

    else if (action === 'get_prize_code') {
      if (!state.prizes) state.prizes = [];
      const prize = state.prizes.find(p => p.id === payload.prize_id);
      if (!prize) return res.status(404).json({ error: 'Prêmio não encontrado.' });
      return res.status(200).json({ giftcard: prize.giftcard });
    }

    else if (action === 'set_prize') {
      const { twitch_id, display_name, giftcard } = payload;
      if (!twitch_id || !giftcard) return res.status(400).json({ error: 'Preencha o vencedor e o código.' });
      if (!state.prizes) state.prizes = [];
      state.prizes.push({ id: Date.now().toString(), twitch_id, display_name, giftcard, enabled: false, redeemed: false, redeemedAt: null });
    }

    else if (action === 'toggle_prize') {
      if (!state.prizes) state.prizes = [];
      const prize = state.prizes.find(p => p.id === payload.prize_id);
      if (!prize) return res.status(404).json({ error: 'Prêmio não encontrado.' });
      prize.enabled = !prize.enabled;
    }

    else if (action === 'clear_prize') {
      if (!state.prizes) state.prizes = [];
      state.prizes = state.prizes.filter(p => p.id !== payload.prize_id);
    }

    else if (action === 'redeem_prize') {
      const { twitch_id } = payload;
      if (!state.prizes) state.prizes = [];
      const prize = state.prizes.find(p => p.twitch_id === twitch_id && p.enabled && !p.redeemed);
      if (!prize) return res.status(404).json({ error: 'Nenhum prêmio disponível para resgate.' });
      prize.redeemed = true;
      prize.redeemedAt = new Date().toISOString();
      const giftcard = prize.giftcard;
      await kv.set(STATE_KEY, state);
      return res.status(200).json({ giftcard, redeemedAt: prize.redeemedAt });
    }

    else if (action === 'add_schedule') {
      const { title, date, time } = payload;
      if (!title || !date || !time) return res.status(400).json({ error: 'Preencha todos os campos.' });
      if (!state.schedule) state.schedule = [];
      state.schedule.push({ id: Date.now().toString(), title, date, time });
      state.schedule.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    }

    else if (action === 'remove_schedule') {
      const { id } = payload;
      if (!state.schedule) state.schedule = [];
      state.schedule = state.schedule.filter(e => e.id !== id);
    }

    else if (action === 'reset') {
      state = { ...defaultState, cycleHistory: [] };
    }

    await kv.set(STATE_KEY, state);
    return res.status(200).json(state);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
