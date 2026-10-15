// Scratch 7-card evaluator (mirrors the design in simulator.md §2).
// Card = rank*4 + suit, rank 0=deuce..12=ace. Value = cat<<20 | k1<<16 | k2<<12 | k3<<8 | k4<<4 | k5.
// cat: 0 high,1 pair,2 two pair,3 trips,4 straight,5 flush,6 full house,7 quads,8 straight flush,9 royal.
#include <stdint.h>
static inline int hibit(uint32_t m) { return 31 - __builtin_clz(m); }
static inline int straight_top(uint32_t m) {
  uint32_t m2 = (m << 1) | ((m >> 12) & 1); // bit0 = ace low
  uint32_t s = m2 & (m2 << 1) & (m2 << 2) & (m2 << 3) & (m2 << 4);
  if (!s) return -1;
  return hibit(s) - 1; // rank of top card (3 = five-high)
}
static inline uint32_t topn(uint32_t m, int n) {
  uint32_t v = 0;
  for (int i = 0; i < n; i++) { int b = hibit(m); v = (v << 4) | b; m &= ~(1u << b); }
  return v;
}
static inline uint32_t eval_masks(const uint32_t sm[4], const int cnt[13], int ncards) {
  for (int s = 0; s < 4; s++) {
    if (__builtin_popcount(sm[s]) >= 5) {
      int st = straight_top(sm[s]);
      if (st >= 0) return ((st == 12 ? 9u : 8u) << 20) | ((uint32_t)st << 16);
      return (5u << 20) | topn(sm[s], 5);
    }
  }
  uint32_t all = sm[0] | sm[1] | sm[2] | sm[3];
  int quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  uint32_t singles = 0;
  for (int r = 12; r >= 0; r--) {
    int c = cnt[r];
    if (c == 4) quad = r;
    else if (c == 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (c == 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else singles |= 1u << r; }
    else if (c == 1) singles |= 1u << r;
  }
  (void)ncards;
  if (quad >= 0) {
    uint32_t rest = all & ~(1u << quad);
    return (7u << 20) | ((uint32_t)quad << 16) | ((uint32_t)hibit(rest) << 12);
  }
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) {
    int pr = t2 > p1 ? t2 : p1;
    return (6u << 20) | ((uint32_t)t1 << 16) | ((uint32_t)pr << 12);
  }
  int st = straight_top(all);
  if (st >= 0) return (4u << 20) | ((uint32_t)st << 16);
  if (t1 >= 0) {
    uint32_t rest = all & ~(1u << t1);
    return (3u << 20) | ((uint32_t)t1 << 16) | (topn(rest, 2) << 8);
  }
  if (p2 >= 0) {
    uint32_t rest = all & ~(1u << p1) & ~(1u << p2);
    return (2u << 20) | ((uint32_t)p1 << 16) | ((uint32_t)p2 << 12) | ((uint32_t)hibit(rest) << 8);
  }
  if (p1 >= 0) {
    uint32_t rest = all & ~(1u << p1);
    return (1u << 20) | ((uint32_t)p1 << 16) | (topn(rest, 3) << 4);
  }
  return topn(all, 5);
}
static inline uint32_t eval_n(const int *c, int n) {
  uint32_t sm[4] = {0, 0, 0, 0}; int cnt[13] = {0};
  for (int i = 0; i < n; i++) { sm[c[i] & 3] |= 1u << (c[i] >> 2); cnt[c[i] >> 2]++; }
  return eval_masks(sm, cnt, n);
}
