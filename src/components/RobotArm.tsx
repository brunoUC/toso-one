// Braço robótico em traço de planta técnica: três juntas, garra e o ponto
// de coleta. Decorativo — fica atrás do texto da faixa de boas-vindas.
export function RobotArm({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 240" aria-hidden="true">
      {/* chão e cotas */}
      <path className="ln thin dash" d="M8 232H292" />
      <path className="ln thin dash" d="M175 104V232" />
      <path className="ln thin" d="M170 232h10M170 104h10" />
      <path className="ln thin dash" d="M69.3 169A38 38 0 0 1 98.4 144.6" />

      {/* base */}
      <rect className="ln" x="40" y="222" width="130" height="10" rx="3" />
      <path className="ln" d="M70 222 80 192h50l10 30" />

      {/* braço e antebraço como cápsulas */}
      <rect className="ln" x="-10" y="-10" width="134" height="20" rx="10" transform="translate(105 182) rotate(-52.1)" />
      <rect className="ln" x="-7" y="-7" width="91.6" height="14" rx="7" transform="translate(175 92) rotate(14.9)" />

      {/* juntas */}
      <circle className="ln" cx="105" cy="182" r="15" />
      <circle className="ln thin" cx="105" cy="182" r="5" />
      <circle className="ln" cx="175" cy="92" r="12" />
      <circle className="acc" cx="175" cy="92" r="3.2" />
      <circle className="ln" cx="250" cy="112" r="8" />

      {/* punho e garra */}
      <rect className="ln" x="244" y="120" width="12" height="15" rx="2" />
      <path className="ln" d="M238 136h24M241 136v13l3 3M259 136v13l-3 3" />

      {/* alvo */}
      <circle className="acc-ln" cx="250" cy="182" r="7" />
      <path className="acc-ln" d="M236 182h8M256 182h8M250 168v8M250 188v8" />

      <text className="lbl" x="124" y="210">J1</text>
      <text className="lbl" x="188" y="76">J2</text>
      <text className="lbl" x="262" y="104">J3</text>
      <text className="lbl" x="214" y="212">PICK·01</text>
    </svg>
  );
}

// Trilhas de circuito ao fundo da faixa.
export function Circuit({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 300" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <g fill="none" stroke="#fff" strokeWidth="1">
        <path d="M600 40H470l-30 30H330" />
        <path d="M600 120H520l-40 40H380l-20-20H290" />
        <path d="M600 210H500l-26-26H410" />
        <path d="M600 260H430l-30 30H300" />
        <path d="M380 0v30l20 20h40" />
      </g>
      <g fill="#fff">
        <circle cx="330" cy="70" r="3" />
        <circle cx="290" cy="140" r="3" />
        <circle cx="410" cy="184" r="3" />
        <circle cx="300" cy="290" r="3" />
        <circle cx="440" cy="50" r="3" />
      </g>
    </svg>
  );
}
