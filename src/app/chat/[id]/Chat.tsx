"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Plan = { pickup: string; time: string; booker: "proposer" | "partner"; split: string };

export type Message = {
  id: string;
  sender_id: string;
  kind: "text" | "plan";
  body: string;
  plan: Plan | null;
  plan_status: "proposed" | "accepted" | "superseded" | null;
  created_at: string;
};

const QUICK_REPLIES = ["Sounds good!", "I'm at the pickup point", "Running 10 min late", "Where exactly are you?"];

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function Chat({
  requestId,
  userId,
  initialMessages,
  confirmed,
  partnerName,
  defaultTime,
}: {
  requestId: string;
  userId: string;
  initialMessages: Message[];
  confirmed: boolean;
  partnerName: string;
  defaultTime: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [time, setTime] = useState(() => toLocalInput(defaultTime));
  const [booker, setBooker] = useState<Plan["booker"]>("proposer");
  const bottom = useRef<HTMLDivElement>(null);

  // New messages and plan updates arrive live.
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${requestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` }, (payload) => {
        const row = payload.new as Message;
        setMessages((prev) => {
          const others = prev.filter((m) => m.id !== row.id);
          return [...others, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "match_requests", filter: `id=eq.${requestId}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, requestId, router]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages.length]);

  async function send(body: string) {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    setText("");
    const { data, error } = await supabase
      .from("messages")
      .insert({ request_id: requestId, sender_id: userId, body: trimmed.slice(0, 1000) })
      .select("id, sender_id, kind, body, plan, plan_status, created_at")
      .single<Message>();
    if (error || !data) return setError("Message not sent. Try again.");
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
  }

  async function proposePlan(e: React.FormEvent) {
    e.preventDefault();
    const plan: Plan = { pickup: pickup.trim().slice(0, 200), time: new Date(time).toISOString(), booker, split: "50/50" };
    const { error } = await supabase.rpc("propose_plan", { p_request_id: requestId, p_plan: plan });
    if (error) return setError(error.message);
    setPlanOpen(false);
    router.refresh();
  }

  async function acceptPlan(messageId: string) {
    const { error } = await supabase.rpc("accept_plan", { p_message_id: messageId });
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Say hi to {partnerName} and agree where to meet. Keep chatting here; there&apos;s no need to share your number.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          if (m.kind === "plan" && m.plan) {
            const bookerName = (m.plan.booker === "proposer") === mine ? "You" : partnerName;
            return (
              <div key={m.id} className={`card space-y-1 text-sm ${m.plan_status === "superseded" ? "opacity-50" : ""}`}>
                <p className="font-semibold">{mine ? "You proposed a ride plan" : `${partnerName} proposed a ride plan`}</p>
                <p>Pickup: {m.plan.pickup}</p>
                <p>Time: {formatTime(m.plan.time)}</p>
                <p>Books the cab: {bookerName}</p>
                <p>Fare split: {m.plan.split}</p>
                {m.plan_status === "accepted" && <p className="font-semibold text-emerald-700">Accepted</p>}
                {m.plan_status === "superseded" && <p className="text-slate-500">Replaced by a newer plan</p>}
                {m.plan_status === "proposed" && !mine && !confirmed && (
                  <button onClick={() => acceptPlan(m.id)} className="btn-primary mt-2 w-full">
                    Accept plan
                  </button>
                )}
                {m.plan_status === "proposed" && mine && <p className="text-slate-500">Waiting for {partnerName} to accept</p>}
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-sky-700 text-white" : "bg-white shadow-sm"}`}>{m.body}</p>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {error && <p className="mx-4 mb-2 rounded-xl bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {!confirmed &&
        (planOpen ? (
          <form onSubmit={proposePlan} className="mx-4 mb-3 space-y-3 card">
            <p className="font-semibold">Propose a ride plan</p>
            <div>
              <label className="label" htmlFor="pickup">
                Pickup point
              </label>
              <input id="pickup" className="field" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="e.g. Indiranagar metro, gate 2" required />
            </div>
            <div>
              <label className="label" htmlFor="ptime">
                Pickup time
              </label>
              <input id="ptime" type="datetime-local" className="field" value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="booker">
                Who books the cab?
              </label>
              <select id="booker" className="field" value={booker} onChange={(e) => setBooker(e.target.value as Plan["booker"])}>
                <option value="proposer">I will</option>
                <option value="partner">{partnerName}</option>
              </select>
            </div>
            <p className="text-sm text-slate-500">The fare is split 50/50.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPlanOpen(false)} className="btn-secondary">
                Back
              </button>
              <button className="btn-primary">Send plan</button>
            </div>
          </form>
        ) : (
          <div className="px-4 pb-2">
            <button onClick={() => setPlanOpen(true)} className="btn-secondary w-full">
              Propose a ride plan
            </button>
          </div>
        ))}

      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        {QUICK_REPLIES.map((q) => (
          <button key={q} onClick={() => send(q)} className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs">
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white px-4 py-3"
      >
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={1000} />
        <button className="btn-primary" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
