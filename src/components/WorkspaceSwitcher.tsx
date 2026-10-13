import React, { useEffect, useState } from 'react';
import { apiFetch, getWorkspace, setWorkspace } from '../lib/api';

// Header select: "All workspaces" sends no header, "Default" sends X-Workspace: default (see apiFetch).
export default function WorkspaceSwitcher({ planData }: { planData?: any }) {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  const max = planData?.limits?.workspaces ?? 1;

  useEffect(() => {
    if (planData) apiFetch('/api/workspaces').then(r => setList(Array.isArray(r) ? r : [])).catch(() => {});
  }, [planData]);

  if (list.length <= 1 && max <= 1) return null;
  return (
    <select className="form-input" aria-label="Workspace" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} value={getWorkspace()}
      onChange={e => { setWorkspace(e.target.value); window.location.reload(); }}>
      <option value="">All workspaces</option>
      <option value="default">Default</option>
      {list.filter(w => w.id !== 'default').map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
  );
}
