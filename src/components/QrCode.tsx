import { useEffect, useState } from 'react'

/** QR-code voor een link (wit vlak, zodat elke camera hem ook in het donker leest). */
export function QrCode({ url, size = 260 }: { url: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('qrcode').then((QR) =>
      QR.toDataURL(url, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then((d) => !cancelled && setSrc(d)),
    )
    return () => {
      cancelled = true
    }
  }, [url, size])

  return (
    <div className="mx-auto rounded-2xl bg-white p-3" style={{ width: size + 24, height: size + 24 }}>
      {src && <img src={src} alt={`QR-code voor ${url}`} width={size} height={size} />}
    </div>
  )
}
