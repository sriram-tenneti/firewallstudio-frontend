import { Badge } from './badge';
import { CheckCircle, Clock, AlertTriangle, XCircle, Shield, FileText, Search } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline'; icon: React.ReactNode }> = {
  'Deployed': { variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
  'Draft': { variant: 'outline', icon: <FileText className="h-3 w-3" /> },
  'Pending Review': { variant: 'info', icon: <Clock className="h-3 w-3" /> },
  'Certified': { variant: 'success', icon: <Shield className="h-3 w-3" /> },
  'Expired': { variant: 'warning', icon: <AlertTriangle className="h-3 w-3" /> },
  'Deleted': { variant: 'danger', icon: <XCircle className="h-3 w-3" /> },
  'Permitted': { variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
  'Blocked': { variant: 'danger', icon: <XCircle className="h-3 w-3" /> },
  'Exception Required': { variant: 'warning', icon: <AlertTriangle className="h-3 w-3" /> },
  'Needs Review': { variant: 'warning', icon: <AlertTriangle className="h-3 w-3" /> },
  'Auto-Mapped': { variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
  'Automapped': { variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
  'New Group': { variant: 'info', icon: <FileText className="h-3 w-3" /> },
  'Conflict': { variant: 'danger', icon: <AlertTriangle className="h-3 w-3" /> },
  'Policy Review': { variant: 'info', icon: <Search className="h-3 w-3" /> },
  'In Progress': { variant: 'info', icon: <Clock className="h-3 w-3" /> },
  'Submitted': { variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
  'Open': { variant: 'info', icon: <Clock className="h-3 w-3" /> },
  'Closed': { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
  'Mapped': { variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
  'Review Required': { variant: 'warning', icon: <AlertTriangle className="h-3 w-3" /> },
  'Compliant': { variant: 'success', icon: <Shield className="h-3 w-3" /> },
  'Non-Compliant': { variant: 'danger', icon: <XCircle className="h-3 w-3" /> },
  'Unknown': { variant: 'default', icon: null },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { variant: 'default' as const, icon: null };
  return (
    <Badge variant={config.variant} className={className}>
      {config.icon}
      {status}
    </Badge>
  );
}
