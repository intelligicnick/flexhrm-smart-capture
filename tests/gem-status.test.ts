import { describe, expect, it } from 'vitest';
import {
  buildGemCurrentStage,
  deriveStatusFromGemProgress,
  detectSelfBidAward,
  extractProcessStatus,
  mapTechnicalResult,
  parseGemCardStatus,
  parseProgressStages,
} from '../src/modules/tenders/gem-status';

const TECH_IN_PROGRESS_CARD = `
BID NO GEM/2026/B/7491457
Status: Technical Evaluation
Bid/RA Status: Active
Items Manpower Outsourcing Services
Quantity 18
Department Name And Address Ministry of Power
Start Date 02-05-2026 2:09 PM
End Date 23-05-2026 2:00 PM
TECHNICAL EVALUATION
FINANCIAL EVALUATION
BID AWARD
`;

const QUALIFIED_AWARDED_CARD = `
BID NO GEM/2026/B/7495680
Status: Bid Award
Bid/RA Status: Active
Items Manpower Outsourcing Services
Quantity 3
Technical Status Qualified
Department Name And Address Ministry of Education
Start Date 02-05-2026 12:57 PM
End Date 22-05-2026 1:00 PM
TECHNICAL EVALUATION
FINANCIAL EVALUATION
BID AWARD
`;

const DISQUALIFIED_CARD = `
BID NO GEM/2021/B/1526721
Status: Bid Award
Bid/RA Status: Active
Technical Status Disqualified
Items Manpower Outsourcing Services
Quantity 5
TECHNICAL EVALUATION
FINANCIAL EVALUATION
BID AWARD
`;

describe('GeM listing status parsing', () => {
  it('extracts process status without Bid/RA Status', () => {
    expect(extractProcessStatus(TECH_IN_PROGRESS_CARD)).toBe('Technical Evaluation');
    expect(extractProcessStatus(QUALIFIED_AWARDED_CARD)).toBe('Bid Award');
  });

  it('maps technical result to user outcome only', () => {
    expect(mapTechnicalResult('Qualified')).toEqual({
      status: 'technical_qualified',
      outcome: 'Qualified',
    });
    expect(mapTechnicalResult('Disqualified')).toEqual({
      status: 'disqualified',
      outcome: 'Disqualified',
    });
  });

  it('parses technical-in-progress card as participated with stage in progress', () => {
    document.body.innerHTML = `<div class="card">${TECH_IN_PROGRESS_CARD}</div>`;
    const card = document.querySelector('.card') as HTMLElement;
    const status = parseGemCardStatus(card);
    expect(status.status).toBe('filed');
    expect(status.outcome).toBe('Participated');
    expect(status.gemCurrentStage.toLowerCase()).toContain('technical evaluation');
    expect(status.gemCurrentStage.toLowerCase()).toContain('in progress');
    expect(status.status).not.toBe('won_bid');
  });

  it('parses qualified + bid award as bid-award stage, not won', () => {
    document.body.innerHTML = `<div class="card">${QUALIFIED_AWARDED_CARD}</div>`;
    const card = document.querySelector('.card') as HTMLElement;
    const status = parseGemCardStatus(card);
    expect(status.status).toBe('qualified');
    expect(status.outcome).toBe('Bid Award in Progress');
    expect(status.gemCurrentStage.toLowerCase()).toContain('bid award');
    expect(status.status).not.toBe('won_bid');
  });

  it('parses disqualified technical status', () => {
    document.body.innerHTML = `<div class="card">${DISQUALIFIED_CARD}</div>`;
    const card = document.querySelector('.card') as HTMLElement;
    const status = parseGemCardStatus(card);
    expect(status.status).toBe('disqualified');
    expect(status.outcome).toBe('Disqualified');
  });

  it('builds stage chain from header when colors are unavailable', () => {
    document.body.innerHTML = `<div class="card">${QUALIFIED_AWARDED_CARD}</div>`;
    const card = document.querySelector('.card') as HTMLElement;
    const stages = parseProgressStages(card, 'Bid Award');
    expect(stages.some((s) => /bid award \(in progress\)/i.test(s))).toBe(true);
    expect(buildGemCurrentStage(card, 'Bid Award')).toContain('→');
  });

  it('derives status from coloured progress stages', () => {
    const financialInProgress = [
      'Technical Evaluation (completed)',
      'Financial Evaluation (in progress)',
      'Bid Award (pending)',
    ];
    expect(
      deriveStatusFromGemProgress('Financial Evaluation', 'Qualified', financialInProgress, true),
    ).toBe('financial');

    const bidAwardComplete = [
      'Technical Evaluation (completed)',
      'Financial Evaluation (completed)',
      'Bid Award (completed)',
    ];
    expect(
      deriveStatusFromGemProgress('Bid Award', 'Qualified', bidAwardComplete, true),
    ).toBe('qualified');
    expect(
      deriveStatusFromGemProgress(
        'Bid Award',
        'Qualified',
        bidAwardComplete,
        true,
        'Your bid is selected. L1 bidder.',
      ),
    ).toBe('won_bid');

    const technicalInProgress = [
      'Technical Evaluation (in progress)',
      'Financial Evaluation (pending)',
      'Bid Award (pending)',
    ];
    expect(
      deriveStatusFromGemProgress('Technical Evaluation', '', technicalInProgress, true),
    ).toBe('filed');
  });

  it('detects self win only from explicit GeM winner text', () => {
    expect(detectSelfBidAward('Status: Bid Award\nL1 Selected')).toBe(true);
    expect(detectSelfBidAward('Status: Bid Award\nBid Award (completed)')).toBe(false);
    expect(detectSelfBidAward('Status: Bid Award\nNot Selected')).toBe(false);
  });

  it('parses Bid / RA Award with EVALUATION + BID AWARD progress as qualified', () => {
    const cardText = `
BID NO GEM/2025/B/6746241
Status: Bid / RA Award
Bid/RA Status: Active
Items Manpower Outsourcing Services
Quantity 27
Department Ministry of Defence
Start Date 26-11-2025 2:58 PM
End Date 17-12-2025 10:00 AM
EVALUATION
BID AWARD
View BID Results
`;
    expect(extractProcessStatus(cardText)).toBe('Bid / RA Award');
    document.body.innerHTML = `<div class="card">${cardText}</div>`;
    const card = document.querySelector('.card') as HTMLElement;
    const status = parseGemCardStatus(card);
    expect(status.status).toBe('qualified');
    expect(status.outcome).toMatch(/bid award/i);
    expect(status.status).not.toBe('filed');
  });

  it('parses multiline Status label for Bid / RA Award', () => {
    const cardText = `
BID NO GEM/2025/B/6746241
Status:
Bid / RA Award
Bid/RA Status: Active
Items Manpower Outsourcing Services
EVALUATION
BID AWARD
`;
    expect(extractProcessStatus(cardText)).toBe('Bid / RA Award');
    document.body.innerHTML = `<div class="card">${cardText}</div>`;
    const card = document.querySelector('.card') as HTMLElement;
    const status = parseGemCardStatus(card);
    expect(status.status).toBe('qualified');
    expect(status.outcome).toMatch(/bid award/i);
  });
});
