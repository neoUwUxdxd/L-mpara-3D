/**
 * Empaquetador ZIP mínimo (un solo archivo) sin dependencias.
 * Usa compresión DEFLATE con CompressionStream cuando el navegador la ofrece
 * y, si no, guarda el archivo sin comprimir (método STORE).
 */

let crcTable: Uint32Array | null = null;

function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function dosDateTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

/** Crea un .zip que contiene un único archivo. */
export async function zipSingleFile(filename: string, data: Uint8Array): Promise<Blob> {
  const name = new TextEncoder().encode(filename);
  const crc = crc32(data);
  const deflated = await deflateRaw(data);
  const useDeflate = deflated !== null && deflated.length < data.length;
  const payload = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;
  const [time, date] = dosDateTime(new Date());

  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true); // versión necesaria
  local.setUint16(6, 0x0800, true); // nombres en UTF-8
  local.setUint16(8, method, true);
  local.setUint16(10, time, true);
  local.setUint16(12, date, true);
  local.setUint32(14, crc, true);
  local.setUint32(18, payload.length, true);
  local.setUint32(22, data.length, true);
  local.setUint16(26, name.length, true);
  local.setUint16(28, 0, true);

  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint16(8, 0x0800, true);
  central.setUint16(10, method, true);
  central.setUint16(12, time, true);
  central.setUint16(14, date, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, payload.length, true);
  central.setUint32(24, data.length, true);
  central.setUint16(28, name.length, true);
  central.setUint32(42, 0, true); // desplazamiento de la cabecera local

  const centralOffset = 30 + name.length + payload.length;
  const centralSize = 46 + name.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);

  return new Blob([local, name, payload as BlobPart, central, name, end], { type: 'application/zip' });
}
