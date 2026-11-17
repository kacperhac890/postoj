import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  CaretLeft,
  ChatCircleText,
  CheckCircle,
  PaperPlaneRight,
  Plus,
  Trash,
  Warning,
  Wrench,
} from "@phosphor-icons/react";
import { toIso } from "../domain/format";
import { mainVehicle } from "../domain/schedule";
import { currentWeek } from "../domain/week";
import { describeError } from "../data/cloud";
import {
  STATUS_LABEL,
  createIssue,
  deleteIssue,
  isUnread,
  loadMessages,
  markRead,
  sendMessage,
  updateIssue,
  useIssues,
} from "../data/issues";
import type { Issue, IssueStatus, Message, Side } from "../data/issues";
import { useSession } from "../data/session";
import { useFleet } from "../store/useFleet";
import { Sheet } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import { Badge, Button, Empty, Field, PageHeader, Panel, Plate, Segmented, Select, TextInput, Toggle, cn } from "../ui/kit";
import { Spinner } from "../ui/motion";

/* Usterki: lista zgłoszeń i rozmowa przy każdym z nich.
   Komputer: lista i rozmowa obok siebie. Telefon: lista albo rozmowa. */

const time = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });
const dayLong = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" });

function when(iso: string) {
  const d = new Date(iso);
  const today = toIso(new Date());
  const yesterday = toIso(new Date(Date.now() - 86_400_000));
  if (toIso(d) === today) return time.format(d);
  if (toIso(d) === yesterday) return `wczoraj ${time.format(d)}`;
  return day.format(d);
}

const STATUS_TONE: Record<IssueStatus, "amber" | "neutral" | "green"> = {
  open: "amber",
  progress: "neutral",
  resolved: "green",
};

type Filter = "open" | "all";

export function Issues() {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const role = useSession((s) => s.role);
  const side: Side = role === "admin" ? "admin" : "driver";
  const issues = useIssues((s) => s.issues);
  const reads = useIssues((s) => s.reads);
  const ready = useIssues((s) => s.ready);
  const error = useIssues((s) => s.error);
  const vehicles = useFleet((s) => s.vehicles);
  const drivers = useFleet((s) => s.drivers);
  const [filter, setFilter] = useState<Filter>("open");
  const creating = search.get("nowe") === "1";

  const plates = useMemo(() => new Map(vehicles.map((v) => [v.id, v.plate])), [vehicles]);
  const names = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);

  const openCount = issues.filter((i) => i.status !== "resolved").length;
  const shown = useMemo(() => {
    const list = filter === "open" ? issues.filter((i) => i.status !== "resolved") : issues;
    /* Auto stoi: na górę. Potem najświeższa rozmowa. */
    return [...list].sort(
      (a, b) =>
        Number(b.urgent && b.status !== "resolved") - Number(a.urgent && a.status !== "resolved") ||
        b.lastMessageAt.localeCompare(a.lastMessageAt),
    );
  }, [issues, filter]);

  const current = id ? issues.find((i) => i.id === id) : undefined;

  const openNew = () => setSearch({ nowe: "1" });
  const closeNew = () => setSearch({});

  const header = (
    <PageHeader
      title="Usterki"
      lead={
        side === "admin"
          ? "Zgłoszenia kierowców. Odpisz, ustaw stan naprawy, a kierowca od razu to zobaczy."
          : "Coś nie tak z autem? Zgłoś to szefowi floty i rozmawiaj o naprawie w jednym miejscu."
      }
    >
      <Button variant="primary" onClick={openNew} disabled={vehicles.length === 0}>
        <Plus size={16} weight="bold" />
        Zgłoś usterkę
      </Button>
    </PageHeader>
  );

  const list = (
    <Panel flush>
      <div className="border-b border-line p-3">
        <Segmented
          label="Które zgłoszenia"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: `Otwarte (${openCount})` },
            { value: "all", label: `Wszystkie (${issues.length})` },
          ]}
        />
      </div>
      {!ready ? (
        <div className="flex items-center justify-center py-10 text-ink-3">
          <Spinner />
        </div>
      ) : error ? (
        <p className="px-4 py-5 text-[0.875rem] text-red md:px-5">{error}</p>
      ) : shown.length === 0 ? (
        <Empty icon={<Wrench size={20} />} title={filter === "open" ? "Nic nie czeka na naprawę" : "Brak zgłoszeń"}>
          {side === "admin"
            ? "Gdy kierowca zgłosi usterkę, pojawi się tutaj."
            : "Gdy coś się zepsuje, kliknij „Zgłoś usterkę”. Szef floty dostanie zgłoszenie od razu."}
        </Empty>
      ) : (
        <ul>
          {shown.map((issue, i) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              index={i}
              active={issue.id === id}
              unread={isUnread(issue, reads, side)}
              plate={plates.get(issue.vehicleId)}
              who={side === "admin" ? (issue.driverId ? (names.get(issue.driverId) ?? "Kierowca") : "Ty") : null}
            />
          ))}
        </ul>
      )}
    </Panel>
  );

  return (
    <>
      <div className={cn(id ? "max-lg:hidden" : undefined)}>{header}</div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className={cn(id ? "max-lg:hidden" : undefined)}>{list}</div>
        <div className={cn(!id && "max-lg:hidden")}>
          {id && current ? (
            <Thread
              key={current.id}
              issue={current}
              side={side}
              plate={plates.get(current.vehicleId)}
              reporter={current.driverId ? (names.get(current.driverId) ?? "Kierowca") : "Szef floty"}
              onGone={() => navigate("/usterki", { replace: true })}
            />
          ) : id && ready ? (
            <Panel>
              <p className="text-[0.875rem] text-ink-2">
                Tego zgłoszenia już nie ma.{" "}
                <Link to="/usterki" className="font-medium text-green-ink hover:underline">
                  Wróć do listy
                </Link>
              </p>
            </Panel>
          ) : (
            <Panel className="hidden lg:block">
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <ChatCircleText size={28} className="text-ink-3" />
                <p className="text-[0.875rem] text-ink-2">Wybierz zgłoszenie z listy, żeby zobaczyć rozmowę.</p>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <NewIssueSheet open={creating} onClose={closeNew} onCreated={(newId) => navigate(`/usterki/${newId}`, { replace: true })} />
    </>
  );
}

function IssueRow({
  issue,
  index,
  active,
  unread,
  plate,
  who,
}: {
  issue: Issue;
  index: number;
  active: boolean;
  unread: boolean;
  plate: string | undefined;
  who: string | null;
}) {
  const down = issue.urgent && issue.status !== "resolved";
  return (
    <li style={{ "--i": index } as CSSProperties} className="stagger-item border-b border-line last:border-b-0">
      <Link
        to={`/usterki/${issue.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-start gap-3 px-4 py-3 transition-colors duration-150 md:px-5",
          active ? "bg-green-soft/70" : "hover:bg-sunken/70",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            down ? "bg-red-soft text-red" : issue.status === "resolved" ? "bg-green-soft text-green-ink" : "bg-sunken text-ink-2",
          )}
          aria-hidden="true"
        >
          {down ? <Warning size={16} weight="fill" /> : issue.status === "resolved" ? <CheckCircle size={16} weight="fill" /> : <Wrench size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {plate ? <Plate>{plate}</Plate> : <span className="text-[0.75rem] text-ink-3">auto usunięte</span>}
            <span className="num ml-auto shrink-0 text-[0.75rem] text-ink-3">{when(issue.lastMessageAt)}</span>
          </span>
          <span className={cn("mt-1 block truncate text-[0.875rem]", unread ? "font-semibold text-ink" : "text-ink")}>
            {issue.title}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <Badge tone={down ? "red" : STATUS_TONE[issue.status]}>{down ? "Auto stoi" : STATUS_LABEL[issue.status]}</Badge>
            {who ? <span className="min-w-0 truncate text-[0.75rem] text-ink-3">{who}</span> : null}
            {unread ? (
              <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-green" aria-label="Nowa wiadomość" />
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Thread({
  issue,
  side,
  plate,
  reporter,
  onGone,
}: {
  issue: Issue;
  side: Side;
  plate: string | undefined;
  reporter: string;
  onGone: () => void;
}) {
  const messages = useIssues((s) => s.messages[issue.id]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    loadMessages(issue.id).catch((err) => alive && setLoadError(describeError(err)));
    /* Na wypadek braku Realtime: rozmowa odświeża się co 20 sekund, gdy jest na ekranie. */
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadMessages(issue.id).catch(() => undefined);
    }, 20_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [issue.id]);

  const count = messages?.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    void markRead(issue.id).catch(() => undefined);
  }, [count, issue.id, issue.lastMessageAt]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > 2000) {
      toast.error("Wiadomość może mieć najwyżej 2000 znaków.");
      return;
    }
    setSending(true);
    try {
      await sendMessage(issue.id, body);
      setText("");
      input.current?.focus();
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  async function setStatus(status: IssueStatus) {
    if (status === issue.status) return;
    setBusy(true);
    try {
      await updateIssue(issue.id, { status });
      toast.ok(status === "resolved" ? "Oznaczono jako naprawione." : `Stan: ${STATUS_LABEL[status].toLowerCase()}.`);
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleUrgent(urgent: boolean) {
    try {
      await updateIssue(issue.id, { urgent });
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  async function remove() {
    if (!window.confirm("Usunąć zgłoszenie razem z całą rozmową? Tego nie da się cofnąć.")) return;
    try {
      await deleteIssue(issue.id);
      toast.ok("Zgłoszenie usunięte.");
      onGone();
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  const down = issue.urgent && issue.status !== "resolved";
  const groups = groupByDay(messages ?? []);

  return (
    <section className="enter flex flex-col overflow-hidden rounded-panel border border-line bg-surface lg:h-[calc(100dvh-8rem)] lg:min-h-[30rem]">
      <header className="shrink-0 border-b border-line px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <Link
            to="/usterki"
            aria-label="Wróć do listy"
            className="press -ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-sunken lg:hidden"
          >
            <CaretLeft size={18} />
          </Link>
          {plate ? <Plate>{plate}</Plate> : null}
          <Badge tone={down ? "red" : STATUS_TONE[issue.status]}>{down ? "Auto stoi" : STATUS_LABEL[issue.status]}</Badge>
          {side === "admin" ? (
            <button
              type="button"
              onClick={() => void remove()}
              aria-label="Usuń zgłoszenie"
              title="Usuń zgłoszenie"
              className="press ml-auto flex h-9 w-9 items-center justify-center rounded-control text-ink-3 hover:bg-red-soft hover:text-red"
            >
              <Trash size={17} />
            </button>
          ) : null}
        </div>
        <h2 className="mt-2 text-[1.0625rem] leading-snug font-semibold text-ink">{issue.title}</h2>
        <p className="mt-0.5 text-[0.75rem] text-ink-3">
          Zgłosił: {reporter} · {dayLong.format(new Date(issue.createdAt))}, {time.format(new Date(issue.createdAt))}
          {issue.resolvedAt ? ` · naprawione ${day.format(new Date(issue.resolvedAt))}` : ""}
        </p>
        {side === "admin" ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="w-full sm:w-auto">
              <Segmented
                label="Stan naprawy"
                value={issue.status}
                onChange={(v) => void setStatus(v)}
                options={[
                  { value: "open", label: STATUS_LABEL.open },
                  { value: "progress", label: STATUS_LABEL.progress },
                  { value: "resolved", label: STATUS_LABEL.resolved },
                ]}
              />
            </div>
            <label className="flex items-center gap-2 text-[0.8125rem] text-ink-2">
              <input
                type="checkbox"
                checked={issue.urgent}
                onChange={(e) => void toggleUrgent(e.target.checked)}
                disabled={busy}
                className="h-4 w-4"
              />
              Auto nie nadaje się do jazdy
            </label>
          </div>
        ) : null}
      </header>

      <div className="min-h-[16rem] flex-1 overflow-y-auto px-4 py-4 md:px-5" aria-live="polite">
        {loadError ? (
          <p className="text-[0.875rem] text-red">{loadError}</p>
        ) : !messages ? (
          <div className="flex justify-center py-8 text-ink-3">
            <Spinner />
          </div>
        ) : (
          groups.map(([date, list]) => (
            <div key={date} className="mb-2">
              <div className="my-3 flex items-center gap-3 text-[0.6875rem] font-medium text-ink-3">
                <span className="h-px flex-1 bg-line" />
                {dayLong.format(new Date(list[0].createdAt))}
                <span className="h-px flex-1 bg-line" />
              </div>
              {list.map((m, i) => (
                <Bubble key={m.id} m={m} first={i === 0 || list[i - 1].authorRole !== m.authorRole} />
              ))}
            </div>
          ))
        )}
        <div ref={end} />
      </div>

      <footer className="shrink-0 border-t border-line bg-surface px-3 py-3 md:px-4">
        {issue.status === "resolved" && side === "driver" ? (
          <p className="mb-2 px-1 text-[0.75rem] text-ink-3">
            Szef oznaczył usterkę jako naprawioną. Jeśli problem wrócił, napisz, a zgłoszenie otworzy się ponownie.
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            rows={Math.min(5, Math.max(1, text.split("\n").length))}
            maxLength={2000}
            placeholder="Napisz wiadomość…"
            aria-label="Wiadomość"
            className="min-h-10 w-full resize-none rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-green focus:shadow-[0_0_0_3px_var(--color-green-soft)] md:text-[0.9375rem]"
          />
          <Button variant="primary" onClick={() => void send()} disabled={!text.trim() || sending} aria-label="Wyślij">
            {sending ? <Spinner /> : <PaperPlaneRight size={17} weight="fill" />}
            <span className="max-sm:hidden">Wyślij</span>
          </Button>
        </div>
      </footer>
    </section>
  );
}

function groupByDay(list: Message[]): Array<[string, Message[]]> {
  const out = new Map<string, Message[]>();
  for (const m of list) {
    const k = toIso(new Date(m.createdAt));
    out.set(k, [...(out.get(k) ?? []), m]);
  }
  return [...out.entries()];
}

function Bubble({ m, first }: { m: Message; first: boolean }) {
  return (
    <div className={cn("flex flex-col", m.mine ? "items-end" : "items-start", first ? "mt-3" : "mt-1")}>
      {first ? (
        <span className="mb-1 px-1 text-[0.6875rem] font-medium text-ink-3">
          {m.mine ? "Ty" : m.authorName || (m.authorRole === "admin" ? "Szef floty" : "Kierowca")}
        </span>
      ) : null}
      <div
        className={cn(
          "max-w-[min(34rem,85%)] rounded-[14px] px-3.5 py-2 text-[0.9375rem] leading-snug break-words whitespace-pre-wrap",
          m.mine ? "rounded-br-[4px] bg-green text-white" : "rounded-bl-[4px] bg-sunken text-ink",
        )}
      >
        {m.body}
        <span className={cn("num ml-2 inline-block translate-y-px text-[0.6875rem]", m.mine ? "text-white/75" : "text-ink-3")}>
          {time.format(new Date(m.createdAt))}
        </span>
      </div>
    </div>
  );
}

/** Formularz zgłoszenia: auto, co się dzieje, opis i czy auto stoi. */
function NewIssueSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const vehicles = useFleet((s) => s.vehicles);
  const schedule = useFleet((s) => s.schedule);
  const meId = useSession((s) => s.meId);
  const [vehicleId, setVehicleId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* Kierowca: domyślnie auto, na którym jeździ dziś albo najczęściej w tym tygodniu. */
  useEffect(() => {
    if (!open) return;
    const today = toIso(new Date());
    const todayCar = meId ? schedule.find((a) => a.driverId === meId && a.date === today)?.vehicleId : undefined;
    const weekCar = meId ? mainVehicle(schedule, currentWeek(), meId) : null;
    setVehicleId(todayCar ?? weekCar ?? vehicles[0]?.id ?? "");
    setTitle("");
    setBody("");
    setUrgent(false);
    setProblem(null);
  }, [open, meId, schedule, vehicles]);

  async function submit() {
    if (!vehicleId) return setProblem("Wybierz auto.");
    if (title.trim().length < 3) return setProblem("Napisz krótko, co się dzieje (co najmniej 3 znaki).");
    if (!body.trim()) return setProblem("Opisz usterkę: kiedy się zaczęło i co dokładnie się dzieje.");
    setSaving(true);
    setProblem(null);
    try {
      const id = await createIssue({ vehicleId, title, body, urgent });
      toast.ok("Zgłoszenie wysłane do szefa floty.");
      onCreated(id);
    } catch (err) {
      setProblem(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...vehicles].sort((a, b) => a.plate.localeCompare(b.plate));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Zgłoś usterkę"
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? <Spinner /> : <PaperPlaneRight size={16} weight="fill" />}
            Wyślij zgłoszenie
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Anuluj
          </Button>
          {problem ? (
            <p role="alert" className="w-full text-[0.8125rem] text-red">
              {problem}
            </p>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Auto">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {sorted.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
                {v.model ? `, ${v.model}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Co się dzieje?" hint="Krótko, np. „Stuka przednie zawieszenie”.">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Krótki opis usterki" />
        </Field>
        <Field label="Szczegóły" hint="Kiedy się zaczęło, co słychać albo widać, czy kontrolka się świeci.">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={2000}
            className="w-full resize-y rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-green focus:shadow-[0_0_0_3px_var(--color-green-soft)] md:text-[0.9375rem]"
            placeholder="Opisz, co się dzieje z autem"
          />
        </Field>
        <Toggle
          checked={urgent}
          onChange={setUrgent}
          label="Auto nie nadaje się do jazdy"
          hint="Zaznacz, gdy nie da się bezpiecznie jeździć. Szef zobaczy zgłoszenie na górze listy."
        />
      </div>
    </Sheet>
  );
}
