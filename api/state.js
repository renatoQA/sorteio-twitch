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
    return res.status(200).json(state);
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

      const cycle = {
        endDate: new Date().toISOString().slice(0, 10),
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

      Object.keys(state.viewers).forEach(id => {
        state.viewers[id].sessions = [];
        state.viewers[id].checkedInToday = false;
      });
      state.liveActive = false;
      state.liveDate = null;
      state.winner = null;
      state.cycleStart = new Date().toISOString().slice(0, 10);
    }

    else if (action === 'reset') {
      state = { ...defaultState, cycleHistory: [] };
    }

    await kv.set(STATE_KEY, state);
    return res.status(200).json(state);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
