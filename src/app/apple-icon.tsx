import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Ícone da tela de início do iPhone: o mesmo anel do logo, sem cantos
// arredondados (o iOS aplica a máscara).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #1d3157, #0b1426)",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path d="M23.52 13.26 A8 8 0 1 1 18.74 8.48" fill="none" stroke="#e8edf5" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="21.66" cy="10.34" r="2.3" fill="#8fb4ff" />
        </svg>
      </div>
    ),
    size,
  );
}
