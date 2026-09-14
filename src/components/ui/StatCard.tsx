import React, { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: string;
  variant?: 'cyan' | 'red' | 'amber' | 'emerald' | 'indigo';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'cyan',
  onClick,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'red':
        return 'border-red-500/30 hover:border-red-500/60 text-red-400 from-red-500/10 to-transparent';
      case 'amber':
        return 'border-amber-500/30 hover:border-amber-500/60 text-amber-400 from-amber-500/10 to-transparent';
      case 'emerald':
        return 'border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 from-emerald-500/10 to-transparent';
      case 'indigo':
        return 'border-indigo-500/30 hover:border-indigo-500/60 text-indigo-400 from-indigo-500/10 to-transparent';
      case 'cyan':
      default:
        return 'border-cyan-500/30 hover:border-cyan-500/60 text-cyan-400 from-cyan-500/10 to-transparent';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border bg-[#101a35] p-4 transition-all duration-200 bg-gradient-to-b ${getVariantStyles()} ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 shadow-lg' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 tracking-wider uppercase">{title}</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-white font-['Outfit']">
            {value}
          </h3>
        </div>
        <div className="p-2.5 rounded-lg bg-[#0b1329]/80 border border-[#1f2e5a]">
          {icon}
        </div>
      </div>
      {(subtitle || trend) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          {subtitle && <span className="text-slate-400">{subtitle}</span>}
          {trend && (
            <span className="font-medium font-mono text-cyan-300">
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
