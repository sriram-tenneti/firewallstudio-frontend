import { X, Clock } from 'lucide-react';
import type { RuleHistoryEntry } from '@/types';

interface HistoryModalProps {
  ruleId: string;
  history: RuleHistoryEntry[];
  onClose: () => void;
}

export function HistoryModal({ ruleId, history, onClose }: HistoryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-800">Rule History: {ruleId}</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-5">
          {history.length === 0 ? (
            <p className="text-center text-sm text-slate-500">No history available</p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50 transition-colors">
                  <Clock className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">{entry.action}</span>
                      <span className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">by {entry.user}</div>
                    {entry.details && (
                      <div className="text-xs text-slate-600 mt-1">{entry.details}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 text-right">
          <button onClick={onClose} className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
