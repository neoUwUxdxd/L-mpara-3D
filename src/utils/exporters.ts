/**
 * Exportación del modelo de la lámpara a GLB (glTF binario) y STL.
 * Sólo se exporta la malla de la lámpara: se eliminan luces, objetivos de luz,
 * zonas de interacción invisibles y cualquier nodo marcado con userData.noExport.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { zipSingleFile } from './zip';

function prepareClone(source: THREE.Object3D): THREE.Object3D {
  source.updateWorldMatrix(true, true);
  const clone = source.clone(true);
  const remove: THREE.Object3D[] = [];
  clone.traverse((o) => {
    const isLight = (o as THREE.Light).isLight === true;
    const isCamera = (o as THREE.Camera).isCamera === true;
    if (isLight || isCamera || o.userData.noExport) remove.push(o);
  });
  remove.forEach((o) => o.removeFromParent());
  // La lámpara se exporta centrada en el origen, apoyada sobre el plano Y = 0.
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.set(1, 1, 1);
  clone.updateMatrixWorld(true);
  return clone;
}

interface DownloadsCapability {
  save(req: { filename: string; data: Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

interface ClaudeRuntime {
  use(name: 'downloads'): Promise<DownloadsCapability | null>;
}

export interface ExportResult {
  filename: string;
  bytes: number;
  /** false si la persona canceló el guardado. */
  saved: boolean;
}

function anchorDownload(data: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Entrega el archivo generado.
 * - Dentro de un artefacto de Claude, las descargas pasan por la capacidad `downloads`,
 *   que no admite .glb ni .stl: el modelo se entrega empaquetado en un .zip.
 * - Fuera de Claude (npm run dev / preview) se descarga directamente.
 */
async function deliver(data: Uint8Array, filename: string, mime: string): Promise<ExportResult> {
  const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
  const downloads = runtime?.use ? await runtime.use('downloads').catch(() => null) : null;
  if (!downloads) {
    anchorDownload(data, filename, mime);
    return { filename, bytes: data.byteLength, saved: true };
  }
  const zip = await zipSingleFile(filename, data);
  const zipName = filename.replace(/\.[^.]+$/, '') + '.zip';
  try {
    await downloads.save({ filename: zipName, data: zip });
    return { filename: zipName, bytes: zip.size, saved: true };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'declined') return { filename: zipName, bytes: zip.size, saved: false };
    if (code === 'rate_limited') throw new Error('Ya hay una descarga pendiente de confirmar; espera unos segundos.');
    throw new Error('Las descargas no están disponibles en esta vista.');
  }
}

/** Exporta a .glb (unidades en metros, materiales PBR, texturas embebidas). */
export async function exportGLB(source: THREE.Object3D, filename = 'lampara-arquitecto.glb'): Promise<ExportResult> {
  const clone = prepareClone(source);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(clone, {
    binary: true,
    onlyVisible: true,
    maxTextureSize: 2048,
  });
  if (!(result instanceof ArrayBuffer)) throw new Error('El exportador GLTF no devolvió datos binarios');
  return deliver(new Uint8Array(result), filename, 'model/gltf-binary');
}

/**
 * Exporta a .stl binario. STL no tiene unidades: se escala a milímetros,
 * la convención habitual de los programas de impresión 3D.
 */
export async function exportSTL(source: THREE.Object3D, filename = 'lampara-arquitecto.stl'): Promise<ExportResult> {
  const clone = prepareClone(source);
  const wrapper = new THREE.Group();
  wrapper.scale.setScalar(1000);
  wrapper.add(clone);
  wrapper.updateMatrixWorld(true);
  const exporter = new STLExporter();
  const view = exporter.parse(wrapper, { binary: true });
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return deliver(bytes, filename, 'model/stl');
}
