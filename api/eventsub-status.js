const CLIENT_ID = 'bso3queqhjj7epoc18d9tfomtmthbm';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { access_token } = req.body || {};
  if (!access_token) return res.status(400).json({ error: 'Token necessário' });

  try {
    const r = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': CLIENT_ID },
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao verificar' });
  }
}
