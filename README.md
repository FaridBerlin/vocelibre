<p align="center">
  <img src="src/assets/logo.svg" alt="VoceLibre" width="120" />
</p>

<h1 align="center">VoceLibre</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat" alt="Platform" />
  <img src="https://img.shields.io/badge/account-none%20required-brightgreen?style=flat" alt="No account required" />
</p>

<p align="center">
  Free voice. No account, no email, no cloud required.<br/>
  Privacy-first, fully local voice-to-text dictation. Press a hotkey, speak, and your words appear at your cursor — entirely on your own machine.
</p>

---

VoceLibre is a local-first fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr), stripped down and focused on one thing: dictation that works completely offline, with **zero registration** — no email, no Google/Microsoft sign-in, nothing. Your voice never leaves your device. It's free software, sustained by donations rather than subscriptions or accounts.

## Quick start

```bash
git clone <this-repo-url>
cd vocelibre
npm install
npm run dev
```

Requires Node.js 24+. On first run, pick **local** setup, download a Whisper model (e.g. `base`, ~142MB), and skip sign-in entirely — no account is ever required for dictation.

> On Intel Macs, live speaker identification and voice fingerprinting are unavailable (ONNX Runtime [stopped shipping macOS x86_64 binaries](https://github.com/microsoft/onnxruntime/releases/tag/v1.24.1)). Meetings still record and transcribe normally, and notes search falls back to keyword matching.

## Features

- **Voice dictation** — global hotkey to dictate into any app with automatic pasting
- **Dictation translation** — dedicated hotkey to dictate in one language and paste the text in another
- **AI agent** — talk to GPT-5, Claude, Gemini, Groq, Tinfoil, OpenRouter, or local models with a named voice assistant
- **Voice Assistant hotkey** — dedicated hotkey that sends what you say straight to your AI assistant as a command, no wake word needed and no cleanup pass; highlighted text is edited in place. With auto-paste enabled, answers paste at a focused text cursor or stream into a floating panel and copy to the clipboard when no writable cursor is available. You can also opt in to sending a screenshot of your current screen as context
- **Meeting transcription** — auto-detect Zoom, Teams, and FaceTime calls with live speaker diarization, voice fingerprinting, and Google, Microsoft, or Apple Calendar integration
- **Local speaker diarization** — on-device speaker labelling with voice fingerprint recognition across meetings, no cloud required
- **Notes** — create, organize, and search notes with folders, semantic search, cloud sync, and AI actions
- **Team spaces & sharing** — free for signed-in users; share notes on the web with link, domain, or invite-only visibility, and collaborate in team spaces with roles, invitations, and server-enforced membership
- **Audio import** — transcribe existing audio and video: drag in files, batch-upload, or paste a YouTube/audio URL, with optional speaker detection
- **Local or cloud — your choice** — all core features (transcription, AI reasoning, speaker diarization, semantic search) work with local models or cloud providers — including GPU-accelerated local Whisper on Metal, CUDA, and Vulkan (AMD/Intel)
- **Enterprise controls** — enforce organization policy, company SSO and SCIM, and centrally managed Amazon Bedrock or Azure OpenAI access without distributing cloud keys
- **Public API & MCP** — manage notes and transcriptions programmatically or connect your AI assistant via the [MCP server](https://docs.openwhispr.com/integrations/mcp)

## Documentation

VoceLibre is a rebrand of OpenWhispr's local-dictation path, so most of the upstream docs still apply. Visit **[docs.openwhispr.com](https://docs.openwhispr.com)** for:

- [Getting started](https://docs.openwhispr.com/quickstart)
- [Platform guides](https://docs.openwhispr.com/platform/macos) (macOS, Windows, Linux)
- [API reference](https://docs.openwhispr.com/api/overview)
- [MCP server setup](https://docs.openwhispr.com/integrations/mcp)
- [Troubleshooting](https://docs.openwhispr.com/troubleshooting)

Repo examples:

- [Custom ASR shim](examples/custom-asr-shim/) for Self-Hosted transcription against non-OpenAI-compatible ASR APIs

## Tech stack

React 19, TypeScript, Tailwind CSS v4, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, shadcn/ui

## Support

VoceLibre is free software. If it's useful to you, consider supporting development via donations rather than a subscription — no account required to use it, none required to support it either.

## Contributing

We welcome contributions. Fork the repo, create a feature branch, and open a pull request.

## License

[MIT](LICENSE) — free for personal and commercial use. VoceLibre is a fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr) (also MIT); the original copyright notice is preserved in [LICENSE](LICENSE).

## Acknowledgments

- **[OpenAI Whisper](https://github.com/openai/whisper)** — speech recognition model powering local and cloud transcription
- **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** — high-performance C++ implementation for local processing
- **[NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)** — fast multilingual ASR model
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** — cross-platform ONNX runtime for Parakeet inference
- **[Hugging Face](https://huggingface.co/)** — model hub hosting Whisper, Parakeet, and embedding model weights
- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — local LLM inference for AI text processing
- **[Electron](https://www.electronjs.org/)** — cross-platform desktop framework
- **[React](https://react.dev/)** — UI component library
- **[shadcn/ui](https://ui.shadcn.com/)** — accessible components built on Radix primitives
- **[OpenWhispr](https://github.com/OpenWhispr/openwhispr)** — the project VoceLibre is forked from
