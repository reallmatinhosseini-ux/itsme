/** Shared app icon artwork for the favicon, home-screen and install icons. */
export function AppIcon({ size, rounded = false }: { size: number; rounded?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #1b1f2a 0%, #0b0d12 100%)",
        borderRadius: rounded ? size * 0.22 : 0,
        color: "#fff",
        fontSize: size * 0.3,
        fontWeight: 700,
        letterSpacing: -size * 0.012,
      }}
    >
      50K
    </div>
  );
}
