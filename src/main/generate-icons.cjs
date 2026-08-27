const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a PNG file using raw uncompressed/deflated chunks
function createPng(width, height, drawFn) {
  // RGBA buffer: width * height * 4
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

  // PNG raw image data has 1 filter byte per scanline (0 = None)
  const rawScanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (width * 4 + 1);
    rawScanlines[scanlineOffset] = 0; // Filter None
    rgba.copy(rawScanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idatData = zlib.deflateSync(rawScanlines);

  // PNG Header
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

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 table
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
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

// Modern BinaryLane Server / Cloud Icon Drawer
function drawBlIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = w * 0.44;

  // Background rounded square
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const cornerRadius = w * 0.22;
  const insideBox = (dx <= radius && dy <= radius);
  
  // Rounded corner check
  let inBackground = false;
  if (dx <= radius - cornerRadius && dy <= radius) inBackground = true;
  else if (dy <= radius - cornerRadius && dx <= radius) inBackground = true;
  else {
    const cdx = dx - (radius - cornerRadius);
    const cdy = dy - (radius - cornerRadius);
    if (cdx * cdx + cdy * cdy <= cornerRadius * cornerRadius) inBackground = true;
  }

  if (!inBackground) {
    return [0, 0, 0, 0]; // transparent
  }

  // Gradient background: Dark Slate (#020617 to #0f172a)
  const normY = y / h;
  const bgR = Math.round(2 + normY * 13);
  const bgG = Math.round(6 + normY * 17);
  const bgB = Math.round(23 + normY * 19);

  // Draw 3 horizontal server rack layers / cloud blades
  // Rack 1: y from 0.30 to 0.42
  // Rack 2: y from 0.46 to 0.58
  // Rack 3: y from 0.62 to 0.74
  const layerWidth = w * 0.56;
  const isInsideLayer = (layerTop, layerBottom) => {
    const ly1 = h * layerTop;
    const ly2 = h * layerBottom;
    const lx1 = cx - layerWidth / 2;
    const lx2 = cx + layerWidth / 2;
    return (x >= lx1 && x <= lx2 && y >= ly1 && y <= ly2);
  };

  // Check rack layers
  const l1 = isInsideLayer(0.28, 0.42);
  const l2 = isInsideLayer(0.46, 0.60);
  const l3 = isInsideLayer(0.64, 0.78);

  if (l1 || l2 || l3) {
    // Left LED indicator (Green/Cyan)
    const ledX = cx - layerWidth / 2 + (w * 0.08);
    const isLed = (Math.hypot(x - ledX, y - (l1 ? h * 0.35 : l2 ? h * 0.53 : h * 0.71)) < w * 0.035);
    if (isLed) {
      return [56, 189, 248, 255]; // Sky-400 glowing LED
    }

    // Right activity line / bar
    const barX1 = cx - (w * 0.08);
    const barX2 = cx + layerWidth / 2 - (w * 0.06);
    const midY = l1 ? h * 0.35 : l2 ? h * 0.53 : h * 0.71;
    if (x >= barX1 && x <= barX2 && Math.abs(y - midY) <= h * 0.018) {
      return [14, 165, 233, 255]; // Sky-500 line
    }

    // Blade chassis gradient (Cyan to Deep Blue #0284c7 -> #0369a1)
    const bladeR = 2;
    const bladeG = 132;
    const bladeB = 199;
    return [bladeR, bladeG, bladeB, 255];
  }

  // Border stroke highlight
  const isBorder = (dx >= radius - 2 || dy >= radius - 2);
  if (isBorder) {
    return [56, 189, 248, 160]; // Sky border
  }

  return [bgR, bgG, bgB, 255];
}

// Ensure resources folder exists
const resourcesDir = path.join(__dirname, '../../resources');
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Generate 256x256 icon
const png256 = createPng(256, 256, drawBlIcon);
fs.writeFileSync(path.join(resourcesDir, 'icon.png'), png256);

// Generate 32x32 tray icon
const tray32 = createPng(32, 32, drawBlIcon);
fs.writeFileSync(path.join(resourcesDir, 'tray.png'), tray32);

// Generate 16x16 tray icon
const tray16 = createPng(16, 16, drawBlIcon);
fs.writeFileSync(path.join(resourcesDir, 'tray-16.png'), tray16);

// Create multi-resolution .ico file containing PNG data
function createIco(pngBuffers) {
  // ICO Header: 6 bytes
  // ICONDIR: 0, 0, 1 (1=ICO), numImages
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // image type 1 = ICO
  header.writeUInt16LE(pngBuffers.length, 4); // count

  let offset = 6 + (16 * pngBuffers.length);
  const entries = [];
  const imageBodies = [];

  for (const { width, height, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = width >= 256 ? 0 : width;
    entry[1] = height >= 256 ? 0 : height;
    entry[2] = 0; // color palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    imageBodies.push(buffer);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...imageBodies]);
}

const png32 = createPng(32, 32, drawBlIcon);
const png48 = createPng(48, 48, drawBlIcon);

const icoBuf = createIco([
  { width: 256, height: 256, buffer: png256 },
  { width: 48, height: 48, buffer: png48 },
  { width: 32, height: 32, buffer: png32 },
  { width: 16, height: 16, buffer: tray16 }
]);

fs.writeFileSync(path.join(resourcesDir, 'icon.ico'), icoBuf);
console.log('Successfully generated resources/icon.png, resources/icon.ico, and resources/tray.png!');
