interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusStyles: Record<string, string> = {
  'Draft': 'bg-slate-100 text-slate-700 border-slate-300',
  'Pending Review': 'bg-amber-50 text-amber-700 border-amber-300',
  'Approved': 'bg-blue-50 text-blue-700 border-blue-300',
  'Deployed': 'bg-emerald-50 text-emerald-700 border-emerald-300',
  'Certified': 'bg-green-50 text-green-700 border-green-300',
  'Expired': 'bg-red-50 text-red-700 border-red-300',
  'Deleted': 'bg-red-100 text-red-800 border-red-400',
  'Rejected': 'bg-red-50 text-red-700 border-red-300',
  'Submitted': 'bg-violet-50 text-violet-700 border-violet-300',
  'Not Migrated': 'bg-orange-50 text-orange-700 border-orange-300',
  'Yet to Migrate': 'bg-orange-50 text-orange-700 border-orange-300',
  'Migrated': 'bg-teal-50 text-teal-700 border-teal-300',
  'Migration Deployed': 'bg-teal-50 text-teal-700 border-teal-300',
  'Not Started': 'bg-slate-100 text-slate-600 border-slate-300',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-300',
  'Mapped': 'bg-indigo-50 text-indigo-700 border-indigo-300',
  'Needs Review': 'bg-amber-50 text-amber-700 border-amber-300',
  'Completed': 'bg-green-50 text-green-700 border-green-300',
  'Permitted': 'bg-green-50 text-green-700 border-green-300',
  'Blocked': 'bg-red-50 text-red-700 border-red-300',
  'Exception Required': 'bg-amber-50 text-amber-700 border-amber-300',
  'Yes': 'bg-green-50 text-green-700 border-green-300',
  'No': 'bg-red-50 text-red-700 border-red-300',
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const style = statusStyles[status] || 'bg-slate-100 text-slate-600 border-slate-300';
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${style} ${sizeClass}`}>
      {status}
    </span>
  );
}
