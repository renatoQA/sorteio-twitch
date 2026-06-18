const CLIENT_ID = 'bso3queqhjj7epoc18d9tfomtmthbm';
const WEBHOOK_URL = 'https://area-tailung.vercel.app/api/twitch-webhook';

const SUB_TYPES = [
  'channel.chat.message',
  'channel.subscribe',
  'channel.subscription.message',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { access_token, broadcaster_id, user_id } = req.body || {};
  if (!access_token || !broadcaster_id || !user_id) {
    return res.status(400).json({ error: 'Parâmetros faltando' });
  }

  const secret = process.env.TWITCH_WEBHOOK_SECRET || 'tailung_webhook_2024';
  const headers = {
    'Authorization': `Bearer ${access_token}`,
    'Client-Id': CLIENT_ID,
    'Content-Type': 'application/json',
  };

  try {
    // List all existing subscriptions and delete matching ones
    const listRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', { headers });
    const listData = await listRes.json();
    const toDelete = (listData.data || []).filter(s =>
      s.condition.broadcaster_user_id === broadcaster_id &&
      SUB_TYPES.includes(s.type)
    );
    await Promise.all(
      toDelete.map(s =>
        fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${s.id}`, {
          method: 'DELETE', headers,
        })
      )
    );

    // Create channel.chat.message subscription
    await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'channel.chat.message',
        version: '1',
        condition: { broadcaster_user_id: broadcaster_id, user_id },
        transport: { method: 'webhook', callback: WEBHOOK_URL, secret },
      }),
    });

    // Create channel.subscribe subscription
    await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'channel.subscribe',
        version: '1',
        condition: { broadcaster_user_id: broadcaster_id },
        transport: { method: 'webhook', callback: WEBHOOK_URL, secret },
      }),
    });

    // Create channel.subscription.message subscription (resubs)
    const createRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'channel.subscription.message',
        version: '1',
        condition: { broadcaster_user_id: broadcaster_id },
        transport: { method: 'webhook', callback: WEBHOOK_URL, secret },
      }),
    });

    const data = await createRes.json();
    return res.status(200).json({ ok: true, last: data });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao registrar EventSub' });
  }
}
