import { BrandLogo, SiteFooter } from "./Branding.jsx";
import { useEffect, useRef, useState } from "react";

const C = {
  ink: "#202020",
  blue: "#2166d1",
  blueLight: "#eaf3ff",
  green: "#2d9b55",
  amber: "#c9821b",
  muted: "#59636f",
  metal: "#8f969d",
  metalDark: "#555c63",
};

// ---------------------------------------------------------------------------
// Settings. The animation runs 100 times slower than the real sound: a 200 Hz
// note is drawn vibrating twice a second.
// ---------------------------------------------------------------------------
const TIME_SCALE = 100;
const SPEED_OF_SOUND = 340; // m/s, for the wavelength readout
const WAVE_SPEED = 220; // px per second on screen
const DISP = 7; // largest particle movement, px
const SHADE_MAX = 0.36;
const SLOW_FACTOR = 0.2;
const MASTER_VOLUME = 0.14;
const FORK_DECAY = 4.5; // seconds for a struck fork to fade by a factor of e
const DAMP_TAU = 0.07; // the same, once the fork is gripped to dampen it

const F_MIN = 100;
const F_MAX = 400;

const TWO_PI = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
const W = 1150;
const H = 520;
const SRC_X = 238; // front of the cone / face of the fork prong
const BAND = { x0: 250, x1: 1120, y0: 252, y1: 440 };
const MID_Y = (BAND.y0 + BAND.y1) / 2;
const GRAPH = { x: 60, y: 16, w: 1070, h: 190 };
const G0 = GRAPH.y + GRAPH.h / 2 + 10; // zero line of the graph
const GA = 58; // graph height at full amplitude
const GRAPH_MIN_H = 44; // the graph panel's height when minimised
const FOLD = GRAPH.h - GRAPH_MIN_H; // how far everything below moves up
// Below this height the amplitude arrowheads go outside the gap, pointing in
// (each head is 9 long, so two need over 30 to sit inside with a clear line between)
const AMP_ARROWS_INSIDE = 34;
const AMP_OUT_LEN = 22; // length of each outside arrow, head included
const LABEL_MIN_AMP = 0.03; // below this the wave is too flat to label
const FX = 205; // tuning fork centre line

const seededRandom = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const smoothstep = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

const mod = (a, n) => ((a % n) + n) % n;

const delayAt = (x) => Math.max(0, x - SRC_X) / WAVE_SPEED;

// Air particles in a band in front of the source
const TRACER_X = [430, 650, 870];
const AIR = [];
{
  const rand = seededRandom(5);
  for (let gy = BAND.y0 + 6; gy < BAND.y1 - 2; gy += 13) {
    for (let gx = BAND.x0 + 4; gx < BAND.x1; gx += 11) {
      const x = gx + (rand() - 0.5) * 8;
      const y = gy + (rand() - 0.5) * 9;
      const r = 2.6 + rand() * 0.8;
      if (TRACER_X.some((tx) => Math.hypot(x - tx, y - MID_Y) < 9)) continue;
      AIR.push({ x, y, r, tracer: false });
    }
  }
  TRACER_X.forEach((x) => AIR.push({ x, y: MID_Y, r: 4.5, tracer: true }));
  AIR.forEach((p) => (p.delay = delayAt(p.x)));
}

const AIR_GROUPS = [
  { color: C.metal, width: 5.5, pts: AIR.filter((p) => !p.tracer && p.r < 2.9) },
  { color: C.metal, width: 6.1, pts: AIR.filter((p) => !p.tracer && p.r >= 2.9 && p.r < 3.2) },
  { color: C.metal, width: 6.7, pts: AIR.filter((p) => !p.tracer && p.r >= 3.2) },
  { color: C.blue, width: 9, pts: AIR.filter((p) => p.tracer) },
];

// ---------------------------------------------------------------------------
// Tuning fork. Both tines swing outwards together, then inwards together. So
// each tine sends a wave out from its outer side: one travelling right (the
// same wave the loudspeaker makes) and a mirror-image one travelling left. The
// air between the tines is squeezed as they close and stretched as they open.
//
// The tines bend about their roots, so their tips move most and the bottoms
// hardly at all. Air right next to a tine moves with the part of the tine
// beside it; a little further out it has settled into the plane wave.
// ---------------------------------------------------------------------------
const TINE_ROOT_Y = 412;
const TINE_HALF = 6.5; // half the thickness of a tine
const FACE_R = FX + 19.5 + TINE_HALF; // outer face of the right tine
const FACE_L = FX - 19.5 - TINE_HALF; // outer face of the left tine
const INNER = 19.5 - TINE_HALF; // inner faces are this far either side of FX
const SRC_L = 2 * FX - SRC_X; // where the left-going wave starts, mirroring SRC_X
const delayLeft = (x) => Math.max(0, SRC_L - x) / WAVE_SPEED;
const LEFT_X0 = 14; // the air on the left runs out to here

// How far a tine moves at height y, compared with its tip
const tineReach = (y) => Math.min(1.05, Math.max(0, (TINE_ROOT_Y - y) / 150));
// Blend from moving with the tine (right next to it) to the plane wave
const nearFactor = (y, dist) => {
  const reach = tineReach(y);
  return reach + (1 - reach) * smoothstep(dist / 55);
};

// The loudspeaker's particles, when the fork is the source instead
AIR.forEach((p) => (p.forkF = nearFactor(p.y, p.x - FACE_R)));

const FORK_TRACER_X = FACE_L - 92;
const FORK_AIR = [];
{
  const rand = seededRandom(13);
  for (let gy = BAND.y0 + 6; gy < BAND.y1 - 2; gy += 13) {
    // Left of the fork, out to the edge
    for (let gx = FACE_L - 8, col = 0; gx > LEFT_X0; gx -= 11, col++) {
      const j = col === 0 ? 3 : 8; // keep the first column clear of the tine
      const x = gx + (rand() - 0.5) * j;
      const y = gy + (rand() - 0.5) * 9;
      const r = 2.6 + rand() * 0.8;
      if (Math.hypot(x - FORK_TRACER_X, y - MID_Y) < 9) continue;
      FORK_AIR.push({ x, y, r, side: -1, delay: delayLeft(x), f: nearFactor(y, FACE_L - x) });
    }
    // The narrow gap between the right tine and the loudspeaker's particles
    {
      const x = FACE_R + 7 + (rand() - 0.5) * 3;
      const y = gy + (rand() - 0.5) * 9;
      const r = 2.6 + rand() * 0.6;
      FORK_AIR.push({ x, y, r, side: 1, delay: delayAt(x), f: nearFactor(y, x - FACE_R) });
    }
  }
  // Between the tines: a staggered double column, from the tips down to the bend
  const top = BAND.y0 + 8;
  const bottom = TINE_ROOT_Y + 2;
  for (let y = top, k = 0; y < bottom; y += 7.5, k++) {
    const x = FX + (k % 2 ? 4 : -4) + (rand() - 0.5) * 1.5;
    const r = 2.6 + rand() * 0.5;
    // the air between moves in proportion to how far it is from the middle
    FORK_AIR.push({ x, y: y + (rand() - 0.5) * 2, r, side: 0, lin: (x - FX) / INNER });
  }
  FORK_AIR.forEach((p) => {
    if (p.side === 0) p.f = tineReach(p.y);
  });
  FORK_AIR.push({
    x: FORK_TRACER_X,
    y: MID_Y,
    r: 4.5,
    side: -1,
    tracer: true,
    delay: delayLeft(FORK_TRACER_X),
    f: 1,
  });
}

const FORK_AIR_GROUPS = [
  { color: C.metal, width: 5.5, pts: FORK_AIR.filter((p) => !p.tracer && p.r < 2.9) },
  { color: C.metal, width: 6.1, pts: FORK_AIR.filter((p) => !p.tracer && p.r >= 2.9 && p.r < 3.2) },
  { color: C.metal, width: 6.7, pts: FORK_AIR.filter((p) => !p.tracer && p.r >= 3.2) },
  { color: C.blue, width: 9, pts: FORK_AIR.filter((p) => p.tracer) },
];

// Shading for the left-going wave
const LEFT_SHADE_STOPS = Array.from({ length: 40 }, (_, k) => {
  const x = LEFT_X0 + (k / 39) * (SRC_L - LEFT_X0);
  return {
    off: k / 39,
    delay: delayLeft(x),
    fade: smoothstep((x - LEFT_X0) / 40) * smoothstep((FACE_L - x) / 20),
  };
});

const SHADE_STOPS = Array.from({ length: 130 }, (_, k) => {
  const x = BAND.x0 + (k / 129) * (BAND.x1 - BAND.x0);
  return {
    off: k / 129,
    delay: delayAt(x),
    fade: smoothstep((x - BAND.x0) / 20) * smoothstep((BAND.x1 - x) / 40),
  };
});

const GRAPH_N = 220;
const GRAPH_X = Array.from(
  { length: GRAPH_N + 1 },
  (_, k) => BAND.x0 + (k / GRAPH_N) * (BAND.x1 - BAND.x0)
);

// History of the source's phase and amplitude, so changes travel outward
const HIST_DT = 1 / 60;
const HIST_N = 600;

// The sound of the fork being struck, on top of its steady note: a knock, a
// bright metallic overtone (a fork's "clang" tone, about 6¼ times its note)
// that dies away within a fraction of a second, and the note itself starting
// a touch sharp and settling. s is how hard it was struck (0 to 1).
function twang(au, f0, s) {
  const { ctx, master, osc } = au;
  const now = ctx.currentTime;

  const clang = ctx.createOscillator();
  clang.type = "sine";
  clang.frequency.setValueAtTime(f0 * 6.45, now);
  clang.frequency.exponentialRampToValueAtTime(f0 * 6.27, now + 0.08);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0, now);
  cg.gain.linearRampToValueAtTime(0.4 * s, now + 0.004);
  cg.gain.setTargetAtTime(0, now + 0.004, 0.07);
  clang.connect(cg);
  cg.connect(master);
  clang.start(now);
  clang.stop(now + 0.8);

  const len = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
  const knock = ctx.createBufferSource();
  knock.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 0.9;
  const kg = ctx.createGain();
  kg.gain.value = 0.5 * s;
  knock.connect(bp);
  bp.connect(kg);
  kg.connect(master);
  knock.start(now);

  osc.frequency.cancelScheduledValues(now);
  osc.frequency.setValueAtTime(f0 * 1.025, now);
  osc.frequency.exponentialRampToValueAtTime(f0, now + 0.15);
}

const SOURCES = [
  { id: "speaker", label: "Loudspeaker" },
  { id: "fork", label: "Tuning fork" },
];

export default function SoundWaves({ onBack, disableSound = false }) {
  const [source, setSource] = useState("speaker");
  const [freq, setFreq] = useState(200);
  const [ampPct, setAmpPct] = useState(70);
  const [muted, setMuted] = useState(true);
  const [slow, setSlow] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [ringing, setRinging] = useState(true);

  const sourceRef = useRef(source);
  sourceRef.current = source;
  const freqRef = useRef(freq);
  freqRef.current = freq;
  const ampRef = useRef(ampPct);
  ampRef.current = ampPct;
  const mutedRef = useRef(true);
  mutedRef.current = muted;
  const slowRef = useRef(false);
  slowRef.current = slow;
  const labelsRef = useRef(true);
  labelsRef.current = showLabels;
  const strikeRef = useRef(performance.now());
  const [graphOpen, setGraphOpen] = useState(true);
  const graphOpenRef = useRef(true);
  graphOpenRef.current = graphOpen;
  const foldRefs = useRef({});

  const audioRef = useRef({});
  const airRefs = useRef([]);
  const forkAirRefs = useRef([]);
  const stopRefs = useRef([]);
  const leftStopRefs = useRef([]);
  const traceRef = useRef(null);
  const coneRef = useRef(null);
  const prongRefs = useRef([]);
  const markRefs = useRef({});

  const dampRef = useRef(null); // when the fork was last gripped to stop it

  const strike = () => {
    strikeRef.current = performance.now();
    dampRef.current = null;
    setRinging(true);
  };

  // Grip the tines: the ringing dies away in a fraction of a second
  const dampen = () => {
    if (dampRef.current === null) dampRef.current = performance.now();
  };

  const chooseSource = (id) => {
    setSource(id);
    if (id === "fork") strike();
  };

  // Sound: a pure tone at the chosen frequency, as loud as the wave is big
  useEffect(() => {
    if (disableSound) return undefined;

    const start = () => {
      const a = audioRef.current;
      if (a.ctx) {
        if (a.ctx.state === "suspended") a.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = mutedRef.current ? 0 : MASTER_VOLUME;
      master.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freqRef.current;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(master);
      osc.start();
      Object.assign(a, { ctx, master, osc, g, appliedGain: -1, appliedFreq: -1 });
    };

    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      const a = audioRef.current;
      if (a.ctx) a.ctx.close();
      audioRef.current = {};
    };
  }, [disableSound]);

  useEffect(() => {
    const a = audioRef.current;
    if (a.ctx) {
      a.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, a.ctx.currentTime, 0.03);
    }
  }, [muted]);

  useEffect(() => {
    let raf;
    let last = performance.now();
    let simT = 0;
    let speed = 1;
    let phiNow = 0;
    let ampNow = ampRef.current / 100;
    let wasRinging = true;
    let labelTrack = null;
    let prevT = 0;
    let prevPhi = 0;
    let prevAmp = ampNow;
    let fold = 0; // 0 = graph shown, 1 = minimised
    let lastStrike = strikeRef.current;
    let wasAmpSmall = false;

    const phase = new Float64Array(HIST_N);
    const amp = new Float32Array(HIST_N);
    const w0 = (TWO_PI * freqRef.current) / TIME_SCALE;
    for (let k = -HIST_N + 1; k <= 0; k++) {
      phase[mod(k, HIST_N)] = w0 * k * HIST_DT;
      amp[mod(k, HIST_N)] = ampNow;
    }
    let histK = 0;

    // Source's phase and amplitude at an earlier time tau
    let outPhi = 0;
    let outAmp = 0;
    const sample = (tau) => {
      let idx = tau / HIST_DT;
      if (idx > histK) idx = histK;
      if (idx < histK - HIST_N + 2) idx = histK - HIST_N + 2;
      const k = Math.floor(idx);
      const f = idx - k;
      const a = mod(k, HIST_N);
      if (k >= histK) {
        outPhi = phase[a];
        outAmp = amp[a];
        return;
      }
      const b = mod(k + 1, HIST_N);
      outPhi = phase[a] + (phase[b] - phase[a]) * f;
      outAmp = amp[a] + (amp[b] - amp[a]) * f;
    };

    const setMark = (key, attrs) => {
      const el = markRefs.current[key];
      if (!el) return;
      for (const name in attrs) el.setAttribute(name, attrs[name]);
    };

    const loop = (now) => {
      const real = Math.min((now - last) / 1000, 0.1);
      last = now;
      speed += ((slowRef.current ? SLOW_FACTOR : 1) - speed) * Math.min(1, real * 6);
      const dt = real * speed;
      simT += dt;
      const t = simT;

      // --- Minimising the pressure graph: the panel shrinks to its title bar
      // and everything below slides up, so the whole picture gets shorter ---
      const foldTarget = graphOpenRef.current ? 0 : 1;
      if (fold !== foldTarget) {
        fold += (foldTarget - fold) * Math.min(1, real * 10);
        if (Math.abs(foldTarget - fold) < 0.002) fold = foldTarget;
        const e = fold * fold * (3 - 2 * fold);
        const f = foldRefs.current;
        if (f.svg) {
          f.svg.setAttribute("viewBox", "0 0 " + W + " " + (H - FOLD * e).toFixed(2));
          f.lower.setAttribute("transform", "translate(0 " + (-FOLD * e).toFixed(2) + ")");
          f.panel.setAttribute("height", (GRAPH.h - FOLD * e).toFixed(2));
          f.clip.setAttribute("height", (GRAPH.h - FOLD * e).toFixed(2));
          f.body.setAttribute("opacity", Math.max(0, 1 - e * 2.2).toFixed(3));
          f.body.style.visibility = fold === 1 ? "hidden" : "visible";
        }
      }

      // --- The source ---
      const fork = sourceRef.current === "fork";
      // The fork rings down slowly by itself, or within a moment once dampened
      const damp = dampRef.current;
      const ring = !fork
        ? 1
        : damp === null
          ? Math.exp(-(now - strikeRef.current) / 1000 / FORK_DECAY)
          : Math.exp(-(damp - strikeRef.current) / 1000 / FORK_DECAY) *
            Math.exp(-Math.max(0, now - damp) / 1000 / DAMP_TAU);
      const target = (ampRef.current / 100) * (ring < 0.01 ? 0 : ring);

      // Struck: the tines swing at full amplitude straight away, with no
      // build-up. The jolt sends out a sharp-fronted wave at full strength.
      let struck = false;
      if (fork && strikeRef.current !== lastStrike) {
        lastStrike = strikeRef.current;
        const a1 = ampRef.current / 100;
        ampNow = a1;
        prevAmp = a1;
        struck = a1 > 0;
      } else {
        // follow the dampening closely, so the tines stop as quickly as the sound
        const rate = fork && damp !== null ? real / 0.02 : dt / 0.12;
        ampNow += (target - ampNow) * Math.min(1, rate);
      }
      phiNow += ((TWO_PI * freqRef.current) / TIME_SCALE) * dt;

      const isRinging = !fork || ring >= 0.03;
      if (isRinging !== wasRinging) {
        setRinging(isRinging);
        wasRinging = isRinging;
      }

      // Record the source, filling in any samples since the last frame smoothly
      const k = Math.floor(t / HIST_DT);
      for (let j = histK + 1; j <= k; j++) {
        const f = dt > 0 ? Math.min(1, Math.max(0, (j * HIST_DT - prevT) / (t - prevT))) : 1;
        phase[mod(j, HIST_N)] = prevPhi + (phiNow - prevPhi) * f;
        amp[mod(j, HIST_N)] = prevAmp + (ampNow - prevAmp) * f;
      }
      if (k > histK) histK = k;
      prevT = t;
      prevPhi = phiNow;
      prevAmp = ampNow;

      const srcDisp = DISP * ampNow * Math.sin(phiNow);
      if (coneRef.current) {
        coneRef.current.setAttribute("transform", "translate(" + srcDisp.toFixed(2) + " 0)");
      }
      if (prongRefs.current[0]) {
        // the prongs bend in and out about their roots (outline and fill together)
        const ang = ((srcDisp / 150) * 180) / Math.PI;
        const right = "rotate(" + ang.toFixed(3) + " " + (FX + 19.5) + " 412)";
        const left = "rotate(" + (-ang).toFixed(3) + " " + (FX - 19.5) + " 412)";
        prongRefs.current[0].setAttribute("transform", left);
        prongRefs.current[1].setAttribute("transform", right);
        prongRefs.current[2].setAttribute("transform", left);
        prongRefs.current[3].setAttribute("transform", right);
      }

      // --- Air particles ---
      AIR_GROUPS.forEach((grp, g) => {
        let d = "";
        for (let n = 0; n < grp.pts.length; n++) {
          const p = grp.pts[n];
          sample(t - p.delay);
          // next to the fork, the air moves with the part of the tine beside it
          const x = p.x + DISP * outAmp * Math.sin(outPhi) * (fork ? p.forkF : 1);
          d += "M" + x.toFixed(1) + " " + p.y.toFixed(1) + "h0";
        }
        airRefs.current[g].setAttribute("d", d);
      });

      // The fork's own air: the left-going wave, and the air between the tines
      if (fork && forkAirRefs.current[0] && leftStopRefs.current[0]) {
        FORK_AIR_GROUPS.forEach((grp, g) => {
          let d = "";
          for (let n = 0; n < grp.pts.length; n++) {
            const p = grp.pts[n];
            let dx;
            if (p.side === 0) {
              dx = srcDisp * p.f * p.lin;
            } else {
              sample(t - p.delay);
              dx = p.side * DISP * outAmp * Math.sin(outPhi) * p.f;
            }
            d += "M" + (p.x + dx).toFixed(1) + " " + p.y.toFixed(1) + "h0";
          }
          forkAirRefs.current[g].setAttribute("d", d);
        });
        for (let n = 0; n < LEFT_SHADE_STOPS.length; n++) {
          const st = LEFT_SHADE_STOPS[n];
          sample(t - st.delay);
          const op = SHADE_MAX * st.fade * outAmp * (0.5 + 0.5 * Math.cos(outPhi));
          leftStopRefs.current[n].setAttribute("stop-opacity", op.toFixed(3));
        }
      }

      // --- Shading: darker where the air is squashed together ---
      for (let n = 0; n < SHADE_STOPS.length; n++) {
        const st = SHADE_STOPS[n];
        sample(t - st.delay);
        const op = SHADE_MAX * st.fade * outAmp * (0.5 + 0.5 * Math.cos(outPhi));
        stopRefs.current[n].setAttribute("stop-opacity", op.toFixed(3));
      }

      // --- Pressure graph, lined up with the particles below it ---
      const ys = new Array(GRAPH_X.length);
      const amps = new Array(GRAPH_X.length);
      let pts = "";
      for (let n = 0; n < GRAPH_X.length; n++) {
        sample(t - delayAt(GRAPH_X[n]));
        const v = outAmp * Math.cos(outPhi);
        ys[n] = v;
        amps[n] = outAmp;
        pts += GRAPH_X[n].toFixed(1) + "," + (G0 - v * GA).toFixed(1) + " ";
      }
      traceRef.current.setAttribute("points", pts);

      // --- Labels: amplitude, wavelength, compression and rarefaction ---
      // The labels ride along on one compression as it travels the whole way
      // along the wave, then jump back to the newest one near the start.
      const maxima = [];
      const minima = [];
      if (labelsRef.current) {
        const dxg = GRAPH_X[1] - GRAPH_X[0];
        for (let n = 1; n < GRAPH_X.length - 1; n++) {
          if (amps[n] < LABEL_MIN_AMP) continue;
          const a = ys[n - 1];
          const b = ys[n];
          const c = ys[n + 1];
          const isMax = b >= a && b > c;
          const isMin = b <= a && b < c;
          if (!isMax && !isMin) continue;
          // refine the peak position between samples, so the labels glide smoothly
          const den = a - 2 * b + c;
          const off = den !== 0 ? (0.5 * (a - c)) / den : 0;
          const pk = { x: GRAPH_X[n] + off * dxg, y: b - 0.25 * (a - c) * off };
          (isMax ? maxima : minima).push(pk);
        }
      }

      let crestA = null;
      if (labelTrack !== null) {
        const expect = labelTrack + WAVE_SPEED * dt;
        let best = null;
        maxima.forEach((m) => {
          if (Math.abs(m.x - expect) < 25 && (!best || Math.abs(m.x - expect) < Math.abs(best.x - expect))) {
            best = m;
          }
        });
        crestA = best;
      }
      const nextAfter = (list, x) => list.find((m) => m.x > x + 2) || null;
      // the wavelength label must not run under the minimise button
      const LABEL_END = GRAPH.x + GRAPH.w - 60;
      let trough = crestA ? nextAfter(minima, crestA.x) : null;
      let crestB = trough ? nextAfter(maxima, trough.x) : null;
      if (crestB && crestB.x > LABEL_END) crestB = null;
      if (!crestA || !crestB) {
        // start again on the first compression near the source
        crestA = nextAfter(maxima, BAND.x0 + 20);
        trough = crestA ? nextAfter(minima, crestA.x) : null;
        crestB = trough ? nextAfter(maxima, trough.x) : null;
      }
      labelTrack = crestA ? crestA.x : null;

      const show = (key, on) => setMark(key, { opacity: on ? 1 : 0 });
      const haveAmp = crestA !== null;
      let ampSmall = false;
      show("amp", haveAmp);
      if (haveAmp) {
        const x = crestA.x;
        const yTop = G0 - crestA.y * GA;
        const h = G0 - yTop;
        // a little hysteresis, so a slowly fading fork doesn't flicker between styles
        ampSmall = wasAmpSmall ? h < AMP_ARROWS_INSIDE + 3 : h < AMP_ARROWS_INSIDE;
        wasAmpSmall = ampSmall;
        if (!ampSmall) {
          // room for both arrowheads between the levels: one double-headed arrow
          setMark("ampLine", { display: "inline", x1: x, x2: x, y1: G0, y2: yTop + 2 });
          setMark("ampSmall", { display: "none" });
        } else {
          // too small: arrowheads outside, pointing in at the two levels,
          // joined by a plain line (as on a technical drawing)
          setMark("ampLine", { display: "none" });
          setMark("ampSmall", { display: "inline" });
          setMark("ampJoin", { x1: x, x2: x, y1: G0, y2: yTop });
          setMark("ampOutTop", { x1: x, x2: x, y1: yTop - 2 - AMP_OUT_LEN, y2: yTop - 2 });
          setMark("ampOutBot", { x1: x, x2: x, y1: G0 + 1 + AMP_OUT_LEN, y2: G0 + 1 });
        }
        // in a small gap the word would sit on the wave, so it goes just above it
        setMark("ampText", { x: x + 10, y: ampSmall ? yTop - 6 : (G0 + yTop) / 2 + 5 });
      }
      const haveLambda = crestA !== null && crestB !== null;
      show("lambda", haveLambda);
      if (haveLambda) {
        const xa = crestA.x;
        const xb = crestB.x;
        const yl = GRAPH.y + 26;
        setMark("lamLine", { x1: xa + 2, x2: xb - 2, y1: yl, y2: yl });
        // stop short of the outside amplitude arrow, which shares this line
        const dropA = G0 - crestA.y * GA - (ampSmall ? AMP_OUT_LEN + 5 : 0);
        setMark("lamDropA", { x1: xa, x2: xa, y1: yl - 6, y2: dropA });
        setMark("lamDropB", { x1: xb, x2: xb, y1: yl - 6, y2: G0 - crestB.y * GA });
        setMark("lamText", { x: (xa + xb) / 2, y: yl - 6 });
      }
      show("comp", haveAmp);
      if (haveAmp) setMark("compPos", { transform: "translate(" + crestA.x.toFixed(1) + " 0)" });
      show("rare", trough !== null);
      if (trough) setMark("rarePos", { transform: "translate(" + trough.x.toFixed(1) + " 0)" });

      // --- Sound ---
      const au = audioRef.current;
      if (au.ctx) {
        const gain = Math.pow(ampNow, 1.2);
        if (struck) {
          // full loudness at once, with the twang of the strike on top
          const tNow = au.ctx.currentTime;
          au.g.gain.cancelScheduledValues(tNow);
          au.g.gain.setValueAtTime(gain, tNow);
          au.appliedGain = gain;
          twang(au, freqRef.current, ampNow);
        } else if (Math.abs(gain - au.appliedGain) > 0.005) {
          au.g.gain.setTargetAtTime(gain, au.ctx.currentTime, 0.04);
          au.appliedGain = gain;
        }
        if (freqRef.current !== au.appliedFreq) {
          au.osc.frequency.setTargetAtTime(freqRef.current, au.ctx.currentTime, 0.03);
          au.appliedFreq = freqRef.current;
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const lambda = SPEED_OF_SOUND / freq;
  const pitch = freq < 170 ? "Low pitch" : freq < 290 ? "Medium pitch" : "High pitch";
  const loud = ampPct < 30 ? "quiet" : ampPct < 70 ? "medium loudness" : "loud";
  const statusText =
    source === "fork" && !ringing
      ? "The fork has stopped ringing"
      : ampPct === 0
        ? "No vibration • silence"
        : pitch + " • " + loud;

  const muteIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3,9 H7 L12,4.5 V19.5 L7,15 H3 Z" fill="currentColor" />
      {muted ? (
        <path d="M16,9 L22,15 M22,9 L16,15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path
          d="M15.5,8.5 Q18,12 15.5,15.5 M18.5,6 Q23,12 18.5,18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );

  const markStyle = {
    transition: "opacity 0.25s ease",
    pointerEvents: "none",
  };

  return (
    <main className="page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0 !important;
          width: 100%;
          min-height: 100%;
          background: #f3f5f7 !important;
        }

        body {
          overflow-x: hidden;
        }

        .page {
          min-height: 100vh;
          padding: 24px;
          background: #f3f5f7;
          color: #202020;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .shell {
          max-width: 1160px;
          margin: 0 auto;
        }

        .heading {
          margin-bottom: 18px;
        }

        .eyebrow {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: #3867a8;
          margin-bottom: 4px;
        }

        .heading h1 {
          margin: 0;
          font-size: clamp(28px, 4vw, 40px);
          line-height: 1.1;
          letter-spacing: -.04em;
          text-wrap: balance;
        }

        .intro {
          max-width: 780px;
          margin: 8px 0 0;
          color: ${C.muted};
          line-height: 1.5;
          font-size: 14px;
        }

        .card {
          background: #fff;
          border: 1px solid #d9dee4;
          border-radius: 18px;
          box-shadow: 0 10px 28px rgba(31, 41, 55, .07);
          overflow: hidden;
        }

        .backRow {
          padding: 14px 18px 0;
        }

        .backButton {
          border: 0;
          background: transparent;
          color: ${C.muted};
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 0;
        }

        .stage {
          padding: 12px;
        }

        .stageInner {
          position: relative;
          container-type: inline-size;
        }

        .stageInner > svg {
          display: block;
          width: 100%;
          height: auto;
        }

        /* Sits in the top-right corner of the graph panel (positions are in
           diagram units, scaled with the width of the picture) */
        .graphToggle {
          position: absolute;
          --size: max(22px, calc(32 / ${W} * 100cqw));
          /* centred on the panel's title bar, which is all that's left when minimised */
          top: calc(${GRAPH.y + GRAPH_MIN_H / 2} / ${W} * 100cqw - var(--size) / 2);
          right: calc(${W - GRAPH.x - GRAPH.w + 8} / ${W} * 100cqw);
          width: var(--size);
          height: var(--size);
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid #d9dee4;
          border-radius: 8px;
          background: #ffffff;
          color: ${C.muted};
          cursor: pointer;
          transition:
            background 0.15s ease,
            color 0.15s ease,
            border-color 0.15s ease;
        }

        .graphToggle:hover {
          background: #f1f4f7;
          border-color: #c8ced7;
          color: ${C.ink};
        }

        .graphToggle:focus-visible {
          outline: 3px solid rgba(33, 102, 209, 0.25);
          outline-offset: 2px;
        }

        .graphToggle svg {
          width: 62%;
          height: 62%;
          fill: none;
          stroke: currentColor;
          stroke-width: 2.4;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .signalBar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          padding: 12px 18px;
          border-top: 1px solid #e2e6ea;
        }

        .signalLabel {
          margin-right: 6px;
          color: ${C.muted};
          font-size: 14px;
          font-weight: 700;
        }

        .seg {
          border: 1px solid #c6ccd3;
          background: #fff;
          color: ${C.ink};
          border-radius: 99px;
          padding: 7px 16px;
          font: inherit;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .seg.on {
          background: ${C.blueLight};
          border-color: ${C.blue};
          color: ${C.blue};
        }

        .seg:focus-visible,
        .switchBtn:focus-visible,
        .backButton:focus-visible {
          outline: 3px solid rgba(33, 102, 209, .3);
          outline-offset: 2px;
        }

        .soundGroup {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: auto;
        }

        .muteBtn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .muteBtn.muted {
          background: #fdecec;
          border-color: #dc2626;
          color: #b91c1c;
        }

        .controls {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 18px;
          padding: 14px 18px;
          border-top: 1px solid #e2e6ea;
          background: #fafbfc;
        }

        .readoutI {
          font-family: "Times New Roman", Times, Georgia, serif;
          font-style: italic;
          font-weight: 700;
        }

        .readout {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .readoutNote {
          display: block;
          margin-top: 2px;
          color: ${C.muted};
          font-size: 12px;
          font-weight: 600;
        }

        .toggles {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px 22px;
        }

        .switchBtn {
          display: flex;
          align-items: center;
          gap: 11px;
          border: 0;
          background: transparent;
          color: ${C.ink};
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          padding: 4px 0;
        }

        .toggle {
          width: 54px;
          height: 30px;
          border-radius: 99px;
          padding: 3px;
          background: #c6ccd3;
          transition: .25s ease;
        }

        .toggle.on {
          background: ${C.blue};
        }

        .toggle.green.on {
          background: ${C.green};
        }

        .knob {
          display: block;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, .25);
          transition: .25s ease;
        }

        .toggle.on .knob {
          transform: translateX(24px);
        }

        .controls .status {
          justify-self: end;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 260px;
          max-width: 100%;
          color: ${C.muted};
          font-size: 14px;
          justify-content: flex-end;
          text-align: right;
          white-space: nowrap;
        }

        .dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #a7afb8;
          flex: 0 0 auto;
        }

        .dot.on {
          background: ${C.green};
          box-shadow: 0 0 0 4px #dff3e6;
        }

        .dot.warn {
          background: ${C.amber};
          box-shadow: 0 0 0 4px #fbeed8;
        }

        .lesson {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 14px;
        }

        .lessonBox {
          background: #fff;
          border: 1px solid #dfe4e8;
          border-radius: 14px;
          padding: 16px 18px;
        }

        .lessonBox h2 {
          margin: 0 0 7px;
          font-size: 15px;
        }

        .lessonBox p {
          margin: 0;
          color: ${C.muted};
          line-height: 1.5;
          font-size: 14px;
        }

        .onText {
          color: #19743b;
          font-weight: 800;
        }

        .offText {
          color: #9b5d13;
          font-weight: 800;
        }

        @media (prefers-reduced-motion: reduce) {
          .toggle,
          .knob {
            transition: none;
          }
        }

        @media (max-width: 760px) {
          .page {
            padding: 10px;
          }

          .controls {
            display: flex;
            align-items: flex-start;
            flex-direction: column;
          }

          .controls .status {
            justify-self: start;
            justify-content: flex-start;
            text-align: left;
          }

          .soundGroup {
            margin-left: 0;
          }

          .lesson {
            grid-template-columns: 1fr;
          }
        }

        .sliderBar {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 32px;
          padding: 14px 18px;
          border-top: 1px solid #e2e6ea;
        }

        .sliderGroup {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }

        .sliderGroup label {
          color: ${C.muted};
          font-size: 14px;
          font-weight: 700;
        }

        .sliderGroup input[type="range"] {
          width: 100%;
          min-width: 0;
          accent-color: ${C.blue};
          cursor: pointer;
        }

        .sliderValue {
          min-width: 6.5ch;
          text-align: right;
          font-size: 14px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }

        /* Fork actions: set apart by a divider, and shaped as buttons rather
           than as options, so they don't read as a third source */
        .forkActions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-left: 10px;
          padding-left: 18px;
          border-left: 1px solid #dfe3e8;
        }

        .act {
          border: 1px solid #c6ccd3;
          background: #fff;
          color: ${C.ink};
          border-radius: 8px;
          padding: 7px 16px;
          font: inherit;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition:
            background 0.15s ease,
            border-color 0.15s ease,
            transform 0.08s ease;
        }

        .act:hover:not(:disabled) {
          background: #f1f4f7;
          border-color: #b4bcc5;
        }

        .act:active:not(:disabled) {
          transform: translateY(1px);
        }

        .act.actPrimary {
          border-color: ${C.blue};
          background: ${C.blue};
          color: #fff;
        }

        .act.actPrimary:hover {
          background: #1b57b3;
          border-color: #1b57b3;
        }

        .act:disabled {
          opacity: 0.45;
          cursor: default;
        }

        .act:focus-visible {
          outline: 3px solid rgba(33, 102, 209, .3);
          outline-offset: 2px;
        }

        @media (max-width: 760px) {
          .forkActions {
            margin-left: 0;
            padding-left: 0;
            border-left: 0;
          }
        }

        @media (max-width: 760px) {
          .sliderBar {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className={onBack ? "shell has-brand" : "shell"}>
        {onBack && <BrandLogo className="page-logo" />}
        <header className="heading">
          <div className="eyebrow">Sound • 01</div>
          <h1>What Is a Sound Wave?</h1>
          <p className="intro">
            A vibrating object pushes and pulls on the air particles next to it.
            The vibration is passed from particle to particle, so squashed
            regions (compressions) and stretched regions (rarefactions) travel
            outward. Change the frequency and amplitude to see and hear what
            each one does.
          </p>
        </header>

        <section className="card">
          {onBack && (
            <div className="backRow">
              <button className="backButton" onClick={onBack}>
                ← Back
              </button>
            </div>
          )}

          <div className="stage">
            <div className="stageInner">
            <button
              type="button"
              className="graphToggle"
              onClick={() => setGraphOpen((o) => !o)}
              aria-expanded={graphOpen}
              aria-label={graphOpen ? "Minimise the air pressure graph" : "Show the air pressure graph"}
              title={graphOpen ? "Minimise" : "Show graph"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {graphOpen ? (
                  <path d="M6,12 H18" />
                ) : (
                  <path d="M7,10 L12,15 L17,10" />
                )}
              </svg>
            </button>
            <svg
              ref={(el) => (foldRefs.current.svg = el)}
              viewBox={"0 0 " + W + " " + H}
              role="img"
              aria-label="A sound source making a longitudinal wave in air particles, with a graph of air pressure along the wave"
            >
              <defs>
                <linearGradient
                  id="swShade"
                  gradientUnits="userSpaceOnUse"
                  x1={BAND.x0}
                  y1="0"
                  x2={BAND.x1}
                  y2="0"
                >
                  {SHADE_STOPS.map((st, k) => (
                    <stop
                      key={k}
                      ref={(el) => (stopRefs.current[k] = el)}
                      offset={st.off}
                      stopColor="#2b3a4d"
                      stopOpacity="0"
                    />
                  ))}
                </linearGradient>
                <linearGradient
                  id="swShadeL"
                  gradientUnits="userSpaceOnUse"
                  x1={LEFT_X0}
                  y1="0"
                  x2={SRC_L}
                  y2="0"
                >
                  {LEFT_SHADE_STOPS.map((st, k) => (
                    <stop
                      key={k}
                      ref={(el) => (leftStopRefs.current[k] = el)}
                      offset={st.off}
                      stopColor="#2b3a4d"
                      stopOpacity="0"
                    />
                  ))}
                </linearGradient>
                <linearGradient id="swMetal" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#7c858f" />
                  <stop offset="50%" stopColor="#e2e6ea" />
                  <stop offset="100%" stopColor="#7c858f" />
                </linearGradient>
                <marker
                  id="swArrow"
                  markerUnits="userSpaceOnUse"
                  markerWidth="10"
                  markerHeight="10"
                  refX="8"
                  refY="5"
                  orient="auto-start-reverse"
                >
                  <path d="M0,1 L9,5 L0,9 Z" fill={C.ink} />
                </marker>
                <marker
                  id="swArrowMuted"
                  markerUnits="userSpaceOnUse"
                  markerWidth="10"
                  markerHeight="10"
                  refX="8"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0,1 L9,5 L0,9 Z" fill={C.muted} />
                </marker>
                <clipPath id="swGraphClip">
                  <rect
                    ref={(el) => (foldRefs.current.clip = el)}
                    x={GRAPH.x}
                    y={GRAPH.y}
                    width={GRAPH.w}
                    height={GRAPH.h}
                  />
                </clipPath>
              </defs>

              {/* Pressure graph */}
              <rect
                ref={(el) => (foldRefs.current.panel = el)}
                x={GRAPH.x}
                y={GRAPH.y}
                width={GRAPH.w}
                height={GRAPH.h}
                rx="10"
                fill="#fafbfc"
                stroke="#d9dee4"
                strokeWidth="1.5"
              />
              <text x={GRAPH.x + 16} y={GRAPH.y + 28} fontSize="16" fontWeight="600" fill={C.ink}>
                Air pressure
              </text>
              <g ref={(el) => (foldRefs.current.body = el)} clipPath="url(#swGraphClip)">
              <text x={GRAPH.x + 16} y={GRAPH.y + 48} fontSize="13" fill={C.muted}>
                along the wave
              </text>
              <line
                x1={BAND.x0}
                y1={G0}
                x2={BAND.x1}
                y2={G0}
                stroke="#a7afb8"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <line x1={BAND.x0} y1={G0 - GA - 10} x2={BAND.x0} y2={G0 + GA + 10} stroke="#a7afb8" strokeWidth="1.5" />
              <g fontSize="13" fill={C.muted} textAnchor="end">
                <text x={BAND.x0 - 10} y={G0 - GA + 5}>high</text>
                <text x={BAND.x0 - 10} y={G0 + 5}>normal</text>
                <text x={BAND.x0 - 10} y={G0 + GA + 5}>low</text>
              </g>
              <polyline
                ref={traceRef}
                fill="none"
                stroke={C.blue}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Amplitude and wavelength markers on the graph */}
              <g style={{ ...markStyle, opacity: showLabels ? 1 : 0 }}>
                <g ref={(el) => (markRefs.current.amp = el)} opacity="0">
                  <line
                    ref={(el) => (markRefs.current.ampLine = el)}
                    stroke={C.ink}
                    strokeWidth="1.6"
                    markerStart="url(#swArrow)"
                    markerEnd="url(#swArrow)"
                  />
                  {/* small amplitudes: arrows outside, pointing in */}
                  <g ref={(el) => (markRefs.current.ampSmall = el)} display="none" stroke={C.ink} strokeWidth="1.6">
                    <line ref={(el) => (markRefs.current.ampJoin = el)} />
                    <line ref={(el) => (markRefs.current.ampOutTop = el)} markerEnd="url(#swArrow)" />
                    <line ref={(el) => (markRefs.current.ampOutBot = el)} markerEnd="url(#swArrow)" />
                  </g>
                  <text
                    ref={(el) => (markRefs.current.ampText = el)}
                    fontSize="14"
                    fontWeight="700"
                    fill={C.ink}
                    stroke="#fafbfc"
                    strokeWidth="4"
                    paintOrder="stroke"
                  >
                    Amplitude
                  </text>
                </g>
                <g ref={(el) => (markRefs.current.lambda = el)} opacity="0">
                  <line
                    ref={(el) => (markRefs.current.lamDropA = el)}
                    stroke="#a7afb8"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                  <line
                    ref={(el) => (markRefs.current.lamDropB = el)}
                    stroke="#a7afb8"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                  <line
                    ref={(el) => (markRefs.current.lamLine = el)}
                    stroke={C.ink}
                    strokeWidth="1.6"
                    markerStart="url(#swArrow)"
                    markerEnd="url(#swArrow)"
                  />
                  <text
                    ref={(el) => (markRefs.current.lamText = el)}
                    fontSize="14"
                    fontWeight="700"
                    fill={C.ink}
                    textAnchor="middle"
                  >
                    Wavelength
                  </text>
                </g>
              </g>
              </g>

              {/* Everything below the graph: slides up when the graph is minimised */}
              <g ref={(el) => (foldRefs.current.lower = el)}>

              {/* Air */}
              <rect
                x={BAND.x0}
                y={BAND.y0}
                width={BAND.x1 - BAND.x0}
                height={BAND.y1 - BAND.y0}
                fill="url(#swShade)"
              />

              {AIR.filter((p) => p.tracer).map((p) => (
                <line
                  key={"tick" + p.x}
                  x1={p.x}
                  y1={p.y - 13}
                  x2={p.x}
                  y2={p.y + 13}
                  stroke="#a7afb8"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              ))}

              {AIR_GROUPS.map((g, k) => (
                <path
                  key={k}
                  ref={(el) => (airRefs.current[k] = el)}
                  fill="none"
                  stroke={g.color}
                  strokeWidth={g.width}
                  strokeLinecap="round"
                />
              ))}

              {/* The fork's own air: to its left, carrying the left-going wave,
                  and between the tines. The loudspeaker's cabinet is here instead. */}
              {source === "fork" && (
                <g>
                  <rect
                    x={LEFT_X0}
                    y={BAND.y0}
                    width={FACE_L - LEFT_X0}
                    height={BAND.y1 - BAND.y0}
                    fill="url(#swShadeL)"
                  />
                  <line
                    x1={FORK_TRACER_X}
                    y1={MID_Y - 13}
                    x2={FORK_TRACER_X}
                    y2={MID_Y + 13}
                    stroke="#a7afb8"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  {FORK_AIR_GROUPS.map((g, k) => (
                    <path
                      key={"fork" + k}
                      ref={(el) => (forkAirRefs.current[k] = el)}
                      fill="none"
                      stroke={g.color}
                      strokeWidth={g.width}
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              )}

              {/* Compression and rarefaction, lined up with the graph */}
              <g
                style={{ ...markStyle, opacity: showLabels ? 1 : 0 }}
                fontSize="15"
                fontWeight="700"
                textAnchor="middle"
              >
                {/* Each label has an arrow pointing into the air at the place it names */}
                <g ref={(el) => (markRefs.current.comp = el)} opacity="0">
                  <g ref={(el) => (markRefs.current.compPos = el)}>
                    <text y={BAND.y0 - 14} fill={C.ink}>
                      Compression
                    </text>
                    <line x1="0" y1={BAND.y0 - 8} x2="0" y2={BAND.y0 + 22} stroke="#fff" strokeWidth="6" strokeLinecap="round" />
                    <line
                      x1="0"
                      y1={BAND.y0 - 8}
                      x2="0"
                      y2={BAND.y0 + 22}
                      stroke={C.ink}
                      strokeWidth="2"
                      markerEnd="url(#swArrow)"
                    />
                  </g>
                </g>
                <g ref={(el) => (markRefs.current.rare = el)} opacity="0">
                  <g ref={(el) => (markRefs.current.rarePos = el)}>
                    <text y={BAND.y1 + 26} fill={C.muted}>
                      Rarefaction
                    </text>
                    <line x1="0" y1={BAND.y1 + 9} x2="0" y2={BAND.y1 - 21} stroke="#fff" strokeWidth="6" strokeLinecap="round" />
                    <line
                      x1="0"
                      y1={BAND.y1 + 9}
                      x2="0"
                      y2={BAND.y1 - 21}
                      stroke={C.muted}
                      strokeWidth="2"
                      markerEnd="url(#swArrowMuted)"
                    />
                  </g>
                </g>
              </g>

              {/* Source */}
              {source === "speaker" ? (
                <g>
                  <rect
                    x="150"
                    y={MID_Y - 34}
                    width="26"
                    height="68"
                    rx="4"
                    fill="url(#swMetal)"
                    stroke={C.metalDark}
                    strokeWidth="2"
                  />
                  <g ref={coneRef}>
                    <polygon
                      points={
                        "176," + (MID_Y - 18) + " " +
                        SRC_X + "," + (BAND.y0 + 6) + " " +
                        SRC_X + "," + (BAND.y1 - 6) + " " +
                        "176," + (MID_Y + 18)
                      }
                      fill="#e5e7eb"
                      stroke={C.metalDark}
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <line
                      x1={SRC_X}
                      y1={BAND.y0 + 6}
                      x2={SRC_X}
                      y2={BAND.y1 - 6}
                      stroke={C.metalDark}
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </g>
                  <text x="190" y={BAND.y1 + 50} fontSize="18" fill={C.ink} textAnchor="middle">
                    Loudspeaker
                  </text>
                </g>
              ) : (
                <g>
                  {/* Drawn in two passes, every outline first and then every fill on
                      top, so the tines, bend and handle read as one piece of metal.
                      Each tine has a group in each pass; both turn together. */}
                  {[
                    { stroke: C.metalDark, tine: 13, handle: 11 },
                    { stroke: "#c3cad2", tine: 9, handle: 7 },
                  ].map((pass, k) => (
                    <g key={k} fill="none" stroke={pass.stroke} strokeLinecap="round">
                      <line x1={FX} y1="428" x2={FX} y2={H - 30} strokeWidth={pass.handle} />
                      <path
                        d={"M" + (FX - 19.5) + ",410 A19.5,19.5 0 0 0 " + (FX + 19.5) + ",410"}
                        strokeWidth={pass.tine}
                      />
                      {[0, 1].map((side) => (
                        <path
                          key={side}
                          ref={(el) => (prongRefs.current[side + 2 * k] = el)}
                          d={"M" + (side ? FX + 19.5 : FX - 19.5) + "," + (BAND.y0 + 4) + " V412"}
                          strokeWidth={pass.tine}
                        />
                      ))}
                    </g>
                  ))}
                  <text x={FX - 40} y={BAND.y1 + 50} fontSize="18" fill={C.ink} textAnchor="end">
                    Tuning
                  </text>
                  <text x={FX - 40} y={BAND.y1 + 71} fontSize="18" fill={C.ink} textAnchor="end">
                    fork
                  </text>
                </g>
              )}

              <text x="700" y={BAND.y1 + 62} fontSize="18" fill={C.ink} textAnchor="middle">
                Air particles
              </text>
              </g>
            </svg>
            </div>
          </div>

          <div className="signalBar">
            <span className="signalLabel">Source</span>
            {SOURCES.map((o) => (
              <button
                key={o.id}
                className={"seg " + (source === o.id ? "on" : "")}
                onClick={() => chooseSource(o.id)}
                aria-pressed={source === o.id}
              >
                {o.label}
              </button>
            ))}
            {/* Actions on the fork, kept apart from the choice of source */}
            {source === "fork" && (
              <span className="forkActions" role="group" aria-label="Fork">
                <span className="signalLabel">Fork</span>
                <button className="act actPrimary" onClick={strike}>
                  Strike
                </button>
                <button className="act" onClick={dampen} disabled={!ringing}>
                  Dampen
                </button>
              </span>
            )}
            <span className="soundGroup">
              <button
                className={"seg muteBtn " + (muted ? "muted" : "")}
                onClick={() => setMuted((v) => !v)}
                aria-pressed={muted}
              >
                {muteIcon}
                {muted ? "Unmute" : "Mute"}
              </button>
            </span>
          </div>

          <div className="sliderBar">
            <div className="sliderGroup">
              <label htmlFor="swFreq">Frequency</label>
              <input
                id="swFreq"
                type="range"
                min={F_MIN}
                max={F_MAX}
                step="10"
                value={freq}
                onChange={(e) => setFreq(Number(e.target.value))}
              />
              <span className="sliderValue">{freq} Hz</span>
            </div>
            <div className="sliderGroup">
              <label htmlFor="swAmp">{source === "fork" ? "Strike strength" : "Amplitude"}</label>
              <input
                id="swAmp"
                type="range"
                min="0"
                max="100"
                step="5"
                value={ampPct}
                onChange={(e) => setAmpPct(Number(e.target.value))}
              />
              <span className="sliderValue">{ampPct}%</span>
            </div>
          </div>

          <div className="controls">
            <div className="readout">
              <span className="readoutI">λ</span> = {lambda.toFixed(2)} m
              <span className="readoutNote">Wavelength in air (sound travels at 340 m/s)</span>
            </div>

            <div className="toggles">
              <button className="switchBtn" onClick={() => setSlow((v) => !v)} aria-pressed={slow}>
                <span className={"toggle " + (slow ? "on" : "")}>
                  <span className="knob" />
                </span>
                Slow motion
              </button>
              <button
                className="switchBtn"
                onClick={() => setShowLabels((v) => !v)}
                aria-pressed={showLabels}
              >
                <span className={"toggle " + (showLabels ? "on" : "")}>
                  <span className="knob" />
                </span>
                Labels
              </button>
            </div>

            <div className="status">
              <span
                className={
                  "dot " + (statusText.startsWith("No") || statusText.startsWith("The fork") ? "" : "on")
                }
              />
              {statusText}
            </div>
          </div>
        </section>

        <section className="lesson">
          <div className="lessonBox">
            <h2>1. Frequency and pitch</h2>
            <p>
              Frequency is the number of vibrations each second, measured in
              hertz (Hz). Right now the source vibrates{" "}
              <span className="onText">{freq} times a second</span>. A higher
              frequency sounds higher pitched, and the compressions are closer
              together, so the wavelength is shorter. The animation is slowed
              down {TIME_SCALE} times so you can see each vibration.
            </p>
          </div>

          <div className="lessonBox">
            <h2>2. Amplitude and loudness</h2>
            <p>
              Amplitude is how far each particle moves from its resting
              position (the dashed lines). A bigger amplitude means bigger
              changes in pressure and a louder sound.{" "}
              {source === "fork"
                ? "A struck tuning fork rings at one frequency. Its amplitude slowly dies away, so it gets quieter, but its pitch stays the same."
                : "Changing the amplitude does not change the pitch."}
            </p>
          </div>
        </section>
        {onBack && <SiteFooter />}
      </div>
    </main>
  );
}

export function SoundWavesPreview() {
  return (
    <>
      <style>{`
        .soundWavesPreview {
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .soundWavesPreview .page {
          min-height: 0;
          width: 100%;
          height: 100%;
          padding: 0;
          background: transparent;
        }

        .soundWavesPreview .shell {
          width: 100%;
          height: 100%;
          max-width: none;
          margin: 0;
        }

        .soundWavesPreview .heading,
        .soundWavesPreview .backRow,
        .soundWavesPreview .signalBar,
        .soundWavesPreview .sliderBar,
        .soundWavesPreview .controls,
        .soundWavesPreview .lesson {
          display: none !important;
        }

        .soundWavesPreview .card {
          width: 100%;
          height: 100%;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          background: transparent;
          overflow: hidden;
        }

        .soundWavesPreview .stage {
          width: 100%;
          height: 100%;
          padding: 0;
        }

        .soundWavesPreview .stageInner {
          width: 100%;
          height: 100%;
        }

        .soundWavesPreview .stageInner > svg {
          width: 100%;
          height: 100%;
          display: block;
        }

        .soundWavesPreview .graphToggle {
          display: none;
        }
      `}</style>

      <div className="soundWavesPreview">
        <SoundWaves disableSound />
      </div>
    </>
  );
}
