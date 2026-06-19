import { describe, expect, it } from 'vitest';

const SAMPLE_ORDER_ROW = `
Contract No GEMC-511687705641397
Buyer Parag Tandon
Seller PENTEC WATER (INDIA)
Bid Number GEM/2021/B/1108459
Contract Date 31/03/2021 11:14
Total ₹ 79500.00
Status Order placed (accepted by seller)
Facility Management Services - Manpower
`;

describe('GeM orders extraction', () => {
  it('parses order row fields from DOM', async () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Contract No</th>
            <th>Buyer</th>
            <th>Seller</th>
            <th>Bid Number</th>
            <th>Contract Date</th>
            <th>Total</th>
            <th>Status</th>
            <th>Product</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              GEMC-511687705641397
              <a href="https://fulfilment.gem.gov.in/contract/fds?contractId=MnBEckVmZDFneUdidXRoQVQ3QzN0clZRdTJOdU5JelE5bTR3VHN6dTJvcz0=">View</a>
            </td>
            <td>Parag Tandon</td>
            <td>PENTEC WATER (INDIA)</td>
            <td>GEM/2021/B/1108459</td>
            <td>31/03/2021 11:14</td>
            <td>₹ 79500.00</td>
            <td>Order placed (accepted by seller)</td>
            <td>Facility Management Services - Manpower</td>
          </tr>
        </tbody>
      </table>
    `;

    const { extractGemOrdersFromPage, contractToFlexHRMPayload } = await import(
      '../src/modules/contracts/gem-orders-extractor'
    );
    const orders = extractGemOrdersFromPage();
    expect(orders.length).toBe(1);

    const order = orders[0];
    expect(order.contractNo).toBe('GEMC-511687705641397');
    expect(order.officerName).toBe('Parag Tandon');
    expect(order.companyName).toBe('PENTEC WATER (INDIA)');
    expect(order.tenderBidNo).toBe('GEM/2021/B/1108459');
    expect(order.fromDate).toContain('31/03/2021');
    expect(order.contractValue).toContain('79500');
    expect(order.gemContractId).toBe('MnBEckVmZDFneUdidXRoQVQ3QzN0clZRdTJOdU5JelE5bTR3VHN6dTJvcz0=');
    expect(order.gemContractPdfUrl).toContain('contractId=');

    const payload = contractToFlexHRMPayload(order);
    expect(payload.contractNo).toContain('fulfilment.gem.gov.in/contract/fds');
    expect(payload.notes).toContain('GEMC-511687705641397');
  });

  it('parses free-text order blocks', async () => {
    document.body.innerHTML = `<div class="order-card">${SAMPLE_ORDER_ROW}</div>`;
    const { extractGemOrdersFromPage } = await import(
      '../src/modules/contracts/gem-orders-extractor'
    );
    const orders = extractGemOrdersFromPage();
    expect(orders[0]?.contractNo).toBe('GEMC-511687705641397');
    expect(orders[0]?.tenderBidNo).toBe('GEM/2021/B/1108459');
  });

  it('detects GeM orders workspace pages', async () => {
    const { isGemOrdersPage, buildGemContractPdfUrl } = await import(
      '../src/modules/contracts/gem-orders-url'
    );
    expect(
      isGemOrdersPage('https://fulfilment.gem.gov.in/fulfilment/home#WORKSPACE_ID=ORDERS_WS'),
    ).toBe(true);
    expect(isGemOrdersPage('https://fulfilment.gem.gov.in/login')).toBe(false);

    const url = buildGemContractPdfUrl('abc123+/=');
    expect(url).toBe('https://fulfilment.gem.gov.in/contract/fds?contractId=abc123%2B%2F%3D');
  });
});
