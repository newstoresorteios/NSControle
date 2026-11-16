export function Logo({
  height = 32,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  const width = Math.round(height * (194 / 29));
  return (
    <img
      src="/new-store-logo.png"
      alt="New Store"
      width={width}
      height={height}
      className={className}
      style={{ width, height }}
    />
  );
}
