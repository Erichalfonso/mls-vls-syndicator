# MLS VLS Syndicator

**Automated real estate listing syndication from MLS to VLS Homes.**

A Windows desktop application that fetches active listings from the Bridge MLS API (RESO standard) and automatically posts them to [VLS Homes](https://vlshomes.com) using browser automation. Built for real estate agents who need to keep their VLS storefront in sync with MLS data without manual data entry.

---

## Features

- **MLS API Integration** — Pulls listings from Bridge Interactive using the RESO Web API standard
- **Automated VLS Posting** — Fills out listing forms, selects property options, and uploads photos via Puppeteer
- **Smart Field Mapping** — Translates MLS data to VLS form fields (property type, address parsing, amenities)
- **Multi-Image Upload** — Downloads listing photos from MLS and uploads them to VLS in order
- **Rent/Sale Detection** — Automatically determines listing type from MLS classification codes
- **MLS Attribution** — Appends required MLS compliance text to listing descriptions
- **Airtable Tracking** — Optional sync tracking via Airtable to manage which listings have been posted
- **Duplicate Prevention** — Tracks previously synced listings with a local JSON database
- **Auto-Update** — Checks for new releases from GitHub and prompts to install updates
- **Encrypted Credentials** — Stores API keys and passwords securely with electron-store encryption

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                             │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  React UI │◄──►│  Sync Engine │───►│  Session Logger       │  │
│  │  Settings │    │  Orchestrator│    │  (JSON sync history)  │  │
│  │  Sync     │    └──────┬───────┘    └──────────────────────┘  │
│  │  History  │           │                                      │
│  └───────────┘     ┌─────┴──────┐                               │
│                    │            │                                │
│              ┌─────▼────┐ ┌────▼──────────┐                     │
│              │ MLS API  │ │ VLS Poster    │                     │
│              │ Client   │ │ (Puppeteer)   │                     │
│              └─────┬────┘ └────┬──────────┘                     │
│                    │           │                                 │
└────────────────────┼───────────┼────────────────────────────────┘
                     │           │
               ┌─────▼────┐ ┌───▼──────────┐
               │ Bridge   │ │ VLS Homes    │
               │ MLS API  │ │ vlshomes.com │
               │ (RESO)   │ └──────────────┘
               └──────────┘
```

---

## Tech Stack

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-23-40B5A4?logo=puppeteer&logoColor=white)

---

## Screenshots

> **TODO:** Add screenshots of the app UI here.
>
> Suggested screenshots:
> - Settings panel with credential fields
> - Sync in progress with listing count
> - Results log showing posted/skipped/failed listings

---

## Installation

### Download

Download the latest Windows installer from the [Releases](https://github.com/Erichalfonso/mls-vls-syndicator/releases) page.

Run the `.exe` installer — the app will install and launch automatically.

### First-Time Setup

1. Open the **Settings** tab
2. Enter your Bridge MLS API credentials (server token, MLS ID)
3. Enter your VLS Homes login (email and password)
4. Optionally configure Airtable integration for sync tracking
5. Set your search criteria (location, price range, bedrooms)
6. Click **Save**

---

## Configuration

The app requires the following credentials to operate. See [`.env.example`](.env.example) for a template.

| Credential | Required | Source |
|---|---|---|
| Bridge MLS Server Token | Yes | [Bridge Interactive](https://www.bridgeinteractive.com/) |
| MLS ID / MLS Name | Yes | Your MLS provider |
| VLS Homes Email | Yes | Your VLS Homes account |
| VLS Homes Password | Yes | Your VLS Homes account |
| Airtable API Key | No | [Airtable](https://airtable.com/) (for sync tracking) |

All credentials are stored locally using encrypted storage — they are never sent to any third-party service.

---

## Development

```bash
# Clone the repository
git clone https://github.com/Erichalfonso/mls-vls-syndicator.git
cd mls-vls-syndicator

# Install dependencies
npm install

# Run in development mode (Vite dev server)
npm run dev

# Build for production
npm run build

# Launch Electron app
npm run electron

# Build + Launch
npm run start

# Package as Windows installer
npm run dist

# Run tests
npm run test
```

---

## Project Structure

```
mls-vls-syndicator/
├── src/
│   ├── main.ts                  # Electron main process (window, IPC, tray, auto-update)
│   ├── preload.ts               # Secure IPC bridge
│   │
│   ├── ui/                      # React frontend
│   │   ├── App.tsx              # Main app with tab navigation
│   │   ├── Settings.tsx         # Credential & search criteria forms
│   │   ├── SyncPanel.tsx        # Sync controls & progress display
│   │   ├── ResultsLog.tsx       # Sync history viewer
│   │   ├── UpdateNotification.tsx # Auto-update prompt
│   │   ├── index.tsx            # React entry point
│   │   └── styles.css           # Dark theme styles
│   │
│   ├── mls/                     # MLS data layer
│   │   ├── api-client.ts        # Bridge MLS RESO API client
│   │   ├── image-downloader.ts  # Photo download with retry logic
│   │   └── types.ts             # TypeScript interfaces
│   │
│   ├── vls/                     # VLS Homes automation
│   │   ├── poster.ts            # Puppeteer browser automation
│   │   └── field-mapping.ts     # MLS → VLS field translation
│   │
│   ├── airtable/                # Airtable integration
│   │   └── client.ts            # Sync tracking via Airtable API
│   │
│   └── sync/                    # Sync orchestration
│       ├── engine.ts            # Core sync logic & scheduling
│       ├── database.ts          # Local JSON sync database
│       └── logger.ts            # Session logging
│
├── assets/                      # App icons
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Erich Alfonso
