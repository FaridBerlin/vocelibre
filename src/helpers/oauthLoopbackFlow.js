const http = require("http");
const crypto = require("crypto");
const { openExternalUrl } = require("./externalUrlOpener");

const OAUTH_TIMEOUT_MS = 120000;

// Thrown by handleCallback to control the error code shown on the result page
// (defaults to "server_error").
class OAuthFlowError extends Error {
  constructor(redirectCode, message) {
    super(message);
    this.redirectCode = redirectCode;
  }
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}

// The loopback server renders its own result page rather than redirecting the
// browser to a hosted one. Nothing leaves the machine, and the flow still
// finishes when the app is offline or the host is unreachable.
function renderResultPage(res, { ok, detail }) {
  const title = ok ? "Connected" : "Connection failed";
  const body = ok
    ? "You can close this tab and return to VoceLibre."
    : `VoceLibre could not complete the connection${detail ? ` (${escapeHtml(detail)})` : ""}. You can close this tab and try again.`;
  res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8" />` +
      `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
      `<title>VoceLibre — ${title}</title>` +
      `<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:flex;` +
      `align-items:center;justify-content:center;font:16px/1.5 system-ui,-apple-system,` +
      `"Segoe UI",sans-serif;background:#faf9f7;color:#1c1b19}` +
      `@media(prefers-color-scheme:dark){body{background:#17161a;color:#eceaf0}}` +
      `main{max-width:26rem;padding:2rem;text-align:center}` +
      `h1{margin:0 0 .5rem;font-size:1.25rem}p{margin:0;opacity:.7}</style></head>` +
      `<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`
  );
}

// Runs a PKCE auth-code flow through an ephemeral 127.0.0.1 server:
// - buildAuthUrl(redirectUri, state, codeChallenge) → provider authorize URL
// - handleCallback(code, redirectUri, codeVerifier) → resolves the flow result;
//   called once with a state-validated code, throws (OAuthFlowError for a
//   specific callback-page code) to reject.
function runOAuthLoopbackFlow({ buildAuthUrl, handleCallback }) {
  return new Promise((resolve, reject) => {
    const codeVerifier = crypto.randomBytes(32).toString("base64url").slice(0, 43);
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const state = crypto.randomBytes(32).toString("hex");
    let callbackClaimed = false;

    const server = http.createServer(async (req, res) => {
      // Accepted requests can outlive server.close(), so only the first
      // terminal callback may settle the flow or exchange a code.
      if (callbackClaimed) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h3>Invalid request.</h3></body></html>");
        return;
      }

      try {
        const url = new URL(req.url, `http://127.0.0.1`);
        const returnedState = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          callbackClaimed = true;
          renderResultPage(res, { ok: false, detail: error });
          cleanup();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h3>Invalid request.</h3></body></html>");
          // A real callback with a code but the wrong state is a failed
          // attempt (stale tab, CSRF). Fail the flow now. A request with no
          // code (favicon / bare GET) must keep waiting for the redirect.
          if (code) {
            callbackClaimed = true;
            cleanup();
            reject(new Error("OAuth state mismatch"));
          }
          return;
        }

        callbackClaimed = true;
        const redirectUri = `http://127.0.0.1:${server.address().port}`;
        const result = await handleCallback(code, redirectUri, codeVerifier);

        renderResultPage(res, { ok: true });
        cleanup();
        resolve(result);
      } catch (err) {
        callbackClaimed = true;
        renderResultPage(res, { ok: false, detail: err.redirectCode || "server_error" });
        cleanup();
        reject(err);
      }
    });

    let timeoutId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      server.close();
    };

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}`;
      // Fire-and-forget like the shell.openExternal call it replaced: a failed
      // browser launch surfaces as the flow timeout.
      openExternalUrl(buildAuthUrl(redirectUri, state, codeChallenge)).catch(() => {});
    });

    timeoutId = setTimeout(() => {
      callbackClaimed = true;
      server.close();
      reject(new Error("OAuth flow timed out"));
    }, OAUTH_TIMEOUT_MS);

    server.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

module.exports = { runOAuthLoopbackFlow, OAuthFlowError };
