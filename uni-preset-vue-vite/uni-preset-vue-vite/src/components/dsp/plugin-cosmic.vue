<template>
  <view ref="root" class="cosmic" @pointerdown="notePointers(1)" @pointerup="notePointers(-1)" @pointercancel="notePointers(-1)">
    <view class="top">
      <text class="logo">COSMIC 2</text>
      <view class="preset">
        <view class="hit" @click.stop="stepPreset(-1)">‹</view>
        <input class="name" :value="state.meta.name" maxlength="32" @focus="setTyping(true)" @blur="setTyping(false)" @change="rename">
        <view class="hit" @click.stop="stepPreset(1)">›</view>
      </view>
      <view class="tabs">
        <text v-for="item in tabs" :key="item.id" class="tab" :class="{ on: tab === item.id }" @click="tab = item.id">{{ item.label }}</text>
      </view>
      <text class="scope-mode" @click="scopeMode = scopeMode === 'wave' ? 'spec' : 'wave'">{{ scopeMode === 'wave' ? 'Wave' : 'Spec' }}</text>
      <text class="star" :class="{ on: favOn }" @click="toggleFav">★</text>
    </view>

    <view class="macros">
      <view v-for="(macro, i) in state.macros" :key="i" class="macro">
        <text class="msrc" :data-src="'macro' + (i + 1)" @pointerdown.stop.prevent="beginMod('macro' + (i + 1), $event)">M{{ i + 1 }}</text>
        <input class="mname" :value="macro.name" maxlength="16" @focus="setTyping(true)" @blur="setTyping(false)" @change="renameMacro(i, $event)">
        <view class="mtrack" @pointerdown.stop.prevent="dragMacro(i, $event)" @dblclick.stop="setMacro(i, 0)">
          <view class="mfill" :style="{ width: (macro.value * 100) + '%' }" />
        </view>
      </view>
    </view>

    <view class="scope" data-plot="scope" />

    <view class="body cosmic-body">
      <view v-show="tab === 'source'" class="stack">
        <view class="grid3">
          <view v-for="(osc, i) in state.osc" :key="i" class="card">
            <view class="card-h">
              <text class="src">OSC {{ i + 1 }}</text>
              <text class="mini" :class="{ on: osc.on }" @click="setOsc(i, 'on', !osc.on)">{{ osc.on ? 'On' : 'Off' }}</text>
            </view>
            <view class="plot" data-plot="osc" :data-index="i" @pointerdown.stop.prevent="dragOsc(i, $event)" />
            <view class="chips">
              <text v-for="wave in WAVES" :key="wave" class="chip" :class="{ on: osc.wave === wave }" @click="setOsc(i, 'wave', wave)">{{ waveLabel(wave) }}</text>
            </view>
            <view v-if="osc.wave === 'wt'" class="chips">
              <text v-for="(name, wi) in WT_NAMES" :key="name" class="chip" :class="{ on: osc.wt === wi }" @click="setOsc(i, 'wt', wi)">{{ name }}</text>
            </view>
            <view class="chips">
              <text v-for="warp in WARPS" :key="warp" class="chip" :class="{ on: osc.warp === warp }" @click="setOsc(i, 'warp', warp)">{{ warp }}</text>
            </view>
            <view class="fields">
              <view class="k" :data-dst="'osc' + i + '.level'" @pointerdown.stop.prevent="dragOscField(i, 'level', 0, 1, $event)" @dblclick.stop="resetOsc(i, 'level', 0.72)"><view class="ring" :style="ringStyle('osc' + i + '.level')" /><text class="kv">{{ pct(osc.level) }}</text><text class="kl">Level</text><view class="dots"><view v-for="m in modsFor('osc' + i + '.level')" :key="m.src + m.dst" class="dot" :style="{ background: color(m.src) }" /></view></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'pan', -1, 1, $event)" :data-dst="'osc' + i + '.pan'" @dblclick.stop="resetOsc(i, 'pan', 0)"><view class="ring" :style="ringStyle('osc' + i + '.pan')" /><text class="kv">{{ osc.pan.toFixed(2) }}</text><text class="kl">Pan</text></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'oct', -3, 3, $event)" :data-dst="'osc' + i + '.pitch'" @dblclick.stop="resetOsc(i, 'oct', 0)"><text class="kv">{{ osc.oct }}</text><text class="kl">Oct</text></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'semi', -24, 24, $event)" :data-dst="'osc' + i + '.pitch'" @dblclick.stop="resetOsc(i, 'semi', 0)"><text class="kv">{{ Math.round(osc.semi) }}</text><text class="kl">Semi</text></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'fine', -100, 100, $event)" @dblclick.stop="resetOsc(i, 'fine', 0)"><text class="kv">{{ Math.round(osc.fine) }}</text><text class="kl">Fine</text></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'phase', 0, 1, $event)" @dblclick.stop="resetOsc(i, 'phase', 0)"><text class="kv">{{ pct(osc.phase) }}</text><text class="kl">Phase</text></view>
              <view class="k" :class="{ on: osc.randomPhase }" @click="setOsc(i, 'randomPhase', !osc.randomPhase)"><text class="kv">{{ osc.randomPhase ? 'On' : 'Off' }}</text><text class="kl">Rand</text></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'unison', 1, 8, $event)" @dblclick.stop="resetOsc(i, 'unison', 1)"><text class="kv">{{ osc.unison }}</text><text class="kl">Unison</text></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'detune', 0, 80, $event)" @dblclick.stop="resetOsc(i, 'detune', 12)"><text class="kv">{{ Math.round(osc.detune) }}</text><text class="kl">Detune</text></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'spread', 0, 1, $event)" @dblclick.stop="resetOsc(i, 'spread', 0.45)"><text class="kv">{{ pct(osc.spread) }}</text><text class="kl">Spread</text></view>
              <view class="k" @pointerdown.stop.prevent="dragOscField(i, 'blend', 0, 1, $event)" @dblclick.stop="resetOsc(i, 'blend', 0)"><text class="kv">{{ pct(osc.blend) }}</text><text class="kl">Blend</text></view>
              <view class="k" :data-dst="'osc' + i + '.warp'" @pointerdown.stop.prevent="dragOscField(i, 'warpAmt', 0, 1, $event)" @dblclick.stop="resetOsc(i, 'warpAmt', 0)"><view class="ring" :style="ringStyle('osc' + i + '.warp')" /><text class="kv">{{ pct(osc.warpAmt) }}</text><text class="kl">Warp</text></view>
              <view class="k" :data-dst="'osc' + i + '.frame'" @pointerdown.stop.prevent="dragOscField(i, 'frame', 0, 1, $event)" @dblclick.stop="resetOsc(i, 'frame', 0)"><view class="ring" :style="ringStyle('osc' + i + '.frame')" /><text class="kv">{{ pct(osc.frame) }}</text><text class="kl">Frame</text></view>
            </view>
            <view class="chips">
              <text class="chip" :class="{ on: osc.fmFrom < 0 }" @click="setOsc(i, 'fmFrom', -1)">FM self</text>
              <text v-for="n in 3" :key="n" class="chip" :class="{ on: osc.fmFrom === n - 1 }" @click="setOsc(i, 'fmFrom', n - 1)">From {{ n }}</text>
              <text v-for="dest in dests" :key="dest" class="chip" :class="{ on: osc.dest === dest }" @click="setOsc(i, 'dest', dest)">{{ dest }}</text>
            </view>
          </view>
        </view>
        <view class="grid2">
          <view class="card">
            <view class="card-h">
              <text>Sub</text>
              <text class="mini" :class="{ on: state.sub.on }" @click="patch((s) => { s.sub.on = !s.sub.on })">{{ state.sub.on ? 'On' : 'Off' }}</text>
            </view>
            <view class="chips">
              <text class="chip" :class="{ on: state.sub.wave === 'sine' }" @click="patch((s) => { s.sub.wave = 'sine' })">Sine</text>
              <text class="chip" :class="{ on: state.sub.wave === 'square' }" @click="patch((s) => { s.sub.wave = 'square' })">Square</text>
              <text v-for="oct in [-1, -2, -3]" :key="oct" class="chip" :class="{ on: state.sub.oct === oct }" @click="patch((s) => { s.sub.oct = oct })">{{ oct }} oct</text>
            </view>
            <view class="fields">
              <view class="k" data-dst="sub.level" @pointerdown.stop.prevent="dragPath('sub', 'level', 0, 1, $event)">
                <text class="kv">{{ pct(state.sub.level) }}</text><text class="kl">Level</text>
              </view>
              <view class="k" @pointerdown.stop.prevent="dragPath('sub', 'pan', -1, 1, $event)">
                <text class="kv">{{ state.sub.pan.toFixed(2) }}</text><text class="kl">Pan</text>
              </view>
            </view>
            <view class="chips">
              <text v-for="dest in dests" :key="'sub' + dest" class="chip" :class="{ on: state.sub.dest === dest }" @click="patch((s) => { s.sub.dest = dest })">{{ dest }}</text>
            </view>
          </view>
          <view class="card">
            <view class="card-h">
              <text>Noise</text>
              <text class="mini" :class="{ on: state.noise.on }" @click="patch((s) => { s.noise.on = !s.noise.on })">{{ state.noise.on ? 'On' : 'Off' }}</text>
            </view>
            <view class="chips">
              <text v-for="kind in NOISE_TYPES" :key="kind" class="chip" :class="{ on: state.noise.type === kind }" @click="patch((s) => { s.noise.type = kind })">{{ kind }}</text>
            </view>
            <view class="fields">
              <view class="k" data-dst="noise.level" @pointerdown.stop.prevent="dragPath('noise', 'level', 0, 1, $event)">
                <text class="kv">{{ pct(state.noise.level) }}</text><text class="kl">Level</text>
              </view>
              <view class="k" @pointerdown.stop.prevent="dragPath('noise', 'pan', -1, 1, $event)">
                <text class="kv">{{ state.noise.pan.toFixed(2) }}</text><text class="kl">Pan</text>
              </view>
            </view>
            <view class="chips">
              <text v-for="dest in dests" :key="'nz' + dest" class="chip" :class="{ on: state.noise.dest === dest }" @click="patch((s) => { s.noise.dest = dest })">{{ dest }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-show="tab === 'filter'" class="stack">
        <view class="card">
          <view class="card-h">
            <text>Filter {{ filt + 1 }}</text>
            <view class="chips">
              <text class="chip" :class="{ on: state.filterRoute === 'serial' }" @click="patch((s) => { s.filterRoute = 'serial' })">Serial</text>
              <text class="chip" :class="{ on: state.filterRoute === 'parallel' }" @click="patch((s) => { s.filterRoute = 'parallel' })">Parallel</text>
            </view>
          </view>
          <view class="plot tall" data-plot="filter" @pointerdown.stop.prevent="dragFilter($event)" />
          <view class="chips">
            <text class="chip" :class="{ on: filt === 0 }" @click="filt = 0">Filter 1</text>
            <text class="chip" :class="{ on: filt === 1 }" @click="filt = 1">Filter 2</text>
            <text class="mini" :class="{ on: currentFilt.on }" @click="patch((s) => { s.filters[filt].on = !s.filters[filt].on })">{{ currentFilt.on ? 'On' : 'Off' }}</text>
          </view>
          <view class="chips">
            <text v-for="type in FILTER_TYPES" :key="type" class="chip" :class="{ on: currentFilt.type === type }" @click="patch((s) => { s.filters[filt].type = type })">{{ type }}</text>
            <text class="chip" :class="{ on: currentFilt.slope === 12 }" @click="patch((s) => { s.filters[filt].slope = 12 })">12 dB</text>
            <text class="chip" :class="{ on: currentFilt.slope === 24 }" @click="patch((s) => { s.filters[filt].slope = 24 })">24 dB</text>
          </view>
          <view class="fields">
            <view class="k" :data-dst="'f' + filt + '.cutoff'" @pointerdown.stop.prevent="dragFilterField('cutoff', 40, 16000, 'log', $event)" @dblclick.stop="resetFilt('cutoff', 3200)"><view class="ring" :style="ringStyle('f' + filt + '.cutoff')" /><text class="kv">{{ Math.round(currentFilt.cutoff) }}</text><text class="kl">Cutoff</text></view>
            <view class="k" :data-dst="'f' + filt + '.res'" @pointerdown.stop.prevent="dragFilterField('res', 0, 0.95, 'lin', $event)" @dblclick.stop="resetFilt('res', 0.22)"><view class="ring" :style="ringStyle('f' + filt + '.res')" /><text class="kv">{{ currentFilt.res.toFixed(2) }}</text><text class="kl">Res</text></view>
            <view class="k" @pointerdown.stop.prevent="dragFilterField('drive', 0, 1, 'lin', $event)" @dblclick.stop="resetFilt('drive', 0)"><text class="kv">{{ pct(currentFilt.drive) }}</text><text class="kl">Drive</text></view>
            <view class="k" @pointerdown.stop.prevent="dragFilterField('mix', 0, 1, 'lin', $event)" @dblclick.stop="resetFilt('mix', 1)"><text class="kv">{{ pct(currentFilt.mix) }}</text><text class="kl">Mix</text></view>
            <view class="k" @pointerdown.stop.prevent="dragFilterField('key', -1, 1, 'lin', $event)" @dblclick.stop="resetFilt('key', 0)"><text class="kv">{{ currentFilt.key.toFixed(2) }}</text><text class="kl">Key</text></view>
          </view>
        </view>
      </view>

      <view v-show="tab === 'mod'" class="stack">
        <view class="grid3">
          <view v-for="(env, i) in state.env" :key="'e' + i" class="card">
            <text class="src" :style="{ color: color('env' + (i + 1)) }" :data-src="'env' + (i + 1)" @pointerdown.stop.prevent="beginMod('env' + (i + 1), $event)">ENV {{ i + 1 }}{{ i === 0 ? ' · Amp' : '' }}</text>
            <view class="plot" data-plot="env" :data-index="i" @pointerdown.stop.prevent="dragEnv(i, $event)" />
            <view class="fields">
              <view class="k" @pointerdown.stop.prevent="dragEnvField(i, 'attack', 0.001, 4, $event)" @dblclick.stop="resetEnv(i, 'attack', 0.01)"><text class="kv">{{ env.attack.toFixed(2) }}</text><text class="kl">A</text></view>
              <view class="k" @pointerdown.stop.prevent="dragEnvField(i, 'decay', 0.001, 4, $event)" @dblclick.stop="resetEnv(i, 'decay', 0.22)"><text class="kv">{{ env.decay.toFixed(2) }}</text><text class="kl">D</text></view>
              <view class="k" @pointerdown.stop.prevent="dragEnvField(i, 'sustain', 0, 1, $event)" @dblclick.stop="resetEnv(i, 'sustain', 0.72)"><text class="kv">{{ pct(env.sustain) }}</text><text class="kl">S</text></view>
              <view class="k" @pointerdown.stop.prevent="dragEnvField(i, 'release', 0.001, 6, $event)" @dblclick.stop="resetEnv(i, 'release', 0.28)"><text class="kv">{{ env.release.toFixed(2) }}</text><text class="kl">R</text></view>
              <view class="k" @pointerdown.stop.prevent="dragEnvField(i, 'aCurve', -1, 1, $event)" @dblclick.stop="resetEnv(i, 'aCurve', 0)"><text class="kv">{{ env.aCurve.toFixed(2) }}</text><text class="kl">A curve</text></view>
              <view class="k" @pointerdown.stop.prevent="dragEnvField(i, 'dCurve', -1, 1, $event)" @dblclick.stop="resetEnv(i, 'dCurve', 0)"><text class="kv">{{ env.dCurve.toFixed(2) }}</text><text class="kl">D curve</text></view>
              <view class="k" @pointerdown.stop.prevent="dragEnvField(i, 'rCurve', -1, 1, $event)" @dblclick.stop="resetEnv(i, 'rCurve', 0)"><text class="kv">{{ env.rCurve.toFixed(2) }}</text><text class="kl">R curve</text></view>
            </view>
          </view>
        </view>
        <view class="grid3">
          <view v-for="(lfo, i) in state.lfo" :key="'l' + i" class="card">
            <text class="src" :style="{ color: color('lfo' + (i + 1)) }" :data-src="'lfo' + (i + 1)" @pointerdown.stop.prevent="beginMod('lfo' + (i + 1), $event)">LFO {{ i + 1 }}</text>
            <view class="plot" data-plot="lfo" :data-index="i" :data-view="lfoView[i]" @pointerdown.stop.prevent="dragLfoDraw(i, $event)" />
            <view class="chips">
              <text class="chip" :class="{ on: lfoView[i] === 'shape' }" @click="lfoView[i] = 'shape'">Shape</text>
              <text class="chip" :class="{ on: lfoView[i] === 'vel' }" @click="lfoView[i] = 'vel'">Velocity</text>
              <text class="chip" :class="{ on: lfoView[i] === 'note' }" @click="lfoView[i] = 'note'">Note</text>
              <text v-if="lfoView[i] !== 'shape'" class="chip" @click="clearLfoMap(i)">Clear</text>
            </view>
            <view v-show="lfoView[i] === 'shape'" class="chips">
              <text v-for="shape in LFO_SHAPES" :key="shape" class="chip" :class="{ on: lfo.shape === shape }" @click="patch((s) => { s.lfo[i].shape = shape })">{{ shape }}</text>
            </view>
            <view class="fields">
              <view class="k" @pointerdown.stop.prevent="dragLfoField(i, 'rate', 0.05, 20, $event)"><text class="kv">{{ lfo.rate.toFixed(2) }}</text><text class="kl">Rate</text></view>
              <view class="k" @pointerdown.stop.prevent="dragLfoField(i, 'depth', 0, 1, $event)"><text class="kv">{{ pct(lfo.depth) }}</text><text class="kl">Depth</text></view>
              <view class="k" @pointerdown.stop.prevent="dragLfoField(i, 'phase', 0, 1, $event)"><text class="kv">{{ pct(lfo.phase) }}</text><text class="kl">Phase</text></view>
              <view class="k" @pointerdown.stop.prevent="dragLfoField(i, 'fade', 0, 4, $event)"><text class="kv">{{ lfo.fade.toFixed(2) }}</text><text class="kl">Fade</text></view>
              <view class="k" @pointerdown.stop.prevent="dragLfoField(i, 'delay', 0, 2, $event)"><text class="kv">{{ lfo.delay.toFixed(2) }}</text><text class="kl">Delay</text></view>
              <view class="k" @pointerdown.stop.prevent="dragLfoField(i, 'smooth', 0, 1, $event)"><text class="kv">{{ pct(lfo.smooth) }}</text><text class="kl">Smooth</text></view>
              <view class="k" @click="patch((s) => { s.lfo[i].sync = !s.lfo[i].sync })"><text class="kv">{{ lfo.sync ? 'Sync' : 'Free' }}</text><text class="kl">Clock</text></view>
              <view v-if="lfo.sync" class="k" @click="cycleBeat(i)"><text class="kv">{{ beatLabel(lfo.beats) }}</text><text class="kl">Division</text></view>
              <view class="k" @click="cycleLfo(i, 'mode', LFO_MODES)"><text class="kv">{{ lfo.mode }}</text><text class="kl">Mode</text></view>
              <view class="k" :class="{ on: lfo.retrigger }" @click="patch((s) => { s.lfo[i].retrigger = !s.lfo[i].retrigger })"><text class="kv">{{ lfo.retrigger ? 'On' : 'Off' }}</text><text class="kl">Retrig</text></view>
            </view>
          </view>
        </view>
        <view class="card">
          <text class="card-h">Modulation</text>
          <view class="chips">
            <text v-for="src in dragSources" :key="src" class="chip src" :style="{ color: color(src) }" @pointerdown.stop.prevent="beginMod(src, $event)">{{ src }}</text>
          </view>
          <view v-if="!state.mods.length" class="empty">Drag a source onto a control.</view>
          <view v-for="(mod, i) in state.mods" :key="i" class="mod" @contextmenu.prevent="removeMod(i)" @pointerdown="armDelete(i)">
            <view class="dot" :style="{ background: color(mod.src) }" />
            <text class="grow">{{ mod.src }} → {{ mod.dst }}</text>
            <text class="mini" @click.stop="patch((s) => { s.mods[i].bipolar = !s.mods[i].bipolar })">{{ mod.bipolar ? 'Bi' : 'Uni' }}</text>
            <view class="k slim" @pointerdown.stop.prevent="dragModAmount(i, $event)"><text class="kv">{{ mod.amount.toFixed(2) }}</text><text class="kl">Amount</text></view>
            <view class="k slim" @pointerdown.stop.prevent="dragModCurve(i, $event)"><text class="kv">{{ mod.curve.toFixed(2) }}</text><text class="kl">Curve</text></view>
            <text class="mini danger" @click.stop="removeMod(i)">Delete</text>
          </view>
        </view>
      </view>

      <view v-show="tab === 'fx'" class="stack">
        <view class="chain">
          <view v-for="(fx, i) in state.fx" :key="fx.id" class="chip fx" :class="{ on: fxIndex === i, live: fx.on }" @click="fxIndex = i" @pointerdown="armFxMove(i, $event)">
            {{ fxLabel(fx.id) }}
          </view>
        </view>
        <view v-if="currentFx" class="card">
          <view class="card-h">
            <text>{{ fxLabel(currentFx.id) }}</text>
            <text class="mini" :class="{ on: currentFx.on }" @click="patch((s) => { s.fx[fxIndex].on = !s.fx[fxIndex].on })">{{ currentFx.on ? 'On' : 'Bypass' }}</text>
          </view>
          <view class="plot" data-plot="fx" />
          <view class="fields">
            <view class="k" :data-dst="'fx.' + currentFx.id" @pointerdown.stop.prevent="dragFx('mix', 0, 1, $event)" @dblclick.stop="patch((s) => { s.fx[fxIndex].mix = 0.3 })"><view class="ring" :style="ringStyle('fx.' + currentFx.id)" /><text class="kv">{{ pct(currentFx.mix) }}</text><text class="kl">Mix</text></view>
            <view v-if="currentFx.drive != null" class="k" @pointerdown.stop.prevent="dragFx('drive', 0, 1, $event)"><text class="kv">{{ pct(currentFx.drive) }}</text><text class="kl">Drive</text></view>
            <view v-if="currentFx.low != null && currentFx.id === 'eq'" class="k" @pointerdown.stop.prevent="dragFx('low', -18, 18, $event)"><text class="kv">{{ Math.round(currentFx.low) }}</text><text class="kl">Low</text></view>
            <view v-if="currentFx.mid != null" class="k" @pointerdown.stop.prevent="dragFx('mid', -18, 18, $event)"><text class="kv">{{ Math.round(currentFx.mid) }}</text><text class="kl">Mid</text></view>
            <view v-if="currentFx.high != null && currentFx.id === 'eq'" class="k" @pointerdown.stop.prevent="dragFx('high', -18, 18, $event)"><text class="kv">{{ Math.round(currentFx.high) }}</text><text class="kl">High</text></view>
            <view v-if="currentFx.threshold != null" class="k" @pointerdown.stop.prevent="dragFx('threshold', 0.05, 1, $event)"><text class="kv">{{ currentFx.threshold.toFixed(2) }}</text><text class="kl">Thresh</text></view>
            <view v-if="currentFx.ratio != null" class="k" @pointerdown.stop.prevent="dragFx('ratio', 1, 12, $event)"><text class="kv">{{ currentFx.ratio.toFixed(1) }}</text><text class="kl">Ratio</text></view>
            <view v-if="currentFx.rate != null" class="k" @pointerdown.stop.prevent="dragFx('rate', 0.05, 6, $event)"><text class="kv">{{ currentFx.rate.toFixed(2) }}</text><text class="kl">Rate</text></view>
            <view v-if="currentFx.depth != null" class="k" @pointerdown.stop.prevent="dragFx('depth', 0, 1, $event)"><text class="kv">{{ pct(currentFx.depth) }}</text><text class="kl">Depth</text></view>
            <view v-if="currentFx.feedback != null" class="k" @pointerdown.stop.prevent="dragFx('feedback', 0, 0.9, $event)"><text class="kv">{{ pct(currentFx.feedback) }}</text><text class="kl">Feedback</text></view>
            <view v-if="currentFx.attack != null" class="k" @pointerdown.stop.prevent="dragFx('attack', 0.001, 0.2, $event)"><text class="kv">{{ currentFx.attack.toFixed(3) }}</text><text class="kl">Attack</text></view>
            <view v-if="currentFx.release != null && currentFx.id === 'compressor'" class="k" @pointerdown.stop.prevent="dragFx('release', 0.01, 0.8, $event)"><text class="kv">{{ currentFx.release.toFixed(2) }}</text><text class="kl">Release</text></view>
            <view v-if="currentFx.time != null" class="k" @pointerdown.stop.prevent="dragFx('time', 0.02, 1.2, $event)"><text class="kv">{{ currentFx.time.toFixed(2) }}</text><text class="kl">Time</text></view>
            <view v-if="currentFx.size != null" class="k" @pointerdown.stop.prevent="dragFx('size', 0, 1, $event)"><text class="kv">{{ pct(currentFx.size) }}</text><text class="kl">Size</text></view>
            <view v-if="currentFx.damp != null" class="k" @pointerdown.stop.prevent="dragFx('damp', 0, 1, $event)"><text class="kv">{{ pct(currentFx.damp) }}</text><text class="kl">Damp</text></view>
          </view>
          <view v-if="currentFx.sync != null" class="chips">
            <text class="chip" :class="{ on: currentFx.sync }" @click="patch((s) => { s.fx[fxIndex].sync = !s.fx[fxIndex].sync })">{{ currentFx.sync ? 'BPM sync' : 'Free time' }}</text>
            <text v-for="beat in beats" :key="beat" class="chip" :class="{ on: currentFx.beats === beat }" @click="patch((s) => { s.fx[fxIndex].beats = beat })">{{ beatLabel(beat) }}</text>
          </view>
          <view v-if="currentFx.id === 'compressor'" class="fields">
            <view class="k" @pointerdown.stop.prevent="dragFx('low', 0, 2, $event)"><text class="kv">{{ currentFx.low.toFixed(2) }}</text><text class="kl">Low band</text></view>
            <view class="k" @pointerdown.stop.prevent="dragFx('high', 0, 2, $event)"><text class="kv">{{ currentFx.high.toFixed(2) }}</text><text class="kl">High band</text></view>
          </view>
        </view>
      </view>

      <view v-show="tab === 'play'" class="stack play-stack">
        <view class="fields">
          <view class="k" @pointerdown.stop.prevent="dragGlobal('poly', 1, 16, $event)"><text class="kv">{{ state.global.poly }}</text><text class="kl">Voices</text></view>
          <view class="k" @click="cycleGlobal"><text class="kv">{{ state.global.mode }}</text><text class="kl">Mode</text></view>
          <view class="k" @pointerdown.stop.prevent="dragGlobal('glide', 0, 1.2, $event)"><text class="kv">{{ state.global.glide.toFixed(2) }}</text><text class="kl">Glide</text></view>
          <view class="k" @click="patch((s) => { s.global.glideMode = s.global.glideMode === 'rate' ? 'time' : 'rate' })"><text class="kv">{{ state.global.glideMode }}</text><text class="kl">Glide law</text></view>
          <view class="k" @pointerdown.stop.prevent="dragGlobal('bend', 1, 24, $event)"><text class="kv">{{ state.global.bend }}</text><text class="kl">Bend</text></view>
          <view class="k" @pointerdown.stop.prevent="dragGlobal('volume', 0, 1.2, $event)"><text class="kv">{{ pct(state.global.volume) }}</text><text class="kl">Volume</text></view>
          <view class="k" @pointerdown.stop.prevent="dragGlobal('tune', -100, 100, $event)"><text class="kv">{{ Math.round(state.global.tune) }}</text><text class="kl">Tune</text></view>
          <view class="k" @click="enableMidi"><text class="kv">{{ midiLabel }}</text><text class="kl">Web MIDI</text></view>
        </view>
        <view class="play-row">
          <view class="wheel-col">
            <view class="wheel" @pointerdown.stop.prevent="dragBend($event)"><view class="cap" :style="{ bottom: ((perf.bend + 1) * 42) + '%' }" /></view>
            <text class="kl">Pitch</text>
          </view>
          <view class="wheel-col">
            <view class="wheel" @pointerdown.stop.prevent="dragWheel($event)"><view class="cap mod" :style="{ bottom: (perf.wheel * 82) + '%' }" /></view>
            <text class="kl">Mod</text>
          </view>
          <view class="kb">
            <view class="whites">
              <view v-for="key in whiteKeys" :key="key.pitch" class="white" @pointerdown.stop.prevent="downKey($event, key.pitch)" @pointerup.stop="upKey($event)" @pointercancel.stop="upKey($event)" />
            </view>
            <view class="blacks">
              <view v-for="key in blackKeys" :key="key.pitch" class="black" :style="{ left: key.left }" @pointerdown.stop.prevent="downKey($event, key.pitch)" @pointerup.stop="upKey($event)" @pointercancel.stop="upKey($event)" />
            </view>
          </view>
        </view>
        <view class="acts">
          <view class="act" @click="saveUser">Save</view>
          <view class="act" @click="duplicatePreset">Duplicate</view>
          <view class="act" @click="exportJson">Export</view>
          <view class="act" @click="pickJson">Import</view>
          <view class="act" :class="{ off: !canDelete }" @click="deleteUser">Delete</view>
        </view>
        <view class="chips">
          <text class="chip" :class="{ on: category === 'All' }" @click="category = 'All'">All</text>
          <text class="chip" :class="{ on: category === 'Favorites' }" @click="category = 'Favorites'">Favorites</text>
          <text v-for="cat in categories" :key="cat" class="chip" :class="{ on: category === cat }" @click="category = cat">{{ cat }}</text>
        </view>
      </view>
    </view>
    <view v-if="ghost.on" class="ghost" :style="{ left: ghost.x + 'px', top: ghost.y + 'px', color: color(ghost.src) }">{{ ghost.src }}</view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  FILTER_TYPES,
  LFO_MODES,
  LFO_SHAPES,
  NOISE_TYPES,
  PLAY_MODES,
  SRC_COLORS,
  WARPS,
  WAVES,
  WT_NAMES,
  MOD_DESTS,
  defaultCosmicState,
  envCurve,
  envHold,
  filterCurve,
  lfoCurve,
  normalizeCosmicState,
  oscCurve
} from '../../dsp/cosmic/dsp.js'
import { onCosmicLive, onCosmicScope } from '../../dsp/cosmic/engine.js'
import { COSMIC_PRESETS } from '../../dsp/cosmic/presets.js'
import { previewNoteOff, previewNoteOn, setCosmicPerformance, setTyping, updateCosmicPatch, watchCosmicTrack } from '../../store/session.js'

const USER_KEY = 'daw.cosmic.presets'
const FAV_KEY = 'daw.cosmic.fav'
const props = defineProps({ track: { type: Object, required: true } })
const root = ref(null)
const tab = ref('source')
const lfoView = ref(['shape', 'shape', 'shape'])
const filt = ref(0)
const fxIndex = ref(3)
const category = ref('All')
const userPresets = ref(readStore(USER_KEY))
const favorites = ref(readStore(FAV_KEY))
const perf = ref({ bend: 0, wheel: 0, after: 0 })
const midiLabel = ref('Enable')
const ghost = ref({ on: false, x: 0, y: 0, src: '' })
const scopeSamples = ref(null)
const scopeMode = ref('wave')
const live = ref(null)
let pointerCount = 0
function notePointers (dir) { pointerCount = Math.max(0, pointerCount + dir) }
let drawRaf = 0
let stopScope = () => {}
let stopLive = () => {}
const held = {}
const DST_INDEX = {}
MOD_DESTS.forEach((id, i) => { DST_INDEX[id] = i })
const tabs = [
  { id: 'source', label: 'Source' },
  { id: 'filter', label: 'Filter' },
  { id: 'mod', label: 'Mod' },
  { id: 'fx', label: 'FX' },
  { id: 'play', label: 'Play' }
]
const dests = ['both', 'f1', 'f2', 'dry']
const dragSources = ['env1', 'env2', 'env3', 'lfo1', 'lfo2', 'lfo3', 'vel', 'note', 'wheel', 'after']
const beats = [1, 0.75, 0.5, 0.375, 0.25, 0.125]
const fxNames = { distortion: 'Drive', eq: 'EQ', compressor: 'Compressor', chorus: 'Chorus', flanger: 'Flanger', phaser: 'Phaser', delay: 'Delay', reverb: 'Reverb' }

const state = computed(() => normalizeCosmicState((props.track && props.track.cosmicState) || defaultCosmicState()))
const currentFilt = computed(() => state.value.filters[filt.value] || state.value.filters[0])
const currentFx = computed(() => state.value.fx[fxIndex.value] || state.value.fx[0])
const categories = computed(() => Array.from(new Set(COSMIC_PRESETS.map((preset) => preset.category))))
const allPresets = computed(() => COSMIC_PRESETS.concat(userPresets.value))
const visiblePresets = computed(() => allPresets.value.filter((preset) => {
  if (category.value === 'Favorites') return favorites.value.includes(preset.id)
  if (category.value === 'All') return true
  return preset.category === category.value
}))
const favOn = computed(() => favorites.value.includes(state.value.meta.id))
const canDelete = computed(() => String(state.value.meta.id || '').indexOf('user:') === 0)
const whiteKeys = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72].map((pitch) => ({ pitch }))
const blackKeys = [
  [49, 0], [51, 1], [54, 3], [56, 4], [58, 5],
  [61, 7], [63, 8], [66, 10], [68, 11], [70, 12]
].map(([pitch, index]) => ({ pitch, left: ((index + 0.62) / 15 * 100) + '%' }))

function readStore (key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch (err) { return [] }
}
function writeStore (key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch (err) { /* private mode */ }
}
function commit (next) {
  props.track.cosmicState = normalizeCosmicState(next)
  updateCosmicPatch(props.track)
}
function patch (recipe) {
  const next = JSON.parse(JSON.stringify(state.value))
  recipe(next)
  commit(next)
}
function pct (v) { return Math.round((Number(v) || 0) * 100) + '%' }
function color (src) { return SRC_COLORS[src] || '#d7c4ff' }
function waveLabel (id) { return id === 'wt' ? 'Wavetable' : id }
function fxLabel (id) { return fxNames[id] || id }
function beatLabel (beat) {
  if (beat === 1) return '1/4'
  if (beat === 0.75) return '1/8.'
  if (beat === 0.5) return '1/8'
  if (beat === 0.375) return '1/16.'
  if (beat === 0.25) return '1/16'
  return '1/32'
}
function modsFor (dst) { return state.value.mods.filter((mod) => mod.dst === dst) }
function setOsc (index, key, value) { patch((s) => { s.osc[index][key] = value }) }
function resetOsc (index, key, value) { setOsc(index, key, value) }
function resetEnv (index, key, value) { patch((s) => { s.env[index][key] = value }) }
function resetFilt (key, value) { patch((s) => { s.filters[filt.value][key] = value }) }
function setMacro (index, value) { patch((s) => { s.macros[index].value = value }) }
function ringStyle (dst) {
  const mods = modsFor(dst)
  if (!mods.length) return { opacity: 0 }
  const liveMods = live.value && live.value.mods
  const idx = DST_INDEX[dst]
  const depth = liveMods && idx != null ? Math.min(1, Math.abs(liveMods[idx] || 0)) : Math.min(1, Math.abs(mods[0].amount))
  const deg = Math.round(depth * 270)
  const col = color(mods[0].src)
  return {
    opacity: 0.9,
    background: `conic-gradient(from 225deg, ${col} 0deg, ${col} ${deg}deg, transparent ${deg}deg)`
  }
}
function renameMacro (index, e) {
  const name = String((e.target && e.target.value) || '').trim().slice(0, 16)
  patch((s) => { s.macros[index].name = name || ('Macro ' + (index + 1)) })
}
function rename (e) {
  const name = String(e.target.value || 'Edited').slice(0, 32)
  patch((s) => { s.meta.name = name; s.meta.id = 'edited' })
}
function stepPreset (dir) {
  const list = visiblePresets.value.length ? visiblePresets.value : allPresets.value
  let index = list.findIndex((preset) => preset.id === state.value.meta.id)
  if (index < 0) index = 0
  const next = list[(index + dir + list.length) % list.length]
  commit(next.state)
}
function toggleFav () {
  const id = state.value.meta.id
  const list = favorites.value.slice()
  const at = list.indexOf(id)
  if (at >= 0) list.splice(at, 1)
  else list.push(id)
  favorites.value = list
  writeStore(FAV_KEY, list)
}
function saveUser () {
  const name = state.value.meta.name || 'User patch'
  const id = String(state.value.meta.id || '').indexOf('user:') === 0 ? state.value.meta.id : ('user:' + Date.now())
  const entry = { id, name, category: 'User', state: normalizeCosmicState({ ...state.value, meta: { id, name, category: 'User' } }) }
  const list = userPresets.value.filter((preset) => preset.id !== id)
  list.push(entry)
  userPresets.value = list
  writeStore(USER_KEY, list)
  commit(entry.state)
}
function duplicatePreset () {
  const name = (state.value.meta.name || 'Patch') + ' copy'
  const id = 'user:' + Date.now()
  const entry = { id, name, category: 'User', state: normalizeCosmicState({ ...state.value, meta: { id, name, category: 'User' } }) }
  const list = userPresets.value.concat(entry)
  userPresets.value = list
  writeStore(USER_KEY, list)
  commit(entry.state)
}
function deleteUser () {
  if (!canDelete.value) return
  const id = state.value.meta.id
  userPresets.value = userPresets.value.filter((preset) => preset.id !== id)
  writeStore(USER_KEY, userPresets.value)
  commit(COSMIC_PRESETS[0].state)
}
function exportJson () {
  const blob = new Blob([JSON.stringify({ name: state.value.meta.name, state: state.value }, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = (state.value.meta.name || 'cosmic-2').toLowerCase().replace(/\s+/g, '-') + '.json'
  link.click()
}
function pickJson () {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = () => {
    const file = input.files && input.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'))
        commit(data.state || data)
      } catch (err) { /* ignore bad files */ }
    }
    reader.readAsText(file)
  }
  input.click()
}
function cycleGlobal () {
  const list = PLAY_MODES
  const index = Math.max(0, list.indexOf(state.value.global.mode))
  patch((s) => { s.global.mode = list[(index + 1) % list.length] })
}
function cycleLfo (index, key, list) {
  const cur = state.value.lfo[index][key]
  const at = Math.max(0, list.indexOf(cur))
  patch((s) => { s.lfo[index][key] = list[(at + 1) % list.length] })
}
function cycleBeat (index) {
  const at = Math.max(0, beats.indexOf(state.value.lfo[index].beats))
  patch((s) => { s.lfo[index].beats = beats[(at + 1) % beats.length] })
}
function clearLfoMap (index) {
  const key = lfoView.value[index] === 'note' ? 'noteMap' : 'velMap'
  patch((s) => { s.lfo[index][key] = [] })
}
function addMod (src, dst) {
  if (!src || !dst) return
  patch((s) => {
    if (s.mods.some((mod) => mod.src === src && mod.dst === dst)) return
    const bipolar = src.indexOf('lfo') === 0 || src === 'note'
    s.mods.push({ src, dst, amount: bipolar ? 0.45 : 0.6, bipolar, curve: 0 })
  })
}
function removeMod (index) { patch((s) => { s.mods.splice(index, 1) }) }
function armDelete (index) {
  const timer = setTimeout(() => removeMod(index), 520)
  const up = () => { clearTimeout(timer); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointerup', up)
}

function listen (move, up) {
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
function silence (move, up) {
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', up)
  window.removeEventListener('pointercancel', up)
}
function dragNumber (e, read, write, min, max, mode) {
  const startY = e.clientY
  const start = read()
  const move = (ev) => {
    const fine = ev.shiftKey || pointerCount > 1
    const dy = (startY - ev.clientY) / (fine ? 340 : 120)
    let value
    if (mode === 'log') {
      const span = Math.log(max) - Math.log(min)
      value = Math.exp(Math.log(Math.max(min, start)) + dy * span)
    } else value = start + dy * (max - min)
    write(Math.min(max, Math.max(min, value)))
  }
  const up = () => silence(move, up)
  listen(move, up)
}
function dragOscField (index, key, min, max, e) {
  const ints = key === 'unison' || key === 'oct' || key === 'semi'
  dragNumber(e, () => state.value.osc[index][key], (value) => setOsc(index, key, ints ? Math.round(value) : value), min, max)
}
function dragPath (group, key, min, max, e) {
  dragNumber(e, () => state.value[group][key], (value) => patch((s) => { s[group][key] = value }), min, max)
}
function dragMacro (index, e) {
  dragNumber(e, () => state.value.macros[index].value, (value) => setMacro(index, value), 0, 1)
}
function dragFilterField (key, min, max, mode, e) {
  dragNumber(e, () => currentFilt.value[key], (value) => patch((s) => { s.filters[filt.value][key] = value }), min, max, mode)
}
function dragEnvField (index, key, min, max, e) {
  dragNumber(e, () => state.value.env[index][key], (value) => patch((s) => { s.env[index][key] = value }), min, max)
}
function dragLfoField (index, key, min, max, e) {
  dragNumber(e, () => state.value.lfo[index][key], (value) => patch((s) => { s.lfo[index][key] = value }), min, max)
}
function dragGlobal (key, min, max, e) {
  dragNumber(e, () => state.value.global[key], (value) => patch((s) => { s.global[key] = key === 'poly' || key === 'bend' ? Math.round(value) : value }), min, max)
}
function dragFx (key, min, max, e) {
  dragNumber(e, () => currentFx.value[key], (value) => patch((s) => { s.fx[fxIndex.value][key] = value }), min, max)
}
function dragModAmount (index, e) {
  dragNumber(e, () => state.value.mods[index].amount, (value) => patch((s) => { s.mods[index].amount = value }), -1, 1)
}
function dragModCurve (index, e) {
  dragNumber(e, () => state.value.mods[index].curve, (value) => patch((s) => { s.mods[index].curve = value }), -1, 1)
}
function point (host, ev) {
  const rect = host.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, 1 - (ev.clientY - rect.top) / Math.max(1, rect.height)))
  }
}
function dragOsc (index, e) {
  const host = e.currentTarget
  const move = (ev) => {
    const p = point(host, ev)
    const fine = ev.shiftKey || pointerCount > 1
    patch((s) => {
      const osc = s.osc[index]
      const warp = fine ? osc.warpAmt + (p.x - osc.warpAmt) * 0.25 : p.x
      osc.warpAmt = warp
      if (osc.wave === 'wt') osc.frame = fine ? osc.frame + (p.y - osc.frame) * 0.25 : p.y
      else osc.level = fine ? osc.level + (p.y - osc.level) * 0.25 : p.y
    })
  }
  move(e)
  const up = () => silence(move, up)
  listen(move, up)
}
function dragFilter (e) {
  const host = e.currentTarget
  const move = (ev) => {
    const p = point(host, ev)
    const cutoff = 30 * Math.pow(18000 / 30, p.x)
    patch((s) => {
      s.filters[filt.value].cutoff = cutoff
      s.filters[filt.value].res = p.y * 0.95
    })
  }
  move(e)
  const up = () => silence(move, up)
  listen(move, up)
}
function envBreaks (env) {
  const a = Math.max(0.001, env.attack)
  const d = Math.max(0.001, env.decay)
  const r = Math.max(0.001, env.release)
  const hold = envHold(env)
  const total = a + d + hold + r
  return [
    { id: 'attack', t: a / total, y: 1, curve: 'aCurve' },
    { id: 'decay', t: (a + d) / total, y: env.sustain, curve: 'dCurve' },
    { id: 'sustain', t: (a + d + hold) / total, y: env.sustain, curve: null },
    { id: 'release', t: 1, y: 0, curve: 'rCurve' }
  ]
}
function dragEnv (index, e) {
  const host = e.currentTarget
  const start = point(host, e)
  const env = state.value.env[index]
  const breaks = envBreaks(env)
  let nearest = 0
  let best = 99
  breaks.forEach((b, at) => {
    const d = Math.hypot(b.t - start.x, b.y - start.y)
    if (d < best) { best = d; nearest = at }
  })
  const hit = breaks[nearest]
  const fineCurve = e.shiftKey || best > 0.12
  const move = (ev) => {
    const p = point(host, ev)
    patch((s) => {
      const cur = s.env[index]
      if (fineCurve && hit.curve) {
        cur[hit.curve] = Math.max(-1, Math.min(1, (p.y - 0.5) * 2))
        return
      }
      if (hit.id === 'attack') cur.attack = Math.max(0.001, p.x * 2.8)
      else if (hit.id === 'decay') {
        cur.decay = Math.max(0.001, Math.max(0.05, p.x - 0.12) * 2.8)
        cur.sustain = p.y
      } else if (hit.id === 'sustain') cur.sustain = p.y
      else cur.release = Math.max(0.001, (1 - Math.min(0.92, p.x)) * 4)
    })
  }
  move(e)
  const up = () => silence(move, up)
  listen(move, up)
}
function dragLfoDraw (index, e) {
  const view = lfoView.value[index] || 'shape'
  if (view === 'shape' && state.value.lfo[index].shape !== 'draw') return
  const host = e.currentTarget
  const key = view === 'vel' ? 'velMap' : view === 'note' ? 'noteMap' : 'points'
  const move = (ev) => {
    const p = point(host, ev)
    patch((s) => {
      const points = s.lfo[index][key]
      if (key !== 'points' && points.length < 2) {
        points.splice(0, points.length, { t: 0, v: 1, c: 0 }, { t: 1, v: 1, c: 0 })
      }
      let nearest = 0
      let best = 99
      points.forEach((pointItem, at) => {
        const d = Math.abs(pointItem.t - p.x)
        if (d < best) { best = d; nearest = at }
      })
      const v = key === 'points' ? p.y * 2 - 1 : p.y
      if (best > 0.08 && points.length < 12) points.push({ t: p.x, v, c: 0 })
      else {
        if (nearest !== 0 && nearest !== points.length - 1) points[nearest].t = p.x
        else if (key === 'points') points[nearest].t = p.x
        points[nearest].v = v
      }
    })
  }
  move(e)
  const up = () => silence(move, up)
  listen(move, up)
}
function beginMod (src, e) {
  ghost.value = { on: true, x: e.clientX + 12, y: e.clientY + 12, src }
  const move = (ev) => { ghost.value = { on: true, x: ev.clientX + 12, y: ev.clientY + 12, src } }
  const up = (ev) => {
    ghost.value = { on: false, x: 0, y: 0, src: '' }
    silence(move, up)
    const el = document.elementFromPoint(ev.clientX, ev.clientY)
    const dst = el && el.closest && el.closest('[data-dst]')
    if (dst) addMod(src, dst.getAttribute('data-dst'))
  }
  listen(move, up)
}
function armFxMove (index, e) {
  const startX = e.clientX
  let moved = false
  const move = (ev) => {
    if (Math.abs(ev.clientX - startX) > 18) moved = true
  }
  const up = (ev) => {
    silence(move, up)
    if (!moved) return
    const chips = Array.from(document.querySelectorAll('.cosmic .fx'))
    let to = index
    chips.forEach((chip, at) => {
      const rect = chip.getBoundingClientRect()
      if (ev.clientX > rect.left + rect.width / 2) to = at
    })
    if (to === index) return
    patch((s) => {
      const [item] = s.fx.splice(index, 1)
      s.fx.splice(to, 0, item)
    })
    fxIndex.value = to
  }
  listen(move, up)
}
function setPerf (next) {
  perf.value = { ...perf.value, ...next }
  setCosmicPerformance(perf.value)
}
function dragBend (e) {
  const host = e.currentTarget
  const move = (ev) => {
    const p = point(host, ev)
    setPerf({ bend: p.y * 2 - 1 })
  }
  move(e)
  const up = () => { silence(move, up); setPerf({ bend: 0 }) }
  listen(move, up)
}
function dragWheel (e) {
  const host = e.currentTarget
  const move = (ev) => setPerf({ wheel: point(host, ev).y })
  move(e)
  const up = () => silence(move, up)
  listen(move, up)
}
function downKey (e, pitch) {
  try { e.target.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
  held[e.pointerId] = pitch
  previewNoteOn(props.track, pitch, 0.86)
}
function upKey (e) {
  const pitch = held[e.pointerId]
  if (pitch == null) return
  delete held[e.pointerId]
  previewNoteOff(props.track, pitch)
}
async function enableMidi () {
  if (!navigator.requestMIDIAccess) { midiLabel.value = 'Unavailable'; return }
  try {
    const access = await navigator.requestMIDIAccess()
    const bind = (input) => {
      input.onmidimessage = (event) => {
        const [status, d1, d2] = event.data
        const cmd = status & 0xf0
        if (cmd === 0x90 && d2 > 0) previewNoteOn(props.track, d1, d2 / 127)
        else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) previewNoteOff(props.track, d1)
        else if (cmd === 0xe0) setPerf({ bend: ((d2 << 7) | d1) / 8192 - 1 })
        else if (cmd === 0xb0 && d1 === 1) setPerf({ wheel: d2 / 127 })
        else if (cmd === 0xd0) setPerf({ after: d1 / 127 })
      }
    }
    access.inputs.forEach(bind)
    access.onstatechange = () => access.inputs.forEach(bind)
    midiLabel.value = access.inputs.size ? 'Live' : 'Waiting'
  } catch (err) {
    midiLabel.value = 'Blocked'
  }
}

function hostEl (node) { return node && (node.nodeType === 1 ? node : node.$el) }
function canvasOf (host) {
  let canvas = host.querySelector('canvas')
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block;'
    host.appendChild(canvas)
  }
  const w = Math.max(1, host.clientWidth || 1)
  const h = Math.max(1, host.clientHeight || 1)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return { ctx, w, h }
}
function mapSamples (points, n) {
  const out = new Float32Array(n)
  if (!points || points.length < 2) { out.fill(1); return out }
  const sorted = points.slice().sort((a, b) => a.t - b.t)
  for (let i = 0; i < n; i++) {
    const x = i / Math.max(1, n - 1)
    let y = sorted[sorted.length - 1].v
    if (x <= sorted[0].t) y = sorted[0].v
    else {
      for (let p = 1; p < sorted.length; p++) {
        if (x <= sorted[p].t) {
          const a = sorted[p - 1]
          const b = sorted[p]
          const u = (x - a.t) / Math.max(1e-5, b.t - a.t)
          y = a.v + (b.v - a.v) * u
          break
        }
      }
    }
    out[i] = y
  }
  return out
}
function stroke (ctx, samples, w, h, color, map) {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  for (let i = 0; i < samples.length; i++) {
    const x = (i / Math.max(1, samples.length - 1)) * w
    const y = map(samples[i], h)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}
function drawHandles (ctx, points, w, h, fill) {
  points.forEach((p) => {
    const x = p.t * w
    const y = h - 8 - p.y * (h - 16)
    ctx.beginPath()
    ctx.fillStyle = fill
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#08101f'
    ctx.lineWidth = 1
    ctx.stroke()
  })
}
function drawFxMini (ctx, w, h, fx) {
  const col = fx.on ? '#7ee0c6' : '#4a5878'
  if (fx.id === 'eq') {
    const samples = new Float32Array(Math.max(32, w | 0))
    for (let i = 0; i < samples.length; i++) {
      const t = i / Math.max(1, samples.length - 1)
      const low = 1 + (fx.low || 0) / 18
      const mid = 1 + (fx.mid || 0) / 18
      const high = 1 + (fx.high || 0) / 18
      const y = t < 0.33 ? low : t < 0.66 ? mid : high
      samples[i] = Math.max(0, Math.min(2, y)) * 0.5
    }
    stroke(ctx, samples, w, h, col, (v, height) => height - 8 - v * (height - 16))
  } else if (fx.id === 'compressor') {
    ctx.strokeStyle = col
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(8, h - 8)
    const thr = 1 - (fx.threshold || 0.35)
    ctx.lineTo(w * (fx.threshold || 0.35), h * thr)
    ctx.lineTo(w - 8, h * (thr + (1 - thr) / Math.max(1, fx.ratio || 3)))
    ctx.stroke()
  } else if (fx.id === 'delay') {
    const taps = [0.25, 0.5, 0.75, 1]
    taps.forEach((t, i) => {
      const x = 12 + t * (w - 24)
      const hh = (h - 20) * Math.pow(fx.feedback || 0.3, i) * (fx.mix || 0.3)
      ctx.fillStyle = col
      ctx.fillRect(x - 3, h - 8 - hh, 6, hh)
    })
  } else if (fx.id === 'reverb') {
    const samples = new Float32Array(Math.max(32, w | 0))
    for (let i = 0; i < samples.length; i++) {
      const t = i / Math.max(1, samples.length - 1)
      samples[i] = Math.exp(-t * (2.2 - (fx.size || 0.5) * 1.6)) * (0.4 + (1 - (fx.damp || 0.4)) * 0.5)
    }
    stroke(ctx, samples, w, h, col, (v, height) => height - 8 - v * (height - 16))
  } else {
    const samples = new Float32Array(Math.max(32, w | 0))
    for (let i = 0; i < samples.length; i++) {
      const t = i / Math.max(1, samples.length - 1)
      samples[i] = 0.5 + 0.45 * Math.sin(t * Math.PI * 2 * (1 + (fx.rate || 0.3) * 2)) * (fx.depth || fx.drive || fx.mix || 0.4)
    }
    stroke(ctx, samples, w, h, col, (v, height) => height / 2 - (v - 0.5) * height * 0.7)
  }
}
function spectrumOf (samples) {
  const n = 64
  const out = new Float32Array(n)
  if (!samples || !samples.length) return out
  for (let k = 0; k < n; k++) {
    let re = 0
    let im = 0
    const step = Math.max(1, Math.floor(samples.length / 128))
    for (let i = 0, t = 0; i < samples.length; i += step, t++) {
      const ang = -2 * Math.PI * k * t / 128
      re += samples[i] * Math.cos(ang)
      im += samples[i] * Math.sin(ang)
    }
    out[k] = Math.min(1, Math.sqrt(re * re + im * im) / 24)
  }
  return out
}
function draw () {
  const el = hostEl(root.value)
  if (!el) return
  el.querySelectorAll('[data-plot]').forEach((host) => {
    const kind = host.getAttribute('data-plot')
    const index = Number(host.getAttribute('data-index') || 0)
    const { ctx, w, h } = canvasOf(host)
    ctx.fillStyle = '#0c1426'
    ctx.fillRect(0, 0, w, h)
    if (kind === 'osc') {
      const osc = state.value.osc[index]
      stroke(ctx, oscCurve(osc, Math.max(32, w | 0)), w, h, '#8eb6ff', (v, height) => height / 2 - v * height * 0.38)
    } else if (kind === 'env') {
      const env = state.value.env[index]
      const col = color('env' + (index + 1))
      stroke(ctx, envCurve(env, Math.max(32, w | 0)), w, h, col, (v, height) => height - 8 - v * (height - 16))
      drawHandles(ctx, envBreaks(env), w, h, col)
      const liveEnv = live.value && live.value.env && live.value.env[index]
      if (liveEnv != null) {
        const x = Math.min(0.98, Math.max(0.02, liveEnv)) * w
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.beginPath()
        ctx.moveTo(8, h - 8 - liveEnv * (h - 16))
        ctx.lineTo(w - 8, h - 8 - liveEnv * (h - 16))
        ctx.stroke()
        void x
      }
    } else if (kind === 'lfo') {
      const view = host.getAttribute('data-view') || 'shape'
      const lfo = state.value.lfo[index]
      const col = color('lfo' + (index + 1))
      if (view === 'shape') {
        stroke(ctx, lfoCurve(lfo, Math.max(32, w | 0)), w, h, col, (v, height) => height / 2 - v * height * 0.38)
        const phase = live.value && live.value.lfo ? live.value.lfo[index] : lfo.phase
        if (phase != null) {
          const x = (phase - Math.floor(phase)) * w
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'
          ctx.beginPath()
          ctx.moveTo(x, 4)
          ctx.lineTo(x, h - 4)
          ctx.stroke()
        }
      } else stroke(ctx, mapSamples(view === 'note' ? lfo.noteMap : lfo.velMap, Math.max(32, w | 0)), w, h, col, (v, height) => height - 8 - v * (height - 16))
    } else if (kind === 'filter') {
      const filtState = currentFilt.value
      const curve = filterCurve(filtState, Math.max(32, w | 0))
      stroke(ctx, curve, w, h, '#f0c36a', (v, height) => height - 8 - Math.min(1, v) * (height - 16))
      const liveCut = live.value && live.value.cutoff ? live.value.cutoff[filt.value] : filtState.cutoff
      const nx = Math.log(Math.max(30, liveCut) / 20) / Math.log(1000)
      const ny = filtState.res / 0.95
      ctx.beginPath()
      ctx.fillStyle = '#fff3c4'
      ctx.arc(nx * w, h - 8 - ny * (h - 16), 6, 0, Math.PI * 2)
      ctx.fill()
    } else if (kind === 'fx') {
      drawFxMini(ctx, w, h, currentFx.value)
    } else if (kind === 'scope') {
      const samples = scopeSamples.value && scopeSamples.value.length ? scopeSamples.value : oscCurve(state.value.osc[0], 64)
      if (scopeMode.value === 'spec') {
        const bins = spectrumOf(samples)
        ctx.fillStyle = '#6ab0ff'
        const bar = w / bins.length
        for (let i = 0; i < bins.length; i++) {
          const hh = bins[i] * (h - 8)
          ctx.fillRect(i * bar, h - 4 - hh, Math.max(1, bar - 1), hh)
        }
      } else stroke(ctx, samples, w, h, '#b9c7ff', (v, height) => height / 2 - Math.max(-1, Math.min(1, v)) * height * 0.42)
    }
  })
}
function scheduleDraw () {
  if (drawRaf) return
  drawRaf = requestAnimationFrame(() => { drawRaf = 0; draw() })
}

onMounted(() => {
  scheduleDraw()
  watchCosmicTrack(props.track, true)
  stopScope = onCosmicScope((msg) => {
    if (msg && msg.trackId && String(msg.trackId) !== String(props.track.id)) return
    if (msg && msg.samples) scopeSamples.value = msg.samples
    scheduleDraw()
  })
  stopLive = onCosmicLive((msg) => {
    if (msg && msg.trackId && String(msg.trackId) !== String(props.track.id)) return
    live.value = msg && msg.live
    scheduleDraw()
  })
})
onBeforeUnmount(() => {
  watchCosmicTrack(props.track, false)
  stopScope()
  stopLive()
  if (drawRaf) cancelAnimationFrame(drawRaf)
})
watch(() => props.track && props.track.cosmicState, scheduleDraw, { deep: true })
watch(tab, scheduleDraw)
watch(filt, scheduleDraw)
watch(fxIndex, scheduleDraw)
watch(scopeMode, scheduleDraw)
watch(lfoView, scheduleDraw, { deep: true })
</script>

<style scoped>
.cosmic {
  height: 100%;
  min-height: 560px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  box-sizing: border-box;
  color: #e7eefc;
  background:
    radial-gradient(900px 240px at 20% -10%, rgba(120, 150, 255, 0.18), transparent 60%),
    radial-gradient(700px 280px at 100% 0%, rgba(180, 120, 255, 0.12), transparent 55%),
    #070b16;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}
.top, .macros, .tabs, .chips, .chain, .acts, .play-row, .fields { display: flex; gap: 6px; align-items: center; }
.top { flex-wrap: wrap; }
.logo { font-size: 12px; letter-spacing: 0.16em; color: #9eb6ff; font-weight: 700; }
.preset { display: flex; align-items: center; gap: 4px; min-width: 180px; flex: 1; }
.name {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: #121a2e;
  color: #e7eefc;
  padding: 0 8px;
  user-select: text;
  -webkit-user-select: text;
}
.hit, .tab, .chip, .mini, .act, .k, .src, .star, .scope-mode {
  min-height: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.scope-mode {
  border-radius: 8px;
  background: #16233c;
  color: #d5def2;
  padding: 0 10px;
  font-size: 12px;
  letter-spacing: 0.04em;
}
.hit, .tab, .chip, .act, .k, .mini {
  border-radius: 8px;
  background: #16233c;
  color: #d5def2;
  padding: 0 10px;
  box-sizing: border-box;
}
.tab.on, .chip.on, .mini.on, .star.on { color: #08101f; background: #8eb6ff; }
.star { color: #8ea0c2; font-size: 20px; }
.macros {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.macro { display: flex; align-items: center; gap: 4px; min-width: 0; }
.msrc { width: 44px; height: 44px; flex: none; color: #d7c4ff; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.mname {
  width: 0;
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: #121a2e;
  color: #e7eefc;
  padding: 0 6px;
  font-size: 12px;
}
.mtrack { flex: 1.2; height: 28px; border-radius: 99px; background: #1c2740; position: relative; min-width: 44px; touch-action: none; }
.mfill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: #d7c4ff; }
.scope { height: 54px; border-radius: 10px; overflow: hidden; background: #0c1426; }
.body { flex: 1; min-height: 0; overflow: auto; touch-action: pan-y; display: flex; flex-direction: column; }
.stack { display: flex; flex-direction: column; gap: 8px; }
.play-stack { flex: 1; min-height: 420px; }
.grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.card { background: rgba(16, 24, 42, 0.92); border: 1px solid #24324d; border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.card-h, .src { font-size: 12px; letter-spacing: 0.08em; color: #9eb0d4; }
.card-h { display: flex; justify-content: space-between; align-items: center; }
.plot { height: 92px; border-radius: 8px; overflow: hidden; touch-action: none; background: #0c1426; }
.plot.tall { height: 160px; }
.chips, .chain, .acts { flex-wrap: wrap; }
.chip, .mini, .act { min-height: 40px; font-size: 12px; text-transform: capitalize; }
.k.on { color: #08101f; background: #8eb6ff; }
.k.on .kv, .k.on .kl { color: #08101f; }
.fields { flex-wrap: wrap; }
.k { position: relative; flex-direction: column; gap: 2px; touch-action: none; padding: 6px 8px; overflow: hidden; }
.k.slim { min-width: 64px; }
.ring {
  position: absolute;
  inset: 2px;
  border-radius: 8px;
  opacity: 0;
  pointer-events: none;
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
}
.kv { font-size: 13px; color: #f4f7ff; position: relative; z-index: 1; }
.kl { font-size: 10px; color: #8ea0c2; text-transform: uppercase; position: relative; z-index: 1; }
.dots { position: absolute; right: 4px; top: 4px; display: flex; gap: 2px; z-index: 1; }
.dots i, .dot { width: 7px; height: 7px; border-radius: 50%; display: block; }
.mod { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.grow { flex: 1; font-size: 13px; }
.empty { color: #8ea0c2; font-size: 13px; padding: 8px 0; }
.danger { color: #ffb4b4; }
.act.off { opacity: 0.4; pointer-events: none; }
.play-row { align-items: stretch; flex: 1 1 auto; min-height: 200px; }
.wheel-col { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.wheel {
  width: 54px;
  flex: 1;
  min-height: 140px;
  border-radius: 12px;
  background: #121a2e;
  position: relative;
  overflow: hidden;
  touch-action: none;
}
.cap { position: absolute; left: 8px; right: 8px; height: 18px; border-radius: 6px; background: #8eb6ff; }
.cap.mod { background: #d7c4ff; }
.kb { position: relative; flex: 1; height: auto; min-height: 180px; align-self: stretch; touch-action: none; }
.whites { display: flex; height: 100%; gap: 2px; }
.white { flex: 1; background: #e7eefc; border-radius: 0 0 6px 6px; }
.blacks { position: absolute; inset: 0 0 38% 0; pointer-events: none; }
.black { position: absolute; width: 4.4%; height: 100%; background: #151b2b; border-radius: 0 0 4px 4px; pointer-events: auto; }
.fx.live { box-shadow: inset 0 -2px 0 #7ee0c6; }
.ghost { position: fixed; z-index: 80; pointer-events: none; background: #10182c; border-radius: 8px; padding: 6px 8px; font-size: 12px; }
@media (max-width: 980px) {
  .grid3 { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 680px) {
  .grid3, .grid2 { grid-template-columns: 1fr; }
  .macros { grid-template-columns: 1fr 1fr; }
  .plot.tall { height: 120px; }
}
@media (prefers-reduced-motion: reduce) {
  .cosmic { background: #070b16; }
}
</style>
<style>
uni-view.cosmic-body {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}
uni-view.play-stack { flex: 1 1 auto !important; min-height: 0 !important; }
uni-view.play-row { flex: 1 1 auto !important; min-height: 200px !important; }
</style>
