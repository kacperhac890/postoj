import { useCallback, useEffect, useState } from "react";
import { Buildings, EnvelopeSimple, LinkSimple, Trash } from "@phosphor-icons/react";
import { shortDate } from "../domain/format";
import { api, describeError } from "../data/cloud";
import { useSession } from "../data/session";
import { toast } from "../ui/Toast";
import { Badge, Button, Field, Panel, TextInput } from "../ui/kit";
import { Spinner } from "../ui/motion";

/* Właściciele flot: tylko dla operatora aplikacji. Każdy właściciel ma
   własną, oddzielną flotę i sam zaprasza swoich kierowców. */

type Owner = Awaited<ReturnType<typeof api.ownerAccounts>>[number];

const when = (iso: string | null) => (iso ? shortDate(iso.slice(0, 10)) : "");

function state(o: Owner): { tone: "green" | "amber" | "neutral"; label: string } {
  if (o.last_sign_in_at || o.confirmed_at) return { tone: "green", label: "konto aktywne" };
  if (o.invited_at) return { tone: "amber", label: "zaproszony" };
  return { tone: "neutral", label: "bez konta" };
}

export function OwnersPanel() {
  const operator = useSession((s) => s.operator);
  const mode = useSession((s) => s.mode);
  const [owners, setOwners] = useState<Owner[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"email" | "link" | null>(null);
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setOwners(await api.ownerAccounts());
      setLoadError(null);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }, []);

  useEffect(() => {
    if (operator && mode === "cloud") void reload();
  }, [operator, mode, reload]);

  if (!operator || mode !== "cloud") return null;

  async function invite(delivery: "email" | "link", target = email) {
    const address = target.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      toast.error("Wpisz poprawny adres e-mail właściciela floty.");
      return;
    }
    setBusy(delivery);
    try {
      const res = await api.inviteOwner(address, delivery);
      if (res.status === "link" && res.link) {
        setLink({ email: address, link: res.link });
        let copied = false;
        try {
          await navigator.clipboard.writeText(res.link);
          copied = true;
        } catch {
          /* Brak dostępu do schowka: link zostaje w polu do skopiowania ręcznie. */
        }
        toast.ok(copied ? "Link skopiowany. Wyślij go właścicielowi floty." : "Link gotowy, skopiuj go z pola.");
      } else if (res.status === "invited") {
        toast.ok(`Zaproszenie wysłane na ${address}.`);
      } else {
        toast.ok(`${address} ma już konto. Od teraz po zalogowaniu zarządza własną flotą.`);
      }
      setEmail("");
      await reload();
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(o: Owner) {
    if (
      !window.confirm(
        `Odebrać ${o.email} dostęp właściciela floty? Dane jego floty zostaną w bazie, ale nie będzie ich widział ani zmieniał, dopóki nie dodasz go ponownie.`,
      )
    )
      return;
    try {
      await api.removeOwner(o.email);
      toast.ok("Dostęp odebrany.");
      await reload();
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  return (
    <Panel title="Właściciele flot" aside="tylko operator" className="lg:col-span-2">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-sunken text-ink-2">
            <Buildings size={19} />
          </span>
          <p className="max-w-[68ch] text-[0.875rem] leading-relaxed text-ink-2">
            Zaproś właściciela innej floty. Dostanie link, ustawi hasło i zacznie od pustej floty: doda auta, kierowców
            i sam zaprosi swoich kierowców. Floty są oddzielone w bazie: on nie widzi Twoich danych, a Ty jego.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="E-mail właściciela floty" className="min-w-0 flex-1">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="np. biuro@innaflota.pl"
              autoComplete="off"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void invite("email")} disabled={busy !== null}>
              {busy === "email" ? <Spinner /> : <EnvelopeSimple size={16} />}
              Wyślij e-mailem
            </Button>
            <Button onClick={() => void invite("link")} disabled={busy !== null}>
              {busy === "link" ? <Spinner /> : <LinkSimple size={16} />}
              Skopiuj link
            </Button>
          </div>
        </div>

        {link ? (
          <div className="enter flex flex-col gap-1.5">
            <input
              readOnly
              value={link.link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={`Link zaproszenia dla ${link.email}`}
              className="h-9 w-full rounded-control border border-line-strong bg-surface px-2.5 font-mono text-[0.75rem] text-ink-2 outline-none focus:border-green"
            />
            <span className="text-[0.75rem] leading-snug text-ink-3">
              Link dla {link.email}. Działa jeden raz i przez ograniczony czas.
            </span>
          </div>
        ) : null}

        {loadError ? (
          <p className="text-[0.8125rem] text-red">{loadError}</p>
        ) : !owners ? (
          <div className="flex justify-center py-4 text-ink-3">
            <Spinner />
          </div>
        ) : (
          <ul className="-mx-4 border-t border-line md:-mx-5">
            {owners.map((o) => {
              const st = state(o);
              return (
                <li key={o.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0 md:px-5">
                  <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">{o.email}</span>
                  {o.operator ? <Badge tone="green">operator (Ty)</Badge> : <Badge tone={st.tone}>{st.label}</Badge>}
                  <span className="text-[0.75rem] text-ink-3">
                    {o.last_sign_in_at ? `logowanie ${when(o.last_sign_in_at)}` : o.invited_at ? `zaproszony ${when(o.invited_at)}` : ""}
                  </span>
                  {!o.operator ? (
                    <span className="flex gap-1">
                      {st.label !== "konto aktywne" ? (
                        <Button size="sm" variant="quiet" onClick={() => void invite("link", o.email)} disabled={busy !== null}>
                          <LinkSimple size={15} />
                          Nowy link
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void remove(o)}
                        aria-label={`Odbierz dostęp ${o.email}`}
                        title="Odbierz dostęp"
                        className="press flex h-8 w-8 items-center justify-center rounded-control text-ink-3 hover:bg-red-soft hover:text-red"
                      >
                        <Trash size={16} />
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
