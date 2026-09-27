import { CheckCircle, Warning, XCircle } from '@phosphor-icons/react'

const LEVELS = {
  ok: { Icon: CheckCircle, text: 'text-ok' },
  warn: { Icon: Warning, text: 'text-warn' },
  err: { Icon: XCircle, text: 'text-err' },
}

export default function StatTile({ icon: LabelIcon, label, value, detail, level }) {
  const status = level ? LEVELS[level] : null
  return (
    <section aria-label={label} className="rounded-xl border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
        <LabelIcon size={20} weight="bold" aria-hidden="true" />
        {label}
      </p>
      <p className={`mt-3 flex items-center gap-2 font-mono text-3xl font-medium tabular-nums ${status?.text ?? ''}`}>
        {status && <status.Icon size={26} weight="bold" aria-hidden="true" className="shrink-0" />}
        {value}
      </p>
      <p className="mt-1 text-sm text-fg-muted">{detail}</p>
    </section>
  )
}
