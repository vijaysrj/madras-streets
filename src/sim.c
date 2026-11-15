// Madras Streets — simulation core, compiled to WebAssembly with clang (no libc).
// Handles: vehicle physics (player), traffic AI on the road graph (left-hand traffic),
// pedestrians on footpaths, collisions with buildings, water and other vehicles.
#define EXPORT(n) __attribute__((export_name(n)))
typedef unsigned char u8;

#define PI 3.14159265f
#define TAU 6.28318531f
#define MAXPTS 60000
#define MAXROADS 5000
#define MAXLINKS 60000
#define MAXB 60000
#define MAXCARS 150
#define MAXPEDS 180
#define CF 24
#define PF 12
#define GMAX (1400 * 1400)
#define BCELL 24.f
#define BGMAX (260 * 260)
#define BLMAX (MAXB * 9)

enum { X, Z, H, VX, VZ, STEER, TYPE, MODE, ROAD, S, DIR, SEG, SPD, DMG, HL, HW, TMR, STK, COL, LANE, YR, BRAKE, AUX1, AUX2 };
enum { PX, PZ, PH, PST, PROAD, PS, PDIR, PSEG, PTMR, PSIDE, PCOL, PSPD };
// car modes
enum { M_NONE = 0, M_TRAFFIC = 1, M_FREE = 2, M_PLAYER = 4, M_PARKED = 5 };
// vehicle types: 0 car, 1 auto-rickshaw, 2 bus, 3 hatchback, 4 taxi, 5 scooter
static const float T_HL[6] = {2.25f, 1.35f, 5.6f, 1.85f, 2.3f, 0.95f};
static const float T_HW[6] = {0.92f, 0.70f, 1.30f, 0.85f, 0.92f, 0.38f};
static const float T_MAXV[6] = {36, 15, 19, 30, 34, 22};
static const float T_ACC[6] = {7.5f, 3.6f, 2.4f, 6.5f, 7.f, 5.f};
static const float T_MASS[6] = {1.2f, 0.45f, 9.f, 0.95f, 1.2f, 0.15f};

float roadPts[MAXPTS * 3];   // x, z, s(cumulative)
float roadInfo[MAXROADS * 4];
EXPORT("max_roads") int max_roads(void) { return MAXROADS; } // start, count, halfwidth, major
int linkStart[MAXPTS], linkCount[MAXPTS], links[MAXLINKS * 2];
float bld[MAXB * 6]; // cx, cz, hx, hz, cos, sin
u8 grid[GMAX];       // bit0 road, bit1 water
float cars[MAXCARS * CF];
float peds[MAXPEDS * PF];
float player[8]; // foot: x z h speed phase
int evs[8];      // 0 crashes, 1 max impact*10, 2 near-miss peds, 3 kerb hits
float inp[8];    // thr brk steer hb footMx footMz

static int nRoads, nB, gW, gH, nTraffic = 110, nPeds = 150, pcar = -1;
static float gOX, gOZ, gC;
static int bgW, bgH;
static float bgOX, bgOZ;
static int bgStart[BGMAX], bgCnt[BGMAX], bgList[BLMAX];
static unsigned rng = 1234567u;

static float fabsf_(float x) { return x < 0 ? -x : x; }
static float sqrtf_(float x) { return __builtin_sqrtf(x); }
static float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }
static float wrapa(float a) { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; }
static float fsin(float x) {
  x = wrapa(x);
  if (x > PI * 0.5f) x = PI - x; else if (x < -PI * 0.5f) x = -PI - x;
  float x2 = x * x;
  return x * (1.f - x2 / 6.f * (1.f - x2 / 20.f * (1.f - x2 / 42.f * (1.f - x2 / 72.f))));
}
static float fcos(float x) { return fsin(x + PI * 0.5f); }
static float fatan2(float y, float x) {
  float ax = fabsf_(x), ay = fabsf_(y);
  if (ax < 1e-9f && ay < 1e-9f) return 0;
  float a = ax > ay ? ay / ax : ax / ay, s = a * a;
  float r = ((-0.0464964749f * s + 0.15931422f) * s - 0.327622764f) * s * a + a;
  if (ay > ax) r = 1.57079637f - r;
  if (x < 0) r = PI - r;
  if (y < 0) r = -r;
  return r;
}
static float frand(void) { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; return (rng & 0xffffff) / 16777216.f; }

EXPORT("p_roadPts") float *p_roadPts(void) { return roadPts; }
EXPORT("p_roadInfo") float *p_roadInfo(void) { return roadInfo; }
EXPORT("p_linkStart") int *p_linkStart(void) { return linkStart; }
EXPORT("p_linkCount") int *p_linkCount(void) { return linkCount; }
EXPORT("p_links") int *p_links(void) { return links; }
EXPORT("p_bld") float *p_bld(void) { return bld; }
EXPORT("p_grid") u8 *p_grid(void) { return grid; }
EXPORT("p_cars") float *p_cars(void) { return cars; }
EXPORT("p_peds") float *p_peds(void) { return peds; }
EXPORT("p_player") float *p_player(void) { return player; }
EXPORT("p_evs") int *p_evs(void) { return evs; }
EXPORT("p_inp") float *p_inp(void) { return inp; }
EXPORT("max_cars") int max_cars(void) { return MAXCARS; }
EXPORT("max_peds") int max_peds(void) { return MAXPEDS; }
EXPORT("max_pts") int max_pts(void) { return MAXPTS; }
EXPORT("max_b") int max_b(void) { return MAXB; }
EXPORT("max_links") int max_links(void) { return MAXLINKS; }
EXPORT("max_grid") int max_grid(void) { return GMAX; }
EXPORT("get_pcar") int get_pcar(void) { return pcar; }

// ---------- roads ----------
static float *RP(int r, int i) { return &roadPts[((int)roadInfo[r * 4] + i) * 3]; }
static int RN(int r) { return (int)roadInfo[r * 4 + 1]; }
static void road_eval(int r, float s, float *segf, float *px, float *pz, float *tx, float *tz) {
  int n = RN(r), i = (int)*segf;
  if (i < 0) i = 0;
  if (i > n - 2) i = n - 2;
  while (i < n - 2 && RP(r, i + 1)[2] < s) i++;
  while (i > 0 && RP(r, i)[2] > s) i--;
  *segf = (float)i;
  float *a = RP(r, i), *b = RP(r, i + 1);
  float L = b[2] - a[2], t = L > 1e-4f ? clampf((s - a[2]) / L, 0, 1) : 0;
  float dx = b[0] - a[0], dz = b[1] - a[1], l = sqrtf_(dx * dx + dz * dz);
  if (l < 1e-4f) l = 1;
  *px = a[0] + dx * t; *pz = a[1] + dz * t; *tx = dx / l; *tz = dz / l;
}

// ---------- world queries ----------
static int cell_at(float x, float z) {
  int cx = (int)((x - gOX) / gC), cz = (int)((z - gOZ) / gC);
  if (x < gOX || z < gOZ || cx >= gW || cz >= gH) return 2;
  return grid[cz * gW + cx];
}
static int blocked(float x, float z) { int g = cell_at(x, z); return (g & 2) && !(g & 1); }
EXPORT("on_road") int on_road(float x, float z) { return cell_at(x, z) & 1; }

static int push_circle(float *px, float *pz, float r, float *nxs, float *nzs) {
  int hit = 0;
  float x = *px, z = *pz;
  int c0 = (int)((x - r - 16 - bgOX) / BCELL), c1 = (int)((x + r + 16 - bgOX) / BCELL);
  int r0 = (int)((z - r - 16 - bgOZ) / BCELL), r1 = (int)((z + r + 16 - bgOZ) / BCELL);
  if (c0 < 0) c0 = 0; if (r0 < 0) r0 = 0; if (c1 >= bgW) c1 = bgW - 1; if (r1 >= bgH) r1 = bgH - 1;
  for (int rr = r0; rr <= r1; rr++)
    for (int cc = c0; cc <= c1; cc++) {
      int cell = rr * bgW + cc, st = bgStart[cell], cn = bgCnt[cell];
      for (int k = 0; k < cn; k++) {
        float *b = &bld[bgList[st + k] * 6];
        float dx = x - b[0], dz = z - b[1];
        float lx = dx * b[4] + dz * b[5], lz = -dx * b[5] + dz * b[4];
        if (fabsf_(lx) > b[2] + r || fabsf_(lz) > b[3] + r) continue;
        float qx = clampf(lx, -b[2], b[2]), qz = clampf(lz, -b[3], b[3]);
        float ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez, nlx, nlz, pen;
        if (d2 > 1e-8f) {
          if (d2 >= r * r) continue;
          float d = sqrtf_(d2); nlx = ex / d; nlz = ez / d; pen = r - d;
        } else {
          float ppx = b[2] - fabsf_(lx), ppz = b[3] - fabsf_(lz);
          if (ppx < ppz) { nlx = lx < 0 ? -1.f : 1.f; nlz = 0; pen = ppx + r; }
          else { nlx = 0; nlz = lz < 0 ? -1.f : 1.f; pen = ppz + r; }
        }
        float nx = nlx * b[4] - nlz * b[5], nz = nlx * b[5] + nlz * b[4];
        x += nx * pen; z += nz * pen; *nxs += nx; *nzs += nz; hit = 1;
      }
    }
  *px = x; *pz = z;
  return hit;
}

static void build_bgrid(void) {
  bgOX = gOX; bgOZ = gOZ;
  bgW = (int)(gW * gC / BCELL) + 1; bgH = (int)(gH * gC / BCELL) + 1;
  if (bgW * bgH > BGMAX) { bgH = BGMAX / bgW; }
  for (int i = 0; i < bgW * bgH; i++) bgCnt[i] = 0;
  for (int pass = 0; pass < 2; pass++) {
    if (pass == 1) {
      int acc = 0;
      for (int i = 0; i < bgW * bgH; i++) { bgStart[i] = acc; acc += bgCnt[i]; bgCnt[i] = 0; }
    }
    for (int i = 0; i < nB; i++) {
      float *b = &bld[i * 6];
      float rad = sqrtf_(b[2] * b[2] + b[3] * b[3]);
      int c0 = (int)((b[0] - rad - bgOX) / BCELL), c1 = (int)((b[0] + rad - bgOX) / BCELL);
      int r0 = (int)((b[1] - rad - bgOZ) / BCELL), r1 = (int)((b[1] + rad - bgOZ) / BCELL);
      if (c0 < 0) c0 = 0; if (r0 < 0) r0 = 0; if (c1 >= bgW) c1 = bgW - 1; if (r1 >= bgH) r1 = bgH - 1;
      for (int rr = r0; rr <= r1; rr++)
        for (int cc = c0; cc <= c1; cc++) {
          int cell = rr * bgW + cc;
          if (pass == 1) { int at = bgStart[cell] + bgCnt[cell]; if (at < BLMAX) bgList[at] = i; }
          bgCnt[cell]++;
        }
    }
  }
}

// ---------- spawning ----------
static float *CAR(int i) { return &cars[i * CF]; }
static float *PED(int i) { return &peds[i * PF]; }
static float ppx(void) { return pcar >= 0 ? CAR(pcar)[X] : player[0]; }
static float ppz(void) { return pcar >= 0 ? CAR(pcar)[Z] : player[1]; }

static int random_road_pos(float rmin, float rmax, int majorOnly, int *ro, float *so, float *xo, float *zo, float *txo, float *tzo) {
  float cx = ppx(), cz = ppz();
  for (int tries = 0; tries < 50; tries++) {
    int r = (int)(frand() * nRoads);
    if (r >= nRoads) r = nRoads - 1;
    if (majorOnly && roadInfo[r * 4 + 3] < 0.5f) continue;
    int n = RN(r);
    float len = RP(r, n - 1)[2], s = frand() * len, seg = 0, x, z, tx, tz;
    road_eval(r, s, &seg, &x, &z, &tx, &tz);
    float dx = x - cx, dz = z - cz, d = sqrtf_(dx * dx + dz * dz);
    if (d < rmin || d > rmax) continue;
    *ro = r; *so = s; *xo = x; *zo = z; *txo = tx; *tzo = tz;
    return 1;
  }
  return 0;
}

static void set_type(float *c, int t) {
  c[TYPE] = (float)t; c[HL] = T_HL[t]; c[HW] = T_HW[t];
}

static void spawn_traffic(float *c, float rmin, float rmax) {
  int r; float s, x, z, tx, tz;
  float u = frand();
  int t = u < 0.45f ? 5 : u < 0.65f ? 1 : u < 0.79f ? 0 : u < 0.89f ? 3 : u < 0.93f ? 4 : 2; // Chennai mix: mostly two-wheelers and autos
  if (!random_road_pos(rmin, rmax, t == 2, &r, &s, &x, &z, &tx, &tz)) { c[MODE] = 0; return; }
  for (int i = 0; i < CF; i++) c[i] = 0;
  set_type(c, t);
  c[MODE] = M_TRAFFIC; c[ROAD] = (float)r; c[S] = s; c[DIR] = frand() < 0.5f ? 1.f : -1.f;
  float seg = 0, px, pz, ttx, ttz;
  road_eval(r, s, &seg, &px, &pz, &ttx, &ttz);
  c[SEG] = seg;
  float hw = roadInfo[r * 4 + 2];
  int major = roadInfo[r * 4 + 3] > 0.5f;
  // left-hand traffic: slower vehicles hug the kerb lane
  float lane = major ? ((t == 1 || t == 5 || t == 2) ? 0.72f : (frand() < 0.5f ? 0.3f : 0.62f)) : 0.45f;
  c[LANE] = lane * hw;
  float d = c[DIR];
  c[X] = px + d * ttz * c[LANE]; c[Z] = pz - d * ttx * c[LANE];
  c[H] = fatan2(d * ttx, d * ttz);
  c[SPD] = 4 + frand() * 4;
  c[COL] = (float)(int)(frand() * 16);
  c[AUX1] = 0.85f + frand() * 0.3f; // driver temperament
}

static void spawn_ped(float *p, float rmin, float rmax) {
  int r; float s, x, z, tx, tz;
  if (!random_road_pos(rmin, rmax, 0, &r, &s, &x, &z, &tx, &tz)) { p[PST] = 0; return; }
  p[PST] = 1; p[PROAD] = (float)r; p[PS] = s; p[PDIR] = frand() < 0.5f ? 1.f : -1.f; p[PSEG] = 0;
  p[PSIDE] = frand() < 0.5f ? 1.f : -1.f; p[PCOL] = (float)(int)(frand() * 32); p[PSPD] = 1.0f + frand() * 0.6f;
  p[PTMR] = frand() * 10;
  float hw = roadInfo[r * 4 + 2] + 2.0f + frand() * 0.8f;
  p[PX] = x + p[PSIDE] * tz * hw; p[PZ] = z - p[PSIDE] * tx * hw;
  p[PH] = fatan2(p[PDIR] * tx, p[PDIR] * tz);
}

EXPORT("setup") void setup(int nr, int nb, int gw, int gh, float ox, float oz, float gc, int seed) {
  nRoads = nr; nB = nb; gW = gw; gH = gh; gOX = ox; gOZ = oz; gC = gc;
  rng = (unsigned)seed * 2654435761u + 1u;
  build_bgrid();
  for (int i = 0; i < MAXCARS * CF; i++) cars[i] = 0;
  for (int i = 0; i < MAXPEDS * PF; i++) peds[i] = 0;
}

EXPORT("set_counts") void set_counts(int traffic, int npeds) {
  nTraffic = traffic < MAXCARS - 12 ? traffic : MAXCARS - 12;
  nPeds = npeds < MAXPEDS ? npeds : MAXPEDS;
}

EXPORT("populate") void populate(void) {
  for (int i = 0; i < nTraffic; i++) if (CAR(i)[MODE] == M_NONE) spawn_traffic(CAR(i), 25, 420);
  for (int i = 0; i < nPeds; i++) if (PED(i)[PST] == 0) spawn_ped(PED(i), 10, 230);
}

// parked/hire vehicles use the top slots
EXPORT("spawn_parked") int spawn_parked(int t, float x, float z, float h, int col) {
  for (int i = MAXCARS - 1; i >= MAXCARS - 12; i--) {
    float *c = CAR(i);
    if (c[MODE] != M_NONE) continue;
    for (int k = 0; k < CF; k++) c[k] = 0;
    set_type(c, t); c[MODE] = M_PARKED; c[X] = x; c[Z] = z; c[H] = h; c[COL] = (float)col;
    return i;
  }
  return -1;
}
EXPORT("remove_car") void remove_car(int i) { if (i >= 0 && i < MAXCARS && i != pcar) CAR(i)[MODE] = 0; }
EXPORT("set_player_foot") void set_player_foot(float x, float z, float h) { player[0] = x; player[1] = z; player[2] = h; }

// ---------- vehicle physics ----------
static void car_physics(float *c, float dt, float thr, float brk, float steer, float hb) {
  int t = (int)c[TYPE];
  float h = c[H], fx = fsin(h), fz = fcos(h);
  float vx = c[VX], vz = c[VZ];
  float vf = vx * fx + vz * fz, vr = vx * (-fz) + vz * fx;
  float maxv = T_MAXV[t], acc = T_ACC[t];
  if (c[DMG] >= 100) { thr *= 0.25f; maxv *= 0.3f; }
  c[BRAKE] = 0;
  if (thr > 0) {
    if (vf < -0.3f) { vf += 9.f * thr * dt; c[BRAKE] = 1; }
    else if (vf < maxv) { float k = vf / maxv; vf += acc * thr * (1.f - 0.75f * k * k) * dt; }
  }
  if (brk > 0) {
    if (vf > 0.3f) { vf -= 9.5f * brk * dt; if (vf < 0) vf = 0; c[BRAKE] = 1; }
    else if (vf > -maxv * 0.22f) vf -= acc * 0.55f * brk * dt;
  }
  // rolling resistance + aero drag
  vf -= vf * (0.02f + 0.0016f * fabsf_(vf)) * dt;
  if (thr == 0 && brk == 0) { float rr = 0.6f * dt; if (vf > rr) vf -= rr; else if (vf < -rr) vf += rr; else vf = 0; }
  if (hb > 0) { float dec = 6.f * dt; if (vf > dec) vf -= dec; else if (vf < -dec) vf += dec; else vf = 0; }
  // speed-sensitive steering
  float sa = steer * 0.55f / (1.f + fabsf_(vf) * 0.07f);
  float wb = c[HL] * 1.25f;
  float yr = vf * sa / wb;
  c[STEER] = sa;
  vx = vf * fx + vr * (-fz); vz = vf * fz + vr * fx;
  h = wrapa(h - yr * dt);
  fx = fsin(h); fz = fcos(h);
  vf = vx * fx + vz * fz; vr = vx * (-fz) + vz * fx;
  float grip = hb > 0 ? 1.6f : (t == 5 ? 14.f : 8.f);
  vr -= vr * clampf(grip * dt, 0, 1);
  vx = vf * fx + vr * (-fz); vz = vf * fz + vr * fx;
  c[H] = h; c[VX] = vx; c[VZ] = vz; c[YR] = yr; c[SPD] = vf;
  c[X] += vx * dt; c[Z] += vz * dt;
}

static float car_world(float *c, float ox, float oz, float oh) {
  float fx = fsin(c[H]), fz = fcos(c[H]);
  float off = c[HL] - c[HW], r = c[HW] + 0.05f, nx = 0, nz = 0;
  int hit = 0;
  for (int k = -1; k <= 1; k += 2) {
    float cx = c[X] + fx * off * k, cz = c[Z] + fz * off * k, px = cx, pz = cz;
    if (push_circle(&px, &pz, r, &nx, &nz)) { c[X] += px - cx; c[Z] += pz - cz; hit = 1; }
  }
  float impact = 0;
  if (blocked(c[X] + fx * off, c[Z] + fz * off) || blocked(c[X] - fx * off, c[Z] - fz * off)) {
    impact = sqrtf_(c[VX] * c[VX] + c[VZ] * c[VZ]);
    c[X] = ox; c[Z] = oz; c[H] = oh; c[VX] *= -0.15f; c[VZ] *= -0.15f;
  } else if (hit) {
    float l = sqrtf_(nx * nx + nz * nz);
    if (l > 1e-5f) {
      nx /= l; nz /= l;
      float vn = c[VX] * nx + c[VZ] * nz;
      if (vn < 0) {
        c[VX] -= 1.25f * vn * nx; c[VZ] -= 1.25f * vn * nz;
        c[VX] *= 0.85f; c[VZ] *= 0.85f;
        impact = -vn;
      }
    }
  }
  if (impact > 4.f) c[DMG] += (impact - 4.f) * 2.2f;
  if (c[DMG] > 100) c[DMG] = 100;
  return impact;
}

static void kin_vel(float *c, float *vx, float *vz) {
  if (c[MODE] == M_TRAFFIC) { *vx = fsin(c[H]) * c[SPD]; *vz = fcos(c[H]) * c[SPD]; }
  else { *vx = c[VX]; *vz = c[VZ]; }
}

static void collide_cars(void) {
  for (int i = 0; i < MAXCARS; i++) {
    float *a = CAR(i);
    int ma = (int)a[MODE];
    if (!ma) continue;
    for (int j = i + 1; j < MAXCARS; j++) {
      float *b = CAR(j);
      int mb = (int)b[MODE];
      if (!mb) continue;
      int dynA = ma == M_FREE || ma == M_PLAYER, dynB = mb == M_FREE || mb == M_PLAYER;
      if (!dynA && !dynB) continue;
      float dx0 = b[X] - a[X], dz0 = b[Z] - a[Z];
      float reach = a[HL] + b[HL] + 1;
      if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
      float afx = fsin(a[H]), afz = fcos(a[H]), bfx = fsin(b[H]), bfz = fcos(b[H]);
      float aoff = a[HL] - a[HW], boff = b[HL] - b[HW];
      for (int ka = -1; ka <= 1; ka += 2)
        for (int kb = -1; kb <= 1; kb += 2) {
          float ax = a[X] + afx * aoff * ka, az = a[Z] + afz * aoff * ka;
          float bx = b[X] + bfx * boff * kb, bz = b[Z] + bfz * boff * kb;
          float dx = bx - ax, dz = bz - az, d2 = dx * dx + dz * dz, rs = a[HW] + b[HW] + 0.1f;
          if (d2 >= rs * rs || d2 < 1e-8f) continue;
          float d = sqrtf_(d2), nx = dx / d, nz = dz / d, pen = rs - d;
          // traffic and parked cars become free bodies once touched
          float avx, avz, bvx, bvz;
          kin_vel(a, &avx, &avz); kin_vel(b, &bvx, &bvz);
          if (ma == M_TRAFFIC || ma == M_PARKED) { a[MODE] = M_FREE; ma = M_FREE; a[VX] = avx; a[VZ] = avz; a[TMR] = 0; }
          if (mb == M_TRAFFIC || mb == M_PARKED) { b[MODE] = M_FREE; mb = M_FREE; b[VX] = bvx; b[VZ] = bvz; b[TMR] = 0; }
          float wa = T_MASS[(int)a[TYPE]], wb = T_MASS[(int)b[TYPE]], tot = wa + wb;
          a[X] -= nx * pen * wb / tot; a[Z] -= nz * pen * wb / tot;
          b[X] += nx * pen * wa / tot; b[Z] += nz * pen * wa / tot;
          float rel = (b[VX] - a[VX]) * nx + (b[VZ] - a[VZ]) * nz;
          if (rel < 0) {
            float jimp = -(1.f + 0.2f) * rel / (1.f / wa + 1.f / wb);
            a[VX] -= jimp / wa * nx; a[VZ] -= jimp / wa * nz;
            b[VX] += jimp / wb * nx; b[VZ] += jimp / wb * nz;
            float imp = -rel;
            if (imp > 2.5f) { a[DMG] += (imp - 2.5f) * 3.f * wb / tot * 2; b[DMG] += (imp - 2.5f) * 3.f * wa / tot * 2; }
            if (a[DMG] > 100) a[DMG] = 100;
            if (b[DMG] > 100) b[DMG] = 100;
            if ((i == pcar || j == pcar) && imp > 1.5f) {
              evs[0]++;
              int q = (int)(imp * 10);
              if (q > evs[1]) evs[1] = q;
            }
          }
        }
    }
  }
}

// ---------- traffic AI ----------
static void traffic_update(int idx, float dt) {
  float *c = CAR(idx);
  int r = (int)c[ROAD];
  float dir = c[DIR];
  int t = (int)c[TYPE];
  int major = roadInfo[r * 4 + 3] > 0.5f;
  float maxv = (major ? 13.5f : 8.f) * c[AUX1];
  if (t == 1) maxv *= 0.8f; else if (t == 2) maxv *= 0.85f; else if (t == 5) maxv *= 0.95f;
  float fx = fsin(c[H]), fz = fcos(c[H]);
  // look ahead for vehicles, pedestrians crossing and the player on foot
  float block = 999;
  for (int j = 0; j < MAXCARS; j++) {
    if (j == idx) continue;
    float *o = CAR(j);
    if (!o[MODE]) continue;
    float dx = o[X] - c[X], dz = o[Z] - c[Z];
    float along = dx * fx + dz * fz;
    if (along <= 0 || along > 30) continue;
    float lat = fabsf_(dx * fz - dz * fx);
    float wid = c[HW] + o[HW] + 0.6f;
    if (lat < wid) { float gap = along - c[HL] - o[HL]; if (gap < block) block = gap; }
  }
  if (pcar < 0) {
    float dx = player[0] - c[X], dz = player[1] - c[Z], along = dx * fx + dz * fz;
    if (along > 0 && along < 25 && fabsf_(dx * fz - dz * fx) < c[HW] + 1.2f) { float g = along - c[HL] - 0.5f; if (g < block) block = g; }
  }
  for (int j = 0; j < nPeds; j++) {
    float *p = PED(j);
    if (p[PST] != 3) continue; // crossing pedestrians
    float dx = p[PX] - c[X], dz = p[PZ] - c[Z], along = dx * fx + dz * fz;
    if (along > 0 && along < 22 && fabsf_(dx * fz - dz * fx) < c[HW] + 1.0f) { float g = along - c[HL] - 0.5f; if (g < block) block = g; }
  }
  if (c[STK] > 7.f) { block = 999; c[STK] += dt; if (c[STK] > 9.5f) c[STK] = 0; }
  float target = maxv;
  float safe = 2.5f + c[SPD] * 0.9f;
  if (block < safe + 14) target = maxv * clampf((block - safe) / 14.f, 0, 1);
  // slow down for upcoming bends
  {
    float seg = c[SEG], px, pz, tx, tz;
    road_eval(r, c[S] + dir * 18.f, &seg, &px, &pz, &tx, &tz);
    float ah = fatan2(dir * tx, dir * tz);
    float bend = fabsf_(wrapa(ah - c[H]));
    if (bend > 0.35f) { float lim = 4.f + (1.2f - clampf(bend, 0, 1.2f)) * 9.f; if (target > lim) target = lim; }
  }
  float dv = target - c[SPD];
  c[BRAKE] = dv < -0.5f ? 1.f : 0.f;
  c[SPD] += clampf(dv, -7.5f * dt, (t == 2 ? 1.2f : 2.2f) * dt);
  if (c[SPD] < 0) c[SPD] = 0;
  if (c[SPD] < 0.3f && target < 0.5f) c[STK] += dt; else if (c[STK] < 7.f) c[STK] = 0;

  float s1 = c[S] + c[SPD] * dt * dir;
  int n = RN(r), seg = (int)c[SEG];
  int vi = dir > 0 ? seg + 1 : seg;
  if (vi > n - 1) vi = n - 1;
  float vs = RP(r, vi)[2];
  if (dir > 0 ? s1 >= vs : s1 <= vs) {
    int gi = (int)roadInfo[r * 4] + vi, lc = linkCount[gi];
    int atEnd = (dir > 0 && vi == n - 1) || (dir < 0 && vi == 0);
    if (lc > 0 && (atEnd || frand() < 0.3f)) {
      int k = linkStart[gi] + (int)(frand() * lc);
      if (k >= linkStart[gi] + lc) k = linkStart[gi] + lc - 1;
      int nr = links[k * 2], ni = links[k * 2 + 1], nn = RN(nr);
      float nd = frand() < 0.5f ? 1.f : -1.f;
      if (ni == 0) nd = 1; else if (ni >= nn - 1) nd = -1;
      if (t == 2 && roadInfo[nr * 4 + 3] < 0.5f && !atEnd) { /* buses stay on main roads */ }
      else {
        r = nr; dir = nd; c[ROAD] = (float)r; c[DIR] = dir;
        s1 = RP(r, ni)[2];
        c[SEG] = (float)(dir > 0 ? (ni < nn - 1 ? ni : nn - 2) : (ni > 0 ? ni - 1 : 0));
        float hw = roadInfo[r * 4 + 2];
        int maj = roadInfo[r * 4 + 3] > 0.5f;
        c[LANE] = (maj ? ((t == 1 || t == 5 || t == 2) ? 0.72f : 0.45f) : 0.45f) * hw;
        c[SPD] *= 0.7f;
      }
    } else if (atEnd) { dir = -dir; c[DIR] = dir; s1 = vs; c[SPD] = 0; }
  }
  c[S] = s1;
  float segf = c[SEG], px, pz, tx, tz;
  road_eval(r, s1, &segf, &px, &pz, &tx, &tz);
  c[SEG] = segf;
  float lx = px + dir * tz * c[LANE], lz = pz - dir * tx * c[LANE];
  float k = clampf(dt * 4.f, 0, 1);
  c[X] += (lx - c[X]) * k; c[Z] += (lz - c[Z]) * k;
  float ht = fatan2(dir * tx, dir * tz);
  c[H] = wrapa(c[H] + wrapa(ht - c[H]) * clampf(dt * 3.5f, 0, 1));
}

// ---------- pedestrians ----------
static void ped_update(float *p, float dt) {
  int st = (int)p[PST];
  if (st == 0) return;
  if (st == 2) { // side-step out of a vehicle's way
    p[PTMR] -= dt;
    if (p[PTMR] <= 0) p[PST] = 1;
    return;
  }
  int r = (int)p[PROAD];
  float sx, sz, tx, tz, seg = p[PSEG];
  float hw = roadInfo[r * 4 + 2];
  if (st == 3) { // crossing the road at a junction-free spot
    p[PTMR] += dt;
    float w = 2.f * (hw + 2.2f);
    float prog = clampf(p[PTMR] * p[PSPD] / w, 0, 1);
    road_eval(r, p[PS], &seg, &sx, &sz, &tx, &tz);
    float side = p[PSIDE] * (1.f - 2.f * prog) * (hw + 2.2f);
    p[PX] = sx + tz * side; p[PZ] = sz - tx * side;
    p[PH] = fatan2(-tz * p[PSIDE], tx * p[PSIDE]);
    if (prog >= 1) { p[PST] = 1; p[PSIDE] = -p[PSIDE]; p[PTMR] = 8 + frand() * 20; }
    return;
  }
  float len = RP(r, RN(r) - 1)[2];
  p[PS] += p[PDIR] * p[PSPD] * dt;
  if (p[PS] > len) { p[PS] = len; p[PDIR] = -1; }
  if (p[PS] < 0) { p[PS] = 0; p[PDIR] = 1; }
  road_eval(r, p[PS], &seg, &sx, &sz, &tx, &tz);
  p[PSEG] = seg;
  float off = hw + 2.0f + (p[PCOL] - 16.f) * 0.04f;
  float tx2 = sx + p[PSIDE] * tz * off, tz2 = sz - p[PSIDE] * tx * off;
  p[PX] += (tx2 - p[PX]) * clampf(dt * 5, 0, 1); p[PZ] += (tz2 - p[PZ]) * clampf(dt * 5, 0, 1);
  p[PH] = wrapa(p[PH] + wrapa(fatan2(p[PDIR] * tx, p[PDIR] * tz) - p[PH]) * clampf(dt * 4, 0, 1));
  p[PTMR] -= dt;
  if (p[PTMR] <= 0) {
    // occasionally cross a minor road when it looks clear
    p[PTMR] = 10 + frand() * 25;
    if (roadInfo[r * 4 + 3] < 0.5f && frand() < 0.5f) {
      int clear = 1;
      for (int j = 0; j < MAXCARS && clear; j++) {
        float *o = CAR(j);
        if (!o[MODE]) continue;
        float dx = o[X] - p[PX], dz = o[Z] - p[PZ];
        if (dx * dx + dz * dz < 40 * 40) clear = 0;
      }
      if (clear) { p[PST] = 3; p[PTMR] = 0; }
    }
  }
}

// pedestrians never get hit: they step aside, and a car that touches one is stopped gently
static void ped_safety(float dt) {
  for (int i = 0; i < nPeds; i++) {
    float *p = PED(i);
    if (!p[PST]) continue;
    for (int j = 0; j < MAXCARS; j++) {
      float *c = CAR(j);
      int m = (int)c[MODE];
      if (m != M_PLAYER && m != M_FREE) continue;
      float fx = fsin(c[H]), fz = fcos(c[H]);
      float dx = p[PX] - c[X], dz = p[PZ] - c[Z];
      float along = dx * fx + dz * fz, lat = dx * (-fz) + dz * fx;
      float sp = sqrtf_(c[VX] * c[VX] + c[VZ] * c[VZ]);
      float look = c[HL] + 2.f + sp * 0.6f;
      if (along > -c[HL] - 0.5f && along < look && fabsf_(lat) < c[HW] + 1.0f) {
        // jump clear sideways
        float side = lat >= 0 ? 1.f : -1.f;
        float need = c[HW] + 1.1f - fabsf_(lat);
        p[PX] += (-fz) * side * need; p[PZ] += fx * side * need;
        if (p[PST] != 2) { p[PST] = 2; p[PTMR] = 1.2f; if (j == pcar && sp > 4) evs[2]++; }
        if (along > -c[HL] && along < c[HL] + 0.6f && fabsf_(lat) < c[HW] + 0.5f) {
          c[VX] *= 0.5f; c[VZ] *= 0.5f;
        }
      }
    }
  }
}

// ---------- player on foot ----------
static void foot_update(float dt) {
  float mx = inp[4], mz = inp[5];
  float sp = sqrtf_(mx * mx + mz * mz);
  float ox = player[0], oz = player[1];
  player[0] += mx * dt; player[1] += mz * dt;
  float nx = 0, nz = 0;
  push_circle(&player[0], &player[1], 0.4f, &nx, &nz);
  for (int j = 0; j < MAXCARS; j++) {
    float *c = CAR(j);
    if (!c[MODE]) continue;
    float fx = fsin(c[H]), fz = fcos(c[H]), off = c[HL] - c[HW];
    for (int k = -1; k <= 1; k++) {
      float cx = c[X] + fx * off * k, cz = c[Z] + fz * off * k;
      float dx = player[0] - cx, dz = player[1] - cz, d2 = dx * dx + dz * dz, rs = c[HW] + 0.45f;
      if (d2 < rs * rs && d2 > 1e-6f) { float d = sqrtf_(d2); player[0] = cx + dx / d * rs; player[1] = cz + dz / d * rs; }
    }
  }
  if (blocked(player[0], player[1])) { player[0] = ox; player[1] = oz; }
  if (sp > 0.1f) {
    player[2] = wrapa(player[2] + wrapa(fatan2(mx, mz) - player[2]) * clampf(dt * 10, 0, 1));
    player[4] += dt * sp * 1.6f;
  }
  player[3] = sp;
}

EXPORT("try_enter") int try_enter(void) {
  if (pcar >= 0) return -1;
  int best = -1;
  float bd = 1e9f;
  for (int i = 0; i < MAXCARS; i++) {
    float *c = CAR(i);
    if (c[MODE] != M_PARKED && c[MODE] != M_FREE) continue;
    if (c[MODE] == M_FREE && c[AUX2] < 0.5f) continue; // only player-owned / hired vehicles
    float dx = c[X] - player[0], dz = c[Z] - player[1], d2 = dx * dx + dz * dz;
    float lim = c[HL] + 2.0f;
    if (d2 < lim * lim && d2 < bd) { bd = d2; best = i; }
  }
  if (best >= 0) {
    float *c = CAR(best);
    c[MODE] = M_PLAYER; c[AUX2] = 1; pcar = best;
  }
  return best;
}
EXPORT("mark_owned") void mark_owned(int i) { if (i >= 0 && i < MAXCARS) CAR(i)[AUX2] = 1; }

EXPORT("exit_car") int exit_car(void) {
  if (pcar < 0) return 0;
  float *c = CAR(pcar);
  float sp = sqrtf_(c[VX] * c[VX] + c[VZ] * c[VZ]);
  if (sp > 2.5f) return 0;
  float h = c[H], lx = fcos(h), lz = -fsin(h); // left side (kerb side in India)
  float d = c[HW] + 0.9f;
  float x = c[X] + lx * d, z = c[Z] + lz * d;
  float nx = 0, nz = 0, tx = x, tz = z;
  if (push_circle(&tx, &tz, 0.4f, &nx, &nz) || blocked(x, z)) { x = c[X] - lx * d; z = c[Z] - lz * d; }
  player[0] = x; player[1] = z; player[2] = h;
  c[MODE] = M_PARKED; c[VX] = 0; c[VZ] = 0; c[AUX2] = 1;
  pcar = -1;
  return 1;
}

EXPORT("repair") void repair(int i) { if (i >= 0) CAR(i)[DMG] = 0; }

// ---------- main step ----------
EXPORT("step") void step(float dt) {
  float cx = ppx(), cz = ppz();
  // keep traffic and pedestrians around the player
  for (int i = 0; i < nTraffic; i++) {
    float *c = CAR(i);
    int m = (int)c[MODE];
    if (m == M_PLAYER) continue;
    if (m == M_NONE) { spawn_traffic(c, 230, 430); continue; }
    if (c[AUX2] > 0.5f) continue; // owned vehicles stay
    float dx = c[X] - cx, dz = c[Z] - cz;
    if (dx * dx + dz * dz > 500.f * 500.f) c[MODE] = 0;
  }
  for (int i = 0; i < nPeds; i++) {
    float *p = PED(i);
    if (p[PST] == 0) { spawn_ped(p, 150, 240); continue; }
    float dx = p[PX] - cx, dz = p[PZ] - cz;
    if (dx * dx + dz * dz > 270.f * 270.f) p[PST] = 0;
  }
  for (int i = 0; i < MAXCARS; i++) {
    float *c = CAR(i);
    int m = (int)c[MODE];
    if (m == M_TRAFFIC) traffic_update(i, dt);
    else if (m == M_PLAYER || m == M_FREE) {
      float ox = c[X], oz = c[Z], oh = c[H];
      if (m == M_PLAYER) car_physics(c, dt, inp[0], inp[1], inp[2], inp[3]);
      else {
        car_physics(c, dt, 0, 0, 0, 1);
        float sp = c[VX] * c[VX] + c[VZ] * c[VZ];
        // a bumped traffic car recovers and rejoins its lane after a pause
        if (c[AUX2] < 0.5f && sp < 0.05f) { c[TMR] += dt; if (c[TMR] > 4.f) { c[MODE] = M_TRAFFIC; c[SPD] = 0; c[TMR] = 0; } }
      }
      float imp = car_world(c, ox, oz, oh);
      if (i == pcar && imp > 3.f) { evs[3]++; int q = (int)(imp * 10); if (q > evs[1]) evs[1] = q; }
    }
  }
  collide_cars();
  for (int i = 0; i < nPeds; i++) ped_update(PED(i), dt);
  ped_safety(dt);
  if (pcar < 0) foot_update(dt);
}
