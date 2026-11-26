import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../app/api.js";
import { useCan, useFetch, useMoney, useToast } from "../../app/hooks.js";
import { fromCents, titleCase, toCents } from "../../app/format.js";
import { Field, Modal } from "../../components/ui.jsx";

const METHODS = ["CASH", "CARD", "BKASH", "NAGAD", "BANK"];

/**
 * Payment slip form.
 *   <ReceivePaymentModal sale={voucher} />        settle a voucher
 *   <ReceivePaymentModal customer={customer} />   deposit, or pick one of the customer's open vouchers
 * Paying MORE than the balance is allowed: the excess becomes customer credit.
 */
export default function ReceivePaymentModal({
  sale: fixedSale,
  customer: fixedCustomer,
  onClose,
  onDone,
}) {
  const toast = useToast();
  const money = useMoney();
  const can = useCan();
  const navigate = useNavigate();
  const customer = fixedCustomer || fixedSale?.customer || null;

  const open = useFetch(
    "/sales",
    { customerId: fixedCustomer?.id, status: "DUE,PARTIAL", limit: 100 },
    { enabled: !!fixedCustomer && can("sales.view") },
  );
  const openSales = open.data?.data || [];
  const [saleId, setSaleId] = useState(fixedSale ? String(fixedSale.id) : "");
  const sale =
    fixedSale || openSales.find((s) => String(s.id) === saleId) || null;

  const due = sale ? Number(sale.dueAmount) : 0;
  const [amount, setAmount] = useState(fixedSale ? String(due) : "");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const credit = Number(customer?.credit || 0);
  const cents = toCents(amount);
  const excess =
    sale && method !== "CREDIT" ? Math.max(0, cents - toCents(due)) : 0;
  const deposit = !sale ? cents : 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/payments", {
        saleId: sale ? sale.id : null,
        customerId: sale ? null : customer?.id,
        amount: fromCents(cents),
        method,
        reference: reference || null,
        note: note || null,
      });
      toast.success(`Payment ${data.slipNo} recorded`);
      onDone?.(data);
      navigate(`/payments/${data.id}/slip`);
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={
        sale ? `Payment for ${sale.voucherNo}` : "Receive payment / deposit"
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            form="pay-form"
            disabled={busy || cents <= 0}
          >
            {busy ? "Saving…" : "Record payment & print slip"}
          </button>
        </>
      }
    >
      <form id="pay-form" className="stack" onSubmit={submit}>
        {customer && (
          <div className="callout">
            <strong>{customer.name}</strong> · {customer.phone}
            {credit > 0 && <> · Stored credit {money(credit)}</>}
          </div>
        )}

        {fixedCustomer && (
          <Field label="Apply to">
            <select
              value={saleId}
              onChange={(e) => {
                setSaleId(e.target.value);
                const s = openSales.find(
                  (x) => String(x.id) === e.target.value,
                );
                setAmount(s ? String(s.dueAmount) : "");
              }}
            >
              <option value="">Advance deposit (credit the account)</option>
              {openSales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.voucherNo} — due {money(s.dueAmount)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {sale && (
          <div className="sum-row">
            <span className="muted">Balance due on {sale.voucherNo}</span>
            <strong style={{ color: "var(--bad)" }}>{money(due)}</strong>
          </div>
        )}

        <div className="row two">
          <Field label="Amount received">
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {titleCase(m)}
                </option>
              ))}
              {sale && credit > 0 && (
                <option value="CREDIT">
                  Use stored credit ({money(credit)})
                </option>
              )}
            </select>
          </Field>
        </div>

        {excess > 0 && customer && (
          <div className="callout ok">
            {money(fromCents(excess))} is above the balance and will be{" "}
            <strong>added to {customer.name}'s credit</strong>.
          </div>
        )}
        {excess > 0 && !customer && (
          <div className="callout bad">
            This voucher has no customer, so it cannot take more than the
            balance due.
          </div>
        )}
        {deposit > 0 && (
          <div className="callout ok">
            {money(fromCents(deposit))} will be added to {customer?.name}'s
            credit balance.
          </div>
        )}
        {method === "CREDIT" && cents > Math.min(credit, due) * 100 && (
          <div className="callout bad">
            Credit payment cannot exceed the available credit or the balance
            due.
          </div>
        )}

        <div className="row two">
          <Field label="Reference" hint="Transaction / cheque no.">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field label="Note">
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
