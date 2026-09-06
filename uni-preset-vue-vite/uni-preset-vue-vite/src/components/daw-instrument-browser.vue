<template>
  <view v-if="session.instrumentPickerTrack >= 0" class="mask" @click="closeInstrumentPicker">
    <view class="dialog" :class="{ plugins: isPlugin }" @click.stop>
      <view class="head">
        <text>{{ isNewTrack ? 'Add track' : (isPlugin ? 'Insert Plugin' : 'Instrument') }}</text>
        <view class="icon-btn" @click="closeInstrumentPicker">×</view>
      </view>
      <input class="search" placeholder="Search..." :value="query" @input="query = $event.target.value">
      <view v-if="isPlugin" class="plugin-list">
        <view
          v-for="item in pluginItems"
          :key="item.id"
          class="plugin"
          :class="{ on: selected && selected.id === item.id, 'needs-pc': item.available === false }"
          @click="onPluginTap(item)"
          @dblclick="choosePlugin(item)"
        >
          <view class="row">
            <text class="pname">{{ item.displayName }}</text>
            <text v-if="item.available === false" class="tag">Needs PC</text>
          </view>
          <text class="pdetail">{{ item.detail }}</text>
        </view>
      </view>
      <view v-else class="body">
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
            :class="{ on: selected && selected.id === item.id, 'needs-pc': item.available === false }"
            @click="onPatchTap(item)"
            @dblclick="choosePatch(item)"
          >
            <view class="row">
              <text>{{ item.displayName }}</text>
              <text v-if="item.available === false" class="tag">Needs PC</text>
            </view>
            <text class="src">{{ item.available === false ? '在电脑上运行 DawWeb 引擎后可用' : (item.sourcePlugin || '') }}</text>
          </view>
        </scroll-view>
      </view>
      <view class="foot">
        <text class="hint">{{ hint }}</text>
        <view class="btn" @click="confirm">{{ isNewTrack ? 'Add' : (isPlugin ? 'Insert' : 'Select') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  session,
  orchestraPatchCatalogue,
  listInsertablePlugins,
  insertPlugin,
  loadInstrument,
  closeInstrumentPicker,
  openPluginUI,
  isLite,
  addTrack,
  showToast
} from '../store/session.js'

const query = ref('')
const category = ref(0)
const selected = ref(null)

const isNewTrack = computed(() => session.instrumentPickerMode === 'new-track')
const isPlugin = computed(() => session.instrumentPickerMode !== 'orchestra-patch')

const pluginItems = computed(() => {
  const q = query.value.trim().toLowerCase()
  return listInsertablePlugins().filter((item) => !q
    || (item.displayName || '').toLowerCase().includes(q)
    || (item.id || '').includes(q))
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return orchestraPatchCatalogue().map((group) => ({
    ...group,
    items: group.items.filter((item) => !q || (item.displayName || '').toLowerCase().includes(q) || (item.id || '').includes(q))
  })).filter((group) => group.items.length)
})

const currentItems = computed(() => (filtered.value[category.value] || filtered.value[0] || { items: [] }).items)

const hint = computed(() => {
  if (!selected.value) return isPlugin.value ? 'Select a plugin' : 'Select an instrument'
  return selected.value.displayName
})

watch(() => session.instrumentPickerTrack, () => {
  query.value = ''
  category.value = 0
  selected.value = isPlugin.value ? (pluginItems.value[0] || null) : null
})

watch(() => session.instrumentPickerMode, () => {
  selected.value = isPlugin.value ? (pluginItems.value[0] || null) : null
})

async function createTrackFromPlugin (item) {
  if (!item) return
  if (item.available === false) {
    showToast(item.detail || '需要电脑上的 DawWeb 引擎')
    return
  }
  const kind = item.id === 'web_sampler' ? 'web-sampler' : 'midi'
  const index = await addTrack(kind, item.displayName || 'Track')
  const track = session.tracks[index]
  if (track) insertPlugin(track, item.id)
  closeInstrumentPicker()
}

function choosePlugin (item) {
  if (!item) return
  if (item.available === false) {
    showToast(item.detail || '需要电脑上的 DawWeb 引擎')
    return
  }
  if (isNewTrack.value) {
    createTrackFromPlugin(item)
    return
  }
  const track = session.tracks[session.instrumentPickerTrack]
  if (!track) return
  insertPlugin(track, item.id)
}

function onPluginTap (item) {
  selected.value = item
  if (isLite()) choosePlugin(item)
}

function onPatchTap (item) {
  selected.value = item
  if (isLite()) choosePatch(item)
}

function choosePatch (item) {
  if (!item) return
  if (item.available === false || item.requiresEngine && !item.available) {
    showToast(item.sourcePlugin || '需要电脑上的 DawWeb 引擎')
    return
  }
  const track = session.tracks[session.instrumentPickerTrack]
  if (!track) return
  loadInstrument(track, item.id)
  closeInstrumentPicker()
  openPluginUI(session.tracks.indexOf(track))
}

function confirm () {
  if (isPlugin.value) choosePlugin(selected.value)
  else choosePatch(selected.value)
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
  z-index: 200;
  padding: 12px;
  box-sizing: border-box;
}
.dialog {
  width: min(400px, 100%);
  height: min(420px, 78vh);
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dialog.plugins { height: 380px; }
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
.plugin-list { flex: 1; overflow: auto; background: #0e0e0e; }
.plugin {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
  color: #e6e6e6;
}
.plugin:hover { background: #1c1c1c; }
.plugin.on { background: #232323; box-shadow: inset 2px 0 #4da3ff; }
.pname { font-size: 14px; font-weight: 700; }
.pdetail { font-size: 11px; color: #8d8d8d; }
.cats {
  width: 148px;
  border-right: 1px solid #2a2a2a;
  height: 100%;
}
.cat {
  padding: 7px 12px;
  min-height: 40px;
  display: flex;
  align-items: center;
  color: #8d8d8d;
  font-size: 12px;
  cursor: pointer;
}
.cat.on { background: #232323; color: #e6e6e6; border-left: 2px solid #4da3ff; }
.list { flex: 1; height: 100%; background: #0e0e0e; }
.item {
  padding: 8px 12px;
  min-height: 44px;
  color: #e6e6e6;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
}
.item:hover { background: #1c1c1c; }
.item.on { background: #232323; box-shadow: inset 2px 0 #4da3ff; }
.src { color: #6a6a6a; font-size: 11px; }
/* Engine-only patches keep their colour and get a badge, so the list does not
   read as "half the library is broken" while running in the browser. */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: #6fd0f5;
  background: rgba(77, 199, 255, 0.12);
  border: 1px solid rgba(77, 199, 255, 0.32);
}
.needs-pc .src, .needs-pc .pdetail { color: #7f96a1; }
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
