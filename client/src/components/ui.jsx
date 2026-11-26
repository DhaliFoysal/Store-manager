import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';
import { titleCase } from '../app/format.js';
import { useScanListener } from '../modules/scanner/hooks.js';

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function Loading() {
  return (
    <div className="center-pad">
      <Spinner />
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', children, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <Icon />
      <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{title}</div>
      {children && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header no-print">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

const VARIANTS = {
  ok: ['ACTIVE', 'PAID', 'IN_STOCK', 'REPAIRED', 'REPLACED', 'active'],
  warn: ['PENDING', 'PARTIAL', 'RECEIVED', 'IN_REPAIR', 'expiring'],
  bad: ['DUE', 'REJECTED', 'DEFECTIVE', 'LOST', 'SUSPENDED', 'expired'],
  muted: ['INACTIVE', 'VOID', 'SOLD', 'RETURNED', 'none', 'USER'],
};
export function StatusBadge({ value, label }) {
  const variant = Object.keys(VARIANTS).find((k) => VARIANTS[k].includes(value)) || 'brand';
  return <span className={`badge ${variant === 'brand' ? '' : `badge-${variant}`}`}>{label || titleCase(String(value))}</span>;
}

export function Badge({ children, variant }) {
  return <span className={`badge ${variant ? `badge-${variant}` : ''}`}>{children}</span>;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', scannable = true }) {
  const ref = useRef(null);
  // a code scanned with the paired phone fills the search box while it has focus
  useScanListener((code) => {
    if (scannable && ref.current && document.activeElement === ref.current) onChange(code);
  });
  return (
    <div className="search">
      <Search />
      <input ref={ref} data-scan-target value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <div className="pagination">
      <span>
        {from}–{to} of {meta.total}
      </span>
      <div className="flex gap-sm">
        <button className="btn btn-sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          <ChevronLeft /> Prev
        </button>
        <span>
          Page {meta.page} / {meta.pages}
        </span>
        <button className="btn btn-sm" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>
          Next <ChevronRight />
        </button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.value} type="button" className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// const [confirm, dialog] = useConfirm();  if (await confirm({ title, message, danger })) …   + render {dialog}
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolver = useRef(null);
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setState(typeof opts === 'string' ? { message: opts } : opts);
      }),
    [],
  );
  const close = (v) => {
    resolver.current?.(v);
    setState(null);
  };
  const dialog = state && (
    <Modal
      size="sm"
      title={state.title || 'Are you sure?'}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>Cancel</button>
          <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
            {state.confirmLabel || 'Confirm'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{state.message}</p>
    </Modal>
  );
  return [confirm, dialog];
}
