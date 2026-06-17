export function tableToJson(table: HTMLTableElement): Record<string, string>[] {
  const headers: string[] = [];
  const headerRow = table.querySelector('thead tr') ?? table.querySelector('tr');
  if (headerRow) {
    headerRow.querySelectorAll('th, td').forEach((cell, i) => {
      headers[i] = cell.textContent?.trim() || `column_${i + 1}`;
    });
  }

  const rows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(
    (row) => row !== headerRow,
  );

  return rows.map((row) => {
    const record: Record<string, string> = {};
    row.querySelectorAll('td, th').forEach((cell, i) => {
      const key = headers[i] || `column_${i + 1}`;
      record[key] = cell.textContent?.trim() ?? '';
    });
    return record;
  });
}

export function tableToCsv(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows
    .map((row) =>
      Array.from(row.querySelectorAll('th, td'))
        .map((cell) => `"${(cell.textContent ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
}

export function findNearestTable(node: Node | null): HTMLTableElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLTableElement) return current;
    current = current.parentNode;
  }
  return null;
}
