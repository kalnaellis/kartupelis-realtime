export default async function handler(req, res) {
  const key = process.env.RUNWAY_API_KEY;

  // Guard: allow frontend development even without a key
  if (!key) {
    res.status(200).json({
      stream_url: '',
      message: 'Set RUNWAY_API_KEY in Vercel Project Settings to enable streaming.'
    });
    return;
  }

  try {
    const runwayRes = await fetch('https://api.runwayml.com/v1/realtime', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body || {})
    });

    const data = await runwayRes.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
