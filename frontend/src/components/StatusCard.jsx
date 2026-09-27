import { CheckCircle, Warning, XCircle } from '@phosphor-icons/react'

const LEVELS = {
  ok: { Icon: CheckCircle, box: 'border-ok/40 bg-ok-bg', text: 'text-ok' },
  warn: { Icon: Warning, box: 'border-warn/40 bg-warn-bg', text: 'text-warn' },
  err: { Icon: XCircle, box: 'border-err/40 bg-err-bg', text: 'text-err' },
}

export default function StatusCard({ icon: LabelIcon, label, level, value, detail }) {
  const { Icon, box, text } = LEVELS[level]

  return (
    <section aria-label={label} className={`rounded-xl border p-4 ${box}`}>
      <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
        <LabelIcon size={20} weight="bold" aria-hidden="true" />
        {label}
      </p>
      <p aria-live="polite" className={`mt-3 flex items-center gap-2 font-mono text-lg font-medium ${text}`}>
        <Icon size={22} weight="bold" aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 break-words">{value}</span>
      </p>
      <p className="mt-1 text-sm tabular-nums text-fg-muted">{detail}</p>
    </section>
  )
}
