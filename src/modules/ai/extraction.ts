import type { ExtractedCandidateData } from '../../shared/types';
import { EMPTY_EXTRACTION } from '../../shared/types';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?\d{10,12}/;
const LINKEDIN_RE = /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i;

export function extractLocally(content: string): ExtractedCandidateData {
  const trimmed = content.trim();
  if (!trimmed) return { ...EMPTY_EXTRACTION };

  const email = trimmed.match(EMAIL_RE)?.[0] ?? '';
  const mobile = trimmed.match(PHONE_RE)?.[0] ?? '';
  const linkedInUrl = trimmed.match(LINKEDIN_RE)?.[0] ?? '';
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fullName = lines[0] && lines[0].length <= 60 ? lines[0] : '';

  const fieldConfidences = [
    email && { field: 'email', confidence: 0.95, value: email },
    mobile && { field: 'mobile', confidence: 0.9, value: mobile },
    fullName && { field: 'fullName', confidence: 0.7, value: fullName },
    linkedInUrl && { field: 'linkedInUrl', confidence: 0.95, value: linkedInUrl },
  ].filter(Boolean) as ExtractedCandidateData['fieldConfidences'];

  const overallConfidence =
    fieldConfidences.length > 0
      ? fieldConfidences.reduce((s: number, f) => s + f.confidence, 0) / fieldConfidences.length
      : 0.3;

  return {
    ...EMPTY_EXTRACTION,
    fullName,
    email,
    mobile,
    linkedInUrl,
    fieldConfidences,
    overallConfidence,
  };
}

export function isResumeLike(content: string, url: string): boolean {
  const lower = `${content} ${url}`.toLowerCase();
  const resumeKeywords = [
    'resume', 'curriculum vitae', 'cv', 'experience', 'education',
    'skills', 'linkedin', 'objective', 'summary',
  ];
  const hits = resumeKeywords.filter((k) => lower.includes(k)).length;
  return hits >= 3 || lower.includes('resume') || /\.pdf$/i.test(url);
}

export function mergeExtractions(
  primary: ExtractedCandidateData,
  secondary: ExtractedCandidateData,
): ExtractedCandidateData {
  return {
    ...primary,
    fullName: primary.fullName || secondary.fullName,
    mobile: primary.mobile || secondary.mobile,
    email: primary.email || secondary.email,
    address: primary.address || secondary.address,
    currentLocation: primary.currentLocation || secondary.currentLocation,
    dateOfBirth: primary.dateOfBirth || secondary.dateOfBirth,
    skills: primary.skills.length ? primary.skills : secondary.skills,
    experience: primary.experience.length ? primary.experience : secondary.experience,
    currentCompany: primary.currentCompany || secondary.currentCompany,
    previousCompanies: primary.previousCompanies.length
      ? primary.previousCompanies
      : secondary.previousCompanies,
    designation: primary.designation || secondary.designation,
    industry: primary.industry || secondary.industry,
    salary: primary.salary || secondary.salary,
    expectedSalary: primary.expectedSalary || secondary.expectedSalary,
    noticePeriod: primary.noticePeriod || secondary.noticePeriod,
    education: primary.education.length ? primary.education : secondary.education,
    certifications: primary.certifications.length
      ? primary.certifications
      : secondary.certifications,
    languages: primary.languages.length ? primary.languages : secondary.languages,
    linkedInUrl: primary.linkedInUrl || secondary.linkedInUrl,
    portfolioUrl: primary.portfolioUrl || secondary.portfolioUrl,
    fieldConfidences: primary.fieldConfidences.length
      ? primary.fieldConfidences
      : secondary.fieldConfidences,
    overallConfidence: Math.max(primary.overallConfidence, secondary.overallConfidence),
  };
}
