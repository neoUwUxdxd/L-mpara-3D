/**
 * Cinemática de la lámpara articulada: dimensiones, límites, cinemática directa
 * y un resolutor de restricciones que impide que el cabezal atraviese la mesa,
 * la base o los propios brazos.
 *
 * Convenciones (marco local de la torreta, ya girada en Y):
 *  - El brazo vive en el plano XY; +X es "hacia delante" (donde apunta el cabezal).
 *  - shoulder: inclinación del brazo inferior respecto a la vertical (+ = adelante).
 *  - elbow: flexión relativa del brazo superior respecto al inferior (+ = adelante).
 *  - head: cabeceo del cabezal respecto a la vertical del mundo
 *          (0 = apunta hacia abajo, 90 = horizontal hacia delante). Igual que en un
 *          brazo de paralelogramo real, se mantiene al mover los brazos.
 */
import * as THREE from 'three';

export const DIM = {
  padH: 0.004,
  baseTop: 0.038,
  baseR: 0.115,
  turretX: -0.035,
  shoulderH: 0.062,
  L1: 0.36,
  L2: 0.34,
  /** Distancia del pivote del hombro al anclaje del muelle en el brazo inferior. */
  shoulderSpringOnArm: 0.13,
  /** Anclaje trasero del muelle del hombro en las placas de la torreta. */
  shoulderSpringAnchor: new THREE.Vector2(-0.026, 0.032),
  /** Anclaje del muelle del codo sobre el brazo inferior (distancia desde el hombro). */
  elbowSpringOnLower: 0.2,
  /** Longitud de la palanca trasera del brazo superior (más allá del codo). */
  elbowLever: 0.035,
  springZ: 0.04,
  /** Cabezal: profundidad del borde y radio de boca. */
  rimY: -0.19,
  rimR: 0.085,
  bulbCenterY: -0.121,
} as const;

export interface Pose {
  yaw: number;
  shoulder: number;
  elbow: number;
  head: number;
}

export type PoseKey = keyof Pose;

export const POSE_LIMITS: Record<PoseKey, [number, number]> = {
  yaw: [-150, 150],
  shoulder: [-15, 45],
  elbow: [35, 150],
  head: [-25, 90],
};

export const DEFAULT_POSE: Pose = { yaw: -22, shoulder: 16, elbow: 100, head: 14 };

const rad = THREE.MathUtils.degToRad;

export interface Chain {
  /** Pivote del hombro (marco torreta). */
  S: THREE.Vector2;
  /** Pivote del codo. */
  E: THREE.Vector2;
  /** Pivote de la muñeca/cabezal. */
  W: THREE.Vector2;
  /** Direcciones unitarias de los brazos. */
  u1: THREE.Vector2;
  u2: THREE.Vector2;
  /** Normal "trasera" de cada brazo (lado exterior de la flexión). */
  n1: THREE.Vector2;
  n2: THREE.Vector2;
  /** Ángulos en radianes. */
  t1: number;
  t2: number;
  head: number;
}

export function forwardKinematics(p: Pose): Chain {
  const t1 = rad(p.shoulder);
  const t2 = rad(p.shoulder + p.elbow);
  const S = new THREE.Vector2(0, DIM.shoulderH);
  const u1 = new THREE.Vector2(Math.sin(t1), Math.cos(t1));
  const u2 = new THREE.Vector2(Math.sin(t2), Math.cos(t2));
  const n1 = new THREE.Vector2(-Math.cos(t1), Math.sin(t1));
  const n2 = new THREE.Vector2(-Math.cos(t2), Math.sin(t2));
  const E = S.clone().addScaledVector(u1, DIM.L1);
  const W = E.clone().addScaledVector(u2, DIM.L2);
  return { S, E, W, u1, u2, n1, n2, t1, t2, head: rad(p.head) };
}

/** Rota un punto local del cabezal (x,y) por el cabeceo `h` alrededor de Z. */
export function rotZ(x: number, y: number, h: number, out = new THREE.Vector2()): THREE.Vector2 {
  const c = Math.cos(h);
  const s = Math.sin(h);
  return out.set(x * c - y * s, x * s + y * c);
}

/** Puntos de muestreo del volumen del cabezal (marco local del cabezal). */
const HEAD_SAMPLES: THREE.Vector3[] = (() => {
  const out: THREE.Vector3[] = [new THREE.Vector3(0, -0.01, 0)];
  const rings: Array<[number, number, number]> = [
    [-0.04, 0.034, 8],
    [-0.09, 0.056, 10],
    [-0.14, 0.074, 12],
    [-0.193, 0.089, 16],
  ];
  for (const [y, r, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
    }
  }
  return out;
})();

function distPointSegment3(px: number, py: number, pz: number, a: THREE.Vector2, b: THREE.Vector2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((px - a.x) * abx + (py - a.y) * aby) / len2 : 0;
  t = THREE.MathUtils.clamp(t, 0, 1);
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(px - cx, py - cy, pz);
}

const tmp = new THREE.Vector2();

/** Comprueba que la pose no provoca interpenetraciones. */
export function isPoseValid(p: Pose): boolean {
  const c = forwardKinematics(p);
  const baseTop = DIM.baseTop;

  // Muñeca y codo por encima de la base.
  if (baseTop + c.W.y < 0.075) return false;

  // Cabezal frente a brazo superior: ángulo mínimo entre eje del cabezal y el brazo.
  const dh = new THREE.Vector2(Math.sin(c.head), -Math.cos(c.head));
  const back = c.u2.clone().negate();
  if (dh.dot(back) > Math.cos(rad(42))) return false;

  // Segmento del brazo superior sin el tramo final pegado a la muñeca.
  const upperEnd = c.W.clone().addScaledVector(c.u2, -0.07);

  for (const s of HEAD_SAMPLES) {
    rotZ(s.x, s.y, c.head, tmp);
    const x = c.W.x + tmp.x;
    const y = c.W.y + tmp.y;
    const z = s.z;
    const yWorld = baseTop + y;
    // Mesa
    if (yWorld < 0.012) return false;
    // Base (cilindro conservador alrededor del eje de la torreta)
    if (Math.hypot(x, z) < 0.165 && yWorld < 0.09) return false;
    // Torreta y hombro
    if (Math.hypot(x, z) < 0.05 && yWorld < baseTop + DIM.shoulderH + 0.03) return false;
    // Brazo inferior
    if (distPointSegment3(x, y, z, c.S, c.E) < 0.03) return false;
    // Brazo superior
    if (distPointSegment3(x, y, z, c.E, upperEnd) < 0.022) return false;
  }
  return true;
}

export function clampPose(p: Pose): Pose {
  const out = { ...p };
  (Object.keys(POSE_LIMITS) as PoseKey[]).forEach((k) => {
    const [lo, hi] = POSE_LIMITS[k];
    out[k] = THREE.MathUtils.clamp(out[k], lo, hi);
  });
  return out;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    yaw: a.yaw + (b.yaw - a.yaw) * t,
    shoulder: a.shoulder + (b.shoulder - a.shoulder) * t,
    elbow: a.elbow + (b.elbow - a.elbow) * t,
    head: a.head + (b.head - a.head) * t,
  };
}

/**
 * Aplica límites mecánicos: si la pose solicitada colisiona, avanza desde la pose
 * válida anterior hasta el último punto libre de colisiones (búsqueda binaria),
 * de modo que el control "hace tope" como una articulación real.
 */
export function constrainPose(prev: Pose, requested: Pose): Pose {
  const next = clampPose(requested);
  if (isPoseValid(next)) return next;
  if (!isPoseValid(prev)) return DEFAULT_POSE;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (isPoseValid(lerpPose(prev, next, mid))) lo = mid;
    else hi = mid;
  }
  return lerpPose(prev, next, lo);
}
