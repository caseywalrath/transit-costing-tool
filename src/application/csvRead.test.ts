import { describe, expect, it } from 'vitest';
import { parseCsv } from './csvRead';

describe('parseCsv (Decision 0085, section 4.10)', () => {
  it('removes a leading byte-order mark', () => {
    expect(parseCsv('﻿Stop ID,Latitude\r\n101,39.9')).toEqual([['Stop ID', 'Latitude'], ['101', '39.9']]);
  });

  it('ends records at CRLF, LF, and a lone CR alike', () => {
    expect(parseCsv('a,b\r\nc,d\ne,f\rg,h')).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']]);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(parseCsv('"Main St, north",39.9')).toEqual([['Main St, north', '39.9']]);
  });

  it('keeps a line break inside a quoted field', () => {
    expect(parseCsv('"first\r\nsecond",x\n')).toEqual([['first\r\nsecond', 'x']]);
  });

  it('reads two double quotes inside a quoted field as one quote', () => {
    expect(parseCsv('"the ""Hub""",1')).toEqual([['the "Hub"', '1']]);
  });

  it('does not make an empty record from a trailing line break or trailing blank lines', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']]);
    expect(parseCsv('a,b\r\n\r\n')).toEqual([['a', 'b']]);
  });

  it('keeps a blank line between records', () => {
    expect(parseCsv('a,b\n\nc,d\n')).toEqual([['a', 'b'], [''], ['c', 'd']]);
  });

  it('keeps empty cells, including a last empty cell with no line break', () => {
    expect(parseCsv('a,,\nb,c,')).toEqual([['a', '', ''], ['b', 'c', '']]);
  });

  it('returns no records for empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
