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
        return 'border-rose-200 text-rose-700 bg-rose-50/50';
      case 'amber':
        return 'border-amber-200 text-amber-800 bg-amber-50/50';
      case 'emerald':
        return 'border-emerald-200 text-emerald-800 bg-emerald-50/50';
      case 'indigo':
        return 'border-indigo-200 text-indigo-800 bg-indigo-50/50';
      case 'cyan':
      default:
        return 'border-sky-200 text-sky-800 bg-sky-50/50';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 shadow-xs hover:shadow-md ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">{title}</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 font-['Outfit']">
            {value}
          </h3>
        </div>
        <div className={`p-2.5 rounded-lg border ${getVariantStyles()}`}>
          {icon}
        </div>
      </div>
      {(subtitle || trend) && (
        <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
          {subtitle && <span className="text-slate-500 font-medium">{subtitle}</span>}
          {trend && (
            <span className="font-semibold font-mono text-blue-700">
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
