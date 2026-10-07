export function Brand() {
  return (
    <>
      <span className="brand-mark">
        <img src="/branding/victoria-mark.png" alt="" width={48} height={48} />
      </span>
      <span className="brand-copy">
        <span className="brand-name">ויקטוריה</span>
        <span className="brand-caption">מעקב ביטוחים חכם</span>
      </span>
    </>
  )
}

// Show the supplied central lockup through a viewport, preserving its original pixels.
export function BrandSignature({ className = '' }: { className?: string }) {
  return (
    <div className={`brand-signature ${className}`}>
      <img
        src="/branding/victoria-original.jpg"
        alt="ויקטוריה — מעקב ביטוחים חכם"
        width={1408}
        height={768}
        decoding="async"
      />
    </div>
  )
}
