import { computed, ref, watch } from "vue";
import { cardIdentity, createId, type Card, type Plan } from "../types";

const STORAGE_KEY = "sideboard-lab-v1";
export type BoardName = "mainboard" | "sideboard";

const copyCards = (cards: Card[]) => cards.map((card) => ({ ...card }));

export function useSideboardPlanner() {
  const deckName = ref("Untitled deck");
  const deckSourceUrl = ref("");
  const plans = ref<Plan[]>([]);
  const selectedId = ref("base");
  const selected = computed(() => plans.value.find((plan) => plan.id === selectedId.value));
  const base = computed(() => plans.value[0]);
  const isBase = computed(() => selected.value?.id === "base");
  const total = (pile?: Card[]) => pile?.reduce((sum, card) => sum + card.quantity, 0) ?? 0;

  function setDeck(name: string, sourceUrl: string, plan: Plan) {
    deckName.value = name;
    deckSourceUrl.value = sourceUrl;
    plans.value = [plan];
    selectedId.value = "base";
  }

  function addMatchup(name: string) {
    if (!base.value || !name.trim()) return;
    const id = createId();
    plans.value.push({
      id,
      name: name.trim(),
      mainboard: copyCards(base.value.mainboard),
      sideboard: copyCards(base.value.sideboard),
    });
    selectedId.value = id;
  }

  function move(card: Card, from: BoardName) {
    const plan = selected.value;
    if (!plan || isBase.value) return;
    const origin = plan[from];
    const destination = plan[from === "mainboard" ? "sideboard" : "mainboard"];
    const source = origin.find((item) => cardIdentity(item) === cardIdentity(card));
    if (!source) return;
    source.quantity--;
    if (!source.quantity) origin.splice(origin.indexOf(source), 1);
    const target = destination.find((item) => cardIdentity(item) === cardIdentity(card));
    if (target) target.quantity++;
    else destination.push({ ...card, quantity: 1 });
  }

  function changesFor(plan: Plan, kind: "out" | "in") {
    const original = kind === "out" ? base.value?.mainboard : base.value?.sideboard;
    const current = kind === "out" ? plan.mainboard : plan.sideboard;
    return (original ?? [])
      .map((card) => ({
        ...card,
        quantity:
          card.quantity -
          (current.find((item) => cardIdentity(item) === cardIdentity(card))?.quantity ?? 0),
      }))
      .filter((card) => card.quantity > 0);
  }

  function deleteMatchup(plan: Plan | null) {
    if (!plan || plan.id === "base") return;
    plans.value = plans.value.filter((item) => item.id !== plan.id);
    if (selectedId.value === plan.id) selectedId.value = "base";
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (!saved.plans?.length) return;
      plans.value = saved.plans;
      deckName.value = saved.deckName || deckName.value;
      deckSourceUrl.value = saved.deckSourceUrl || "";
      selectedId.value = saved.selectedId || "base";
    } catch {
      /* ignore stale storage */
    }
  }

  watch(
    [plans, deckName, deckSourceUrl, selectedId],
    () =>
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          plans: plans.value,
          deckName: deckName.value,
          deckSourceUrl: deckSourceUrl.value,
          selectedId: selectedId.value,
        }),
      ),
    { deep: true },
  );

  return {
    deckName,
    deckSourceUrl,
    plans,
    selectedId,
    selected,
    base,
    isBase,
    total,
    setDeck,
    addMatchup,
    move,
    changesFor,
    deleteMatchup,
    restore,
    copyCards,
  };
}
