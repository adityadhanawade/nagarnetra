import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Page crashed:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto max-w-xl px-4 py-24">
        <h1 className="text-3xl font-semibold tracking-tight">Something Went Wrong</h1>
        <p className="mt-2 text-fg-muted">This page hit an error. Reloading usually fixes it.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 h-12 rounded-xl bg-accent px-6 font-semibold text-on-accent"
        >
          Reload Page
        </button>
      </main>
    )
  }
}
