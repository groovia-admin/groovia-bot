import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      pincode: string
    }>
  }
) {
  const { pincode } = await params

  if (!/^\d{6}$/.test(pincode)) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Please enter a valid 6-digit Pincode.',
      },
      {
        status: 400,
      }
    )
  }

  try {
    const response = await fetch(
      `https://api.postalpincode.in/pincode/${pincode}`,
      {
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Unable to look up this Pincode.',
        },
        {
          status: 502,
        }
      )
    }

    const result = await response.json()

    const record = result?.[0]

    if (
      record?.Status !== 'Success' ||
      !record?.PostOffice?.length
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Pincode was not found.',
        },
        {
          status: 404,
        }
      )
    }

    const postOffice =
      record.PostOffice[0]

    return NextResponse.json({
      success: true,
      city:
        postOffice.District ||
        postOffice.Division ||
        '',
      state:
        postOffice.State || '',
    })
  } catch (error) {
    console.error(
      'Pincode lookup failed:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        message:
          'Unable to look up the Pincode.',
      },
      {
        status: 500,
      }
    )
  }
}