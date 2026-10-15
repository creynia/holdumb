export function ProgressRing(props: { done: number; total: number; size?: number }) {
  const size = props.size ?? 88;
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const frac = props.total ? props.done / props.total : 0;
  return (
    <svg
      class="ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${props.done} of ${props.total} lessons complete`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} class="ring-bg" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        class="ring-fg"
        stroke-dasharray={`${c * frac} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-text">
        {props.done}/{props.total}
      </text>
    </svg>
  );
}
