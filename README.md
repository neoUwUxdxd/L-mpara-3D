# Lámpara de Arquitecto 3D — procedural

Aplicación web 3D interactiva (Vite + React + TypeScript + Three.js / React Three Fiber) con una
lámpara articulada de arquitecto modelada **100 % de forma procedural**: no se carga ningún modelo,
textura ni sonido externo.

## Puesta en marcha

```bash
npm install
npm run dev          # servidor de desarrollo → http://localhost:5173
```

Otros comandos:

```bash
npx tsc --noEmit     # comprobación de tipos
npm run build        # tsc + build de producción en dist/
npm run preview      # sirve dist/ → http://localhost:4173
```

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/scene/LampModel.tsx` | Geometría procedural y jerarquía de pivotes (base, torreta, hombro, codo, muñeca, cabezal), muelles y cable dinámicos, luces del cabezal, animación del interruptor. |
| `src/scene/kinematics.ts` | Dimensiones en metros, cinemática directa y resolutor de colisiones (el cabezal no atraviesa mesa, base ni brazos). |
| `src/scene/geometry.ts` | Utilidades: perfiles con biseles (fillet), torno con UV por longitud de arco, extrusiones biseladas, muelles helicoidales, cables `CatmullRomCurve3` + `TubeGeometry`, filamento en espiral. |
| `src/scene/Materials.ts` | Materiales PBR y texturas procedurales Canvas 2D: metal cepillado, grano anodizado, nogal, trenzado textil. |
| `src/scene/LightingAndStage.tsx` | Escritorio de nogal, fondo de estudio, entorno de Lightformers, luz ambiental tenue con sombras suaves. |
| `src/scene/Experience.tsx` | Composición de la escena, `OrbitControls` con límites y post-procesado (Bloom, ToneMapping ACES, viñeta). |
| `src/utils/exporters.ts` | Exportación `.glb` (`GLTFExporter`) y `.stl` (`STLExporter`) sólo de la malla de la lámpara. |
| `src/utils/audio.ts` | Clic del interruptor sintetizado con Web Audio API. |
| `src/components/ControlsHUD.tsx` | Panel flotante colapsable. |

## Interacción

- **Clic en el interruptor basculante de la base**: anima el balancín (muelle amortiguado), suena el clic
  sintetizado y la luz entra/sale con transición suave (el filamento se enfría más despacio).
- **Panel**: encendido, dimmer 0–100 %, temperatura 2200–5500 K, inclinación del brazo, flexión del codo,
  ángulo del cabezal, giro de la base y exportación.
- Las articulaciones "hacen tope" cuando una pose provocaría una interpenetración.

## Exportación

- **GLB**: metros, materiales PBR (transmisión, clearcoat, sheen, bump), texturas embebidas, sin luces.
- **STL**: binario, en **milímetros** (convención de impresión 3D), apoyado sobre Y = 0.

## Nota sobre sombras

En three.js r182+ `PCFSoftShadowMap` se eliminó y su filtrado suave pasó a `PCFShadowMap`
(disco de Vogel controlado por `shadow.radius`). El proyecto usa ese modo con mapas de 2048×2048.
