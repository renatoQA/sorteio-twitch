const CLIENT_ID = 'bso3queqhjj7epoc18d9tfomtmthbm';
const BOT_MSG = '🎲 Mande #tailung no chat e ganhe +15min na Area do Tailung! (só pra quem já fez check-in)';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { access_token, broadcaster_id, sender_id } = req.body || {};
  if (!access_token || !broadcaster_id || !sender_id) {
    return res.status(400).json({ error: 'Parâmetros faltando' });
  }

  try {
    const r = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Client-Id': CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ broadcaster_id, sender_id, message: BOT_MSG }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
}
