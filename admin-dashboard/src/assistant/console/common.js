// Helpers shared by the Console Assistant's intent files. Pure JS.
import { bullets, customerViews, empty, hasMore, leadViews, lotViews, sourced, vary } from "./data.js";

// A data answer: the "nothing loaded" variants, or `fn`.
export const withData = (fn) => (ctx, ent) => empty(ctx) || fn(ctx, ent);

const pick = (ctx, xs) => xs[Math.floor((ctx.random || Math.random)() * xs.length) % xs.length];
export { pick };

// "Which customer?" with real names as chips.
export function askCustomer(ctx, verb, chip) {
  const names = customerViews(ctx).slice(0, 3).map((c) => c.name);
  if (!names.length) return ["There are no customers yet, so there's nothing to look up.", "No customers exist yet. New customer on the Customers page adds one.", "I can't look that up: the customer list is empty."];
  return {
    variants: [`Which customer should I ${verb}? For example ${names[0]}.`, `Sure, which customer? Try something like "${chip(names[0])}".`, `Happy to ${verb} one. Which customer do you mean?`],
    chips: names.map(chip),
  };
}

export function askLot(ctx, verb, chip) {
  const names = lotViews(ctx).slice(0, 3).map((l) => l.name);
  if (!names.length) return ["There are no lots yet.", "No lots exist yet, so there's nothing to look up.", "I can't look that up: there aren't any lots yet."];
  return {
    variants: [`Which lot should I ${verb}? For example ${names[0]}.`, `Sure, which lot? Something like "${chip(names[0])}" works.`, `Happy to ${verb} one. Which lot?`],
    chips: names.map(chip),
  };
}

export function askLead(ctx, verb, chip) {
  const names = leadViews(ctx).slice(0, 3).map((l) => l.name).filter(Boolean);
  if (!names.length) return ["There are no quote requests yet.", "No requests have come in yet.", "I can't look that up: the request list is empty."];
  return {
    variants: [`Whose request should I ${verb}? For example ${names[0]}'s.`, `Sure, which request? Name the person or their organisation.`, `Happy to ${verb} one. Whose request?`],
    chips: names.map(chip),
  };
}

// A paged list: the openers over one page of lines, or the "that's all" variants.
export function listing(ctx, ent, lines, openers, emptyVariants) {
  if (!lines.length) return sourced(ctx, emptyVariants);
  const page = ent.page || 0;
  if (page * 8 >= lines.length) return sourced(ctx, ["That's the whole list.", "Nothing more: that was all of them.", "That's everything on that list."]);
  const body = `\n${bullets(lines, page)}`;
  return { variants: sourced(ctx, vary(page ? ["Here are the next ones:", "More of them:", "Continuing the list:"] : openers, body)), more: hasMore(lines, page) };
}

// Turns a name into its possessive: "Demo Mall's".
export const poss = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
