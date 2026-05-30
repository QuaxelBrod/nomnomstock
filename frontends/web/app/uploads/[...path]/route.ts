import { NextResponse } from 'next/server'

function resolveBackendBase() {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '')
  ).replace(/\/$/, '')
}

async function proxyUpload(_request: Request, { params }: { params: { path?: string[] } }) {
  const backendBase = resolveBackendBase()
  if (!backendBase) return NextResponse.json({ error: 'BACKEND_URL not configured' }, { status: 500 })

  const uploadPath = (params.path || []).map((part) => encodeURIComponent(part)).join('/')
  if (!uploadPath) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const response = await fetch(`${backendBase}/uploads/${uploadPath}`, { redirect: 'manual' })
  const body = await response.arrayBuffer()
  const proxied = new NextResponse(body, { status: response.status })

  const contentType = response.headers.get('content-type')
  const cacheControl = response.headers.get('cache-control')
  if (contentType) proxied.headers.set('content-type', contentType)
  if (cacheControl) proxied.headers.set('cache-control', cacheControl)

  return proxied
}

export async function GET(request: Request, context: { params: { path?: string[] } }) {
  return proxyUpload(request, context)
}

export async function HEAD(request: Request, context: { params: { path?: string[] } }) {
  return proxyUpload(request, context)
}
