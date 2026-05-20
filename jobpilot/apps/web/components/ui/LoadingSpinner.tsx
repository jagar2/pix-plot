'use client'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-[3px]',
  }

  return (
    <div
      className={`animate-spin rounded-full border-slate-600 border-t-blue-500 ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}
