/**
 * Materiales PBR y texturas procedurales generadas con Canvas 2D.
 * No se carga ningún archivo externo: cepillado de metal, grano anodizado,
 * veta de madera y trenzado textil se calculan en tiempo de ejecución.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Ruido determinista y tileable
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de valor 2D con periodo entero (tileable) y suavizado quíntico. */
function createValueNoise(seed: number) {
  const rand = mulberry32(seed);
  const SIZE = 256;
  const table = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < table.length; i++) table[i] = rand();
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number, periodX = SIZE, periodY = SIZE): number => {
    // Los periodos deben ser enteros para indexar la tabla (y para que el ruido sea tileable).
    const px = Math.max(1, Math.round(periodX));
    const py = Math.max(1, Math.round(periodY));
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % px) + px) % px;
    const y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px;
    const y1 = (y0 + 1) % py;
    const a = table[(y0 % SIZE) * SIZE + (x0 % SIZE)];
    const b = table[(y0 % SIZE) * SIZE + (x1 % SIZE)];
    const c = table[(y1 % SIZE) * SIZE + (x0 % SIZE)];
    const d = table[(y1 % SIZE) * SIZE + (x1 % SIZE)];
    const u = fade(xf);
    const v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

type Noise = ReturnType<typeof createValueNoise>;

function fbm(noise: Noise, x: number, y: number, px: number, py: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f, px * f, py * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  const img = ctx.createImageData(w, h);
  return { canvas, ctx, img };
}

function toTexture(canvas: HTMLCanvasElement, color: boolean, anisotropy = 8): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Escribe un canal escalar (0..1) en escala de grises. */
function grayCanvas(w: number, h: number, fn: (x: number, y: number) => number): HTMLCanvasElement {
  const { canvas, ctx, img } = makeCanvas(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round(THREE.MathUtils.clamp(fn(x, y), 0, 1) * 255);
      const i = (y * w + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Texturas procedurales
// ---------------------------------------------------------------------------

export interface ProceduralTextures {
  brushedRough: THREE.CanvasTexture;
  brushedBump: THREE.CanvasTexture;
  grainRough: THREE.CanvasTexture;
  grainBump: THREE.CanvasTexture;
  woodColor: THREE.CanvasTexture;
  woodRough: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  braidColor: THREE.CanvasTexture;
  braidBump: THREE.CanvasTexture;
}

/** Metal cepillado: estrías finas a lo largo de U (circunferencia en piezas torneadas). */
function brushedTextures(size = 512) {
  const noise = createValueNoise(11);
  const streak = (x: number, y: number) => {
    // Frecuencia muy alta en V y baja en U -> rayas largas.
    const s = fbm(noise, (x / size) * 4, (y / size) * 220, 4, 220, 3);
    const s2 = noise((x / size) * 16, (y / size) * 600, 16, 600);
    return s * 0.75 + s2 * 0.25;
  };
  const rough = grayCanvas(size, size, (x, y) => 0.24 + (streak(x, y) - 0.5) * 0.32);
  const bump = grayCanvas(size, size, (x, y) => 0.5 + (streak(x, y) - 0.5) * 1.4);
  return { rough: toTexture(rough, false), bump: toTexture(bump, false) };
}

/** Grano mate del anodizado (microrrugosidad isótropa). */
function grainTextures(size = 256) {
  const noise = createValueNoise(23);
  const g = (x: number, y: number) => fbm(noise, (x / size) * 64, (y / size) * 64, 64, 64, 3);
  const rough = grayCanvas(size, size, (x, y) => 0.5 + (g(x, y) - 0.5) * 0.3);
  const bump = grayCanvas(size, size, (x, y) => g(x, y));
  return { rough: toTexture(rough, false), bump: toTexture(bump, false) };
}

/** Madera de nogal oscuro: anillos deformados, estrías y poros. */
function woodTextures(w = 2048, h = 1024) {
  const noise = createValueNoise(77);
  const color = makeCanvas(w, h);
  const rough = makeCanvas(w, h);
  const bump = makeCanvas(w, h);
  const cd = color.img.data;
  const rd = rough.img.data;
  const bd = bump.img.data;
  const light = [104, 66, 40];
  const mid = [66, 40, 24];
  const dark = [33, 19, 11];
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // Veta casi rectilínea: anillos poco deformados + estrías largas dominantes.
      const warp = fbm(noise, u * 2, v * 3, 2, 3, 4) * 1.6 + fbm(noise, u * 8, v * 14, 8, 14, 2) * 0.15;
      const ringPos = v * 42 + warp * 3;
      const ring = 0.5 + 0.5 * Math.sin(ringPos * Math.PI * 2);
      const late = Math.pow(ring, 4); // madera tardía más oscura
      const streaks = fbm(noise, u * 3, v * 520, 3, 520, 3);
      const fine = noise(u * 40, v * 1400, 40, 1400);
      const poreN = noise(u * 300, v * 1100, 300, 1100);
      const pore = poreN > 0.8 ? (poreN - 0.8) / 0.2 : 0;
      const large = fbm(noise, u * 2, v * 2, 2, 2, 3);
      let t = late * 0.3 + streaks * 0.3 + fine * 0.08 + 0.12 + (large - 0.5) * 0.55;
      t = THREE.MathUtils.clamp(t + pore * 0.35, 0, 1);
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = light[c] + (mid[c] - light[c]) * Math.min(1, t * 1.6);
        const val = a + (dark[c] - a) * Math.max(0, t * 1.6 - 0.6);
        cd[i + c] = Math.round(val);
      }
      cd[i + 3] = 255;
      const r = 0.4 + late * 0.08 + pore * 0.3 + (fine - 0.5) * 0.08;
      const rv = Math.round(THREE.MathUtils.clamp(r, 0, 1) * 255);
      rd[i] = rv;
      rd[i + 1] = rv;
      rd[i + 2] = rv;
      rd[i + 3] = 255;
      const b = 0.6 - late * 0.2 - pore * 0.5 + (streaks - 0.5) * 0.15;
      const bv = Math.round(THREE.MathUtils.clamp(b, 0, 1) * 255);
      bd[i] = bv;
      bd[i + 1] = bv;
      bd[i + 2] = bv;
      bd[i + 3] = 255;
    }
  }
  color.ctx.putImageData(color.img, 0, 0);
  rough.ctx.putImageData(rough.img, 0, 0);
  bump.ctx.putImageData(bump.img, 0, 0);
  return {
    color: toTexture(color.canvas, true, 16),
    rough: toTexture(rough.canvas, false, 16),
    bump: toTexture(bump.canvas, false, 16),
  };
}

/** Trenzado textil diagonal (sarga) para el cable. U = longitud, V = circunferencia. */
function braidTextures(w = 256, h = 256) {
  const noise = createValueNoise(5);
  const strands = 8;
  const height = (x: number, y: number) => {
    const u = x / w;
    const v = y / h;
    const a = (u + v) * strands;
    const b = (u - v) * strands;
    const fa = a - Math.floor(a);
    const fb = b - Math.floor(b);
    // Perfil redondeado de cada hebra.
    const ha = Math.sin(fa * Math.PI);
    const hb = Math.sin(fb * Math.PI);
    // Alternancia por encima / por debajo.
    const over = (Math.floor(a) + Math.floor(b)) % 2 === 0;
    const top = over ? ha : hb;
    const fibre = noise(u * 64, v * 64, 64, 64) * 0.15;
    return THREE.MathUtils.clamp(top * 0.85 + fibre, 0, 1);
  };
  const bump = grayCanvas(w, h, height);
  const { canvas, ctx, img } = makeCanvas(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hgt = height(x, y);
      const base = 14 + hgt * 26;
      const i = (y * w + x) * 4;
      d[i] = base;
      d[i + 1] = base;
      d[i + 2] = base + 2;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { color: toTexture(canvas, true), bump: toTexture(bump, false) };
}

export function createProceduralTextures(): ProceduralTextures {
  const brushed = brushedTextures();
  const grain = grainTextures();
  const wood = woodTextures();
  const braid = braidTextures();
  return {
    brushedRough: brushed.rough,
    brushedBump: brushed.bump,
    grainRough: grain.rough,
    grainBump: grain.bump,
    woodColor: wood.color,
    woodRough: wood.rough,
    woodBump: wood.bump,
    braidColor: braid.color,
    braidBump: braid.bump,
  };
}

// ---------------------------------------------------------------------------
// Materiales
// ---------------------------------------------------------------------------

export interface LampMaterials {
  anodized: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshStandardMaterial;
  aluminum: THREE.MeshStandardMaterial;
  shadeInner: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  plastic: THREE.MeshPhysicalMaterial;
  bakelite: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  stemGlass: THREE.MeshPhysicalMaterial;
  filament: THREE.MeshStandardMaterial;
  wire: THREE.MeshStandardMaterial;
  cable: THREE.MeshPhysicalMaterial;
  indicator: THREE.MeshStandardMaterial;
  spring: THREE.MeshStandardMaterial;
}

export interface StageMaterials {
  wood: THREE.MeshPhysicalMaterial;
  steel: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  notebook: THREE.MeshPhysicalMaterial;
  pages: THREE.MeshStandardMaterial;
}

let cache: { tex: ProceduralTextures; lamp: LampMaterials; stage: StageMaterials } | null = null;

/** Crea (una sola vez) texturas y materiales compartidos. */
export function getMaterials() {
  if (cache) return cache;
  const tex = createProceduralTextures();

  // Micrograno del anodizado a escala milimétrica (copias con repetición propia).
  const anodRough = tex.grainRough.clone();
  anodRough.repeat.set(10, 10);
  const anodBump = tex.grainBump.clone();
  anodBump.repeat.set(10, 10);

  const anodized = new THREE.MeshPhysicalMaterial({
    name: 'Aluminio anodizado negro mate',
    color: new THREE.Color('#141416'),
    metalness: 0.55,
    roughness: 1,
    roughnessMap: anodRough,
    bumpMap: anodBump,
    bumpScale: 0.02,
    clearcoat: 0.12,
    clearcoatRoughness: 0.6,
  });

  const brass = new THREE.MeshStandardMaterial({
    name: 'Latón cepillado',
    color: new THREE.Color('#d8b46a'),
    metalness: 1,
    roughness: 1,
    roughnessMap: tex.brushedRough,
    bumpMap: tex.brushedBump,
    bumpScale: 0.25,
  });

  const aluminum = new THREE.MeshStandardMaterial({
    name: 'Aluminio casquillo',
    color: new THREE.Color('#c8c8cc'),
    metalness: 1,
    roughness: 1,
    roughnessMap: tex.brushedRough,
    bumpMap: tex.brushedBump,
    bumpScale: 0.2,
  });

  const shadeInner = new THREE.MeshStandardMaterial({
    name: 'Pantalla interior blanca difusora',
    color: new THREE.Color('#f1eee7'),
    roughness: 0.82,
    metalness: 0,
    emissive: new THREE.Color('#ffb46b'),
    emissiveIntensity: 0,
    // Las normales de la pared interior apuntan al eje: FrontSide evita z-fighting
    // con la pared exterior en las siluetas.
    side: THREE.FrontSide,
  });

  const rubber = new THREE.MeshStandardMaterial({
    name: 'Caucho',
    color: new THREE.Color('#0d0d0e'),
    roughness: 0.95,
    roughnessMap: tex.grainRough,
    metalness: 0,
  });

  const plastic = new THREE.MeshPhysicalMaterial({
    name: 'Plástico negro brillante',
    color: new THREE.Color('#0b0b0c'),
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  });

  const bakelite = new THREE.MeshPhysicalMaterial({
    name: 'Baquelita',
    color: new THREE.Color('#1a120d'),
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.4,
  });

  const glass = new THREE.MeshPhysicalMaterial({
    name: 'Vidrio bombilla',
    color: new THREE.Color('#ffffff'),
    metalness: 0,
    roughness: 0.04,
    transmission: 0.9,
    ior: 1.5,
    thickness: 0.05,
    transparent: false,
    emissive: new THREE.Color('#ffcf9a'),
    emissiveIntensity: 0,
    specularIntensity: 1,
    envMapIntensity: 1.2,
  });

  // El vástago interior no puede ser transmisivo (no se vería a través del vidrio exterior),
  // así que se aproxima con un dieléctrico opaco muy pulido.
  const stemGlass = new THREE.MeshPhysicalMaterial({
    name: 'Vástago de vidrio',
    color: new THREE.Color('#cfd9d6'),
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });

  const filament = new THREE.MeshStandardMaterial({
    name: 'Filamento de tungsteno',
    color: new THREE.Color('#2a2622'),
    roughness: 0.5,
    metalness: 0.6,
    emissive: new THREE.Color('#ffad5c'),
    emissiveIntensity: 0,
  });

  const wire = new THREE.MeshStandardMaterial({
    name: 'Alambre soporte',
    color: new THREE.Color('#9a9a9e'),
    roughness: 0.35,
    metalness: 1,
  });

  const cable = new THREE.MeshPhysicalMaterial({
    name: 'Cable trenzado textil',
    color: new THREE.Color('#ffffff'),
    map: tex.braidColor,
    bumpMap: tex.braidBump,
    bumpScale: 1.2,
    roughness: 0.78,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#5a5a60'),
  });

  const indicator = new THREE.MeshStandardMaterial({
    name: 'Indicador',
    color: new THREE.Color('#3a1a08'),
    roughness: 0.3,
    emissive: new THREE.Color('#ff7a1a'),
    emissiveIntensity: 0,
  });

  const spring = new THREE.MeshStandardMaterial({
    name: 'Acero de muelle pavonado',
    color: new THREE.Color('#2a2a2d'),
    roughness: 0.35,
    metalness: 1,
  });

  const wood = new THREE.MeshPhysicalMaterial({
    name: 'Nogal oscuro barnizado',
    map: tex.woodColor,
    roughness: 1,
    roughnessMap: tex.woodRough,
    bumpMap: tex.woodBump,
    bumpScale: 0.22,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.45,
  });

  const steel = new THREE.MeshStandardMaterial({
    name: 'Acero negro',
    color: new THREE.Color('#151517'),
    metalness: 0.7,
    roughness: 0.55,
    roughnessMap: tex.grainRough,
  });

  const floor = new THREE.MeshStandardMaterial({
    name: 'Suelo estudio',
    color: new THREE.Color('#262628'),
    roughness: 0.92,
    metalness: 0,
  });

  const paper = new THREE.MeshStandardMaterial({
    name: 'Papel',
    color: new THREE.Color('#ecebe6'),
    roughness: 0.9,
    metalness: 0,
    bumpMap: tex.grainBump,
    bumpScale: 0.1,
  });

  const notebook = new THREE.MeshPhysicalMaterial({
    name: 'Tapa cuaderno',
    color: new THREE.Color('#2b3a33'),
    roughness: 0.75,
    metalness: 0,
    bumpMap: tex.grainBump,
    bumpScale: 0.4,
    sheen: 0.3,
  });

  const pages = new THREE.MeshStandardMaterial({
    name: 'Hojas',
    color: new THREE.Color('#e3dfd4'),
    roughness: 0.95,
    metalness: 0,
  });

  cache = {
    tex,
    lamp: {
      anodized,
      brass,
      aluminum,
      shadeInner,
      rubber,
      plastic,
      bakelite,
      glass,
      stemGlass,
      filament,
      wire,
      cable,
      indicator,
      spring,
    },
    stage: { wood, steel, floor, paper, notebook, pages },
  };
  return cache;
}
