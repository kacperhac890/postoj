import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useFleet } from "../store/useFleet";
import { describeError, supabase } from "./cloud";
import { useSession } from "./session";

/* Usterki aut: zgłoszenie kierowcy i rozmowa z szefem floty.
   Na koncie w bazie: tabele postoj_issues i postoj_issue_messages, autora
   i podpis wiadomości ustawia baza. Bez konta (gość, wersja bez bazy):
   wszystko w tej przeglądarce, użytkownik jest szefem floty. */

export type IssueStatus = "open" | "progress" | "resolved";
export type Side = "admin" | "driver";

export interface Issue {
  id: string;
  vehicleId: string;
  driverId: string | null;
  title: string;
  /** Auto nie nadaje się do jazdy. */
  urgent: boolean;
  status: IssueStatus;
  createdAt: string;
  lastMessageAt: string;
  lastAuthor: Side;
  resolvedAt: string | null;
}

export interface Message {
  id: string;
  issueId: string;
  authorRole: Side;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Zgłoszone",
  progress: "W naprawie",
  resolved: "Naprawione",
};

interface IssuesState {
  ready: boolean;
  error: string | null;
  issues: Issue[];
  messages: Record<string, Message[]>;
  /** Kiedy użytkownik ostatnio przeczytał rozmowę. */
  reads: Record<string, string>;
}

export const useIssues = create<IssuesState>(() => ({
  ready: false,
  error: null,
  issues: [],
  messages: {},
  reads: {},
}));

const isCloudMode = () => useSession.getState().mode === "cloud" && Boolean(supabase);

/** Czy w rozmowie jest coś nowego od drugiej strony. */
export function isUnread(issue: Issue, reads: Record<string, string>, side: Side) {
  if (issue.lastAuthor === side) return false;
  const read = reads[issue.id];
  return !read || read < issue.lastMessageAt;
}

export function useUnreadCount() {
  const issues = useIssues((s) => s.issues);
  const reads = useIssues((s) => s.reads);
  const role = useSession((s) => s.role);
  const side: Side = role === "admin" ? "admin" : "driver";
  return issues.filter((i) => isUnread(i, reads, side)).length;
}

/* ------------------------------------------------------------------
   Przeglądarka (gość i wersja bez bazy)
   ------------------------------------------------------------------ */

const LOCAL_KEY = "postoj-usterki-v1";

interface LocalData {
  issues: Issue[];
  messages: Message[];
  reads: Record<string, string>;
  seeded: boolean;
}

function readLocal(): LocalData {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<LocalData>;
      return {
        issues: Array.isArray(d.issues) ? d.issues : [],
        messages: Array.isArray(d.messages) ? d.messages : [],
        reads: d.reads && typeof d.reads === "object" ? d.reads : {},
        seeded: Boolean(d.seeded),
      };
    }
  } catch {
    /* Uszkodzony wpis albo brak dostępu do pamięci: zaczynamy od zera. */
  }
  return { issues: [], messages: [], reads: {}, seeded: false };
}

function writeLocal(d: LocalData) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
  } catch {
    /* Prywatne okno: zgłoszenia zostają do odświeżenia strony. */
  }
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** Przykładowe zgłoszenia do danych przykładowych, żeby było widać, jak wygląda rozmowa. */
function demoIssues(): Pick<LocalData, "issues" | "messages"> {
  const { vehicles, drivers } = useFleet.getState();
  const cars = vehicles.filter((v) => v.status === "active");
  const people = drivers.filter((d) => d.active);
  if (cars.length < 2 || people.length < 2) return { issues: [], messages: [] };
  const a: Issue = {
    id: newId(),
    vehicleId: cars[0].id,
    driverId: people[0].id,
    title: "Kontrolka ciśnienia w oponach",
    urgent: false,
    status: "progress",
    createdAt: ago(60 * 26),
    lastMessageAt: ago(60 * 25),
    lastAuthor: "admin",
    resolvedAt: null,
  };
  const b: Issue = {
    id: newId(),
    vehicleId: cars[1].id,
    driverId: people[1].id,
    title: "Auto nie odpala po nocce",
    urgent: true,
    status: "open",
    createdAt: ago(35),
    lastMessageAt: ago(34),
    lastAuthor: "driver",
    resolvedAt: null,
  };
  const msg = (issue: Issue, side: Side, name: string, body: string, minutes: number): Message => ({
    id: newId(),
    issueId: issue.id,
    authorRole: side,
    authorName: name,
    body,
    createdAt: ago(minutes),
    mine: side === "admin",
  });
  return {
    issues: [a, b],
    messages: [
      msg(a, "driver", people[0].name, "Od rana świeci kontrolka ciśnienia. Lewa tylna wygląda na trochę miękką.", 60 * 26),
      msg(a, "admin", "Szef floty", "Po zmianie podjedź na wulkanizację na Gdańskiej, płacę przelewem. Daj znać, co powiedzieli.", 60 * 25),
      msg(b, "driver", people[1].name, "Rano po nocce kręci, ale nie zapala. Akumulator chyba padł. Auto stoi pod domem.", 35),
      msg(b, "driver", people[1].name, "Dniówka nie ma czym wyjechać.", 34),
    ],
  };
}

function loadLocal() {
  let d = readLocal();
  if (!d.seeded && useFleet.getState().demo) {
    d = { ...d, ...demoIssues(), seeded: true };
    writeLocal(d);
  }
  publishLocal(d);
}

function publishLocal(d: LocalData) {
  /* Zgłoszenia usuniętych aut znikają, jak w bazie (klucz obcy z kaskadą). */
  const cars = new Set(useFleet.getState().vehicles.map((v) => v.id));
  const issues = d.issues.filter((i) => cars.has(i.vehicleId)).sort((x, y) => y.lastMessageAt.localeCompare(x.lastMessageAt));
  const messages: Record<string, Message[]> = {};
  for (const m of d.messages) (messages[m.issueId] ??= []).push(m);
  useIssues.setState({ ready: true, error: null, issues, messages, reads: d.reads });
}

function mutateLocal(fn: (d: LocalData) => LocalData) {
  const d = fn(readLocal());
  writeLocal(d);
  publishLocal(d);
}

/* ------------------------------------------------------------------
   Baza
   ------------------------------------------------------------------ */

type IssueRow = {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  title: string;
  urgent: boolean;
  status: IssueStatus;
  created_at: string;
  last_message_at: string;
  last_author: Side;
  resolved_at: string | null;
};

type MessageRow = {
  id: string;
  issue_id: string;
  author: string | null;
  author_role: Side;
  author_name: string;
  body: string;
  created_at: string;
};

const ISSUE_COLS = "id, vehicle_id, driver_id, title, urgent, status, created_at, last_message_at, last_author, resolved_at";
const MESSAGE_COLS = "id, issue_id, author, author_role, author_name, body, created_at";

const toIssue = (r: IssueRow): Issue => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  driverId: r.driver_id,
  title: r.title,
  urgent: r.urgent,
  status: r.status,
  createdAt: r.created_at,
  lastMessageAt: r.last_message_at,
  lastAuthor: r.last_author,
  resolvedAt: r.resolved_at,
});

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  issueId: r.issue_id,
  authorRole: r.author_role,
  authorName: r.author_name,
  body: r.body,
  createdAt: r.created_at,
  mine: r.author !== null && r.author === useSession.getState().user?.id,
});

function db() {
  if (!supabase) throw new Error("Baza danych nie jest skonfigurowana.");
  return supabase;
}

async function loadCloud() {
  const [issues, reads] = await Promise.all([
    db().from("postoj_issues").select(ISSUE_COLS).order("last_message_at", { ascending: false }).limit(500),
    db().from("postoj_issue_reads").select("issue_id, read_at"),
  ]);
  if (issues.error) throw issues.error;
  if (reads.error) throw reads.error;
  useIssues.setState({
    ready: true,
    error: null,
    issues: (issues.data as IssueRow[]).map(toIssue),
    reads: Object.fromEntries((reads.data as Array<{ issue_id: string; read_at: string }>).map((r) => [r.issue_id, r.read_at])),
  });
}

/* ------------------------------------------------------------------
   Akcje (te same dla bazy i przeglądarki)
   ------------------------------------------------------------------ */

export async function loadIssues() {
  if (!isCloudMode()) {
    loadLocal();
    return;
  }
  try {
    await loadCloud();
  } catch (err) {
    useIssues.setState({ ready: true, error: describeError(err) });
  }
}

export async function loadMessages(issueId: string) {
  if (!isCloudMode()) return;
  const { data, error } = await db()
    .from("postoj_issue_messages")
    .select(MESSAGE_COLS)
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  useIssues.setState((s) => ({ messages: { ...s.messages, [issueId]: (data as MessageRow[]).map(toMessage) } }));
}

export interface NewIssue {
  vehicleId: string;
  title: string;
  body: string;
  urgent: boolean;
}

/** Zgłoszenie z pierwszą wiadomością. Zwraca identyfikator zgłoszenia. */
export async function createIssue(input: NewIssue): Promise<string> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!isCloudMode()) {
    const id = newId();
    const now = new Date().toISOString();
    mutateLocal((d) => ({
      ...d,
      issues: [
        ...d.issues,
        {
          id,
          vehicleId: input.vehicleId,
          driverId: null,
          title,
          urgent: input.urgent,
          status: "open",
          createdAt: now,
          lastMessageAt: now,
          lastAuthor: "admin",
          resolvedAt: null,
        },
      ],
      messages: [
        ...d.messages,
        { id: newId(), issueId: id, authorRole: "admin", authorName: "Szef floty", body, createdAt: now, mine: true },
      ],
      reads: { ...d.reads, [id]: now },
    }));
    return id;
  }
  const owner = useSession.getState().fleetOwner;
  if (!owner) throw new Error("Konto nie jest przypisane do żadnej floty.");
  const { data, error } = await db()
    .from("postoj_issues")
    .insert({ owner, vehicle_id: input.vehicleId, title, urgent: input.urgent })
    .select(ISSUE_COLS)
    .single();
  if (error) throw error;
  const issue = toIssue(data as IssueRow);
  useIssues.setState((s) => ({ issues: [issue, ...s.issues.filter((i) => i.id !== issue.id)] }));
  await sendMessage(issue.id, body);
  return issue.id;
}

export async function sendMessage(issueId: string, text: string) {
  const body = text.trim();
  if (!body) return;
  if (!isCloudMode()) {
    const now = new Date().toISOString();
    mutateLocal((d) => ({
      ...d,
      issues: d.issues.map((i) => (i.id === issueId ? { ...i, lastMessageAt: now, lastAuthor: "admin" } : i)),
      messages: [
        ...d.messages,
        { id: newId(), issueId, authorRole: "admin", authorName: "Szef floty", body, createdAt: now, mine: true },
      ],
      reads: { ...d.reads, [issueId]: now },
    }));
    return;
  }
  const { data, error } = await db().from("postoj_issue_messages").insert({ issue_id: issueId, body }).select(MESSAGE_COLS).single();
  if (error) throw error;
  addMessage(toMessage(data as MessageRow));
  /* Stan zgłoszenia (np. ponowne otwarcie po odpowiedzi kierowcy) zmienia baza. */
  void refreshIssue(issueId);
}

function addMessage(m: Message) {
  useIssues.setState((s) => {
    const list = s.messages[m.issueId];
    if (list?.some((x) => x.id === m.id)) return s;
    return {
      messages: list ? { ...s.messages, [m.issueId]: [...list, m] } : s.messages,
      issues: s.issues
        .map((i) => (i.id === m.issueId ? { ...i, lastMessageAt: m.createdAt, lastAuthor: m.authorRole } : i))
        .sort((x, y) => y.lastMessageAt.localeCompare(x.lastMessageAt)),
      reads: m.mine ? { ...s.reads, [m.issueId]: m.createdAt } : s.reads,
    };
  });
}

async function refreshIssue(issueId: string) {
  const { data } = await db().from("postoj_issues").select(ISSUE_COLS).eq("id", issueId).maybeSingle();
  if (!data) return;
  const fresh = toIssue(data as IssueRow);
  useIssues.setState((s) => ({ issues: s.issues.map((i) => (i.id === issueId ? fresh : i)) }));
}

export async function updateIssue(issueId: string, patch: Partial<Pick<Issue, "status" | "urgent">>) {
  if (!isCloudMode()) {
    mutateLocal((d) => ({
      ...d,
      issues: d.issues.map((i) =>
        i.id === issueId
          ? {
              ...i,
              ...patch,
              resolvedAt:
                patch.status === "resolved" ? (i.resolvedAt ?? new Date().toISOString()) : patch.status ? null : i.resolvedAt,
            }
          : i,
      ),
    }));
    return;
  }
  const { data, error } = await db().from("postoj_issues").update(patch).eq("id", issueId).select(ISSUE_COLS).single();
  if (error) throw error;
  const fresh = toIssue(data as IssueRow);
  useIssues.setState((s) => ({ issues: s.issues.map((i) => (i.id === issueId ? fresh : i)) }));
}

export async function deleteIssue(issueId: string) {
  if (!isCloudMode()) {
    mutateLocal((d) => ({
      ...d,
      issues: d.issues.filter((i) => i.id !== issueId),
      messages: d.messages.filter((m) => m.issueId !== issueId),
    }));
    return;
  }
  const { error } = await db().from("postoj_issues").delete().eq("id", issueId);
  if (error) throw error;
  useIssues.setState((s) => ({ issues: s.issues.filter((i) => i.id !== issueId) }));
}

export async function markRead(issueId: string) {
  const issue = useIssues.getState().issues.find((i) => i.id === issueId);
  if (!issue) return;
  const at = issue.lastMessageAt > new Date().toISOString() ? issue.lastMessageAt : new Date().toISOString();
  const prev = useIssues.getState().reads[issueId];
  if (prev && prev >= issue.lastMessageAt) return;
  useIssues.setState((s) => ({ reads: { ...s.reads, [issueId]: at } }));
  if (!isCloudMode()) {
    mutateLocal((d) => ({ ...d, reads: { ...d.reads, [issueId]: at } }));
    return;
  }
  await db().from("postoj_issue_reads").upsert({ issue_id: issueId, read_at: at }, { onConflict: "user_id,issue_id" });
}

/* ------------------------------------------------------------------
   Na żywo: Supabase Realtime, a na wypadek jego braku co minutę lista
   ------------------------------------------------------------------ */

let channel: RealtimeChannel | null = null;
let timer: number | null = null;
let reloadSoon: number | null = null;

const scheduleReload = () => {
  if (reloadSoon !== null) return;
  reloadSoon = window.setTimeout(() => {
    reloadSoon = null;
    void loadIssues();
  }, 400);
};

export function startIssuesLive() {
  stopIssuesLive();
  void loadIssues();
  if (!isCloudMode()) return;
  channel = db()
    .channel("postoj-usterki")
    .on("postgres_changes", { event: "*", schema: "public", table: "postoj_issues" }, scheduleReload)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "postoj_issue_messages" }, (payload) => {
      addMessage(toMessage(payload.new as MessageRow));
      scheduleReload();
    })
    .subscribe();
  timer = window.setInterval(() => {
    if (document.visibilityState === "visible") void loadIssues();
  }, 60_000);
}

export function stopIssuesLive() {
  if (channel) void db().removeChannel(channel);
  channel = null;
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  useIssues.setState({ ready: false, error: null, issues: [], messages: {}, reads: {} });
}
