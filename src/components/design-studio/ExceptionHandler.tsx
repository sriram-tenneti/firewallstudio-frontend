import { useState } from 'react';
import { Modal } from '../shared/Modal';

interface ExceptionEntry {
  id: string;
  type: 'ip' | 'subnet' | 'range';
  value: string;
  justification: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requested_by: string;
  requested_at: string;
}

interface ExceptionHandlerProps {
  ruleId: string;
  appId: string;
  exceptions: ExceptionEntry[];
  onAddException: (data: { type: string; value: string; justification: string }) => void;
  onApproveException: (id: string) => void;
  onRejectException: (id: string) => void;
}

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const SUBNET_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

export function ExceptionHandler({ ruleId, appId, exceptions, onAddException, onApproveException, onRejectException }: ExceptionHandlerProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [type, setType] = useState<'ip' | 'subnet' | 'range'>('ip');
  const [value, setValue] = useState('');
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const validate = (): boolean => {
    if (!value.trim()) { setError('Value is required'); return false; }
    if (type === 'ip' && !IP_REGEX.test(value.trim())) { setError('Invalid IP format (e.g. 10.0.1.5)'); return false; }
    if (type === 'subnet' && !SUBNET_REGEX.test(value.trim())) { setError('Invalid subnet format (e.g. 10.0.1.0/24)'); return false; }
    if (type === 'range' && !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s*-\s*\d/.test(value.trim())) { setError('Invalid range format (e.g. 10.0.1.1-10.0.1.50)'); return false; }
    if (!justification.trim()) { setError('Justification is required'); return false; }
    setError('');
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setShowConfirm(true);
  };

  const confirmSubmit = () => {
    onAddException({ type, value: value.trim(), justification: justification.trim() });
    setValue('');
    setJustification('');
    setShowConfirm(false);
    setShowAdd(false);
  };

  const statusColors: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">IP / Subnet / Range Exceptions</h4>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
        >
          + Add Exception
        </button>
      </div>

      {exceptions.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No exceptions configured. Click &quot;+ Add Exception&quot; to allow individual IPs, subnets, or ranges.</p>
      ) : (
        <div className="space-y-2">
          {exceptions.map(exc => (
            <div key={exc.id} className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${exc.type === 'ip' ? 'bg-blue-100 text-blue-700' : exc.type === 'range' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                  {exc.type === 'ip' ? 'IP' : exc.type === 'range' ? 'RNG' : 'NET'}
                </span>
                <span className="text-sm font-mono font-medium text-gray-800">{exc.value}</span>
                <span className="text-xs text-gray-500 max-w-xs truncate">{exc.justification}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[exc.status]}`}>{exc.status}</span>
                {exc.status === 'Pending' && (
                  <>
                    <button onClick={() => onApproveException(exc.id)} className="px-2 py-0.5 text-xs text-green-700 hover:bg-green-50 rounded">Approve</button>
                    <button onClick={() => onRejectException(exc.id)} className="px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 rounded">Reject</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Exception Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add IP / Subnet / Range Exception" size="md">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Warning:</strong> Adding individual IP/subnet exceptions bypasses group-to-group policy standards.
              This requires approval and will be audited. Only use when group membership is not feasible.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Exception Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType('ip')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border ${type === 'ip' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
              >IP (svr-)</button>
              <button
                onClick={() => setType('subnet')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border ${type === 'subnet' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300'}`}
              >Subnet (net-)</button>
              <button
                onClick={() => setType('range')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border ${type === 'range' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}
              >Range (rng-)</button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {type === 'ip' ? 'IP Address (svr-)' : type === 'subnet' ? 'Subnet CIDR (net-)' : 'IP Range (rng-)'}
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              value={value}
              onChange={e => { setValue(e.target.value); setError(''); }}
              placeholder={type === 'ip' ? '10.0.1.5' : type === 'subnet' ? '10.0.1.0/24' : '10.0.1.1-10.0.1.50'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Business Justification</label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              rows={3}
              value={justification}
              onChange={e => { setJustification(e.target.value); setError(''); }}
              placeholder="Explain why an individual IP/subnet exception is needed..."
            />
          </div>

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Submit Exception</button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Dialog */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Exception" size="sm">
        <div className="space-y-3">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 font-medium">Are you sure you want to add this exception?</p>
            <div className="mt-2 text-xs text-yellow-700">
              <p><strong>Rule:</strong> {ruleId}</p>
              <p><strong>App:</strong> {appId}</p>
              <p><strong>Type:</strong> {type === 'ip' ? 'Individual IP (svr-)' : type === 'subnet' ? 'Subnet (net-)' : 'Range (rng-)'}</p>
              <p><strong>Value:</strong> {value}</p>
            </div>
            <p className="mt-2 text-xs text-yellow-700">This exception will require approval from a reviewer and will be logged for audit purposes.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowConfirm(false)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md">Cancel</button>
            <button onClick={confirmSubmit} className="px-4 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700">Confirm &amp; Submit</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
