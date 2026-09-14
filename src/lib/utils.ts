import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PriorityTier, CRMStatus, ScreeningStatus } from '../types/crm';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function getPriorityBadge(tier: PriorityTier, ageDays: number) {
  switch (tier) {
    case 1:
      return {
        label: `Critical (${ageDays}d)`,
        badgeClass: 'bg-red-500/15 text-red-400 border border-red-500/30 font-semibold',
        dotClass: 'bg-red-500',
      };
    case 2:
      return {
        label: `High (${ageDays}d)`,
        badgeClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
        dotClass: 'bg-amber-500',
      };
    case 3:
    default:
      return {
        label: `Normal (${ageDays}d)`,
        badgeClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
  }
}

export function getCrmStatusStyle(status: CRMStatus) {
  switch (status) {
    case 'AWB Pending':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    case 'In Transit':
      return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
    case 'CWH Received':
      return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
    case 'Screening In Progress':
      return 'bg-purple-500/10 text-purple-300 border-purple-500/30';
    case 'Discrepancy Tagged':
      return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    case 'Dispatched to RC':
      return 'bg-blue-500/10 text-blue-300 border-blue-500/30';
    case 'Closed':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    default:
      return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
  }
}

export function getScreeningStatusStyle(status: ScreeningStatus) {
  switch (status) {
    case 'Passed':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'Failed':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'Damaged':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'Missing':
      return 'bg-red-600/20 text-red-300 border-red-600/40';
    case 'Pending':
    default:
      return 'bg-slate-700/40 text-slate-400 border-slate-600/40';
  }
}
