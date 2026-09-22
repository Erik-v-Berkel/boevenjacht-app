const MAX_SIZE = 1600
const QUALITY = 0.7

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto maken mislukt'))), 'image/jpeg', QUALITY),
  )
}

function scaledCanvas(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Pakt het huidige camerabeeld als JPEG (max. 1600 px, kwaliteit 0,7 ≈ 300 KB). */
export function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  return toJpeg(scaledCanvas(video, video.videoWidth, video.videoHeight))
}

/** Verkleint een foto uit de terugvaloptie (<input capture>). */
export async function compressImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    return await toJpeg(scaledCanvas(bitmap, bitmap.width, bitmap.height))
  } finally {
    bitmap.close()
  }
}
