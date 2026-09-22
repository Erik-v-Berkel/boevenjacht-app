import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const base = 'w-full rounded-xl px-4 py-3 text-lg font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100'
  const color = variant === 'primary' ? 'bg-yellow-400 text-slate-900' : 'bg-slate-800 text-slate-100 ring-1 ring-slate-700'
  return <button className={`${base} ${color} ${className}`} {...props} />
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-lg bg-red-950 px-3 py-2 text-red-200 ring-1 ring-red-800">{children}</p>
}

export const inputClass =
  'w-full rounded-xl bg-slate-800 px-4 py-3 text-lg text-slate-100 ring-1 ring-slate-700 outline-none placeholder:text-slate-500 focus:ring-yellow-400'
