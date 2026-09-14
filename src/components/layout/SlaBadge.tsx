import React from 'react';
import { PriorityTier } from '../../types/crm';
import { getPriorityBadge } from '../../lib/utils';
import { AlertTriangle, Clock, CheckCircle } from 'lucide-react';

interface SlaBadgeProps {
  tier: PriorityTier;
  ageDays: number;
}

export const SlaBadge: React.FC<SlaBadgeProps> = ({ tier, ageDays }) => {
  const badge = getPriorityBadge(tier, ageDays);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium font-mono ${badge.badgeClass}`}>
      {tier === 1 && <AlertTriangle className="w-3 h-3 text-red-400" />}
      {tier === 2 && <Clock className="w-3 h-3 text-amber-400" />}
      {tier === 3 && <CheckCircle className="w-3 h-3 text-emerald-400" />}
      <span>{badge.label}</span>
    </span>
  );
};
