import React from 'react';
import { PriorityTier } from '../../types/crm';
import { getPriorityBadge } from '../../lib/utils';
import { AlertOctagon, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

interface SlaBadgeProps {
  tier?: PriorityTier | number;
  ageDays: number;
}

export const SlaBadge: React.FC<SlaBadgeProps> = ({ tier = 4, ageDays }) => {
  const badge = getPriorityBadge(tier, ageDays);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium font-mono ${badge.badgeClass}`}>
      {badge.key === 'super_critical' && <AlertOctagon className="w-3.5 h-3.5 text-rose-700 animate-pulse" />}
      {badge.key === 'critical' && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
      {badge.key === 'high' && <Clock className="w-3.5 h-3.5 text-amber-600" />}
      {badge.key === 'low' && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
      <span>{badge.label}</span>
    </span>
  );
};
