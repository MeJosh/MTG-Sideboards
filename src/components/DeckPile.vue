<script setup lang="ts">
import type { Card } from "../types";

defineProps<{
  title: string;
  cards: Card[];
  total: number;
  disabled: boolean;
  movedNames?: string[];
  movedClass?: string;
}>();

defineEmits<{ move: [card: Card] }>();
</script>

<template>
  <section class="mt-[34px] first:mt-0">
    <div class="mb-[15px] flex items-baseline gap-[11px] border-b border-[#323537] pb-[11px]">
      <h2 class="m-0 font-display text-[19px] font-semibold">{{ title }}</h2>
      <span class="font-mono text-[10px] text-[#838781]">{{ total }} cards</span>
    </div>
    <div class="grid grid-cols-2 gap-[11px] sm:grid-cols-[repeat(auto-fill,minmax(138px,1fr))]">
      <button
        v-for="card in cards"
        :key="card.name"
        :class="[
          'relative min-w-0 overflow-hidden rounded-[7px] border border-[#343739] bg-[#202325] p-0 text-left text-[#e8e7e0] transition duration-150 enabled:cursor-pointer enabled:hover:-translate-y-[3px] enabled:hover:border-[#df7548] disabled:cursor-default',
          movedNames?.includes(card.name) &&
            movedClass === 'brought-in' &&
            'border-[#6fba77] shadow-[0_0_0_1px_#6fba7740,0_0_15px_#6fba7720]',
          movedNames?.includes(card.name) &&
            movedClass === 'moved-out' &&
            'border-[#d46a61] shadow-[0_0_0_1px_#d46a6140,0_0_15px_#d46a6120]',
        ]"
        :disabled="disabled"
        @click="$emit('move', card)"
      >
        <img
          v-if="card.image"
          class="block h-[112px] w-full bg-[linear-gradient(135deg,#57352a,#273b38)] object-cover"
          :src="card.image"
          :alt="card.name"
        />
        <div
          v-else
          class="grid h-[112px] w-full place-items-center bg-[linear-gradient(135deg,#57352a,#273b38)] font-display text-[38px] font-bold text-[#eab393]"
        >
          {{ card.name[0] }}
        </div>
        <div
          class="absolute inset-x-0 bottom-0 flex justify-between gap-[5px] bg-[linear-gradient(90deg,rgba(14,16,18,.93),rgba(14,16,18,.76))] p-2 text-[11px] leading-[1.2] backdrop-blur-[4px]"
        >
          <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ card.name }}</span
          ><b class="shrink-0 font-mono text-[11px] font-medium text-[#f09a71]"
            >×{{ card.quantity }}</b
          >
        </div>
      </button>
    </div>
  </section>
</template>
