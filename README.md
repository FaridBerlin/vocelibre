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

VoceLibre is local-first voice dictation, focused on one thing: dictation that works completely offline, with **zero registration** — no email, no Google/Microsoft sign-in, nothing. Your voice never leaves your device. It's free software, sustained by donations rather than subscriptions or accounts.

## Quick start

```bash
git clone https://github.com/FaridBerlin/vocelibre.git
cd vocelibre
npm install
npm run dev
```

Requires Node.js 24+. On first run, pick **local** setup, download a Whisper model (e.g. `base`, ~142MB), and skip sign-in entirely — no account is ever required for dictation.

## Development

`npm install` builds the native modules (`better-sqlite3`) against **Electron's**
ABI, which is what the app needs — but the test suite runs under plain Node, so
`npm test` fails out of the box with `ERR_DLOPEN_FAILED` /
`NODE_MODULE_VERSION` errors. Switch the build between the two targets:

```bash
npm run rebuild:node      # before running npm test
npm test

npm run rebuild:electron  # before running npm run dev / npm start again
```

The two are mutually exclusive, which is why neither is wired to a `pretest`
hook — an automatic rebuild for one target silently breaks the other. CI runs
`rebuild:node` explicitly for the same reason.

`rebuild:electron` forces `electron-rebuild` rather than reusing `postinstall`'s
`electron-builder install-app-deps`, which reports success but no-ops when the
module is already built — for the wrong ABI included.

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run format        # eslint --fix + prettier
npm run i18n:check    # locale key/placeholder parity
```

> On Intel Macs, live speaker identification and voice fingerprinting are unavailable (ONNX Runtime [stopped shipping macOS x86_64 binaries](https://github.com/microsoft/onnxruntime/releases/tag/v1.24.1)). Meetings still record and transcribe normally, and notes search falls back to keyword matching.

## Features

- **Voice dictation** — global hotkey to dictate into any app with automatic pasting
- **Dictation translation** — dedicated hotkey to dictate in one language and paste the text in another
- **AI assistant** — a named voice assistant running on a local GGUF model via llama.cpp, or on an OpenAI-compatible endpoint you host yourself
- **Voice Assistant hotkey** — dedicated hotkey that sends what you say straight to your assistant as a command, no wake word needed and no cleanup pass; highlighted text is edited in place. With auto-paste enabled, answers paste at a focused text cursor or stream into a floating panel and copy to the clipboard when no writable cursor is available. You can also opt in to sending a screenshot of your current screen as context
- **Meeting transcription** — auto-detect Zoom, Teams, and FaceTime calls with live speaker diarization, voice fingerprinting, and Google, Microsoft, or Apple Calendar integration
- **Local speaker diarization** — on-device speaker labelling with voice fingerprint recognition across meetings
- **Notes** — create, organize, and search notes with folders, on-device semantic search, and AI actions
- **Audio import** — transcribe existing audio and video: drag in files, batch-upload, or paste a YouTube/audio URL, with optional speaker detection
- **Local or self-hosted — nothing in between** — transcription, AI reasoning, speaker diarization and semantic search all run on downloaded models, with GPU-accelerated Whisper on Metal, CUDA and Vulkan (AMD/Intel). Point any of them at your own server instead if you prefer

Everything above works with no account. There is no sign-in, no cloud tier and
no telemetry to opt out of: the app talks to your machine, the model hosts you
download from, and any endpoint you configure yourself.

## Documentation

- [Local Whisper setup](LOCAL_WHISPER_SETUP.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Debugging](DEBUG.md)
- [Network allowlist](docs/network-allowlist.md)
- [Custom ASR shim](examples/custom-asr-shim/) — self-hosted transcription against non-OpenAI-compatible ASR APIs

## Tech stack

React 19, TypeScript, Tailwind CSS v4, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, shadcn/ui

## Support

VoceLibre is free software and free for everyone — no account, no subscription, no paid tier. There is nothing to buy and nothing to sign up for.

## Contributing

We welcome contributions. Fork the repo, create a feature branch, and open a pull request.

## License

[MIT](LICENSE) — free for personal and commercial use.

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
