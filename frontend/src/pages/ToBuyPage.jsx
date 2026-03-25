import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiDelete } from '../api'
import { useTheme } from '../ThemeContext'

export default function ToBuyPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { dark, toggle } = useTheme()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const data = await apiGet('/to-buy', getToken)
      setItems(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleRemove(id) {
    try {
      await apiDelete(`/to-buy/${id}`, getToken)
      load()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
          ← Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">To-buy list</h1>
        <button onClick={toggle} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition text-lg">
          {dark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-4 py-6">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {!loading && items.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">🛒</p>
            <p className="font-medium">Nothing to buy</p>
            <p className="text-sm mt-1">Items you need to restock will appear here</p>
          </div>
        )}
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{item.product_name}</p>
                {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
              </div>
              <button
                onClick={() => handleRemove(item.id)}
                className="text-xs text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition"
              >
                Done
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
