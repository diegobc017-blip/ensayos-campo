function redimensionarBitmap(bitmap, maxLado) {
  let { width, height } = bitmap;
  if (width <= maxLado && height <= maxLado) {
    return { width, height };
  }
  const escala = maxLado / Math.max(width, height);
  return { width: Math.round(width * escala), height: Math.round(height * escala) };
}

function dibujarEnCanvas(bitmap, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, calidad) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', calidad);
  });
}

/**
 * A partir de un File de imagen, genera una versión principal (máx. 1600px
 * de lado mayor) y una miniatura (máx. 280px), ambas como Blob JPEG.
 */
export async function procesarImagen(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const principal = redimensionarBitmap(bitmap, 1600);
    const miniatura = redimensionarBitmap(bitmap, 280);

    const canvasPrincipal = dibujarEnCanvas(bitmap, principal.width, principal.height);
    const canvasMini = dibujarEnCanvas(bitmap, miniatura.width, miniatura.height);

    const [blob, thumbnailBlob] = await Promise.all([
      canvasToBlob(canvasPrincipal, 0.78),
      canvasToBlob(canvasMini, 0.7)
    ]);

    return { blob, thumbnailBlob };
  } finally {
    bitmap.close?.();
  }
}

export function blobAObjectURL(blob) {
  return URL.createObjectURL(blob);
}
