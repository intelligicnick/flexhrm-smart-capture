# FlexHRM Smart Capture — Installation Guide

## Prerequisites

- Google Chrome 114+ (Side Panel API)
- FlexHRM backend running (NestJS API on port 3001 by default)
- Node.js 20+
- Optional: OpenAI API key for enhanced AI extraction (`OPENAI_API_KEY` in backend `.env`)

## 1. Start FlexHRM API

```bash
cd /path/to/flexhrm
npm run dev:backend
```

The API is available at `http://localhost:3001/api`.

## 2. Build the Chrome Extension

```bash
cd chrome-extension
npm install
npm run build
```

The production build is output to `chrome-extension/dist/`.

## 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome-extension/dist` folder

## 4. Configure API Access

1. Click the FlexHRM extension icon → **Settings**
2. Enter:
   - **FlexHRM URL**: `http://localhost:3001` (or your production URL)
   - **Access Token**: Login via `POST /api/auth/login` and paste the `token`
   - **Organization ID**: `default` (or your org ID)
   - **Your Name**: Displayed in capture audit logs
3. Click **Test Connection** then **Save**

## 5. Get an Access Token

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

Use the `token` from the response in extension settings.

## 6. Usage

1. Browse any website or PDF
2. Use the floating **FH** button or highlight text → **Save to FlexHRM**
3. Review extracted fields in the **Side Panel**
4. Edit, run duplicate check, and **Save to FlexHRM**

## Development Mode

```bash
cd chrome-extension
npm run dev
```

Load the `dist` folder after the dev server starts. HMR is supported via CRXJS.

## Running Tests

```bash
cd chrome-extension
npm test
```
