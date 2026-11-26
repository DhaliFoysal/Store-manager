import { Boxes, ReceiptText, ScanLine, ShieldCheck } from 'lucide-react';

export default function AuthShell({ children }) {
  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="flex">
          <div className="brand-mark">S</div>
          <strong style={{ fontSize: 18 }}>Store Manager</strong>
        </div>
        <div>
          <h1>Run your shop with clarity.</h1>
          <p style={{ margin: '12px 0 24px' }}>Stock, serial numbers, POS sales, warranties and customer balances — in one clean workspace.</p>
          <div className="auth-feature"><ScanLine size={18} /> Barcode &amp; serial-number POS</div>
          <div className="auth-feature"><ReceiptText size={18} /> Professional A4 vouchers</div>
          <div className="auth-feature"><Boxes size={18} /> Multi-warehouse inventory</div>
          <div className="auth-feature"><ShieldCheck size={18} /> Role-based access for your team</div>
        </div>
        <small style={{ color: 'rgba(255,255,255,.7)', position: 'relative', zIndex: 1 }}>© {new Date().getFullYear()} Store Manager</small>
      </div>
      <div className="auth-panel">
        <div className="auth-form">{children}</div>
      </div>
    </div>
  );
}
