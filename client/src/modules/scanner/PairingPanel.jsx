import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Link2Off, RefreshCw, Smartphone } from "lucide-react";
import { useFetch, useToast } from "../../app/hooks.js";
import { Field } from "../../components/ui.jsx";
import { useScanner } from "./hooks.js";
import "./scanner.css";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

/** QR-code pairing. The link is PERMANENT for your phone – open the same link again any time. */
export default function PairingPanel() {
  const toast = useToast();
  const { session, connection, phoneOnline, pair, unpair, renew } =
    useScanner();
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState("");

  const isLocal = LOCAL_HOSTS.includes(window.location.hostname);
  const net = useFetch("/scanner/network", undefined, {
    enabled: !!session && isLocal,
  });
  const addresses = net.data?.addresses || [];

  const host = ip || addresses[0]?.address;
  const base = isLocal
    ? host
      ? `${window.location.protocol}//${host}${window.location.port ? `:${window.location.port}` : ""}`
      : ""
    : window.location.origin;
  const url =
    session && base
      ? `${base}/scan?s=${session.id}&t=${session.phoneToken}`
      : "";
  const insecure = url.startsWith("http://");

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doRenew = () => {
    if (
      !window.confirm(
        "Create a new link? The old link on your phone will stop working and you must scan the new QR code once.",
      )
    )
      return;
    run(async () => {
      await renew();
      toast.success("New link created");
    });
  };

  if (!session) {
    return (
      <div className="stack">
        <p style={{ margin: 0 }} className="muted">
          Use your Android phone as a wireless scanner. Your phone gets{" "}
          <strong>one permanent link</strong> – scan the QR code once, then
          re-use the same link (bookmark it or add it to the home screen).
        </p>
        <div>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => run(pair)}
          >
            <Smartphone /> Connect this PC
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="flex wrap">
        <span
          className={`badge ${connection === "open" ? "badge-ok" : "badge-warn"}`}
        >
          {connection === "open" ? "Listening" : "Connecting…"}
        </span>
        <span className={`badge ${phoneOnline ? "badge-ok" : "badge-muted"}`}>
          {phoneOnline ? "Phone connected" : "Waiting for phone"}
        </span>
      </div>

      {isLocal && !net.loading && addresses.length === 0 && (
        <div className="callout warn">
          No Wi-Fi / LAN address was found on this PC. Connect it to the same
          Wi-Fi as the phone and re-open this window.
        </div>
      )}
      {isLocal && addresses.length > 1 && (
        <Field
          label="This PC's network address"
          hint="Pick the one on the same Wi-Fi as the phone (usually 192.168.x.x)"
        >
          <select value={host} onChange={(e) => setIp(e.target.value)}>
            {addresses.map((a) => (
              <option key={a.address} value={a.address}>
                {a.address} ({a.name})
              </option>
            ))}
          </select>
        </Field>
      )}

      {url && (
        <div
          className="flex wrap"
          style={{ alignItems: "flex-start", gap: 18 }}
        >
          <div className="qr-box">
            <QRCodeSVG value={url} size={190} />
          </div>
          <div className="stack" style={{ flex: 1, minWidth: 220, gap: 8 }}>
            <div>
              <strong>1.</strong> Scan this code with the phone once and open
              the link.
            </div>
            <div>
              <strong>2.</strong> Bookmark it / “Add to Home screen” – next time
              just open it again, no new QR needed.
            </div>
            <div
              className="mono muted"
              style={{ wordBreak: "break-all", fontSize: 11.5 }}
            >
              {url}
            </div>
            <div className="flex wrap">
              <button
                className="btn btn-sm"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(url)
                    .then(() => toast.success("Link copied"))
                }
              >
                <Copy /> Copy link
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={doRenew}>
                <RefreshCw /> Generate new link
              </button>
              <button className="btn btn-sm btn-danger" onClick={unpair}>
                <Link2Off /> Stop listening on this PC
              </button>
            </div>
          </div>
        </div>
      )}
      {insecure && (
        <div className="callout warn">
          This link is plain <code>http://</code>, so Android Chrome will block
          the <strong>camera</strong>. Stop the dev server and run{" "}
          <code>npm run dev:lan</code> instead (HTTPS), then pair again. On the
          phone tap <em>Advanced → Proceed</em> once for the self-signed
          certificate.
        </div>
      )}
    </div>
  );
}
