import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { apiGet, apiPost } from '../api'
import { useTheme } from '../ThemeContext'

const STEPS = {
  SCANNING: 'scanning',
  PRODUCE: 'produce',
  CONFIRM: 'confirm',
  MANUAL: 'manual',
  ADDING: 'adding',
}

const PRODUCE_KEYWORDS = [
  'apple','banana','orange','lemon','lime','strawberry','pineapple','mango',
  'grape','watermelon','pear','peach','cherry','avocado','broccoli','carrot',
  'corn','cucumber','eggplant','garlic','lettuce','mushroom','onion','pepper',
  'potato','pumpkin','spinach','tomato','zucchini','cabbage','cauliflower',
  'celery','artichoke','asparagus','blueberry','raspberry','fig','papaya',
  'kiwi','coconut','pomegranate','grapefruit','tangerine','plum','apricot',
  'nectarine','jackfruit','squash','yam','radish','turnip','beet','leek',
  'melon','dragonfruit','guava','lychee','persimmon','quince','gooseberry',
  'blackberry','cranberry','currant','date','tamarind','starfruit','rambutan',
  'fennel','kohlrabi','bok choy','kale','arugula','rocket','chard','endive',
]

function cleanClassName(name) {
  const found = PRODUCE_KEYWORDS.find(kw => name.toLowerCase().includes(kw))
  if (!found) return null
  return found.charAt(0).toUpperCase() + found.slice(1)
}

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export default function ScanPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { dark, toggle } = useTheme()
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const modelRef = useRef(null)

  const [step, setStep] = useState(STEPS.SCANNING)
  const [product, setProduct] = useState(null)
  const [source, setSource] = useState(null)
  const [editedName, setEditedName] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [manualName, setManualName] = useState('')
  const [error, setError] = useState(null)
  const [modelLoading, setModelLoading] = useState(false)

  useEffect(() => {
    if (step !== STEPS.SCANNING && step !== STEPS.PRODUCE) return

    const reader = new BrowserMultiFormatReader()
    let stopped = false

    const timer = setTimeout(async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        const device = devices.find(d => d.label.toLowerCase().includes('back'))
          ?? devices.find(d => d.label.toLowerCase().includes('rear'))
          ?? devices[0]

        if (step === STEPS.SCANNING) {
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
        } else if (step === STEPS.PRODUCE) {
          const constraints = { video: { deviceId: device?.deviceId, facingMode: 'environment' } }
          const stream = await navigator.mediaDevices.getUserMedia(constraints)
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          controlsRef.current = { stop: () => stream.getTracks().forEach(t => t.stop()) }
        }
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

  async function handleCaptureProduce() {
    setError(null)
    setModelLoading(true)
    try {
      if (!modelRef.current) {
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js')
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.0/dist/mobilenet.min.js')
        modelRef.current = await window.mobilenet.load()
      }

      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      canvas.getContext('2d').drawImage(video, 0, 0)

      const predictions = await modelRef.current.classify(canvas)
      const match = predictions
        .map(p => ({ ...p, clean: cleanClassName(p.className) }))
        .find(p => p.clean !== null)

      controlsRef.current?.stop()

      if (match) {
        setSource('mobilenet')
        setProduct({ barcode: null })
        setEditedName(match.clean)
        setStep(STEPS.CONFIRM)
      } else {
        setProduct({ barcode: null })
        setStep(STEPS.MANUAL)
        setError('Could not identify produce — please enter the name manually.')
      }
    } catch (e) {
      setError('Identification failed: ' + e.message)
    } finally {
      setModelLoading(false)
    }
  }

  async function handleAdd() {
    setStep(STEPS.ADDING)
    setError(null)
    try {
      let productId = product?.id
      const nameToUse = (source === 'not_found' || source === 'mobilenet' || !product?.id)
        ? (editedName.trim() || manualName.trim())
        : editedName.trim() || product.name

      if (source !== 'cache') {
        const created = await apiPost('/products', {
          name: nameToUse,
          barcode: product?.barcode || null,
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
      setStep(source === 'not_found' || source === 'mobilenet' ? STEPS.MANUAL : STEPS.CONFIRM)
    }
  }

  const inputClass = "bg-gray-800 rounded-lg px-4 py-2 text-white w-full placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
        <p className="text-sm font-medium">
          {step === STEPS.PRODUCE ? 'Identify produce' : 'Scan barcode'}
        </p>
        <button onClick={toggle} className="text-gray-400 hover:text-white text-lg">
          {dark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Barcode scanning */}
      {step === STEPS.SCANNING && (
        <div className="flex-1 flex flex-col items-center justify-between px-4 py-4">
          <div className="w-full max-w-sm aspect-square rounded-2xl overflow-hidden relative bg-gray-800">
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
            <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-24 border-2 border-white/60 rounded-lg" />
            </div>
          </div>
          <p className="text-gray-400 text-sm mt-3">Point camera at a barcode</p>
          {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}

          <div className="w-full max-w-sm mt-6 space-y-3">
            <button
              onClick={() => { controlsRef.current?.stop(); setError(null); setStep(STEPS.PRODUCE) }}
              className="w-full py-3 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-800 transition text-sm font-medium flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Identify fruit or vegetable
            </button>
            <button
              onClick={() => { controlsRef.current?.stop(); setProduct({ barcode: null }); setSource('not_found'); setStep(STEPS.MANUAL) }}
              className="w-full py-3 rounded-xl border border-gray-700 text-gray-500 hover:bg-gray-800 transition text-sm"
            >
              Add item manually
            </button>
          </div>
        </div>
      )}

      {/* Produce identification */}
      {step === STEPS.PRODUCE && (
        <div className="flex-1 flex flex-col items-center justify-between px-4 py-4">
          <div className="w-full max-w-sm aspect-square rounded-2xl overflow-hidden relative bg-gray-800">
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
            <div className="absolute inset-0 border-2 border-green-400/40 rounded-2xl pointer-events-none" />
          </div>
          <p className="text-gray-400 text-sm mt-3 text-center">
            Hold the item clearly in frame, then tap capture
          </p>
          {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}

          <div className="w-full max-w-sm mt-6 space-y-3">
            <button
              onClick={handleCaptureProduce}
              disabled={modelLoading}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-medium hover:bg-green-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {modelLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
                  </svg>
                  Loading model...
                </>
              ) : 'Capture and identify'}
            </button>
            <button
              onClick={() => { controlsRef.current?.stop(); setStep(STEPS.SCANNING) }}
              className="w-full py-3 rounded-xl border border-gray-700 text-gray-500 hover:bg-gray-800 transition text-sm"
            >
              Back to barcode scan
            </button>
          </div>
        </div>
      )}

      {/* Confirm — product found (barcode or produce) */}
      {(step === STEPS.CONFIRM || step === STEPS.ADDING) && product && (
        <div className="flex-1 flex flex-col px-4 py-6 max-w-sm mx-auto w-full">
          <div className="bg-gray-800 rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-400 mb-1">
              {source === 'cache' ? 'Found in your catalogue'
                : source === 'mobilenet' ? 'Identified by camera'
                : 'Found on Open Food Facts'}
            </p>
          </div>

          <label className="text-sm text-gray-400 mb-1">
            Product name
            {(product.name === 'Unknown' || source === 'mobilenet') && (
              <span className="text-green-400 ml-1">— edit if needed</span>
            )}
          </label>
          <input type="text" value={editedName} onChange={e => setEditedName(e.target.value)}
            placeholder="Enter product name"
            className={`${inputClass} mb-4`} />

          <label className="text-sm text-gray-400 mb-1">Expiry date (optional)</label>
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            className={`${inputClass} mb-4`} />

          <label className="text-sm text-gray-400 mb-1">Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. opened, freezer"
            className={`${inputClass} mb-6`} />

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <button onClick={handleAdd}
            disabled={step === STEPS.ADDING || !editedName.trim()}
            className="bg-white text-gray-900 font-medium py-3 rounded-xl hover:bg-gray-100 transition disabled:opacity-50">
            {step === STEPS.ADDING ? 'Adding...' : 'Add to inventory'}
          </button>
        </div>
      )}

      {/* Manual entry */}
      {step === STEPS.MANUAL && (
        <div className="flex-1 flex flex-col px-4 py-6 max-w-sm mx-auto w-full">
          <p className="text-gray-400 text-sm mb-6">
            {source === 'not_found'
              ? 'Barcode not recognised — enter the product name manually.'
              : 'Enter the item details below.'}
          </p>

          <label className="text-sm text-gray-400 mb-1">Product name</label>
          <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
            placeholder="e.g. Whole Milk"
            className={`${inputClass} mb-4`} />

          <label className="text-sm text-gray-400 mb-1">Expiry date (optional)</label>
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            className={`${inputClass} mb-4`} />

          <label className="text-sm text-gray-400 mb-1">Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. opened, freezer"
            className={`${inputClass} mb-6`} />

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
