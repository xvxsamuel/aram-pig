"use client"

interface Props {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: Props) {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  }

  return (
    <div 
      className={`rounded-full animate-spin border-t-transparent bg-gradient-to-r from-accent-dark to-accent-light ${sizeClasses[size]} ${className}`}
      style={{
        borderColor: 'var(--color-accent-light)',
        borderTopColor: 'transparent'
      }}
    />
  )
}
