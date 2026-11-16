import { Suspense, useCallback, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Experience } from './scene/Experience';
import { ControlsHUD } from './components/ControlsHUD';
import { constrainPose, DEFAULT_POSE, type Pose, type PoseKey } from './scene/kinematics';
import { playSwitchClick } from './utils/audio';
import { exportGLB, exportSTL } from './utils/exporters';

function formatBytes(n: number) {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export default function App() {
  const [on, setOn] = useState(true);
  const onRef = useRef(true);
  const [dimmer, setDimmer] = useState(0.85);
  const [kelvin, setKelvin] = useState(2700);
  const [pose, setPose] = useState<Pose>(DEFAULT_POSE);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const lampRef = useRef<THREE.Group>(null);

  const toggle = useCallback(() => {
    const next = !onRef.current;
    onRef.current = next;
    setOn(next);
    playSwitchClick(next);
  }, []);

  const updatePose = useCallback((key: PoseKey, value: number) => {
    setPose((prev) => constrainPose(prev, { ...prev, [key]: value }));
  }, []);

  const runExport = useCallback(async (kind: 'glb' | 'stl') => {
    const lamp = lampRef.current;
    if (!lamp) return;
    setBusy(true);
    setStatus(`Generando .${kind.toUpperCase()}…`);
    try {
      const res = kind === 'glb' ? await exportGLB(lamp) : await exportSTL(lamp);
      setStatus(res.saved ? `Guardado ${res.filename} (${formatBytes(res.bytes)})` : 'Descarga cancelada');
    } catch (err) {
      console.error(err);
      setStatus(`Error al exportar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="app">
      <Canvas
        className="app__canvas"
        // En three r182+ PCFSoftShadowMap se fusionó con PCFShadowMap, que ahora aplica
        // un filtrado suave (disco de Vogel) controlado por shadow.radius.
        shadows={{ enabled: true, type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        camera={{ position: [0.72, 0.44, 1.0], fov: 36, near: 0.02, far: 30 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <Experience pose={pose} on={on} dimmer={dimmer} kelvin={kelvin} onToggle={toggle} exportRef={lampRef} />
        </Suspense>
      </Canvas>
      <ControlsHUD
        on={on}
        dimmer={dimmer}
        kelvin={kelvin}
        pose={pose}
        busy={busy}
        status={status}
        onToggle={toggle}
        onDimmer={setDimmer}
        onKelvin={setKelvin}
        onPose={updatePose}
        onResetPose={() => setPose(DEFAULT_POSE)}
        onExportGLB={() => void runExport('glb')}
        onExportSTL={() => void runExport('stl')}
      />
    </div>
  );
}
