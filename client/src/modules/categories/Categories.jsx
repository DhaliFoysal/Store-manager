import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../app/api.js';
import { useCan, useFetch, useToast } from '../../app/hooks.js';
import { invalidateLookups } from '../../app/slices.js';
import { Empty, Field, Loading, Modal, PageHeader, useConfirm } from '../../components/ui.jsx';

export default function Categories() {
  const can = useCan();
  const toast = useToast();
  const dispatch = useDispatch();
  const { data, loading, reload } = useFetch('/categories');
  const [editing, setEditing] = useState(null); // {} = new
  const [confirm, dialog] = useConfirm();
  const manage = can('categories.manage');

  const remove = async (c) => {
    if (!(await confirm({ title: 'Delete category', message: `Delete "${c.name}"? Its products will be kept without a category.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.delete(`/categories/${c.id}`);
      dispatch(invalidateLookups());
      toast.success('Category deleted');
      reload();
    } catch (e) { toast.fail(e); }
  };

  return (
    <>
      <PageHeader title="Product categories" subtitle="Group products to find and report on them faster">
        {manage && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus /> New category</button>}
      </PageHeader>
      <div className="card">
        {loading ? <Loading /> : data.data.length === 0 ? <Empty title="No categories yet" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Description</th><th className="right">Products</th>{manage && <th />}</tr></thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id}>
                  <td className="cell-title">{c.name}</td>
                  <td className="muted">{c.description || '—'}</td>
                  <td className="right">{c._count.products}</td>
                  {manage && <td><div className="actions">
                    <button className="btn btn-sm" onClick={() => setEditing(c)}><Pencil /> Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(c)}><Trash2 /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <CategoryForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); dispatch(invalidateLookups()); reload(); }} />}
      {dialog}
    </>
  );
}

function CategoryForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: initial.name || '', description: initial.description || '' });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (initial.id) await api.put(`/categories/${initial.id}`, form);
      else await api.post('/categories', form);
      toast.success('Category saved');
      onSaved();
    } catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={initial.id ? 'Edit category' : 'New category'} onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="cat-form" disabled={busy}>Save</button></>}>
      <form id="cat-form" className="stack" onSubmit={save}>
        <Field label="Name"><input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
