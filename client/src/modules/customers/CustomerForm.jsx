import { useState } from 'react';
import { api } from '../../app/api.js';
import { useToast } from '../../app/hooks.js';
import { Field, Modal } from '../../components/ui.jsx';

// onSaved(customer) – also used by the POS "quick add"
export default function CustomerForm({ initial = {}, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: initial.name || '', phone: initial.phone || '', email: initial.email || '', address: initial.address || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      const { data } = initial.id ? await api.put(`/customers/${initial.id}`, form) : await api.post('/customers', form);
      toast.success('Customer saved');
      onSaved(data);
    } catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={initial.id ? 'Edit customer' : 'Add customer'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="customer-form" disabled={busy}>Save</button></>}>
      <form id="customer-form" className="stack" onSubmit={save}>
        <Field label="Full name"><input required autoFocus value={form.name} onChange={set('name')} /></Field>
        <div className="row two">
          <Field label="Phone"><input required value={form.phone} onChange={set('phone')} /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={set('email')} /></Field>
        </div>
        <Field label="Address"><textarea value={form.address} onChange={set('address')} /></Field>
      </form>
    </Modal>
  );
}
