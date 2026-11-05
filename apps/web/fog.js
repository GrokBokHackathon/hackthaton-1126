// Fog paint module. No listeners and no camera of its own.
// Call drawFog inside the world pass, after translate/scale, before units.
// Coordinates are world pixels: tile (x, y) covers [x * tileSize, (x + 1) * tileSize).
// Default tileSize is 32, the same as the live client CONFIG.tileSize.
// fog.explored / fog.visible are row-major 0/1 masks, index = y * width + x.

export const FOG_RGB = [0x1a, 0x10, 0x20];
export const FOG_EXPLORED_ALPHA = 0.6;

export function fogPixel(explored, visible) {
  if (visible) return [0, 0, 0, 0];
  if (explored) return [FOG_RGB[0], FOG_RGB[1], FOG_RGB[2], Math.round(255 * FOG_EXPLORED_ALPHA)];
  return [FOG_RGB[0], FOG_RGB[1], FOG_RGB[2], 255];
}

function tileSizeOf(mapOrTileSize) {
  if (typeof mapOrTileSize === "number" && Number.isFinite(mapOrTileSize)) return mapOrTileSize;
  if (mapOrTileSize && Number.isFinite(mapOrTileSize.tileSize)) return mapOrTileSize.tileSize;
  return 32;
}

export function drawFog(ctx, fog, mapOrTileSize = 32) {
  if (!fog || !fog.width || !fog.height || typeof document === "undefined") return;
  const tileSize = tileSizeOf(mapOrTileSize);
  const canvas = document.createElement("canvas");
  canvas.width = fog.width;
  canvas.height = fog.height;
  const mask = canvas.getContext("2d");
  const image = mask.createImageData(fog.width, fog.height);
  const cells = fog.width * fog.height;
  for (let i = 0; i < cells; i++) {
    const pixel = fogPixel(fog.explored?.[i], fog.visible?.[i]);
    const offset = i * 4;
    image.data[offset] = pixel[0];
    image.data[offset + 1] = pixel[1];
    image.data[offset + 2] = pixel[2];
    image.data[offset + 3] = pixel[3];
  }
  mask.putImageData(image, 0, 0);
  const previous = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, fog.width * tileSize, fog.height * tileSize);
  ctx.imageSmoothingEnabled = previous;
}
