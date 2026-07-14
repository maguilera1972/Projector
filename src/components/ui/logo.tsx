import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 40, showText = true, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="projector-gradient" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        {/* Anneau extérieur — style labyrinthe/circuit du logo */}
        <circle cx="50" cy="50" r="46" stroke="url(#projector-gradient)" strokeWidth="3" fill="none" strokeDasharray="60 20 40 15 50 25" strokeLinecap="round" />
        <circle cx="50" cy="50" r="36" stroke="url(#projector-gradient)" strokeWidth="2.5" fill="none" strokeDasharray="45 18 35 12 40 20" strokeLinecap="round" opacity="0.85" />
        <circle cx="50" cy="50" r="26" stroke="url(#projector-gradient)" strokeWidth="2" fill="none" strokeDasharray="30 15 25 10 30 15" strokeLinecap="round" opacity="0.7" />
        {/* Connexions type circuit */}
        <path d="M 50 4 L 50 20" stroke="url(#projector-gradient)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 96 50 L 80 50" stroke="url(#projector-gradient)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 50 96 L 50 80" stroke="url(#projector-gradient)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 4 50 L 20 50" stroke="url(#projector-gradient)" strokeWidth="2.5" strokeLinecap="round" />
        {/* Centre */}
        <circle cx="50" cy="50" r="10" fill="url(#projector-gradient)" />
      </svg>
      {showText && (
        <span className="text-xl font-bold tracking-wider text-white">
          PROJECTOR
        </span>
      )}
    </div>
  );
}
