import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ReactNode } from 'react';

interface ModuleLayoutProps {
  module: string;
  title?: string;
  children: ReactNode;
}

const moduleDefaultTitles: Record<string, string> = {
  'firewall-studio': 'Firewall Studio',
  'ngdc-standardization': 'NGDC Standardization',
  'firewall-management': 'Network Firewall Request',
  'settings': 'Settings',
  'lifecycle': 'Lifecycle Management',
};

const moduleNav: Record<string, { path: string; label: string }[]> = {
  'firewall-studio': [
    { path: '/firewall-studio', label: 'Rule Designer' },
    { path: '/firewall-studio/compile', label: 'Compile per DC' },
    { path: '/firewall-studio/review', label: 'Review & Approval' },
    { path: '/request-tracking', label: 'Request Tracking' },
  ],
  'ngdc-standardization': [
    { path: '/ngdc-standardization', label: 'Migration Studio' },
    { path: '/ngdc-standardization/import', label: 'Import Rules' },
    { path: '/ngdc-standardization/review', label: 'Review & Approval' },
  ],
  'firewall-management': [
    { path: '/firewall-management', label: 'Rule Management' },
    { path: '/firewall-management/import', label: 'Import' },
    { path: '/firewall-management/review', label: 'Review & Approval' },
  ],
  'settings': [
    { path: '/settings', label: 'Org Admin & Settings' },
    { path: '/audit-trail', label: 'Audit Trail' },
  ],
  'lifecycle': [
    { path: '/lifecycle', label: 'Dashboard' },
  ],
};

const moduleColors: Record<string, string> = {
  'firewall-studio': 'from-blue-600 to-indigo-700',
  'ngdc-standardization': 'from-emerald-600 to-teal-700',
  'firewall-management': 'from-amber-600 to-orange-700',
  'settings': 'from-slate-600 to-slate-700',
  'lifecycle': 'from-violet-600 to-purple-700',
};

const moduleActiveColors: Record<string, string> = {
  'firewall-studio': 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  'ngdc-standardization': 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  'firewall-management': 'bg-amber-500/20 text-amber-200 border-amber-400/30',
  'settings': 'bg-slate-500/20 text-slate-200 border-slate-400/30',
  'lifecycle': 'bg-violet-500/20 text-violet-200 border-violet-400/30',
};

export function ModuleLayout({ module, title, children }: ModuleLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = moduleNav[module] || [];
  const colorGradient = moduleColors[module] || 'from-slate-600 to-slate-700';
  const activeColor = moduleActiveColors[module] || 'bg-slate-500/20 text-slate-200 border-slate-400/30';
  const effectiveTitle = title || moduleDefaultTitles[module] || module;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Module Header */}
      <header className={`bg-gradient-to-r ${colorGradient} shadow-lg`}>
        <div className="max-w-[1800px] mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-5">
              {/* Home button */}
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                title="Back to Home"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </button>
              <div className="h-6 w-px bg-white/20" />
              <span className="text-lg font-bold text-white">{effectiveTitle}</span>

              {/* Module Nav */}
              <nav className="flex items-center gap-1 ml-4">
                {navItems.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 border ${
                        isActive
                          ? activeColor
                          : 'text-white/60 hover:text-white hover:bg-white/10 border-transparent'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50">Enterprise Firewall Management</span>
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                <span className="text-white text-xs font-medium">U</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Module Content */}
      <main>{children}</main>
    </div>
  );
}
