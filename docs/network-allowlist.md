# Network Allowlist

Outbound hosts the VoceLibre desktop app contacts. For firewall, proxy, and
DNS filter configuration.

All connections are client-initiated over TLS. No inbound ports.

## Required by default

The app has no backend of its own: nothing is contacted until you download a
model or configure a feature. The only unconditional host is the update check.

| Host                                          | Protocol | Port | Purpose                                                                            |
| --------------------------------------------- | -------- | ---- | ---------------------------------------------------------------------------------- |
| `github.com`, `objects.githubusercontent.com` | HTTPS    | 443  | Application auto-update (release artifacts via electron-updater, GitHub provider). |

## Required for model downloads

Contacted when downloading a Whisper, Parakeet, diarization, embedding or GGUF
reasoning model, and for the bundled sidecar binaries. Once downloaded,
transcription and reasoning run offline.

| Host                                                    | Protocol | Port | Purpose                                                                     |
| ------------------------------------------------------- | -------- | ---- | --------------------------------------------------------------------------- |
| `huggingface.co`                                        | HTTPS    | 443  | Whisper GGML, Parakeet, GGUF, and embedding model downloads.                |
| `cdn-lfs.huggingface.co`, `cdn-lfs-us-1.huggingface.co` | HTTPS    | 443  | HuggingFace large-file CDN (LFS-backed model files).                        |
| `github.com`, `objects.githubusercontent.com`           | HTTPS    | 443  | sherpa-onnx, llama.cpp, whisper.cpp, and Qdrant binaries (GitHub releases). |

## Required for Google Calendar (optional feature)

Contacted only if the user connects Google Calendar. The OAuth redirect is a
loopback server on `127.0.0.1` and its result page is served locally, so no
third-party callback host is involved.

| Host                    | Protocol | Port | Purpose                          |
| ----------------------- | -------- | ---- | -------------------------------- |
| `accounts.google.com`   | HTTPS    | 443  | OAuth authorization.             |
| `oauth2.googleapis.com` | HTTPS    | 443  | OAuth token exchange and revoke. |
| `www.googleapis.com`    | HTTPS    | 443  | Calendar event and list reads.   |

## Required for Microsoft Calendar (optional feature)

| Host                    | Protocol | Port | Purpose                                     |
| ----------------------- | -------- | ---- | ------------------------------------------- |
| `login.microsoftonline.com` | HTTPS | 443 | OAuth authorization and token exchange.     |
| `graph.microsoft.com`   | HTTPS    | 443  | Calendar event reads (`calendarView/delta`). |

## Required for URL audio import (optional feature)

Contacted only when a user pastes a URL into the Upload view to download and
transcribe its audio. Downloads are HTTPS-only and hosts resolving to
private/internal addresses are rejected.

| Host                                | Protocol | Port | Purpose                                                                    |
| ----------------------------------- | -------- | ---- | -------------------------------------------------------------------------- |
| `www.youtube.com`, `youtube.com`, `youtu.be`, `m.youtube.com`, `music.youtube.com` | HTTPS | 443 | YouTube page/metadata fetch for pasted YouTube links (bundled yt-dlp).     |
| `*.googlevideo.com`                 | HTTPS    | 443  | YouTube media CDN — the actual audio stream download.                      |
| _User-pasted hosts_                 | HTTPS    | 443  | Direct audio/video URL imports contact whatever public host the user pastes. |

## Self-hosted endpoint (only if configured)

If you point transcription or reasoning at your own OpenAI-compatible server,
allowlist that host. Nothing else is contacted for inference.

## Notes

- The app uses Electron's network stack, which honors system proxy settings
  (macOS System Settings, Windows Internet Options / WPAD, GNOME proxy) and
  PAC scripts on all platforms.
- Connections fail with `ENOTFOUND` if DNS is filtered, `ECONNREFUSED` /
  `ETIMEDOUT` if a firewall blocks the host, and `CERT_HAS_EXPIRED` /
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE` if a TLS-intercepting proxy is in the
  path without its root certificate trusted by the OS.
- IP-pinning is not supported. The hosts above resolve to provider-managed
  IPs that change without notice.
- On minimal Linux containers without a system CA bundle (Alpine, distroless),
  set `NODE_EXTRA_CA_CERTS` to your CA bundle path so corporate TLS interception
  is trusted.

## How to test

Run from a machine on the same network as the user. A successful response
(any HTTP status, including `401`) confirms the network path works.

```sh
# Update check
curl -v -I https://github.com

# Model downloads
curl -v -I https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
```

If a request returns `Could not resolve host`, the DNS layer (resolver,
filter, or ad blocker) is blocking the domain. If it hangs or returns
`Connection refused`, a firewall is blocking the port. If it returns a TLS
error, a proxy is intercepting the connection without a trusted root.
