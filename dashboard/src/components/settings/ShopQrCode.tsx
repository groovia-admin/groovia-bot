import QRCode from 'qrcode'

type Props = {
  slug: string | null
  whatsappNumber: string | null
}

// Async Server Component — the QR image is generated once per page
// render (qrcode's Node API, not the browser canvas one) and embedded
// as a data URI, so the only client-side behavior needed is a plain
// <a download> link. No 'use client' interactivity required at all.
export default async function ShopQrCode({ slug, whatsappNumber }: Props) {
  if (!slug) {
    return <p style={{ fontSize: 13, color: '#667781' }}>Shop link not available yet.</p>
  }

  if (!whatsappNumber) {
    return (
      <p style={{ fontSize: 13, color: '#667781' }}>
        Connect a WhatsApp number first (see your platform admin) — the QR code links directly to a WhatsApp chat, so it
        needs a number to point to.
      </p>
    )
  }

  // Same "SHOP-{slug}" pre-filled text the bot already recognizes as a
  // QR entry point (Phase 2's handleShopSlugEntry) — scanning this and
  // sending the pre-filled message is the entire flow, no new bot-side
  // handling needed.
  const digits = whatsappNumber.replace(/\D/g, '')
  const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(`SHOP-${slug}`)}`
  const dataUrl = await QRCode.toDataURL(waLink, { width: 320, margin: 2 })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URI, not an optimizable remote image */}
      <img
        src={dataUrl}
        alt="Scan to start ordering on WhatsApp"
        width={160}
        height={160}
        style={{ borderRadius: 8, border: '1px solid #E9EDEF' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 12, color: '#667781', margin: 0, maxWidth: 320 }}>
          Print this near your counter, or share it online. Scanning it opens WhatsApp with a message pre-filled — no
          typing needed for the customer.
        </p>
        <a
          href={dataUrl}
          download={`${slug}-whatsapp-qr.png`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: '#128C7E',
            textDecoration: 'none',
            width: 'fit-content',
          }}
        >
          Download QR code
        </a>
      </div>
    </div>
  )
}
