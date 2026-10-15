// Exact UTH preflop precompute (independent of the TS code). Build: gcc -O2 -pthread -o strat strat.c
// Run:  ./strat > preflop-blind-standard.csv   (about 30 min on 4 cores)
// Derived from the simulator spike's strat2.c with: canonical tie rule (smaller wager wins ties:
// check over 2x, fold over 1x), and the extra columns the "Why?" rows need.
// Slice columns SAs/SPs/SCs: the same sums restricted to boards with sorted index idx[0] >= 36 (of the
// 50 unseen cards) and flops with x >= 44, so JS can recompute them exactly in CI (decisions.md D22).
// Units: half-antes (x2) summed over the 990 dealer hands; flop sums also over 1,081 runouts.
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "eval.h"

#define NB 2118760 /* C(50,5) */
static long long C[60][8];
static const int BP2[10] = {0, 0, 0, 0, 2, 3, 6, 20, 100, 1000}; // 2*blind pay by category

typedef struct { int c1, c2, weight; char name[4]; long long SAs, SPs, SCs, SA, SP, SC, Wq, Lq, bb2q, bb2nq, S2x, Scp; long long flops2x, flopsCheck; long long riverFold; long long Sleak, Sexp, Wexp, SW, SL, Scr, Snf, Sbasic, Ssimple, Wopt, Wbasic, Wsimple, Wcr; } Cls;
static Cls cls[169];
static int ncls = 0, next_cls = 0;
static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;

static void *worker(void *arg) {
  (void)arg;
  int *A2 = malloc(sizeof(int) * NB);   // A2 per board
  int *P2 = malloc(sizeof(int) * NB);   // P2 per board
  unsigned char *FL = malloc(NB);        // bit0 basic river plays, bit1 simple river plays
  for (;;) {
    pthread_mutex_lock(&mu); int ci = next_cls++; pthread_mutex_unlock(&mu);
    if (ci >= ncls) break;
    Cls *k = &cls[ci];
    int rem[50], n = 0;
    for (int c = 0; c < 52; c++) if (c != k->c1 && c != k->c2) rem[n++] = c;
    long long SA = 0, SP = 0, SWc = 0, SLc = 0, SWq = 0, SLq = 0, BBq = 0, BBnq = 0, SAs = 0, SPs = 0, SCs = 0;
    int idx[5];
    for (idx[0] = 0; idx[0] < 50; idx[0]++)
    for (idx[1] = idx[0] + 1; idx[1] < 50; idx[1]++)
    for (idx[2] = idx[1] + 1; idx[2] < 50; idx[2]++)
    for (idx[3] = idx[2] + 1; idx[3] < 50; idx[3]++)
    for (idx[4] = idx[3] + 1; idx[4] < 50; idx[4]++) {
      uint32_t bsm[4] = {0, 0, 0, 0}; int bcnt[13] = {0};
      for (int i = 0; i < 5; i++) { int c = rem[idx[i]]; bsm[c & 3] |= 1u << (c >> 2); bcnt[c >> 2]++; }
      uint32_t psm[4]; int pcnt[13];
      memcpy(psm, bsm, sizeof psm); memcpy(pcnt, bcnt, sizeof pcnt);
      psm[k->c1 & 3] |= 1u << (k->c1 >> 2); pcnt[k->c1 >> 2]++;
      psm[k->c2 & 3] |= 1u << (k->c2 >> 2); pcnt[k->c2 >> 2]++;
      uint32_t P = eval_masks(psm, pcnt, 7);
      int W = 0, Wq = 0, L = 0, Lq = 0;
      int drem[45], m = 0, j = 0;
      for (int i = 0; i < 50; i++) { if (j < 5 && idx[j] == i) { j++; continue; } drem[m++] = rem[i]; }
      for (int a = 0; a < 45; a++) {
        int ca = drem[a];
        uint32_t asm_[4]; int acnt[13];
        memcpy(asm_, bsm, sizeof asm_); memcpy(acnt, bcnt, sizeof acnt);
        asm_[ca & 3] |= 1u << (ca >> 2); acnt[ca >> 2]++;
        for (int b = a + 1; b < 45; b++) {
          int cb = drem[b];
          uint32_t dsm[4]; int dcnt[13];
          memcpy(dsm, asm_, sizeof dsm); memcpy(dcnt, acnt, sizeof dcnt);
          dsm[cb & 3] |= 1u << (cb >> 2); dcnt[cb >> 2]++;
          uint32_t D = eval_masks(dsm, dcnt, 7);
          int q = (D >> 20) >= 1;
          if (P > D) { W++; Wq += q; } else if (P < D) { L++; Lq += q; }
        }
      }
      int bp2 = BP2[P >> 20];
      int a2 = W * bp2 + 2 * Wq - 2 * L - 2 * Lq;
      int p2 = 2 * (W - L);
      long long bi = C[idx[0]][1] + C[idx[1]][2] + C[idx[2]][3] + C[idx[3]][4] + C[idx[4]][5];
      A2[bi] = a2; P2[bi] = p2;
      { // river rule features
        int r1 = k->c1 >> 2, r2 = k->c2 >> 2;
        int bc[5]; for (int i = 0; i < 5; i++) bc[i] = rem[idx[i]];
        int match = 0; for (int i = 0; i < 5; i++) if ((bc[i] >> 2) == r1 || (bc[i] >> 2) == r2) match = 1;
        uint32_t B5 = eval_masks(bsm, bcnt, 5);
        (void)match;
        int hp = (P >> 20) >= 1 && (P >> 20) > (B5 >> 20);
        int outs = 0;
        if (!hp) for (int a = 0; a < 45; a++) {
          int ca = drem[a]; uint32_t s6[4]; int c6[13];
          memcpy(s6, bsm, sizeof s6); memcpy(c6, bcnt, sizeof c6);
          s6[ca & 3] |= 1u << (ca >> 2); c6[ca >> 2]++;
          if (eval_masks(s6, c6, 6) > P) outs++;
        }
        FL[bi] = (unsigned char)((hp || outs < 21 ? 1 : 0) | (hp ? 2 : 0));
      }
      if (idx[0] >= 36) { SAs += a2; SPs += p2; } SA += a2; SP += p2; SWc += W; SLc += L; SWq += Wq; SLq += Lq; BBq += (long long)Wq * bp2; BBnq += (long long)(W - Wq) * bp2;
    }
    // flop aggregation. Sums over (flop, turn/river) in x2 units; wagers in units.
    long long SC = 0, f2 = 0, fc = 0, rf = 0, S2x = 0, Scp = 0;
    long long Scr = 0, Snf = 0, Sbasic = 0, Ssimple = 0, Sexp = 0, Wexp = 0, Sleak = 0;      // check-to-river(opt river), never-fold, basic, simple (check paths)
    long long Wopt = 0, Wbasic = 0, Wsimple = 0, Wcr = 0;    // wagers on check paths (given strategy's flop choice)
    int r1 = k->c1 >> 2, r2 = k->c2 >> 2, s1 = k->c1 & 3, s2u = k->c2 & 3;
    for (int x = 0; x < 50; x++) for (int y = x + 1; y < 50; y++) for (int z = y + 1; z < 50; z++) {
      long long scpl = 0, rfl = 0, s2 = 0, sc = 0, scb = 0, scs = 0, scl = 0, snf = 0, wc = 0, wcb = 0, wcs = 0;
      int fcards[3] = {rem[x], rem[y], rem[z]};
      int fr[3] = {fcards[0] >> 2, fcards[1] >> 2, fcards[2] >> 2};
      int flopCat = (fr[0] == fr[1] && fr[1] == fr[2]) ? 3 : (fr[0] == fr[1] || fr[1] == fr[2] || fr[0] == fr[2]) ? 1 : 0;
      int five[5] = {k->c1, k->c2, fcards[0], fcards[1], fcards[2]};
      uint32_t v5 = eval_n(five, 5);
      int pocket = r1 == r2;
      int match = 0; for (int i = 0; i < 3; i++) if (fr[i] == r1 || fr[i] == r2) match = 1;
      int hidden = pocket || match;
      int tp = (int)(v5 >> 20) >= 2 && (int)(v5 >> 20) > flopCat;
      int ff = 0;
      for (int s = 0; s < 4; s++) {
        int n = 0; for (int i = 0; i < 5; i++) if ((five[i] & 3) == s) n++;
        if (n == 4 && ((s1 == s && r1 >= 8) || (s2u == s && r2 >= 8))) ff = 1;
      }
      int basicFlop = tp || (hidden && !(pocket && r1 == 0)) || ff;
      int hiddenC = (int)(v5 >> 20) >= 1 && (int)(v5 >> 20) > flopCat;
      int simpleFlop = tp || (hiddenC && !(pocket && r1 == 0 && (v5 >> 20) == 1));
      int leakFlop = tp || hidden;
      for (int u = 0; u < 50; u++) {
        if (u == x || u == y || u == z) continue;
        for (int v = u + 1; v < 50; v++) {
          if (v == x || v == y || v == z) continue;
          int s[5] = {x, y, z, u, v};
          for (int i = 1; i < 5; i++) { int t = s[i], j2 = i - 1; while (j2 >= 0 && s[j2] > t) { s[j2 + 1] = s[j2]; j2--; } s[j2 + 1] = t; }
          long long bi = C[s[0]][1] + C[s[1]][2] + C[s[2]][3] + C[s[3]][4] + C[s[4]][5];
          int a2 = A2[bi], p2 = P2[bi], fl = FL[bi];
          s2 += a2 + 2 * p2;
          int play1 = a2 + p2, fold = -4 * 990;
          if (play1 > fold) { sc += play1; scpl += play1; wc += 3; } else { sc += fold; rfl++; wc += 2; }
          if (fl & 1) { scb += play1; wcb += 3; } else { scb += fold; wcb += 2; }
          if (fl & 1) { scs += play1; wcs += 3; } else { scs += fold; wcs += 2; }
          if (fl & 2) { scl += play1; } else { scl += fold; }
          snf += play1;
        }
      }
      if (x >= 44) SCs += (s2 > sc ? s2 : sc);
      if (s2 > sc) { SC += s2; S2x += s2; f2++; Wopt += 4 * 1081; } else { SC += sc; fc++; Wopt += wc; Scp += scpl; rf += rfl; }
      Scr += sc; Wcr += wc; Snf += snf;
      if (basicFlop) { Sexp += s2; Wexp += 4 * 1081; } else { Sexp += sc; Wexp += wc; }
      if (basicFlop) { Sbasic += s2; Wbasic += 4 * 1081; } else { Sbasic += scb; Wbasic += wcb; }
      if (leakFlop) Sleak += s2; else Sleak += scl;
      if (simpleFlop) { Ssimple += s2; Wsimple += 4 * 1081; } else { Ssimple += scs; Wsimple += wcs; }
    }
    k->SAs = SAs; k->SPs = SPs; k->SCs = SCs; k->SA = SA; k->SP = SP; k->Wq = SWq; k->Lq = SLq; k->bb2q = BBq; k->bb2nq = BBnq; k->S2x = S2x; k->Scp = Scp; k->SC = SC; k->flops2x = f2; k->flopsCheck = fc; k->riverFold = rf;
    k->Sleak = Sleak; k->Sexp = Sexp; k->Wexp = Wexp; k->SW = SWc; k->SL = SLc; k->Scr = Scr; k->Snf = Snf; k->Sbasic = Sbasic; k->Ssimple = Ssimple;
    k->Wopt = Wopt; k->Wbasic = Wbasic; k->Wsimple = Wsimple; k->Wcr = Wcr;
    fprintf(stderr, "done %s\n", k->name);
  }
  free(A2); free(P2); free(FL);
  return NULL;
}

int main(void) {
  for (int i = 0; i < 60; i++) { C[i][0] = 1; for (int j = 1; j < 8; j++) C[i][j] = i == 0 ? 0 : C[i - 1][j - 1] + C[i - 1][j]; }
  const char *R = "23456789TJQKA";
  for (int h = 12; h >= 0; h--) for (int l = h; l >= 0; l--) {
    if (h == l) { Cls *k = &cls[ncls++]; k->c1 = h * 4; k->c2 = h * 4 + 1; k->weight = 6; sprintf(k->name, "%c%c", R[h], R[l]); continue; }
    Cls *k = &cls[ncls++]; k->c1 = h * 4; k->c2 = l * 4; k->weight = 4; sprintf(k->name, "%c%cs", R[h], R[l]);
    k = &cls[ncls++]; k->c1 = h * 4; k->c2 = l * 4 + 1; k->weight = 12; sprintf(k->name, "%c%co", R[h], R[l]);
  }
  pthread_t th[4];
  for (int i = 0; i < 4; i++) pthread_create(&th[i], NULL, worker, NULL);
  for (int i = 0; i < 4; i++) pthread_join(th[i], NULL);
  // DR = 2*990*NB ; DC = 2*990*1081*19600
  printf("class,weight,SA,SP,SC,SW,SL,Wq,Lq,bb2q,bb2nq,S2x,Scp,F2,Fc,Cf,Wopt,SAs,SPs,SCs\n");
  for (int i = 0; i < ncls; i++) { Cls *k = &cls[i]; printf("%s,%d,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld,%lld\n", k->name, k->weight, k->SA, k->SP, k->SC, k->SW, k->SL, k->Wq, k->Lq, k->bb2q, k->bb2nq, k->S2x, k->Scp, k->flops2x, k->flopsCheck, k->riverFold, k->Wopt, k->SAs, k->SPs, k->SCs); }
  return 0;
}
