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

    const cooldownKey = `cd:${viewer_id}`;
    const credited = await kv.get(cooldownKey);
    if (credited) return res.status(200).json({ ok: false, reason: 'cooldown' });

    state.viewers[viewer_id].sessions[idx].minutes += 15;
    await kv.set(STATE_KEY, state);
    await kv.set(cooldownKey, '1', { ex: 840 });

    return res.status(200).json({ ok: true, viewer: v.display_name || v.nick });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
