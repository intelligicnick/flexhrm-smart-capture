# FlexHRM Smart Capture

Chrome Extension (Manifest V3) for capturing candidate and HR data from websites and PDFs with AI-powered extraction.

## Features

- Floating action button on every webpage
- Text selection, table, form, section, and image capture
- PDF text extraction with drag-and-drop upload
- OCR for scanned documents (Tesseract.js)
- AI extraction via FlexHRM backend (OpenAI or rule-based fallback)
- Review screen with confidence scores and field editing
- Duplicate detection by email, mobile, and name
- Offline queue with automatic sync
- Screenshot capture
- Secure credential storage (AES-GCM encryption)
- Side panel, popup, and settings UI

## Quick Start

```bash
# Start backend
npm run dev:backend

# Build extension
cd chrome-extension && npm install && npm run build
```

Load `chrome-extension/dist` in Chrome → Configure settings → Start capturing.

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for full setup instructions.

## Project Structure

```
chrome-extension/
├── src/
│   ├── background/       # Service worker, context menus, message routing
│   ├── content/          # FAB, selection toolbar, PDF drop zone
│   ├── sidepanel/        # Review UI, drafts, history, queue
│   ├── popup/            # Quick actions
│   ├── options/          # API configuration
│   ├── modules/
│   │   ├── ai/           # Local extraction helpers
│   │   ├── pdf/          # PDF.js integration
│   │   ├── ocr/          # Tesseract.js
│   │   ├── table/        # Table → JSON/CSV
│   │   ├── resume/       # Resume detection
│   │   └── screenshot/   # Tab capture
│   └── shared/
│       ├── types/        # TypeScript interfaces
│       ├── services/     # API, storage, encryption
│       ├── components/   # Reusable UI
│       └── utils/        # Logger
├── tests/
└── docs/
```

## Backend Integration

API module: `backend/src/modules/smart-capture/`

Endpoints: `/api/smart-capture/*`

## License

Private — FlexHRM / Intelligic Solutions
