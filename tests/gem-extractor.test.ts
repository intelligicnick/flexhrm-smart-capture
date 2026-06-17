import { describe, expect, it } from 'vitest';

// Simulate GeM tender card HTML structure
const SAMPLE_CARD = `
BID NO: GEM/2026/B/7590568
Items: Facility Management Services - Manpower
Quantity: Project / Lumpsum Based
Department Name and Address
PMO
Department of Atomic Energy
Start Date: 27-05-2026 10:43 AM
End Date: 17-06-2026 3:00 PM
Not participated
Bid Doc Hash: View
TECHNICAL BID OFFER PRICE UPLOAD DOCUMENTS
`;

describe('GeM tender extraction', () => {
  it('parses tender card fields from DOM', async () => {
    document.body.innerHTML = `<div class="tender-card">${SAMPLE_CARD}</div>`;
    const { extractGemTendersFromPage } = await import('../src/modules/tenders/gem-extractor');
    const tenders = extractGemTendersFromPage();
    expect(tenders.length).toBeGreaterThanOrEqual(1);
    const t = tenders[0];
    expect(t.bidNo).toBe('GEM/2026/B/7590568');
    expect(t.category).toContain('Facility Management');
    expect(t.gemQuantity).toContain('Project');
    expect(t.endDate).toContain('17-06-2026');
    expect(t.startDate).toContain('27-05-2026');
    expect(t.filedDate).toBe('');
    expect(t.status).toBe('not_filed');
    expect(t.outcome).toBe('');
    expect(t.gemParticipation.toLowerCase()).toContain('not participated');
  });

  it('parses GeM ministry, organisation, and consignee labels', async () => {
    const labelledCard = `
BID NO: GEM/2026/B/7000001
Items: Security Manpower Service (Version 2.0)
Ministry/State Name Ministry Of Education
Organisation Name Kendriya Vidyalaya Sangathan
Consignee Reporting/Officer: Shankar Singh
Address: 342306, KVS tiveri, Govt Primary School Campus
End Date: 18-06-2026 13:00:00
Start Date: 01-06-2026 10:00:00
`;
    document.body.innerHTML = `<div class="tender-card">${labelledCard}</div>`;
    const { extractGemTendersFromPage } = await import('../src/modules/tenders/gem-extractor');
    const tenders = extractGemTendersFromPage();
    const t = tenders[0];
    expect(t.ministry).toContain('Ministry Of Education');
    expect(t.organisation).toContain('Kendriya Vidyalaya Sangathan');
    expect(t.consigneeOfficer).toContain('Shankar Singh');
    expect(t.address).toContain('342306');
    expect(t.endDate).toContain('18-06-2026');
  });

  it('detects bidplus seller-bids pages', async () => {
    const { isGemTenderPage } = await import('../src/modules/tenders/gem-extractor');
    expect(isGemTenderPage('https://bidplus.gem.gov.in/seller-bids')).toBe(true);
    expect(isGemTenderPage('https://sso.gem.gov.in/ARXSSO/oauth/doLogin')).toBe(false);
    expect(isGemTenderPage('https://example.com')).toBe(false);
  });

  it('finds separate cards when multiple tenders are on one page', async () => {
    document.body.innerHTML = `
      <div id="list">
        <div class="card">${SAMPLE_CARD.replace('GEM/2026/B/7590568', 'GEM/2026/B/7616472')}</div>
        <div class="card">${SAMPLE_CARD}</div>
      </div>
    `;
    const { findTenderCards, extractGemTendersFromPage } = await import('../src/modules/tenders/gem-extractor');
    const cards = findTenderCards();
    expect(cards.length).toBe(2);
    const tenders = extractGemTendersFromPage();
    expect(tenders.map((t) => t.bidNo).sort()).toEqual(['GEM/2026/B/7590568', 'GEM/2026/B/7616472']);
  });
});
