// /app/api/deepgram/route.js (App Router style)
import { NextResponse } from 'next/server'

export async function GET() {
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY

  if (!DEEPGRAM_API_KEY) {
    return NextResponse.json({ error: 'API key not found' }, { status: 500 })
  }

  const deepgramSocketUrl = `wss://api.deepgram.com/v1/listen?punctuate=true&language=en`

  // Return the socket URL and the token (optional, if you want to handle it)
  return NextResponse.json({
    socketUrl: deepgramSocketUrl,
    token: DEEPGRAM_API_KEY, // frontend must not use this directly, use backend WebSocket
  })
}
