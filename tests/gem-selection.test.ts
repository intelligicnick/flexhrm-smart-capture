import { describe, expect, it, beforeEach, vi } from 'vitest';

const CARD_A = `
BID NO: GEM/2026/B/7590568
Items: Facility Management Services - Manpower
Quantity: 18
Department Name and Address
PMO
Start Date: 27-05-2026 10:43 AM
End Date: 17-06-2026 3:00 PM
Not participated
`;

const CARD_B = `
BID NO: GEM/2026/B/7616472
Items: Security Manpower Service
Quantity: 5
Department Name and Address
Ministry of Education
Start Date: 01-06-2026 10:00 AM
End Date: 18-06-2026 1:00 PM
Not participated
`;

describe('GeM multi-page tender selection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    });
  });

  it('returns tenders selected on previous pages after pagination changes DOM', async () => {
    document.body.innerHTML = `<div class="card" data-flexhrm-bid="GEM/2026/B/7590568">${CARD_A}</div>`;
    const {
      initGemSelectionState,
      injectGemSelectionUi,
      extractSelectedTenders,
      clearGemSelection,
    } = await import('../src/modules/tenders/gem-selection');

    await initGemSelectionState();
    injectGemSelectionUi();
    const checkbox = document.querySelector('.flexhrm-gem-checkbox') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    document.body.innerHTML = `<div class="card" data-flexhrm-bid="GEM/2026/B/7616472">${CARD_B}</div>`;
    injectGemSelectionUi();
    const checkboxB = document.querySelector('.flexhrm-gem-checkbox') as HTMLInputElement;
    checkboxB.checked = true;
    checkboxB.dispatchEvent(new Event('change'));

    const selected = extractSelectedTenders();
    expect(selected.map((t) => t.bidNo).sort()).toEqual([
      'GEM/2026/B/7590568',
      'GEM/2026/B/7616472',
    ]);

    clearGemSelection();
  });

  it('select all works before card attributes are set', async () => {
    document.body.innerHTML = `
      <div class="card">${CARD_A}</div>
      <div class="card">${CARD_B.replace('7616472', '7616473')}</div>
    `;
    const {
      initGemSelectionState,
      injectGemSelectionUi,
      selectAllGemTenders,
      extractSelectedTenders,
      clearGemSelection,
    } = await import('../src/modules/tenders/gem-selection');

    await initGemSelectionState();
    injectGemSelectionUi();
    selectAllGemTenders();

    const selected = extractSelectedTenders();
    expect(selected).toHaveLength(2);
    expect(selected.every((t) => t.category.length > 0)).toBe(true);

    clearGemSelection();
  });

  it('restores saved selection from session storage', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn(async () => ({
            gem_tender_selection: {
              bids: ['GEM/2026/B/7590568', 'GEM/2026/B/7616472'],
              tenders: {
                'GEM/2026/B/7590568': {
                  bidNo: 'GEM/2026/B/7590568',
                  category: 'Cached A',
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
                },
              },
            },
          })),
          set: vi.fn(async () => undefined),
        },
      },
    });

    const {
      initGemSelectionState,
      getSelectedBidNos,
      extractSelectedTenders,
      clearGemSelection,
    } = await import('../src/modules/tenders/gem-selection');

    await initGemSelectionState();
    expect(getSelectedBidNos()).toHaveLength(2);

    document.body.innerHTML = `<div class="card">${CARD_B}</div>`;
    const selected = extractSelectedTenders();
    expect(selected).toHaveLength(2);
    expect(selected.find((t) => t.bidNo === 'GEM/2026/B/7590568')?.category).toBe('Cached A');

    clearGemSelection();
  });

  it('clears cached tenders when selection is cleared', async () => {
    document.body.innerHTML = `<div class="card" data-flexhrm-bid="GEM/2026/B/7590568">${CARD_A}</div>`;
    const {
      initGemSelectionState,
      injectGemSelectionUi,
      extractSelectedTenders,
      clearGemSelection,
      getSelectedBidNos,
    } = await import('../src/modules/tenders/gem-selection');

    await initGemSelectionState();
    injectGemSelectionUi();
    const checkbox = document.querySelector('.flexhrm-gem-checkbox') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(extractSelectedTenders()).toHaveLength(1);

    clearGemSelection();
    expect(getSelectedBidNos()).toEqual([]);
    expect(extractSelectedTenders()).toEqual([]);
  });
});
