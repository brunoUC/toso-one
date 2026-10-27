// Arco Brasil → Europa da faixa de destaque de Voos (decorativo).
export function FlightArt() {
  return (
    <svg className="fl-art" viewBox="0 0 340 200" aria-hidden="true">
      <path d="M20 170 C 90 20, 250 20, 320 120" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" strokeDasharray="2 6" strokeLinecap="round" />
      <path d="M20 170 C 110 70, 230 70, 320 170" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="1.2" strokeDasharray="2 6" strokeLinecap="round" />
      <path d="M0 184H340" stroke="#fff" strokeOpacity=".18" />
      <circle cx="20" cy="170" r="5" fill="#fff" fillOpacity=".8" />
      <circle cx="320" cy="120" r="6" fill="none" stroke="#d9b77e" strokeWidth="2" />
      <circle cx="320" cy="170" r="4" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" />
      <text x="20" y="200" fill="#fff" fillOpacity=".55" fontFamily="var(--mono)" fontSize="9" letterSpacing="1.2">BRASIL</text>
      <text x="320" y="100" textAnchor="middle" fill="#fff" fillOpacity=".55" fontFamily="var(--mono)" fontSize="9" letterSpacing="1.2">EUROPA</text>
    </svg>
  );
}
