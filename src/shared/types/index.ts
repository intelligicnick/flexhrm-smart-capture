export type CaptureType =
  | 'text'
  | 'selection'
  | 'section'
  | 'table'
  | 'image'
  | 'form'
  | 'pdf'
  | 'pdf-page'
  | 'screenshot'
  | 'resume'
  | 'gem-tender'
  | 'gem-tenders';

export type SaveTargetType = 'candidate' | 'employee' | 'lead' | 'contact' | 'tender';

export type TenderType = 'manpower' | 'travel';

export type TenderStatus =
  | 'not_filed'
  | 'not_evaluated'
  | 'filed'
  | 'technical_qualified'
  | 'qualified'
  | 'disqualified'
  | 'technical_not_open'
  | 'cancelled'
  | 'representation_asked'
  | 'challenged_representation'
  | 'financial'
  | 'won_bid';

export interface CaptureMetadata {
  sourceUrl: string;
  sourceTitle: string;
  sourceSite: string;
  capturedAt: string;
  capturedBy: string;
  captureType: CaptureType;
}

export interface FieldConfidence {
  field: string;
  confidence: number;
  value: string;
}

export interface ExperienceEntry {
  company: string;
  designation: string;
  duration: string;
  description: string;
}

export interface EducationEntry {
  degree: string;
  college: string;
  university: string;
  passingYear: string;
}

export interface ExtractedCandidateData {
  fullName: string;
  mobile: string;
  email: string;
  address: string;
  currentLocation: string;
  dateOfBirth: string;
  skills: string[];
  experience: ExperienceEntry[];
  currentCompany: string;
  previousCompanies: string[];
  designation: string;
  industry: string;
  salary: string;
  expectedSalary: string;
  noticePeriod: string;
  education: EducationEntry[];
  certifications: string[];
  languages: string[];
  linkedInUrl: string;
  portfolioUrl: string;
  fieldConfidences: FieldConfidence[];
  overallConfidence: number;
}

export interface CaptureDraft {
  id: string;
  rawContent: string;
  htmlContent?: string;
  imageBase64?: string;
  tableData?: Record<string, unknown>[];
  extracted: ExtractedCandidateData;
  metadata: CaptureMetadata;
  saveTarget: SaveTargetType;
  status: 'draft' | 'review' | 'queued' | 'saved' | 'failed';
  duplicateWarning?: boolean;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlexHRMConfig {
  flexhrmUrl: string;
  apiKey: string;
  accessToken: string;
  organizationId: string;
  username: string;
}

export interface QueuedRecord {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  payload: Record<string, unknown>;
  retries: number;
  createdAt: string;
  lastAttemptAt?: string;
  error?: string;
}

export interface DuplicateMatch {
  type: string;
  id: string;
  name: string;
  email: string;
  mobile: string;
  matchReason: string[];
}

export interface MessagePayload {
  type: string;
  payload?: unknown;
}

/** GeM portal tender — maps to FlexHRM tenders module */
export interface ExtractedTender {
  bidNo: string;
  category: string;
  ministry: string;
  organisation: string;
  consigneeOfficer: string;
  department: string;
  officerName: string;
  address: string;
  tenderType: TenderType;
  quantity: number;
  rate: string;
  additionalRequirements: string;
  endDate: string;
  startDate: string;
  filedDate: string;
  preBidAt: string;
  preBidVenue: string;
  noPreBid: boolean;
  status: TenderStatus;
  outcome: string;
  notes: string;
  /** GeM-specific fields preserved for review */
  gemItems: string;
  gemQuantity: string;
  gemStartDate: string;
  gemEndDate: string;
  gemParticipation: string;
  gemCurrentStage: string;
  gemBidDocHash: string;
  gemDocUrl: string;
  gemDocId: string;
  gemDepartmentLines: string[];
  description: string;
  entryDate: string;
  sourceUrl: string;
}

export interface TenderCaptureBatch {
  id: string;
  tenders: ExtractedTender[];
  metadata: CaptureMetadata;
  status: 'draft' | 'review' | 'saved' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_TENDER: ExtractedTender = {
  bidNo: '',
  category: '',
  ministry: '',
  organisation: '',
  consigneeOfficer: '',
  department: '',
  officerName: '',
  address: '',
  tenderType: 'manpower',
  quantity: 0,
  rate: '',
  additionalRequirements: '',
  endDate: '',
  startDate: '',
  filedDate: '',
  preBidAt: '',
  preBidVenue: '',
  noPreBid: true,
  status: 'not_filed',
  outcome: '',
  notes: '',
  gemItems: '',
  gemQuantity: '',
  gemStartDate: '',
  gemEndDate: '',
  gemParticipation: '',
  gemCurrentStage: '',
  gemBidDocHash: '',
  gemDocUrl: '',
  gemDocId: '',
  gemDepartmentLines: [],
  description: '',
  entryDate: '',
  sourceUrl: '',
};

export const EMPTY_EXTRACTION: ExtractedCandidateData = {
  fullName: '',
  mobile: '',
  email: '',
  address: '',
  currentLocation: '',
  dateOfBirth: '',
  skills: [],
  experience: [],
  currentCompany: '',
  previousCompanies: [],
  designation: '',
  industry: '',
  salary: '',
  expectedSalary: '',
  noticePeriod: '',
  education: [],
  certifications: [],
  languages: [],
  linkedInUrl: '',
  portfolioUrl: '',
  fieldConfidences: [],
  overallConfidence: 0,
};
