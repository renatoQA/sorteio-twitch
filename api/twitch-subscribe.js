const CLIENT_ID = 'bso3queqhjj7epoc18d9tfomtmthbm';
const WEBHOOK_URL = 'https://sorteio-twitch.vercel.app/api/twitch-webhook';

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
    // Delete any existing channel.chat.message subscriptions for this broadcaster
    const listRes = await fetch(
      `https://api.twitch.tv/helix/eventsub/subscriptions?type=channel.chat.message`,
      { headers }
    );
    const listData = await listRes.json();
    const existing = (listData.data || []).filter(
      s => s.condition.broadcaster_user_id === broadcaster_id
    );
    await Promise.all(
      existing.map(s =>
        fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${s.id}`, {
          method: 'DELETE',
          headers,
        })
      )
    );

    // Create fresh subscription
    const createRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'channel.chat.message',
        version: '1',
        condition: { broadcaster_user_id: broadcaster_id, user_id },
        transport: {
          method: 'webhook',
          callback: WEBHOOK_URL,
          secret,
        },
      }),
    });

    const data = await createRes.json();
    return res.status(createRes.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao registrar EventSub' });
  }
}
