// Minimal Node HTTP entry: `dist/server/server.js` exports a Web-standard
// `{ fetch }` handler (no built-in listener at this TanStack Start version),
// so this wraps it in `node:http` for `node server.entry.mjs` deployment.
import { createServer } from 'node:http';

import server from './dist/server/server.js';

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? '0.0.0.0';

createServer(async (req, res) => {
  const url = `http://${req.headers.host ?? `${host}:${port}`}${req.url}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : ReadableStream.from(req);

  const request = new Request(url, {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([key, value]) =>
      value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((v) => [key, v]),
    ),
    body,
    duplex: 'half',
  });

  const response = await server.fetch(request);

  res.statusCode = response.status;
  for (const [key, value] of response.headers) res.setHeader(key, value);
  if (response.body) {
    for await (const chunk of response.body) res.write(chunk);
  }
  res.end();
}).listen(port, host, () => {
  console.log(`Ekoz web client listening on http://${host}:${port}`);
});
