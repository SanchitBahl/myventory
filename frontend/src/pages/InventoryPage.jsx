import { useEffect, useState } from 'react'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiDelete, apiPost, apiPatch } from '../api'
import { useTheme } from '../ThemeContext'

function ExpiryBadge({ date, onClick }) {
  const base = "text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer"
  if (!date) return (
    <span onClick={onClick} className={`${base} bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600`}>
      Set expiry
    </span>
  )
  const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24))
  const label = days < 0 ? 'Expired' : days === 0 ? 'Today' : `${days}d`
  const colour = days < 0
    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200'
    : days <= 3
    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200'
    : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200'
  return <span onClick={onClick} className={`${base} ${colour}`}>{label}</span>
}

function ConfirmDialog({ onAddToBuy, onRemove, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 px-4 pb-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-white">Remove item</p>
          <p className="text-sm text-gray-400 mt-0.5">What would you like to do?</p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <button onClick={onAddToBuy} className="w-full px-5 py-4 text-left text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition">
            Add to to-buy list
          </button>
          <button onClick={onRemove} className="w-full px-5 py-4 text-left text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
            Remove from inventory
          </button>
          <button onClick={onCancel} className="w-full px-5 py-4 text-left text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function EditExpiryDialog({ item, onSave, onCancel }) {
  const [value, setValue] = useState(item.expires_at || '')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 px-4 pb-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-white">Edit expiry date</p>
        </div>
        <div className="px-5 py-4">
          <input
            type="date"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
          />
          {value && (
            <button onClick={() => onSave(null)} className="text-xs text-gray-400 hover:text-red-500 mt-2 block">
              Clear expiry date
            </button>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
            Cancel
          </button>
          <button onClick={() => onSave(value || null)} className="flex-1 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm hover:bg-gray-700 dark:hover:bg-gray-100 transition">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { dark, toggle } = useTheme()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [confirmItem, setConfirmItem] = useState(null)
  const [editExpiryItem, setEditExpiryItem] = useState(null)

  async function load() {
    try {
      const data = await apiGet('/inventory', getToken)
      setGroups(data)
    } catch (e) {
      if (e.message.includes('not found') || e.message.includes('sync')) {
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAddToBuy() {
    try {
      await apiPost('/to-buy', { product_id: confirmItem.product_id }, getToken)
      await apiDelete(`/inventory/${confirmItem.id}`, getToken)
      setConfirmItem(null)
      load()
    } catch (e) { alert(e.message) }
  }

  async function handleRemove() {
    try {
      await apiDelete(`/inventory/${confirmItem.id}`, getToken)
      setConfirmItem(null)
      load()
    } catch (e) { alert(e.message) }
  }

  async function handleSaveExpiry(newDate) {
    try {
      const body = newDate === null ? { clear_expiry: true } : { expires_at: newDate }
      await apiPatch(`/inventory/${editExpiryItem.id}`, body, getToken)
      setEditExpiryItem(null)
      load()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {confirmItem && (
        <ConfirmDialog
          item={confirmItem}
          onAddToBuy={handleAddToBuy}
          onRemove={handleRemove}
          onCancel={() => setConfirmItem(null)}
        />
      )}
      {editExpiryItem && (
        <EditExpiryDialog
          item={editExpiryItem}
          onSave={handleSaveExpiry}
          onCancel={() => setEditExpiryItem(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Myventory</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/to-buy')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
            To-buy
          </button>
          <button onClick={() => navigate('/scan')} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm px-4 py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition">
            + Scan
          </button>
          <button onClick={toggle} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition text-lg">
            {dark ? '☀️' : '🌙'}
          </button>
          <UserButton />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-4 py-6">
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {!loading && groups.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="font-medium">No items yet</p>
            <p className="text-sm mt-1">Tap "Scan" to add your first product</p>
          </div>
        )}
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.product.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <p className="font-medium text-gray-900 dark:text-white">{group.product.name}</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {group.items.map(item => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ExpiryBadge date={item.expires_at} onClick={() => setEditExpiryItem(item)} />
                      {item.notes && <span className="text-xs text-gray-400">{item.notes}</span>}
                    </div>
                    <button
                      onClick={() => setConfirmItem({ ...item, product_id: group.product.id })}
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
