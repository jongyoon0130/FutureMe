/** Future Me — forward arrow + horizon */
export const LOGO_MARK_COLOR = '#F5C542'

interface Props {
  size?: number
  className?: string
  withBackground?: boolean
}

function LogoMark() {
  return (
    <g>
      <circle cx="32" cy="34" r="10" fill={LOGO_MARK_COLOR} opacity="0.35" />
      <path d="M 18 38 L 46 38" stroke={LOGO_MARK_COLOR} strokeWidth="4" strokeLinecap="round" />
      <path d="M 38 28 L 48 38 L 38 48" fill="none" stroke={LOGO_MARK_COLOR} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="22" r="3" fill={LOGO_MARK_COLOR} opacity="0.9" />
    </g>
  )
}

export function FutureMeLogo({ size = 48, className = '', withBackground = true }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={`shrink-0 block ${className}`}
      role="img"
      aria-label="Future Me"
    >
      {withBackground ? <rect width="64" height="64" rx="14" fill="#141414" /> : null}
      <LogoMark />
    </svg>
  )
}
