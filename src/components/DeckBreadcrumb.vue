<script setup lang="ts">
defineProps<{
  deckName: string;
  matchupName?: string;
  hasSelection: boolean;
  isBase: boolean;
}>();

defineEmits<{ selectBase: [] }>();
</script>

<template>
  <div
    class="sticky top-0 z-5 flex min-h-[53px] items-center gap-[11px] border-b border-[#303335] bg-[#151719ef] px-5 backdrop-blur-[10px] md:fixed md:left-[276px] md:right-0 md:px-[clamp(24px,5vw,72px)]"
  >
    <span class="font-mono text-[10px] font-medium tracking-[.11em] text-[#c97147]">DECK</span>
    <button
      class="cursor-pointer overflow-hidden border-0 bg-transparent p-0 text-ellipsis whitespace-nowrap text-[13px] font-bold text-[#e9e8e1] hover:enabled:text-[#f0a17b] hover:enabled:underline hover:enabled:underline-offset-[3px] disabled:cursor-default"
      :disabled="!hasSelection || isBase"
      @click="$emit('selectBase')"
    >
      {{ hasSelection ? deckName : "No deck loaded" }}
    </button>
    <template v-if="matchupName">
      <span class="font-mono text-[10px] font-medium tracking-[.11em] text-[#75a7bd]">VS</span>
      <strong class="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[#d8e5e9]">
        {{ matchupName }}
      </strong>
    </template>
  </div>
</template>
