export function PhotoGrid({ photos }) {
  if (!photos || photos.length === 0) {
    return null;
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 10
    }}>
      {photos.map((p, i) => (
        <img
          key={i}
          src={p.url}
          style={{
            width: "100%",
            height: 90,
            objectFit: "cover",
            borderRadius: 8
          }}
        />
      ))}
    </div>
  );
}
