"use client"

import { useState } from 'react'

export default function RezeptePage() {
  const [loading, setLoading] = useState(false)
  const [recipe, setRecipe] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userInput, setUserInput] = useState('')

  const generate = async () => {
    setError(null)
    setRecipe(null)
    setLoading(true)
    try {
      const res = await fetch('/api/recipes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput }),
      })
      const data = await res.json()
      if (res.status === 503) {
        setError(data?.recipe || 'Chat nicht verfügbar')
        return
      }
      if (!res.ok) throw new Error(data?.error || 'Fehler')
      setRecipe(data.recipe || JSON.stringify(data))
    } catch (e: any) {
      setError(e.message || 'Fehler beim Generieren')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white/95 rounded-lg p-6 flex flex-col items-center gap-4 w-11/12 max-w-sm">
            <div className="animate-spin h-10 w-10 border-4 border-t-transparent rounded-full border-gray-700" />
            <div className="text-gray-800">Bitte warten — Rezept wird generiert…</div>
          </div>
        </div>
      )}
      <h1 className="text-2xl font-semibold mb-4">Rezepte</h1>
      <p className="mb-4 text-sm text-gray-600">Beschreibe kurz, was du magst (z. B. "würzig, vegetarisch, wenig Aufwand"). Die Zutaten aus deinem Vorrat werden automatisch verwendet.</p>

      {error && <div className="text-red-600 mb-3">{error}</div>}

      <textarea value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="Was magst du? z.B. 'pikant, vegetarisch'" className="w-full p-2 border rounded mb-4" rows={3} />

      <div className="flex gap-2">
        <button onClick={generate} className="px-3 py-2 bg-green-600 text-white rounded" disabled={loading}>{loading ? 'Generiere…' : 'Rezept generieren'}</button>
        <button onClick={() => { setRecipe(null); setError(null); setUserInput('') }} className="px-3 py-2 bg-gray-200 rounded">Zurücksetzen</button>
      </div>

      {recipe && (
        <section className="mt-6 p-4 border rounded bg-white">
          <h2 className="text-lg font-semibold mb-2">Vorschlag</h2>
          <pre className="whitespace-pre-wrap">{recipe}</pre>
        </section>
      )}
    </main>
  )
}
