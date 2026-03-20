const BASE_URL = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runwayFetch(path, { method = 'GET', body, bearerToken } = {}) {
  const token = bearerToken || process.env.RUNWAY_API_KEY;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Runway-Version': RUNWAY_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (method === 'DELETE' && response.status === 204) {
    return { ok: true, data: null };
  }

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data,
    };
  }

  return {
    ok: true,
    data,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!process.env.RUNWAY_API_KEY) {
    return res.status(500).json({ error: 'missing_runway_api_key' });
  }

  const avatarId = req.body?.avatarId;
  const maxDuration = req.body?.maxDuration || 300;

  if (!avatarId) {
    return res.status(400).json({ error: 'missing_avatar_id' });
  }

  const created = await runwayFetch('/v1/realtime_sessions', {
    method: 'POST',
    body: {
      model: 'gwm1_avatars',
      avatar: {
        type: 'custom',
        avatarId,
      },
      maxDuration,
    },
  });

  if (!created.ok) {
    return res.status(created.status).json({
      error: 'create_session_failed',
      details: created.error,
    });
  }

  const sessionId = created.data?.id;
  if (!sessionId) {
    return res.status(500).json({
      error: 'missing_session_id',
      details: created.data,
    });
  }

  let readySession = null;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const session = await runwayFetch(`/v1/realtime_sessions/${sessionId}`);

    if (!session.ok) {
      return res.status(session.status).json({
        error: 'retrieve_session_failed',
        details: session.error,
      });
    }

    const status = session.data?.status;

    if (status === 'READY') {
      readySession = session.data;
      break;
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      return res.status(500).json({
        error: 'session_failed',
        details: session.data,
      });
    }

    await wait(2000);
  }

  if (!readySession?.sessionKey) {
    return res.status(504).json({
      error: 'session_not_ready',
      details: { sessionId },
    });
  }

  const consumed = await runwayFetch(`/v1/realtime_sessions/${sessionId}/consume`, {
    method: 'POST',
    bearerToken: readySession.sessionKey,
  });

  if (!consumed.ok) {
    return res.status(consumed.status).json({
      error: 'consume_session_failed',
      details: consumed.error,
    });
  }

  return res.status(200).json({
    sessionId,
    serverUrl: consumed.data?.url,
    token: consumed.data?.token,
    roomName: consumed.data?.roomName,
  });
}
