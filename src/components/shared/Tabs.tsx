interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex border-b border-slate-200">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab.id
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}>
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
              activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
