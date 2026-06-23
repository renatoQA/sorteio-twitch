import { kv } from '@vercel/kv';

const STATE_KEY = 'sorteio_state';

const DISCORD_WEBHOOKS = [
  process.env.DISCORD_WEBHOOK_AVISO || 'https://discord.com/api/webhooks/1517596011852206271/KburOkQ3YPZDOd-xbUGjOSpDjgkEu5-cRckfaKDQEmIdoo_9dtNDXpWUjUCMrP8Rg5Bq',
  process.env.DISCORD_WEBHOOK_PAPO  || 'https://discord.com/api/webhooks/1517596092932292608/N7oIDJKocnBil92GqxNYXt02mL_-lxgA2QG9qV-ZP9LlqQgwunlec6Md6bYkBJjBE1TD',
];

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
const MIN_MINS_TOTAL = 660;
const MIN_DAYS = 4;

const defaultState = {
  viewers: {},
  liveActive: false,
  liveDate: null,
  winner: null,
  cycleHistory: [],
  cycleStart: null,
  prize: null,
  botCycle: 0,
};

function isEligible(v) {
  const totalMins = v.sessions.reduce((a, s) => a + (s.minutes || 0), 0);
  const qualifiedDays = v.sessions.filter(s => s.minutes >= MIN_MINS_LIVE).length;
  return totalMins >= MIN_MINS_TOTAL || qualifiedDays >= MIN_DAYS;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const state = await kv.get(STATE_KEY) || defaultState;
    // never expose giftcard code in public state
    const safe = { ...state };
    if (safe.prize) safe.prize = { ...safe.prize, giftcard: undefined };
    return res.status(200).json(safe);
  }

  if (req.method === 'POST') {
    const { action, payload } = req.body;
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
      state.viewers[twitch_id].sessions.push({ date: state.liveDate, minutes: 0 });
      state.viewers[twitch_id].checkedInToday = true;
    }

    else if (action === 'open_live') {
      const { liveTitle, testMode } = payload || {};
      Object.keys(state.viewers).forEach(id => { state.viewers[id].checkedInToday = false; });
      state.liveActive = true;
      state.liveDate = new Date().toISOString().slice(0, 10);
      if (!state.cycleStart) state.cycleStart = state.liveDate;
      if (!testMode) notifyDiscordLive(liveTitle).catch(() => {});
    }

    else if (action === 'close_live') {
      state.liveActive = false;
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

    else if (action === 'draw_specific') {
      const { twitch_id } = payload;
      const v = state.viewers[twitch_id];
      if (!v) return res.status(404).json({ error: 'Viewer não encontrado' });
      state.winner = v;
    }

    else if (action === 'clear_winner') {
      state.winner = null;
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
      });

      state.liveActive = false;
      state.liveDate = null;
      state.winner = null;
      state.prize = null;
      state.cycleStart = endDate;
    }

    else if (action === 'get_prize_code') {
      if (!state.prize) return res.status(404).json({ error: 'Nenhum prêmio configurado.' });
      return res.status(200).json({ giftcard: state.prize.giftcard });
    }

    else if (action === 'set_prize') {
      const { twitch_id, display_name, giftcard } = payload;
      if (!twitch_id || !giftcard) return res.status(400).json({ error: 'Preencha o vencedor e o código.' });
      state.prize = { twitch_id, display_name, giftcard, enabled: false, redeemed: false, redeemedAt: null };
    }

    else if (action === 'toggle_prize') {
      if (!state.prize) return res.status(404).json({ error: 'Nenhum prêmio configurado.' });
      state.prize.enabled = !state.prize.enabled;
    }

    else if (action === 'clear_prize') {
      state.prize = null;
    }

    else if (action === 'redeem_prize') {
      const { twitch_id } = payload;
      if (!state.prize) return res.status(404).json({ error: 'Nenhum prêmio disponível.' });
      if (!state.prize.enabled) return res.status(403).json({ error: 'Resgate ainda não habilitado.' });
      if (state.prize.redeemed) return res.status(400).json({ error: 'Prêmio já foi resgatado.' });
      if (state.prize.twitch_id !== twitch_id) return res.status(403).json({ error: 'Este prêmio não é seu.' });
      state.prize.redeemed = true;
      state.prize.redeemedAt = new Date().toISOString();
      const giftcard = state.prize.giftcard;
      await kv.set(STATE_KEY, state);
      // return giftcard only this one time, stripped from future GETs
      return res.status(200).json({ giftcard, redeemedAt: state.prize.redeemedAt });
    }

    else if (action === 'reset') {
      state = { ...defaultState, cycleHistory: [] };
    }

    await kv.set(STATE_KEY, state);
    return res.status(200).json(state);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
