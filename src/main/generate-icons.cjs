const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return crc ^ -1;
}

function createPng(width, height, drawFn) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }

  const rawScanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (width * 4 + 1);
    rawScanlines[scanlineOffset] = 0;
    rgba.copy(rawScanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idatData = zlib.deflateSync(rawScanlines);
  const signature = Buffer.from([137, 80, 78, 72, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    const crc = crc32(combined);
    crcBuf.writeInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// Crisp High-Contrast BinaryLane Logo (Vibrant Cyan & Blue)
function drawBlIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = w * 0.46;

  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const cornerRadius = w * 0.22;
  
  let inBackground = false;
  if (dx <= radius - cornerRadius && dy <= radius) inBackground = true;
  else if (dy <= radius - cornerRadius && dx <= radius) inBackground = true;
  else {
    const cdx = dx - (radius - cornerRadius);
    const cdy = dy - (radius - cornerRadius);
    if (cdx * cdx + cdy * cdy <= cornerRadius * cornerRadius) inBackground = true;
  }

  if (!inBackground) return [0, 0, 0, 0];

  // Deep Slate background
  const bgR = 15;
  const bgG = 23;
  const bgB = 42; // #0f172a

  // 3 Server Blades / Layers
  const layerWidth = w * 0.62;
  const lx1 = cx - layerWidth / 2;
  const lx2 = cx + layerWidth / 2;

  const isLayer = (topY, bottomY) => {
    return (x >= lx1 && x <= lx2 && y >= h * topY && y <= h * bottomY);
  };

  const l1 = isLayer(0.24, 0.40);
  const l2 = isLayer(0.44, 0.60);
  const l3 = isLayer(0.64, 0.80);

  if (l1 || l2 || l3) {
    const midY = l1 ? h * 0.32 : l2 ? h * 0.52 : h * 0.72;
    // Left glowing indicator dot
    const dotX = lx1 + (w * 0.10);
    if (Math.hypot(x - dotX, y - midY) <= Math.max(1.5, w * 0.045)) {
      return [56, 189, 248, 255]; // Sky-400
    }

    // Right activity line
    const barX1 = cx - (w * 0.05);
    const barX2 = lx2 - (w * 0.08);
    if (x >= barX1 && x <= barX2 && Math.abs(y - midY) <= Math.max(1, h * 0.025)) {
      return [14, 165, 233, 255]; // Sky-500
    }

    // Blade background (Vibrant Cyan / Blue #0284c7)
    return [2, 132, 199, 255];
  }

  // Border stroke highlight
  const isBorder = (dx >= radius - 1.5 || dy >= radius - 1.5);
  if (isBorder) {
    return [56, 189, 248, 200];
  }

  return [bgR, bgG, bgB, 255];
}

// Convert RGBA draw function directly to Windows DIB (Device Independent Bitmap) buffer
function createDib(width, height, drawFn) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(width, 4); // biWidth
  header.writeInt32LE(height * 2, 8); // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount (32-bit BGRA)
  header.writeUInt32LE(0, 16); // biCompression (BI_RGB)
  header.writeUInt32LE(width * height * 4, 20); // biSizeImage

  // Pixel data: bottom-to-top, BGRA
  const xorMask = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // flip Y
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, srcY, width, height);
      xorMask[dstIdx] = b; // B
      xorMask[dstIdx + 1] = g; // G
      xorMask[dstIdx + 2] = r; // R
      xorMask[dstIdx + 3] = a; // A
    }
  }

  // AND mask: 1 bit per pixel, row rounded to 32-bit
  const andRowBytes = Math.ceil(width / 32) * 4;
  const andMask = Buffer.alloc(andRowBytes * height);
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const [,,, a] = drawFn(x, srcY, width, height);
      if (a === 0) {
        const byteOffset = y * andRowBytes + Math.floor(x / 8);
        const bitOffset = 7 - (x % 8);
        andMask[byteOffset] |= (1 << bitOffset);
      }
    }
  }

  return Buffer.concat([header, xorMask, andMask]);
}

// Generate valid Windows .ICO
function generateWindowsIco(sizes, drawFn) {
  const images = sizes.map(size => {
    let buf;
    if (size === 256) {
      buf = createPng(size, size, drawFn);
    } else {
      buf = createDib(size, size, drawFn);
    }
    return { size, buffer: buf };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(images.length, 4); // count

  let offset = 6 + (16 * images.length);
  const dirEntries = [];
  const bodyBuffers = [];

  for (const { size, buffer } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width
    entry[1] = size >= 256 ? 0 : size; // height
    entry[2] = 0; // color count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    dirEntries.push(entry);
    bodyBuffers.push(buffer);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...bodyBuffers]);
}

// Write to resources directories
const rootResDir = path.resolve(process.cwd(), 'resources');
if (!fs.existsSync(rootResDir)) fs.mkdirSync(rootResDir, { recursive: true });

// 1. Icon PNG
const png256 = createPng(256, 256, drawBlIcon);
fs.writeFileSync(path.join(rootResDir, 'icon.png'), png256);

// 2. Tray PNGs (16x16, 32x32)
const tray32 = createPng(32, 32, drawBlIcon);
fs.writeFileSync(path.join(rootResDir, 'tray.png'), tray32);
const tray16 = createPng(16, 16, drawBlIcon);
fs.writeFileSync(path.join(rootResDir, 'tray-16.png'), tray16);

// 3. Pure Windows ICO with DIB payloads for 16, 32, 48, 64, 128, 256
const icoBuf = generateWindowsIco([16, 32, 48, 64, 128, 256], drawBlIcon);
fs.writeFileSync(path.join(rootResDir, 'icon.ico'), icoBuf);

console.log('Icons generated successfully in:', rootResDir);
