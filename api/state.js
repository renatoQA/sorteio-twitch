import { kv } from '@vercel/kv';

const STATE_KEY = 'sorteio_state';
const MIN_MINS_LIVE = 60;
const MIN_MINS_TOTAL = 480;

const defaultState = {
  viewers: {},
  liveActive: false,
  liveDate: null,
  winner: null,
  cycleHistory: [],
  cycleStart: null,
  prize: null,
};

function isEligible(v) {
  const totalMins = v.sessions.reduce((a, s) => a + (s.minutes || 0), 0);
  return v.sessions.some(s => s.minutes >= MIN_MINS_LIVE) || totalMins >= MIN_MINS_TOTAL;
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
      Object.keys(state.viewers).forEach(id => { state.viewers[id].checkedInToday = false; });
      state.liveActive = true;
      state.liveDate = new Date().toISOString().slice(0, 10);
      if (!state.cycleStart) state.cycleStart = state.liveDate;
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
        state.viewers[id].history.unshift({
          cycleEnd: endDate,
          cycleStart: state.cycleStart,
          sessions: v.sessions,
          totalMinutes: viewerMins,
          lives: new Set(v.sessions.map(s => s.date)).size,
          eligible: isEligible(v),
          won: winnerId === id,
        });

        // purge entries older than 2 months
        state.viewers[id].history = state.viewers[id].history.filter(h => h.cycleEnd >= cutoffStr);

        state.viewers[id].sessions = [];
        state.viewers[id].checkedInToday = false;
      });

      state.liveActive = false;
      state.liveDate = null;
      state.winner = null;
      state.cycleStart = endDate;
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
