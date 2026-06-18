import { kv } from '@vercel/kv';

const STATE_KEY = 'sorteio_state';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { viewer_id } = req.body || {};
  if (!viewer_id) return res.status(400).json({ ok: false, reason: 'missing viewer_id' });

  try {
    const state = await kv.get(STATE_KEY);
    if (!state?.liveActive) return res.status(200).json({ ok: false, reason: 'no_live' });

    const v = state.viewers?.[viewer_id];
    if (!v?.checkedInToday) return res.status(200).json({ ok: false, reason: 'no_checkin' });

    const idx = v.sessions.findLastIndex(s => s.date === state.liveDate);
    if (idx === -1) return res.status(200).json({ ok: false, reason: 'no_session' });

    // Only one credit per bot message cycle
    const currentCycle = state.botCycle || 0;
    if (currentCycle === 0) return res.status(200).json({ ok: false, reason: 'bot_not_started' });
    if ((v.lastCreditedCycle ?? -1) >= currentCycle) {
      return res.status(200).json({ ok: false, reason: 'cooldown' });
    }

    state.viewers[viewer_id].sessions[idx].minutes += 15;
    state.viewers[viewer_id].lastCreditedCycle = currentCycle;
    await kv.set(STATE_KEY, state);

    return res.status(200).json({ ok: true, viewer: v.display_name || v.nick });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
