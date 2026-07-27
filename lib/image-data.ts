const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function pngSize(bytes: Uint8Array) {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += length + 2;
  }
  return null;
}

function webpSize(bytes: Uint8Array) {
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  const chunk = text(12, 4);
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function validateImageDataUrl(value: unknown, maxDataLength: number) {
  return typeof value === "string" && value.length <= maxDataLength && IMAGE_PATTERN.test(value);
}

export function decodeImageDataUrl(value: unknown, options: {
  maxDataLength: number;
  maxBytes: number;
  maxPixels: number;
}) {
  if (!validateImageDataUrl(value, options.maxDataLength)) throw new Error("invalid image");
  const match = (value as string).match(IMAGE_PATTERN);
  if (!match) throw new Error("invalid image");
  const binary = atob(match[2]);
  if (!binary.length || binary.length > options.maxBytes) throw new Error("invalid image");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const contentType = `image/${match[1]}`;
  const dimensions = match[1] === "png" ? pngSize(bytes) : match[1] === "jpeg" ? jpegSize(bytes) : webpSize(bytes);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1
    || dimensions.width * dimensions.height > options.maxPixels) throw new Error("invalid image");
  return { bytes, contentType, ...dimensions };
}
