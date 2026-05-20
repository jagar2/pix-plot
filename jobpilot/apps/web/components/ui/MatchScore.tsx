'use client'

interface MatchScoreProps {
  score: number
  showBar?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function MatchScore({ score, showBar = false, size = 'md' }: MatchScoreProps) {
  const colorClass =
    score >= 80
      ? 'text-green-400'
      : score >= 65
      ? 'text-yellow-400'
      : 'text-red-400'

  const barColor =
    score >= 80
      ? 'bg-green-500'
      : score >= 65
      ? 'bg-yellow-500'
      : 'bg-red-500'

  const textSizes = {
    sm: 'text-xs font-semibold',
    md: 'text-sm font-semibold',
    lg: 'text-base font-bold',
  }

  if (showBar) {
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(100, score)}%` }}
          />
        </div>
        <span className={`${textSizes[size]} ${colorClass} tabular-nums w-10 text-right`}>
          {score}%
        </span>
      </div>
    )
  }

  return (
    <span className={`${textSizes[size]} ${colorClass} tabular-nums`}>
      {score}%
    </span>
  )
}
