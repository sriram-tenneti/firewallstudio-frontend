import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Firewall Studio' },
  { path: '/migration', label: 'Migration to NGDC' },
  { path: '/review', label: 'Review & Approval' },
  { path: '/management', label: 'Firewall Management' },
  { path: '/import', label: 'Data Import' },
  { path: '/settings', label: 'Settings' },
];

export function Header() {
  const location = useLocation();

  return (
    <header className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 shadow-lg">
      <div className="max-w-[1800px] mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">NF</span>
              </div>
              <span className="text-lg font-bold text-white">Network Firewall Studio</span>
            </Link>
            <nav className="flex items-center gap-0.5">
              {navItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ' + (
                      isActive
                        ? 'bg-blue-500/30 text-white border border-blue-400/30'
                        : 'text-blue-100/70 hover:text-white hover:bg-white/10'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-blue-200/60">Enterprise Firewall Management</span>
            <div className="w-7 h-7 rounded-full bg-blue-500/30 flex items-center justify-center border border-blue-400/20">
              <span className="text-white text-xs font-medium">U</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
