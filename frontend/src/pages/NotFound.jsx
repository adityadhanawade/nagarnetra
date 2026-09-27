import { Link } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader.jsx'
import { primaryBtn } from '../lib/ui.js'

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="relative z-10 mx-auto max-w-xl px-4 pt-32">
        <h1 className="text-3xl font-semibold tracking-tight">Page Not Found</h1>
        <p className="mt-2 text-fg-muted">That address does not exist on NagarNetra.</p>
        <Link to="/" className={`mt-6 inline-flex h-12 items-center px-6 ${primaryBtn}`}>
          Back to Home
        </Link>
      </main>
    </>
  )
}
