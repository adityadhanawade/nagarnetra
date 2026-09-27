import { Car, ListNumbers, RoadHorizon, Timer } from '@phosphor-icons/react'
import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader.jsx'
import { outlineBtn, primaryBtn } from '../lib/ui.js'

const MapPreview = lazy(() => import('../components/MapPreview.jsx'))

const STEPS = [
  {
    title: 'Buses Sense the Road',
    body: 'A phone on the dashboard shares location and camera frames while the bus runs its normal route. Nobody has to press anything.',
  },
  {
    title: 'AI Spots the Problems',
    body: 'Potholes, damaged roads and waterlogging are detected on each frame. Vehicles are counted to find bottlenecks.',
  },
  {
    title: 'Authorities See What to Fix First',
    body: 'Every finding lands on one live map. Spots that many buses pass rank highest, so repairs start where they matter most.',
  },
]

const FINDINGS = [
  {
    icon: RoadHorizon,
    title: 'Road Damage',
    body: 'Potholes, cracked surfaces and waterlogged stretches, pinned to the exact spot on the map.',
  },
  {
    icon: Car,
    title: 'Traffic Bottlenecks',
    body: 'Vehicle counts and slow bus speeds show where traffic builds up, and when.',
  },
  {
    icon: Timer,
    title: 'Route Delays',
    body: 'Live speeds compared with each route’s usual pace, so late routes stand out.',
  },
  {
    icon: ListNumbers,
    title: 'Repair Priority',
    body: 'Damage seen by more buses ranks higher, so limited budgets go to the busiest roads first.',
  },
]

const ctaLink = 'inline-flex h-14 items-center justify-center px-6 text-lg'

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main id="main" className="relative z-10">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-24 md:px-8 md:pb-24 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
              Every Bus Becomes the City’s Eye
            </h1>
            <p className="mt-4 max-w-[52ch] text-lg text-fg-muted">
              NagarNetra reads bus camera and GPS data to find road damage, traffic jams and delays before anyone
              reports them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/dashboard" className={`${ctaLink} ${primaryBtn}`}>
                Open Dashboard
              </Link>
              <Link to="/capture" className={`${ctaLink} ${outlineBtn}`}>
                Start a Shift
              </Link>
            </div>
          </div>
          <Suspense fallback={<div className="h-80 rounded-xl border border-line bg-surface" aria-hidden="true" />}>
            <MapPreview />
          </Suspense>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8 md:pb-24">
          <ol className="flex max-w-2xl flex-col gap-10">
            {STEPS.map(({ title, body }) => (
              <li key={title}>
                <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</h2>
                <p className="mt-2 max-w-[55ch] text-fg-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8 md:pb-24">
          <h2 className="max-w-[22ch] text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Four Things Authorities Can Act On
          </h2>
          <p className="mt-4 max-w-[65ch] text-fg-muted">
            Everything here comes from the buses’ own cameras and GPS. Nothing depends on citizens filing reports.
          </p>
          <ul className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {FINDINGS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <Icon size={32} weight="bold" className="mt-1 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <h3 className="text-xl font-semibold">{title}</h3>
                  <p className="mt-1 max-w-[45ch] text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8 md:pb-24">
          <div className="rounded-xl border border-line bg-surface p-8 md:p-12">
            <h2 className="max-w-[24ch] text-2xl font-semibold tracking-tight text-balance md:text-4xl">
              No New Hardware, No Paid Services
            </h2>
            <p className="mt-4 max-w-[65ch] text-fg-muted">
              Each bus needs one phone on the dashboard. The platform runs on the free tiers of open tools.
            </p>
            <p className="mt-6 font-mono text-sm text-fg-muted">React, FastAPI, Supabase, YOLOv8, OpenStreetMap</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8 md:pb-28">
          <h2 className="max-w-[20ch] text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            See the City the Way Buses Do
          </h2>
          <Link to="/dashboard" className={`mt-8 ${ctaLink} ${primaryBtn}`}>
            Open Dashboard
          </Link>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-8 text-sm text-fg-muted md:px-8">
          Smart India Hackathon 2026, problem statement SIH26124, Bharat Electronics Limited.
        </p>
      </footer>
    </>
  )
}
