import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../app/api.js';
import { useDebounce, useMoney } from '../app/hooks.js';
import { useScanListener } from '../modules/scanner/hooks.js';

/** Generic "type to search, pick one" input backed by an API endpoint. `scannable` = phone scans fill the box while focused. */
export function AsyncPicker({ endpoint, params, toOption, value, onChange, placeholder = 'Search…', disabled, scannable = false }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const q = useDebounce(text, 250);
  const box = useRef(null);
  const inputRef = useRef(null);
  const paramsKey = JSON.stringify(params ?? {});

  useScanListener((code) => {
    if (scannable && inputRef.current && document.activeElement === inputRef.current) {
      setText(code);
      setOpen(true);
    }
  });

  useEffect(() => {
    if (!open) return;
    let live = true;
    api.get(endpoint, { params: { ...JSON.parse(paramsKey), q: q || undefined } }).then((r) => live && setItems(r.data.data));
    return () => {
      live = false;
    };
  }, [endpoint, paramsKey, q, open]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (value) {
    const o = toOption(value);
    return (
      <div className="picker-selected">
        <div>
          <div className="cell-title">{o.label}</div>
          {o.sub && <div className="cell-sub">{o.sub}</div>}
        </div>
        {!disabled && (
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(null)} aria-label="Clear">
            <X size={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="picker" ref={box}>
      <input
        ref={inputRef}
        data-scan-target
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="picker-menu">
          {items.length === 0 && <div className="picker-item muted">No matches</div>}
          {items.map((it) => {
            const o = toOption(it);
            return (
              <div
                key={it.id}
                className="picker-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(it);
                  setText('');
                  setOpen(false);
                }}
              >
                <div className="cell-title">{o.label}</div>
                {o.sub && <div className="cell-sub">{o.sub}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CustomerPicker(props) {
  const money = useMoney();
  return (
    <AsyncPicker
      endpoint="/customers/search"
      placeholder="Search customer by name or phone…"
      toOption={(c) => ({
        label: c.name,
        sub: `${c.phone}${c.address ? ` · ${c.address}` : ''}${Number(c.credit) > 0 ? ` · Credit ${money(c.credit)}` : ''}`,
      })}
      {...props}
    />
  );
}

export function ProductPicker(props) {
  return (
    <AsyncPicker
      scannable
      endpoint="/inventory/products"
      placeholder="Search product by name, SKU, barcode or scan…"
      toOption={(p) => ({ label: p.name, sub: `${p.sku} · Stock ${p.totalStock}${p.trackSerial ? ' · Serial tracked' : ''}` })}
      {...props}
    />
  );
}
