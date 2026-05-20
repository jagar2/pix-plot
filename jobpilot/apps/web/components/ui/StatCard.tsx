'use client'

interface StatCardProps {
  label: string
  value: number | string
  trend?: {
    value: number
    positive?: boolean
  }
  icon?: string
  suffix?: string
  colorClass?: string
}

export default function StatCard({
  label,
  value,
  trend,
  icon,
  suffix = '',
  colorClass = 'text-white',
}: StatCardProps) {
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5 flex flex-col gap-3 hover:border-slate-600 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{label}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className="flex items-end gap-2">
        <span className={`text-3xl font-bold ${colorClass}`}>
          {value}
          {suffix}
        </span>
        {trend !== undefined && (
          <span
            className={`text-xs font-medium mb-0.5 ${
              trend.positive !== false ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {trend.value > 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>
    </div>
  )
}
