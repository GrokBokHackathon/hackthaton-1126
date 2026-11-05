// Drawn in the current canvas transform, in world pixels (tile * tileSize).
// One mask pixel per tile, scaled up with smoothing for the soft edge.
// Unexplored is solid #1A1020. Explored is the same color at 60% alpha. Visible is clear.

export const FOG_RGB = [0x1a, 0x10, 0x20];
export const FOG_EXPLORED_ALPHA = 0.6;

export function fogPixel(explored, visible) {
  if (visible) return [0, 0, 0, 0];
  if (explored) return [FOG_RGB[0], FOG_RGB[1], FOG_RGB[2], Math.round(255 * FOG_EXPLORED_ALPHA)];
  return [FOG_RGB[0], FOG_RGB[1], FOG_RGB[2], 255];
}

export function drawFogOverlay(ctx, fog, options = {}) {
  if (!fog || !fog.width || !fog.height || typeof document === "undefined") return;
  const tileSize = options.tileSize || 32;
  const canvas = document.createElement("canvas");
  canvas.width = fog.width;
  canvas.height = fog.height;
  const mask = canvas.getContext("2d");
  const image = mask.createImageData(fog.width, fog.height);
  const cells = fog.width * fog.height;
  for (let i = 0; i < cells; i++) {
    const pixel = fogPixel(fog.explored[i], fog.visible[i]);
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
