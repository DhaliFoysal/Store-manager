import { useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../app/api.js';
import { useFetch, useToast } from '../../app/hooks.js';
import { Badge, Empty, Field, Loading, Modal, PageHeader, Tabs, useConfirm } from '../../components/ui.jsx';

/** Super admin: default categories & warehouses that every approved store receives automatically. */
export default function Defaults() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/platform/defaults');
  const [tab, setTab] = useState('categories');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, dialog] = useConfirm();
  const isCat = tab === 'categories';
  const rows = data?.[tab] || [];

  const remove = async (r) => {
    if (!(await confirm({ title: 'Remove default', message: `Remove "${r.name}" from the defaults? Stores that already received it keep it.`, danger: true, confirmLabel: 'Remove' }))) return;
    try { await api.delete(`/platform/defaults/${tab}/${r.id}`); toast.success('Removed'); reload(); } catch (e) { toast.fail(e); }
  };

  const applyAll = async () => {
    if (!(await confirm({ title: 'Apply to all stores', message: 'Add every default category and warehouse that is missing to all active stores? Nothing is deleted or renamed.', confirmLabel: 'Apply' }))) return;
    setBusy(true);
    try { const { data: r } = await api.post('/platform/defaults/apply'); toast.success(r.message); } catch (e) { toast.fail(e); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Default setup" subtitle="Categories and warehouses every newly approved store starts with">
        <button className="btn" disabled={busy} onClick={applyAll}><RefreshCw /> Apply to all stores</button>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus /> {isCat ? 'New category' : 'New warehouse'}</button>
      </PageHeader>
      <div className="card">
        <Tabs value={tab} onChange={(v) => { setTab(v); setEditing(null); }} tabs={[{ value: 'categories', label: 'Default categories' }, { value: 'warehouses', label: 'Default warehouses' }]} />
        {loading && !data ? <Loading /> : !rows.length ? <Empty title={isCat ? 'No default categories' : 'No default warehouses'}>{isCat ? 'Add categories such as “Mobile Phones”.' : 'Without any, stores get a single “Main Warehouse”.'}</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>{isCat ? 'Description' : 'Address'}</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className="cell-title">{r.name}</span> {!isCat && r.isDefault && <Badge>Default</Badge>}</td>
                  <td className="muted">{(isCat ? r.description : r.address) || '—'}</td>
                  <td><div className="actions">
                    <button className="btn btn-sm" onClick={() => setEditing(r)}><Pencil /> Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(r)} aria-label="Delete"><Trash2 /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <DefaultForm kind={tab} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {dialog}
    </>
  );
}

function DefaultForm({ kind, initial, onClose, onSaved }) {
  const toast = useToast();
  const isCat = kind === 'categories';
  const [f, setF] = useState({ name: initial.name || '', text: (isCat ? initial.description : initial.address) || '', isDefault: !!initial.isDefault });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = isCat ? { name: f.name, description: f.text } : { name: f.name, address: f.text, isDefault: f.isDefault };
    try {
      if (initial.id) await api.put(`/platform/defaults/${kind}/${initial.id}`, body);
      else await api.post(`/platform/defaults/${kind}`, body);
      toast.success('Saved');
      onSaved();
    } catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={`${initial.id ? 'Edit' : 'New'} default ${isCat ? 'category' : 'warehouse'}`} size="sm" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="default-form" disabled={busy}>Save</button></>}>
      <form id="default-form" className="stack" onSubmit={save}>
        <Field label="Name"><input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={isCat ? 'Description' : 'Address'}><input value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
        {!isCat && <label className="check"><input type="checkbox" checked={f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} /> Make this each store's default warehouse (pre-selected at the POS)</label>}
      </form>
    </Modal>
  );
}
