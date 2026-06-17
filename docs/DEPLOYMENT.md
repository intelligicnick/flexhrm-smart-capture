# FlexHRM Smart Capture — Deployment Guide

## Backend Deployment

### Environment Variables

Add to your FlexHRM backend `.env`:

```env
OPENAI_API_KEY=sk-...          # Optional: enables GPT extraction
OPENAI_MODEL=gpt-4o-mini        # Optional: default model
MONGODB_URI=mongodb://...       # Required
CORS_ORIGINS=https://your-frontend.com
```

### MongoDB Collections

The Smart Capture module creates these collections automatically:

| Collection | Purpose |
|---|---|
| `capture_candidates` | Captured candidate profiles |
| `capture_leads` | Sales/recruiting leads |
| `capture_contacts` | Business contacts |
| `captured_content` | Documents, notes, screenshots |
| `capture_activity_logs` | Audit trail for extension actions |
| `extension_api_settings` | Per-org API configuration |

### API Endpoints

All endpoints are under `/api/smart-capture/` and require Bearer authentication.

See [API.md](./API.md) for full documentation.

### Production Checklist

- [ ] HTTPS enabled on FlexHRM API
- [ ] CORS configured for extension origins (`chrome-extension://*`)
- [ ] `OPENAI_API_KEY` set for production AI extraction
- [ ] MongoDB indexes created (automatic via Mongoose schemas)
- [ ] Admin users have `employees` edit permission for saves

## Extension Deployment

### Build for Production

```bash
cd chrome-extension
npm ci
npm run build
```

### Package for Chrome Web Store

```bash
cd dist
zip -r ../flexhrm-smart-capture.zip .
```

Upload `flexhrm-smart-capture.zip` to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

### Enterprise Deployment (Policy)

Distribute via Group Policy using the extension ID and `update_url`, or force-install via Google Admin Console:

1. Host the `.crx` or use Chrome Web Store private listing
2. Admin Console → Devices → Chrome → Apps & extensions
3. Add FlexHRM Smart Capture by ID
4. Pre-configure settings via managed storage (optional)

### Security Hardening

- Extension stores credentials encrypted with AES-GCM (PBKDF2-derived key)
- API communication requires HTTPS in production
- All save operations create audit log entries
- Duplicate detection runs before candidate creation

## Monitoring

- Check `/api/smart-capture/health` for service status
- Review `capture_activity_logs` collection for usage analytics
- Extension local audit logs stored in `chrome.storage.local` under `audit_logs`
