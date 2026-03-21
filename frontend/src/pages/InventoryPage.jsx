// pages/InventoryPage.jsx
// Main inventory view — lists all items grouped by product, sorted by expiry.

import { useEffect, useState } from 'react'
import { useAuth, useUser, UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiDelete } from '../api'

function ExpiryBadge({ date }) {
  if (!date) return <span className="text-xs text-gray-400">No expiry</span>

  const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24))
  const label = days < 0 ? 'Expired' : days === 0 ? 'Today' : `${days}d`
  const colour = days < 0 ? 'bg-red-100 text-red-700' : days <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'

  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colour}`}>{label}</span>
}

export default function InventoryPage() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const data = await apiGet('/inventory', getToken)
      setGroups(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(itemId) {
    try {
      await apiDelete(`/inventory/${itemId}`, getToken)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Myventory</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/scan')}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition"
          >
            + Scan item
          </button>
          <UserButton />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-4 py-6">
        {loading && <p className="text-gray-500 text-sm">Loading...</p>}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {!loading && groups.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="font-medium">No items yet</p>
            <p className="text-sm mt-1">Tap "Scan item" to add your first product</p>
          </div>
        )}
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-medium text-gray-900">{group.product.name}</p>
                {group.product.category && (
                  <p className="text-xs text-gray-400 mt-0.5">{group.product.category}</p>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {group.items.map(item => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ExpiryBadge date={item.expires_at} />
                      {item.notes && <span className="text-xs text-gray-400">{item.notes}</span>}
                    </div>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
