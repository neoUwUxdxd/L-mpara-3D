import { useEffect, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { LightingAndStage, DESK } from './LightingAndStage';
import { LampModel } from './LampModel';
import type { Pose } from './kinematics';

interface OrbitLike extends THREE.EventDispatcher<{ change: object }> {
  target: THREE.Vector3;
}

/** Limita el objetivo de la cámara para que el encuadre no se escape de la mesa. */
function CameraBounds() {
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  useEffect(() => {
    if (!controls) return;
    const clamp = () => {
      const t = controls.target;
      t.x = THREE.MathUtils.clamp(t.x, -DESK.w / 2 + 0.1, DESK.w / 2 - 0.1);
      t.y = THREE.MathUtils.clamp(t.y, 0.06, 0.55);
      t.z = THREE.MathUtils.clamp(t.z, -DESK.d / 2 + 0.05, DESK.d / 2 - 0.05);
    };
    controls.addEventListener('change', clamp);
    return () => controls.removeEventListener('change', clamp);
  }, [controls]);
  return null;
}

export interface ExperienceProps {
  pose: Pose;
  on: boolean;
  dimmer: number;
  kelvin: number;
  onToggle: () => void;
  exportRef: RefObject<THREE.Group | null>;
}

export function Experience(props: ExperienceProps) {
  return (
    <>
      <LightingAndStage />
      <LampModel {...props} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        target={[-0.06, 0.19, -0.02]}
        minDistance={0.3}
        maxDistance={2.1}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2 - 0.07}
        rotateSpeed={0.7}
        zoomSpeed={0.8}
        panSpeed={0.6}
      />
      <CameraBounds />
      <EffectComposer multisampling={4}>
        <Bloom luminanceThreshold={1} luminanceSmoothing={0.15} intensity={0.55} radius={0.72} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.3} darkness={0.45} />
      </EffectComposer>
    </>
  );
}
