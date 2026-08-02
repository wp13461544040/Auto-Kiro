<p align="center">
  <img src="frontend/assets/appicon.svg" width="100" height="100" alt="KiroX">
</p>

<h1 align="center">KiroX</h1>

<p align="center">
  Batch automation tool for AWS Builder ID (Kiro) registration
</p>

<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="README.en.md">English</a> ·
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v1.0.0-6366f1?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078d4?style=flat-square" alt="platform">
  <img src="https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go" alt="go">
  <img src="https://img.shields.io/badge/Wails-v2-red?style=flat-square" alt="wails">
   <a href="https://linux.do"><img src="https://img.shields.io/badge/LINUX%20DO-Community-f0b752?style=flat-square" alt="LINUX
   DO"></a>
  <img src="https://img.shields.io/badge/license-Apache%202.0-green?style=flat-square" alt="license">
</p>

---

## Overview

KiroX is a desktop application built on [Wails v2](https://wails.io) that automates batch registration of AWS Builder ID accounts. It supports three email sources — an Outlook mailbox pool, the MoeMail disposable mail service, and self-hosted Cloud-Mail — with built-in browser fingerprint emulation, concurrency control, proxy support, and auto-update.

---

## Features

**Registration flow**
- Full 15-step AWS Builder ID registration automation (OIDC signup → device authorization → email verification → password setup → SSO → Kiro token exchange)
- Liveness check on each account after registration
- Batch mode with configurable count, concurrency, and per-task interval

**Email sources**
- **Outlook mailbox pool** — import accounts in `email----password----clientID----RefreshToken` format; verification codes are fetched via IMAP
- **MoeMail disposable mail** — multi-domain configurations with auto-rotation; random / all / specific domain modes
- **Cloud-Mail (self-hosted)** — integrates with [cloud-mail](https://github.com/jiangrungen/cloud-mail); domains can be pulled from the server automatically; random / round-robin / specific modes

**Anti-detection**
- Randomized Chrome version (120–144)
- Randomized device fingerprints (GPU, memory, CPU cores, screen resolution)
- WebGL extension spoofing, Canvas fingerprint generation
- TLS fingerprint emulation via `tls-client`

**Data management**
- Successful accounts written as plain JSON to a configurable output directory
- Outlook account info stored locally as JSON
- Custom data directory and result directory supported

**Proxy**
- Global proxy supporting HTTP / HTTPS / SOCKS5
- Accepts both `scheme://user:pass@host:port` and the shorthand `host:port:user:pass`

**Auto-update**
- Polls the latest GitHub Release (semantic-version comparison)
- SHA256 integrity check + PE header validation on download
- Windows batch script performs the binary swap and restart after the process exits

---

## Quick start

### Use a release

Download the latest `kirox.exe` (or the matching macOS / Linux binary) from [Releases](https://github.com/wp13461544040/Auto-Kiro/releases/latest) and run it.

### Build from source

**Requirements**
- Go 1.24+
- Node.js 20+
- Wails CLI

```bash
# Install the Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Clone
git clone https://github.com/wp13461544040/Auto-Kiro.git
cd Auto-Kiro

# Dev mode (hot-reload)
wails dev

# Production build
wails build
```

The output binary is located under `build/bin/`.

---

## Usage

### 1. Configure email

**Outlook mailbox pool** (recommended)

On the Mailbox Pool page, import accounts — one per line:
```
email----password----clientID----RefreshToken
```
Batch import from `.txt` / `.csv` files is supported; you can also paste manually.

**MoeMail disposable mail**

On the Mailbox Pool page, add a MoeMail configuration with its API URL and API key, test the connection, and save. During registration you can pick random, all, or specific domains.

**Cloud-Mail (self-hosted)**

On the Mailbox Pool page, add a Cloud-Mail configuration with its base URL, admin email, and password. The domain field is optional — if empty, KiroX fetches `/api/setting/websiteConfig` from the server to populate it automatically.

### 2. Start registration

Switch to the Register page:
- Set the count, concurrency (1–5 recommended), and per-task interval (seconds)
- Choose the email source
- Click "Start"

### 3. View results

Successful accounts are streamed to the output directory (default `~/Documents/Kirox`) as `accounts.json`:

```json
[
  {
    "email": "xxx@outlook.com",
    "password": "...",
    "access_token": "...",
    "refresh_token": "...",
    "registered_at": "2026-05-31T12:00:00Z"
  }
]
```

### 4. Proxy

On the Settings page, enter a proxy in any of:
```
http://user:pass@host:port
socks5://host:port
host:port:user:pass
```
Leave blank for a direct connection.

---

## Project layout

```
kirox/
├── main.go                    # Entry; Wails initialization
├── app.go                     # App struct; methods bound to Wails
├── internal/
│   ├── core/                  # Registration core (15-step flow)
│   │   ├── registrar.go       # Registrar struct; HTTP client
│   │   ├── run.go             # Step orchestration
│   │   ├── auth.go            # Steps 1–5
│   │   ├── signup_flow.go     # Steps 6–9
│   │   ├── signup_password.go # Steps 10–12
│   │   ├── kiro_auth.go       # Steps 13–14
│   │   ├── kiro_exchange.go   # Step 15
│   │   └── verify.go          # Liveness check
│   ├── browser/               # Browser fingerprint emulation
│   ├── email/                 # Email providers (Outlook / MoeMail / Cloud-Mail)
│   ├── crypto/                # JWE encryption; XXTEA
│   ├── storage/               # Account storage; config persistence
│   ├── task/                  # Batch scheduling; concurrency
│   ├── data/                  # Result I/O
│   ├── proxy/                 # Egress IP / geo detection
│   ├── subscription/          # Subscription links: token refresh + listAvailableSubscriptions / CreateSubscriptionToken / setUserPreference
│   ├── updater/               # Auto-update
│   └── http/                  # TLS-client helpers
└── frontend/
    ├── index.html             # Single-page entry
    ├── js/                    # Per-page logic (overview / accounts / moemail / cloudmail / task / subscription / app / ui / i18n)
    ├── css/                   # Styles (layout / components / style)
    └── build.js               # Frontend build script
```

---

## Tech stack

| Layer | Technology |
|----|------|
| Desktop framework | [Wails v2](https://wails.io) |
| Backend | Go 1.24 |
| HTTP client | [bogdanfinn/tls-client](https://github.com/bogdanfinn/tls-client) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Crypto | RSA-OAEP-256 + AES-256-GCM (JWE) |

---

## Notes

- This tool is intended for learning and research. Comply with the AWS Terms of Service.
- A proxy is strongly recommended to avoid IP rate limits.
- Outlook accounts require a valid RefreshToken prepared in advance.
- High concurrency may trip AWS risk control — start low and ramp up.

---

## FAQ

### IP cleanliness

If you hit either of the errors below, the egress IP is likely flagged by AWS / Microsoft.

**Case 1: OTP 400 on email verification send**

![Case 1](docs/images/1.png)
![Case 1](docs/images/3.png)

Switch to a cleaner residential proxy.

> When using a self-hosted or disposable mailbox (MoeMail, etc.), OTP 400 can also mean the email *domain* is blacklisted by Microsoft / AWS — try a different domain.

**Case 2: Registration stalls or the mailbox is unreachable**

![Case 2](docs/images/2.png)

Try opening [outlook.live.com](https://outlook.live.com) in a real browser using the same proxy:

- Browser also fails / shows CAPTCHA → the IP is blocked by Microsoft; change the proxy
- Browser works → verify the Outlook account's RefreshToken is still valid

### macOS: "App is damaged and can't be opened"

Unsigned apps are blocked by Gatekeeper on first launch. Remove the quarantine attribute in a terminal:

```bash
xattr -cr /path/to/KiroX.app
```

Replace `/path/to/KiroX.app` with the real path (you can drag `KiroX.app` into the terminal to fill it in).

---

## Author

**wp** · [@wp13461544040](https://github.com/wp13461544040)

Copyright © 2026

---

## License

Released under the [Apache License 2.0](LICENSE).

```
Copyright 2026 wp

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
