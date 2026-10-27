import { describe, expect, it } from 'vitest';
import { abbreviatePlaceName, directionAbbreviation, generatedPatternShortName, nodeShortName, patternShortName } from './shortNames';

const points = (...nodeIds: string[]) => nodeIds.map((nodeId, sequence) => ({ id: `p${sequence}`, nodeId, sequence, cumulativeMiles: sequence }));

describe('abbreviatePlaceName', () => {
  it('shortens street and place words after the first word', () => {
    expect(abbreviatePlaceName('Wagon Road')).toBe('Wagon Rd');
    expect(abbreviatePlaceName('Westminster Station')).toBe('Westminster Sta');
    expect(abbreviatePlaceName('Federal  Boulevard')).toBe('Federal Blvd');
  });
  it('keeps the first word and unknown words', () => {
    expect(abbreviatePlaceName('Road Runner')).toBe('Road Runner');
    expect(abbreviatePlaceName('Station')).toBe('Station');
    expect(abbreviatePlaceName('Clear Creek & Federal')).toBe('Clear Creek & Federal');
    expect(abbreviatePlaceName('')).toBe('');
  });
});

describe('directionAbbreviation', () => {
  it('uses the usual abbreviations, case-insensitively', () => {
    expect(directionAbbreviation('Northbound')).toBe('NB');
    expect(directionAbbreviation('southbound')).toBe('SB');
    expect(directionAbbreviation('Counter-clockwise')).toBe('CCW');
  });
  it('uses initials for several words and the name itself otherwise', () => {
    expect(directionAbbreviation('Toward Downtown')).toBe('TD');
    expect(directionAbbreviation('Loop')).toBe('Loop');
    expect(directionAbbreviation(undefined)).toBe('');
    expect(directionAbbreviation('  ')).toBe('');
  });
});

describe('nodeShortName', () => {
  it('prefers the entered short name, else shortens the name', () => {
    expect(nodeShortName({ name: 'Westminster Station', shortName: 'WSTM' })).toBe('WSTM');
    expect(nodeShortName({ name: 'Westminster Station', shortName: '  ' })).toBe('Westminster Sta');
    expect(nodeShortName(undefined)).toBe('');
  });
});

describe('generatedPatternShortName', () => {
  const nodes = new Map([['e', { name: 'Evans' }], ['w', { name: 'Wagon Road', shortName: 'WR' }], ['x', { name: 'Westminster Station' }]]);
  it('drops the direction prefix, abbreviates the direction, and joins origin and destination', () => {
    expect(generatedPatternShortName({ name: 'Northbound: Evans to Wagon Road', points: points('e', 'w') }, 'Northbound')).toBe('NB Evans–Wagon Rd');
  });
  it('uses the short names of the end Nodes the name refers to', () => {
    expect(generatedPatternShortName({ name: 'Northbound: Evans to Wagon Road', points: points('e', 'w') }, 'Northbound', nodes)).toBe('NB Evans–WR');
    expect(generatedPatternShortName({ name: 'Southbound: Westminster Station to Evans', points: points('x', 'e') }, 'Southbound', nodes)).toBe('SB Westminster Sta–Evans');
  });
  it('shortens a name without "to" word by word, and works without a direction', () => {
    expect(generatedPatternShortName({ name: 'Federal Boulevard Loop', points: points('e', 'w') }, undefined)).toBe('Federal Blvd Loop');
    expect(generatedPatternShortName({ name: 'Southbound:', points: [] }, 'Southbound')).toBe('SB Southbound:');
    expect(generatedPatternShortName({ name: ' ', points: [] }, undefined)).toBe('Unnamed pattern');
  });
});

describe('patternShortName', () => {
  it('uses the entered short name when it is not blank', () => {
    expect(patternShortName({ name: 'Southbound: Wagon Road to Evans', directionLabel: 'SB Full', points: [] }, 'Southbound')).toBe('SB Full');
    expect(patternShortName({ name: 'Southbound: Wagon Road to Evans', directionLabel: '  ', points: [] }, 'Southbound')).toBe('SB Wagon Rd–Evans');
    expect(patternShortName(undefined, 'Southbound')).toBe('Unnamed pattern');
  });
});
