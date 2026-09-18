import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PriorityTier, AgeingCriticality, CRMStatus, ScreeningStatus } from '../types/crm';

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

export function parseDateSafe(val?: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  const str = String(val).trim();
  if (!str) return null;

  // Direct parse
  const direct = new Date(str);
  if (!isNaN(direct.getTime())) return direct;

  // DD-MM-YYYY or DD/MM/YYYY with optional time
  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmy) {
    const [, d, m, y, h = '0', min = '0', s = '0'] = dmy;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function getAgeingBucket(ageDays: number): AgeingCriticality {
  if (ageDays > 25) return 'super_critical';
  if (ageDays >= 16) return 'critical';
  if (ageDays >= 8) return 'high';
  return 'low';
}

export function getPriorityBadge(tier: PriorityTier | number, ageDays: number) {
  const bucket = getAgeingBucket(ageDays);
  switch (bucket) {
    case 'super_critical':
      return {
        key: 'super_critical' as AgeingCriticality,
        tier: 1,
        label: `Super Critical (${ageDays}d)`,
        shortLabel: 'Super Critical',
        rangeLabel: '>25 Days',
        badgeClass: 'bg-rose-100 text-rose-900 border border-rose-300 font-bold shadow-xs',
        dotClass: 'bg-rose-600',
        textColor: 'text-rose-700',
      };
    case 'critical':
      return {
        key: 'critical' as AgeingCriticality,
        tier: 2,
        label: `Critical (${ageDays}d)`,
        shortLabel: 'Critical',
        rangeLabel: '16-25 Days',
        badgeClass: 'bg-rose-50 text-rose-700 border border-rose-300 font-semibold',
        dotClass: 'bg-rose-500',
        textColor: 'text-rose-600',
      };
    case 'high':
      return {
        key: 'high' as AgeingCriticality,
        tier: 3,
        label: `High (${ageDays}d)`,
        shortLabel: 'High',
        rangeLabel: '8-15 Days',
        badgeClass: 'bg-amber-50 text-amber-800 border border-amber-300 font-medium',
        dotClass: 'bg-amber-500',
        textColor: 'text-amber-600',
      };
    case 'low':
    default:
      return {
        key: 'low' as AgeingCriticality,
        tier: 4,
        label: `Low (${ageDays}d)`,
        shortLabel: 'Low',
        rangeLabel: '0-7 Days',
        badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-medium',
        dotClass: 'bg-emerald-600',
        textColor: 'text-emerald-600',
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
