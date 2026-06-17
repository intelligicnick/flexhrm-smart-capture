# Database Schema — FlexHRM Smart Capture

## capture_candidates

| Field | Type | Description |
|---|---|---|
| id | string (UUID) | Primary identifier |
| organizationId | string | Tenant/org scope |
| fullName, email, mobile | string | Core identity (indexed) |
| address, currentLocation, dateOfBirth | string | Personal info |
| skills | string[] | Technical/soft skills |
| experience | object[] | { company, designation, duration, description } |
| currentCompany, previousCompanies | string / string[] | Employment |
| designation, industry | string | Role context |
| salary, expectedSalary, noticePeriod | string | Compensation |
| education | object[] | { degree, college, university, passingYear } |
| certifications, languages | string[] | Additional profile data |
| linkedInUrl, portfolioUrl | string | Social links |
| sourceUrl, sourceTitle, sourceSite | string | Capture provenance |
| capturedBy | string | Admin username |
| rawContent | string | Original text |
| fieldConfidences | object[] | { field, confidence, value } |
| overallConfidence | number | 0–1 aggregate score |
| status | string | draft \| saved |
| employeeId | string | Link to employees collection |
| metadata | object | Extensible metadata |
| createdAt, updatedAt | Date | Auto timestamps |

## capture_leads

| Field | Type | Description |
|---|---|---|
| id | string | Primary key |
| organizationId | string | Tenant scope |
| name, email, mobile | string | Lead identity (indexed) |
| company, designation | string | Business context |
| source, sourceUrl | string | Origin |
| notes | string | Free text |
| capturedBy | string | Username |
| status | string | new \| qualified \| converted |
| extractedData | object | Raw AI output |
| metadata | object | Extensions |

## capture_contacts

| Field | Type | Description |
|---|---|---|
| id | string | Primary key |
| organizationId | string | Tenant scope |
| name, email, mobile | string | Contact identity (indexed) |
| company, role, address | string | Profile |
| sourceUrl | string | Origin URL |
| capturedBy | string | Username |
| extractedData | object | AI extraction |
| metadata | object | Extensions |

## captured_content

| Field | Type | Description |
|---|---|---|
| id | string | Primary key |
| organizationId | string | Tenant scope |
| type | string | document \| resume \| note \| screenshot |
| sourceUrl, sourceTitle, sourceSite | string | Provenance |
| capturedBy | string | Username |
| content | string | Text content / notes |
| contentMimeType | string | MIME type |
| contentBase64 | string | Binary payload |
| structuredData | object | Parsed table/JSON |
| linkedRecordType | string | candidate \| lead \| contact |
| linkedRecordId | string | Foreign key |
| metadata | object | fileName, category, etc. |

## capture_activity_logs

| Field | Type | Description |
|---|---|---|
| id | string | Primary key |
| organizationId | string | Tenant scope |
| action | string | CANDIDATE_CREATED, DOCUMENT_UPLOADED, etc. |
| username | string | Actor |
| recordType | string | Entity type |
| recordId | string | Entity ID |
| sourceUrl | string | Page URL |
| summary | string | Human-readable description |
| details | object | Structured payload |
| createdAt | Date | Timestamp |

## extension_api_settings

| Field | Type | Description |
|---|---|---|
| organizationId | string | Primary key |
| flexhrmUrl | string | API base URL |
| apiKeyHash | string | Hashed API key (not returned) |
| apiKeyPrefix | string | First 8 chars for identification |
| enabled | boolean | Active flag |
| createdBy | string | Admin who configured |
| allowedOrigins | string[] | CORS/extension origins |
| metadata | object | Extensions |
