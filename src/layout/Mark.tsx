/** Znak aplikacji: cztery pola postoju, dwa zajęte. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-green-deep-2" />
      <rect x="8" y="8" width="7" height="7" rx="1.5" className="fill-on-deep" />
      <rect x="17" y="17" width="7" height="7" rx="1.5" className="fill-on-deep" />
      <rect x="17" y="8" width="7" height="7" rx="1.5" fill="oklch(0.7 0.11 156)" />
      <rect x="8" y="17" width="7" height="7" rx="1.5" fill="oklch(0.7 0.11 156)" />
    </svg>
  );
}
