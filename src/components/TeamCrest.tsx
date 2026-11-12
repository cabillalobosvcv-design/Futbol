import { Shield } from 'lucide-react';

interface TeamCrestProps {
  name: string;
  shortCode: string;
  primaryColor?: string;
  secondaryColor?: string;
  crestUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TeamCrest({
  name,
  shortCode,
  primaryColor = '#0A192F',
  secondaryColor = '#2563EB',
  crestUrl,
  size = 'md',
}: TeamCrestProps) {
  const dims =
    size === 'sm'
      ? 'w-7 h-7 text-[10px]'
      : size === 'lg'
        ? 'w-12 h-12 text-xs'
        : 'w-9 h-9 text-[11px]';

  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt={`Escudo de ${name}`}
        referrerPolicy="no-referrer"
        className={`${dims} rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100`}
      />
    );
  }

  return (
    <div
      title={name}
      className={`${dims} rounded-lg flex items-center justify-center font-display font-bold text-white shrink-0 border border-black/10 relative overflow-hidden`}
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
      }}
    >
      <Shield className="w-full h-full opacity-15 absolute inset-0 p-1" aria-hidden="true" />
      <span className="relative z-10 tracking-tight">{shortCode.slice(0, 3).toUpperCase()}</span>
    </div>
  );
}
