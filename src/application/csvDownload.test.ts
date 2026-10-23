import { describe, expect, it } from 'vitest';
import { createCsvArchive } from './csvDownload';

describe('createCsvArchive', () => {
  it('creates one ZIP containing every requested CSV entry', async () => {
    const archive = createCsvArchive([
      { filename: 'scenario.csv', contents: 'id,name\n1,Base\n' },
      { filename: 'blocks.csv', contents: 'id,label\n2,Block 1\n' },
    ]);
    expect(archive.type).toBe('application/zip');
    const bytes = new Uint8Array(await archive.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('scenario.csv');
    expect(text).toContain('blocks.csv');
    expect(text).toContain('id,name');
  });
});
