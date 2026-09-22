import { constants, deflateSync, inflateSync } from "node:zlib";

export const PNG_LIMITS = Object.freeze({
  maxDimension: 2048,
  maxPixels: 1_048_576,
  maxEncodedBytes: 8 * 1024 * 1024,
  maxChunks: 512
});

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function fail(message) { throw new Error(`PNG: ${message}`); }

function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width > PNG_LIMITS.maxDimension || height > PNG_LIMITS.maxDimension
      || width * height > PNG_LIMITS.maxPixels) fail("dimensions exceed the bounded pixel limit.");
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  output.write(type, 4, 4, "ascii");
  data.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, output.length - 4)), output.length - 4);
  return output;
}

export function encodePng(width, height, pixels) {
  dimensions(width, height);
  if (!Buffer.isBuffer(pixels) || pixels.length !== width * height * 4) fail("expected an exact RGBA byte buffer.");
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++) pixels.copy(scanlines, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  const compressed = deflateSync(scanlines, { level: 9, strategy: constants.Z_FIXED });
  const result = Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
  if (result.length > PNG_LIMITS.maxEncodedBytes) fail("encoded size exceeds the file limit.");
  return result;
}

function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const dl = Math.abs(prediction - left);
  const du = Math.abs(prediction - up);
  const dul = Math.abs(prediction - upperLeft);
  return dl <= du && dl <= dul ? left : du <= dul ? up : upperLeft;
}

export function decodePng(data) {
  if (!Buffer.isBuffer(data) || data.length < 45 || data.length > PNG_LIMITS.maxEncodedBytes) fail("invalid file size or size limit exceeded.");
  if (!data.subarray(0, 8).equals(SIGNATURE)) fail("invalid signature; only PNG images are supported.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let seenData = false;
  let endedData = false;
  let ended = false;
  let paletteSeen = false;
  let count = 0;
  const compressed = [];
  while (offset < data.length) {
    if (++count > PNG_LIMITS.maxChunks) fail("chunk count exceeds the limit.");
    if (offset + 12 > data.length) fail("truncated chunk.");
    const length = data.readUInt32BE(offset);
    if (length > PNG_LIMITS.maxEncodedBytes || offset + length + 12 > data.length) fail("truncated or oversized chunk.");
    const typeBytes = data.subarray(offset + 4, offset + 8);
    if (!typeBytes.every((byte) => (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) fail("chunk type must contain ASCII letters.");
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) fail("invalid chunk type.");
    const body = data.subarray(offset + 8, offset + 8 + length);
    const checksum = data.readUInt32BE(offset + 8 + length);
    if (checksum !== crc32(data.subarray(offset + 4, offset + 8 + length))) fail(`CRC mismatch in ${type}.`);
    if (count === 1 && type !== "IHDR") fail("IHDR must be the first chunk.");
    if (type === "IHDR") {
      if (count !== 1 || length !== 13) fail("invalid or duplicate IHDR.");
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      dimensions(width, height);
      if (body[8] !== 8 || body[9] !== 6 || body[10] !== 0 || body[11] !== 0 || body[12] !== 0) {
        fail("only non-interlaced 8-bit RGBA (color type 6) format is supported.");
      }
    } else if (type === "IDAT") {
      if (endedData) fail("IDAT chunks must be contiguous.");
      seenData = true;
      compressed.push(body);
    } else if (type === "IEND") {
      if (length !== 0 || !seenData) fail("invalid IEND or missing image data.");
      if (offset + 12 !== data.length) fail("trailing data after IEND.");
      ended = true;
    } else {
      if (seenData) endedData = true;
      if (["acTL", "fcTL", "fdAT", "tRNS"].includes(type)) fail("APNG and separate transparency chunks are unsupported.");
      if (type === "PLTE") {
        if (paletteSeen || seenData || length < 3 || length > 768 || length % 3) fail("invalid optional palette.");
        paletteSeen = true;
      } else if (/^[A-Z]/.test(type)) fail(`unsupported critical chunk ${type}.`);
      // Ancillary chunks are CRC-checked but deliberately never copied to output.
    }
    offset += length + 12;
    if (ended) break;
  }
  if (!ended) fail("missing IEND.");
  const stride = width * 4;
  const expectedBytes = (stride + 1) * height;
  let raw;
  try {
    const bytes = Buffer.concat(compressed);
    const inflated = inflateSync(bytes, { maxOutputLength: expectedBytes, info: true });
    if (inflated.buffer.length !== expectedBytes || inflated.engine.bytesWritten !== bytes.length) fail("unexpected decompressed length or trailing compressed data.");
    raw = inflated.buffer;
  } catch (error) {
    if (error.message.startsWith("PNG:")) throw error;
    fail("invalid compressed data or decompression limit exceeded.");
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    if (filter > 4) fail("unknown scanline filter.");
    for (let column = 0; column < stride; column++) {
      const index = row * stride + column;
      const left = column >= 4 ? pixels[index - 4] : 0;
      const up = row > 0 ? pixels[index - stride] : 0;
      const upperLeft = row > 0 && column >= 4 ? pixels[index - stride - 4] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
      pixels[index] = (raw[row * (stride + 1) + column + 1] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}
