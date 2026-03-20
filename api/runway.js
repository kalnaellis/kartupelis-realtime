const API_SECRET = process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET;
const RUNWAY_VERSION = '2024-11-06';
const BASE_URL = 'https://api.dev.runwayml.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST allowed' });
    return;
  }

  if (!API_SECRET) {
    res.status(200).json({
      credentials: null,
      message: 'Set RUNWAY_API_KEY (Runway API secret) in Vercel Project Settings to enable realtime avatar sessions.'
    });
    return;
  }

  const { avatarId = 'customer-service', personality, startScript } = req.body || {};

  try {
    const createUrl = BASE_URL + '/v1/realtime_sessions';
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + API_SECRET,
        'X-Runway-Version': RUNWAY_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gwm1_avatars',
        avatar: { type: 'custom', avatarId },
        personality,
        startScript
      })
    });

    if (!createRes.ok) {
      const details = await createRes.text();
      res.status(createRes.status).json({ error: 'create_failed', details });
      return;
    }

    const created = await createRes.json();
    const sessionId = created.id;
    const sessionKey = created.sessionKey;

    // Poll until READY
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const retrieveUrl = BASE_URL + '/v1/realtime_sessions/' + sessionId;
      const retrieveRes = await fetch(retrieveUrl, {
        headers: {
          Authorization: 'Bearer ' + API_SECRET,
          'X-Runway-Version': RUNWAY_VERSION
        }
      });

      const session = await retrieveRes.json();
      if (session.status === 'READY') {
        ready = true;
        break;
      }
      if (session.status === 'FAILED') {
        res.status(500).json({ error: 'session_failed', details: session.failure });
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!ready) {
      res.status(504).json({ error: 'session_timeout' });
      return;
    }

    // Consume credentials
    const consumeUrl = BASE_URL + '/v1/realtime_sessions/' + sessionId + '/consume';
    const consumeRes = await fetch(consumeUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + sessionKey,
        'X-Runway-Version': RUNWAY_VERSION
      }
    });

    if (!consumeRes.ok) {
      const details = await consumeRes.text();
      res.status(consumeRes.status).json({ error: 'consume_failed', details });
      return;
    }

    const credentials = await consumeRes.json();

    res.status(200).json({
      sessionId,
      serverUrl: credentials.url,
      token: credentials.token,
      roomName: credentials.roomName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
