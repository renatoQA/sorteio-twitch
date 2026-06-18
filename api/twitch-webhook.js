import { kv } from '@vercel/kv';

const STATE_KEY = 'sorteio_state';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const msgType = req.headers['twitch-eventsub-message-type'];
  const body = req.body;

  // Twitch verification handshake
  if (msgType === 'webhook_callback_verification') {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(body.challenge);
  }

  // Chat message notification
  if (msgType === 'notification' && body?.event) {
    const event = body.event;
    const msgText = (event.message?.text || '').toLowerCase().trim();

    if (msgText.includes('#tailung')) {
      const viewerId = event.chatter_user_id;
      try {
        const state = await kv.get(STATE_KEY);
        if (!state?.liveActive) return res.status(200).end();

        const v = state.viewers?.[viewerId];
        if (!v?.checkedInToday) return res.status(200).end();

        const idx = v.sessions.findLastIndex(s => s.date === state.liveDate);
        if (idx === -1) return res.status(200).end();

        // 14-min cooldown per viewer to prevent spam
        const cooldownKey = `cd:${viewerId}`;
        const credited = await kv.get(cooldownKey);
        if (!credited) {
          state.viewers[viewerId].sessions[idx].minutes += 15;
          await kv.set(STATE_KEY, state);
          await kv.set(cooldownKey, '1', { ex: 840 }); // 840s = 14 min
        }
      } catch (e) {
        console.error('webhook error:', e);
      }
    }
  }

  return res.status(200).end();
}
