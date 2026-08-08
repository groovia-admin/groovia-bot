import { ImageResponse } from 'next/og'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#25D366',
          color: '#fff',
          fontSize: 108,
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        G
      </div>
    ),
    { width: 192, height: 192 }
  )
}
