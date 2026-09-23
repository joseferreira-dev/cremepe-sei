interface SpinnerProps {
  size?: string;
  color?: string;
  className?: string;
}

export default function Spinner({ size = 'w-6 h-6', color = '#009C60', className = '' }: SpinnerProps) {
  return (
    <svg className={`animate-spin ${size} ${className}`} style={{ color }} viewBox="0 0 24 24" fill="none" role="status" aria-label="Carregando">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}