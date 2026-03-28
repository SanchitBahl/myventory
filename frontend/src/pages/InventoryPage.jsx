import { useEffect, useState, useMemo } from 'react'
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
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('expiry')

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

  const filteredGroups = useMemo(() => {
    let result = groups

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(g => g.product.name.toLowerCase().includes(q))
    }

    if (sort === 'alpha') {
      result = [...result].sort((a, b) => a.product.name.localeCompare(b.product.name))
    } else {
      result = [...result].sort((a, b) => {
        const aDate = a.items[0]?.expires_at
        const bDate = b.items[0]?.expires_at
        if (!aDate && !bDate) return 0
        if (!aDate) return 1
        if (!bDate) return -1
        return new Date(aDate) - new Date(bDate)
      })
    }

    return result
  }, [groups, search, sort])

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

        {/* Search + sort bar — only shown when not loading */}
        {!loading && (
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search items..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs">
                  ✕
                </button>
              )}
            </div>

            {/* Sort toggle */}
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm shrink-0">
              <button
                onClick={() => setSort('expiry')}
                className={`px-3 py-2 transition ${sort === 'expiry' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                Expiry
              </button>
              <button
                onClick={() => setSort('alpha')}
                className={`px-3 py-2 border-l border-gray-200 dark:border-gray-700 transition ${sort === 'alpha' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                A – Z
              </button>
            </div>
          </div>
        )}

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

        {!loading && groups.length > 0 && filteredGroups.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-3">🔍</p>
            <p className="font-medium">No results for "{search}"</p>
            <button onClick={() => setSearch('')} className="text-sm mt-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline">
              Clear search
            </button>
          </div>
        )}

        <div className="space-y-4">
          {filteredGroups.map(group => (
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
