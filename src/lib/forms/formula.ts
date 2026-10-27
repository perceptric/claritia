// Calculated fields (docs/forms-plan.md 2.3): a small formula language read by our own parser, never eval. Numbers,
// + - * /, comparisons, and, or, min, max, round, abs, if, ifempty, and other fields as {id}. An empty field is
// null, and null carries through: 5 + {empty} is empty, so is anything divided by zero. Runs in the browser (the
// form script, so it stays small) and on the server, which works every calc out again from the answers.

export type Ast = number | string | [string, ...Ast[]];

const FNS = ["min", "max", "round", "abs", "if", "ifempty"];
const ID = /^[a-z0-9]{1,24}$/;

/** Read a formula. Returns the tree and the field ids it reads, or the first problem in plain words. */
export function parseFormula(src: string): { ast: Ast; refs: string[] } | { error: string } {
  if (src.length > 500) return { error: "Keep the formula under 500 characters." };
  const toks = src.match(/\s+|\d+(?:\.\d+)?|\.\d+|\{[^}]*\}|[a-z]+|<=|>=|==|!=|[-+*/(),<>]|./gi)?.filter((t) => t.trim()) ?? [];
  const refs = new Set<string>();
  let i = 0;
  let depth = 0;
  const fail = (m: string): never => {
    throw new Error(m);
  };
  const peek = () => toks[i];
  const take = (t?: string) => {
    const x = toks[i];
    if (t !== undefined && x !== t) fail(x === undefined ? `Add "${t}" at the end.` : `Expected "${t}" before "${x}".`);
    i++;
    return x;
  };
  const bin = (next: () => Ast, ops: string[]) => (): Ast => {
    let a = next();
    while (ops.includes(peek()?.toLowerCase() ?? "")) {
      const op = take()!.toLowerCase();
      a = [op, a, next()];
    }
    return a;
  };
  const primary = (): Ast => {
    if (++depth > 40) fail("The formula nests too deep.");
    const t = take();
    let out: Ast;
    if (t === undefined) fail("The formula ends too soon.");
    else if (/^\d|^\./.test(t)) out = Number(t);
    else if (t === "-") out = ["neg", primary()];
    else if (t === "(") {
      out = or();
      take(")");
    } else if (t[0] === "{") {
      const id = t.slice(1, -1).trim();
      if (!ID.test(id)) fail(`${t} isn't a field.`);
      refs.add(id);
      out = id;
    } else if (FNS.includes(t.toLowerCase())) {
      const args: Ast[] = [];
      take("(");
      if (peek() !== ")") for (args.push(or()); peek() === ","; take(), args.push(or()));
      take(")");
      const name = t.toLowerCase();
      const n = args.length;
      if ((name === "if" && n !== 3) || (name === "ifempty" && n !== 2) || (name === "abs" && n !== 1) || (name === "round" && (n < 1 || n > 2)) || n < 1)
        fail(`${name} takes ${name === "if" ? "3 parts" : name === "ifempty" ? "2 parts" : name === "abs" ? "1 part" : name === "round" ? "1 or 2 parts" : "at least 1 part"}.`);
      out = [name, ...args];
    } else out = fail(`"${t}" isn't part of a formula.`);
    depth--;
    return out!;
  };
  const mul = bin(primary, ["*", "/"]);
  const add = bin(mul, ["+", "-"]);
  const cmp = bin(add, ["<", "<=", ">", ">=", "==", "!="]);
  const and = bin(cmp, ["and"]);
  const or = bin(and, ["or"]);
  try {
    if (!toks.length) return { error: "Write a formula." };
    const ast = or();
    if (i < toks.length) fail(`"${toks[i]}" doesn't fit there.`);
    return { ast, refs: [...refs] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Work a formula out. `get` gives a field's number, or null when it's empty. */
export function evalFormula(ast: Ast, get: (id: string) => number | null): number | null {
  const v = (a: Ast): number | null => {
    if (typeof a === "number") return a;
    if (typeof a === "string") return get(a);
    const [op, ...xs] = a;
    if (op === "if") {
      const c = v(xs[0]!);
      return c ? v(xs[1]!) : v(xs[2]!);
    }
    if (op === "ifempty") return v(xs[0]!) ?? v(xs[1]!);
    const n = xs.map(v);
    if (op === "min" || op === "max") {
      const ok = n.filter((x): x is number => x !== null);
      return ok.length ? Math[op](...ok) : null;
    }
    if (n.some((x) => x === null)) return null;
    const [x, y] = n as number[];
    switch (op) {
      case "neg":
        return -x!;
      case "abs":
        return Math.abs(x!);
      case "round": {
        const p = 10 ** Math.max(0, Math.min(6, Math.round(y ?? 0)));
        return Math.round(x! * p) / p;
      }
      case "+":
        return x! + y!;
      case "-":
        return x! - y!;
      case "*":
        return x! * y!;
      case "/":
        return y === 0 ? null : x! / y!;
      case "<":
        return +(x! < y!);
      case "<=":
        return +(x! <= y!);
      case ">":
        return +(x! > y!);
      case ">=":
        return +(x! >= y!);
      case "==":
        return +(x === y);
      case "!=":
        return +(x !== y);
      case "and":
        return +(!!x && !!y);
      case "or":
        return +(!!x || !!y);
    }
    return null;
  };
  const out = v(ast);
  return out === null || !Number.isFinite(out) ? null : out;
}

/** A calc's result as the form and Results show it: money in its currency, a percent sign, or a plain number. */
export function calcText(c: { format?: "number" | "money" | "percent"; decimals?: number; currency?: string } | undefined, n: unknown): string {
  if (typeof n !== "number") return "—";
  const opts: Intl.NumberFormatOptions = { maximumFractionDigits: c?.decimals ?? 2, ...(c?.decimals !== undefined ? { minimumFractionDigits: c.decimals } : {}) };
  try {
    if (c?.format === "money") return n.toLocaleString(undefined, { ...opts, style: "currency", currency: c.currency ?? "USD" });
  } catch {}
  return n.toLocaleString(undefined, opts) + (c?.format === "percent" ? "%" : "");
}
