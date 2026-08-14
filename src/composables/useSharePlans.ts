import { cardIdentity, createId, type Card, type Plan } from "../types";

type EncodedMatchup = [name: string, out: number[], incoming: number[]];
type EncodedCard = [quantity: number, setCode: string, collectorNumber: string, name: string];
type EncodedDecklist = [mainboard: EncodedCard[], sideboard: EncodedCard[]];
type SharedPayloadV1 = [
  version: 1,
  sourceUrl: string,
  deckName: string,
  matchups: EncodedMatchup[],
];
type SharedPayloadV2 = [
  version: 2,
  sourceUrl: string,
  deckName: string,
  decklist: EncodedDecklist,
  matchups: EncodedMatchup[],
];

export type SharedPlan = {
  sourceUrl: string;
  deckName: string;
  decklist?: EncodedDecklist;
  matchups: EncodedMatchup[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function gzip(bytes: Uint8Array) {
  const input = new Uint8Array(bytes);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array) {
  const input = new Uint8Array(bytes);
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function cardIndexes(base: Card[]) {
  return new Map(base.map((card, index) => [cardIdentity(card), index]));
}

function compactChanges(changes: Card[], indexes: Map<string, number>): number[] {
  return changes.flatMap((card) => {
    const index = indexes.get(cardIdentity(card));
    return index === undefined ? [] : [index, card.quantity];
  });
}

function encodeCards(cards: Card[]): EncodedCard[] {
  return cards.map((card) => [
    card.quantity,
    card.setCode ?? "",
    card.collectorNumber ?? "",
    card.name,
  ]);
}

function decodeCards(cards: EncodedCard[]): Card[] {
  return cards.map(([quantity, setCode, collectorNumber, name]) => ({
    quantity,
    name,
    ...(setCode ? { setCode } : {}),
    ...(collectorNumber ? { collectorNumber } : {}),
  }));
}

function validateMatchups(matchups: unknown): matchups is EncodedMatchup[] {
  return (
    Array.isArray(matchups) &&
    matchups.every(
      (matchup) =>
        Array.isArray(matchup) &&
        typeof matchup[0] === "string" &&
        Array.isArray(matchup[1]) &&
        Array.isArray(matchup[2]) &&
        matchup[1].length % 2 === 0 &&
        matchup[2].length % 2 === 0,
    )
  );
}

function validateDecklist(decklist: unknown): decklist is EncodedDecklist {
  const validCards = (cards: unknown) =>
    Array.isArray(cards) &&
    cards.length <= 250 &&
    cards.every(
      (card) =>
        Array.isArray(card) &&
        card.length === 4 &&
        Number.isInteger(card[0]) &&
        card[0] > 0 &&
        typeof card[1] === "string" &&
        typeof card[2] === "string" &&
        typeof card[3] === "string" &&
        card[3].length > 0,
    );
  return (
    Array.isArray(decklist) &&
    decklist.length === 2 &&
    validCards(decklist[0]) &&
    validCards(decklist[1])
  );
}

function validatePayload(value: unknown): SharedPlan {
  if (!Array.isArray(value) || (value[0] !== 1 && value[0] !== 2) || typeof value[1] !== "string") {
    throw new Error("This share link is not a valid sideboard plan.");
  }
  const [version, sourceUrl, deckName] = value as SharedPayloadV1 | SharedPayloadV2;
  const decklist = version === 2 ? value[3] : undefined;
  const matchups = version === 2 ? value[4] : value[3];
  if (
    typeof deckName !== "string" ||
    !validateMatchups(matchups) ||
    (version === 1 && !sourceUrl) ||
    (version === 2 && !validateDecklist(decklist))
  ) {
    throw new Error("This share link is missing its deck information.");
  }
  return { sourceUrl, deckName, ...(decklist ? { decklist } : {}), matchups };
}

function transfer(plan: Plan, base: Plan, pairs: number[], from: "mainboard" | "sideboard") {
  const to = from === "mainboard" ? "sideboard" : "mainboard";
  for (let position = 0; position < pairs.length; position += 2) {
    const [index, quantity] = [pairs[position], pairs[position + 1]];
    const original = base[from][index];
    if (!Number.isInteger(index) || !Number.isInteger(quantity) || quantity < 1 || !original) {
      throw new Error("This share link contains an invalid card change.");
    }
    const source = plan[from].find((card) => cardIdentity(card) === cardIdentity(original));
    if (!source || source.quantity < quantity) {
      throw new Error("This share link does not match the imported deck.");
    }
    source.quantity -= quantity;
    if (!source.quantity) plan[from].splice(plan[from].indexOf(source), 1);
    const target = plan[to].find((card) => cardIdentity(card) === cardIdentity(original));
    if (target) target.quantity += quantity;
    else plan[to].push({ ...original, quantity });
  }
}

export function useSharePlans(copyCards: (cards: Card[]) => Card[]) {
  async function createShareUrl(
    deckName: string,
    deckSourceUrl: string,
    plans: Plan[],
    changesFor: (plan: Plan, kind: "out" | "in") => Card[],
  ) {
    const base = plans[0];
    if (!base) throw new Error("Import a deck before creating a share link.");
    const mainboardIndexes = cardIndexes(base.mainboard);
    const sideboardIndexes = cardIndexes(base.sideboard);
    const payload: SharedPayloadV2 = [
      2,
      deckSourceUrl,
      deckName,
      [encodeCards(base.mainboard), encodeCards(base.sideboard)],
      plans
        .slice(1)
        .map((plan) => [
          plan.name,
          compactChanges(changesFor(plan, "out"), mainboardIndexes),
          compactChanges(changesFor(plan, "in"), sideboardIndexes),
        ]),
    ];
    const bytes = encoder.encode(JSON.stringify(payload));
    const compressed = typeof CompressionStream === "undefined" ? null : await gzip(bytes);
    const token = `${compressed ? "z" : "j"}${bytesToBase64Url(compressed ?? bytes)}`;
    const url = new URL(window.location.href);
    url.searchParams.delete("moxfield");
    url.searchParams.set("plan", token);
    return url.toString();
  }

  async function decodeShare(token: string) {
    if (!token || !/^[zj][A-Za-z0-9_-]+$/.test(token)) {
      throw new Error("This share link is not a valid sideboard plan.");
    }
    const bytes = base64UrlToBytes(token.slice(1));
    const json = token[0] === "z" ? await gunzip(bytes) : bytes;
    return validatePayload(JSON.parse(decoder.decode(json)));
  }

  function plansFromShare(shared: SharedPlan, base: Plan) {
    return [
      base,
      ...shared.matchups.map(([name, out, incoming]) => {
        const plan: Plan = {
          id: createId(),
          name,
          mainboard: copyCards(base.mainboard),
          sideboard: copyCards(base.sideboard),
        };
        transfer(plan, base, out, "mainboard");
        transfer(plan, base, incoming, "sideboard");
        return plan;
      }),
    ];
  }

  function baseFromShare(shared: SharedPlan): Plan {
    if (!shared.decklist) throw new Error("This share link does not include a decklist backup.");
    return {
      id: "base",
      name: "Base Decklist",
      mainboard: decodeCards(shared.decklist[0]),
      sideboard: decodeCards(shared.decklist[1]),
    };
  }

  return { createShareUrl, decodeShare, plansFromShare, baseFromShare };
}
