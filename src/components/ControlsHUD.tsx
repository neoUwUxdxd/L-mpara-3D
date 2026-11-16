import { useMemo, useState, type CSSProperties } from 'react';
import { POSE_LIMITS, type Pose, type PoseKey } from '../scene/kinematics';
import { kelvinToCss } from '../utils/color';

export const KELVIN_RANGE: [number, number] = [2200, 5500];

export interface ControlsHUDProps {
  on: boolean;
  dimmer: number;
  kelvin: number;
  pose: Pose;
  busy: boolean;
  status: string | null;
  onToggle: () => void;
  onDimmer: (v: number) => void;
  onKelvin: (v: number) => void;
  onPose: (key: PoseKey, value: number) => void;
  onResetPose: () => void;
  onExportGLB: () => void;
  onExportSTL: () => void;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  trackStyle?: CSSProperties;
  disabled?: boolean;
}

function Slider({ label, value, min, max, step, display, onChange, trackStyle, disabled }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={`hud-slider${disabled ? ' is-disabled' : ''}`}>
      <span className="hud-slider__row">
        <span className="hud-slider__label">{label}</span>
        <span className="hud-slider__value">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%`, ...trackStyle } as CSSProperties}
      />
    </label>
  );
}

export function ControlsHUD(props: ControlsHUDProps) {
  const { on, dimmer, kelvin, pose, busy, status } = props;
  const [open, setOpen] = useState(true);

  const kelvinTrack = useMemo<CSSProperties>(() => {
    const stops: string[] = [];
    for (let i = 0; i <= 6; i++) {
      const k = KELVIN_RANGE[0] + ((KELVIN_RANGE[1] - KELVIN_RANGE[0]) * i) / 6;
      stops.push(`${kelvinToCss(k)} ${(i / 6) * 100}%`);
    }
    return { '--track': `linear-gradient(90deg, ${stops.join(', ')})` } as CSSProperties;
  }, []);

  const deg = (v: number) => `${Math.round(v)}°`;

  return (
    <aside className={`hud${open ? '' : ' hud--collapsed'}`} aria-label="Controles de la lámpara">
      <header className="hud__header">
        <div className="hud__title">
          <span className="hud__dot" style={{ background: on ? kelvinToCss(kelvin) : '#3a3a3e' }} />
          <div>
            <h1>Lámpara L‑01</h1>
            <p>Arquitecto · aluminio anodizado y latón</p>
          </div>
        </div>
        <button
          type="button"
          className="hud__collapse"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Ocultar panel' : 'Mostrar panel'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      <div className="hud__body">
        <section className="hud__section">
          <div className="hud__section-head">
            <h2>Luz</h2>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              className={`hud-toggle${on ? ' is-on' : ''}`}
              onClick={props.onToggle}
            >
              <span className="hud-toggle__knob" />
              <span className="hud-toggle__text">{on ? 'Encendida' : 'Apagada'}</span>
            </button>
          </div>
          <Slider
            label="Intensidad"
            value={dimmer}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(dimmer * 100)} %`}
            onChange={props.onDimmer}
          />
          <Slider
            label="Temperatura de color"
            value={kelvin}
            min={KELVIN_RANGE[0]}
            max={KELVIN_RANGE[1]}
            step={50}
            display={`${kelvin} K`}
            onChange={props.onKelvin}
            trackStyle={kelvinTrack}
          />
        </section>

        <section className="hud__section">
          <div className="hud__section-head">
            <h2>Articulación</h2>
            <button type="button" className="hud-link" onClick={props.onResetPose}>
              Restablecer
            </button>
          </div>
          <Slider
            label="Inclinación del brazo"
            value={pose.shoulder}
            min={POSE_LIMITS.shoulder[0]}
            max={POSE_LIMITS.shoulder[1]}
            step={0.5}
            display={deg(pose.shoulder)}
            onChange={(v) => props.onPose('shoulder', v)}
          />
          <Slider
            label="Flexión del codo"
            value={pose.elbow}
            min={POSE_LIMITS.elbow[0]}
            max={POSE_LIMITS.elbow[1]}
            step={0.5}
            display={deg(pose.elbow)}
            onChange={(v) => props.onPose('elbow', v)}
          />
          <Slider
            label="Ángulo del cabezal"
            value={pose.head}
            min={POSE_LIMITS.head[0]}
            max={POSE_LIMITS.head[1]}
            step={0.5}
            display={deg(pose.head)}
            onChange={(v) => props.onPose('head', v)}
          />
          <Slider
            label="Giro de la base"
            value={pose.yaw}
            min={POSE_LIMITS.yaw[0]}
            max={POSE_LIMITS.yaw[1]}
            step={1}
            display={deg(pose.yaw)}
            onChange={(v) => props.onPose('yaw', v)}
          />
        </section>

        <section className="hud__section">
          <h2>Exportar malla</h2>
          <div className="hud__exports">
            <button type="button" className="hud-btn" onClick={props.onExportGLB} disabled={busy}>
              Exportar .GLB
            </button>
            <button type="button" className="hud-btn" onClick={props.onExportSTL} disabled={busy}>
              Exportar .STL
            </button>
          </div>
          <p className="hud__status" role="status" aria-live="polite">
            {status ?? 'GLB en metros con materiales PBR · STL en milímetros · en Claude se entregan en .zip'}
          </p>
        </section>

        <p className="hud__hint">Clic en el interruptor de la base · arrastrar para orbitar · rueda para zoom</p>
      </div>
    </aside>
  );
}
