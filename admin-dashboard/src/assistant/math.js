// A small, safe calculator for "what is 17x23" style questions. It tokenises and
// parses the expression itself (recursive descent); nothing is ever evaluated as code.
import { numberWords } from "./entities.js";

const WORD_OPS = [
  [/\bmultiplied by\b|\btimes\b/g, " * "],
  [/\bdivided by\b|\bover\b/g, " / "],
  [/\bplus\b|\badd\b/g, " + "],
  [/\bminus\b|\btake away\b|\bsubtract\b/g, " - "],
  [/\bto the power of\b|\bpower\b/g, " ^ "],
  [/\bsquared\b/g, " ^ 2 "],
  [/\bcubed\b/g, " ^ 3 "],
  [/\bsquare root of\b|\bsqrt\b|\broot of\b/g, " r "],
  [/\bpercent of\b|% of\b/g, " % "],
];
// Words allowed around a sum ("what is", "calculate", "please").
const FILLER = new Set(["what", "whats", "is", "calculate", "compute", "work", "out", "how", "much", "solve", "please", "the", "answer", "to", "equals", "equal", "can", "you", "tell", "me", "quick", "maths", "math", "question", "s", "of"]);

function tokenize(src) {
  const out = [];
  const re = /\s*(\d+(?:\.\d+)?|\.\d+|[-+*/^()%r])/y;
  let m;
  let at = 0;
  while (at < src.length) {
    if (/\s/.test(src[at])) { at++; continue; }
    re.lastIndex = at;
    m = re.exec(src);
    if (!m) return null;
    out.push(m[1]);
    at = re.lastIndex;
  }
  return out;
}

// expr := term (('+'|'-') term)* ; term := power (('*'|'/'|'%') power)* ; power := unary ('^' power)? ;
// unary := ('-'|'+'|'r') unary | '(' expr ')' | number.  "a % b" means a percent of b.
function parse(tokens) {
  let i = 0;
  let depth = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  function expr() {
    let v = term();
    while (peek() === "+" || peek() === "-") v = take() === "+" ? v + term() : v - term();
    return v;
  }
  function term() {
    let v = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = take();
      const r = power();
      if (op === "*") v *= r;
      else if (op === "%") v = (v / 100) * r;
      else { if (r === 0) throw new Error("zero"); v /= r; }
    }
    return v;
  }
  function power() {
    const base = unary();
    if (peek() === "^") { take(); return base ** power(); }
    return base;
  }
  function unary() {
    if (++depth > 40) throw new Error("deep");
    const t = take();
    let v;
    if (t === "-") v = -unary();
    else if (t === "+") v = unary();
    else if (t === "r") { const x = unary(); if (x < 0) throw new Error("root"); v = Math.sqrt(x); }
    else if (t === "(") { v = expr(); if (take() !== ")") throw new Error("paren"); }
    else if (t !== undefined && /^[\d.]/.test(t)) v = Number(t);
    else throw new Error("syntax");
    depth--;
    return v;
  }
  const v = expr();
  if (i !== tokens.length) throw new Error("syntax");
  return v;
}

// { expr, value } for a maths question, { expr, error } for one that can't be worked out,
// or null when the text isn't a sum at all.
export function parseMath(raw) {
  let s = String(raw || "").toLowerCase().replace(/[×x✕](?=\s*[\d(.])/g, " * ").replace(/÷/g, " / ").replace(/,(?=\d{3}\b)/g, "");
  s = numberWords(s.replace(/[^a-z0-9.+\-*/^()%×÷ ]+/g, " ").replace(/\s+/g, " ").trim());
  for (const [re, op] of WORD_OPS) s = s.replace(re, op);
  if (s.length > 80) return null;
  const words = s.match(/[a-z]+/g) || [];
  if (words.some((w) => w !== "r" && !FILLER.has(w))) return null;
  const expr = s.replace(/[a-z]+/g, (w) => (w === "r" ? " r " : " ")).replace(/\s+/g, " ").trim();
  const tokens = tokenize(expr);
  if (!tokens || !tokens.some((t) => /^[-+*/^%r]$/.test(t)) || tokens.filter((t) => /^[\d.]/.test(t)).length < 1) return null;
  if (!tokens.some((t) => /^[*/^%r+]$/.test(t)) && !/\d\s*-\s*[\d(]/.test(expr)) return null; // "-5" alone isn't a sum
  const shown = expr.replace(/\*/g, "×").replace(/\//g, "÷").replace(/\br\b/g, "√").replace(/\s+/g, " ");
  try {
    const value = parse(tokens);
    if (!Number.isFinite(value) || Math.abs(value) >= 1e15) return { expr: shown, error: "big" };
    return { expr: shown, value };
  } catch (e) {
    return { expr: shown, error: e.message };
  }
}

export const formatNumber = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 6 });
