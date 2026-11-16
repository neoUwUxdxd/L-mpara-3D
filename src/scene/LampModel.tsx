/**
 * Lámpara articulada de arquitecto modelada 100% de forma procedural.
 *
 * Grafo de escena (cada grupo tiene su origen exactamente en el eje de la articulación):
 *
 *  LamparaRaiz (posición sobre la mesa)
 *  ├─ Lampara  ← grupo exportable (.glb / .stl)
 *  │  ├─ Base (almohadilla, cuerpo lastrado, aro de latón, interruptor basculante)
 *  │  └─ Torreta  [pivote Y: rotación de la base]
 *  │     ├─ columna, horquilla, pernos de muelle, prensaestopas del cable
 *  │     ├─ MuellesHombro (dinámicos, entre torreta y brazo inferior)
 *  │     ├─ CableBrazo (CatmullRomCurve3 + TubeGeometry, recalculado según la pose)
 *  │     └─ Hombro  [pivote Z]
 *  │        ├─ BrazoInferior (varillas gemelas, ojales, perillas)
 *  │        ├─ MuellesCodo (dinámicos, entre brazo inferior y palanca del superior)
 *  │        └─ Codo  [pivote Z]
 *  │           ├─ BrazoSuperior (tubo central, palanca trasera, horquilla de muñeca)
 *  │           └─ Muñeca  [pivote Z]
 *  │              └─ Cabezal (pantalla torneada de doble pared, rejilla de ventilación,
 *  │                 casquillo, bombilla de vidrio, filamento, SpotLight + PointLight)
 *  └─ Cable de alimentación (sobre la mesa, no se exporta)
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getMaterials, type LampMaterials } from './Materials';
import { DIM, forwardKinematics, rotZ, type Chain, type Pose } from './kinematics';
import {
  beadRing,
  cableGeometry,
  circlePoints,
  CoilCurve,
  extrude,
  fillet,
  flutedShape,
  hexShape,
  hullShape,
  lathe,
  offsetPolyline,
  roundedCylinder,
  roundedCylinderZ,
  roundedRectPath,
  roundedRectShape,
  roundedRing,
  smoothProfile,
  springGeometry,
  v2,
  v3,
} from './geometry';
import { kelvinToColor } from '../utils/color';

type Vec3 = [number, number, number];

export const LAMP_POSITION: Vec3 = [-0.3, 0, -0.1];

/** Intensidades máximas (unidades físicas de three.js: candelas para la spot). */
const SPOT_MAX = 0.34;
const POINT_MAX = 0.012;
const CABLE_R = 0.0027;

interface PartProps {
  g: THREE.BufferGeometry;
  mat: THREE.Material;
  p?: Vec3;
  r?: Vec3;
  cast?: boolean;
  receive?: boolean;
  name?: string;
}

function Part({ g, mat, p, r, cast = true, receive = true, name }: PartProps) {
  return (
    <mesh
      geometry={g}
      material={mat}
      position={p}
      rotation={r}
      castShadow={cast}
      receiveShadow={receive}
      name={name}
    />
  );
}

// ---------------------------------------------------------------------------
// Herrajes reutilizables
// ---------------------------------------------------------------------------

function useHardwareGeometries() {
  return useMemo(() => {
    const knob = (radius: number, thickness: number) =>
      extrude(flutedShape(radius, 18, radius * 0.14), thickness, { bevel: 0.0007, crease: 0.7 });
    const cap = (radius: number) => {
      const g = lathe(
        fillet([v2(0, 0), v2(radius, 0), v2(radius, 0.0007), v2(radius * 0.5, 0.0019), v2(0, 0.0022)], [0, 0.0003, 0.0004, 0.002, 0], 4),
        40,
      );
      g.rotateX(Math.PI / 2); // eje +Z
      return g;
    };
    const hex = (r: number, t: number) => extrude(hexShape(r), t, { bevel: 0.0005, crease: 0.6 });
    const washer = (rIn: number, rOut: number, t: number) => {
      const g = roundedRing(rIn, rOut, t, t * 0.3, 40);
      g.rotateX(Math.PI / 2);
      return g;
    };
    return {
      knobL: knob(0.0095, 0.008),
      knobM: knob(0.0085, 0.0075),
      knobS: knob(0.0075, 0.007),
      capL: cap(0.0058),
      capM: cap(0.0052),
      capS: cap(0.0046),
      hexL: hex(0.0058, 0.0045),
      hexS: hex(0.005, 0.004),
      washerL: washer(0.0032, 0.0085, 0.0012),
      washerS: washer(0.003, 0.0072, 0.0012),
      stud: roundedCylinderZ(0.0025, 0.03, 0.0006, 20),
      studCap: roundedCylinderZ(0.0036, 0.0022, 0.0007, 24),
      pin: roundedCylinderZ(0.003, 0.05, 0.0006, 20),
    };
  }, []);
}

type Hardware = ReturnType<typeof useHardwareGeometries>;

/** Perilla moleteada (lado +Z) y tornillo hexagonal con arandela (lado -Z) en un eje. */
function JointHardware({
  hw,
  m,
  zOut,
  size,
}: {
  hw: Hardware;
  m: LampMaterials;
  /** Cara exterior de la pieza más externa del eje. */
  zOut: number;
  size: 'L' | 'M' | 'S';
}) {
  const knob = size === 'L' ? hw.knobL : size === 'M' ? hw.knobM : hw.knobS;
  const cap = size === 'L' ? hw.capL : size === 'M' ? hw.capM : hw.capS;
  const t = size === 'L' ? 0.008 : size === 'M' ? 0.0075 : 0.007;
  const hex = size === 'S' ? hw.hexS : hw.hexL;
  const ht = size === 'S' ? 0.004 : 0.0045;
  const washer = size === 'S' ? hw.washerS : hw.washerL;
  return (
    <group>
      <Part g={washer} mat={m.brass} p={[0, 0, zOut + 0.0006]} />
      <Part g={knob} mat={m.anodized} p={[0, 0, zOut + 0.0012 + t / 2]} />
      <Part g={cap} mat={m.brass} p={[0, 0, zOut + 0.0012 + t]} />
      <Part g={washer} mat={m.brass} p={[0, 0, -zOut - 0.0006]} />
      <Part g={hex} mat={m.brass} p={[0, 0, -zOut - 0.0012 - ht / 2]} />
    </group>
  );
}

/** Perno saliente (eje Z) para colgar los muelles en ±springZ, con tope. */
function SpringStuds({ hw, m, x, y, zFrom }: { hw: Hardware; m: LampMaterials; x: number; y: number; zFrom: number }) {
  const zEnd = DIM.springZ + 0.0045;
  const len = zEnd - zFrom;
  const scaleZ = len / 0.03;
  return (
    <group position={[x, y, 0]}>
      {[1, -1].map((s) => (
        <group key={s}>
          <mesh
            geometry={hw.stud}
            material={m.brass}
            position={[0, 0, s * (zFrom + len / 2)]}
            scale={[1, 1, scaleZ]}
            castShadow
            receiveShadow
          />
          <Part g={hw.studCap} mat={m.brass} p={[0, 0, s * (zEnd + 0.0011)]} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Muelle dinámico
// ---------------------------------------------------------------------------

function Spring({ a, b, mat }: { a: THREE.Vector3; b: THREE.Vector3; mat: THREE.Material }) {
  const len = a.distanceTo(b);
  const key = Math.round(len * 4000) / 4000;
  const geo = useMemo(() => springGeometry(key, 15, 0.0042, 0.00072, 0.0033, 0.011), [key]);
  useEffect(() => () => geo.dispose(), [geo]);
  const quat = useMemo(() => {
    const y = b.clone().sub(a).normalize();
    const x = new THREE.Vector3().crossVectors(y, new THREE.Vector3(0, 0, 1)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }, [a, b]);
  return <mesh geometry={geo} material={mat} position={a} quaternion={quat} castShadow receiveShadow />;
}

function SpringPair({ a, b, mat }: { a: THREE.Vector2; b: THREE.Vector2; mat: THREE.Material }) {
  const z = DIM.springZ;
  const pts = useMemo(
    () => [
      [v3(a.x, a.y, z), v3(b.x, b.y, z)],
      [v3(a.x, a.y, -z), v3(b.x, b.y, -z)],
    ],
    [a.x, a.y, b.x, b.y, z],
  );
  return (
    <>
      <Spring a={pts[0][0]} b={pts[0][1]} mat={mat} />
      <Spring a={pts[1][0]} b={pts[1][1]} mat={mat} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

function Base({ m, rocker, indicatorMat, onToggle }: {
  m: LampMaterials;
  rocker: RefObject<THREE.Group | null>;
  indicatorMat: THREE.Material;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  const g = useMemo(() => {
    const pad = lathe(
      fillet([v2(0, 0), v2(0.108, 0), v2(0.108, 0.0042), v2(0, 0.0042)], [0, 0.0016, 0.0012, 0], 4),
      96,
    );
    const body = lathe(
      fillet(
        [v2(0, 0.0038), v2(0.111, 0.0038), v2(0.115, 0.009), v2(0.115, 0.029), v2(0.106, 0.0366), v2(0.07, 0.038), v2(0, 0.038)],
        [0, 0.002, 0.003, 0.004, 0.006, 0.02, 0],
        8,
      ),
      128,
    );
    const trim = roundedRing(0.1146, 0.1163, 0.0042, 0.0008, 128);

    // Interruptor basculante.
    const bezelShape = roundedRectShape(0.027, 0.018, 0.0045);
    const hole = new THREE.Path();
    roundedRectPath(hole, 0.0202, 0.0112, 0.0026, 0, 0, true);
    bezelShape.holes.push(hole);
    const bezel = extrude(bezelShape, 0.0036, { bevel: 0.0009, crease: 0.7 });
    bezel.rotateX(-Math.PI / 2);
    const well = extrude(roundedRectShape(0.0204, 0.0114, 0.0026), 0.003, { bevel: 0.0004 });
    well.rotateX(-Math.PI / 2);
    const rockerShape = new THREE.Shape(
      fillet(
        [v2(-0.0093, -0.0025), v2(0.0093, -0.0025), v2(0.0093, 0.0056), v2(0, 0.0031), v2(-0.0093, 0.0056), v2(-0.0093, -0.0025)],
        [0, 0.0006, 0.0012, 0.004, 0.0012, 0],
        6,
      ),
    );
    const rockerGeo = extrude(rockerShape, 0.0092, { bevel: 0.0008, crease: 0.8 });
    const dot = roundedCylinder(0.0011, 0.0008, 0.0003, 20);
    const hit = new THREE.BoxGeometry(0.032, 0.016, 0.022);

    // Prensaestopas del cable de alimentación (eje -X).
    const gland = lathe(
      fillet(
        [v2(0, -0.002), v2(0.0062, -0.002), v2(0.0062, 0.004), v2(0.0052, 0.0062), v2(0.005, 0.01), v2(0.0043, 0.0125), v2(0.0041, 0.0162), v2(0.0033, 0.019), v2(0, 0.019)],
        [0, 0.0008, 0.0012, 0.001, 0.001, 0.001, 0.001, 0.001, 0],
        4,
      ),
      32,
    );
    gland.rotateZ(Math.PI / 2);
    return { pad, body, trim, bezel, well, rockerGeo, dot, hit, gland };
  }, []);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onToggle();
  };

  const top = DIM.baseTop;
  // Pendiente de la cara superior del balancín (para alinear el piloto).
  const slope = Math.atan2(0.0025, 0.0093);

  return (
    <group name="Base">
      <Part g={g.pad} mat={m.rubber} name="AlmohadillaCaucho" />
      <Part g={g.body} mat={m.anodized} name="CuerpoLastrado" />
      <Part g={g.trim} mat={m.brass} p={[0, 0.0175, 0]} name="AroLaton" />
      <Part g={g.gland} mat={m.rubber} p={[-0.1125, 0.017, 0]} name="PrensaestopasAlimentacion" />

      <group name="Interruptor" position={[0.056, top, 0.046]} rotation={[0, -0.72, 0]}>
        <Part g={g.bezel} mat={m.brass} p={[0, 0.0008, 0]} name="MarcoInterruptor" />
        <Part g={g.well} mat={m.plastic} p={[0, 0.0001, 0]} cast={false} />
        <group ref={rocker} position={[0, 0.0016, 0]} name="Balancin">
          <Part g={g.rockerGeo} mat={m.plastic} p={[0, 0.0012, 0]} />
          <Part g={g.dot} mat={indicatorMat} p={[0.0062, 0.0012 + 0.0031 + 0.0025 * (0.0062 / 0.0093) + 0.0001, 0]} r={[0, 0, -slope]} cast={false} />
        </group>
        <mesh
          geometry={g.hit}
          position={[0, 0.006, 0]}
          onClick={handleClick}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
          userData={{ noExport: true }}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Torreta (gira en Y)
// ---------------------------------------------------------------------------

function Turret({ m, hw }: { m: LampMaterials; hw: Hardware }) {
  const g = useMemo(() => {
    const collar = roundedCylinder(0.026, 0.0075, 0.0018, 64, false);
    const column = lathe(
      fillet([v2(0, 0.007), v2(0.0195, 0.007), v2(0.0195, 0.03), v2(0, 0.03)], [0, 0, 0.0025, 0], 5),
      64,
    );
    const a = DIM.shoulderSpringAnchor;
    const plateShape = hullShape([
      ...circlePoints(0, DIM.shoulderH, 0.0115, 32),
      ...circlePoints(a.x, a.y, 0.0068, 20),
      v2(-0.017, 0.022),
      v2(0.017, 0.022),
      ...circlePoints(0.012, 0.03, 0.005, 12),
    ]);
    const plate = extrude(plateShape, 0.005, { bevel: 0.0009, crease: 0.7 });
    const glandTop = lathe(
      fillet([v2(0, 0), v2(0.0052, 0), v2(0.0052, 0.003), v2(0.0038, 0.0058), v2(0.0034, 0.008), v2(0, 0.008)], [0, 0.0006, 0.001, 0.001, 0.0008, 0], 4),
      28,
    );
    return { collar, column, plate, glandTop };
  }, []);
  const a = DIM.shoulderSpringAnchor;
  return (
    <group name="TorretaPiezas">
      <Part g={g.collar} mat={m.brass} name="CollarinLaton" />
      <Part g={g.column} mat={m.anodized} name="Columna" />
      <Part g={g.plate} mat={m.anodized} p={[0, 0, 0.0205]} name="HorquillaIzq" />
      <Part g={g.plate} mat={m.anodized} p={[0, 0, -0.0205]} name="HorquillaDer" />
      <Part g={g.glandTop} mat={m.rubber} p={[-0.006, 0.0285, 0]} name="SalidaCable" />
      <SpringStuds hw={hw} m={m} x={a.x} y={a.y} zFrom={0.0225} />
      <group position={[0, DIM.shoulderH, 0]}>
        <Part g={hw.pin} mat={m.brass} />
        <Part g={hw.washerS} mat={m.brass} p={[0, 0, 0.017]} />
        <Part g={hw.washerS} mat={m.brass} p={[0, 0, -0.017]} />
        <JointHardware hw={hw} m={m} zOut={0.023} size="L" />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Brazo inferior (varillas gemelas)
// ---------------------------------------------------------------------------

function LowerArm({ m, hw }: { m: LampMaterials; hw: Hardware }) {
  const L1 = DIM.L1;
  const g = useMemo(() => {
    const rod = roundedCylinder(0.0045, L1 - 0.012, 0.0015, 28, false);
    const eye = roundedCylinderZ(0.0105, 0.009, 0.0016, 40);
    const ferrule = roundedCylinder(0.0058, 0.006, 0.0012, 28);
    const clamp = roundedCylinder(0.0064, 0.008, 0.0016, 28);
    return { rod, eye, ferrule, clamp };
  }, [L1]);
  const zs = [0.0115, -0.0115];
  return (
    <group name="BrazoInferiorPiezas">
      {zs.map((z) => (
        <group key={z}>
          <Part g={g.rod} mat={m.anodized} p={[0, 0.006, z]} />
          <Part g={g.eye} mat={m.anodized} p={[0, 0, z]} />
          <Part g={g.eye} mat={m.anodized} p={[0, L1, z]} />
          <Part g={g.ferrule} mat={m.brass} p={[0, 0.0135, z]} />
          <Part g={g.ferrule} mat={m.brass} p={[0, L1 - 0.0135, z]} />
          <Part g={g.clamp} mat={m.anodized} p={[0, DIM.shoulderSpringOnArm, z]} />
          <Part g={g.clamp} mat={m.anodized} p={[0, DIM.elbowSpringOnLower, z]} />
        </group>
      ))}
      <SpringStuds hw={hw} m={m} x={0} y={DIM.shoulderSpringOnArm} zFrom={0.016} />
      <SpringStuds hw={hw} m={m} x={0} y={DIM.elbowSpringOnLower} zFrom={0.016} />
      <group position={[0, L1, 0]}>
        <Part g={hw.pin} mat={m.brass} />
        <JointHardware hw={hw} m={m} zOut={0.016} size="M" />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Brazo superior (tubo central + palanca + horquilla)
// ---------------------------------------------------------------------------

function UpperArm({ m, hw }: { m: LampMaterials; hw: Hardware }) {
  const L2 = DIM.L2;
  const lever = DIM.elbowLever;
  const g = useMemo(() => {
    const fitting = extrude(
      hullShape([...circlePoints(0, 0, 0.0105, 32), ...circlePoints(0, -lever, 0.0066, 24), v2(-0.0072, 0.02), v2(0.0072, 0.02)]),
      0.011,
      { bevel: 0.0012, crease: 0.7 },
    );
    const tube = roundedCylinder(0.0065, L2 - 0.042, 0.002, 36, false);
    const ferrule = roundedCylinder(0.0078, 0.006, 0.0013, 32);
    const forkShape = hullShape([...circlePoints(0, L2, 0.0095, 32), v2(-0.0088, L2 - 0.03), v2(0.0088, L2 - 0.03)]);
    const fork = extrude(forkShape, 0.005, { bevel: 0.0009, crease: 0.7 });
    const bridge = extrude(roundedRectShape(0.0176, 0.012, 0.003), 0.024, { bevel: 0.0012, crease: 0.7 });
    return { fitting, tube, ferrule, fork, bridge };
  }, [L2, lever]);
  return (
    <group name="BrazoSuperiorPiezas">
      <Part g={g.fitting} mat={m.anodized} name="RotulaCodo" />
      <Part g={g.tube} mat={m.anodized} p={[0, 0.016, 0]} name="TuboSuperior" />
      <Part g={g.ferrule} mat={m.brass} p={[0, 0.019, 0]} />
      <Part g={g.ferrule} mat={m.brass} p={[0, L2 - 0.034, 0]} />
      <Part g={g.bridge} mat={m.anodized} p={[0, L2 - 0.026, 0]} />
      <Part g={g.fork} mat={m.anodized} p={[0, 0, 0.0095]} />
      <Part g={g.fork} mat={m.anodized} p={[0, 0, -0.0095]} />
      <SpringStuds hw={hw} m={m} x={0} y={-lever} zFrom={0.0055} />
      <group position={[0, L2, 0]}>
        <Part g={hw.pin} mat={m.brass} />
        <JointHardware hw={hw} m={m} zOut={0.012} size="S" />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Cabezal
// ---------------------------------------------------------------------------

function Head({
  m,
  spotRef,
  pointRef,
}: {
  m: LampMaterials;
  spotRef: RefObject<THREE.SpotLight | null>;
  pointRef: RefObject<THREE.PointLight | null>;
}) {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.userData.noExport = true;
    o.name = 'ObjetivoFoco';
    return o;
  }, []);

  const g = useMemo(() => {
    const tab = roundedCylinderZ(0.0095, 0.0104, 0.0015, 36);
    const stem = roundedCylinder(0.0056, 0.016, 0.0015, 28);

    // Tapa abombada de la rejilla.
    const crownCap = lathe(
      fillet(
        [v2(0, -0.0186), v2(0.0304, -0.0186), v2(0.0304, -0.0156), v2(0.022, -0.0112), v2(0, -0.0104)],
        [0, 0, 0.0016, 0.006, 0],
        6,
      ),
      72,
    );
    // Lamas de ventilación (huecos entre ellas).
    const ribCount = 20;
    const ribs: THREE.BufferGeometry[] = [];
    const ribBase = extrude(roundedRectShape(0.0042, 0.0135, 0.0012), 0.0018, { bevel: 0.0005, crease: 0.7 });
    for (let i = 0; i < ribCount; i++) {
      const a = (i / ribCount) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) continue; // hueco para el pasacables
      const rib = ribBase.clone();
      rib.rotateY(Math.PI / 2 - a);
      rib.translate(0.0293 * Math.cos(a), -0.025, 0.0293 * Math.sin(a));
      ribs.push(rib);
    }
    const ribsGeo = mergeGeometries(ribs) ?? ribBase;
    const crownRing = roundedRing(0.0284, 0.0313, 0.0046, 0.0011, 72);
    // Deflector interior oscuro visible a través de la rejilla.
    const baffle = lathe([v2(0.0255, -0.0318), v2(0.0255, -0.0186)], 48);

    // Pantalla torneada de doble pared: perfil medio -> paredes exterior e interior.
    const mid = smoothProfile(
      [
        v2(0.083, DIM.rimY),
        v2(0.077, -0.16),
        v2(0.068, -0.126),
        v2(0.055, -0.097),
        v2(0.0395, -0.073),
        v2(0.0306, -0.056),
        v2(0.0299, -0.036),
      ],
      72,
    );
    const t = 0.0014;
    const outerPts = offsetPolyline(mid, t / 2); // abajo -> arriba (normales hacia fuera)
    const innerPts = offsetPolyline(mid, -t / 2).reverse(); // arriba -> abajo (normales hacia el eje)
    const shadeOuter = lathe(outerPts, 128, 8);
    const shadeInner = lathe(innerPts, 128, 8);
    const rim = mid[0];
    const shadeRim = beadRing(rim.x, 0.0021, rim.y, 128);
    const shadeTop = lathe([outerPts[outerPts.length - 1], innerPts[0]], 96);

    const grommet = lathe(
      fillet([v2(0, 0), v2(0.0048, 0), v2(0.0048, 0.0028), v2(0.0038, 0.0044), v2(0.0036, 0.006), v2(0, 0.006)], [0, 0.0005, 0.0008, 0.0006, 0.0005, 0], 4),
      28,
    );
    grommet.rotateX(-Math.PI / 2); // eje -Z

    // Portalámparas de baquelita con estrías de agarre.
    const socket = lathe(
      fillet(
        [
          v2(0, -0.062),
          v2(0.0146, -0.062),
          v2(0.0166, -0.058),
          v2(0.0166, -0.0505),
          v2(0.0174, -0.0485),
          v2(0.0174, -0.0445),
          v2(0.0166, -0.0425),
          v2(0.0166, -0.0305),
          v2(0.0146, -0.0225),
          v2(0.012, -0.019),
          v2(0, -0.019),
        ],
        [0, 0.0008, 0.0012, 0.0006, 0.0005, 0.0005, 0.0006, 0.002, 0.002, 0.001, 0],
        4,
      ),
      56,
    );
    const socketRing = roundedRing(0.0126, 0.0153, 0.003, 0.0006, 56);

    // Casquillo roscado de la bombilla (rosca Edison). La ampolla entra por abajo.
    const thread: THREE.Vector2[] = [v2(0, -0.0796), v2(0.0114, -0.0796), v2(0.0122, -0.0789)];
    const pitch = 0.0034;
    for (let y = -0.0782; y <= -0.0636; y += 0.00025) {
      const phase = ((y + 0.0782) / pitch) * Math.PI * 2;
      thread.push(v2(0.0121 + 0.00075 * Math.sin(phase), y));
    }
    thread.push(v2(0.0112, -0.0626), v2(0.0062, -0.0618), v2(0, -0.0616));
    const cap = lathe(thread, 56, 30);

    // Ampolla de vidrio (forma A) con cuello cóncavo.
    const R = 0.03;
    const cy = DIM.bulbCenterY - 0.002;
    const ctrl: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const th = -Math.PI / 2 + (i / 14) * (Math.PI / 2 + 0.55);
      ctrl.push(v2(Math.max(0, R * Math.cos(th)), cy + R * Math.sin(th)));
    }
    ctrl[0].x = 0;
    ctrl.push(v2(0.0196, -0.0945), v2(0.0137, -0.0842), v2(0.0112, -0.0797), v2(0.0106, -0.0774));
    const bulbPts = new THREE.SplineCurve(ctrl).getSpacedPoints(64);
    bulbPts[0].x = 0;
    const glass = lathe(bulbPts, 64);

    // Vástago, hilos conductores y filamento espiral.
    const stemGlass = lathe(
      fillet([v2(0, -0.1005), v2(0.0026, -0.1005), v2(0.0024, -0.09), v2(0.0045, -0.082), v2(0.0085, -0.0775), v2(0, -0.0775)], [0, 0.0008, 0.0006, 0.002, 0.001, 0], 4),
      24,
    );
    const wireTube = (pts: THREE.Vector3[]) =>
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.00028, 5, false);
    const leads = mergeGeometries([
      wireTube([v3(-0.0012, -0.099, 0), v3(-0.004, -0.104, 0), v3(-0.0085, -0.1095, 0), v3(-0.0098, -0.1132, 0)]),
      wireTube([v3(0.0012, -0.099, 0), v3(0.004, -0.104, 0), v3(0.0085, -0.1095, 0), v3(0.0098, -0.1132, 0)]),
      wireTube([v3(0, -0.1, 0), v3(0, -0.115, 0.0004), v3(0, -0.1262, 0.0006)]),
      wireTube([v3(-0.0012, -0.1262, 0.0006), v3(0, -0.1266, 0.0007), v3(0.0012, -0.1262, 0.0006)]),
    ]) ?? new THREE.BufferGeometry();
    const filamentBase = new THREE.CatmullRomCurve3([
      v3(-0.0098, -0.1132, 0),
      v3(-0.0068, -0.1215, 0.0003),
      v3(0, -0.1272, 0.0007),
      v3(0.0068, -0.1215, 0.0003),
      v3(0.0098, -0.1132, 0),
    ]);
    const filament = new THREE.TubeGeometry(new CoilCurve(filamentBase, 38, 0.00075), 38 * 12, 0.00022, 5, false);

    return {
      tab,
      stem,
      crownCap,
      ribsGeo,
      crownRing,
      baffle,
      shadeOuter,
      shadeInner,
      shadeRim,
      shadeTop,
      grommet,
      socket,
      socketRing,
      cap,
      glass,
      stemGlass,
      leads,
      filament,
    };
  }, []);

  const lightY = DIM.bulbCenterY - 0.002;

  return (
    <group name="CabezalPiezas">
      <Part g={g.tab} mat={m.anodized} name="LenguetaMuneca" />
      <Part g={g.stem} mat={m.brass} p={[0, -0.009, 0]} name="VastagoCabezal" />
      <Part g={g.crownCap} mat={m.anodized} name="TapaVentilacion" />
      <Part g={g.ribsGeo} mat={m.anodized} name="LamasVentilacion" />
      <Part g={g.crownRing} mat={m.anodized} p={[0, -0.0336, 0]} />
      <Part g={g.baffle} mat={m.bakelite} cast={false} />
      <Part g={g.grommet} mat={m.rubber} p={[0, -0.025, -0.0283]} name="PasacablesCabezal" />
      <Part g={g.shadeOuter} mat={m.anodized} name="PantallaExterior" />
      <Part g={g.shadeInner} mat={m.shadeInner} name="PantallaInterior" cast={false} />
      <Part g={g.shadeRim} mat={m.anodized} name="BordeEnrollado" />
      <Part g={g.shadeTop} mat={m.anodized} cast={false} />
      <Part g={g.socket} mat={m.bakelite} cast={false} name="Portalamparas" />
      <Part g={g.socketRing} mat={m.brass} p={[0, -0.0625, 0]} cast={false} name="CasquilloLaton" />
      <Part g={g.cap} mat={m.aluminum} cast={false} name="RoscaBombilla" />
      <Part g={g.stemGlass} mat={m.stemGlass} cast={false} />
      <Part g={g.leads} mat={m.wire} cast={false} />
      <Part g={g.filament} mat={m.filament} cast={false} receive={false} name="Filamento" />
      <Part g={g.glass} mat={m.glass} cast={false} receive={false} name="AmpollaVidrio" />

      <spotLight
        ref={spotRef}
        position={[0, lightY, 0]}
        target={target}
        angle={0.82}
        penumbra={0.8}
        decay={2}
        distance={0}
        intensity={0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.012}
        shadow-radius={6}
        shadow-camera-near={0.02}
        shadow-camera-far={3}
      />
      <pointLight ref={pointRef} position={[0, lightY, 0]} intensity={0} distance={0.17} decay={2} />
      <primitive object={target} position={[0, -1, 0]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Cables
// ---------------------------------------------------------------------------

/** Trayectoria del cable desde la torreta hasta el cabezal, en el marco de la torreta. */
function armCablePoints(c: Chain): THREE.Vector3[] {
  const { S, E, W, u1, u2, n1, n2, head } = c;
  const L1 = DIM.L1;
  const P = (v: THREE.Vector2, z: number) => v3(v.x, v.y, z);
  const at = (o: THREE.Vector2, a: THREE.Vector2, da: number, b: THREE.Vector2, db: number) =>
    o.clone().addScaledVector(a, da).addScaledVector(b, db);

  const inner = u2.clone().sub(u1).normalize();
  const armBack = W.clone().addScaledVector(u2, -0.05);
  const entry = rotZ(0, -0.025, head).add(W);
  const dA = u2.clone().negate();
  const dB = rotZ(0, -1, head);
  const sum = dA.clone().add(dB);
  const slackDir = sum.length() < 0.3 ? n2.clone().negate() : sum.normalize();
  const slack = W.clone().addScaledVector(slackDir, 0.032);

  return [
    v3(-0.006, 0.03, 0),
    v3(-0.006, 0.038, 0),
    P(at(S, n1, 0.022, u1, -0.004), 0),
    P(at(S, u1, 0.05, n1, 0.008), 0),
    P(at(S, u1, 0.12, n1, 0.002), 0),
    P(at(S, u1, 0.19, n1, 0), 0),
    P(at(S, u1, 0.26, n1, -0.004), 0),
    P(at(S, u1, L1 - 0.075, n1, -0.012), -0.002),
    P(at(S, u1, L1 - 0.04, n1, -0.016), -0.02),
    P(E.clone().addScaledVector(inner, 0.03), -0.029),
    P(at(E, u2, 0.06, n2, -0.004), -0.027),
    P(at(E, u2, 0.15, n2, -0.002), -0.026),
    P(at(E, u2, 0.24, n2, -0.002), -0.026),
    P(armBack, -0.028),
    P(slack, -0.034),
    P(entry, -0.037),
    P(entry, -0.03),
  ];
}

function ArmCable({ chain, mat }: { chain: Chain; mat: THREE.Material }) {
  const geo = useMemo(() => cableGeometry(armCablePoints(chain), CABLE_R), [chain]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow name="CableBrazo" />;
}

function PowerCord({ mat }: { mat: THREE.Material }) {
  const geo = useMemo(() => {
    const r = CABLE_R + 0.0002;
    return cableGeometry(
      [
        v3(-0.118, 0.017, 0),
        v3(-0.132, 0.017, 0),
        v3(-0.15, 0.0115, 0.004),
        v3(-0.172, r, 0.012),
        v3(-0.22, r, 0.03),
        v3(-0.268, r, 0.004),
        v3(-0.29, r, -0.09),
        v3(-0.272, r, -0.19),
        v3(-0.256, r, -0.262),
        v3(-0.252, r - 0.0005, -0.2855),
        v3(-0.2505, -0.006, -0.2935),
        v3(-0.249, -0.035, -0.2965),
        v3(-0.248, -0.32, -0.3),
      ],
      CABLE_R,
    );
  }, []);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow name="CableAlimentacion" />;
}

// ---------------------------------------------------------------------------
// Lámpara completa
// ---------------------------------------------------------------------------

export interface LampModelProps {
  pose: Pose;
  on: boolean;
  dimmer: number;
  kelvin: number;
  onToggle: () => void;
  exportRef: RefObject<THREE.Group | null>;
}

export function LampModel({ pose, on, dimmer, kelvin, onToggle, exportRef }: LampModelProps) {
  const { lamp: m } = getMaterials();
  const hw = useHardwareGeometries();
  const chain = useMemo(() => forwardKinematics(pose), [pose]);

  const spotRef = useRef<THREE.SpotLight>(null);
  const pointRef = useRef<THREE.PointLight>(null);
  const rockerRef = useRef<THREE.Group>(null);
  const anim = useRef({ level: on ? dimmer : 0, heat: on ? dimmer : 0, rocker: on ? 1 : -1, rockerVel: 0, led: on ? 1 : 0 });
  const color = useMemo(() => new THREE.Color(), []);
  const fColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const a = anim.current;
    const target = on ? dimmer : 0;
    // Transición suave de intensidad + inercia térmica del filamento (se enfría más lento).
    a.level = THREE.MathUtils.damp(a.level, target, 6, dt);
    a.heat = THREE.MathUtils.damp(a.heat, target, target > a.heat ? 9 : 3.5, dt);
    a.led = THREE.MathUtils.damp(a.led, on ? 1 : 0, 12, dt);

    // Al atenuar, el tungsteno se enfría y la luz se vuelve más cálida.
    const effK = Math.max(1500, kelvin - (1 - a.heat) * 700);
    kelvinToColor(effK, color);
    kelvinToColor(Math.max(1400, effK - 350), fColor);

    if (spotRef.current) {
      spotRef.current.intensity = SPOT_MAX * a.level;
      spotRef.current.color.copy(color);
    }
    if (pointRef.current) {
      pointRef.current.intensity = POINT_MAX * a.level;
      pointRef.current.color.copy(color);
    }
    m.filament.emissive.copy(fColor);
    m.filament.emissiveIntensity = 55 * Math.pow(a.heat, 1.6);
    m.glass.emissive.copy(color);
    m.glass.emissiveIntensity = 0.18 * a.heat;
    m.shadeInner.emissive.copy(color);
    m.shadeInner.emissiveIntensity = 0.14 * a.level;
    m.indicator.emissiveIntensity = 3 * a.led;

    // Balancín: muelle amortiguado (ligero rebote mecánico), integrado en subpasos.
    const tgt = on ? 1 : -1;
    const steps = 4;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      a.rockerVel += ((tgt - a.rocker) * 1100 - a.rockerVel * 40) * h;
      a.rocker += a.rockerVel * h;
    }
    if (rockerRef.current) rockerRef.current.rotation.z = -0.17 * a.rocker;
  });

  const rad = THREE.MathUtils.degToRad;
  const shoulderB = useMemo(
    () => chain.S.clone().addScaledVector(chain.u1, DIM.shoulderSpringOnArm),
    [chain],
  );
  const elbowA = useMemo(() => v2(0, DIM.elbowSpringOnLower), []);
  const elbowB = useMemo(() => {
    const e = rad(pose.elbow);
    return v2(-DIM.elbowLever * Math.sin(e), DIM.L1 - DIM.elbowLever * Math.cos(e));
  }, [pose.elbow, rad]);

  return (
    <group name="LamparaRaiz" position={LAMP_POSITION}>
      <group ref={exportRef} name="Lampara_Arquitecto">
        <Base m={m} rocker={rockerRef} indicatorMat={m.indicator} onToggle={onToggle} />
        <group name="Torreta" position={[DIM.turretX, DIM.baseTop, 0]} rotation={[0, rad(pose.yaw), 0]}>
          <Turret m={m} hw={hw} />
          <SpringPair a={DIM.shoulderSpringAnchor} b={shoulderB} mat={m.spring} />
          <ArmCable chain={chain} mat={m.cable} />
          <group name="Hombro" position={[0, DIM.shoulderH, 0]} rotation={[0, 0, -rad(pose.shoulder)]}>
            <LowerArm m={m} hw={hw} />
            <SpringPair a={elbowA} b={elbowB} mat={m.spring} />
            <group name="Codo" position={[0, DIM.L1, 0]} rotation={[0, 0, -rad(pose.elbow)]}>
              <UpperArm m={m} hw={hw} />
              <group name="Muneca" position={[0, DIM.L2, 0]} rotation={[0, 0, chain.head + chain.t2]}>
                <Head m={m} spotRef={spotRef} pointRef={pointRef} />
              </group>
            </group>
          </group>
        </group>
      </group>
      <PowerCord mat={m.cable} />
    </group>
  );
}
