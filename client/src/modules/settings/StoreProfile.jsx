import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '../../app/api.js';
import { useToast } from '../../app/hooks.js';
import { reloadSession } from '../../app/slices.js';
import { Field, PageHeader } from '../../components/ui.jsx';
import PrintHeader from '../../components/PrintHeader.jsx';

export default function StoreProfile() {
  const dispatch = useDispatch();
  const toast = useToast();
  const store = useSelector((s) => s.auth.store);
  const fileRef = useRef(null);
  const [f, setF] = useState({
    name: store.name || '', address: store.address || '', phone: store.phone || '', email: store.email || '',
    voucherNotes: store.voucherNotes || '', currency: store.currency || 'BDT',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.put('/store/profile', f); await dispatch(reloadSession()); toast.success('Store profile saved'); }
    catch (err) { toast.fail(err); } finally { setBusy(false); }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Logo must be 2 MB or smaller');
    const fd = new FormData();
    fd.append('logo', file);
    try { await api.post('/store/logo', fd); await dispatch(reloadSession()); toast.success('Logo updated'); } catch (err) { toast.fail(err); }
  };

  const removeLogo = async () => {
    try { await api.delete('/store/logo'); await dispatch(reloadSession()); toast.success('Logo removed'); } catch (err) { toast.fail(err); }
  };

  return (
    <>
      <PageHeader title="Store profile" subtitle="This information appears on every printed voucher and payment slip" />
      <div className="split">
        <form className="card card-pad stack" onSubmit={save}>
          <div className="flex" style={{ gap: 18, alignItems: 'flex-start' }}>
            <div className="logo-preview">{store.logoUrl ? <img src={store.logoUrl} alt="Store logo" /> : <span className="muted">No logo</span>}</div>
            <div className="stack" style={{ gap: 8 }}>
              <div className="label">Shop logo</div>
              <div className="muted">PNG, JPG or WebP · up to 2 MB. A wide logo on a transparent or white background looks best.</div>
              <div className="flex">
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}><ImagePlus /> {store.logoUrl ? 'Replace' : 'Upload'}</button>
                {store.logoUrl && <button type="button" className="btn btn-danger" onClick={removeLogo}><Trash2 /> Remove</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
            </div>
          </div>
          <Field label="Shop name"><input required value={f.name} onChange={set('name')} /></Field>
          <Field label="Address"><textarea rows={3} value={f.address} onChange={set('address')} /></Field>
          <div className="row">
            <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
            <Field label="E-mail"><input type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Currency"><select value={f.currency} onChange={set('currency')}>{['BDT', 'USD', 'EUR', 'GBP', 'INR'].map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Voucher notes" hint="Printed at the bottom of every voucher — terms, return policy, bank details…">
            <textarea rows={4} value={f.voucherNotes} onChange={set('voucherNotes')} />
          </Field>
          <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
        </form>

        <div>
          <div className="label" style={{ marginBottom: 8 }}>Voucher preview</div>
          <div className="card card-pad" style={{ fontSize: 11 }}>
            <div className="a4" style={{ width: '100%', minHeight: 0, boxShadow: 'none', padding: 0, fontSize: 10.5 }}>
              <PrintHeader store={{ ...f, logoUrl: store.logoUrl }} title="VOUCHER"><div><strong>VCH-000001</strong></div></PrintHeader>
              <div style={{ height: 70, display: 'grid', placeItems: 'center', color: '#b9a5b1' }}>— items —</div>
              {f.voucherNotes && <div className="v-notes"><strong>Notes</strong>{'\n'}{f.voucherNotes}</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
