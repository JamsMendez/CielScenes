// html-wallpaper-demo D2: verbatim port of docs/great-sage/backgroud-processing/js/layers.js (that
// tree is reference-only, excluded from git -- see the feature doc, "Source material"). Not
// restyled: only this header comment was added, the source's own header/body follow unchanged.
// foldingBandParameters/foldingBandGeometry/fillFoldingBandGeometry/drawAtomicOrbits below are the
// REAL band geometry -- js/alert-overlay.js's band-intersection layer calls the exact same
// functions, with the exact same progress `p` the scene's own drawAtomicOrbits call uses this
// frame, so what shows through the FAILED/WARNING letters is the real animation, not a copy.
//
// layers.js — the scene's visual layers: soft ovals, stars, radial streaks, lens flares,
// chromatic side loops, segmented-sphere piece drawing, orbit blocks, the tetrahedron,
// the central octagon, atomic orbit bands, the central core, film grain, and vignette.
// Loads after config.js, math.js, sphere.js, scene-data.js, and sprites.js (calls
// stampGlow/stampSprite/stampGlowLine and reads the seeded descriptor arrays).
//
// A path with moveTo/lineTo pairs preserves independent segments while sharing one shadowed stroke.
function drawGlowSegments(segments, width, alpha, blur = 8) {
  if (segments.length === 0) return;
  ctx.save();
  ctx.strokeStyle = `rgba(${CENTRAL_RAY_STROKE_COLOR},${alpha})`;
  ctx.lineWidth = structurePx(width, 0.5);
  ctx.lineCap = 'round';
  ctx.shadowColor = CENTRAL_RAY_GLOW_COLOR;
  ctx.shadowBlur = structurePx(blur, 1);
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segments) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.restore();
}

// Normalize the full-loop endpoint before any trigonometry, so wet-light states
// are bit-for-bit identical at the two ends of the ping-pong animation.
function opticalCycle(phase) {
  const cycle = phase / TAU;
  return cycle - Math.floor(cycle);
}

function opticalEnvelope(phase, stagger) {
  const local = fract(opticalCycle(phase) + stagger);
  const appear = smoothstep(0.025, 0.18, local);
  const disappear = 1 - smoothstep(0.68, 0.92, local);
  return 0.018 + 0.982 * appear * disappear;
}

function prominentRayGrowthEnvelope(phase, rayIndex) {
  if (CENTRAL_CORE_PROMINENT_RAY_COUNT === 0) return 0;
  const stagger = rayIndex / CENTRAL_CORE_PROMINENT_RAY_COUNT * TAU;
  return 0.5 + 0.5 * Math.sin(phase * CENTRAL_CORE_PROMINENT_RAY_PULSE_SPEED + stagger);
}

function viewportSafeRayLength(cx, cy, dx, dy) {
  const horizontalLimit = Math.abs(dx) < 1e-9 ? Infinity : (dx > 0 ? W - cx : cx) / Math.abs(dx);
  const verticalLimit = Math.abs(dy) < 1e-9 ? Infinity : (dy > 0 ? H - cy : cy) / Math.abs(dy);
  return Math.min(horizontalLimit, verticalLimit) * CENTRAL_CORE_PROMINENT_SAFE_REACH;
}

function centralCoreRaySafeLength(cx, cy, angle) {
  return viewportSafeRayLength(cx, cy, Math.cos(angle), Math.sin(angle));
}

// Rendering is zoomed about (cx, cy), so these untransformed bounds map exactly to the visible edge.
function visibleCanvasBounds(cx, cy, width = W, height = H, zoom = viewZoom) {
  return {
    left: cx - cx / zoom,
    right: cx + (width - cx) / zoom,
    top: cy - cy / zoom,
    bottom: cy + (height - cy) / zoom,
  };
}

function firstRayBoundaryLength(cx, cy, dx, dy, bounds) {
  const horizontalLimit = Math.abs(dx) < 1e-9 ? Infinity : (dx > 0 ? bounds.right - cx : cx - bounds.left) / Math.abs(dx);
  const verticalLimit = Math.abs(dy) < 1e-9 ? Infinity : (dy > 0 ? bounds.bottom - cy : cy - bounds.top) / Math.abs(dy);
  return Math.min(horizontalLimit, verticalLimit);
}

function normalizedCentralCoreRadius(phase) {
  const cyclePhase = opticalCycle(phase) * TAU;
  return (0.050 + Math.sin(cyclePhase) * 0.003) * (0.92 + 0.08 * Math.cos(cyclePhase));
}

function drawSpectralHalo(cx, cy, radius, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < WET_HALO_LAYERS.length; i++) {
    const layer = WET_HALO_LAYERS[i];
    const sprite = sprites.halo[i];
    stampSprite(sprite, radius * layer.scale / sprite.hw, alpha * layer.alpha);
  }
  ctx.restore();
}

function chromaEllipse(cx, cy, rot, alpha, loopIndex, unit) {
  const loop = CHROMATIC_LOOP_GROUPS[loopIndex];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.globalCompositeOperation = 'screen';
  drawSpectralHalo(0, 0, Math.max(W * loop.rx, H * loop.ry) * unit * 1.48, alpha);
  stampRainbowRing(sprites.chromaRings[loopIndex], unit, alpha * 0.74);
  ctx.restore();
}

// Squared cosine retains the old 0.10..1 range and pi-period frequency without abs(cos)'s cusps.
function foldingBandCompression(fold) {
  return 0.10 + 0.90 * Math.cos(fold) ** 2;
}

function foldingBandCompressionDerivative(fold) {
  return -0.90 * Math.sin(fold * 2);
}

function foldingBandGeometry(rx, ry, width, foldPhase, deform) {
  const count = miniFoldingBandGeometry(rx, ry, width, foldPhase, deform);
  const { leftX, leftY, rightX, rightY, front } = miniFoldingBandPoints;
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({ left: [leftX[i], leftY[i]], right: [rightX[i], rightY[i]], front: front[i] });
  }
  return points;
}

// Band motion circuit, taken from two reference clips. Each band is a closed ribbon ring that loops
// through this circuit every BAND_CIRCUIT_SECONDS: fully expanded, both rings face the viewer almost
// flat, the inner one nested inside the outer one (a target); contracting, each tilts and turns over
// on its own axis into an ellipse (the two bands, on different axes, cross like an atom), then they
// expand back and nest again. Meanwhile the twist that
// travels along the ribbon grows and fades (stretches turning edge-on almost vanish, so the ring
// looks cut into pieces) and the ring's axis precesses. Every motion runs at constant speed, with no
// easing or rebound:
// - precession (roll) and the travelling twist advance at a constant angular rate;
// - the main turn is about the vertical axis (flip), like a spinning coin, as in the anime reference
//   (E:/Anime/Files/TGIRPLuo_LdiFOSy.mp4 ~1:05.5-1:07.5): each ring closes into a tall, narrow,
//   nearly edge-on oval and opens back face-on, the inner one ahead of the outer one;
// - contraction/expansion is a triangle wave: the turn (flip) is linear in it. Do not make the
//   visible width cos(flip) linear instead: acos near 1 has an infinite slope, so the ring would
//   whip out of the face-on pose. The small tilt about the horizontal axis keeps its height linear
//   (its rest height is below 1, so its slope stays finite);
// - torsion is a triangle wave too, a quarter circuit ahead of the contraction.
// A face-on ring is a circle, so the precession never breaks the nested pose.
// Tilt (about the screen x axis) at full contraction; small, so the closed ring is a tall oval.
const BAND_ELLIPSE_TILT = 0.35;

const BAND_REST_DEFORM = { flip: 0, tilt: 0, roll: 0, bend: 0, bendAngle: 0, lean: 0, twistAmp: 0, travel: 0 };

// 0 at u = 0, 1 at u = 0.5, back to 0 at u = 1; constant slope.
// Near each turnaround (0 and 1) the straight slope is replaced by a parabola over
// BAND_TURNAROUND_FRACTION of the range, so the motion slows into the reversal instead of flipping
// direction in one frame (the whip at the start of every circuit); the rest stays linear.
function bandTriangleWave(u) {
  const f = u - Math.floor(u);
  const t = 1 - Math.abs(2 * f - 1);
  const k = BAND_TURNAROUND_FRACTION;
  if (k <= 0) return t;
  let g;
  if (t < k) g = k / 2 + (t * t) / (2 * k);
  else if (t > 1 - k) g = 1 - k / 2 - ((1 - t) * (1 - t)) / (2 * k);
  else g = t;
  return (g - k / 2) / (1 - k);
}

function rubberBandDeformation(phase, spin, band) {
  // progress (phase / TAU) counts base repetitions of ANIMATION_CYCLE_DURATION seconds (main.js).
  const seconds = (phase / TAU) * ANIMATION_CYCLE_DURATION;
  const cycles = seconds / BAND_CIRCUIT_SECONDS;
  const strength = RUBBER_BAND_DEFORM_STRENGTH;
  const direction = spin < 0 ? -1 : 1;

  const contraction = bandTriangleWave(cycles + band.lead);
  const torsion = bandTriangleWave(cycles + band.lead + 0.25);
  // Visible height goes linearly from the nested pose's (band.tilt, nearly flat) to the ellipse's
  // and back.
  const restHeight = Math.cos(band.tilt);
  const height = restHeight + (Math.cos(BAND_ELLIPSE_TILT) - restHeight) * contraction;
  const tiltSign = band.tilt < 0 ? -1 : 1;
  // Travelling twist: face-on and edge-on stretches run along the ribbon.
  const travel = direction * TAU * cycles * 1.5 + band.offset;
  return {
    flip: band.restFlip * contraction,
    tilt: tiltSign * Math.acos(height),
    roll: band.precess * cycles,
    bend: band.bend * strength * (0.45 + 0.55 * torsion),
    bendAngle: travel * 0.5,
    lean: band.lean,
    twistAmp: band.twistAmp * (0.6 + 0.9 * strength * torsion),
    travel,
  };
}

function fillFoldingBandGeometry(g, points, fillStyle) {
  g.fillStyle = fillStyle;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    g.beginPath();
    g.moveTo(a.left[0], a.left[1]);
    g.lineTo(b.left[0], b.left[1]);
    g.lineTo(b.right[0], b.right[1]);
    g.lineTo(a.right[0], a.right[1]);
    g.closePath();
    g.fill();
  }
}

// Linux mini optimization begin (O2b): mini built ~250 rgba(...) template strings per frame (144 band
// edges, 70 sphere fills/strokes, 32 orbit blocks, 3 glow strokes), each parsed by Canvas2D and left to
// the garbage collector. Mini rounds each alpha to the nearest 0.001 (error <= 0.0005, below the 1/255 step
// of an 8-bit alpha; clamped to 0..1 as CSS does) and takes the string from a per-colour table filled on
// first use, so a steady frame builds no colour string. An alpha that is already a multiple of 0.001 (the
// glow strokes' 0.52 and 0.22) yields the reference string unchanged.
const MINI_RGBA_ALPHA_STEPS = 1000;

function miniRgbaTable(rgb) {
  return { rgb, strings: new Array(MINI_RGBA_ALPHA_STEPS + 1).fill(null) };
}

function miniRgbaString(rgb, step) {
  return `rgba(${rgb},${step / MINI_RGBA_ALPHA_STEPS})`;
}

function miniRgba(table, alpha) {
  const step = alpha >= 1 ? MINI_RGBA_ALPHA_STEPS : alpha > 0 ? Math.round(alpha * MINI_RGBA_ALPHA_STEPS) : 0;
  let value = table.strings[step];
  if (value === null) value = table.strings[step] = miniRgbaString(table.rgb, step);
  return value;
}

const MINI_BAND_EDGE_RGBA = miniRgbaTable('18,36,44');
const MINI_SPHERE_WHITE_RGBA = miniRgbaTable('255,255,255');
const MINI_SPHERE_OUTLINE_RGBA = miniRgbaTable('218,250,255');
const MINI_ORBIT_BLOCK_RGBA = miniRgbaTable('255,252,238');
const MINI_CENTRAL_RAY_RGBA = miniRgbaTable(CENTRAL_RAY_STROKE_COLOR);
// Linux mini optimization end.
// Linux mini optimization begin (B5): the wallpaper runs the O2 scratch-buffer layers below too (their
// `Mini` prefix is historical). It keeps the reference colour strings, built by the reference template
// literal from the exact alpha: the O2b rounding is mini-only.
function layerRgba(table, alpha) {
  return isMiniVariant ? miniRgba(table, alpha) : `rgba(${table.rgb},${alpha})`;
}
// Linux mini optimization end.
// Linux mini optimization begin (O2): foldingBandGeometry allocates one object and two arrays per point
// (3 bands x 49 points per frame). Mini writes the same points, computed with the same expressions in
// the same order, into reused Float64Arrays (sized for the 84-segment maximum; the per-segment angle's
// cosine and sine are cached per segment count, the identical Math.cos/Math.sin results).
// O2b (accepted visual change, mini only): the reference fills each of the 48 white quads separately,
// interleaved with its dark edge stroke. Mini adds the same quads, with the same vertices in the same
// order, as subpaths of one path filled once (nonzero; every quad has the same winding, so overlaps
// stay covered), then draws the per-segment edge strokes and the shadowed outline exactly as before,
// with the edge colours from the O2b alpha tables. Differences: shared quad edges no longer show the
// faint anti-aliasing seam of two partial coverages, and the inner half of each edge stroke's round cap,
// which the next quad's fill used to paint over, now stays visible (a sub-pixel darker dot per joint).
const MINI_FOLDING_BAND_MAX_POINTS = 85;
const miniFoldingBandPoints = {
  angle: new Float64Array(MINI_FOLDING_BAND_MAX_POINTS),
  leftX: new Float64Array(MINI_FOLDING_BAND_MAX_POINTS),
  leftY: new Float64Array(MINI_FOLDING_BAND_MAX_POINTS),
  rightX: new Float64Array(MINI_FOLDING_BAND_MAX_POINTS),
  rightY: new Float64Array(MINI_FOLDING_BAND_MAX_POINTS),
  front: new Float64Array(MINI_FOLDING_BAND_MAX_POINTS),
  // Signed facing: > 0 = the ribbon's outer face looks at the viewer, < 0 = its inner face.
  facing: new Float64Array(MINI_FOLDING_BAND_MAX_POINTS),
  // View depth of the centreline (> 0 = nearer the viewer than the ring's centre).
  depth: new Float64Array(MINI_FOLDING_BAND_MAX_POINTS),
};

// Fills miniFoldingBandPoints with the band edges; returns the point count. In the ring's own frame
// the centreline is the ellipse lifted into a saddle (bend), and the ribbon's cross direction mixes
// the outward normal and the ring axis by lean + twistAmp * sin(2a + foldPhase - travel) (0 = flat,
// pi / 2 = upright), a twist that travels along the ribbon. The ring is then turned over (flip,
// about the screen y axis), tilted (about x), rolled in the screen plane (roll, the precession) and
// projected with perspective.
function miniFoldingBandGeometry(rx, ry, width, foldPhase, deform) {
  const segmentCount = Math.max(48, Math.min(84, Math.round(Math.min(W, H) * 0.075)));
  const p = miniFoldingBandPoints;
  const d = deform || BAND_REST_DEFORM;
  const radius = Math.max(rx, ry);
  const bend = radius * d.bend;
  const cosFlip = Math.cos(d.flip);
  const sinFlip = Math.sin(d.flip);
  const cosTilt = Math.cos(d.tilt);
  const sinTilt = Math.sin(d.tilt);
  const cosRoll = Math.cos(d.roll);
  const sinRoll = Math.sin(d.roll);
  const focal = radius * 2.8;
  // Ring frame -> view: flip about y, then tilt about x. Returns [x, y, z].
  const turn = (x, y, z) => {
    const fx = x * cosFlip + z * sinFlip;
    const fz = -x * sinFlip + z * cosFlip;
    return [fx, y * cosTilt - fz * sinTilt, y * sinTilt + fz * cosTilt];
  };
  // Roll in the screen plane (it leaves the view depth unchanged), then perspective.
  const project = (v) => {
    const scale = focal / (focal - v[2]);
    return [(v[0] * cosRoll - v[1] * sinRoll) * scale, (v[0] * sinRoll + v[1] * cosRoll) * scale];
  };
  for (let i = 0; i <= segmentCount; i++) {
    const a = (i / segmentCount) * TAU;
    p.angle[i] = a;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const saddle = 2 * (a - d.bendAngle);
    const x = ca * rx;
    const y = sa * ry;
    const z = bend * Math.cos(saddle);
    // Outward normal of the base ellipse (ry cos a, rx sin a), normalised.
    const nLen = Math.hypot(ca * ry, sa * rx) || 1;
    const nx = (ca * ry) / nLen;
    const ny = (sa * rx) / nLen;
    const twist = d.lean + d.twistAmp * Math.sin(2 * a + foldPhase - d.travel);
    const bx = nx * Math.cos(twist);
    const by = ny * Math.cos(twist);
    const bz = Math.sin(twist);
    const left = project(turn(x + bx * width, y + by * width, z + bz * width));
    const right = project(turn(x - bx * width, y - by * width, z - bz * width));
    p.leftX[i] = left[0];
    p.leftY[i] = left[1];
    p.rightX[i] = right[0];
    p.rightY[i] = right[1];
    // Facing: the view z of the ribbon surface normal (tangent x cross direction). 1 = the wide face
    // looks at the viewer, 0 = seen edge-on (darker edge strokes).
    const tx = -sa * rx;
    const ty = ca * ry;
    const tz = -2 * bend * Math.sin(saddle);
    const n = turn(ty * bz - tz * by, tz * bx - tx * bz, tx * by - ty * bx);
    p.facing[i] = n[2] / (Math.hypot(n[0], n[1], n[2]) || 1);
    p.front[i] = Math.abs(p.facing[i]);
    p.depth[i] = turn(x, y, z)[2];
  }
  return segmentCount + 1;
}

// Ribbon fill for a segment with signed facing f (see miniFoldingBandPoints.facing): the outer face
// is near white and brightest when it faces the viewer; the inner face is a cooler, shaded grey, so
// the ring reads as a solid strip with two sides. Around f = 0 (the ribbon turning edge-on, where
// one face gives way to the other) the two colours blend over BAND_FACE_BLEND, so there is no seam.
// Quantised over f and cached, so a steady frame builds no colour strings.
const BAND_FACE_STEPS = 48;
const BAND_FACE_BLEND = 0.45;
const BAND_FACE_BASE_FILL = 'rgb(214,222,230)';
const bandFaceFills = new Array(2 * BAND_FACE_STEPS + 1).fill(null);
function bandFaceFill(f) {
  const step = Math.round(Math.max(-1, Math.min(1, f)) * BAND_FACE_STEPS);
  const index = step + BAND_FACE_STEPS;
  let fill = bandFaceFills[index];
  if (fill === null) {
    const q = step / BAND_FACE_STEPS;
    const k = Math.abs(q);
    const outerLevel = 0.86 + 0.14 * k;
    const innerLevel = 0.72 + 0.14 * k;
    const t = smoothstep(-BAND_FACE_BLEND, BAND_FACE_BLEND, q);
    const r = mix(innerLevel * 0.92, outerLevel, t);
    const g = mix(innerLevel * 0.96, outerLevel, t);
    const b = mix(innerLevel, outerLevel, t);
    fill = bandFaceFills[index] = `rgb(${Math.round(255 * r)},${Math.round(255 * g)},${Math.round(255 * b)})`;
  }
  return fill;
}

function drawMiniFoldingBand(cx, cy, rx, ry, rot, width, foldPhase, deform) {
  const count = miniFoldingBandGeometry(rx, ry, width, foldPhase, deform);
  const { leftX, leftY, rightX, rightY, front, facing } = miniFoldingBandPoints;
  const segmentLineWidth = Math.max(structurePx(0.75, 0.4), width * 0.045);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The mini fills the whole band once in white; the wallpaper lays the same single fill in a mid
  // band shade first, so the anti-aliased seams between its separately shaded quads show band
  // colour instead of the dark background (they read as faint lines across the ribbon otherwise).
  {
    ctx.fillStyle = isMiniVariant ? 'rgb(255,255,255)' : BAND_FACE_BASE_FILL;
    ctx.beginPath();
    for (let i = 0; i < count - 1; i++) {
      ctx.moveTo(leftX[i], leftY[i]);
      ctx.lineTo(leftX[i + 1], leftY[i + 1]);
      ctx.lineTo(rightX[i + 1], rightY[i + 1]);
      ctx.lineTo(rightX[i], rightY[i]);
      ctx.closePath();
    }
    ctx.fill();
  }

  for (let i = 0; i < count - 1; i++) {
    const segmentFront = (front[i] + front[i + 1]) * 0.5;
    // B5: the wallpaper keeps the reference order, each quad filled right before its edge stroke,
    // shaded by which face it shows (bandFaceFill); the mini keeps its single white fill.
    if (!isMiniVariant) {
      ctx.fillStyle = bandFaceFill((facing[i] + facing[i + 1]) * 0.5);
      ctx.beginPath();
      ctx.moveTo(leftX[i], leftY[i]);
      ctx.lineTo(leftX[i + 1], leftY[i + 1]);
      ctx.lineTo(rightX[i + 1], rightY[i + 1]);
      ctx.lineTo(rightX[i], rightY[i]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = layerRgba(MINI_BAND_EDGE_RGBA, 0.08 + (1 - segmentFront) * 0.22);
    ctx.lineWidth = segmentLineWidth;
    ctx.beginPath();
    ctx.moveTo(rightX[i], rightY[i]);
    ctx.lineTo(rightX[i + 1], rightY[i + 1]);
    ctx.stroke();
  }

  // PERF-5: the wallpaper stamps the outline's baked shadow along its segments (butt caps: the
  // closed outline has no caps, and butt-capped slices tile into the shadow of the joined polyline).
  const outlineWidth = Math.max(structurePx(1.15, 0.5), width * 0.11);
  const outlineGlow = isMiniVariant ? null
    : wallpaperLineGlow(outlineWidth, 'rgb(255,255,255)', 'butt', 'rgba(255,255,255,0.78)', structurePx(12, 1));
  if (outlineGlow) {
    const segmentCount = foldingBandOutlineSegments(count);
    stampWallpaperLineGlows(outlineGlow, wallpaperSegmentCoords, 0, segmentCount);
  } else {
    ctx.shadowColor = 'rgba(255,255,255,0.78)';
    ctx.shadowBlur = structurePx(12, 1);
  }
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = 'rgb(255,255,255)';
  ctx.beginPath();
  ctx.moveTo(leftX[0], leftY[0]);
  for (let i = 1; i < count; i++) ctx.lineTo(leftX[i], leftY[i]);
  ctx.moveTo(rightX[0], rightY[0]);
  for (let i = 1; i < count; i++) ctx.lineTo(rightX[i], rightY[i]);
  ctx.stroke();
  ctx.restore();
}

// The near half of a band: every segment whose centreline is nearer the viewer than the ring's
// centre, drawn again after the octagon and the prism (drawAtomicOrbitsFront), so a tilted ring
// passes in front of the centre on its near side and behind it on its far side. Same fill, edge
// strokes and glowing outline as drawMiniFoldingBand, without the bars across the cut ends.
function drawFoldingBandFront(cx, cy, rx, ry, rot, width, foldPhase, deform) {
  const count = miniFoldingBandGeometry(rx, ry, width, foldPhase, deform);
  const { leftX, leftY, rightX, rightY, front, facing, depth } = miniFoldingBandPoints;
  const near = (i) => depth[i] + depth[i + 1] > 0;
  let nearCount = 0;
  for (let i = 0; i < count - 1; i++) if (near(i)) nearCount++;
  if (nearCount === 0) return;
  const segmentLineWidth = Math.max(structurePx(0.75, 0.4), width * 0.045);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Same seam cover as drawMiniFoldingBand, over the near segments only.
  ctx.fillStyle = isMiniVariant ? 'rgb(255,255,255)' : BAND_FACE_BASE_FILL;
  ctx.beginPath();
  for (let i = 0; i < count - 1; i++) {
    if (!near(i)) continue;
    ctx.moveTo(leftX[i], leftY[i]);
    ctx.lineTo(leftX[i + 1], leftY[i + 1]);
    ctx.lineTo(rightX[i + 1], rightY[i + 1]);
    ctx.lineTo(rightX[i], rightY[i]);
    ctx.closePath();
  }
  ctx.fill();
  for (let i = 0; i < count - 1; i++) {
    if (!near(i)) continue;
    ctx.fillStyle = isMiniVariant ? 'rgb(255,255,255)' : bandFaceFill((facing[i] + facing[i + 1]) * 0.5);
    ctx.beginPath();
    ctx.moveTo(leftX[i], leftY[i]);
    ctx.lineTo(leftX[i + 1], leftY[i + 1]);
    ctx.lineTo(rightX[i + 1], rightY[i + 1]);
    ctx.lineTo(rightX[i], rightY[i]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = layerRgba(MINI_BAND_EDGE_RGBA, 0.08 + (1 - (front[i] + front[i + 1]) * 0.5) * 0.22);
    ctx.lineWidth = segmentLineWidth;
    ctx.beginPath();
    ctx.moveTo(rightX[i], rightY[i]);
    ctx.lineTo(rightX[i + 1], rightY[i + 1]);
    ctx.stroke();
  }

  const outlineWidth = Math.max(structurePx(1.15, 0.5), width * 0.11);
  const outlineGlow = isMiniVariant ? null
    : wallpaperLineGlow(outlineWidth, 'rgb(255,255,255)', 'butt', 'rgba(255,255,255,0.78)', structurePx(12, 1));
  if (outlineGlow) {
    const coords = wallpaperSegmentBuffer(2 * nearCount);
    let n = 0;
    for (let i = 0; i < count - 1; i++) {
      if (!near(i)) continue;
      let o = 4 * n++;
      coords[o] = leftX[i]; coords[o + 1] = leftY[i]; coords[o + 2] = leftX[i + 1]; coords[o + 3] = leftY[i + 1];
      o = 4 * n++;
      coords[o] = rightX[i]; coords[o + 1] = rightY[i]; coords[o + 2] = rightX[i + 1]; coords[o + 3] = rightY[i + 1];
    }
    stampWallpaperLineGlows(outlineGlow, wallpaperSegmentCoords, 0, n);
  } else {
    ctx.shadowColor = 'rgba(255,255,255,0.78)';
    ctx.shadowBlur = structurePx(12, 1);
  }
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = 'rgb(255,255,255)';
  ctx.beginPath();
  for (let i = 0; i < count - 1; i++) {
    if (!near(i)) continue;
    ctx.moveTo(leftX[i], leftY[i]);
    ctx.lineTo(leftX[i + 1], leftY[i + 1]);
    ctx.moveTo(rightX[i], rightY[i]);
    ctx.lineTo(rightX[i + 1], rightY[i + 1]);
  }
  ctx.stroke();
  ctx.restore();
}

// PERF-5: the band outline above as segments, into wallpaperSegmentBuffer: the left edge and the
// right edge, each a closed loop of its own. No bar joins them across the ribbon: on a shaded band a
// bright bar there showed as a stray line travelling with the ring.
function foldingBandOutlineSegments(count) {
  const { leftX, leftY, rightX, rightY } = miniFoldingBandPoints;
  const coords = wallpaperSegmentBuffer(2 * count);
  let n = 0;
  const push = (x1, y1, x2, y2) => {
    const o = 4 * n++;
    coords[o] = x1;
    coords[o + 1] = y1;
    coords[o + 2] = x2;
    coords[o + 3] = y2;
  };
  for (let i = 0; i < count - 1; i++) push(leftX[i], leftY[i], leftX[i + 1], leftY[i + 1]);
  for (let i = 0; i < count - 1; i++) push(rightX[i], rightY[i], rightX[i + 1], rightY[i + 1]);
  return n;
}

// Linux mini optimization end.
function drawFoldingBand(cx, cy, rx, ry, rot, width, foldPhase, deform) {
  // Linux mini optimization begin (O2): see drawMiniFoldingBand (B5: the wallpaper too, so the reference
  // body below is kept only as the CielWin text it replaces).
  drawMiniFoldingBand(cx, cy, rx, ry, rot, width, foldPhase, deform);
  return;
  // Linux mini optimization end.
  const points = foldingBandGeometry(rx, ry, width, foldPhase, deform);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const front = (a.front + b.front) * 0.5;
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.beginPath();
    ctx.moveTo(a.left[0], a.left[1]);
    ctx.lineTo(b.left[0], b.left[1]);
    ctx.lineTo(b.right[0], b.right[1]);
    ctx.lineTo(a.right[0], a.right[1]);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(18,36,44,${0.08 + (1 - front) * 0.22})`;
    ctx.lineWidth = Math.max(structurePx(0.75, 0.4), width * 0.045);
    ctx.beginPath();
    ctx.moveTo(a.right[0], a.right[1]);
    ctx.lineTo(b.right[0], b.right[1]);
    ctx.stroke();
  }

  ctx.shadowColor = 'rgba(255,255,255,0.78)';
  ctx.shadowBlur = structurePx(12, 1);
  ctx.lineWidth = Math.max(structurePx(1.15, 0.5), width * 0.11);
  ctx.strokeStyle = 'rgb(255,255,255)';
  ctx.beginPath();
  ctx.moveTo(points[0].left[0], points[0].left[1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].left[0], points[i].left[1]);
  for (let i = 0; i < points.length; i++) ctx.lineTo(points[i].right[0], points[i].right[1]);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function auroraState(cx, cy, phase, b) {
  const cyclePhase = opticalCycle(phase) * TAU;
  const angle = b.a + cyclePhase + Math.sin(cyclePhase + b.phase) * 0.20;
  const depth = 0.5 + 0.5 * Math.sin(cyclePhase + b.phase);
  const radialDistance = b.orbit * (0.68 + depth * 0.44);
  return {
    x: cx + Math.cos(angle) * W * radialDistance,
    y: cy + Math.sin(angle) * H * radialDistance * 0.92,
    rx: W * b.rx * (0.72 + depth * 0.48),
    ry: H * b.ry * (0.72 + depth * 0.48),
    rotation: angle * 0.16,
    color: b.green ? AURORA_GREEN : AURORA_BLUE,
    alpha: b.alpha * (0.68 + depth * 0.58),
  };
}

function softOvalViewportAxes(width = W, height = H) {
  const cappedAspect = Math.min(
    SOFT_OVAL_VIEWPORT_AXIS_STRETCH_CAP,
    Math.max(1 / SOFT_OVAL_VIEWPORT_AXIS_STRETCH_CAP, width / height)
  );
  const sharedViewportSize = Math.sqrt(width * height);
  return {
    x: sharedViewportSize * Math.sqrt(cappedAspect),
    y: sharedViewportSize / Math.sqrt(cappedAspect),
  };
}

function softOvalFieldState(cx, cy, phase, field) {
  const cyclePhase = opticalCycle(phase) * TAU;
  const orbit = cyclePhase + field.phase;
  const breath = 0.5 + 0.5 * Math.sin(orbit);
  const scale = Math.max(0.2, 0.99 + (breath - 0.5) * 0.30 * SOFT_OVAL_BREATH_FACTOR);
  const viewportAxes = softOvalViewportAxes();
  return {
    x: cx + W * (field.x - 0.505) + Math.cos(orbit) * W * field.orbitX * SOFT_OVAL_MOTION_FACTOR,
    y: cy + H * (field.y - 0.515) + Math.sin(orbit) * H * field.orbitY * SOFT_OVAL_MOTION_FACTOR,
    rx: viewportAxes.x * field.rx * SOFT_OVAL_SIZE_FACTOR * scale,
    ry: viewportAxes.y * field.ry * SOFT_OVAL_SIZE_FACTOR * scale,
    rotation: field.rotation + Math.sin(orbit) * 0.12 * SOFT_OVAL_MOTION_FACTOR,
    alpha: field.alpha * (0.62 + breath * 0.46),
    color: field.color,
    blur: field.blur,
    scale,
  };
}

function drawSoftOvalField(field, sprite) {
  ctx.save();
  ctx.translate(field.x, field.y);
  ctx.rotate(field.rotation);
  ctx.globalCompositeOperation = 'screen';
  const visibleAlpha = Math.min(
    field.alpha * SOFT_OVAL_VISIBLE_ALPHA_MULTIPLIER,
    SOFT_OVAL_VISIBLE_ALPHA_CAP
  );
  stampSprite(sprite, field.scale, visibleAlpha);
  ctx.restore();
}

function drawSoftOvalFields(cx, cy, phase) {
  SOFT_OVAL_FIELDS.forEach((field, index) => {
    drawSoftOvalField(softOvalFieldState(cx, cy, phase, field), sprites.softOvals[index]);
  });
}

function fillCircle(x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

// Linux mini optimization begin (T1): completed seeded descriptors are operationally immutable (not
// frozen). Cache full-precision directions after scene-data's RNG stream is complete. C1 adds only
// the ordered CSS-size prefixes to existing star records; streak directions remain size-independent.
const starDirections = stars.map(s => ({ cos: Math.cos(s.a), sin: Math.sin(s.a), xPrefix: 0, yPrefix: 0 }));
const radialStreakDirections = radialStreaks.map(s => ({ cos: Math.cos(s.a), sin: Math.sin(s.a) }));
let starPrefixWidth, starPrefixHeight;

function drawCachedStars(cx, cy, p, phase) {
  // Refresh lazily in place for the current CSS dimensions, never DPR or a history of sizes.
  if (!Object.is(starPrefixWidth, W) || !Object.is(starPrefixHeight, H)) {
    for (const direction of starDirections) {
      direction.xPrefix = direction.cos * W * 0.77;
      direction.yPrefix = direction.sin * H * 0.91;
    }
    starPrefixWidth = W;
    starPrefixHeight = H;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const direction = starDirections[i];
    const z = fract(s.z + p * s.speed * 0.24 * BACKGROUND_PARTICLE_SPEED_MULTIPLIER);
    const d = 0.018 + Math.pow(z, 1.82) * 1.18;
    const x = cx + direction.xPrefix * d * s.lane;
    const y = cy + direction.yPrefix * d;
    const tw = 0.32 + 0.68 * Math.sin(phase * 1.5 + s.twinkle) ** 2;
    const alpha = (0.08 + z * 0.78) * tw;
    const r = s.r * (0.42 + z * 1.38) * BACKGROUND_PARTICLE_SIZE_MULTIPLIER;
    const color = s.warm ? '255,246,192' : '238,250,255';
    ctx.fillStyle = `rgba(${color},${alpha})`;
    fillCircle(x, y, r);
    if (s.glint && z > 0.52) {
      const offset = (0.8 + z * 1.5) * BACKGROUND_PARTICLE_SIZE_MULTIPLIER;
      ctx.fillStyle = `rgba(58,220,255,${alpha * 0.48})`;
      fillCircle(x - offset, y, r);
      ctx.fillStyle = `rgba(255,86,158,${alpha * 0.42})`;
      fillCircle(x + offset, y, r);
    }
  }
  ctx.restore();
}
// Linux mini optimization end.
function drawStars(cx, cy, p, phase) {
  // Linux mini optimization begin (T1): retain the unmodified CielWin body for reference stripping.
  drawCachedStars(cx, cy, p, phase);
  return;
  // Linux mini optimization end.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const s of stars) {
    const z = fract(s.z + p * s.speed * 0.24 * BACKGROUND_PARTICLE_SPEED_MULTIPLIER);
    const d = 0.018 + Math.pow(z, 1.82) * 1.18;
    const x = cx + Math.cos(s.a) * W * 0.77 * d * s.lane;
    const y = cy + Math.sin(s.a) * H * 0.91 * d;
    const tw = 0.32 + 0.68 * Math.sin(phase * 1.5 + s.twinkle) ** 2;
    const alpha = (0.08 + z * 0.78) * tw;
    const r = s.r * (0.42 + z * 1.38) * BACKGROUND_PARTICLE_SIZE_MULTIPLIER;
    const color = s.warm ? '255,246,192' : '238,250,255';
    ctx.fillStyle = `rgba(${color},${alpha})`;
    fillCircle(x, y, r);
    if (s.glint && z > 0.52) {
      const offset = (0.8 + z * 1.5) * BACKGROUND_PARTICLE_SIZE_MULTIPLIER;
      ctx.fillStyle = `rgba(58,220,255,${alpha * 0.48})`;
      fillCircle(x - offset, y, r);
      ctx.fillStyle = `rgba(255,86,158,${alpha * 0.42})`;
      fillCircle(x + offset, y, r);
    }
  }
  ctx.restore();
}


function perspectiveRayAngle(phase, ray, speed = FOREGROUND_INCLINED_RAY_SPEED) {
  return ray.angularOffset + phase * ray.angularSpeed * speed;
}

function perspectiveRayDirection(phase, ray, speed = FOREGROUND_INCLINED_RAY_SPEED) {
  const angle = perspectiveRayAngle(phase, ray, speed);
  // Foreshorten the vertical axis as a 45–60° plane would project onto the screen.
  return [Math.cos(angle), Math.sin(angle) * Math.sin(ray.inclination)];
}

function perspectiveRayEndpoint(cx, cy, phase, ray, width = W, height = H, zoom = viewZoom, speed = FOREGROUND_INCLINED_RAY_SPEED) {
  const [dx, dy] = perspectiveRayDirection(phase, ray, speed);
  const length = firstRayBoundaryLength(cx, cy, dx, dy, visibleCanvasBounds(cx, cy, width, height, zoom));
  return [cx + dx * length, cy + dy * length];
}

function perspectiveRayStart(cx, cy, phase, ray, speed = FOREGROUND_INCLINED_RAY_SPEED) {
  const [dx, dy] = perspectiveRayDirection(phase, ray, speed);
  const innerRadius = Math.min(W, H) * normalizedCentralCoreRadius(phase) * CENTRAL_CORE_RAY_INNER_RADIUS_FACTOR;
  return [cx + dx * innerRadius, cy + dy * innerRadius];
}

// Linux mini optimization begin (O2): the 48 perspective rays and the 18 core spokes allocated ~8 arrays
// or objects per ray and frame (direction pairs, start/end pairs, visible bounds, segment, slice). Mini
// writes the same segment coordinates, from the same expressions, into one reused Float64Array and
// replays drawGlowSegments' exact call stream from it. Frame constants (visible bounds, inner radius)
// are computed once per frame with the identical expressions. O2b: the stroke colour comes from the
// alpha table (the constant 0.52 and 0.22 alphas give the reference strings).
const miniGlowSegmentCoords = new Float64Array(4 * Math.max(FOREGROUND_INCLINED_RAY_COUNT,
  CENTRAL_CORE_PROMINENT_RAY_COUNT + CENTRAL_CORE_MINOR_RAY_COUNT, 1));
const miniVisibleBounds = { left: 0, right: 0, top: 0, bottom: 0 };

// drawGlowSegments over segments [start, end) of miniGlowSegmentCoords.
function drawMiniGlowSegments(start, end, width, alpha, blur = 8) {
  if (end - start === 0) return;
  const coords = miniGlowSegmentCoords;
  const strokeStyle = layerRgba(MINI_CENTRAL_RAY_RGBA, alpha);
  const lineWidth = structurePx(width, 0.5);
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  // PERF-5: the wallpaper stamps every segment's baked shadow (sprites.js, wallpaperLineGlow) and
  // strokes the segments unshadowed; mini keeps the shadowed stroke.
  const glow = isMiniVariant ? null
    : wallpaperLineGlow(lineWidth, strokeStyle, 'round', CENTRAL_RAY_GLOW_COLOR, structurePx(blur, 1));
  if (glow) {
    stampWallpaperLineGlows(glow, coords, start, end);
  } else {
    ctx.shadowColor = CENTRAL_RAY_GLOW_COLOR;
    ctx.shadowBlur = structurePx(blur, 1);
  }
  ctx.beginPath();
  for (let i = start; i < end; i++) {
    const o = i * 4;
    ctx.moveTo(coords[o], coords[o + 1]);
    ctx.lineTo(coords[o + 2], coords[o + 3]);
  }
  ctx.stroke();
  ctx.restore();
}

function drawMiniPerspectiveRays(cx, cy, phase) {
  const coords = miniGlowSegmentCoords;
  const speed = FOREGROUND_INCLINED_RAY_SPEED;
  const innerRadius = Math.min(W, H) * normalizedCentralCoreRadius(phase) * CENTRAL_CORE_RAY_INNER_RADIUS_FACTOR;
  const bounds = miniVisibleBounds;
  // visibleCanvasBounds(cx, cy, W, H, viewZoom)
  bounds.left = cx - cx / viewZoom;
  bounds.right = cx + (W - cx) / viewZoom;
  bounds.top = cy - cy / viewZoom;
  bounds.bottom = cy + (H - cy) / viewZoom;
  const count = PERSPECTIVE_RAYS.length;
  for (let i = 0; i < count; i++) {
    const ray = PERSPECTIVE_RAYS[i];
    // perspectiveRayDirection(phase, ray, speed)
    const angle = perspectiveRayAngle(phase, ray, speed);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle) * Math.sin(ray.inclination);
    const length = firstRayBoundaryLength(cx, cy, dx, dy, bounds);
    const o = i * 4;
    coords[o] = cx + dx * innerRadius;
    coords[o + 1] = cy + dy * innerRadius;
    coords[o + 2] = cx + dx * length;
    coords[o + 3] = cy + dy * length;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let start = 0; start < count; start += FOREGROUND_INCLINED_RAY_BATCH_SIZE) {
    drawMiniGlowSegments(start, Math.min(count, start + FOREGROUND_INCLINED_RAY_BATCH_SIZE), CENTRAL_RAY_LINE_WIDTH, CENTRAL_RAY_OPACITY, CENTRAL_RAY_GLOW_BLUR);
  }
  ctx.restore();
}

// Linux mini optimization end.
function drawPerspectiveRays(cx, cy, phase) {
  // Linux mini optimization begin (O2): see drawMiniPerspectiveRays (B5: the wallpaper too, so the
  // reference body below is kept only as the CielWin text it replaces).
  drawMiniPerspectiveRays(cx, cy, phase);
  return;
  // Linux mini optimization end.
  const segments = PERSPECTIVE_RAYS.map((ray) => {
    const [x1, y1] = perspectiveRayStart(cx, cy, phase, ray);
    const [x2, y2] = perspectiveRayEndpoint(cx, cy, phase, ray);
    return [x1, y1, x2, y2];
  });
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let start = 0; start < segments.length; start += FOREGROUND_INCLINED_RAY_BATCH_SIZE) {
    drawGlowSegments(segments.slice(start, start + FOREGROUND_INCLINED_RAY_BATCH_SIZE), CENTRAL_RAY_LINE_WIDTH, CENTRAL_RAY_OPACITY, CENTRAL_RAY_GLOW_BLUR);
  }
  ctx.restore();
}

// Linux mini optimization begin (T1): same drawing stream, using only cached angle operands.
function drawCachedRadialStreaks(cx, cy, p) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  for (let i = 0; i < radialStreaks.length; i++) {
    const s = radialStreaks[i];
    const z = fract(s.z + p * s.speed * 0.64);
    if (z < 0.72) continue;
    const direction = radialStreakDirections[i];
    const z0 = Math.max(0, z - 0.022 - s.speed * 0.014);
    const d1 = Math.pow(z, 2.18) * s.lane;
    const d0 = Math.pow(z0, 2.18) * s.lane;
    const x1 = cx + direction.cos * W * 0.80 * d0;
    const y1 = cy + direction.sin * H * 0.94 * d0;
    const x2 = cx + direction.cos * W * 0.80 * d1;
    const y2 = cy + direction.sin * H * 0.94 * d1;
    const width = s.width * RADIAL_STREAK_WIDTH_MULTIPLIER;
    const strokeAlpha = s.alpha * (z - 0.62) * 1.9;
    // Symmetric gradient: red tips, then yellow, green and blue at the stroke's centre.
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    for (const [stop, rgb] of RADIAL_STREAK_GRADIENT) {
      gradient.addColorStop(stop, `rgb(${rgb})`);
      gradient.addColorStop(1 - stop, `rgb(${rgb})`);
    }
    ctx.strokeStyle = gradient;
    for (const [widthScale, layerAlpha] of RADIAL_STREAK_SOFT_LAYERS) {
      ctx.globalAlpha = strokeAlpha * layerAlpha;
      ctx.lineWidth = width * widthScale;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
// Linux mini optimization end.
function drawRadialStreaks(cx, cy, p) {
  // Linux mini optimization begin (T1): retain the unmodified CielWin body for reference stripping.
  drawCachedRadialStreaks(cx, cy, p);
  return;
  // Linux mini optimization end.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  for (const s of radialStreaks) {
    const z = fract(s.z + p * s.speed * 0.64);
    if (z < 0.72) continue;
    const z0 = Math.max(0, z - 0.022 - s.speed * 0.014);
    const d1 = Math.pow(z, 2.18) * s.lane;
    const d0 = Math.pow(z0, 2.18) * s.lane;
    const x1 = cx + Math.cos(s.a) * W * 0.80 * d0;
    const y1 = cy + Math.sin(s.a) * H * 0.94 * d0;
    const x2 = cx + Math.cos(s.a) * W * 0.80 * d1;
    const y2 = cy + Math.sin(s.a) * H * 0.94 * d1;
    const width = s.width * RADIAL_STREAK_WIDTH_MULTIPLIER;
    const strokeAlpha = s.alpha * (z - 0.62) * 1.9;
    // Gradiente simétrico: rojo en las puntas, luego amarillo, verde y azul en el centro del trazo.
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    for (const [stop, rgb] of RADIAL_STREAK_GRADIENT) {
      gradient.addColorStop(stop, `rgb(${rgb})`);
      gradient.addColorStop(1 - stop, `rgb(${rgb})`);
    }
    ctx.strokeStyle = gradient;
    for (const [widthScale, layerAlpha] of RADIAL_STREAK_SOFT_LAYERS) {
      ctx.globalAlpha = strokeAlpha * layerAlpha;
      ctx.lineWidth = width * widthScale;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSpectralFlare(cx, cy, radius, alpha, phase, index) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'screen';
  drawSpectralHalo(0, 0, radius * 1.72, alpha);
  stampSprite(sprites.flareBodies[index], 1, alpha);
  ctx.rotate(phase * 0.05);
  stampRainbowRing(sprites.flareRings[index], 1, alpha * 0.82);
  ctx.restore();
}

function spectralFlareState(cx, phase, index) {
  const flare = SPECTRAL_FLARES[index];
  const orbit = (opticalCycle(phase) + flare.orbitPhase) * TAU;
  return {
    x: cx + W * (flare.x - 0.505) + Math.cos(orbit) * W * flare.orbitX,
    y: H * flare.y + Math.sin(orbit) * H * flare.orbitY,
    radius: W * flare.radius,
    alpha: flare.alpha * opticalEnvelope(phase, flare.stagger),
    rotation: phase + flare.orbitPhase * TAU,
  };
}

function drawLensFlares(cx, cy, phase) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < SPECTRAL_FLARES.length; i++) {
    // Círculo cromático derecho (SPECTRAL_FLARES[0], x: 0.775) oculto. Borrá esta línea para mostrarlo de nuevo.
    if (i === 0) continue;
    const flare = spectralFlareState(cx, phase, i);
    drawSpectralFlare(flare.x, flare.y, flare.radius, flare.alpha, flare.rotation, i);
  }
  ctx.restore();
}

function chromaticLoopState(phase, index) {
  const loop = CHROMATIC_LOOP_GROUPS[index];
  const cycle = opticalCycle(phase);
  const orbit = (cycle + loop.stagger) * TAU;
  const depth = 0.5 + 0.5 * Math.sin(orbit + loop.depthPhase);
  const orbitScale = 0.98 + depth * 0.10;
  const ellipseScale = 0.74 + depth * 0.46;
  const selfRotation = Math.sin(cycle * Math.PI) * CHROMATIC_SELF_ROTATION * loop.spinDirection;
  return {
    x: W * 0.5 + Math.cos(orbit) * W * loop.orbitX * orbitScale,
    y: H * 0.5 + Math.sin(orbit) * H * loop.orbitY * orbitScale,
    rx: W * loop.rx * ellipseScale,
    ry: H * loop.ry * ellipseScale,
    rot: loop.rot + Math.sin(orbit) * 0.045 + selfRotation,
    alpha: loop.alpha * (0.56 + depth * 0.44),
    diffusion: 8 + depth * 11,
    orbitScale,
    selfRotation,
  };
}

function drawChromaticSideLoops(phase) {
  for (let i = 0; i < CHROMATIC_LOOP_GROUPS.length; i++) {
    const loop = CHROMATIC_LOOP_GROUPS[i];
    const state = chromaticLoopState(phase, i);
    chromaEllipse(state.x, state.y, state.rot, state.alpha, i, state.rx / (W * loop.rx));
  }
}

function segmentedSpherePieceDimensions(descriptor, minD, projectedDepth = descriptor.projectedDepth) {
  const depthScale = 0.86 + (projectedDepth + 1) * 0.10;
  const styleScale = descriptor.style === 'solid-square' ? SOLID_SQUARE_SIZE_MULTIPLIER : 1;
  const width = minD * SEGMENTED_SPHERE_BASE_WIDTH * descriptor.sizeVariation * depthScale * styleScale;
  return {
    width,
    height: descriptor.style === 'solid-square' ? width : width / SPHERE_RECTANGLE_ASPECT_RATIO,
  };
}

function drawSolidSquareSpherePiece(x, y, dimensions, state) {
  const fillAlpha = (SOLID_SQUARE_SPHERE_ALPHA - state.travel * 0.10) * state.depthAlpha;
  const strokeAlpha = SOLID_SQUARE_SPHERE_STROKE_ALPHA * state.depthAlpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.rotation);
  stampGlow('solid-fill', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * fillAlpha);
  stampGlow('solid-stroke', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * strokeAlpha);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(255,255,255,${fillAlpha})`;
  ctx.fillRect(-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
  ctx.strokeStyle = `rgba(255,255,255,${strokeAlpha})`;
  ctx.lineWidth = structurePx(1.0, 0.5);
  ctx.strokeRect(-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
  ctx.restore();
}

function drawOutlineRectangleSpherePiece(x, y, dimensions, state) {
  const strokeAlpha = (OUTLINE_RECTANGLE_SPHERE_STROKE_ALPHA - state.travel * 0.16) * state.depthAlpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.rotation);
  stampGlow('outline-stroke', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * strokeAlpha);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = `rgba(218,250,255,${strokeAlpha})`;
  ctx.lineWidth = structurePx(0.8, 0.5);
  ctx.strokeRect(-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
  ctx.restore();
}

function griddedRectangleInternalLineCoordinates(dimensions) {
  const left = -dimensions.width / 2;
  const right = dimensions.width / 2;
  const top = -dimensions.height / 2;
  const bottom = dimensions.height / 2;
  return {
    left,
    right,
    top,
    bottom,
    vertical: Array.from({ length: GRIDDED_RECTANGLE_VERTICAL_LINE_COUNT }, (_, index) =>
      left + (index + 1) / (GRIDDED_RECTANGLE_VERTICAL_LINE_COUNT + 1) * dimensions.width
    ),
    horizontal: Array.from({ length: GRIDDED_RECTANGLE_HORIZONTAL_LINE_COUNT }, (_, index) =>
      top + (index + 1) / (GRIDDED_RECTANGLE_HORIZONTAL_LINE_COUNT + 1) * dimensions.height
    ),
  };
}

function drawGriddedRectangleSpherePiece(x, y, dimensions, state) {
  const grid = griddedRectangleInternalLineCoordinates(dimensions);
  const fillAlpha = (GRIDDED_RECTANGLE_SPHERE_FILL_ALPHA - state.travel * 0.08) * state.depthAlpha;
  const strokeAlpha = (GRIDDED_RECTANGLE_SPHERE_STROKE_ALPHA - state.travel * 0.12) * state.depthAlpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.rotation);
  stampGlow('gridded-fill', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * fillAlpha);
  stampGlow('gridded-stroke', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * strokeAlpha);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(255,255,255,${fillAlpha})`;
  ctx.fillRect(grid.left, grid.top, dimensions.width, dimensions.height);
  ctx.strokeStyle = `rgba(255,255,255,${strokeAlpha})`;
  ctx.lineWidth = structurePx(0.72, 0.5);
  ctx.strokeRect(grid.left, grid.top, dimensions.width, dimensions.height);
  ctx.beginPath();
  for (const xCoordinate of grid.vertical) {
    ctx.moveTo(xCoordinate, grid.top);
    ctx.lineTo(xCoordinate, grid.bottom);
  }
  for (const yCoordinate of grid.horizontal) {
    ctx.moveTo(grid.left, yCoordinate);
    ctx.lineTo(grid.right, yCoordinate);
  }
  ctx.stroke();
  ctx.restore();
}

// Linux mini optimization begin (O2): per piece, the reference allocates the piece state (sphere.js),
// a dimensions object and, for gridded pieces, two Array.from coordinate lists. Mini reuses scratch
// objects (miniSegmentedSpherePieceState, bit-identical values) and computes each internal grid line
// from a precomputed (index + 1) / (count + 1) fraction, the same operand the reference multiplies by
// the width/height. O2b: the solid, outline and gridded pieces take their fill/stroke colours from the
// alpha tables; otherwise the call stream is identical to the reference.
const miniSpherePieceDimensions = { width: 0, height: 0 };
const MINI_GRID_VERTICAL_FRACTIONS = Float64Array.from({ length: GRIDDED_RECTANGLE_VERTICAL_LINE_COUNT },
  (_, index) => (index + 1) / (GRIDDED_RECTANGLE_VERTICAL_LINE_COUNT + 1));
const MINI_GRID_HORIZONTAL_FRACTIONS = Float64Array.from({ length: GRIDDED_RECTANGLE_HORIZONTAL_LINE_COUNT },
  (_, index) => (index + 1) / (GRIDDED_RECTANGLE_HORIZONTAL_LINE_COUNT + 1));

function drawMiniSolidSquareSpherePiece(x, y, dimensions, state) {
  const fillAlpha = (SOLID_SQUARE_SPHERE_ALPHA - state.travel * 0.10) * state.depthAlpha;
  const strokeAlpha = SOLID_SQUARE_SPHERE_STROKE_ALPHA * state.depthAlpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.rotation);
  stampGlow('solid-fill', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * fillAlpha);
  stampGlow('solid-stroke', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * strokeAlpha);
  ctx.globalAlpha = 1;
  ctx.fillStyle = layerRgba(MINI_SPHERE_WHITE_RGBA, fillAlpha);
  ctx.fillRect(-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
  ctx.strokeStyle = layerRgba(MINI_SPHERE_WHITE_RGBA, strokeAlpha);
  ctx.lineWidth = structurePx(1.0, 0.5);
  ctx.strokeRect(-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
  ctx.restore();
}

function drawMiniOutlineRectangleSpherePiece(x, y, dimensions, state) {
  const strokeAlpha = (OUTLINE_RECTANGLE_SPHERE_STROKE_ALPHA - state.travel * 0.16) * state.depthAlpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.rotation);
  stampGlow('outline-stroke', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * strokeAlpha);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = layerRgba(MINI_SPHERE_OUTLINE_RGBA, strokeAlpha);
  ctx.lineWidth = structurePx(0.8, 0.5);
  ctx.strokeRect(-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
  ctx.restore();
}

function drawMiniGriddedRectangleSpherePiece(x, y, dimensions, state) {
  const left = -dimensions.width / 2;
  const right = dimensions.width / 2;
  const top = -dimensions.height / 2;
  const bottom = dimensions.height / 2;
  const fillAlpha = (GRIDDED_RECTANGLE_SPHERE_FILL_ALPHA - state.travel * 0.08) * state.depthAlpha;
  const strokeAlpha = (GRIDDED_RECTANGLE_SPHERE_STROKE_ALPHA - state.travel * 0.12) * state.depthAlpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.rotation);
  stampGlow('gridded-fill', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * fillAlpha);
  stampGlow('gridded-stroke', dimensions.width, dimensions.height, SEGMENTED_SPHERE_GLOW_ALPHA * strokeAlpha);
  ctx.globalAlpha = 1;
  ctx.fillStyle = layerRgba(MINI_SPHERE_WHITE_RGBA, fillAlpha);
  ctx.fillRect(left, top, dimensions.width, dimensions.height);
  ctx.strokeStyle = layerRgba(MINI_SPHERE_WHITE_RGBA, strokeAlpha);
  ctx.lineWidth = structurePx(0.72, 0.5);
  ctx.strokeRect(left, top, dimensions.width, dimensions.height);
  ctx.beginPath();
  for (let i = 0; i < MINI_GRID_VERTICAL_FRACTIONS.length; i++) {
    const xCoordinate = left + MINI_GRID_VERTICAL_FRACTIONS[i] * dimensions.width;
    ctx.moveTo(xCoordinate, top);
    ctx.lineTo(xCoordinate, bottom);
  }
  for (let i = 0; i < MINI_GRID_HORIZONTAL_FRACTIONS.length; i++) {
    const yCoordinate = top + MINI_GRID_HORIZONTAL_FRACTIONS[i] * dimensions.height;
    ctx.moveTo(left, yCoordinate);
    ctx.lineTo(right, yCoordinate);
  }
  ctx.stroke();
  ctx.restore();
}

function drawMiniSegmentedSphere(cx, cy, progress) {
  const minD = Math.min(W, H);
  const dimensions = miniSpherePieceDimensions;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const frame = miniSegmentedSphereFrame(progress);
  for (let i = 0; i < SEGMENTED_SPHERE_DESCRIPTORS.length; i++) {
    const descriptor = SEGMENTED_SPHERE_DESCRIPTORS[i];
    const state = miniSegmentedSpherePieceState(frame, descriptor);
    // segmentedSpherePieceDimensions(descriptor, minD, state.projectedDepth)
    const depthScale = 0.86 + (state.projectedDepth + 1) * 0.10;
    const styleScale = descriptor.style === 'solid-square' ? SOLID_SQUARE_SIZE_MULTIPLIER : 1;
    const width = minD * SEGMENTED_SPHERE_BASE_WIDTH * descriptor.sizeVariation * depthScale * styleScale;
    dimensions.width = width;
    dimensions.height = descriptor.style === 'solid-square' ? width : width / SPHERE_RECTANGLE_ASPECT_RATIO;
    const x = cx + state.normalizedPositionX * minD;
    const y = cy + state.normalizedPositionY * minD;
    if (descriptor.style === 'solid-square') {
      drawMiniSolidSquareSpherePiece(x, y, dimensions, state);
    } else if (descriptor.style === 'outline-rectangle') {
      drawMiniOutlineRectangleSpherePiece(x, y, dimensions, state);
    } else {
      drawMiniGriddedRectangleSpherePiece(x, y, dimensions, state);
    }
  }
  ctx.restore();
}

// Linux mini optimization end.
function drawSegmentedSphere(cx, cy, progress) {
  // Linux mini optimization begin (O2): see drawMiniSegmentedSphere (B5: the wallpaper too, so the
  // reference body below is kept only as the CielWin text it replaces).
  drawMiniSegmentedSphere(cx, cy, progress);
  return;
  // Linux mini optimization end.
  const minD = Math.min(W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const descriptor of SEGMENTED_SPHERE_DESCRIPTORS) {
    const state = segmentedSpherePieceState(progress, descriptor);
    const dimensions = segmentedSpherePieceDimensions(descriptor, minD, state.projectedDepth);
    const x = cx + state.normalizedPosition[0] * minD;
    const y = cy + state.normalizedPosition[1] * minD;
    if (descriptor.style === 'solid-square') {
      drawSolidSquareSpherePiece(x, y, dimensions, state);
    } else if (descriptor.style === 'outline-rectangle') {
      drawOutlineRectangleSpherePiece(x, y, dimensions, state);
    } else {
      drawGriddedRectangleSpherePiece(x, y, dimensions, state);
    }
  }
  ctx.restore();
}

// Circular orbit around the central octagon, seen face-on: every square has the same size and opacity
// (no depth) and keeps one side facing the centre. On a circle equal angles are equal arcs, so at
// ORBIT_BLOCK_SIZE_SCALE = 1 the gap between neighbours equals one square exactly, at any viewport size and
// block count; smaller scales shrink the squares and widen the gap. Sizes follow min(W, H) like the octagon,
// so no separate wallpaper or mini scale is applied.
const ORBIT_BLOCK_OPACITY = 0.70;
// Eye distance for the inward tilt's perspective, in square sides: smaller values exaggerate the taper.
const ORBIT_BLOCK_PERSPECTIVE = 2.5;

// Square side relative to the orbit radius: half of the arc between neighbours, times ORBIT_BLOCK_SIZE_SCALE.
function orbitBlockSideRatio() {
  return TAU / ORBIT_BLOCK_COUNT / 2 * ORBIT_BLOCK_SIZE_SCALE;
}

// Each square is tilted ORBIT_BLOCK_TILT_DEGREES about its tangential axis, its outer side leaning away from
// the viewer, and projected with a simple perspective. All values are fractions of the side, so the shape
// is identical at any size. In the block frame +x points away from the centre: the inner side sits at
// x = -innerX (half-width innerHalf), the outer side at x = outerX (half-width outerHalf).
function orbitBlockTiltShape() {
  const tilt = ORBIT_BLOCK_TILT_DEGREES * Math.PI / 180;
  const depth = 0.5 * Math.sin(tilt);
  const half = 0.5 * Math.cos(tilt);
  const innerScale = ORBIT_BLOCK_PERSPECTIVE / (ORBIT_BLOCK_PERSPECTIVE - depth);
  const outerScale = ORBIT_BLOCK_PERSPECTIVE / (ORBIT_BLOCK_PERSPECTIVE + depth);
  return {
    innerX: half * innerScale,
    innerHalf: 0.5 * innerScale,
    outerX: half * outerScale,
    outerHalf: 0.5 * outerScale,
  };
}

// Orbit radius whose squares' inner side sits ORBIT_BLOCK_OCTAGON_GAP * octagon radius outside the octagon's
// visible outer edge (octagonVisibleOuterRadius), so the clearance looks the same in mini and at any display
// size and the squares never touch the line, even at full pulse. Solves R - side(R) * innerX = edge + gap.
function orbitBlockRadius(shape) {
  const r = Math.min(W, H) * OCTAGON_RADIUS_FACTOR;
  const innerEdge = octagonVisibleOuterRadius(r) + r * ORBIT_BLOCK_OCTAGON_GAP;
  return innerEdge / (1 - orbitBlockSideRatio() * shape.innerX);
}

function drawOrbitBlocks(cx, cy, phase) {
  if (ORBIT_BLOCK_COUNT === 0) return;
  const shape = orbitBlockTiltShape();
  const radius = orbitBlockRadius(shape);
  const side = radius * orbitBlockSideRatio();
  const innerX = -shape.innerX * side;
  const innerHalf = shape.innerHalf * side;
  const outerX = shape.outerX * side;
  const outerHalf = shape.outerHalf * side;
  const glowWidth = outerX - innerX;
  const glowHeight = 2 * innerHalf;
  const glowShift = (outerX + innerX) / 2;
  ctx.save();
  ctx.fillStyle = layerRgba(MINI_ORBIT_BLOCK_RGBA, ORBIT_BLOCK_OPACITY);
  for (let i = 0; i < orbitBlocks.length; i++) {
    const angle = orbitBlocks[i].phase + phase * ORBIT_BLOCK_SPEED;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(angle);
    ctx.translate(glowShift, 0);
    stampGlow('orbit-block', glowWidth, glowHeight, ORBIT_BLOCK_GLOW_ALPHA * ORBIT_BLOCK_OPACITY);
    ctx.translate(-glowShift, 0);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(innerX, -innerHalf);
    ctx.lineTo(outerX, -outerHalf);
    ctx.lineTo(outerX, outerHalf);
    ctx.lineTo(innerX, innerHalf);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function rotate3(v, ax, ay, az) {
  let [x, y, z] = v;

  let y1 = y * Math.cos(ax) - z * Math.sin(ax);
  let z1 = y * Math.sin(ax) + z * Math.cos(ax);
  let x1 = x;

  let x2 = x1 * Math.cos(ay) + z1 * Math.sin(ay);
  let z2 = -x1 * Math.sin(ay) + z1 * Math.cos(ay);
  let y2 = y1;

  let x3 = x2 * Math.cos(az) - y2 * Math.sin(az);
  let y3 = x2 * Math.sin(az) + y2 * Math.cos(az);
  return [x3, y3, z2];
}

function perspectiveScale(z) {
  const denominator = Math.max(CAMERA_DENOMINATOR_MIN, CAMERA_DISTANCE - z);
  return 2.7 / denominator;
}

function project3(v, cx, cy, scale) {
  const f = perspectiveScale(v[2]);
  return [cx + v[0] * scale * f, cy + v[1] * scale * f, f];
}

const TETRAHEDRON_VERTICES = [
  [0.00, -1.20, 0.00],
  [-1.05, 0.72, -0.78],
  [1.05, 0.72, -0.78],
  [0.00, 0.72, 1.05],
];
const TETRAHEDRON_EDGES = [[0,1], [0,2], [0,3], [1,2], [2,3], [3,1]];

function tetrahedronState(progress, minD = Math.min(W, H)) {
  const approach = smoothstep(0, 1, pingpong01(progress));
  const rotationPhase = progress * TAU * TRIANGULAR_PRISM_ROTATION_SPEED;
  const ax = 0.86 + Math.sin(rotationPhase) * 0.13;
  const ay = 0.48 + rotationPhase;
  const az = -0.10 + Math.cos(rotationPhase) * 0.10;
  const cameraTravel = mix(TETRAHEDRON_CAMERA_FAR, TETRAHEDRON_CAMERA_NEAR, approach);
  return {
    desiredScale: minD * mix(TETRAHEDRON_FAR_SCALE, TETRAHEDRON_NEAR_SCALE, approach),
    vertices: TETRAHEDRON_VERTICES.map((v) => {
      const rotated = rotate3(v, ax, ay, az);
      return [rotated[0], rotated[1], rotated[2] + cameraTravel];
    }),
  };
}

function tetrahedronProjectionMetrics(width, height, progress) {
  const cx = width * 0.505;
  const cy = height * 0.515;
  const state = tetrahedronState(progress, Math.min(width, height));
  const safeMargin = Math.max(14, Math.min(width, height) * 0.035);
  const xLimit = Math.max(1, Math.min(cx, width - cx) - safeMargin);
  const yLimit = Math.max(1, Math.min(cy, height - cy) - safeMargin);
  const maxProjectedX = Math.max(...state.vertices.map((v) => Math.abs(v[0]) * perspectiveScale(v[2])));
  const maxProjectedY = Math.max(...state.vertices.map((v) => Math.abs(v[1]) * perspectiveScale(v[2])));
  const safeScale = Math.min(xLimit / maxProjectedX, yLimit / maxProjectedY);
  const scale = Math.min(state.desiredScale, safeScale);
  const project = (s) => state.vertices.map((v) => project3(v, cx, cy, s));
  const measuredSize = (points) => {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };
  const result = {
    safeMargin,
    points: project(scale),
    unclampedSize: measuredSize(project(state.desiredScale)),
  };
  return result;
}

// Central octagon geometry shared with the orbit blocks, which keep clear of its visible outer edge.
// Stroke growth at full pulse (lineWidth * (1 + pulse * gain)).
const OCTAGON_PULSE_STROKE_GAIN = 0.72;
// Largest radial vertex wobble at full pulse, relative to the radius.
const OCTAGON_PULSE_WOBBLE = 0.025;
// Chroma copies: stroke width and sideways offset in full-scene px (mini scales both by miniK).
const OCTAGON_CHROMA_STROKE_PX = 6.8;
const OCTAGON_CHROMA_OFFSET_PX = 2.1;

function octagonMiniStrokeK() {
  return isMiniVariant ? MINI_POLYGON_STROKE_PX / 5.1 : 1;
}

// Farthest the octagon's drawn line reaches from the centre (vertex + full-pulse wobble + half the widest
// stroke + chroma offset), ignoring the soft glow. The strokes are fixed px while the radius follows
// min(W, H), so this edge sits relatively farther out on small viewports.
function octagonVisibleOuterRadius(r) {
  const k = octagonMiniStrokeK();
  return r * (1 + OCTAGON_PULSE_WOBBLE)
    + OCTAGON_CHROMA_STROKE_PX * k * (1 + OCTAGON_PULSE_STROKE_GAIN) / 2
    + OCTAGON_CHROMA_OFFSET_PX * k;
}

function drawCentralOctagon(cx, cy, progress, pulse) {
  const r = Math.min(W, H) * OCTAGON_RADIUS_FACTOR;
  const rot = progress * TAU * 0.18;
  const pulseStroke = 1 + pulse * OCTAGON_PULSE_STROKE_GAIN;
  // Mini: the octagon's line is exactly MINI_POLYGON_STROKE_PX thick (as thin as raphael's hexadecagon); its
  // chroma copies, offsets and glow keep their full-scene proportions to that stroke.
  const miniK = octagonMiniStrokeK();
  const pulseBlur = (20 + pulse * 18) * miniK;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [offset, color] of [
    [-OCTAGON_CHROMA_OFFSET_PX * miniK, 'rgba(40,220,255,0.20)'],
    [ OCTAGON_CHROMA_OFFSET_PX * miniK, 'rgba(255,72,120,0.16)'],
  ]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = OCTAGON_CHROMA_STROKE_PX * miniK * pulseStroke;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * TAU / 8;
      const wobble = pulse * r * OCTAGON_PULSE_WOBBLE * Math.sin(a * 3 + progress * TAU);
      const x = Math.cos(a) * (r + wobble) + offset;
      const y = Math.sin(a) * (r + wobble);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Linux mini optimization begin (PERF-5): the wallpaper stamps the octagon's glow from baked pulse levels
  // (sprites.js, wallpaperPulseGlows: the reference stroke and shadow of the regular octagon at rotation 0,
  // under the ctx rotation) and strokes the octagon below unshadowed. The pulse wobble (at most 2.5% of
  // the radius, inside a 19-38 px blur) moves the stroke only, not its baked glow.
  const octagonGlow = isMiniVariant ? null : wallpaperPulseGlows(`octagon|${r}`, (level, scale) => {
    const lineWidth = 5.1 * (1 + level * OCTAGON_PULSE_STROKE_GAIN);
    return bakeShadowLayer(r + lineWidth, r + lineWidth, scale, 'rgba(255,255,245,0.90)', 20 + level * 18, (g) => {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,244,0.95)';
      g.lineWidth = lineWidth;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + i * TAU / 8;
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.stroke();
    });
  });
  if (octagonGlow) {
    stampWallpaperPulseGlow(octagonGlow, pulse);
    ctx.strokeStyle = 'rgba(255,255,244,0.95)';
    ctx.lineWidth = 5.1 * miniK * pulseStroke;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * TAU / 8;
      const wobble = pulse * r * OCTAGON_PULSE_WOBBLE * Math.sin(a * 3 + progress * TAU);
      const x = Math.cos(a) * (r + wobble);
      const y = Math.sin(a) * (r + wobble);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    return;
  }
  // Linux mini optimization end.
  ctx.strokeStyle = 'rgba(255,255,244,0.95)';
  ctx.lineWidth = 5.1 * miniK * pulseStroke;
  ctx.shadowColor = 'rgba(255,255,245,0.90)';
  ctx.shadowBlur = pulseBlur;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + i * TAU / 8;
    const wobble = pulse * r * OCTAGON_PULSE_WOBBLE * Math.sin(a * 3 + progress * TAU);
    const x = Math.cos(a) * (r + wobble);
    const y = Math.sin(a) * (r + wobble);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTriangularPrism(cx, cy, progress) {
  // Tetrahedron / triangular pyramid: all four faces are triangles.
  // The established function name is retained for the render call site.
  const state = tetrahedronState(progress);
  const safeMargin = Math.max(structurePx(14, 3), Math.min(W, H) * 0.035);
  const xLimit = Math.max(1, Math.min(cx, W - cx) - safeMargin);
  const yLimit = Math.max(1, Math.min(cy, H - cy) - safeMargin);
  const maxProjectedX = Math.max(...state.vertices.map((v) => Math.abs(v[0]) * perspectiveScale(v[2])));
  const maxProjectedY = Math.max(...state.vertices.map((v) => Math.abs(v[1]) * perspectiveScale(v[2])));
  const safeScale = Math.min(xLimit / maxProjectedX, yLimit / maxProjectedY);
  const scale = Math.min(state.desiredScale, safeScale);
  const pts = state.vertices.map((v) => project3(v, cx, cy, scale));
  const edges = TETRAHEDRON_EDGES;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Aberración cromática sutil.
  for (const [offX, offY, color] of [
    [-structurePx(1.7, 0.3), structurePx(0.6, 0.1), 'rgba(40,220,255,0.22)'],
    [ structurePx(1.7, 0.3), -structurePx(0.6, 0.1), 'rgba(255,72,120,0.18)'],
  ]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = structurePx(3.8, 0.5);
    for (const [a, b] of edges) {
      ctx.beginPath();
      ctx.moveTo(pts[a][0] + offX, pts[a][1] + offY);
      ctx.lineTo(pts[b][0] + offX, pts[b][1] + offY);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(255,255,244,0.88)';
  ctx.lineWidth = structurePx(3.2, 0.5);
  for (const [a, b] of edges) {
    const depthAlpha = clamp01((pts[a][2] + pts[b][2]) * 0.46);
    const edgeAlpha = 0.54 + depthAlpha * 0.40;
    stampGlowLine('prism-edge', structurePx(3.2, 0.5), 14 / 3.2, pts[a][0], pts[a][1], pts[b][0], pts[b][1], 0.68 * 0.88 * edgeAlpha);
    ctx.globalAlpha = edgeAlpha;
    ctx.beginPath();
    ctx.moveTo(pts[a][0], pts[a][1]);
    ctx.lineTo(pts[b][0], pts[b][1]);
    ctx.stroke();
  }
  ctx.restore();
}

// Band shapes: radius and ribbon half-width (fractions of min(W, H)), ribbon lean between flat (0)
// and upright (pi / 2) and its travelling twist, the nested pose's slight tilt (its sign is also the
// contraction's tilt direction), saddle bend (fraction of the radius), the turn about the screen y
// axis at full contraction (restFlip, near pi / 2 = edge-on) and the precession per circuit (precess,
// radians; sign = direction), and how far ahead in the circuit the band runs (lead, fraction of a
// circuit: the inner ring opens and closes slightly before the outer one). The different radii nest the rings when expanded; opposite tilts, flips, precessions
// and different rot put them on different axes, so their ellipses cross when contracted.
const FOLDING_BANDS = [
  { radius: 0.32, width: 0.018, lean: 0.9, twistAmp: 0.9, tilt: 0.10, bend: 0.22, restFlip: 1.05, precess: 0.9, lead: 0, offset: 0.0, rot: -0.76 },
  { radius: 0.245, width: 0.016, lean: 1.1, twistAmp: 0.6, tilt: -0.08, bend: 0.30, restFlip: -1.3, precess: -0.9, lead: 0.08, offset: 2.2, rot: 0.36 },
];

function foldingBandParameters(progress) {
  const minD = Math.min(W, H);
  const phase = progress * TAU;
  const thin = isMiniVariant ? MINI_FOLDING_BAND_WIDTH_FACTOR : 1; // T2m: mini bands are thinner, nothing else changes
  return FOLDING_BANDS.map((band, i) => {
    const speed = FOLDING_BAND_SPEEDS[i];
    const r = minD * band.radius;
    return [r, r, band.rot + phase * speed, minD * band.width * thin, phase * speed * 0.5 + band.offset,
      rubberBandDeformation(phase, speed, band)];
  });
}

function drawAtomicOrbits(cx, cy, progress) {
  // Tilted rings can pass behind the octagon; it is drawn after the bands, so it stays on top.
  for (const [rx, ry, rot, width, foldPhase, deform] of foldingBandParameters(progress)) {
    drawFoldingBand(cx, cy, rx, ry, rot, width, foldPhase, deform);
  }
}

// The bands' near halves, over the octagon and the prism (see drawFoldingBandFront).
function drawAtomicOrbitsFront(cx, cy, progress) {
  for (const [rx, ry, rot, width, foldPhase, deform] of foldingBandParameters(progress)) {
    drawFoldingBandFront(cx, cy, rx, ry, rot, width, foldPhase, deform);
  }
}

// Linux mini optimization begin (O2): the core glow's stops are constant while its radius (r * 5.1)
// changes every frame, so mini fills it from one unit-radius gradient cached per context, under
// translate(cx, cy) . scale(radius) inside save/restore. A CanvasGradient is resolved in user space at
// fill time, so gradient and circle land on the reference canvas geometry (equal up to floating-point
// rounding, tested). The fill has no shadow in the reference (shadowBlur is 0 here) and shadowBlur
// ignores the transform anyway; the disc and its 20 px shadow are drawn exactly as the reference. The
// 18 spokes use the reused segment buffer of drawMiniGlowSegments (identical stream).
const miniCentralCoreGlow = { context: null, gradient: null };

function miniCentralCoreGlowGradient() {
  if (miniCentralCoreGlow.context !== ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0.00, 'rgba(255,255,247,1.00)');
    g.addColorStop(0.16, 'rgba(255,255,242,0.98)');
    g.addColorStop(0.30, 'rgba(240,255,245,0.72)');
    g.addColorStop(0.55, 'rgba(120,255,230,0.28)');
    g.addColorStop(1.00, 'rgba(40,220,220,0)');
    miniCentralCoreGlow.context = ctx;
    miniCentralCoreGlow.gradient = g;
  }
  return miniCentralCoreGlow.gradient;
}

function drawMiniCentralCore(cx, cy, phase) {
  const minD = Math.min(W, H);
  const r = minD * normalizedCentralCoreRadius(phase);
  const coords = miniGlowSegmentCoords;

  if (CENTRAL_CORE_PROMINENT_RAY_COUNT > 0) {
    for (let i = 0; i < CENTRAL_CORE_PROMINENT_RAY_COUNT; i++) {
      const a = i * TAU / CENTRAL_CORE_PROMINENT_RAY_COUNT + Math.sin(phase) * 0.04;
      const desiredLength = r * mix(
        CENTRAL_CORE_PROMINENT_MIN_REACH_FACTOR,
        CENTRAL_CORE_PROMINENT_MAX_REACH_FACTOR,
        prominentRayGrowthEnvelope(phase, i)
      );
      const l = Math.min(desiredLength, centralCoreRaySafeLength(cx, cy, a));
      const o = i * 4;
      coords[o] = cx + Math.cos(a) * r * CENTRAL_CORE_RAY_INNER_RADIUS_FACTOR;
      coords[o + 1] = cy + Math.sin(a) * r * CENTRAL_CORE_RAY_INNER_RADIUS_FACTOR;
      coords[o + 2] = cx + Math.cos(a) * l;
      coords[o + 3] = cy + Math.sin(a) * l;
    }
    drawMiniGlowSegments(0, CENTRAL_CORE_PROMINENT_RAY_COUNT, CENTRAL_RAY_LINE_WIDTH, CENTRAL_RAY_OPACITY, CENTRAL_RAY_GLOW_BLUR);

    for (let i = 0; i < CENTRAL_CORE_MINOR_RAY_COUNT; i++) {
      const a = (i + 0.5) * TAU / CENTRAL_CORE_MINOR_RAY_COUNT - Math.sin(phase) * 0.025;
      const l = r * CENTRAL_CORE_MINOR_RAY_FACTOR;
      const o = i * 4;
      coords[o] = cx + Math.cos(a) * r * 0.20;
      coords[o + 1] = cy + Math.sin(a) * r * 0.20;
      coords[o + 2] = cx + Math.cos(a) * l;
      coords[o + 3] = cy + Math.sin(a) * l;
    }
    drawMiniGlowSegments(0, CENTRAL_CORE_MINOR_RAY_COUNT, 0.70, 0.22, 5);
  }

  const glowRadius = r * 5.1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(glowRadius, glowRadius);
  ctx.fillStyle = miniCentralCoreGlowGradient();
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,245,0.96)';
  // PERF-5: the wallpaper stamps the disc's baked shadow (sprites.js, stampWallpaperDiscGlow).
  let coreGlow = false;
  if (!isMiniVariant) {
    ctx.save();
    ctx.translate(cx, cy);
    coreGlow = stampWallpaperDiscGlow('processing-core', paintCentralCoreDisc, 'rgba(255,255,245,0.80)', structurePx(20, 1), r * 0.88);
    ctx.restore();
  }
  if (!coreGlow) {
    ctx.shadowColor = 'rgba(255,255,245,0.80)';
    ctx.shadowBlur = structurePx(20, 1);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function paintCentralCoreDisc(g, radius) {
  g.fillStyle = 'rgba(255,255,245,0.96)';
  g.beginPath();
  g.arc(0, 0, radius, 0, TAU);
  g.fill();
}

// Linux mini optimization end.
function drawCentralCore(cx, cy, phase) {
  // Linux mini optimization begin (O2): see drawMiniCentralCore (needs a non-empty canvas for scale(r)).
  // B5: the wallpaper too.
  if (Math.min(W, H) > 0) {
    drawMiniCentralCore(cx, cy, phase);
    return;
  }
  // Linux mini optimization end.
  const minD = Math.min(W, H);
  const r = minD * normalizedCentralCoreRadius(phase);

  // The optional prominent count controls the complete central spoke layer, including minor spokes.
  if (CENTRAL_CORE_PROMINENT_RAY_COUNT > 0) {
    const prominentSegments = [];
    for (let i = 0; i < CENTRAL_CORE_PROMINENT_RAY_COUNT; i++) {
      const a = i * TAU / CENTRAL_CORE_PROMINENT_RAY_COUNT + Math.sin(phase) * 0.04;
      const desiredLength = r * mix(
        CENTRAL_CORE_PROMINENT_MIN_REACH_FACTOR,
        CENTRAL_CORE_PROMINENT_MAX_REACH_FACTOR,
        prominentRayGrowthEnvelope(phase, i)
      );
      const l = Math.min(desiredLength, centralCoreRaySafeLength(cx, cy, a));
      prominentSegments.push([
        cx + Math.cos(a) * r * CENTRAL_CORE_RAY_INNER_RADIUS_FACTOR,
        cy + Math.sin(a) * r * CENTRAL_CORE_RAY_INNER_RADIUS_FACTOR,
        cx + Math.cos(a) * l,
        cy + Math.sin(a) * l,
      ]);
    }
    drawGlowSegments(prominentSegments, CENTRAL_RAY_LINE_WIDTH, CENTRAL_RAY_OPACITY, CENTRAL_RAY_GLOW_BLUR);

    const minorSegments = [];
    for (let i = 0; i < CENTRAL_CORE_MINOR_RAY_COUNT; i++) {
      const a = (i + 0.5) * TAU / CENTRAL_CORE_MINOR_RAY_COUNT - Math.sin(phase) * 0.025;
      const l = r * CENTRAL_CORE_MINOR_RAY_FACTOR;
      minorSegments.push([
        cx + Math.cos(a) * r * 0.20,
        cy + Math.sin(a) * r * 0.20,
        cx + Math.cos(a) * l,
        cy + Math.sin(a) * l,
      ]);
    }
    drawGlowSegments(minorSegments, 0.70, 0.22, 5);
  }

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 5.1);
  g.addColorStop(0.00, 'rgba(255,255,247,1.00)');
  g.addColorStop(0.16, 'rgba(255,255,242,0.98)');
  g.addColorStop(0.30, 'rgba(240,255,245,0.72)');
  g.addColorStop(0.55, 'rgba(120,255,230,0.28)');
  g.addColorStop(1.00, 'rgba(40,220,220,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 5.1, 0, TAU);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,245,0.96)';
  ctx.shadowColor = 'rgba(255,255,245,0.80)';
  ctx.shadowBlur = structurePx(20, 1);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// Linux mini optimization begin (SIC1): odd/tasks/scene-identical-caches.md. The vignette gradient only
// depends on W and H (CSS pixels); it is created once per (ctx, W, H) and reused. A CanvasGradient is
// resolved in user space at fill time, under the same per-frame transform, so the pixels are the
// reference's (same geometry and stops, real-canvas diff 0).
let vignetteGradientCache = { context: null, width: -1, height: -1, gradient: null };

function cachedVignetteGradient() {
  const cache = vignetteGradientCache;
  if (cache.context === ctx && cache.width === W && cache.height === H) return cache.gradient;
  const v = ctx.createRadialGradient(
    W * 0.5, H * 0.5, Math.min(W, H) * 0.20,
    W * 0.5, H * 0.5, Math.max(W, H) * 0.72
  );
  v.addColorStop(0.00, 'rgba(0,0,0,0)');
  v.addColorStop(0.64, 'rgba(0,0,0,0.04)');
  v.addColorStop(1.00, 'rgba(0,0,0,0.38)');
  vignetteGradientCache = { context: ctx, width: W, height: H, gradient: v };
  return v;
}

// Linux mini optimization end.
function drawVignette() {
  // Linux mini optimization begin (SIC1): cached gradient (see cachedVignetteGradient).
  ctx.fillStyle = cachedVignetteGradient();
  ctx.fillRect(0, 0, W, H);
  return;
  // Linux mini optimization end.
  const v = ctx.createRadialGradient(
    W * 0.5, H * 0.5, Math.min(W, H) * 0.20,
    W * 0.5, H * 0.5, Math.max(W, H) * 0.72
  );
  v.addColorStop(0.00, 'rgba(0,0,0,0)');
  v.addColorStop(0.64, 'rgba(0,0,0,0.04)');
  v.addColorStop(1.00, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawFilmGrain(phase) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const grain of filmGrain) {
    const x = fract(grain.x + Math.sin(phase + grain.phase) * 0.018) * W;
    const y = fract(grain.y + Math.cos(phase + grain.phase) * 0.014) * H;
    ctx.fillStyle = `rgba(218,245,235,${grain.alpha})`;
    ctx.fillRect(x, y, grain.size, grain.size);
  }
  ctx.restore();
}
