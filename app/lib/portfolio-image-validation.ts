import {
  PORTFOLIO_IMAGE_MAX_LONG_EDGE,
  PORTFOLIO_IMAGE_TYPES,
} from "./portfolio-image-rules";

type SupportedImageType = (typeof PORTFOLIO_IMAGE_TYPES)[number];

type ImageValidationResult =
  | { ok: true; width: number; height: number }
  | { ok: false; error: string };

export async function validatePortfolioImage(
  file: File,
): Promise<ImageValidationResult> {
  if (!PORTFOLIO_IMAGE_TYPES.includes(file.type as SupportedImageType)) {
    return { ok: false, error: "Поддерживаются JPG, PNG, WebP и AVIF" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = imageDimensions(bytes, file.type as SupportedImageType);

  if (!dimensions) {
    return {
      ok: false,
      error: "Содержимое файла не соответствует заявленному формату изображения",
    };
  }

  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    Math.max(dimensions.width, dimensions.height) >
      PORTFOLIO_IMAGE_MAX_LONG_EDGE
  ) {
    return {
      ok: false,
      error: `Максимум - ${PORTFOLIO_IMAGE_MAX_LONG_EDGE} px по длинной стороне`,
    };
  }

  return { ok: true, ...dimensions };
}

export function canonicalImageExtension(type: string) {
  switch (type) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/avif":
      return ".avif";
    default:
      return "";
  }
}

function imageDimensions(bytes: Uint8Array, type: SupportedImageType) {
  switch (type) {
    case "image/png":
      return pngDimensions(bytes);
    case "image/jpeg":
      return jpegDimensions(bytes);
    case "image/webp":
      return webpDimensions(bytes);
    case "image/avif":
      return avifDimensions(bytes);
  }
}

function pngDimensions(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    !signature.every((value, index) => bytes[index] === value) ||
    ascii(bytes, 12, 4) !== "IHDR"
  ) {
    return null;
  }

  return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 1 >= bytes.length) break;

    const segmentLength = u16be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: u16be(bytes, offset + 3),
        width: u16be(bytes, offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  ) {
    return null;
  }

  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    return {
      width: 1 + u24le(bytes, 24),
      height: 1 + u24le(bytes, 27),
    };
  }

  if (
    chunk === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: u16le(bytes, 26) & 0x3fff,
      height: u16le(bytes, 28) & 0x3fff,
    };
  }

  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height:
        1 +
        (bytes[22] >> 6) +
        (bytes[23] << 2) +
        ((bytes[24] & 0x0f) << 10),
    };
  }

  return null;
}

function avifDimensions(bytes: Uint8Array) {
  if (bytes.length < 32 || ascii(bytes, 4, 4) !== "ftyp") return null;

  const brandArea = ascii(bytes, 8, Math.min(bytes.length - 8, 64));
  if (!brandArea.includes("avif") && !brandArea.includes("avis")) return null;

  for (let index = 4; index + 16 <= bytes.length; index += 1) {
    if (ascii(bytes, index, 4) !== "ispe") continue;
    const width = u32be(bytes, index + 8);
    const height = u32be(bytes, index + 12);
    if (width > 0 && height > 0) return { width, height };
  }

  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  let value = "";
  for (let index = offset; index < offset + length && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function u16be(bytes: Uint8Array, offset: number) {
  return bytes[offset] * 256 + bytes[offset + 1];
}

function u16le(bytes: Uint8Array, offset: number) {
  return bytes[offset] + bytes[offset + 1] * 256;
}

function u24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
}

function u32be(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 16777216 +
    bytes[offset + 1] * 65536 +
    bytes[offset + 2] * 256 +
    bytes[offset + 3]
  );
}
