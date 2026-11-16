/**
 * Escenario de estudio: escritorio minimalista de nogal oscuro, fondo neutro tipo
 * ciclorama, iluminación ambiental tenue con sombras suaves y un entorno HDR
 * generado en la GPU con Lightformers (sin descargar mapas HDRI).
 */
import { useMemo } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { getMaterials } from './Materials';
import { extrude, hexShape, lathe, fillet, roundedRectShape, v2 } from './geometry';

export const DESK = { w: 1.5, d: 0.78, t: 0.035, legH: 0.705 } as const;
const FLOOR_Y = -(DESK.t + DESK.legH);
const FOG_COLOR = '#1c1c1f';

function Backdrop() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(8, 48, 32);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const horizon = new THREE.Color(FOG_COLOR);
    const top = new THREE.Color('#0f0f11');
    const bottom = new THREE.Color('#1a1a1c');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 8;
      if (y >= 0) c.copy(horizon).lerp(top, Math.pow(y, 0.7));
      else c.copy(horizon).lerp(bottom, Math.min(1, -y * 2));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  return (
    <mesh geometry={geo} position={[0, 0.5, 0]}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

function Desk() {
  const { stage } = getMaterials();
  const g = useMemo(() => {
    const top = extrude(roundedRectShape(DESK.w, DESK.d, 0.018), DESK.t, {
      bevel: 0.0035,
      bevelSegments: 5,
      crease: 0,
      uvScale: 1 / 1.6,
    });
    top.rotateX(-Math.PI / 2);
    top.translate(0, -DESK.t / 2, 0);
    // Compensa la relación de aspecto 2:1 de la textura de madera (veta a lo largo de X).
    const uv = top.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 2 + 0.17);
    uv.needsUpdate = true;
    const leg = extrude(roundedRectShape(0.034, 0.034, 0.006), DESK.legH, { bevel: 0.002, crease: 0.7 });
    leg.rotateX(-Math.PI / 2);
    const rail = extrude(roundedRectShape(0.03, 0.02, 0.004), DESK.d - 0.16, { bevel: 0.0015, crease: 0.7 });
    return { top, leg, rail };
  }, []);
  const lx = DESK.w / 2 - 0.07;
  const lz = DESK.d / 2 - 0.06;
  const legY = -DESK.t - DESK.legH / 2;
  return (
    <group name="Escritorio">
      <mesh geometry={g.top} material={stage.wood} receiveShadow castShadow />
      {[
        [lx, lz],
        [-lx, lz],
        [lx, -lz],
        [-lx, -lz],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} geometry={g.leg} material={stage.steel} position={[x, legY, z]} castShadow receiveShadow />
      ))}
      {[lx, -lx].map((x) => (
        <mesh key={x} geometry={g.rail} material={stage.steel} position={[x, -DESK.t - 0.012, 0]} castShadow />
      ))}
    </group>
  );
}

/** Pequeños objetos que dan escala: hoja de papel, lápiz y cuaderno cerrado. */
function Props() {
  const { stage } = getMaterials();
  const g = useMemo(() => {
    const paper = extrude(roundedRectShape(0.21, 0.297, 0.0015), 0.0004, { bevel: 0.0001, crease: 0, uvScale: 20 });
    paper.rotateX(-Math.PI / 2);
    const cover = extrude(roundedRectShape(0.152, 0.215, 0.004), 0.0018, { bevel: 0.0006, crease: 0.7, uvScale: 30 });
    cover.rotateX(-Math.PI / 2);
    const pages = extrude(roundedRectShape(0.146, 0.209, 0.002), 0.0105, { bevel: 0.0005, crease: 0.7 });
    pages.rotateX(-Math.PI / 2);
    const pencilBody = extrude(hexShape(0.0036), 0.15, { bevel: 0.0003, crease: 0.6 });
    const tip = lathe(fillet([v2(0, 0), v2(0.0001, 0), v2(0.0031, 0.019), v2(0, 0.019)], [0, 0, 0, 0], 2), 24);
    tip.rotateX(-Math.PI / 2);
    return { paper, cover, pages, pencilBody, tip };
  }, []);
  const pencilMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#1b1b1d', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    [],
  );
  const woodTip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c8a27a', roughness: 0.8 }), []);
  return (
    <group name="Atrezo">
      <mesh geometry={g.paper} material={stage.paper} position={[0.07, 0.0002, 0.08]} rotation={[0, 0.22, 0]} receiveShadow castShadow />
      <group position={[0.15, 0.0038, 0.12]} rotation={[0, -0.9, 0]}>
        <mesh geometry={g.pencilBody} material={pencilMat} castShadow receiveShadow />
        <mesh geometry={g.tip} material={woodTip} position={[0, 0, -0.075]} castShadow />
      </group>
      <group position={[0.43, 0, -0.17]} rotation={[0, -0.32, 0]}>
        <mesh geometry={g.cover} material={stage.notebook} position={[0, 0.0009, 0]} castShadow receiveShadow />
        <mesh geometry={g.pages} material={stage.pages} position={[0.002, 0.0018 + 0.00525, 0]} castShadow receiveShadow />
        <mesh geometry={g.cover} material={stage.notebook} position={[0, 0.0123 + 0.0009, 0]} castShadow receiveShadow />
      </group>
    </group>
  );
}

export function LightingAndStage() {
  const { stage } = getMaterials();
  return (
    <>
      <fog attach="fog" args={[FOG_COLOR, 3.2, 7.5]} />

      {/* Entorno de estudio para reflejos PBR, renderizado una sola vez a un cubemap. */}
      <Environment resolution={256} frames={1} environmentIntensity={0.6}>
        <color attach="background" args={['#0d0d0f']} />
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 3, 0.5]} rotation={[Math.PI / 2, 0, 0]} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#dfe7ff" position={[-3, 1.2, 1]} rotation={[0, Math.PI / 2, 0]} scale={[2.2, 1.2, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#fff1df" position={[3, 1.4, -1]} rotation={[0, -Math.PI / 2, 0]} scale={[1.4, 2.6, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#ffffff" position={[0, 0.8, -3]} scale={[5, 0.6, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#ffffff" position={[1.5, 2, 3]} scale={1.2} />
      </Environment>

      {/* Luz ambiental tenue de ventana (fría) con sombras suaves. */}
      <directionalLight
        position={[-1.4, 2.3, 1.2]}
        intensity={1.1}
        color="#d6e0ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-radius={10}
        shadow-camera-left={-1}
        shadow-camera-right={1}
        shadow-camera-top={1}
        shadow-camera-bottom={-1}
        shadow-camera-near={0.5}
        shadow-camera-far={6}
      />
      <hemisphereLight args={['#bcc6d8', '#2b1d13', 0.2]} />

      <Backdrop />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} material={stage.floor} receiveShadow>
        <circleGeometry args={[6.5, 64]} />
      </mesh>
      <Desk />
      <Props />
    </>
  );
}
