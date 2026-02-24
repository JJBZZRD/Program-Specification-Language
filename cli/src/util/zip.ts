// Minimal ZIP writer (store mode) so we can emit XLSX without external deps.
// Supports only flat files; no compression; no comments; no timestamps.

export type ZipEntry = {
  path: string;
  data: Uint8Array;
};

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }

  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }

  // unsigned
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16LE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32LE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

type CentralRecord = {
  header: Uint8Array;
  name: Uint8Array;
};

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: CentralRecord[] = [];

  let offset = 0;

  entries.forEach((entry) => {
    const name = new TextEncoder().encode(entry.path);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30 bytes)
    // https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
    const localHeader = new Uint8Array(30);
    writeUInt32LE(localHeader, 0, 0x04034b50);
    writeUInt16LE(localHeader, 4, 20); // version needed
    writeUInt16LE(localHeader, 6, 0); // flags
    writeUInt16LE(localHeader, 8, 0); // method (store)
    writeUInt16LE(localHeader, 10, 0); // time
    writeUInt16LE(localHeader, 12, 0); // date
    writeUInt32LE(localHeader, 14, crc);
    writeUInt32LE(localHeader, 18, size);
    writeUInt32LE(localHeader, 22, size);
    writeUInt16LE(localHeader, 26, name.length);
    writeUInt16LE(localHeader, 28, 0); // extra len

    localParts.push(localHeader, name, data);

    // Central directory header (46 bytes)
    const centralHeader = new Uint8Array(46);
    writeUInt32LE(centralHeader, 0, 0x02014b50);
    writeUInt16LE(centralHeader, 4, 20); // version made by
    writeUInt16LE(centralHeader, 6, 20); // version needed
    writeUInt16LE(centralHeader, 8, 0); // flags
    writeUInt16LE(centralHeader, 10, 0); // method
    writeUInt16LE(centralHeader, 12, 0); // time
    writeUInt16LE(centralHeader, 14, 0); // date
    writeUInt32LE(centralHeader, 16, crc);
    writeUInt32LE(centralHeader, 20, size);
    writeUInt32LE(centralHeader, 24, size);
    writeUInt16LE(centralHeader, 28, name.length);
    writeUInt16LE(centralHeader, 30, 0); // extra len
    writeUInt16LE(centralHeader, 32, 0); // comment len
    writeUInt16LE(centralHeader, 34, 0); // disk start
    writeUInt16LE(centralHeader, 36, 0); // internal attrs
    writeUInt32LE(centralHeader, 38, 0); // external attrs
    writeUInt32LE(centralHeader, 42, offset); // local header offset

    centralParts.push({ header: centralHeader, name });

    offset += localHeader.length + name.length + size;
  });

  let centralSize = 0;
  centralParts.forEach((part) => {
    centralSize += part.header.length + part.name.length;
  });

  const endOfCentral = new Uint8Array(22);
  writeUInt32LE(endOfCentral, 0, 0x06054b50);
  writeUInt16LE(endOfCentral, 4, 0); // disk
  writeUInt16LE(endOfCentral, 6, 0); // disk where central starts
  writeUInt16LE(endOfCentral, 8, centralParts.length); // entries on disk
  writeUInt16LE(endOfCentral, 10, centralParts.length); // total entries
  writeUInt32LE(endOfCentral, 12, centralSize);
  writeUInt32LE(endOfCentral, 16, offset); // central directory offset
  writeUInt16LE(endOfCentral, 20, 0); // comment length

  const totalSize = offset + centralSize + endOfCentral.length;
  const output = new Uint8Array(totalSize);

  let cursor = 0;
  localParts.forEach((part) => {
    output.set(part, cursor);
    cursor += part.length;
  });

  centralParts.forEach((part) => {
    output.set(part.header, cursor);
    cursor += part.header.length;
    output.set(part.name, cursor);
    cursor += part.name.length;
  });

  output.set(endOfCentral, cursor);
  cursor += endOfCentral.length;

  if (cursor !== totalSize) {
    throw new Error(`zipStore internal error: expected ${totalSize} bytes, wrote ${cursor}.`);
  }

  return output;
}

