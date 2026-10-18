/**
 * The iframe host page shipped by `sothspell export --embed`. It is a plain
 * static document: no inline scripts, no external origins, and the same
 * player bundle the custom element uses. The page marks its body so the
 * bundle's iframe bridge takes over and speaks `postMessage`.
 */
export function renderIframePage(title: string): string {
  const escaped = title
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'"
    />
    <title>${escaped} — Sóþspell</title>
    <link rel="stylesheet" href="./player.css" />
  </head>
  <body class="sothspell-iframe">
    <sothspell-tour id="sothspell-iframe-player"></sothspell-tour>
    <script type="module" src="./player.js"></script>
  </body>
</html>
`;
}
