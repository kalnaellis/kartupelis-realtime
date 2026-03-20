# kartupelis-realtime

Realtime Kartupelis character for `kartupelis.tv/atmosanas/`.

## Stack

- Runway realtime avatars
- LiveKit transport
- Three.js presentation layer
- Vercel serverless proxy
- GitHub-backed deploys

## Required Vercel environment variable

`RUNWAY_API_KEY`

## Runtime flow

1. `POST /api/runway`
2. Create Runway realtime session
3. Poll until status is `READY`
4. Consume the session with `sessionKey`
5. Return LiveKit credentials to the browser
6. Browser connects and maps avatar video into a Three.js scene

## Notes

- The Runway API key stays server-side.
- `/atmosanas/` is supported through `vercel.json` rewrites.
- `POST /api/runway-stop` cancels the active Runway session.
