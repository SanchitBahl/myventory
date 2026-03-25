import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { apiGet, apiPost } from '../api'
import { useTheme } from '../ThemeContext'

const STEPS = { SCANNING: 'scanning', CONFIRM: 'confirm', MANUAL: 'manual', ADDING: 'adding' }

export default function ScanPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { dark, toggle } = useTheme()
  const videoRef = useRef(null)
  const controlsRef = useRef(null)

  const [step, setStep] = useState(STEPS.SCANNING)
  const [product, setProduct] = useState(null)
  const [source, setSource] = useState(null)
  const [editedName, setEditedName] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [manualName, setManualName] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (step !== STEPS.SCANNING) return

    const reader = new BrowserMultiFormatReader()
    let stopped = false

    const timer = setTimeout(async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        const device = devices.find(d => d.label.toLowerCase().includes('back'))
          ?? devices.find(d => d.label.toLowerCase().includes('rear'))
          ?? devices[0]

        const controls = await reader.decodeFromVideoDevice(
          device?.deviceId ?? undefined,
          videoRef.current,
          async (result) => {
            if (!result || stopped) return
            stopped = true
            controls.stop()
            const barcode = result.getText()
            try {
              const data = await apiGet(`/barcode/${barcode}`, getToken)
              setSource(data.source)
              if (data.found) {
                setProduct(data.product)
                setEditedName(data.product.name === 'Unknown' ? '' : data.product.name)
                setStep(STEPS.CONFIRM)
              } else {
                setProduct({ barcode })
                setStep(STEPS.MANUAL)
              }
            } catch (e) {
              setError(e.message)
              stopped = false
            }
          }
        )
        controlsRef.current = controls
      } catch (e) {
        setError('Could not access camera: ' + e.message)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      stopped = true
      controlsRef.current?.stop()
    }
  }, [step])

  async function handleAdd() {
    setStep(STEPS.ADDING)
    setError(null)
    try {
      let productId = product.id
      const nameToUse = editedName.trim() || product.name

      if (source !== 'cache') {
        const created = await apiPost('/products', {
          name: nameToUse,
          barcode: product.barcode || null,
        }, getToken)
        productId = created.id
      }

      await apiPost('/inventory', {
        product_id: productId,
        expires_at: expiresAt || null,
        notes: notes || null,
      }, getToken)

      navigate('/')
    } catch (e) {
      setError(e.message)
      setStep(source === 'not_found' ? STEPS.MANUAL : STEPS.CONFIRM)
    }
  }

  const inputClass = "bg-gray-800 dark:bg-gray-700 rounded-lg px-4 py-2 text-white w-full placeholder-gray-500"

  return (
    <div className="min-h-screen bg-gray-900 dark:bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
        <p className="text-sm font-medium">Scan barcode</p>
        <button onClick={toggle} className="text-gray-400 hover:text-white text-lg">
          {dark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Camera */}
      {step === STEPS.SCANNING && (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-sm aspect-square rounded-2xl overflow-hidden relative bg-gray-800">
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
            <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none" />
          </div>
          <p className="text-gray-400 text-sm mt-4">Point camera at a barcode</p>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>
      )}

      {/* Confirm */}
      {(step === STEPS.CONFIRM || step === STEPS.ADDING) && product && (
        <div className="flex-1 flex flex-col px-4 py-6 max-w-sm mx-auto w-full">
          <div className="bg-gray-800 rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-400 mb-1">
              {source === 'cache' ? 'Found in your catalogue' : 'Found on Open Food Facts'}
            </p>
          </div>

          <label className="text-sm text-gray-400 mb-1">
            Product name {product.name === 'Unknown' && <span className="text-amber-400">— not recognised, please enter manually</span>}
          </label>
          <input type="text" value={editedName} onChange={e => setEditedName(e.target.value)}
            placeholder={product.name === 'Unknown' ? 'Enter product name' : product.name}
            className={`${inputClass} mb-4`} />

          <label className="text-sm text-gray-400 mb-1">Expiry date (optional)</label>
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            className={`${inputClass} mb-4`} />

          <label className="text-sm text-gray-400 mb-1">Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. opened, freezer" className={`${inputClass} mb-6`} />

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <button onClick={handleAdd}
            disabled={step === STEPS.ADDING || (product.name === 'Unknown' && !editedName.trim())}
            className="bg-white text-gray-900 font-medium py-3 rounded-xl hover:bg-gray-100 transition disabled:opacity-50">
            {step === STEPS.ADDING ? 'Adding...' : 'Add to inventory'}
          </button>
        </div>
      )}

      {/* Manual entry */}
      {step === STEPS.MANUAL && (
        <div className="flex-1 flex flex-col px-4 py-6 max-w-sm mx-auto w-full">
          <p className="text-gray-400 text-sm mb-6">Barcode not recognised — enter the product name manually.</p>

          <label className="text-sm text-gray-400 mb-1">Product name</label>
          <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
            placeholder="e.g. Whole Milk" className={`${inputClass} mb-4`} />

          <label className="text-sm text-gray-400 mb-1">Expiry date (optional)</label>
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            className={`${inputClass} mb-4`} />

          <label className="text-sm text-gray-400 mb-1">Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. opened, freezer" className={`${inputClass} mb-6`} />

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <button onClick={handleAdd} disabled={!manualName.trim()}
            className="bg-white text-gray-900 font-medium py-3 rounded-xl hover:bg-gray-100 transition disabled:opacity-50">
            Add to inventory
          </button>
        </div>
      )}
    </div>
  )
}
