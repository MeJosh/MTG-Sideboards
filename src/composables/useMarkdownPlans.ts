import { createId, type Plan } from "../types";

type Importer = (source: string) => Promise<{ name: string; sourceUrl: string; plan: Plan }>;

export function useMarkdownPlans(
  fetchMoxfieldDeck: Importer,
  copyCards: (cards: Plan["mainboard"]) => Plan["mainboard"],
) {
  const exportFilename = (deckName: string) =>
    `${
      deckName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "sideboard-plan"
    }.md`;

  function createExport(
    deckName: string,
    deckSourceUrl: string,
    plans: Plan[],
    changesFor: (plan: Plan, kind: "out" | "in") => { name: string; quantity: number }[],
  ) {
    const sections = plans.slice(1).map((plan) => {
      const out = changesFor(plan, "out").map((card) => `-${card.quantity} ${card.name}`);
      const incoming = changesFor(plan, "in").map((card) => `+${card.quantity} ${card.name}`);
      return `### ${plan.name}\n\n${[...out, ...incoming].join("\n") || "No swaps."}`;
    });
    const source = deckSourceUrl ? `source: ${JSON.stringify(deckSourceUrl)}\n` : "";
    return `---\ntitle: ${JSON.stringify(deckName)}\n${source}---\n\n## Sideboarding\n${sections.length ? `\n${sections.join("\n\n")}` : ""}\n`;
  }

  async function importMarkdown(
    markdown: string,
    base: Plan | undefined,
    deckName: string,
    deckSourceUrl: string,
  ) {
    const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(markdown)?.[1];
    let sourceUrl = "";
    if (frontmatter) {
      for (const line of frontmatter.split(/\r?\n/)) {
        const source = /^source:\s*(.+)$/.exec(line)?.[1];
        if (source) {
          try {
            sourceUrl = JSON.parse(source);
          } catch {
            sourceUrl = source.trim();
          }
        }
      }
    }
    const imported = sourceUrl
      ? await fetchMoxfieldDeck(sourceUrl)
      : base
        ? {
            name: deckName,
            sourceUrl: deckSourceUrl,
            plan: {
              ...base,
              mainboard: copyCards(base.mainboard),
              sideboard: copyCards(base.sideboard),
            },
          }
        : (() => {
            throw new Error("Load a deck first, or import Markdown with a Moxfield source URL.");
          })();
    const plans: Plan[] = [imported.plan];
    const matchupPattern = /^###\s+(.+?)\s*$([\s\S]*?)(?=^###\s+|(?![\s\S]))/gm;
    for (const match of markdown.matchAll(matchupPattern)) {
      const plan: Plan = {
        id: createId(),
        name: match[1].trim(),
        mainboard: copyCards(imported.plan.mainboard),
        sideboard: copyCards(imported.plan.sideboard),
      };
      for (const line of match[2].split(/\r?\n/)) {
        const swap = /^([+-])(\d+)\s+(.+?)\s*$/.exec(line);
        if (!swap) continue;
        const from = swap[1] === "-" ? "mainboard" : "sideboard",
          to = from === "mainboard" ? "sideboard" : "mainboard";
        for (let count = 0; count < Number(swap[2]); count++) {
          const source = plan[from].find((card) => card.name === swap[3]);
          if (!source) break;
          source.quantity--;
          if (!source.quantity) plan[from].splice(plan[from].indexOf(source), 1);
          const target = plan[to].find((card) => card.name === swap[3]);
          if (target) target.quantity++;
          else plan[to].push({ ...source, quantity: 1 });
        }
      }
      plans.push(plan);
    }
    return { ...imported, plans };
  }

  function save(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return { createExport, exportFilename, importMarkdown, save };
}
