/**
 * SnapSplit mark: a receipt with a diagonal cut running through it — the bill,
 * split. Drawn in `currentColor` so the header can tint it with the accent and
 * it inverts correctly in dark mode. The diagonal is stroked in `--bg` to read
 * as a gap punched through the receipt against whatever sits behind the logo.
 */
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 3.5h14v15.2c0 .7-.8 1.1-1.4.7l-1.5-1a1 1 0 0 0-1.1 0l-1.5 1a1 1 0 0 1-1.1 0l-1.5-1a1 1 0 0 0-1.1 0l-1.5 1c-.6.4-1.4 0-1.4-.7V3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 8.5h7M8.5 12h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 2.5 8 21"
        stroke="var(--bg, #fff)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
