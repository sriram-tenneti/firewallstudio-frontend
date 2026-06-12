import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface NotificationProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onClose?: () => void;
}

const config = {
  success: { icon: CheckCircle, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', iconColor: 'text-emerald-500' },
  error: { icon: XCircle, bg: 'bg-red-50 border-red-200', text: 'text-red-800', iconColor: 'text-red-500' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', iconColor: 'text-amber-500' },
  info: { icon: Info, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', iconColor: 'text-blue-500' },
};

export function Notification({ message, type, onClose }: NotificationProps) {
  const c = config[type];
  const Icon = c.icon;
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-sm ${c.bg}`}>
      <Icon className={`h-5 w-5 flex-shrink-0 ${c.iconColor}`} />
      <span className={`flex-1 text-sm font-medium ${c.text}`}>{message}</span>
      {onClose && (
        <button onClick={onClose} className="rounded p-1 hover:bg-black/5 transition-colors">
          <X className={`h-4 w-4 ${c.text}`} />
        </button>
      )}
    </div>
  );
}
