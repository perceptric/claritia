"use client";

// React components for @claritia/embed: <ClaritiaForm> and <ClaritiaBook>, with the events as props.

import { createElement, useEffect, useRef, type CSSProperties } from "react";
import { bookAttributes, formAttributes, load, type BookOptions, type EventDetail, type EventName, type FormOptions } from "./index.js";

type Handlers = Partial<Record<"onReady" | "onStep" | "onOpen" | "onClose" | "onSubmitted" | "onBooked", (d: EventDetail) => void>>;
const PROPS: Record<keyof Handlers, EventName> = { onReady: "ready", onStep: "step", onOpen: "open", onClose: "close", onSubmitted: "submitted", onBooked: "booked" };

/** Each handler on its own event, from this element only; the newest handler runs without listening again. */
function useEvents(handlers: Handlers) {
  const ref = useRef<HTMLElement | null>(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const offs = (Object.keys(PROPS) as (keyof Handlers)[]).map((k) => {
      const h = (e: Event) => latest.current[k]?.(((e as CustomEvent).detail ?? {}) as EventDetail);
      el.addEventListener(`claritia:${PROPS[k]}`, h);
      return () => el.removeEventListener(`claritia:${PROPS[k]}`, h);
    });
    return () => offs.forEach((off) => off());
  }, []);
  return ref;
}

export type ClaritiaFormProps = FormOptions &
  Handlers & {
    /** The form's id, from its Share tab. */
    id: string;
    /** Popup and slider opened by a click: the button's words. */
    buttonText?: string;
    buttonClassName?: string;
    className?: string;
    style?: CSSProperties;
    /** Claritia's address, when it isn't app.tryclaritia.com. */
    host?: string;
  };

export function ClaritiaForm({ id, buttonText, buttonClassName, className, style, host, onReady, onStep, onOpen, onClose, onSubmitted, onBooked, ...o }: ClaritiaFormProps) {
  useEffect(() => {
    load(host).catch(() => undefined);
  }, [host]);
  const ref = useEvents({ onReady, onStep, onOpen, onClose, onSubmitted, onBooked });
  const attrs = formAttributes(id, o);
  const clickOpens = (o.mode === "popup" || o.mode === "slider") && (o.opens ?? "click") === "click";
  return (
    <>
      {createElement("claritia-form", { ref, className, style, ...(host ? { host } : {}), ...attrs })}
      {clickOpens ? (
        <button type="button" data-claritia-open={id} className={buttonClassName}>
          {buttonText ?? "Open the form"}
        </button>
      ) : null}
    </>
  );
}

export type ClaritiaBookProps = BookOptions & {
  /** "<workspace>/<meeting type>", from the meeting's Share. */
  type: string;
  onBooked?: (d: EventDetail) => void;
  className?: string;
  style?: CSSProperties;
  host?: string;
};

export function ClaritiaBook({ type, onBooked, className, style, host, ...o }: ClaritiaBookProps) {
  useEffect(() => {
    load(host).catch(() => undefined);
  }, [host]);
  const ref = useEvents({ onBooked });
  return createElement("claritia-book", { ref, className, style, ...bookAttributes(type, o) });
}
