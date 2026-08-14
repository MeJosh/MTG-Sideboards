<script setup lang="ts">
import { cardIdentity, type Card } from "../types";

defineProps<{
  title: string;
  removals: Card[];
  additions: Card[];
}>();
</script>

<template>
  <footer
    class="mt-[60px] grid gap-[14px] rounded-lg border border-[#383b3a] bg-[#1a1d1e] px-6 py-[22px] md:grid-cols-[180px_1fr] md:gap-[25px]"
  >
    <div>
      <label class="font-mono text-[10px] font-medium tracking-[.1em] text-[#8d918b]"
        >SIDEBOARD GUIDE</label
      >
      <h2 class="m-0 font-display text-[19px] font-semibold">{{ title }}</h2>
    </div>
    <div class="grid grid-cols-2 gap-[18px]">
      <div class="min-w-0">
        <p
          v-for="card in removals"
          :key="`out-${cardIdentity(card)}`"
          class="my-[3px] font-mono text-[13px] text-[#e9ad94]"
        >
          −{{ card.quantity }} {{ card.name }}
        </p>
      </div>
      <div class="min-w-0">
        <p
          v-for="card in additions"
          :key="`in-${cardIdentity(card)}`"
          class="my-[3px] font-mono text-[13px] text-[#a6cf9f]"
        >
          +{{ card.quantity }} {{ card.name }}
        </p>
      </div>
      <p
        v-if="!removals.length && !additions.length"
        class="col-span-full my-[3px] font-mono text-[13px] text-[#858984]"
      >
        No swaps yet — click cards to build your plan.
      </p>
    </div>
  </footer>
</template>
