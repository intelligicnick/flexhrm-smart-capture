# FlexHRM Smart Capture API

Base URL: `{FLEXHRM_URL}/api/smart-capture`

Authentication: `Authorization: Bearer {token}`

Required permissions: `employees` (view/edit) or `admin`

---

## Health Check

```
GET /health
```

**Response:**
```json
{
  "success": true,
  "service": "smart-capture",
  "version": "1.0.0",
  "timestamp": "2026-06-16T12:00:00.000Z"
}
```

---

## AI Extraction

```
POST /extract
```

**Body:**
```json
{
  "content": "John Doe\njohn@example.com\n+91 9876543210",
  "sourceType": "text",
  "captureMode": "selection"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "fullName": "John Doe",
    "email": "john@example.com",
    "mobile": "9876543210",
    "skills": [],
    "experience": [],
    "education": [],
    "fieldConfidences": [
      { "field": "email", "confidence": 0.95, "value": "john@example.com" }
    ],
    "overallConfidence": 0.85
  }
}
```

Uses OpenAI when `OPENAI_API_KEY` is configured; falls back to rule-based extraction.

---

## Duplicate Check

```
POST /duplicate-check
```

**Body:**
```json
{
  "email": "john@example.com",
  "mobile": "9876543210",
  "fullName": "John Doe",
  "organizationId": "default"
}
```

**Response:**
```json
{
  "hasDuplicates": true,
  "matches": [
    {
      "type": "candidate",
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "mobile": "9876543210",
      "matchReason": ["email"]
    }
  ]
}
```

---

## Candidates

```
GET /candidates?organizationId=default
POST /candidates
```

**Create body:** All candidate fields (fullName, email, mobile, skills, experience, education, etc.)

---

## Leads

```
GET /leads?organizationId=default
POST /leads
```

---

## Contacts

```
GET /contacts?organizationId=default
POST /contacts
```

---

## Documents

```
POST /documents
```

**Body:**
```json
{
  "recordType": "candidate",
  "recordId": "uuid",
  "fileName": "resume.pdf",
  "mimeType": "application/pdf",
  "contentBase64": "...",
  "category": "resume",
  "notes": "Uploaded via Smart Capture"
}
```

---

## Notes

```
POST /notes
```

**Body:**
```json
{
  "recordType": "candidate",
  "recordId": "uuid",
  "content": "Follow up next week"
}
```

---

## Bulk Save

```
POST /bulk
```

**Body:**
```json
{
  "records": [
    { "type": "candidate", "data": { "fullName": "Jane", "email": "jane@test.com" } },
    { "type": "lead", "data": { "name": "Acme Corp", "email": "info@acme.com" } }
  ]
}
```

---

## Activity Logs

```
GET /activity-logs?organizationId=default
```

---

## Extension Settings (Admin)

```
GET /settings?organizationId=default
POST /settings
```

**Body:**
```json
{
  "organizationId": "default",
  "flexhrmUrl": "https://api.flexhrm.example.com",
  "apiKey": "optional-api-key",
  "allowedOrigins": ["chrome-extension://extension-id"]
}
```

---

## Database Schema Summary

### capture_candidates
Primary recruiting records with full profile fields, confidence scores, source metadata.

### capture_leads
Lightweight lead records with status tracking.

### capture_contacts
Contact directory entries.

### captured_content
Documents, resumes, screenshots, and notes linked to records.

### capture_activity_logs
Immutable audit trail (action, username, recordType, recordId, summary).

### extension_api_settings
Per-organization API configuration with hashed API keys.
