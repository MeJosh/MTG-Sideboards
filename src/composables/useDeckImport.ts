import type { Ref } from "vue";
import type { Card, Plan } from "../types";

const ART_CACHE_KEY = "sideboard-lab-scryfall-art-v1";
const SCRYFALL_REQUEST_INTERVAL_MS = 125;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
let scryfallQueue = Promise.resolve();
let nextScryfallRequestAt = 0;

type CachedArt = { image: string; releasedAt?: string };
type ArtCache = Record<string, CachedArt | string>;

function cardKey(card: Card) {
  return card.setCode && card.collectorNumber
    ? `${card.setCode.toLowerCase()}/${card.collectorNumber}`
    : `name/${card.name.toLowerCase()}`;
}

function readArtCache(): ArtCache {
  try {
    const cached = JSON.parse(localStorage.getItem(ART_CACHE_KEY) ?? "{}");
    return cached && typeof cached === "object" ? cached : {};
  } catch {
    return {};
  }
}

function writeArtCache(cache: ArtCache) {
  try {
    localStorage.setItem(ART_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* Images still work for this session if storage is unavailable. */
  }
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function fetchFromScryfall(url: string) {
  const request = scryfallQueue.then(async () => {
    await pause(Math.max(0, nextScryfallRequestAt - Date.now()));
    nextScryfallRequestAt = Date.now() + SCRYFALL_REQUEST_INTERVAL_MS;
    return fetch(url);
  });
  // Keep the queue usable after a browser-level (including CORS-masked 429) failure.
  scryfallQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

function cards(raw: unknown): Card[] {
  if (!raw || typeof raw !== "object") return [];
  const list = Array.isArray(raw)
    ? raw.map((item, index) => [String(index), item])
    : Object.entries(raw as Record<string, unknown>);
  return list.flatMap(([fallback, value]) => {
    const item = value as Record<string, unknown>;
    const printings =
      Array.isArray(item.printingData) && item.printingData.length ? item.printingData : [item];
    return printings
      .map((printing) => {
        const details = printing as Record<string, unknown>;
        const card = (details.card ?? item.card ?? details) as Record<string, unknown>;
        const name = String(card.name ?? item.name ?? fallback);
        const quantity = Number(details.quantity ?? item.quantity ?? item.count ?? 1);
        const scryfallId = typeof card.scryfall_id === "string" ? card.scryfall_id : undefined;
        const image =
          typeof card.image_uri === "string"
            ? card.image_uri
            : scryfallId
              ? `https://api.scryfall.com/cards/${scryfallId}?format=image&version=art_crop`
              : undefined;
        const setCode = typeof card.set === "string" ? card.set : undefined;
        const collectorNumber = typeof card.cn === "string" ? card.cn : undefined;
        const releasedAt = typeof card.released_at === "string" ? card.released_at : undefined;
        return name
          ? {
              name,
              quantity,
              ...(image ? { image } : {}),
              ...(scryfallId ? { scryfallId } : {}),
              ...(releasedAt ? { releasedAt } : {}),
              ...(setCode && collectorNumber ? { setCode, collectorNumber } : {}),
            }
          : null;
      })
      .filter((card): card is Card => card !== null);
  });
}

export function useDeckImport(plans: Ref<Plan[]>) {
  async function fetchMoxfieldDeck(source: string) {
    const value = source.trim();
    const id = /^[\w-]+$/.test(value) ? value : value.match(/moxfield\.com\/decks\/([\w-]+)/i)?.[1];
    if (!id) throw new Error("A valid Moxfield deck URL or deck ID is required.");
    const response = await fetch(`/api/moxfield/decks/all/${id}`);
    if (!response.ok) throw new Error("Moxfield could not find that deck.");
    const data = await response.json();
    const mainboard = cards(data.boards?.mainboard?.cards ?? data.mainboard);
    const sideboard = cards(data.boards?.sideboard?.cards ?? data.sideboard);
    if (!mainboard.length) throw new Error("This deck has no main deck to import.");
    return {
      name: data.name || "Imported deck",
      sourceUrl: `https://www.moxfield.com/decks/${id}`,
      plan: { id: "base", name: "Base Decklist", mainboard, sideboard } satisfies Plan,
    };
  }

  function parseDeckText(text: string): Plan {
    const mainboard: Card[] = [],
      sideboard: Card[] = [];
    const mergeCard = (board: Card[], card: Card) => {
      const existing = board.find(
        (candidate) =>
          candidate.name.toLocaleLowerCase() === card.name.toLocaleLowerCase() &&
          candidate.setCode === card.setCode &&
          candidate.collectorNumber === card.collectorNumber,
      );
      if (existing) existing.quantity += card.quantity;
      else board.push(card);
    };
    let inSideboard = false;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || /^deck$/i.test(trimmed)) continue;
      if (/^sideboard\b/i.test(trimmed)) {
        inSideboard = true;
        continue;
      }
      // Moxfield's `*F*` suffix marks a foil, but foil status isn't represented in this app.
      const withoutFinish = trimmed.replace(/\s+\*F\*\s*$/i, "").trim();
      const match = withoutFinish.match(/^(\d+)\s*x?\s+(.+)$/);
      if (match) {
        const [, quantity, details] = match;
        // Parse the printing separately so the optional suffix can never become part of the name.
        const printing = details.match(/^(.*?)\s+\(([A-Za-z0-9]{2,6})\)\s+([A-Za-z0-9-]+)$/);
        const [, name, setCode, collectorNumber] = printing ?? [undefined, details];
        mergeCard(inSideboard ? sideboard : mainboard, {
          quantity: Number(quantity),
          name: name.trim(),
          ...(setCode && collectorNumber
            ? { setCode: setCode.toLowerCase(), collectorNumber }
            : {}),
        });
      }
    }
    if (!mainboard.length)
      throw new Error(
        "No cards found. Use Moxfield’s Export → Copy for Moxfield, then paste the full list.",
      );
    return { id: "base", name: "Base Decklist", mainboard, sideboard };
  }

  async function loadArt() {
    const cache = readArtCache();
    const unresolved = new Map<string, Card>();
    // Plans and each board retain decklist order, so requests visibly fill from top to bottom.
    const orderedCards = plans.value.flatMap((plan) => [...plan.mainboard, ...plan.sideboard]);
    for (const card of orderedCards) {
      if (card.image && card.releasedAt) continue;
      const key = cardKey(card);
      const cached = cache[key];
      const cachedArt = typeof cached === "string" ? { image: cached } : cached;
      if (cachedArt) {
        card.image = cachedArt.image;
        if (cachedArt.releasedAt) card.releasedAt = cachedArt.releasedAt;
      }
      if (!cachedArt?.releasedAt && !unresolved.has(key)) unresolved.set(key, card);
    }

    for (const [key, card] of unresolved) {
      const url =
        card.setCode && card.collectorNumber
          ? `https://api.scryfall.com/cards/${encodeURIComponent(card.setCode)}/${encodeURIComponent(card.collectorNumber)}`
          : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}`;

      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const response = await fetchFromScryfall(url);
          if (response.ok) {
            const data = await response.json();
            const image = data.image_uris?.art_crop ?? data.card_faces?.[0]?.image_uris?.art_crop;
            if (image) {
              const releasedAt =
                typeof data.released_at === "string" ? data.released_at : undefined;
              cache[key] = { image, ...(releasedAt ? { releasedAt } : {}) };
              plans.value.forEach((plan) =>
                [...plan.mainboard, ...plan.sideboard]
                  .filter((candidate) => cardKey(candidate) === key)
                  .forEach((candidate) => {
                    candidate.image = image;
                    if (releasedAt) candidate.releasedAt = releasedAt;
                  }),
              );
            }
            break;
          }
          if (response.status !== 429) break;
        } catch {
          // A rate-limited Scryfall response omits CORS headers, so browsers expose it as a fetch error.
        }
        if (attempt < RETRY_DELAYS_MS.length) await pause(RETRY_DELAYS_MS[attempt]);
      }
    }
    writeArtCache(cache);
  }

  return { fetchMoxfieldDeck, parseDeckText, loadArt };
}
