import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import fs from 'fs'
import path from 'path'
import { log } from 'console'

type Body = { userInput?: string }

async function callOllama(prompt: string) {
  const url = process.env.OLLAMA_URL
  const model = process.env.OLLAMA_MODEL || 'cortex'
  if (!url) throw new Error('OLLAMA_URL not configured')
  const full = `${url}/api/generate`
//  log('Calling Ollama with prompt:', prompt)

  const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || '60000', 10)
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(full, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt }),
      signal: controller.signal,
    })
  } catch (err: any) {
    if (err && (err.name === 'AbortError' || err.type === 'aborted')) {
      throw new Error('Ollama request timed out')
    }
    throw err
  } finally {
    clearTimeout(id)
  }

  if (!res.ok) {
    const errTxt = await res.text().catch(() => '')
    throw new Error('Ollama request failed' + (errTxt ? (': ' + errTxt.slice(0, 200)) : ''))
  }

  // Ollama may return plain text or stream NDJSON rather than a single JSON object.
  // Try to read the full body as text and parse JSON if possible; otherwise return raw text.
  const bodyText = await res.text()
  try {
    const data = JSON.parse(bodyText)
    if (data && data.text) return data.text
    if (data && data.choices && data.choices[0] && data.choices[0].message) return data.choices[0].message.content
    return JSON.stringify(data)
  } catch (err) {
    // Not JSON — try NDJSON (one JSON object per line) and join `response`/`text` parts
    try {
      const lines = bodyText.split(/\r?\n/).filter(Boolean)
      const parts = lines.map((l) => {
        try {
          const o = JSON.parse(l)
          return (o.response ?? o.text ?? '')
        } catch {
          return ''
        }
      })
      const combined = parts.join('')
      if (combined) return combined
    } catch {}

    // Fall back to raw text
    return bodyText
  }
}

function renderTemplate(template: string, vars: Record<string, string>) {
  let out = template
  for (const k of Object.keys(vars)) {
    out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), vars[k])
  }
  return out
}

export async function POST(req: Request) {
  try {
    const body: Body = await req.json()
    const userInput = (body.userInput || '').trim()

    // load available ingredients from stock
    const stocks = await prisma.stock.findMany({ where: { quantity: { gt: 0 } }, include: { product: true } })
    const ingredientNames = stocks.map((s: any) => `${s.product.name}${s.quantity ? ` (${s.quantity}${s.unit ? ' ' + s.unit : ''})` : ''}`)

    // read prompt template
    const tplPath = path.resolve(process.cwd(), 'prompts', 'recipe_prompt.txt')
    let tpl = ''
    try {
      tpl = await fs.promises.readFile(tplPath, 'utf-8')
    } catch (e) {
      tpl = 'Verfügbare Zutaten:\n{{ingredients}}\n\nBenutzerwunsch:\n{{user_input}}\n\nErstelle ein Rezept.'
    }

    const prompt = renderTemplate(tpl, {
      ingredients: ingredientNames.join('\n'),
      user_input: userInput || 'keine speziellen Wünsche',
    })

    // Determine whether Ollama is enabled via env (accept common truthy values)
    const ollamaUrl = process.env.OLLAMA_URL
    const rawEnabled = process.env.OLLAMA_ENABLED
    const enabled = rawEnabled
      ? ['1', 'true', 'yes', 'on'].includes(String(rawEnabled).toLowerCase())
      : true

    // If Ollama disabled or not configured, return an unavailable message
    if (!ollamaUrl || !enabled) {
      return NextResponse.json({ recipe: 'Chat nicht verfügbar' }, { status: 503 })
    }

    try {
      const text = await callOllama(prompt)
      return NextResponse.json({ recipe: text })
    } catch (e: any) {
      return NextResponse.json({ recipe: 'Chat nicht verfügbar' }, { status: 503 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'error' }, { status: 500 })
  }
}
