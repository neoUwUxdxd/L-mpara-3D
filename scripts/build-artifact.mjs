/**
 * Genera dist/artifact.html: una única página autocontenida (CSS y JS en línea)
 * con el formato que espera un artefacto de Claude (sin <!doctype>, <html>,
 * <head> ni <body>: el visor añade ese esqueleto al publicar).
 * Ejecutar después de `vite build`.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('Ejecuta primero `vite build`.');

const js = readFileSync(join(assets, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(assets, cssFile), 'utf8').replace(/<\/style/gi, '<\\/style');

const html = `<title>Lámpara de Arquitecto 3D</title>
<meta name="description" content="Lámpara articulada de arquitecto modelada de forma procedural con Three.js.">
<meta name="theme-color" content="#18181a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

writeFileSync(join(dist, 'artifact.html'), html);
console.log(`dist/artifact.html (${(html.length / 1024).toFixed(0)} KB)`);
