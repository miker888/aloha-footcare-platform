// Stand-in palm mark until the clinic's own logo file is added.
// To use the real logo: put it in src/assets/ and render it here instead.

export function PalmMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path d="M23.5 44c1.2-7.4 1.6-15.2 2.4-22.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M26 21.5C21.4 14.6 13 12.6 5.5 16.4c7.6-1 14.2.8 20.5 5.1Z" fill="currentColor" />
      <path d="M26 21.5c1.6-8.2 8.2-13.6 16.6-12.8-7 2.4-12 6.8-16.6 12.8Z" fill="currentColor" />
      <path d="M26 21.5c6.8-3.4 14.4-1.4 18.2 4.8C38.6 23.1 32.6 22 26 21.5Z" fill="currentColor" />
      <path d="M26 21.5C24 14 18.6 8.6 11 7.6c6 3.2 10.6 8 15 13.9Z" fill="currentColor" />
      <path d="M26 21.5c-6.2.6-11.2 4.6-12.8 10.6 3.6-4.7 7.8-8 12.8-10.6Z" fill="currentColor" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-clay">
      <PalmMark className="h-10 w-10 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.65rem] text-ink">Aloha</span>
        {!compact && (
          <span className="mt-1 text-[0.8rem] font-semibold tracking-[0.04em] text-drift">Footcare Services</span>
        )}
      </span>
    </span>
  );
}
