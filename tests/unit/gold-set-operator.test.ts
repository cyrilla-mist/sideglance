import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const operatorPath = new URL('../../evaluation/scripts/run-task09c-gold-set.ps1', import.meta.url);

describe('Task 09C Gold Set operator', () => {
  it('enforces the passing preflight before consent and has no bypass flag', async () => {
    const script = await readFile(operatorPath, 'utf8');
    expect(script).toContain('task09b-four-case-preflight-06.json');
    expect(script).toContain("$preflight.overallVerdict -ne 'PASS'");
    expect(script).toContain("-cne 'YES'");
    expect(script).not.toMatch(/Force|SkipPreflight|bypass/i);
  });

  it('runs dry-run and connectivity before the Gold runner', async () => {
    const script = await readFile(operatorPath, 'utf8');
    expect(script.indexOf('transport-self-check.ts')).toBeGreaterThan(-1);
    expect(script.indexOf('real-transport-connectivity-check.ts')).toBeGreaterThan(script.indexOf("-cne 'YES'"));
    expect(script.indexOf('task09c-gold-set.ts')).toBeGreaterThan(script.indexOf('real-transport-connectivity-check.ts'));
  });
});
