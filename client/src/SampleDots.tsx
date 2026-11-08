export function SampleDots({
  hits,
  total,
  label,
}: {
  hits: number;
  total: number;
  label?: string;
}) {
  if (!total) {
    return <span className="dots-empty">no answers</span>;
  }
  const dots = Array.from({ length: total }, (_, index) => index < hits);
  return (
    <span
      className="dots"
      role="img"
      aria-label={`${label ?? 'Named'} in ${hits} of ${total} answers`}
    >
      {total <= 12 ? (
        dots.map((filled, index) => <i key={index} className={filled ? 'dot on' : 'dot'} />)
      ) : (
        <span className="dots-bar">
          <span style={{ width: `${(hits / total) * 100}%` }} />
        </span>
      )}
      <span className="dots-count">
        {hits}/{total}
      </span>
    </span>
  );
}
