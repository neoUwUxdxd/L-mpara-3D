import * as THREE from 'three';

/**
 * Convierte una temperatura de color (Kelvin) a RGB aproximado (algoritmo de Tanner Helland),
 * devolviendo un THREE.Color en el espacio de trabajo lineal.
 */
export function kelvinToColor(kelvin: number, target = new THREE.Color()): THREE.Color {
  const t = THREE.MathUtils.clamp(kelvin, 1000, 40000) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => THREE.MathUtils.clamp(v, 0, 255) / 255;
  return target.setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

/** Versión CSS (sRGB) para la interfaz. */
export function kelvinToCss(kelvin: number): string {
  const col = kelvinToColor(kelvin);
  return `#${col.getHexString(THREE.SRGBColorSpace)}`;
}
