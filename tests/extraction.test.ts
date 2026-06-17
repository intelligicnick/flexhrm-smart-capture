import { describe, expect, it } from 'vitest';
import { extractLocally, isResumeLike, mergeExtractions } from '../src/modules/ai/extraction';
import { tableToJson } from '../src/modules/table/extractor';
import { EMPTY_EXTRACTION } from '../src/shared/types';

describe('AI extraction', () => {
  it('extracts email and phone from text', () => {
    const result = extractLocally(
      'John Doe\njohn@example.com\n+91 9876543210\nSoftware Engineer',
    );
    expect(result.email).toBe('john@example.com');
    expect(result.mobile).toContain('9876543210');
    expect(result.fullName).toBe('John Doe');
  });

  it('detects resume-like content', () => {
    const content = 'Resume\nExperience\nEducation\nSkills\nLinkedIn';
    expect(isResumeLike(content, 'https://example.com/profile')).toBe(true);
  });

  it('merges extractions preferring primary values', () => {
    const primary = { ...EMPTY_EXTRACTION, fullName: 'Alice', email: 'alice@test.com' };
    const secondary = { ...EMPTY_EXTRACTION, mobile: '9999999999', fullName: 'Bob' };
    const merged = mergeExtractions(primary, secondary);
    expect(merged.fullName).toBe('Alice');
    expect(merged.mobile).toBe('9999999999');
  });
});

describe('Table extraction', () => {
  it('converts HTML table to JSON', () => {
    document.body.innerHTML = `
      <table>
        <tr><th>Name</th><th>Email</th></tr>
        <tr><td>Jane</td><td>jane@test.com</td></tr>
      </table>
    `;
    const table = document.querySelector('table')!;
    const json = tableToJson(table);
    expect(json).toHaveLength(1);
    expect(json[0].Name).toBe('Jane');
    expect(json[0].Email).toBe('jane@test.com');
  });
});
