export function confirmDeleteAll(count: number, label: string): boolean {
  if (count <= 0) return false;
  return window.confirm(`Delete all ${count} ${label}? This cannot be undone.`);
}

export function confirmDeleteOne(title: string): boolean {
  return window.confirm(`Delete "${title}"? This cannot be undone.`);
}
