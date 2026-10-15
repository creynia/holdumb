import { describe, expect, it } from 'vitest';
import { cardCode, cardName, parseCard, parseCards, rankOf, suitOf } from './cards';

describe('parseCards', () => {
  it('parses spaced, compact and comma forms to the same cards', () => {
    const a = parseCards('As Kd');
    expect(parseCards('AsKd')).toEqual(a);
    expect(parseCards('As,Kd')).toEqual(a);
    expect(a).toEqual([12 * 4 + 0, 11 * 4 + 2]);
  });
  it('round-trips all 52 codes', () => {
    for (let c = 0; c < 52; c++) expect(parseCard(cardCode(c))).toBe(c);
  });
  it('encodes rank and suit', () => {
    const c = parseCard('Td');
    expect(rankOf(c)).toBe(8);
    expect(suitOf(c)).toBe(2);
    expect(cardName(parseCard('As'))).toBe('Ace of spades');
  });
  it('rejects bad codes, odd lengths and duplicates', () => {
    expect(() => parseCards('Xs')).toThrow();
    expect(() => parseCards('Ah1')).toThrow();
    expect(() => parseCards('Ah Ah')).toThrow(/Duplicate/);
    expect(parseCards('')).toEqual([]);
  });
});
