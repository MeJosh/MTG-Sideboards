import type { Ref } from "vue";
import type { Card, Plan } from "../types";

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
        return name
          ? {
              name,
              quantity,
              ...(image ? { image } : {}),
              ...(scryfallId ? { scryfallId } : {}),
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
    let inSideboard = false;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || /^deck$/i.test(trimmed)) continue;
      if (/^sideboard\b/i.test(trimmed)) {
        inSideboard = true;
        continue;
      }
      const match = trimmed.match(
        /^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)\s+([A-Za-z0-9-]+))?(?:\s+\*[^*]+\*)?\s*$/,
      );
      if (match) {
        const [, quantity, name, setCode, collectorNumber] = match;
        (inSideboard ? sideboard : mainboard).push({
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
    const unresolved = new Map(
      plans.value
        .flatMap((plan) => [...plan.mainboard, ...plan.sideboard])
        .filter((card) => !card.image)
        .map((card) => [
          card.setCode && card.collectorNumber
            ? `${card.setCode}/${card.collectorNumber}`
            : `name/${card.name.toLowerCase()}`,
          card,
        ]),
    );
    for (const [key, card] of unresolved) {
      try {
        const response =
          card.setCode && card.collectorNumber
            ? await fetch(
                `https://api.scryfall.com/cards/${encodeURIComponent(card.setCode)}/${encodeURIComponent(card.collectorNumber)}`,
              )
            : await fetch(
                `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}`,
              );
        if (!response.ok) continue;
        const data = await response.json();
        const image = data.image_uris?.art_crop ?? data.card_faces?.[0]?.image_uris?.art_crop;
        if (image)
          plans.value.forEach((plan) =>
            [...plan.mainboard, ...plan.sideboard]
              .filter((candidate) => {
                const candidateKey =
                  candidate.setCode && candidate.collectorNumber
                    ? `${candidate.setCode}/${candidate.collectorNumber}`
                    : `name/${candidate.name.toLowerCase()}`;
                return candidateKey === key;
              })
              .forEach((candidate) => (candidate.image = image)),
          );
      } catch {
        /* card remains text-only */
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }

  return { fetchMoxfieldDeck, parseDeckText, loadArt };
}
