const BASE_URL = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!process.env.RUNWAY_API_KEY) {
    return res.status(500).json({ error: 'missing_runway_api_key' });
  }

  const sessionId = req.body?.sessionId;
  if (!sessionId) {
    return res.status(400).json({ error: 'missing_session_id' });
  }

  const response = await fetch(`${BASE_URL}/v1/realtime_sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
      'X-Runway-Version': RUNWAY_VERSION,
      Accept: '*/*',
    },
  });

  if (response.status === 204) {
    return res.status(200).json({ ok: true });
  }

  const text = await response.text();
  return res.status(response.status).json({
    error: 'stop_session_failed',
    details: text,
  });
}
