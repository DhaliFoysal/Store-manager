// Letterhead shared by the A4 voucher and the payment slip. Everything comes from the
// store profile (Settings → Store profile): logo, name, address, phone, e-mail.
export default function PrintHeader({ store, title, children }) {
  return (
    <div className="v-head">
      <div className="v-shop">
        {store.logoUrl && <img className="v-logo" src={store.logoUrl} alt="" />}
        <div>
          <h1>{store.name}</h1>
          {store.address && <div style={{ whiteSpace: 'pre-line' }}>{store.address}</div>}
          <div>
            {store.phone && <>Tel: {store.phone}</>}
            {store.phone && store.email && ' · '}
            {store.email}
          </div>
        </div>
      </div>
      <div className="v-title">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
