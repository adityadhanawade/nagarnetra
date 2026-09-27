import { Bus } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

const navLink = 'whitespace-nowrap rounded-xl px-2 py-2 hover:underline sm:px-3'

export default function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-line bg-bg">
      <a
        href="#main"
        className="sr-only rounded-xl bg-accent px-4 py-2 font-semibold text-on-accent focus:not-sr-only focus:absolute focus:left-4 focus:top-2"
      >
        Skip to Content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <Link to="/" className="inline-flex items-center gap-2 rounded-xl py-1 font-semibold hover:underline">
          <Bus size={26} weight="bold" className="text-accent" aria-hidden="true" />
          <span translate="no">NagarNetra</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
          <Link to="/dashboard" className={navLink}>
            Dashboard
          </Link>
          <Link to="/capture" className={navLink}>
            Bus Device
          </Link>
        </nav>
      </div>
    </header>
  )
}
