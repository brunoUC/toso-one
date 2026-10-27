import { useId } from "react";

// O anel aberto com um ponto na abertura: um centro, apps em órbita.
export function LogoMark({ size = 30 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d3157" />
          <stop offset="1" stopColor="#0b1426" />
        </linearGradient>
      </defs>
      <rect x=".5" y=".5" width="31" height="31" rx="9" fill={`url(#${id})`} stroke="rgba(160,185,230,.22)" />
      <path d="M23.52 13.26 A8 8 0 1 1 18.74 8.48" fill="none" stroke="#e8edf5" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="21.66" cy="10.34" r="2.3" fill="#8fb4ff" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      toso <span>one</span>
    </span>
  );
}
