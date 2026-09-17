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
        badgeClass: 'bg-rose-50 text-rose-700 border border-rose-300 font-semibold',
        dotClass: 'bg-rose-600',
      };
    case 2:
      return {
        label: `High (${ageDays}d)`,
        badgeClass: 'bg-amber-50 text-amber-800 border border-amber-300 font-medium',
        dotClass: 'bg-amber-600',
      };
    case 3:
    default:
      return {
        label: `Normal (${ageDays}d)`,
        badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-medium',
        dotClass: 'bg-emerald-600',
      };
  }
}

export function getCrmStatusStyle(status: CRMStatus) {
  switch (status) {
    case 'CCI to Create DC':
      return 'bg-amber-50 text-amber-900 border-amber-300 font-semibold';
    case 'Pending AWB':
      return 'bg-amber-50 text-amber-800 border-amber-300 font-medium';
    case 'Pickup Pending':
      return 'bg-amber-100 text-amber-900 border-amber-400 font-semibold shadow-xs';
    case 'Pending AWB Re-Issue':
      return 'bg-orange-100 text-orange-900 border-orange-400 font-bold shadow-xs animate-pulse';
    case 'In Transit':
      return 'bg-sky-50 text-sky-800 border-sky-300 font-medium';
    case 'Delivered at CWH':
      return 'bg-indigo-50 text-indigo-800 border-indigo-300 font-medium';
    case 'Discrepancies':
      return 'bg-rose-50 text-rose-800 border-rose-300 font-bold';
    case 'Pending Inward at CWH':
      return 'bg-purple-50 text-purple-800 border-purple-300 font-semibold';
    case 'CWH to Create DC':
      return 'bg-purple-100 text-purple-900 border-purple-400 font-semibold';
    case 'Pickup Pending for RC':
      return 'bg-blue-50 text-blue-800 border-blue-300 font-medium';
    case 'In Transit to RC':
      return 'bg-cyan-50 text-cyan-800 border-cyan-300 font-medium';
    case 'Delivered to RC':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-medium';
    case 'Delivered to RC (Discrepancies)':
      return 'bg-rose-100 text-rose-900 border-rose-400 font-bold shadow-xs';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

export function getScreeningStatusStyle(status: ScreeningStatus) {
  switch (status) {
    case 'Passed':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold';
    case 'Failed':
      return 'bg-rose-50 text-rose-800 border-rose-300 font-semibold';
    case 'Damaged':
      return 'bg-amber-50 text-amber-800 border-amber-300 font-semibold';
    case 'Missing':
      return 'bg-rose-100 text-rose-900 border-rose-400 font-bold';
    case 'Pending':
    default:
      return 'bg-slate-100 text-slate-600 border-slate-300';
  }
}
