const BASE_URL = "https://api.dev.runwayml.com";
const RUNWAY_VERSION = "2024-11-06";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, path, options) {
  const res = await fetch(BASE_URL + path, options);
  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }
  return { ok: true, json: await res.json() };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "missing_runway_api_key" });
  }

  const avatarId = req.body?.avatarId;
  if (!avatarId) {
    return res.status(400).json({ error: "missing_avatarId" });
  }

  const create = await call(apiKey, "/v1/realtime_sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      "X-Runway-Version": RUNWAY_VERSION,
    },
    body: JSON.stringify({
      model: "gwm1_avatars",
      input: {
        avatar: {
          preset: "custom",
          avatarId,
        },
      },
      useWebRTC: true,
    }),
  });

  if (!create.ok) {
    return res
      .status(create.status)
      .json({ error: "create_session_failed", details: create.body });
  }

  const sessionId = create.json?.id;
  if (!sessionId) {
    return res.status(500).json({ error: "missing_session_id", details: create.json });
  }

  let sessionKey;
  for (let i = 0; i < 30; i++) {
    const poll = await call(apiKey, "/v1/realtime_sessions/" + sessionId, {
      headers: {
        Authorization: "Bearer " + apiKey,
        "X-Runway-Version": RUNWAY_VERSION,
      },
    });

    if (!poll.ok) {
      return res
        .status(poll.status)
        .json({ error: "retrieve_session_failed", details: poll.body });
    }

    const sess = poll.json;
    if (sess.status === "READY") {
      sessionKey = sess.sessionKey;
      break;
    }

    if (sess.status === "FAILED") {
      return res
        .status(500)
        .json({ error: "session_failed", details: sess.failure || sess });
    }

    await wait(1000);
  }

  if (!sessionKey) {
    return res.status(504).json({ error: "session_timeout" });
  }

  const consume = await call(
    sessionKey,
    "/v1/realtime_sessions/" + sessionId + "/consume",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + sessionKey,
        "X-Runway-Version": RUNWAY_VERSION,
      },
    }
  );

  if (!consume.ok) {
    return res
      .status(consume.status)
      .json({ error: "consume_failed", details: consume.body });
  }

  const creds = consume.json;
  return res.status(200).json({
    sessionId,
    serverUrl: creds.url,
    token: creds.token,
    roomName: creds.roomName,
  });
}
