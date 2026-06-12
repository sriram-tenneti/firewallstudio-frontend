import { useNavigate } from 'react-router-dom';

const modules = [
  {
    id: 'firewall-studio',
    title: 'Firewall Studio',
    subtitle: 'Design & Manage NGDC Rules',
    description: 'Create, modify, and manage firewall rules following NGDC standards. Import migrated rules, build group-to-group policies, compile and deploy.',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    color: 'from-blue-600 to-indigo-700',
    hoverColor: 'hover:from-blue-500 hover:to-indigo-600',
    bgAccent: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    features: ['Rule Design & Builder', 'Group-to-Group Policies', 'NGDC Standards Enforcement', 'Compile & Deploy', 'Review & Approval'],
    path: '/firewall-studio',
    stats: { label: 'Active Rules', icon: 'shield' },
  },
  {
    id: 'ngdc-standardization',
    title: 'NGDC Standardization',
    subtitle: 'Migrate Legacy to NGDC',
    description: 'Import legacy firewall rules, map to NGDC neighbourhoods and security zones, validate against birthright policies, and migrate.',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    color: 'from-emerald-600 to-teal-700',
    hoverColor: 'hover:from-emerald-500 hover:to-teal-600',
    bgAccent: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    features: ['Legacy Rule Import', 'NGDC Mapping & Recommendations', 'Birthright Validation', 'Compile & Migrate', 'Org Mapping Reference'],
    path: '/ngdc-standardization',
    stats: { label: 'Pending Migration', icon: 'arrow' },
  },
  {
    id: 'firewall-management',
    title: 'Network Firewall Request',
    subtitle: 'Manage As-Is Firewall Rules',
    description: 'View and manage existing firewall rules as-is. Request modifications, handle exceptions, track changes, and submit for provisioning.',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
    color: 'from-amber-600 to-orange-700',
    hoverColor: 'hover:from-amber-500 hover:to-orange-600',
    bgAccent: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    features: ['View Existing Rules', 'Request Modifications', 'Exception Handling', 'Change Tracking', 'Submit for Provisioning'],
    path: '/firewall-management',
    stats: { label: 'Open Requests', icon: 'list' },
  },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">
              Network Firewall Studio
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Enterprise-grade firewall rule management, NGDC standardization, and network security operations
            </p>
          </div>
        </div>
      </div>

      {/* Module Cards */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => navigate(mod.path)}
              className="group relative text-left rounded-2xl border border-slate-700/50 bg-slate-800/50 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-slate-600/80 hover:shadow-2xl hover:shadow-blue-500/5 hover:-translate-y-1"
            >
              {/* Gradient top bar */}
              <div className={`h-1.5 bg-gradient-to-r ${mod.color}`} />

              <div className="p-6">
                {/* Icon + Title */}
                <div className="flex items-start gap-4 mb-4">
                  <div className={`flex-shrink-0 w-14 h-14 rounded-xl ${mod.bgAccent} border ${mod.borderColor} flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-300`}>
                    {mod.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white group-hover:text-blue-300 transition-colors">
                      {mod.title}
                    </h2>
                    <p className="text-sm text-slate-400 mt-0.5">{mod.subtitle}</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-slate-400 leading-relaxed mb-5">
                  {mod.description}
                </p>

                {/* Features */}
                <div className="space-y-2 mb-6">
                  {mod.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${mod.color}`} />
                      {f}
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className={`flex items-center gap-2 text-sm font-semibold bg-gradient-to-r ${mod.color} bg-clip-text text-transparent group-hover:gap-3 transition-all`}>
                  Open Module
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Quick Stats Bar */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'NGDC Data Centers', value: '3', sub: 'Alpha, Beta, Gamma' },
            { label: 'Neighbourhoods', value: '17', sub: 'Production & Non-Prod' },
            { label: 'Security Zones', value: '17', sub: 'Prod: STD, GEN, PAA, CDE, CPA, CCS, 3PY, Swift, PSE, UC' },
            { label: 'Policy Matrices', value: '3', sub: 'Production, Non-Production, Pre-Production' },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-4">
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-sm font-medium text-slate-300 mt-1">{stat.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => navigate('/request-tracking')}
            className="rounded-xl bg-slate-800/40 border border-slate-700/30 p-3 text-left hover:border-blue-500/30 transition-colors group"
          >
            <div className="text-sm font-medium text-slate-300 group-hover:text-blue-300">Request Tracking</div>
            <div className="text-xs text-slate-500 mt-0.5">Track rule request statuses</div>
          </button>
          <button
            onClick={() => navigate('/audit-trail')}
            className="rounded-xl bg-slate-800/40 border border-slate-700/30 p-3 text-left hover:border-emerald-500/30 transition-colors group"
          >
            <div className="text-sm font-medium text-slate-300 group-hover:text-emerald-300">Audit Trail</div>
            <div className="text-xs text-slate-500 mt-0.5">Who changed what and when</div>
          </button>
          <button
            onClick={() => navigate('/pass-through-validation')}
            className="rounded-xl bg-slate-800/40 border border-slate-700/30 p-3 text-left hover:border-indigo-500/30 transition-colors group"
          >
            <div className="text-sm font-medium text-slate-300 group-hover:text-indigo-300">Pass-Through Validation</div>
            <div className="text-xs text-slate-500 mt-0.5">Live connectivity verification</div>
          </button>
          <button
            onClick={() => navigate('/lifecycle')}
            className="rounded-xl bg-slate-800/40 border border-slate-700/30 p-3 text-left hover:border-purple-500/30 transition-colors group"
          >
            <div className="text-sm font-medium text-slate-300 group-hover:text-purple-300">Lifecycle</div>
            <div className="text-xs text-slate-500 mt-0.5">Rule lifecycle management</div>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="rounded-xl bg-slate-800/40 border border-slate-700/30 p-3 text-left hover:border-amber-500/30 transition-colors group"
          >
            <div className="text-sm font-medium text-slate-300 group-hover:text-amber-300">Settings</div>
            <div className="text-xs text-slate-500 mt-0.5">Org config & admin</div>
          </button>
        </div>

        {/* Footer Links */}
        <div className="mt-12 flex items-center justify-center gap-8 text-xs text-slate-500">
          <button onClick={() => navigate('/settings')} className="hover:text-slate-300 transition-colors">
            Settings & Org Admin
          </button>
          <span className="text-slate-700">|</span>
          <span>Enterprise Firewall Management Platform</span>
          <span className="text-slate-700">|</span>
          <span>NGDC Standards Compliant</span>
        </div>
      </div>
    </div>
  );
}
