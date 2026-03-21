// App.jsx
// Handles routing and auth gating.
// Unauthenticated users see the Clerk sign-in page.
// Authenticated users are routed to the inventory or scan page.

import { SignedIn, SignedOut, RedirectToSignIn, useAuth } from '@clerk/clerk-react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { apiPost } from './api'
import InventoryPage from './pages/InventoryPage'
import ScanPage from './pages/ScanPage'

function SyncUser() {
  // Calls /api/auth/sync on first load to create the household if needed
  const { getToken, isSignedIn } = useAuth()

  useEffect(() => {
    if (isSignedIn) {
      apiPost('/auth/sync', null, getToken).catch(console.error)
    }
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
          <Route path="*"        element={<Navigate to="/" />} />
        </Routes>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}
