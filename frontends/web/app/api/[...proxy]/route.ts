import { NextResponse } from 'next/server'

async function proxyRequest(request: Request) {
  try {
    const backendBase = (
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_BASE ||
      (process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '')
    ).replace(/\/$/, '')
    if (!backendBase) return NextResponse.json({ error: 'BACKEND_URL not configured' }, { status: 500 })

    const url = new URL(request.url)
    const apiMarker = '/api'
    const markerIndex = url.pathname.indexOf(apiMarker)
    const backendHasApiSuffix = /\/api$/i.test(backendBase)

    let proxiedPath = url.pathname
    if (markerIndex >= 0) {
      proxiedPath = backendHasApiSuffix
        ? url.pathname.slice(markerIndex + apiMarker.length)
        : url.pathname.slice(markerIndex)
    }

    if (!proxiedPath.startsWith('/')) proxiedPath = `/${proxiedPath}`
    if (!proxiedPath) proxiedPath = '/'

    const target = `${backendBase}${proxiedPath}${url.search}`

    // forward headers (cookies for auth)
    const headers: Record<string,string> = {}
    const reqHeaders = (request as any).headers
    try {
      for (const [k,v] of reqHeaders.entries()) {
        if (k.toLowerCase() === 'host') continue
        headers[k] = v
      }
    } catch {}

    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()

    const res = await fetch(target, { method: request.method, headers, body, redirect: 'manual' })

    const resBody = await res.arrayBuffer()
    const response = new NextResponse(resBody, { status: res.status })
    // copy response headers
    res.headers.forEach((v,k) => response.headers.set(k, v))
    return response
  } catch (err) {
    console.error('proxy error', err)
    return NextResponse.json({ error: 'proxy error' }, { status: 502 })
  }
}

export async function GET(request: Request) { return proxyRequest(request) }
export async function POST(request: Request) { return proxyRequest(request) }
export async function PUT(request: Request) { return proxyRequest(request) }
export async function PATCH(request: Request) { return proxyRequest(request) }
export async function DELETE(request: Request) { return proxyRequest(request) }
