<template>
  <view v-if="session.instrumentPickerTrack >= 0" class="mask" @click="closeInstrumentPicker">
    <view class="dialog" @click.stop>
      <view class="head">
        <text>Instrument</text>
        <view class="icon-btn" @click="closeInstrumentPicker">×</view>
      </view>
      <input class="search" placeholder="Search..." :value="query" @input="query = $event.target.value">
      <view class="body">
        <scroll-view class="cats" scroll-y>
          <view
            v-for="(group, index) in filtered"
            :key="group.category"
            class="cat"
            :class="{ on: category === index }"
            @click="category = index"
          >{{ group.category }}</view>
        </scroll-view>
        <scroll-view class="list" scroll-y>
          <view
            v-for="item in currentItems"
            :key="item.id"
            class="item"
            :class="{ on: selected && selected.id === item.id, dim: !item.available }"
            @click="selected = item"
            @dblclick="choose(item)"
          >
            <text>{{ item.displayName }}</text>
            <text class="src">{{ item.available ? (item.sourcePlugin || '') : 'unavailable' }}</text>
          </view>
        </scroll-view>
      </view>
      <view class="foot">
        <text class="hint">{{ selected ? selected.displayName : 'Select an instrument' }}</text>
        <view class="btn" @click="choose(selected)">Select</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  session,
  catalogueByCategory,
  loadInstrument,
  closeInstrumentPicker
} from '../store/session.js'

const query = ref('')
const category = ref(0)
const selected = ref(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return catalogueByCategory().map((group) => ({
    ...group,
    items: group.items.filter((item) => !q || (item.displayName || '').toLowerCase().includes(q) || (item.id || '').includes(q))
  })).filter((group) => group.items.length)
})

const currentItems = computed(() => (filtered.value[category.value] || filtered.value[0] || { items: [] }).items)

watch(() => session.instrumentPickerTrack, (index) => {
  query.value = ''
  category.value = 0
  const track = session.tracks[index]
  selected.value = track
    ? (currentItems.value.find((item) => item.id === track.definitionId) || null)
    : null
})

function choose (item) {
  const track = session.tracks[session.instrumentPickerTrack]
  if (!item || !track) return
  loadInstrument(track, item.id)
  closeInstrumentPicker()
}
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
}
.dialog {
  width: 560px;
  height: 420px;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  color: #e6e6e6;
  font-weight: 700;
  border-bottom: 1px solid #2a2a2a;
}
.search {
  margin: 8px 12px;
  height: 28px;
  background: #0e0e0e;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: #e6e6e6;
  padding: 0 8px;
}
.body { flex: 1; display: flex; min-height: 0; }
.cats {
  width: 148px;
  border-right: 1px solid #2a2a2a;
  height: 100%;
}
.cat { padding: 7px 12px; color: #8d8d8d; font-size: 12px; cursor: pointer; }
.cat.on { background: #232323; color: #e6e6e6; border-left: 2px solid #4da3ff; }
.list { flex: 1; height: 100%; background: #0e0e0e; }
.item {
  padding: 8px 12px;
  color: #e6e6e6;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.item:hover { background: #1c1c1c; }
.item.on { background: #232323; box-shadow: inset 2px 0 #4da3ff; }
.item.dim { color: #6a6a6a; }
.src { color: #6a6a6a; font-size: 11px; }
.foot {
  height: 40px;
  border-top: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
}
.hint { color: #6a6a6a; font-size: 11px; }
.btn {
  background: #2b2b2b;
  border: 1px solid #3a3a3a;
  color: #e6e6e6;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}
.icon-btn { width: 22px; height: 22px; cursor: pointer; color: #8d8d8d; text-align: center; }
</style>
