// app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        gap: "20px",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#050505",
        color: "white",
      }}
    >
      <h1>🍕 Call2Eat - Interface DEV</h1>
      <p>Tu es connecté sur app.call2eat.online.</p>
      <p>Depuis ici tu peux ouvrir le dashboard des commandes vocales.</p>

      <Link
        href="/dashboard"
        style={{
          background: "#22c55e",
          color: "black",
          padding: "12px 20px",
          borderRadius: "999px",
          textDecoration: "none",
          fontSize: "16px",
          fontWeight: 600,
        }}
      >
        📊 Ouvrir le dashboard Call2Eat
      </Link>
    </main>
  );
}
