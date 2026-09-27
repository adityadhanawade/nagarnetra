import { CheckCircle, Minus, Warning, XCircle } from '@phosphor-icons/react'
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const STATUS = {
  'On time': { Icon: CheckCircle, text: 'text-ok' },
  Slower: { Icon: Warning, text: 'text-warn' },
  Delayed: { Icon: XCircle, text: 'text-err' },
  'No data': { Icon: Minus, text: 'text-fg-muted' },
}

const INK = '#15173D'
const MUTED = '#444A75'

function DelayTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm shadow-none">
      <p className="font-semibold">{row.name}</p>
      <p className="text-fg-muted">
        {row.now} km/h now, {row.usual} km/h usual ({row.pct}%)
      </p>
    </div>
  )
}

export default function RouteDelays({ rows, loading }) {
  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl bg-line motion-reduce:animate-none" role="status" aria-label="Loading route speeds…" />
  }
  if (rows.length === 0) {
    return <p className="text-fg-muted">No route speeds yet. They appear once buses start reporting their position.</p>
  }

  const charted = rows.filter((r) => r.pct != null)
  const top = Math.max(125, Math.ceil(Math.max(0, ...charted.map((r) => r.pct)) / 25) * 25)
  const ticks = Array.from({ length: top / 25 + 1 }, (_, i) => i * 25)

  return (
    <div>
      {charted.length > 0 && (
        <div role="img" aria-label={`Bar chart of current speed as a percentage of usual speed for ${charted.length} routes. Details are in the table below.`}>
          <ResponsiveContainer width="100%" height={charted.length * 56 + 48}>
            <BarChart data={charted} layout="vertical" margin={{ top: 22, right: 48, bottom: 4, left: 4 }}>
              <CartesianGrid horizontal={false} stroke="#B9B7E6" strokeDasharray="3 3" />
              <XAxis
                type="number"
                domain={[0, top]}
                ticks={ticks}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: MUTED, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis type="category" dataKey="name" width={84} tick={{ fill: INK, fontSize: 13 }} axisLine={false} tickLine={false} />
              <ReferenceLine x={100} stroke="#6A6EA8" strokeDasharray="4 4" label={{ value: 'Usual pace', position: 'top', fill: MUTED, fontSize: 12 }} />
              <Tooltip content={<DelayTooltip />} cursor={{ fill: 'rgba(63,60,187,0.08)' }} />
              <Bar dataKey="pct" fill="#3F3CBB" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} fill={INK} fontSize={13} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">Current and usual speed for each route</caption>
          <thead className="text-fg-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">Route</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Usual</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Now</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Vs Usual</th>
              <th scope="col" className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const { Icon, text } = STATUS[r.status]
              return (
                <tr key={r.code} className="border-t border-line">
                  <th scope="row" className="py-3 pr-4 font-semibold">
                    {r.name}
                    <span className="block text-sm font-normal text-fg-muted">{r.detail}</span>
                  </th>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">{r.usual ?? '-'} km/h</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">{r.now ?? '-'} km/h</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">{r.pct == null ? '-' : `${r.pct}%`}</td>
                  <td className={`py-3 font-semibold ${text}`}>
                    <span className="inline-flex items-center gap-2">
                      <Icon size={20} weight="bold" aria-hidden="true" />
                      {r.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
