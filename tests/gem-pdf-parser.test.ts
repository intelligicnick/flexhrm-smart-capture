import { describe, expect, it } from 'vitest';
import {
  formatPreBidDisplay,
  normalizeGemPdfDate,
  normalizeGemPdfDateTime,
  parseGemBidPdfText,
} from '../src/modules/tenders/gem-pdf-parser';

const SAMPLE_PDF = `
Bid Number: GEM/2026/B/7590568
Item Description: Facility Management Services - Manpower for office premises
Pre Bid Meeting Date & Time: 15-06-2026 11:00 AM
Pre Bid Meeting Venue: PMO Office, Mumbai
Estimated Bid Value: Rs. 12,50,000
Consignee Location: Department of Atomic Energy, Mumbai
`;

const GEM_NIT_FLAT = `
Bid Number GEM/2026/B/7616472 Pre Bid Meeting Required Yes Pre Bid Meeting Date and Time 10-06-2026 3:00 PM Pre Bid Meeting Venue BPCL Office Mumbai Estimated Bid Value Rs. 500000 Item Description Security Manpower Service
`;

const GEM_MULTILINE_PDF = `
Bid Number GEM/2026/B/7553845
Pre Bid Meeting Required
Yes
Pre Bid Meeting Date and Time
20-06-2026 3:00 PM
Pre Bid Meeting Venue
PMO Conference Hall, New Delhi
Estimated Bid Value
in INR (Inclusive of all taxes)
50000000
Item Description
Facility Management Services
`;

const GEM_7553845_PDF = `
Bid Number GEM/2026/B/7553845
Pre Bid Detail(s)
Pre-Bid Date and Time
01-06-2026 15:00:00
Pre-Bid Venue
Raman Research Institute
C.V. Raman Avenue, Sadashivanagar,
Bangalore - 560080
Additional Requirement
Tenure/ Duration of Employment (in months) : 36
Basic Pay (Minimum daily wage) : 1008
Provident Fund (INR per day) : 69.23
EDLI (INR per day) : 0
ESI (INR per day) : 6.07
EPF Admin charge (INR per day) : 0
Bonus (INR per day) : 0
Optional Allowance 1 (in Rupees) : 35
Optional Allowance 2 (in Rupees) : 0
Optional Allowance 3 (in Rupees) : 0
Number of working days in a month : 26
Estimated Bid Value
in INR (Inclusive of all taxes)
50000000
`;

const ESIC_MANPOWER_PDF = `
Bid Number GEM/2026/B/7000002
Ministry/State Name
Ministry of Labour and Employment
Organisation Name
Employees State Insurance Corporation
Item Category Security Manpower Service (Version 2.0)
Additional Requirement
Tenure/ Duration of Employment (in months) : 12
Basic Pay (Minimum daily wage) : 781
Provident Fund (INR per day) : 101.53
ESI (INR per day) : 23.43
Number of working days in a month : 26
Consignee Reporting/Officer: Shankar Singh
Address: 342306, KVS Campus, Govt Primary School
Estimated Bid Value in INR (Inclusive of all taxes) 500000
`;

const GEM_FLAT_KVS_PDF = `Bid Number GEM/2026/B/7000001 Ministry/State Name Ministry Of Education Organisation Name Kendriya Vidyalaya Sangathan Item Category Security Manpower Service (Version 2.0) Consignee Reporting/Officer:Shankar Singh ,Address:342306,KVS tiveri, Govt Primary School Campus,Additional Requirement:Tenure/ Duration of Employment (in months) : 12 Basic Pay (Minimum daily wage) : 781 Provident Fund (INR per day) : 101.53 ESI (INR per day) : 23.43 Number of working days in a month : 26 Estimated Bid Value in INR (Inclusive of all taxes) 500000`;

const GEM_NUMBERED_CONSIGNEE_PDF = `
Bid Number GEM/2026/B/8000001
Ministry/State Name
Ministry of Labour and Employment
Organisation Name
Employees State Insurance Corporation
Additional Requirement
Tenure/ Duration of Employment (in months) : 12
Basic Pay (Minimum daily wage) : 781
1 Jay Prakash Kumar
Address: ESIC Hospital Korba
Estimated Bid Value in INR 500000
`;

const GEM_POSTS_BILINGUAL_PDF = `
Bid End Date/Time 18-06-2026 12:00:00
Bid Start Date/Time 01-06-2026 10:00:00
Ministry/State Name Ministry Of Communications
Department Name Department Of Posts
Organisation Name Department Of Posts
Office Name 110001
Item Category Security Manpower Service (Version 2.0)
Estimated Bid Value in INR (Inclusive of all taxes) 18436646.43
Beneficiary : Sr Supdt of Post Offices 110001, Department of Posts, Department of Posts, Ministry of Communications (Twinkle Singh)
Additional Requirements for the Security Personnel DGR registered Security Agency Is Geographical presence of the Service Provider registered office is required in the consignee's State Yes
Consignees/Reporting Officer and Quantity
Additional Requirement 5 / 10 1 Twinkle Singh 110021,Sr. Supdt of Post offices, New Delhi South West Division, Chanakya Puri, New Delhi -110021 15 Tenure/ Duration of Employment (in months) : 24 Basic Pay (Minimum daily wage) : 1094 Provident Fund (INR per day) : 69.23 EDLI (INR per day) : 2.88 ESI (INR per day) : 0 EPF Admin charge (INR per day) : 2.88 Bonus (INR per day) : 0 Optional Allowance 1 (in Rupees) : 194.83 Optional Allowance 2 (in Rupees) : 0 Optional Allowance 3 (in Rupees) : 0 Number of working days in a month : 26
`;

describe('GeM PDF parser', () => {
  it('normalizes PDF dates to DD-MM-YYYY and times to 24-hour format', () => {
    expect(normalizeGemPdfDate('27-5-2026')).toBe('27-05-2026');
    expect(normalizeGemPdfDateTime('10-06-2026 3:00 PM')).toBe('10-06-2026 15:00:00');
    expect(normalizeGemPdfDateTime('15-06-2026 11:00 AM')).toBe('15-06-2026 11:00:00');
    expect(normalizeGemPdfDateTime('01-06-2026 15:00:00')).toBe('01-06-2026 15:00:00');
    expect(normalizeGemPdfDate('01-06-2026 10:00:00')).toBe('01-06-2026');
  });

  it('extracts bilingual GeM bid PDF fields (Department of Posts sample)', () => {
    const details = parseGemBidPdfText(GEM_POSTS_BILINGUAL_PDF);
    expect(details.startDate).toBe('01-06-2026');
    expect(details.endDate).toBe('18-06-2026 12:00:00');
    expect(details.ministry).toBe('Ministry Of Communications');
    expect(details.organisation).toBe('Department Of Posts');
    expect(details.consigneeOfficer).toBe('Twinkle Singh');
    expect(details.address).toContain('110021');
    expect(details.address.toLowerCase()).toContain('new delhi');
    expect(details.rate).toBe('');
    expect(details.additionalRequirements).toContain('Basic Pay');
    expect(details.additionalRequirements).toContain('1094');
    expect(details.description.toLowerCase()).toContain('dgr registered');
    expect(details.noPreBid).toBe(true);
  });

  it('extracts fields from fully flattened GeM PDF text', () => {
    const details = parseGemBidPdfText(GEM_FLAT_KVS_PDF);
    expect(details.ministry).toContain('Ministry Of Education');
    expect(details.organisation).toContain('Kendriya Vidyalaya Sangathan');
    expect(details.consigneeOfficer).toBe('Shankar Singh');
    expect(details.address).toContain('342306');
    expect(details.additionalRequirements).toContain('Basic Pay');
    expect(details.additionalRequirements.toLowerCase()).not.toContain('shankar singh');
  });

  it('extracts numbered consignee name from additional requirement block', () => {
    const details = parseGemBidPdfText(GEM_NUMBERED_CONSIGNEE_PDF);
    expect(details.consigneeOfficer).toBe('Jay Prakash Kumar');
    expect(details.additionalRequirements).toContain('Basic Pay');
    expect(details.additionalRequirements.toLowerCase()).not.toContain('jay prakash');
  });

  it('extracts ministry, organisation, consignee, and strips officer from additional requirements', () => {
    const details = parseGemBidPdfText(ESIC_MANPOWER_PDF);
    expect(details.ministry.toLowerCase()).toContain('labour');
    expect(details.organisation).toContain('Employees State Insurance Corporation');
    expect(details.consigneeOfficer).toBe('Shankar Singh');
    expect(details.address).toContain('342306');
    expect(details.additionalRequirements).toContain('Basic Pay');
    expect(details.additionalRequirements).toContain('781');
    expect(details.additionalRequirements.toLowerCase()).not.toContain('shankar singh');
    expect(details.additionalRequirements.toLowerCase()).not.toContain('consignee reporting');
  });

  it('extracts pre-bid and consignee location from bid PDF text', () => {
    const details = parseGemBidPdfText(SAMPLE_PDF);
    expect(details.preBidAt).toBe('15-06-2026 11:00:00');
    expect(details.rate).toBe('');
    expect(details.description).toBe('');
    expect(details.address.toLowerCase()).toContain('mumbai');
    expect(details.preBidAddress.toLowerCase()).toContain('mumbai');
    expect(details.noPreBid).toBe(false);
  });

  it('extracts pre-bid from flat GeM NIT text', () => {
    const details = parseGemBidPdfText(GEM_NIT_FLAT);
    expect(details.preBidAt).toBe('10-06-2026 15:00:00');
    expect(details.rate).toBe('');
    expect(details.description).toBe('');
    expect(details.preBidAddress.toLowerCase()).toContain('mumbai');
  });

  it('extracts pre-bid from multiline GeM table PDF text', () => {
    const details = parseGemBidPdfText(GEM_MULTILINE_PDF);
    expect(details.preBidAt).toBe('20-06-2026 15:00:00');
    expect(details.preBidAddress.toLowerCase()).toContain('new delhi');
    expect(details.rate).toBe('');
    expect(details.noPreBid).toBe(false);
  });

  it('extracts GeM pre-bid detail table and additional requirements for GEM/2026/B/7553845', () => {
    const details = parseGemBidPdfText(GEM_7553845_PDF);
    expect(details.preBidAt).toBe('01-06-2026 15:00:00');
    expect(details.preBidAddress.toLowerCase()).toContain('raman research institute');
    expect(details.preBidAddress.toLowerCase()).toContain('bangalore');
    expect(details.rate).toBe('');
    expect(details.additionalRequirements).toContain('Basic Pay');
    expect(details.additionalRequirements).toContain('1008');
    expect(details.additionalRequirements).toContain('Tenure');
    expect(details.noPreBid).toBe(false);
  });

  it('extracts GeM pre-bid table row when headers precede values on one line', () => {
    const flat = `
      Pre Bid Detail(s)
      Pre-Bid Date and Time Pre-Bid Venue 01-06-2026 15:00:00 Raman Research Institute C.V. Raman Avenue Bangalore - 560080
      Additional Requirement Tenure/ Duration of Employment (in months) : 36
      Estimated Bid Value in INR (Inclusive of all taxes) 50000000
    `;
    const details = parseGemBidPdfText(flat);
    expect(details.preBidAt).toBe('01-06-2026 15:00:00');
    expect(details.preBidAddress.toLowerCase()).toContain('raman research institute');
    expect(details.noPreBid).toBe(false);
  });

  it('formats pre-bid display with venue', () => {
    expect(formatPreBidDisplay('20-06-2026 3:00 PM', 'PMO Conference Hall')).toBe(
      '20-06-2026 15:00:00 @ PMO Conference Hall',
    );
  });

  it('detects no pre-bid when explicitly marked', () => {
    const details = parseGemBidPdfText('Pre Bid Meeting Required: No. Bid Number GEM/2026/B/1');
    expect(details.noPreBid).toBe(true);
    expect(details.preBidAt).toBe('');
  });
});
