import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../app/api.js';
import { useCan, useFetch, useToast } from '../../app/hooks.js';
import { invalidateLookups } from '../../app/slices.js';
import { Badge, Empty, Field, Loading, Modal, PageHeader, StatusBadge, useConfirm } from '../../components/ui.jsx';

export default function Warehouses() {
  const can = useCan();
  const toast = useToast();
  const dispatch = useDispatch();
  const { data, loading, reload } = useFetch('/warehouses');
  const [editing, setEditing] = useState(null);
  const [confirm, dialog] = useConfirm();
  const manage = can('warehouses.manage');

  const done = () => { dispatch(invalidateLookups()); reload(); };

  const remove = async (w) => {
    if (!(await confirm({ title: 'Delete warehouse', message: `Delete "${w.name}"?`, danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/warehouses/${w.id}`); toast.success('Warehouse deleted'); done(); } catch (e) { toast.fail(e); }
  };

  return (
    <>
      <PageHeader title="Warehouses" subtitle="Locations where your stock is kept">
        {manage && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus /> New warehouse</button>}
      </PageHeader>
      <div className="card">
        {loading ? <Loading /> : data.data.length === 0 ? <Empty title="No warehouses" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Address</th><th>Status</th><th className="right">Units in stock</th>{manage && <th />}</tr></thead>
            <tbody>
              {data.data.map((w) => (
                <tr key={w.id}>
                  <td><span className="cell-title">{w.name}</span> {w.isDefault && <Badge>Default</Badge>}</td>
                  <td className="muted">{w.address || '—'}</td>
                  <td><StatusBadge value={w.isActive ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td className="right">{w.totalUnits}</td>
                  {manage && <td><div className="actions">
                    <button className="btn btn-sm" onClick={() => setEditing(w)}><Pencil /> Edit</button>
                    {!w.isDefault && <button className="btn btn-sm btn-danger" onClick={() => remove(w)}><Trash2 /></button>}
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <WarehouseForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); done(); }} />}
      {dialog}
    </>
  );
}

function WarehouseForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: initial.name || '', address: initial.address || '', isDefault: !!initial.isDefault, isActive: initial.isActive ?? true });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (initial.id) await api.put(`/warehouses/${initial.id}`, form);
      else await api.post('/warehouses', form);
      toast.success('Warehouse saved');
      onSaved();
    } catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={initial.id ? 'Edit warehouse' : 'New warehouse'} onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="wh-form" disabled={busy}>Save</button></>}>
      <form id="wh-form" className="stack" onSubmit={save}>
        <Field label="Name"><input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={form.isDefault} disabled={initial.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Default warehouse (pre-selected at the POS)</label>
        <label className="check"><input type="checkbox" checked={form.isActive} disabled={initial.isDefault} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
      </form>
    </Modal>
  );
}
