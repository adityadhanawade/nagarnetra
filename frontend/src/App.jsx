import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import StarsBackground from './components/StarsBackground.jsx'
import Home from './pages/Home.jsx'
import NotFound from './pages/NotFound.jsx'

// The map and chart libraries are heavy; load them only on the pages that use them.
const Capture = lazy(() => import('./pages/Capture.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))

function PageBackground() {
  // /capture draws its own, and turns it off while a shift runs to save the phone's battery
  const { pathname } = useLocation()
  return pathname.startsWith('/capture') ? null : <StarsBackground className="fixed inset-0 z-0" />
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <PageBackground />
        <Suspense fallback={<p role="status" className="px-4 pt-24 text-fg-muted">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
