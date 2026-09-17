import React, { useState, useMemo } from 'react';
import { 
  History, 
  Search, 
  User, 
  FileSpreadsheet, 
  CheckCircle2, 
  Barcode, 
  AlertTriangle, 
  Clock,
  Video
} from 'lucide-react';
import { AuditLog } from '../../types/crm';
import { formatDateTime } from '../../lib/utils';

interface AuditLogsViewerProps {
  logs: AuditLog[];
}

export const AuditLogsViewer: React.FC<AuditLogsViewerProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedAction !== 'ALL' && log.action !== selectedAction) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchSo = (log.so_code || '').toLowerCase().includes(q);
        const matchUser = log.user_name.toLowerCase().includes(q);
        const matchRemarks = (log.remarks || '').toLowerCase().includes(q);
        const matchAwb = (log.awb || '').toLowerCase().includes(q);
        if (!matchSo && !matchUser && !matchRemarks && !matchAwb) return false;
      }
      return true;
    });
  }, [logs, selectedAction, searchTerm]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'DEFECTIVE_REPORT_UPLOAD':
      case 'INITIAL_INGESTION':
        return <FileSpreadsheet className="w-4 h-4 text-cyan-400" />;
      case 'REGION_MAPPING_UPLOAD':
        return <User className="w-4 h-4 text-teal-400" />;
      case 'CWH_INWARD_VERIFICATION':
        return <Video className="w-4 h-4 text-indigo-400" />;
      case 'AWB_ASSIGNED':
      case 'AWB_RETOKENED':
        return <Barcode className="w-4 h-4 text-blue-400" />;
      case 'EWAY_BILL_ATTACHED':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search SO Code, User, AWB, or Remarks..."
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
          >
            <option value="ALL">All Actions</option>
            <option value="DEFECTIVE_REPORT_UPLOAD">Defective Report Ingestion</option>
            <option value="REGION_MAPPING_UPLOAD">Region Mapping Upload</option>
            <option value="CWH_INWARD_VERIFICATION">CWH Inward Unboxing</option>
            <option value="AWB_ASSIGNED">AWB Assigned</option>
            <option value="AWB_RETOKENED">AWB Retokened</option>
            <option value="EWAY_BILL_ATTACHED">E-Way Bill Attached</option>
          </select>

          <span className="text-xs text-slate-500 font-mono">
            {filteredLogs.length} audit entries
          </span>
        </div>
      </div>

      {/* Timeline List */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {filteredLogs.map((log) => (
            <div key={log.id} className="relative group">
              {/* Dot Icon */}
              <div className="absolute -left-6 top-1 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-slate-300 group-hover:border-[#001489] transition-colors shadow-xs">
                {getActionIcon(log.action)}
              </div>

              {/* Log Card */}
              <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 hover:border-slate-300 transition-all text-xs shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sky-800 px-2 py-0.5 rounded bg-sky-50 border border-sky-200">
                      {log.action}
                    </span>
                    {log.so_code && (
                      <span className="font-mono font-semibold text-slate-900">
                        SO: {log.so_code}
                      </span>
                    )}
                    {log.awb && (
                      <span className="font-mono text-[11px] text-amber-800 px-1.5 py-0.2 rounded bg-amber-50 border border-amber-300 font-semibold">
                        AWB: {log.awb}
                      </span>
                    )}
                  </div>

                  <span className="text-slate-500 font-mono text-[11px]">
                    {formatDateTime(log.created_at)}
                  </span>
                </div>

                {/* Operator Info */}
                <div className="mt-2 text-slate-500 flex items-center gap-2">
                  <span>Operator:</span>
                  <strong className="text-slate-900 font-semibold">{log.user_name}</strong>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-200 text-slate-700 border border-slate-300">
                    {log.user_role}
                  </span>
                </div>

                {/* Status transition */}
                {(log.old_status || log.new_status) && (
                  <div className="mt-2 flex items-center gap-2 text-slate-700">
                    <span className="text-slate-500">Status transition:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-200 font-mono text-slate-700 border border-slate-300">
                      {log.old_status || 'INITIAL'}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 font-mono border border-purple-200 font-semibold">
                      {log.new_status}
                    </span>
                  </div>
                )}

                {/* Remarks */}
                {log.remarks && (
                  <p className="mt-2 text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">
                    {log.remarks}
                  </p>
                )}
              </div>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              No audit logs match your search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
