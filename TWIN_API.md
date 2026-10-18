# Twin 合成器 · 接口与功能列表

> 基线文档（重做功能前的现状快照）。用于对照后续基于 Vital / Surge 的增强。
> 路径基准：`uni-preset-vue-vite/uni-preset-vue-vite/src/dsp/synth/`

---

## 1. 公开音频接口（`engine.js` / `index.js`）

| 函数 | 签名 | 作用 |
|---|---|---|
| `noteOn` | `noteOn(graph, track, pitch, velocity=0.8, id, when)` | 触发一个音符。优先走 AudioWorklet 实时引擎；不可用时回退到离线渲染 buffer。返回 voice key |
| `noteOff` | `noteOff(pitchOrKey, trackId)` | 释放音符（实时引擎发 `noteOff`，buffer 引擎做 0.2s 线性淡出） |
| `cancelPending` | `cancelPending(pitchOrKey, trackId)` | 标记待触发但未落地的音符为取消 |
| `allNotesOff` | `allNotesOff()` | 全局静音：递增 epoch、清空 pending、向所有实时 voice 发 `allOff` |
| `updateTwinState` | `updateTwinState(graph, track)` | 把最新 `twinState` 推送给 worklet 节点（`port.postMessage({type:'state'})`） |
| `renderNoteAt` | `renderNoteAt(context, dest, track, pitch, velocity, startSec, durationSec)` | 离线把单个音符渲染成 buffer 并排到时间轴（导出/混音用） |
| `noteReady` / `preloadNotes` / `applyControllers` | 无副作用占位 | 兼容宿主乐器接口 |
| `TWIN_PLUGIN_ID` | `'twin'` | 插件标识，供 `session.js` 路由 |

`index.js` 统一再导出：`params`（`TWIN_PLUGIN_ID, defaultTwinState, normalizeTwinState, WAVES, FILTER_TYPES, MOD_SOURCES, MOD_DESTS`）、`presets`（`TWIN_PRESETS, twinPresetById`）、`voice`（`renderTwinVoice, renderTwinNote`）、以及上面全部 `engine` 函数。

## 2. 状态模型（`params.js`）

### 2.1 默认状态字段与取值范围（`defaultTwinState`）

| 字段 | 子字段 | 范围 | 说明 |
|---|---|---|---|
| `osc1/2/3` | `wave` | `WAVES` | 波形（见 2.3） |
| | `unison` | 1–8 | 叠加声部数 |
| | `detune` | 0–100 | 声部间失谐（cents，按 spread 分配） |
| | `phase` | 0–1 | 起始相位 |
| | `level` | 0–1 | 输出音量 |
| | `pan` | -1–1 | 声像 |
| | `wt` | 0–7（整数） | 波表索引 |
| `filter1/2` | `type` | `FILTER_TYPES` | 滤波类型 |
| | `cutoff` | 40–18000 Hz | 截止频率 |
| | `res` | 0–0.95 | 共振 |
| | `drive` | 0–12 | 过载驱动（**当前未接入 DSP**） |
| `filterRoute` | | `serial`\|`parallel` | 两级滤波串/并联 |
| `env1/2` | `attack` | 0.001–4 s | |
| | `decay` | 0.01–6 s | |
| | `sustain` | 0–1 | |
| | `release` | 0.01–8 s | |
| `lfo1/2` | `rate` | 0.02–32 Hz | |
| | `amount` | 0–1 | 调制深度 |
| | `sync` | bool | 速度同步 |
| | `shape` | `sine`\|`square`\|`saw` | 波形（**UI 仅显示此三**） |
| `glide` | | 0–0.6 s | 滑音 |
| `voices` | | 1–16 | 最大复音 |
| `gain` | | 0–1.5 | 主输出 |
| `chorus` / `delay` / `reverb` | | 0–1 | FX 量（**实时引擎为粗略 delay-tap，离线引擎忽略**） |
| `mods` | `[{src,dst,amount}]` | 最多 12 条 | 调制矩阵 |

### 2.2 枚举（`params.js` 导出）

- `WAVES = ['saw','square','tri','sine','noise','wt0'..'wt7']`
- `FILTER_TYPES = ['lowpass','highpass','bandpass']`
- `FILTER_ROUTES = ['serial','parallel']`
- `MOD_SOURCES = ['env1','env2','lfo1','lfo2','vel']`
- `MOD_DESTS = ['cutoff','res','osc1Level','osc2Level','osc3Level','osc1Detune','pan','amp']`
- `WAVETABLES`：8 张 2048 点波表（`buildWavetable` 由谐波配方生成）

### 2.3 `normalizeTwinState(state)`

把任意输入收敛为合法状态：越界/非法值回退到默认值（`clamp(n,min,max,fallback)` 对非有限值返回 fallback）。`mods` 过滤非法 src/dst、amount 限幅 -1..1、截断 12 条。

## 3. 几何/绘图 API（`twin-ui.js`，纯函数，有单测）

| 函数 | 作用 |
|---|---|
| `freqToX(freq)` / `xToFreq(x)` | 频率↔X 轴（对数） |
| `nodeY(res)` / `yToRes(y)` | 共振↔Y 轴 |
| `filterCurve(f)` / `serialCurve(f1,f2)` | 滤波响应曲线点 |
| `toPath(pts)` | 点集→ SVG path |
| `envPoints(env)` / `envPath(env)` | 包络点与路径（A/D/H/R 四个点） |
| `lfoPath(shape)` | LFO 波形缩略图 |
| `wavePath(wave)` | 波形缩略图 |
| `xToSec(x)` | 包络图 X↔秒 |
| `WAVE_CHOICES` | UI 波形菜单项 |

> `twin-ui.js` 为纯几何，禁止改动逻辑（已有 `twin-ui.test.mjs` 通过）。新增波形/形状只扩展 `WAVE_CHOICES` 与对应 `wavePath`/`lfoPath` 分支。

## 4. 状态编辑组合式（`twin-patch.js`）

`useTwinPatch(props)` 暴露：

| 成员 | 作用 |
|---|---|
| `state` | 响应式归一化状态（computed） |
| `commit(next)` | `props.track.twinState = normalizeTwinState(next); updateTwinPatch(props.track)` |
| `setOsc(key, k, v)` / `setFilt(key, k, v)` / `setLfo(key, k, v)` | 局部字段提交 |
| `pct(v)` | 0–1 → 百分比文本 |
| `logUnit(v)` / `fromLog(v)` | 对数刻度（旋钮用） |
| `waveName(w)` / `cycleWave(key)` / `toggleOsc(osc)` | 波形/开关辅助 |
| `remembered` | 静音前记忆的 FX 量（用于 `toggleFx`） |

## 5. UI 组件接口

### 5.1 `plugin-twin.vue`（顶栏）
- props：`track`
- 内容：TWIN 字标、预设步进器、Panel/List 切换、输出 dB。脚本逻辑未动。

### 5.2 `plugin-twin-panel.vue`（主面板，FabFilter Twin3 风格）
- props：`track`（必需）
- 布局：4 列网格（oscs | center 滤波/包络图 | side LFO 表盘+Mod EG | fx 2 列旋钮）+ 底部调制架（XY pad + 5 个调制源 tile）+ 键盘。
- 交互（均已验证可提交）：
  - 旋钮垂直拖拽改值（`dragValue`，已修复 uni-h5 下 `clientY` 缺失 → NaN 不生效的问题）
  - 滤波器图拖拽节点（`onFilterDown`）、包络图拖点（`onEnvDown`）、XY pad（`onXy`）
  - 调制源 tile 拖拽到 `[data-dst]` 目标建立调制（`onSrcDown` → `upsertMod`）
  - 波形按钮弹菜单（`toggleWave`/`chooseWave`）、LFO 弹窗（`openLfoPopup`）、FX 弹窗（`openFx`）
  - 键盘 `play(pitch)` 触发试听（`previewNoteOn/Off`）
- 本地状态：`activeFilt, activeEnv, selectedSrc, lastLfo, waveFor, popup, ghost, tip, held`

### 5.3 `plugin-twin-list.vue`（列表视图）
- 紧凑列表回退；脚本逻辑未动。

## 6. 预设系统（`presets.js`）

- `TWIN_PRESETS`：预设数组
- `twinPresetById(id)`：按 id 取预设
- 接入：`session.js` 的 preset stepper 通过 `commit` 套用。

## 7. 音频引擎集成点

- `src/audio/mixer-graph.js`：`trackInputNode(graph, trackId)` 提供每条轨道的输入节点，worklet 连到它。
- `session.js`：`loadTwin(track)` 初始化 `twinState`；`updateTwinPatch(track)` 重新归一化、标记 dirty、推到音频图（`updateTwinState`）。
- 实时引擎：`worklet-source.js`（AudioWorkletProcessor `daw-twin`），一个 processor 实例服务整条轨道的所有 voice，state 通过 `port` 下发。
- 离线引擎：`voice.js`（`renderTwinVoice`/`renderTwinNote`），单声部离线条带，供回退与导出。两引擎本应共享同一套 DSP，但**当前实时引擎缺少 LFO / 调制矩阵 / env2 / 声像 / 波表 / 滤波调制**（见 §8）。

## 8. 已知缺陷（重做功能时的修复目标）

1. **实时≠离线**：worklet 未实现 LFO、调制矩阵、env2、pan、cutoff/res 调制、波表（wt 全部退化为 saw）。
2. **FX 失效**：`drive` 从未接入；`chorus/delay/reverb` 在 worklet 中是粗略 delay-tap，在离线 `voice.js` 中被完全忽略。
3. **波表为整数索引**：无 Vital 式连续变形（morph）。
4. **滤波器仅三种基础类型**；无 12/24dB、notch、shelf、comb。
5. **LFO 仅 3 种形状**（sine/square/saw）；无 tri、sample&hold 等。

## 9. 测试面

- `twin-ui.test.mjs`：几何往返（freq/x、env 点、路径）— 禁止回归
- `synth-voice.test.mjs`：离线 voice 渲染（峰值、静音、包络）
- `_xtest/`：CDP 无头交互探针（`probe-twin-verify.mjs` 验证旋钮/调制/FX 提交；`cdp.mjs`/`probe-shot.mjs`/`setup-twin.js` 为基座）

---
*下一步：基于 Vital（连续波表变形、滤波 drive、FX 链、更多 LFO 形状）与 Surge（多滤波类型、FX 链）重做 §8 所列功能，并同步在 §5 UI 暴露，保持极简高级风格。*

## 10. 增强后状态（已按 Vital / Surge 参考重做）

> 重做目标：让 Twin 成为真正可发声、听感与界面一致的合成器，并补齐 §8 缺陷。

### 10.1 实时引擎与离线引擎已对齐（`worklet-source.js` ↔ `voice.js`）
- 两引擎现共享同一套 DSP：3 振荡器（波表+unison+detune+pan）、2 滤波器、2 ADSR、2 LFO、调制矩阵、声像。
- 修复关键回归：每采样重算滤波器系数时**保留延迟线状态**（此前 `makeFilt`/`Object.assign` 把 `z1/z2` 清零，导致 biquad 退化成 3-tap FIR，输出被削弱约 200× 且失去共振极点）。现用 `updateFilter()` 保留极点。
- 波表：worklet 内联生成与 `params.js` 完全一致的 8 张波表；两引擎均支持**连续波表变形**（`wt + wtPos` 相邻表交叉淡入）。
- LFO：两引擎均支持 `sine/tri/square/saw/sah`，S&H 为逐周期确定性随机保持。
- 滤波 drive：两引擎均对每级滤波输出做 `tanh` 波形整形（`driveShape`）。
- 全局 FX 链（worklet 为全局、voice.js 为每音符近似）：chorus（调制延时）→ delay（反馈）→ reverb（4 线 FDN + 阻尼）。`drive/chorus/delay/reverb` 现已真实生效，单位测试断言 FX 改变输出。

### 10.2 新增参数（`params.js`）
- `osc*.wtPos`（0–1，连续变形，默认 0）
- `FILTER_TYPES` 扩展：`lowpass/low12/highpass/high12/bandpass/notch/shelf`（24dB 类型级联两级 biquad；notch/shelf 单级）
- `LFO_SHAPES = ['sine','tri','square','saw','sah']`，`normLfo` 接受新形状
- `MOD_DESTS` 扩展：`f1Drive`、`f2Drive`（每滤波器驱动调制）

### 10.3 UI 暴露（§5 面板，保持 FabFilter Twin3 极简风）
- 滤波类型药丸扩展到 7 种（LP/LP12/HP/HP12/BP/NOT/SH）
- LFO 弹窗新增 5 个波形选择按钮（正弦/三角/方波/锯齿/采样保持），缩略图随形状变化（`twin-ui.js` 的 `lfoPath` 已扩展）
- 波形菜单中当选中波表时显示 **Morph** 滑块，绑定 `wtPos`
- 滤波器响应曲线 `filterDb` 为 notch 绘制凹陷、为 high12 正确斜率
- `twin-ui.js` 仍为纯几何、未改逻辑，单测保持通过

### 10.4 验证
- `synth-voice.test.mjs`：新增 FX 生效、波表变形、notch 差异断言，全部通过
- `twin-ui.test.mjs`：几何往返通过
- 无头 worklet 探针（`_xtest/probe-worklet.mjs`）：stub `AudioWorkletProcessor` 后驱动 DSP，baseline/FX/notch/wtMorph/sah 均无 NaN 且输出合理（peak ≈ 0.35）
- 浏览器 CDP 探针（`_xtest/probe-twin-verify.mjs`、`probe-twin-ui2.mjs`）：旋钮/FX/调制拖拽持久化、LFO 弹窗、7 滤波药丸、5 LFO 形状、Morph 滑块均工作，无控制台错误

### 10.5 已知边界 / 可选深化
- 离线 `voice.js` 的 FX 为每音符近似（无跨音符尾音共享）；实时 worklet 的 FX 为全局正确实现。导出混音走离线路径，FX 听感近似。
- 项目另有独立的 `src/dsp/vital-lite/`（Vital 官方 FX/滤波器 worklet 端口：reverb/chorus/flanger/phaser/delay/distortion/compressor/equalizer/filter）。当前 Twin 使用自带的轻量集成 FX；若需更高保真，可将 Twin 的 FX 发送路由到 vital-lite 各独立 worklet 节点（更大重构，留作后续）。
- 未引入 Surge 的 dual-scene、Vital 的完整调制 remap/DAHDSR；当前调制矩阵已覆盖 §2.3 目标。

