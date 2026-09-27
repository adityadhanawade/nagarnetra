import { ISSUE_LABEL, ISSUE_SHAPE, nearestRoute } from '../../lib/dashboard.js'
import { formatAgoLong } from '../../lib/format.js'

const MAX_ROWS = 15

export default function PriorityList({ issues, selectedId, onSelect, now, loading }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-4 pb-4" role="status" aria-label="Loading issues…">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-line motion-reduce:animate-none" />
        ))}
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <p className="px-4 pb-4 text-fg-muted">
        No open road issues yet. They appear here as soon as a bus camera spots damage.
      </p>
    )
  }

  return (
    <ol className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
      {issues.slice(0, MAX_ROWS).map((issue, index) => {
        const selected = issue.id === selectedId
        const shape = ISSUE_SHAPE[issue.type]
        return (
          <li key={issue.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(issue.id)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-[border-color] hover:border-fg motion-reduce:transition-none ${
                selected ? 'border-accent bg-bg' : 'border-line bg-surface'
              }`}
            >
              <span className="w-6 shrink-0 pt-0.5 font-mono text-sm text-fg-muted">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  <span className={`issue-dot issue-dot--${shape} inline-block h-3.5 w-3.5 shrink-0`} aria-hidden="true" />
                  {ISSUE_LABEL[issue.type]}
                </span>
                <span className="mt-0.5 block text-sm text-fg-muted">Near {nearestRoute(issue.lat, issue.lng)}</span>
                <span className="mt-0.5 block text-xs text-fg-muted">
                  Last seen {formatAgoLong(now - new Date(issue.last_seen).getTime())}, {Math.round(issue.confidence * 100)}% sure
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-2xl font-medium tabular-nums">{issue.detection_count}</span>
                <span className="block text-xs text-fg-muted">{issue.detection_count === 1 ? 'pass' : 'passes'}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
