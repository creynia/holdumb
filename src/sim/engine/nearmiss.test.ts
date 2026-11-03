import { describe, expect, it } from 'vitest';
import { evaluateN, parseCards } from './index';
import { SUIT_PLURAL, nearMisses } from './nearmiss';

const note = (cards: string): string[] => {
  const seven = parseCards(cards);
  return nearMisses(seven, evaluateN(seven).category);
};

describe('nearMisses', () => {
  const cases: Array<[string, string, string[]]> = [
    [
      'four clubs under a pair (the board has the fourth and fifth card)',
      'Ac 3d Kc 8c 2c 3h 7d',
      ['four clubs, one short of a flush'],
    ],
    ['four to a straight, king high', '9h 3d 8c 7s 6d 2h Kh', ['four to a straight, one short']],
    ['five clubs is a flush: no note', 'Ac 3c Kc 8c 2c 3h 7d', []],
    [
      'four clubs with a made straight: a flush is higher',
      '9c 8c 7c Kc 6d 5h 2d',
      ['four clubs, one short of a flush'],
    ],
    [
      'a made straight with no four-flush: nothing above it is one short',
      '9h 8d 7c 6s 5h Kd 2c',
      [],
    ],
    ['wheel window A-2-3-4 draws', 'Ah 2d 3c 4s Kh 9d 8c', ['four to a straight, one short']],
    ['broadway window T-J-Q-K draws', 'Th Jd Qc Ks 2h 4d 7c', ['four to a straight, one short']],
    [
      'board-only four-flush still counts',
      '2d 5h Kh 9h 4h Jc 7c',
      ['four hearts, one short of a flush'],
    ],
    [
      'gutshot reads the same as open-ended',
      '9h 8d 6c 5s Kh 2d Jc',
      ['four to a straight, one short'],
    ],
    [
      'four to a straight flush beats flush and straight',
      '9h 8h 7h 6h 2c Kd 3s',
      ['four to a straight flush, one short'],
    ],
    ['trips with four spades', 'Ks Kd Kh 2s 5s 9s Jc', ['four spades, one short of a flush']],
    [
      'two pair with four diamonds',
      'Ad Kd Ah Kc 2d 7d 9s',
      ['four diamonds, one short of a flush'],
    ],
    ['quads never note', 'Ac Ad Ah As Kc 2c 3c', []],
    ['a full house never notes', 'Ac Ad Ah Kc Ks 2c 3c', []],
    ['three of a suit and no straight: nothing', 'Ac 3d Kc 8h 2c 6s Jd', []],
    ['two pair, no draws', 'Ac Ad Kh Ks 2c 7d 9s', []],
  ];
  for (const [name, cards, expected] of cases)
    it(name, () => {
      expect(note(cards)).toEqual(expected);
    });

  it('returns at most one note', () => {
    expect(nearMisses(parseCards('9h 8h 7h 6h 2c Kd 3s'), 'high-card')).toHaveLength(1);
  });
  it('names suits only from SUIT_PLURAL, in card-suit order', () => {
    expect(SUIT_PLURAL).toEqual(['spades', 'hearts', 'diamonds', 'clubs']);
    for (const [i, suit] of ['s', 'h', 'd', 'c'].entries()) {
      const other = suit === 's' ? 'h' : 's';
      const seven = parseCards(`2${suit} 5${suit} 9${suit} K${suit} 4${other} 7${other} Q${other}`);
      expect(nearMisses(seven, evaluateN(seven).category)).toEqual([
        `four ${SUIT_PLURAL[i]}, one short of a flush`,
      ]);
    }
  });
});
