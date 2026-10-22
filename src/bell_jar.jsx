import { BrandLogo, SiteFooter } from "./Branding.jsx";
import { useEffect, useRef, useState } from "react";

const C = {
  ink: "#202020",
  blue: "#2166d1",
  blueLight: "#eaf3ff",
  tracer: "#dc2626",
  green: "#2d9b55",
  amber: "#c9821b",
  muted: "#59636f",
  metal: "#8f969d",
  metalDark: "#555c63",
  glassDark: "#5b93ab",
  glassLight: "#bfe3ee",
};

// ---------------------------------------------------------------------------
// Timing and wave settings
// ---------------------------------------------------------------------------
const FREQ = 1.5; // buzzer frequency on screen (slowed right down so you can see it)
const WAVE_SPEED = 110; // speed of sound in air, px per second
const GLASS_SPEED = 550; // sound travels much faster through the solid glass
const AIR_AMP = 3.5; // inside the jar; the wave keeps its strength as it spreads
const OUTSIDE_FACTOR = 0.7; // some of the energy is lost getting through the glass
const GLASS_AMP = 2.4;
// The glass vibrates less and less towards the base, where it is held still
const GLASS_TAPER_MIN = 0.05;
const BUZZER_PULSE = 0.07;
const SHADE_MAX = 0.2;
const SLOW_FACTOR = 0.2;
const PUMP_TAU = 2.5; // seconds for the air left in the jar to fall by a factor of e
const VENT_TAU = 1.1;
const ATM = 101; // kPa

const MASTER_VOLUME = 0.12;
const BUZZ_PITCH = 420;

const TWO_PI = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Geometry (SVG units)
// ---------------------------------------------------------------------------
const W = 1150;
const H = 560;
const BENCH = 494;

const X0 = 400; // axis of the bell jar
const S = { x: X0, y: 310 }; // the buzzer
const BUZZER_R = 20;

const RI = 150; // inner radius of the jar (sides and dome)
const DOME_Y = 290; // centre of the dome
const FOOT = 470; // where the glass sits on the base plate

// Glass wall: particles packed as a solid, LAYERS particles thick
const LAYERS = 8;
const ATOM_GAP = 7.2;
const LAYER_GAP = (ATOM_GAP * Math.sqrt(3)) / 2;
const ATOM_R = 3.1;
const GLASS_T = ATOM_GAP + (LAYERS - 1) * LAYER_GAP;
const RO = RI + GLASS_T;

const BUNG = {
  top: DOME_Y - RO - 8,
  bottom: DOME_Y - RI + 12,
  wTop: 23,
  wBottom: 16,
};
const bungHalfWidth = (y) =>
  BUNG.wBottom +
  ((BUNG.bottom - y) / (BUNG.bottom - BUNG.top)) * (BUNG.wTop - BUNG.wBottom);

const BASE = { x0: 186, x1: 614, y0: FOOT, y1: BENCH };
const PUMP = { x0: 20, x1: 170, y0: 368, y1: BENCH };
const GAUGE = { x: 95, y: 416, r: 30 };
const SUPPLY = { x0: 650, x1: 770, y0: 424, y1: BENCH };
const OUTLET_X = 300;
const PIPE_Y = 482;

const jarOutline = (r, close = 0) =>
  "M" +
  (X0 - r) +
  "," +
  (FOOT + close) +
  " V" +
  DOME_Y +
  " A" +
  r +
  "," +
  r +
  " 0 0 1 " +
  (X0 + r) +
  "," +
  DOME_Y +
  " V" +
  (FOOT + close);

const GLASS_BAND =
  jarOutline(RO) +
  " H" +
  (X0 + RI) +
  " V" +
  DOME_Y +
  " A" +
  RI +
  "," +
  RI +
  " 0 0 0 " +
  (X0 - RI) +
  "," +
  DOME_Y +
  " Z";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

// Time for the wave to reach a point inside the jar, or outside it (having crossed
// the glass wall, where it moves much faster)
const delayInside = (rad) => Math.max(0, rad - BUZZER_R) / WAVE_SPEED;
const delayOutside = (rad) =>
  Math.max(0, rad - BUZZER_R - GLASS_T) / WAVE_SPEED + GLASS_T / GLASS_SPEED;

const inOutline = (x, y, r) =>
  Math.abs(x - X0) < r && (y >= DOME_Y || Math.hypot(x - X0, y - DOME_Y) < r);

const inRect = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3];

// ---------------------------------------------------------------------------
// Air particles, inside and outside the jar
// ---------------------------------------------------------------------------
const AIR_DX = 11;
const AIR_DY = 13;
const TRACERS_IN = [470, 520];
const TRACERS_OUT = [650, 750, 850, 950, 1050];

const OUT_BLOCKS = [
  [BASE.x0 - 6, BASE.y0 - 6, BASE.x1 + 6, H],
  [PUMP.x0 - 6, PUMP.y0 - 6, PUMP.x1 + 22, H],
  [SUPPLY.x0 - 6, SUPPLY.y0 - 6, SUPPLY.x1 + 6, H],
  [BASE.x1 - 4, FOOT, SUPPLY.x0 + 16, BENCH], // just the wire from the base to the supply
  [X0 - 30, BUNG.top - 8, X0 + 30, DOME_Y - RO + 20],
];

const AIR = [];
{
  const rand = seededRandom(11);
  const tracerSpots = [...TRACERS_IN, ...TRACERS_OUT];

  for (let gy = 12; gy < BENCH - 6; gy += AIR_DY) {
    for (let gx = 8; gx < W - 4; gx += AIR_DX) {
      const x = gx + (rand() - 0.5) * 8;
      const y = gy + (rand() - 0.5) * 9;
      const r = 2.6 + rand() * 0.8;
      const u = rand();

      if (tracerSpots.some((tx) => Math.hypot(x - tx, y - S.y) < 9)) continue;

      if (inOutline(x, y, RI - 6) && y < FOOT - 6) {
        if (Math.hypot(x - S.x, y - S.y) < BUZZER_R + 9) continue;
        if (Math.abs(x - X0) < 7 && y < S.y) continue; // thread
        if (Math.abs(x - X0) < 12 && y > S.y) continue; // wires
        AIR.push({ x, y, r, u, inside: true });
      } else {
        if (inOutline(x, y, RO + 6)) continue; // the glass itself
        if (y > BENCH - 7) continue;
        if (OUT_BLOCKS.some((b) => inRect(x, y, b))) continue;
        AIR.push({ x, y, r, u, inside: false });
      }
    }
  }

  // Tracer particles: highlighted, with their resting positions marked. The inside
  // ones are the last to be pumped out.
  TRACERS_IN.forEach((x, k) =>
    AIR.push({ x, y: S.y, r: 4.5, u: 0.01 + k * 0.005, inside: true, tracer: true })
  );
  TRACERS_OUT.forEach((x) =>
    AIR.push({ x, y: S.y, r: 4.5, u: 0, inside: false, tracer: true })
  );

  AIR.forEach((p) => {
    const dx = p.x - S.x;
    const dy = p.y - S.y;
    const rad = Math.hypot(dx, dy);
    p.delay = p.inside ? delayInside(rad) : delayOutside(rad);
    const a = p.inside ? AIR_AMP : AIR_AMP * OUTSIDE_FACTOR;
    p.ax = (a * dx) / rad;
    p.ay = (a * dy) / rad;
  });
}

// ---------------------------------------------------------------------------
// Air let back in arrives from the pump, along the pipe and up through the outlet in
// the base plate. Each inside particle has a route between its place and the pump.
// ---------------------------------------------------------------------------
const OUTLET = { x: OUTLET_X, y: FOOT - 3 };
const PIPE_END = PUMP.x1 - 6;
const LEAVE_SPEED = 260; // px per second along the route

const INSIDE = AIR.filter((p) => p.inside);
INSIDE.forEach((p, i) => {
  p.idx = i;
  p.d1 = Math.hypot(OUTLET.x - p.x, OUTLET.y - p.y);
  p.route = p.d1 + (PIPE_Y - OUTLET.y) + (OUTLET_X - PIPE_END);
  p.jit = ((i * 7919) % 9) / 2 - 2; // small sideways spread inside the pipe
});

// Air in the outlet channel and pipe: as dense as the air in the jar, and flowing
// away from the jar towards the pump while it is pumping
const PIPE_LEN = PIPE_Y - (FOOT - 1) + (OUTLET_X - PIPE_END);
const PIPE_AIR = (() => {
  const rand = seededRandom(23);
  return Array.from({ length: 22 }, (_, i) => ({
    s: (i + 0.5) * (PIPE_LEN / 22) + (rand() - 0.5) * 3,
    jit: (rand() - 0.5) * 4,
    u: rand(),
  }));
})();
const PIPE_FLOW_SPEED = 70; // px per second

const pipePoint = (s, jit) => {
  const down = PIPE_Y - (FOOT - 1);
  if (s < down) return [OUTLET_X + jit * 0.5, FOOT - 1 + s];
  return [OUTLET_X - (s - down), PIPE_Y + jit];
};

const routePoint = (p, k) => {
  let s = k * p.route;
  if (s < p.d1) {
    const f = s / p.d1;
    return [p.x + (OUTLET.x - p.x) * f, p.y + (OUTLET.y - p.y) * f];
  }
  s -= p.d1;
  const down = PIPE_Y - OUTLET.y;
  if (s < down) return [OUTLET.x + p.jit * 0.5, OUTLET.y + s];
  s -= down;
  return [OUTLET_X - s, PIPE_Y + p.jit];
};

const AIR_GROUPS = [
  { color: C.metal, width: 5.5, pts: AIR.filter((p) => !p.tracer && p.r < 2.9) },
  { color: C.metal, width: 6.1, pts: AIR.filter((p) => !p.tracer && p.r >= 2.9 && p.r < 3.2) },
  { color: C.metal, width: 6.7, pts: AIR.filter((p) => !p.tracer && p.r >= 3.2) },
  { color: C.tracer, width: 9, pts: AIR.filter((p) => p.tracer) },
];

// ---------------------------------------------------------------------------
// Glass particles: a close-packed solid, LAYERS particles thick, following the
// shape of the jar. Each one vibrates about its fixed place, along the wall's normal.
// ---------------------------------------------------------------------------
const GLASS = [];
{
  const add = (x, y, nx, ny, depth) => {
    const rad = Math.hypot(x - S.x, y - S.y);
    // full movement on the dome, fading to almost nothing at the foot of the walls
    const taper =
      GLASS_TAPER_MIN +
      (1 - GLASS_TAPER_MIN) * smoothstep((FOOT - y) / (FOOT - DOME_Y + 40));
    GLASS.push({
      x,
      y,
      ax: nx * GLASS_AMP * taper,
      ay: ny * GLASS_AMP * taper,
      delay:
        Math.max(0, rad - depth - BUZZER_R) / WAVE_SPEED + depth / GLASS_SPEED,
      tracer: false,
    });
  };

  const straight = FOOT - ATOM_R - 0.5 - DOME_Y;
  const m = Math.round(straight / ATOM_GAP);
  const g = straight / m;

  for (let k = 0; k < LAYERS; k++) {
    const r = RI + ATOM_GAP / 2 + k * LAYER_GAP;
    const depth = r - RI;
    const odd = k % 2 === 1;

    // Straight sides, from the base upwards
    for (let j = 0; j < m; j++) {
      const y = FOOT - ATOM_R - 0.5 - (j + (odd ? 0.5 : 0)) * g;
      add(X0 - r, y, -1, 0, depth);
      add(X0 + r, y, 1, 0, depth);
    }

    // Dome, leaving a hole for the rubber bung
    const n = Math.round((Math.PI * r) / ATOM_GAP);
    const step = Math.PI / n;
    for (let j = 0; j <= n; j++) {
      const th = Math.PI - (j + (odd ? 0.5 : 0)) * step;
      if (th < -1e-6) continue;
      const x = X0 + r * Math.cos(th);
      const y = DOME_Y - r * Math.sin(th);
      if (Math.abs(x - X0) < bungHalfWidth(y) + 2) continue;
      add(x, y, Math.cos(th), -Math.sin(th), depth);
    }
  }

  // One tracer particle per layer, on the right-hand wall level with the buzzer
  for (let k = 0; k < LAYERS; k++) {
    const r = RI + ATOM_GAP / 2 + k * LAYER_GAP;
    let best = null;
    GLASS.forEach((a) => {
      if (Math.abs(a.x - (X0 + r)) > 0.01) return;
      if (!best || Math.abs(a.y - S.y) < Math.abs(best.y - S.y)) best = a;
    });
    if (best) best.tracer = true;
  }
}

const GLASS_PLAIN = GLASS.filter((a) => !a.tracer);
const GLASS_TRACERS = GLASS.filter((a) => a.tracer);

// ---------------------------------------------------------------------------
// Pressure shading: one radial gradient for the air inside the jar and one for the
// air outside, each centred on the buzzer. Their stops are re-coloured every frame.
// ---------------------------------------------------------------------------
const IN_R = 260;
const IN_STOPS = Array.from({ length: 48 }, (_, k) => {
  const rad = BUZZER_R + (k / 47) * (IN_R - BUZZER_R);
  return {
    off: rad / IN_R,
    delay: delayInside(rad),
    fade: smoothstep((rad - BUZZER_R) / 25),
  };
});

const OUT_R = 860;
const OUT_STOPS = Array.from({ length: 130 }, (_, k) => {
  const rad = 185 + (k / 129) * (OUT_R - 185);
  return {
    off: rad / OUT_R,
    delay: delayOutside(rad),
    fade: OUTSIDE_FACTOR * smoothstep((OUT_R - rad) / 170),
  };
});

// ---------------------------------------------------------------------------
// The wave's strength is remembered over time, so when air is pumped out (or the
// buzzer is switched off) the change spreads outward at the speed of sound.
// ---------------------------------------------------------------------------
const HIST_DT = 1 / 60;
const HIST_N = 1200;

const PUMP_OPTIONS = [
  { id: "off", label: "Pump off" },
  { id: "pump", label: "Pump air out" },
  { id: "vent", label: "Let air back in" },
];

const PART_LABELS = [
  { text: "Buzzer", x: 316, y: 262, anchor: "end", from: [320, 266], to: [385, 299] },
  {
    text: "Glass: particles in a solid",
    x: 642,
    y: 116,
    anchor: "start",
    from: [638, 121],
    to: [524, 166],
  },
  {
    text: "Pressure gauge",
    x: GAUGE.x,
    y: 350,
    anchor: "middle",
    from: [GAUGE.x, 356],
    to: [GAUGE.x, GAUGE.y - GAUGE.r - 2],
  },
  { text: "Rubber bung", x: 470, y: 62, anchor: "start", from: [466, 66], to: [418, 92] },
];

const GAUGE_TICKS = Array.from({ length: 11 }, (_, k) => -120 + k * 24);

const svgPathFor = (pts, t, envAt, skip) => {
  let d = "";
  for (let n = 0; n < pts.length; n++) {
    const p = pts[n];
    if (skip && skip(p)) continue;
    const tau = t - p.delay;
    const c = envAt(tau) * Math.sin(TWO_PI * FREQ * tau);
    d +=
      "M" +
      (p.x + p.ax * c).toFixed(1) +
      " " +
      (p.y + p.ay * c).toFixed(1) +
      "h0";
  }
  return d;
};

export default function BellJar({ onBack, disableSound = false }) {
  const [pumpMode, setPumpMode] = useState("off");
  const [buzzerOn, setBuzzerOn] = useState(true);
  const [muted, setMuted] = useState(true);
  const [slow, setSlow] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [status, setStatus] = useState("loud");
  const [airCat, setAirCat] = useState("full");

  const modeRef = useRef("off");
  modeRef.current = pumpMode;
  const onRef = useRef(true);
  onRef.current = buzzerOn;
  const mutedRef = useRef(true);
  mutedRef.current = muted;
  const slowRef = useRef(false);
  slowRef.current = slow;

  const audioRef = useRef({});
  const airRefs = useRef([]);
  const movingRefs = useRef([]);
  const glassRefs = useRef([]);
  const inStopRefs = useRef([]);
  const outStopRefs = useRef([]);
  const buzzerRef = useRef(null);
  const needleRef = useRef(null);
  const fanRef = useRef(null);
  const readoutRef = useRef(null);

  // Sound: a buzz whose loudness follows how much sound gets out of the jar
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
      osc.type = "square";
      osc.frequency.value = BUZZ_PITCH;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(filter);
      filter.connect(g);
      g.connect(master);
      osc.start();

      Object.assign(a, { ctx, master, g, applied: 0 });
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
      a.master.gain.setTargetAtTime(
        muted ? 0 : MASTER_VOLUME,
        a.ctx.currentTime,
        0.03
      );
    }
  }, [muted]);

  useEffect(() => {
    let raf;
    let last = performance.now();
    let simT = 0;
    let speed = 1;
    let air = 1; // fraction of the air left in the jar
    let env = 1; // strength of the sound the buzzer is sending out right now
    let onEnv = 1; // how hard the buzzer itself is vibrating
    let fan = 0;
    let pipeOffset = 0;
    const leave = new Float32Array(INSIDE.length); // 0 = in the jar, 1 = in the pump
    let lastStatus = "";
    let lastCat = "";
    let lastReadout = "";

    const hist = new Float32Array(HIST_N).fill(1);
    let histK = 0;

    const envAt = (tau) => {
      let k = Math.floor(tau / HIST_DT);
      if (k > histK) k = histK;
      if (k < histK - HIST_N + 1) k = histK - HIST_N + 1;
      return hist[mod(k, HIST_N)];
    };

    const loop = (now) => {
      const real = Math.min((now - last) / 1000, 0.1);
      last = now;
      speed +=
        ((slowRef.current ? SLOW_FACTOR : 1) - speed) * Math.min(1, real * 6);
      const dt = real * speed;
      simT += dt;
      const t = simT;

      // --- Vacuum pump ---
      const mode = modeRef.current;
      if (mode === "pump") {
        air -= (air * dt) / PUMP_TAU;
        if (air < 0.004) air = 0;
      } else if (mode === "vent") {
        air += ((1 - air) * dt) / VENT_TAU;
        if (air > 0.996) air = 1;
      }

      const on = onRef.current ? 1 : 0;
      onEnv += (on - onEnv) * Math.min(1, dt / 0.15);
      env += (on * air - env) * Math.min(1, dt / 0.2);

      const k = Math.floor(t / HIST_DT);
      for (let j = histK + 1; j <= k; j++) hist[mod(j, HIST_N)] = env;
      if (k > histK) histK = k;

      // --- Air particles (inside ones disappear as the air is pumped out) ---
      // When air is let back in, particles come in from the pump, along the pipe and
      // up through the outlet to their places
      let movingD = "";
      let movingTracerD = "";
      for (let n = 0; n < INSIDE.length; n++) {
        const p = INSIDE[n];
        const target = p.u >= air ? 1 : 0;
        let k = leave[n];
        if (k !== target) {
          // pumped-out particles simply vanish; let-in ones arrive along the pipe
          k =
            target > k
              ? 1
              : Math.max(0, k - (LEAVE_SPEED * dt) / p.route);
          leave[n] = k;
        }
        if (k > 0 && k < 1) {
          const [mx, my] = routePoint(p, k);
          const seg = "M" + mx.toFixed(1) + " " + my.toFixed(1) + "h0";
          if (p.tracer) movingTracerD += seg;
          else movingD += seg;
        }
      }
      // Air in the pipe
      pipeOffset +=
        (mode === "pump" && air > 0
          ? PIPE_FLOW_SPEED
          : mode === "vent" && air < 1
            ? -PIPE_FLOW_SPEED
            : 0) * dt;
      for (let n = 0; n < PIPE_AIR.length; n++) {
        const q = PIPE_AIR[n];
        if (q.u >= air) continue;
        const [qx, qy] = pipePoint(mod(q.s + pipeOffset, PIPE_LEN), q.jit);
        movingD += "M" + qx.toFixed(1) + " " + qy.toFixed(1) + "h0";
      }

      movingRefs.current[0].setAttribute("d", movingD);
      movingRefs.current[1].setAttribute("d", movingTracerD);

      const skipGone = (p) => p.inside && leave[p.idx] > 0;
      AIR_GROUPS.forEach((grp, g) => {
        airRefs.current[g].setAttribute("d", svgPathFor(grp.pts, t, envAt, skipGone));
      });

      // --- Glass particles ---
      const gd = svgPathFor(GLASS_PLAIN, t, envAt);
      glassRefs.current[0].setAttribute("d", gd);
      glassRefs.current[1].setAttribute("d", gd);
      glassRefs.current[2].setAttribute("d", svgPathFor(GLASS_TRACERS, t, envAt));

      // --- Pressure shading ---
      const shade = (stops, refs) => {
        for (let n = 0; n < stops.length; n++) {
          const st = stops[n];
          const tau = t - st.delay;
          const op =
            SHADE_MAX *
            st.fade *
            envAt(tau) *
            (0.5 + 0.5 * Math.cos(TWO_PI * FREQ * tau));
          refs[n].setAttribute("stop-opacity", op.toFixed(3));
        }
      };
      shade(IN_STOPS, inStopRefs.current);
      shade(OUT_STOPS, outStopRefs.current);

      // --- The buzzer keeps vibrating whether or not there is air around it ---
      const pulse = 1 + BUZZER_PULSE * onEnv * Math.sin(TWO_PI * FREQ * t);
      buzzerRef.current.setAttribute(
        "transform",
        "translate(" +
          S.x +
          " " +
          S.y +
          ") scale(" +
          pulse.toFixed(4) +
          ") translate(" +
          -S.x +
          " " +
          -S.y +
          ")"
      );

      // --- Gauge, pump motor and air in the pipe ---
      needleRef.current.setAttribute(
        "transform",
        "rotate(" + (-120 + 240 * air).toFixed(2) + " " + GAUGE.x + " " + GAUGE.y + ")"
      );

      if (mode === "pump") fan += dt * 900;
      fanRef.current.setAttribute(
        "transform",
        "rotate(" + mod(fan, 360).toFixed(1) + " 52 466)"
      );

      // --- Readouts ---
      const kpa = ATM * air;
      const readout =
        "= " + (kpa >= 9.95 || kpa === 0 ? kpa.toFixed(0) : kpa.toFixed(1)) + " kPa";
      if (readout !== lastReadout) {
        readoutRef.current.textContent = readout;
        lastReadout = readout;
      }

      const st = !onRef.current
        ? "off"
        : env > 0.6
          ? "loud"
          : env > 0.12
            ? "quiet"
            : "silent";
      if (st !== lastStatus) {
        setStatus(st);
        lastStatus = st;
      }

      const cat = air > 0.97 ? "full" : air < 0.02 ? "empty" : "part";
      if (cat !== lastCat) {
        setAirCat(cat);
        lastCat = cat;
      }

      // --- Sound ---
      const au = audioRef.current;
      if (au.ctx) {
        const target = Math.pow(env, 1.3);
        if (Math.abs(target - au.applied) > 0.01 || (target === 0 && au.applied !== 0)) {
          au.g.gain.setTargetAtTime(target, au.ctx.currentTime, 0.05);
          au.applied = target;
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const statusText = {
    loud: "Loud • the sound gets out",
    quiet: "Quieter • fewer particles",
    silent: "Silent • nothing to carry it",
    off: "Buzzer off • no sound",
  }[status];

  const statusDot = status === "loud" ? "on" : status === "quiet" ? "warn" : "";

  const insideLabel =
    airCat === "full"
      ? "Air inside the jar"
      : airCat === "part"
        ? "Less air inside"
        : "Vacuum: no particles";

  const pumpRunning = pumpMode === "pump";

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

        .stage svg {
          display: block;
          width: 100%;
          height: auto;
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
      `}</style>

      <div className={onBack ? "shell has-brand" : "shell"}>
        {onBack && <BrandLogo className="page-logo" />}
        <header className="heading">
          <div className="eyebrow">Sound • 02</div>
          <h1>The Bell Jar Experiment</h1>
          <p className="intro">
            A buzzer hangs inside a glass bell jar. Its vibrations pass from
            particle to particle: through the air in the jar, through the
            solid glass wall and out into the room. Pump the air out and see
            what happens to the sound.
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
            <svg
              viewBox={"0 0 " + W + " " + H}
              role="img"
              aria-label="A buzzer inside a bell jar connected to a vacuum pump, with air particles inside and outside the jar and particles of glass in the wall"
            >
              <defs>
                <radialGradient
                  id="bjInGradient"
                  gradientUnits="userSpaceOnUse"
                  cx={S.x}
                  cy={S.y}
                  r={IN_R}
                >
                  {IN_STOPS.map((st, k) => (
                    <stop
                      key={k}
                      ref={(el) => (inStopRefs.current[k] = el)}
                      offset={st.off}
                      stopColor="#2b3a4d"
                      stopOpacity="0"
                    />
                  ))}
                </radialGradient>

                <radialGradient
                  id="bjOutGradient"
                  gradientUnits="userSpaceOnUse"
                  cx={S.x}
                  cy={S.y}
                  r={OUT_R}
                >
                  {OUT_STOPS.map((st, k) => (
                    <stop
                      key={k}
                      ref={(el) => (outStopRefs.current[k] = el)}
                      offset={st.off}
                      stopColor="#2b3a4d"
                      stopOpacity="0"
                    />
                  ))}
                </radialGradient>

                <clipPath id="bjInClip">
                  <path d={jarOutline(RI) + " Z"} />
                </clipPath>

                <linearGradient id="bjMetal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6b7280" />
                  <stop offset="45%" stopColor="#d1d5db" />
                  <stop offset="100%" stopColor="#4b5563" />
                </linearGradient>

                <linearGradient id="bjPumpBody" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#b9c0c8" />
                  <stop offset="50%" stopColor="#e5e7eb" />
                  <stop offset="100%" stopColor="#a3abb4" />
                </linearGradient>
              </defs>

              {/* Compressions (darker) and rarefactions in the air */}
              {/* (the outside shading is covered inside the jar, which has its own) */}
              <rect x="0" y="0" width={W} height={BENCH} fill="url(#bjOutGradient)" />
              <path d={jarOutline(RI) + " Z"} fill="#fff" />
              <rect
                x={X0 - RI}
                y={DOME_Y - RI}
                width={2 * RI}
                height={FOOT - DOME_Y + RI}
                fill="url(#bjInGradient)"
                clipPath="url(#bjInClip)"
              />

              {/* Bench */}
              <rect x="0" y={BENCH} width={W} height={H - BENCH} fill="#e9ecef" />
              <line x1="0" y1={BENCH} x2={W} y2={BENCH} stroke="#c6ccd3" strokeWidth="2" />

              {/* Glass wall */}
              <path d={GLASS_BAND} fill="#e3f3f8" />

              {/* Resting positions of the tracer particles */}
              {AIR.filter((p) => p.tracer).map((p) => (
                <line
                  key={"tick" + p.x}
                  x1={p.x}
                  y1={p.y - 12}
                  x2={p.x}
                  y2={p.y + 12}
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

              {/* Glass particles, packed as a solid */}
              <path
                ref={(el) => (glassRefs.current[0] = el)}
                fill="none"
                stroke={C.glassDark}
                strokeWidth={2 * ATOM_R + 1.5}
                strokeLinecap="round"
              />
              <path
                ref={(el) => (glassRefs.current[1] = el)}
                fill="none"
                stroke={C.glassLight}
                strokeWidth={2 * ATOM_R - 0.2}
                strokeLinecap="round"
              />
              <path
                ref={(el) => (glassRefs.current[2] = el)}
                fill="none"
                stroke={C.tracer}
                strokeWidth={2 * ATOM_R + 1.5}
                strokeLinecap="round"
              />

              {/* Rubber bung and the thread the buzzer hangs from */}
              <polygon
                points={
                  X0 - BUNG.wTop + "," + BUNG.top + " " +
                  (X0 + BUNG.wTop) + "," + BUNG.top + " " +
                  (X0 + BUNG.wBottom) + "," + BUNG.bottom + " " +
                  (X0 - BUNG.wBottom) + "," + BUNG.bottom
                }
                fill="#3f444b"
                stroke="#26292d"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <line
                x1={X0}
                y1={BUNG.bottom}
                x2={X0}
                y2={S.y - BUZZER_R + 2}
                stroke={C.muted}
                strokeWidth="1.6"
              />

              {/* Wires from the buzzer, down through the base plate */}
              <path
                d={"M" + (X0 - 6) + "," + (S.y + 14) + " V" + (FOOT + 2)}
                stroke="#dc2626"
                strokeWidth="2.6"
                fill="none"
              />
              <path
                d={"M" + (X0 + 6) + "," + (S.y + 14) + " V" + (FOOT + 2)}
                stroke={C.ink}
                strokeWidth="2.6"
                fill="none"
              />

              {/* Buzzer */}
              <g ref={buzzerRef}>
                <circle cx={S.x} cy={S.y} r={BUZZER_R} fill="#2f3640" stroke="#15191e" strokeWidth="2" />
                <circle cx={S.x} cy={S.y} r={BUZZER_R - 6} fill="#4b5563" />
                <circle cx={S.x} cy={S.y} r="4" fill="#15191e" />
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <circle
                    key={a}
                    cx={S.x + 9 * Math.cos((a * Math.PI) / 180)}
                    cy={S.y + 9 * Math.sin((a * Math.PI) / 180)}
                    r="1.6"
                    fill="#15191e"
                  />
                ))}
              </g>

              {/* Base plate, with the channel to the pump cut away */}
              <rect
                x={BASE.x0}
                y={BASE.y0}
                width={BASE.x1 - BASE.x0}
                height={BASE.y1 - BASE.y0}
                rx="3"
                fill="url(#bjMetal)"
                stroke={C.metalDark}
                strokeWidth="2"
              />
              <path
                d={"M" + BASE.x0 + "," + PIPE_Y + " H" + OUTLET_X + " V" + (FOOT - 1)}
                fill="none"
                stroke="#4b5563"
                strokeWidth="11"
              />
              <path
                d={"M" + (BASE.x0 - 2) + "," + PIPE_Y + " H" + OUTLET_X + " V" + (FOOT - 2)}
                fill="none"
                stroke="#eef0f2"
                strokeWidth="8"
              />

              {/* Pipe to the pump */}
              <rect
                x={PUMP.x1 - 4}
                y={PIPE_Y - 6}
                width={BASE.x0 - PUMP.x1 + 8}
                height="12"
                fill="#d9dde2"
                stroke={C.metalDark}
                strokeWidth="1.5"
              />

              {/* Air particles on their way out (or back in) */}
              <path
                ref={(el) => (movingRefs.current[0] = el)}
                fill="none"
                stroke={C.metal}
                strokeWidth="6.1"
                strokeLinecap="round"
              />
              <path
                ref={(el) => (movingRefs.current[1] = el)}
                fill="none"
                stroke={C.tracer}
                strokeWidth="9"
                strokeLinecap="round"
              />

              {/* Vacuum pump with its pressure gauge */}
              <rect
                x={PUMP.x0}
                y={PUMP.y0}
                width={PUMP.x1 - PUMP.x0}
                height={PUMP.y1 - PUMP.y0}
                rx="10"
                fill="url(#bjPumpBody)"
                stroke={C.metalDark}
                strokeWidth="2"
              />
              <circle cx={GAUGE.x} cy={GAUGE.y} r={GAUGE.r} fill="#fff" stroke={C.metalDark} strokeWidth="3" />
              {GAUGE_TICKS.map((a, k) => (
                <line
                  key={a}
                  x1={GAUGE.x}
                  y1={GAUGE.y - GAUGE.r + 3}
                  x2={GAUGE.x}
                  y2={GAUGE.y - GAUGE.r + (k % 5 === 0 ? 10 : 7)}
                  stroke={C.ink}
                  strokeWidth={k % 5 === 0 ? 2 : 1.2}
                  transform={"rotate(" + a + " " + GAUGE.x + " " + GAUGE.y + ")"}
                />
              ))}
              <text x={GAUGE.x} y={GAUGE.y + 24} fontSize="8.5" fill={C.muted} textAnchor="middle">
                kPa
              </text>
              <line
                ref={needleRef}
                x1={GAUGE.x}
                y1={GAUGE.y + 4}
                x2={GAUGE.x}
                y2={GAUGE.y - GAUGE.r + 8}
                stroke="#dc2626"
                strokeWidth="2.4"
                strokeLinecap="round"
                transform={"rotate(120 " + GAUGE.x + " " + GAUGE.y + ")"}
              />
              <circle cx={GAUGE.x} cy={GAUGE.y} r="3.5" fill={C.ink} />

              <circle cx="52" cy="466" r="17" fill="#4b5563" stroke="#2f3640" strokeWidth="2" />
              <g ref={fanRef}>
                {[0, 90, 180, 270].map((a) => (
                  <path
                    key={a}
                    d="M52,466 L52,452 Q58,456 55,465 Z"
                    fill="#cbd2d9"
                    transform={"rotate(" + a + " 52 466)"}
                  />
                ))}
              </g>
              <circle cx="52" cy="466" r="3" fill="#2f3640" />
              <circle
                cx="140"
                cy="466"
                r="6"
                fill={pumpRunning ? C.green : "#c6ccd3"}
                stroke={C.metalDark}
                strokeWidth="1.5"
              />

              {/* Power supply */}
              <path d={"M" + BASE.x1 + ",476 H" + (SUPPLY.x0 + 12)} stroke="#dc2626" strokeWidth="2.6" fill="none" />
              <path d={"M" + BASE.x1 + ",488 H" + (SUPPLY.x0 + 12)} stroke={C.ink} strokeWidth="2.6" fill="none" />
              <rect
                x={SUPPLY.x0}
                y={SUPPLY.y0}
                width={SUPPLY.x1 - SUPPLY.x0}
                height={SUPPLY.y1 - SUPPLY.y0}
                rx="8"
                fill="#f4f6f8"
                stroke={C.metalDark}
                strokeWidth="2"
              />
              <rect x={SUPPLY.x0 + 30} y={SUPPLY.y0 + 12} width="58" height="26" rx="4" fill="#1f2a33" />
              <text
                x={SUPPLY.x0 + 59}
                y={SUPPLY.y0 + 31}
                fontSize="15"
                fontWeight="700"
                fill={buzzerOn ? "#7ee2a1" : "#41505c"}
                textAnchor="middle"
              >
                6 V
              </text>
              <circle
                cx={SUPPLY.x1 - 14}
                cy={SUPPLY.y0 + 25}
                r="6"
                fill={buzzerOn ? C.green : "#c6ccd3"}
                stroke={C.metalDark}
                strokeWidth="1.5"
              />
              <circle cx={SUPPLY.x0 + 12} cy="476" r="5" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.2" />
              <circle cx={SUPPLY.x0 + 12} cy="488" r="5" fill="#2f3640" stroke="#111" strokeWidth="1.2" />

              {/* Names on the bench */}
              <g fontSize="18" fill={C.ink} textAnchor="middle">
                <text x={(PUMP.x0 + PUMP.x1) / 2} y="526">
                  Vacuum pump
                </text>
                <text x={X0} y="526">
                  Bell jar
                </text>
                <text x={(SUPPLY.x0 + SUPPLY.x1) / 2} y="526">
                  Power supply
                </text>
              </g>

              {/* Part labels */}
              <g
                style={{
                  opacity: showLabels ? 1 : 0,
                  transition: "opacity 0.3s ease",
                  pointerEvents: "none",
                }}
                aria-hidden={!showLabels}
              >
                {PART_LABELS.map((l) => (
                  <g key={l.text}>
                    <line
                      x1={l.from[0]}
                      y1={l.from[1]}
                      x2={l.to[0]}
                      y2={l.to[1]}
                      stroke="#fff"
                      strokeWidth="4"
                      strokeOpacity="0.85"
                      strokeLinecap="round"
                    />
                    <line
                      x1={l.from[0]}
                      y1={l.from[1]}
                      x2={l.to[0]}
                      y2={l.to[1]}
                      stroke={C.ink}
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <circle cx={l.to[0]} cy={l.to[1]} r="2.8" fill={C.ink} stroke="#fff" strokeWidth="1.2" />
                    <text
                      x={l.x}
                      y={l.y}
                      fontSize="15"
                      fontWeight="700"
                      fill={C.ink}
                      textAnchor={l.anchor}
                      stroke="#fff"
                      strokeWidth="4"
                      strokeLinejoin="round"
                      paintOrder="stroke"
                    >
                      {l.text}
                    </text>
                  </g>
                ))}

                <g
                  fontSize="15"
                  fontWeight="700"
                  textAnchor="middle"
                  stroke="#fff"
                  strokeWidth="4"
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  <text x="488" y="452" fill={airCat === "empty" ? "#9b5d13" : C.ink}>
                    {insideLabel}
                  </text>
                  <text x="985" y="478" fill={C.ink}>
                    Air outside the jar
                  </text>
                </g>
              </g>
            </svg>
          </div>

          <div className="signalBar">
            <span className="signalLabel">Vacuum pump</span>

            {PUMP_OPTIONS.map((o) => (
              <button
                key={o.id}
                className={"seg " + (pumpMode === o.id ? "on" : "")}
                onClick={() => setPumpMode(o.id)}
                aria-pressed={pumpMode === o.id}
              >
                {o.label}
              </button>
            ))}

            <span className="soundGroup">
              <button
                className={"seg muteBtn " + (muted ? "muted" : "")}
                onClick={() => setMuted((v) => !v)}
                aria-pressed={muted}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3,9 H7 L12,4.5 V19.5 L7,15 H3 Z" fill="currentColor" />
                  {muted ? (
                    <path
                      d="M16,9 L22,15 M22,9 L16,15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
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
                {muted ? "Unmute" : "Mute"}
              </button>
            </span>
          </div>

          <div className="controls">
            <div className="readout">
              <span className="readoutI">p</span>{" "}
              <span ref={readoutRef}>= 101 kPa</span>
              <span className="readoutNote">Air pressure in the jar</span>
            </div>

            <div className="toggles">
              <button
                className="switchBtn"
                onClick={() => setBuzzerOn((v) => !v)}
                aria-pressed={buzzerOn}
              >
                <span className={"toggle green " + (buzzerOn ? "on" : "")}>
                  <span className="knob" />
                </span>
                Buzzer
              </button>

              <button
                className="switchBtn"
                onClick={() => setSlow((v) => !v)}
                aria-pressed={slow}
              >
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
              <span className={"dot " + statusDot} />
              {statusText}
            </div>
          </div>
        </section>

        <section className="lesson">
          <div className="lessonBox">
            <h2>1. Sound needs particles</h2>
            <p>
              The buzzer vibrates and pushes on the air particles next to it.
              They push on their neighbours, so the vibration is passed on and
              a sound wave spreads out. Each particle only moves back and forth
              about its own resting position (the dashed lines), while the
              squashed-together regions, shown darker, travel outward.{" "}
              {airCat === "full" ? (
                <>
                  Right now the jar is{" "}
                  <span className="onText">full of air</span>.
                </>
              ) : airCat === "part" ? (
                <>
                  Air is being removed, so there are{" "}
                  <span className="offText">fewer particles</span> to pass the
                  vibration on and the sound gets quieter.
                </>
              ) : (
                <>
                  The jar is now a{" "}
                  <span className="offText">vacuum</span>. The buzzer is still
                  vibrating, but there are no particles to pass its vibration
                  on, so no sound can travel.
                </>
              )}
            </p>
          </div>

          <div className="lessonBox">
            <h2>2. Through the glass wall</h2>
            <p>
              In the glass the particles are packed tightly in a regular
              pattern and held together by strong forces. The vibration
              crosses the solid wall much faster than it travels through the
              air, and sets the air outside vibrating, so you hear the buzz.
              Take the air out of the jar and nothing makes the glass vibrate,
              so the room goes quiet even though the buzzer is still working.
              Let the air back in and the sound returns.
            </p>
          </div>
        </section>
        {onBack && <SiteFooter />}
      </div>
    </main>
  );
}

export function BellJarPreview() {
  return (
    <>
      <style>{`
        .bellJarPreview {
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .bellJarPreview .page {
          min-height: 0;
          width: 100%;
          height: 100%;
          padding: 0;
          background: transparent;
        }

        .bellJarPreview .shell {
          width: 100%;
          height: 100%;
          max-width: none;
          margin: 0;
        }

        .bellJarPreview .heading,
        .bellJarPreview .backRow,
        .bellJarPreview .signalBar,
        .bellJarPreview .controls,
        .bellJarPreview .lesson {
          display: none !important;
        }

        .bellJarPreview .card {
          width: 100%;
          height: 100%;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          background: transparent;
          overflow: hidden;
        }

        .bellJarPreview .stage {
          width: 100%;
          height: 100%;
          padding: 0;
        }

        .bellJarPreview .stage svg {
          width: 100%;
          height: 100%;
          display: block;
        }
      `}</style>

      <div className="bellJarPreview">
        <BellJar disableSound />
      </div>
    </>
  );
}
