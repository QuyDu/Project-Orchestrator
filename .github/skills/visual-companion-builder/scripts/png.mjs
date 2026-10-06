import { constants, deflateSync, inflateSync } from "node:zlib";

export const PNG_LIMITS = Object.freeze({
  maxDimension: 2048,
  maxPixels: 1_048_576,
  maxEncodedBytes: 8 * 1024 * 1024,
  maxChunks: 512
});

export const PNG_DECODE_PROFILES = Object.freeze({
  "visual-companion": Object.freeze({
    ...PNG_LIMITS,
    colorTypes: Object.freeze([6])
  }),
  "project-visual": Object.freeze({
    maxDimension: 3_840,
    maxPixels: 8_294_400,
    maxEncodedBytes: 24 * 1024 * 1024,
    maxChunks: PNG_LIMITS.maxChunks,
    colorTypes: Object.freeze([2, 6])
  })
});

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function fail(message) { throw new Error(`PNG: ${message}`); }

function dimensions(width, height, limits = PNG_LIMITS) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width > limits.maxDimension || height > limits.maxDimension
      || width * height > limits.maxPixels) fail("dimensions exceed the bounded pixel limit.");
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

function decodeProfile(options) {
  if (options === undefined) {
    return {
      limits: PNG_DECODE_PROFILES["visual-companion"],
      expectedWidth: undefined,
      expectedHeight: undefined
    };
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("decoder options must be an object.");
  const allowed = new Set(["profile", "expectedWidth", "expectedHeight"]);
  if (Object.keys(options).some((key) => !allowed.has(key))) fail("decoder options contain an unknown field.");
  const profile = options.profile ?? "visual-companion";
  const limits = PNG_DECODE_PROFILES[profile];
  if (!limits) fail("unknown decoder profile.");
  const hasWidth = options.expectedWidth !== undefined;
  const hasHeight = options.expectedHeight !== undefined;
  if (hasWidth !== hasHeight) fail("expected dimensions must include both width and height.");
  if (hasWidth) dimensions(options.expectedWidth, options.expectedHeight, limits);
  return { limits, expectedWidth: options.expectedWidth, expectedHeight: options.expectedHeight };
}

function parseChunks(data, limits, expectedWidth, expectedHeight) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bytesPerPixel = 0;
  let seenData = false;
  let endedData = false;
  let ended = false;
  let paletteSeen = false;
  let count = 0;
  const compressed = [];
  while (offset < data.length) {
    if (++count > limits.maxChunks) fail("chunk count exceeds the limit.");
    if (offset + 12 > data.length) fail("truncated chunk.");
    const length = data.readUInt32BE(offset);
    if (length > limits.maxEncodedBytes || offset + length + 12 > data.length) fail("truncated or oversized chunk.");
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
      dimensions(width, height, limits);
      if (expectedWidth !== undefined && (width !== expectedWidth || height !== expectedHeight)) fail("dimensions do not match the expected image size.");
      colorType = body[9];
      if (body[8] !== 8 || !limits.colorTypes.includes(colorType) || body[10] !== 0 || body[11] !== 0 || body[12] !== 0) {
        const formats = limits.colorTypes.length === 1 ? "RGBA (color type 6)" : "RGB or RGBA (color types 2 and 6)";
        fail(`only non-interlaced 8-bit ${formats} format is supported.`);
      }
      bytesPerPixel = colorType === 2 ? 3 : 4;
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
  return { width, height, colorType, bytesPerPixel, compressed };
}

function inflateImageData(compressed, expectedBytes) {
  try {
    const bytes = Buffer.concat(compressed);
    const inflated = inflateSync(bytes, { maxOutputLength: expectedBytes, info: true });
    if (inflated.buffer.length !== expectedBytes || inflated.engine.bytesWritten !== bytes.length) fail("unexpected decompressed length or trailing compressed data.");
    return inflated.buffer;
  } catch (error) {
    if (error.message.startsWith("PNG:")) throw error;
    fail("invalid compressed data or decompression limit exceeded.");
  }
}

function reconstructSamples(raw, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  const samples = Buffer.alloc(width * height * bytesPerPixel);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    if (filter > 4) fail("unknown scanline filter.");
    for (let column = 0; column < stride; column++) {
      const index = row * stride + column;
      const left = column >= bytesPerPixel ? samples[index - bytesPerPixel] : 0;
      const up = row > 0 ? samples[index - stride] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel ? samples[index - stride - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
      samples[index] = (raw[row * (stride + 1) + column + 1] + predictor) & 255;
    }
  }
  return samples;
}

function toRgba(samples, colorType) {
  if (colorType === 6) return samples;
  const pixels = Buffer.alloc((samples.length / 3) * 4);
  for (let source = 0, target = 0; source < samples.length; source += 3, target += 4) {
    pixels[target] = samples[source];
    pixels[target + 1] = samples[source + 1];
    pixels[target + 2] = samples[source + 2];
    pixels[target + 3] = 255;
  }
  return pixels;
}

export function decodePng(data, options) {
  const { limits, expectedWidth, expectedHeight } = decodeProfile(options);
  if (!Buffer.isBuffer(data) || data.length < 45 || data.length > limits.maxEncodedBytes) fail("invalid file size or size limit exceeded.");
  if (!data.subarray(0, 8).equals(SIGNATURE)) fail("invalid signature; only PNG images are supported.");
  const image = parseChunks(data, limits, expectedWidth, expectedHeight);
  const stride = image.width * image.bytesPerPixel;
  const raw = inflateImageData(image.compressed, (stride + 1) * image.height);
  const samples = reconstructSamples(raw, image.width, image.height, image.bytesPerPixel);
  const pixels = toRgba(samples, image.colorType);
  const { width, height } = image;
  return { width, height, pixels };
}
