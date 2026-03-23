import { SignedIn, SignedOut, RedirectToSignIn, useAuth } from '@clerk/clerk-react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { apiPost } from './api'
import InventoryPage from './pages/InventoryPage'
import ScanPage from './pages/ScanPage'
import ToBuyPage from './pages/ToBuyPage'

function SyncUser() {
  const { getToken, isSignedIn } = useAuth()

  useEffect(() => {
    if (!isSignedIn) return
    async function sync() {
      try {
        await apiPost('/auth/sync', null, getToken)
      } catch (e) {
        setTimeout(async () => {
          try { await apiPost('/auth/sync', null, getToken) }
          catch (e2) { console.error('Auth sync failed:', e2.message) }
        }, 1000)
      }
    }
    sync()
  }, [isSignedIn])

  return null
}

export default function App() {
  return (
    <>
      <SignedIn>
        <SyncUser />
        <Routes>
          <Route path="/"        element={<InventoryPage />} />
          <Route path="/scan"    element={<ScanPage />} />
          <Route path="/to-buy"  element={<ToBuyPage />} />
          <Route path="*"        element={<Navigate to="/" />} />
        </Routes>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}
