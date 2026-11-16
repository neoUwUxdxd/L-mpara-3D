/**
 * Utilidades de geometría procedural.
 * Todas las medidas están en metros.
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const v2 = (x: number, y: number) => new THREE.Vector2(x, y);
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Elimina puntos consecutivos casi coincidentes (evitan normales nulas en el torno). */
function dedupe(points: THREE.Vector2[], eps = 1e-7): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.distanceToSquared(p) > eps * eps) out.push(p);
  }
  return out;
}

/**
 * Redondea las esquinas interiores de una polilínea con arcos tangentes (biseles suaves).
 * `radius` puede ser un número global o un array por vértice (0 = esquina viva).
 */
export function fillet(points: THREE.Vector2[], radius: number | number[], segments = 6): THREE.Vector2[] {
  const out: THREE.Vector2[] = [points[0].clone()];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const r = Array.isArray(radius) ? (radius[i] ?? 0) : radius;
    const d1 = p0.clone().sub(p1);
    const l1 = d1.length();
    const d2 = p2.clone().sub(p1);
    const l2 = d2.length();
    if (r <= 0 || l1 < 1e-9 || l2 < 1e-9) {
      out.push(p1.clone());
      continue;
    }
    d1.divideScalar(l1);
    d2.divideScalar(l2);
    const angle = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1));
    if (angle < 1e-3 || Math.PI - angle < 1e-3) {
      out.push(p1.clone());
      continue;
    }
    const half = angle / 2;
    let t = r / Math.tan(half);
    let rr = r;
    const maxT = Math.min(l1, l2) * 0.5;
    if (t > maxT) {
      t = maxT;
      rr = t * Math.tan(half);
    }
    const a = p1.clone().addScaledVector(d1, t);
    const b = p1.clone().addScaledVector(d2, t);
    const bis = d1.clone().add(d2).normalize();
    const c = p1.clone().addScaledVector(bis, rr / Math.sin(half));
    const a0 = Math.atan2(a.y - c.y, a.x - c.x);
    const a1 = Math.atan2(b.y - c.y, b.x - c.x);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    for (let s = 0; s <= segments; s++) {
      const ang = a0 + (delta * s) / segments;
      out.push(new THREE.Vector2(c.x + rr * Math.cos(ang), c.y + rr * Math.sin(ang)));
    }
  }
  out.push(points[points.length - 1].clone());
  return dedupe(out);
}

/**
 * Geometría de torno con coordenada V proporcional a la longitud de arco (en metros * vScale),
 * de modo que las texturas de cepillado no se deformen.
 * Regla de orientación: la normal es (dy, -dx) del perfil, por lo que recorrer el perfil
 * "hacia arriba" por fuera produce normales hacia el exterior.
 */
export function lathe(profile: THREE.Vector2[], segments = 64, vScale = 12): THREE.BufferGeometry {
  const pts = dedupe(profile);
  const geo = new THREE.LatheGeometry(pts, segments);
  const n = pts.length;
  const acc: number[] = [0];
  for (let j = 1; j < n; j++) acc.push(acc[j - 1] + pts[j].distanceTo(pts[j - 1]));
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j < n; j++) uv.setY(i * n + j, acc[j] * vScale);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Cilindro macizo con bordes biselados redondeados (eje Y). */
export function roundedCylinder(
  radius: number,
  height: number,
  bevel: number,
  segments = 40,
  centered = true,
): THREE.BufferGeometry {
  const b = Math.min(bevel, radius * 0.5, height * 0.5);
  const y0 = centered ? -height / 2 : 0;
  const y1 = y0 + height;
  const pts = fillet([v2(0, y0), v2(radius, y0), v2(radius, y1), v2(0, y1)], [0, b, b, 0], 5);
  return lathe(pts, segments);
}

/** Igual que roundedCylinder pero con el eje en Z (para ejes de articulación). */
export function roundedCylinderZ(radius: number, depth: number, bevel: number, segments = 40): THREE.BufferGeometry {
  const g = roundedCylinder(radius, depth, bevel, segments, true);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Anillo/arandela biselada (eje Y, centrado). */
export function roundedRing(rIn: number, rOut: number, height: number, bevel: number, segments = 48): THREE.BufferGeometry {
  const y0 = -height / 2;
  const y1 = height / 2;
  // Recorrido cerrado: interior bajando, base hacia fuera, exterior subiendo, tapa hacia dentro.
  const pts = fillet(
    [v2(rIn, y1), v2(rIn, y0), v2(rOut, y0), v2(rOut, y1), v2(rIn, y1)],
    [0, bevel, bevel, bevel, 0],
    4,
  );
  return lathe(pts, segments);
}

/** Toroide de sección circular hecho con torno (cordón/borde enrollado). */
export function beadRing(radius: number, tube: number, y = 0, segments = 64): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push(v2(radius + tube * Math.cos(t), y + tube * Math.sin(t)));
  }
  return lathe(pts, segments, 20);
}

/** Proyección de UV tipo caja (box mapping) para geometrías extruidas. */
export function boxUV(geo: THREE.BufferGeometry, scale = 10): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uvs[i * 2] = u * scale;
    uvs[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

export interface ExtrudeOpts {
  bevel?: number;
  bevelSegments?: number;
  curveSegments?: number;
  uvScale?: number;
  /** Ángulo de pliegue para normales suaves; 0 = mantener normales facetadas de Three. */
  crease?: number;
}

/**
 * Extrusión centrada en Z con grosor total exacto `thickness` y bisel redondeado
 * que no desborda el contorno original (bevelOffset negativo).
 */
export function extrude(shape: THREE.Shape, thickness: number, opts: ExtrudeOpts = {}): THREE.BufferGeometry {
  const bevel = Math.min(opts.bevel ?? 0.0008, thickness * 0.45);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(thickness - bevel * 2, 1e-5),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: opts.bevelSegments ?? 4,
    curveSegments: opts.curveSegments ?? 24,
  });
  geo.translate(0, 0, -(thickness - bevel * 2) / 2);
  let out: THREE.BufferGeometry = geo;
  const crease = opts.crease ?? 0.9;
  if (crease > 0) out = toCreasedNormals(geo, crease);
  boxUV(out, opts.uvScale ?? 12);
  return out;
}

/** Rectángulo de esquinas redondeadas centrado en el origen. */
export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  roundedRectPath(s, w, h, r, cx, cy);
  return s;
}

export function roundedRectPath(p: THREE.Path, w: number, h: number, r: number, cx = 0, cy = 0, clockwise = false) {
  const rr = Math.min(r, w / 2, h / 2);
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;
  if (!clockwise) {
    p.moveTo(x0 + rr, y0);
    p.lineTo(x1 - rr, y0);
    p.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
    p.lineTo(x1, y1 - rr);
    p.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
    p.lineTo(x0 + rr, y1);
    p.absarc(x0 + rr, y1 - rr, rr, Math.PI / 2, Math.PI, false);
    p.lineTo(x0, y0 + rr);
    p.absarc(x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  } else {
    p.moveTo(x0 + rr, y0);
    p.absarc(x0 + rr, y0 + rr, rr, Math.PI * 1.5, Math.PI, true);
    p.lineTo(x0, y1 - rr);
    p.absarc(x0 + rr, y1 - rr, rr, Math.PI, Math.PI / 2, true);
    p.lineTo(x1 - rr, y1);
    p.absarc(x1 - rr, y1 - rr, rr, Math.PI / 2, 0, true);
    p.lineTo(x1, y0 + rr);
    p.absarc(x1 - rr, y0 + rr, rr, 0, -Math.PI / 2, true);
    p.lineTo(x0 + rr, y0);
  }
}

/** Envolvente convexa (Andrew monotone chain) convertida en Shape. */
export function hullShape(points: THREE.Vector2[]): THREE.Shape {
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: THREE.Vector2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  const hull = lower.concat(upper);
  return new THREE.Shape(hull);
}

/** Puntos de una circunferencia (para envolventes). */
export function circlePoints(cx: number, cy: number, r: number, n = 24): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(v2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return out;
}

/** Contorno circular estriado (moleteado) para perillas de ajuste. */
export function flutedShape(r: number, flutes: number, depth: number, samples = 8): THREE.Shape {
  const n = flutes * samples;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r - depth * 0.5 * (1 - Math.cos(flutes * a));
    pts.push(v2(rr * Math.cos(a), rr * Math.sin(a)));
  }
  return new THREE.Shape(pts);
}

/** Hexágono regular (cabeza de tornillo). */
export function hexShape(r: number): THREE.Shape {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    pts.push(v2(r * Math.cos(a), r * Math.sin(a)));
  }
  return new THREE.Shape(pts);
}

/**
 * Muelle helicoidal de tracción con ganchos en ambos extremos.
 * Eje local +Y, desde y=0 hasta y=length. Los ganchos envuelven el eje Z (pernos).
 */
export function springGeometry(
  length: number,
  coils: number,
  coilR: number,
  wireR: number,
  hookR: number,
  hookLen: number,
): THREE.BufferGeometry {
  const bodyStart = hookLen;
  const bodyEnd = Math.max(length - hookLen, bodyStart + coils * wireR * 2.05);
  // Gancho inferior: lazo alrededor del perno (eje Z) situado en el origen.
  const hook: THREE.Vector3[] = [];
  const hookSteps = 14;
  for (let i = 0; i <= hookSteps; i++) {
    const a = Math.PI * 0.62 + (i / hookSteps) * Math.PI * 1.75;
    hook.push(v3(hookR * Math.cos(a), hookR * Math.sin(a), 0));
  }
  hook.push(v3(coilR * 0.45, hookLen * 0.6, 0));
  // Cuerpo helicoidal (número entero de espiras: empieza y acaba en (coilR, y, 0)).
  const body: THREE.Vector3[] = [];
  const steps = Math.ceil(coils * 20);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.round(coils) * Math.PI * 2;
    body.push(v3(coilR * Math.cos(a), bodyStart + (bodyEnd - bodyStart) * t, coilR * Math.sin(a)));
  }
  // Gancho superior: espejo del inferior respecto a la mitad del muelle.
  const topHook = hook
    .slice()
    .reverse()
    .map((p) => v3(p.x, length - p.y, -p.z));
  const pts = [...hook, ...body, ...topHook];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, pts.length * 3, wireR, 6, false);
}

/**
 * Cable con UV escaladas por longitud física para que la textura trenzada tenga
 * un paso constante (period metros por repetición).
 */
export function cableGeometry(points: THREE.Vector3[], radius: number, period = 0.006): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const len = curve.getLength();
  const segs = Math.max(16, Math.ceil(len / 0.0025));
  const geo = new THREE.TubeGeometry(curve, segs, radius, 12, false);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, uv.getX(i) * (len / period));
    uv.setY(i, uv.getY(i) * 2);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Curva helicoidal enrollada sobre una curva base (filamento de tungsteno). */
export class CoilCurve extends THREE.Curve<THREE.Vector3> {
  private frames: { tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[] };
  private readonly samples = 200;
  constructor(
    private base: THREE.Curve<THREE.Vector3>,
    private turns: number,
    private radius: number,
  ) {
    super();
    this.frames = base.computeFrenetFrames(this.samples, false);
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const p = this.base.getPointAt(t);
    const idx = Math.min(this.samples, Math.round(t * this.samples));
    const n = this.frames.normals[idx];
    const b = this.frames.binormals[idx];
    const a = t * this.turns * Math.PI * 2;
    return target
      .copy(p)
      .addScaledVector(n, Math.cos(a) * this.radius)
      .addScaledVector(b, Math.sin(a) * this.radius);
  }
}

/** Perfil suave a partir de puntos de control (Catmull-Rom 2D). */
export function smoothProfile(ctrl: THREE.Vector2[], samples = 48): THREE.Vector2[] {
  const curve = new THREE.SplineCurve(ctrl);
  return curve.getSpacedPoints(samples);
}

/** Desplaza una polilínea 2D a lo largo de su normal izquierda/derecha. */
export function offsetPolyline(pts: THREE.Vector2[], dist: number): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const t = b.clone().sub(a).normalize();
    // normal (dy, -dx): hacia fuera cuando el perfil sube por el exterior
    const n = v2(t.y, -t.x);
    out.push(pts[i].clone().addScaledVector(n, dist));
  }
  return out;
}
