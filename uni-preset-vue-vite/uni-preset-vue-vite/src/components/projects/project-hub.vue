<template>
  <view v-if="session.projectManagerOpen" class="hub-veil" @click.self="closeHub">
    <view class="hub" role="dialog" aria-label="Projects" @click="menuKey = ''">
      <view class="rail">
        <view class="rail-head">
          <text class="rail-title">Projects</text>
        </view>
        <view class="nav-list">
          <view
            v-for="item in SECTIONS"
            :key="item.id"
            class="nav"
            :class="{ on: hub.section === item.id }"
            @click="go(item.id)"
          >
            <daw-icon :name="item.icon" :size="18" />
            <text class="nav-label">{{ item.label }}</text>
            <text v-if="item.id === 'recovery' && hub.autosaves.length" class="nav-count">{{ hub.autosaves.length }}</text>
          </view>
        </view>
        <view class="rail-fill" />
        <view class="acct" :class="{ on: hub.section === 'account' }" @click="go('account')">
          <view class="avatar" :class="{ guest: !cloudAuth.user }">
            <text v-if="cloudAuth.user">{{ accountInitial(cloudAuth.user, cloudAuth.usage) }}</text>
            <daw-icon v-else name="user" :size="16" />
          </view>
          <view class="acct-text">
            <text class="acct-name">{{ cloudAuth.user ? accountName : 'Guest' }}</text>
            <text class="acct-sub">{{ cloudAuth.user ? usageLine : 'Sign in to sync' }}</text>
          </view>
        </view>
      </view>

      <view class="main">
        <view class="top">
          <view v-if="hub.detail && hub.section === 'discover'" class="icon-btn" title="Back" aria-label="Back" @click="hub.detail = null">
            <daw-icon name="back" :size="18" />
          </view>
          <text class="top-title">{{ topTitle }}</text>
          <view class="top-actions">
            <view class="btn ghost" :class="{ off: !!hub.busy }" @click="startNewProject">
              <daw-icon name="plus" :size="16" /><text>New</text>
            </view>
            <view class="btn ghost wide-only" @click="openProjectFile">
              <daw-icon name="file" :size="16" /><text>Open file</text>
            </view>
            <view class="btn ghost wide-only" @click="importMidi">
              <daw-icon name="note" :size="16" /><text>Import MIDI</text>
            </view>
            <view class="icon-btn" title="Close" aria-label="Close" @click="closeHub">
              <daw-icon name="close" :size="18" />
            </view>
          </view>
        </view>

        <view class="body hub-scroll">
          <!-- This project -->
          <view v-if="hub.section === 'current'" class="stack">
            <view class="hero">
              <view class="cover big" :style="coverStyle(session.projectName)">
                <svg class="cover-notes" viewBox="0 0 100 60" preserveAspectRatio="none">
                  <rect v-for="(bar, i) in currentSummary.preview" :key="i" :x="4 + bar[0] * 92" :y="6 + bar[1] * 46" :width="Math.max(1.6, bar[2] * 92)" height="3" rx="1.2" />
                </svg>
              </view>
              <view class="hero-main">
                <input
                  class="title-input"
                  type="text"
                  maxlength="80"
                  placeholder="Project name"
                  :value="draft.title"
                  @input="draft.title = valueOf($event)"
                  @focus="setTyping(true)"
                  @blur="commitTitle"
                  @confirm="commitTitle"
                  @keydown.enter="commitTitle"
                >
                <view class="status">
                  <view class="status-dot" :class="statusTone" />
                  <text>{{ statusText }}</text>
                </view>
                <text class="facts">{{ factsLine }}</text>
              </view>
            </view>

            <view class="row-actions-main">
              <view class="btn primary" :class="{ off: !!hub.busy }" @click="onSave">
                <daw-icon :name="session.unsaved || !session.projectId ? 'save' : 'check'" :size="16" />
                <text>{{ hub.busy === 'save' ? 'Saving…' : (session.unsaved || !session.projectId ? 'Save' : 'Saved') }}</text>
              </view>
              <view class="btn" :class="{ off: !!hub.busy }" @click="syncCurrentToCloud">
                <daw-icon name="cloud" :size="16" />
                <text>{{ hub.busy === 'upload' ? 'Uploading…' : (session.cloudId ? 'Sync to cloud' : 'Save to cloud') }}</text>
              </view>
              <view class="menu-anchor">
                <view class="btn" @click.stop="toggleMenu('current')">
                  <text>More</text>
                  <daw-icon name="chevron" :size="14" />
                </view>
                <view v-if="menuKey === 'current'" class="menu" @click.stop>
                  <view class="menu-item" @click="onSaveCopy"><daw-icon name="copy" :size="16" /><text>Save as copy…</text></view>
                  <view class="menu-item" @click="onDownload"><daw-icon name="download" :size="16" /><text>Download project file</text></view>
                  <view class="menu-item" @click="onExportWav"><daw-icon name="wave" :size="16" /><text>Export WAV</text></view>
                </view>
              </view>
            </view>

            <view class="card">
              <view class="field">
                <view class="label-row">
                  <text class="label">Description</text>
                  <text class="hint">{{ draft.description.length }} / {{ META_LIMITS.description }}</text>
                </view>
                <textarea
                  class="area"
                  :maxlength="META_LIMITS.description"
                  placeholder="What is this piece about? Instruments, mood, how it was made…"
                  :value="draft.description"
                  @input="draft.description = valueOf($event)"
                  @focus="setTyping(true)"
                  @blur="commitMeta"
                />
              </view>
              <view class="two">
                <view class="field">
                  <text class="label">Creator</text>
                  <input
                    class="input"
                    type="text"
                    maxlength="40"
                    :placeholder="cloudAuth.user ? 'Your name on Discover' : 'Your name (needed to publish)'"
                    :value="draft.creator"
                    @input="draft.creator = valueOf($event)"
                    @focus="setTyping(true)"
                    @blur="commitMeta"
                  >
                </view>
                <view class="field">
                  <text class="label">Tags</text>
                  <input
                    class="input"
                    type="text"
                    maxlength="160"
                    placeholder="ambient, piano, film"
                    :value="draft.tags"
                    @input="draft.tags = valueOf($event)"
                    @focus="setTyping(true)"
                    @blur="commitMeta"
                  >
                </view>
              </view>
            </view>

            <view class="card publish">
              <view class="publish-head">
                <daw-icon name="globe" :size="18" />
                <text class="card-title">Publish to Discover</text>
                <text class="pill" :class="{ live: published.published }">{{ published.published ? 'Live' : 'Not published' }}</text>
              </view>
              <text class="muted">{{ published.published
                ? 'Anyone with the link can open a copy. Your original stays yours. Updated ' + ago(published.at) + '.'
                : 'Share this project with everyone. Listeners open their own copy; your original stays yours.' }}</text>
              <view v-if="published.published" class="link-row">
                <daw-icon name="link" :size="16" />
                <text class="link-text">{{ published.link }}</text>
                <view class="btn small" @click="copyText(published.link)">Copy link</view>
              </view>
              <text v-if="publishIssue" class="issue">{{ publishIssue }}</text>
              <view class="row-actions-main">
                <view class="btn primary" :class="{ off: !!hub.busy }" @click="onPublish">
                  <text>{{ hub.busy === 'publish' ? 'Publishing…' : (published.published ? 'Update public copy' : 'Publish') }}</text>
                </view>
                <view v-if="published.published" class="btn danger-ghost" :class="{ off: !!hub.busy }" @click="unpublishCurrent">Unpublish</view>
              </view>
              <text class="fine">Up to 10 MB with audio · 20 published projects per person · title and creator name are shown publicly.</text>
            </view>
          </view>

          <!-- My projects -->
          <view v-else-if="hub.section === 'library'" class="stack">
            <view class="toolbar">
              <view class="search">
                <daw-icon name="search" :size="16" />
                <input
                  class="search-input"
                  type="text"
                  placeholder="Search projects"
                  :value="hub.search"
                  @input="hub.search = valueOf($event)"
                  @focus="setTyping(true)"
                  @blur="setTyping(false)"
                >
              </view>
              <view class="seg">
                <view class="seg-item" :class="{ on: hub.filter === 'all' }" @click="hub.filter = 'all'">All</view>
                <view class="seg-item" :class="{ on: hub.filter === 'device' }" @click="hub.filter = 'device'">This device</view>
                <view class="seg-item" :class="{ on: hub.filter === 'cloud' }" @click="hub.filter = 'cloud'">Cloud</view>
              </view>
              <view class="seg">
                <view class="seg-item" :class="{ on: hub.sort === 'recent' }" @click="hub.sort = 'recent'">Recent</view>
                <view class="seg-item" :class="{ on: hub.sort === 'name' }" @click="hub.sort = 'name'">A–Z</view>
              </view>
            </view>

            <view v-if="hub.guest.length" class="banner">
              <text class="grow">{{ hub.guest.length === 1 ? '1 project was' : hub.guest.length + ' projects were' }} saved on this device before you signed in.</text>
              <view class="btn small" :class="{ off: !!hub.busy }" @click="adoptAllGuests">Move to my account</view>
            </view>
            <view v-if="!cloudAuth.user" class="banner">
              <text class="grow">You are using the guest library on this device. Sign in to keep projects in the cloud.</text>
              <view class="btn small" @click="go('account')">Sign in</view>
            </view>
            <view v-if="hub.cloudError" class="banner warn">
              <text class="grow">{{ hub.cloudError }}</text>
              <view class="btn small" @click="refreshLibrary">Retry</view>
            </view>

            <view v-if="!libraryItems.length" class="empty">
              <text class="empty-title">{{ hub.search ? 'No projects match.' : 'No saved projects yet.' }}</text>
              <text class="muted">{{ hub.search ? 'Try another name.' : 'Save the open project to keep it here.' }}</text>
              <view v-if="!hub.search" class="btn primary" @click="onSave">Save this project</view>
            </view>

            <view class="list">
              <view
                v-for="item in libraryItems"
                :key="item.key"
                class="item"
                :class="{ current: isCurrent(item) }"
                @click="onOpenItem(item)"
              >
                <view class="thumb" :style="coverStyle(item.name)"><text>{{ initial(item.name) }}</text></view>
                <view class="item-main">
                  <input
                    v-if="renaming === item.key"
                    class="input rename"
                    type="text"
                    maxlength="80"
                    :value="renameDraft"
                    :focus="true"
                    @click.stop
                    @input="renameDraft = valueOf($event)"
                    @focus="setTyping(true)"
                    @blur="commitRename(item)"
                    @confirm="commitRename(item)"
                    @keydown.enter="commitRename(item)"
                  >
                  <text v-else class="item-name">{{ item.name }}</text>
                  <text v-if="item.description" class="item-desc">{{ item.description }}</text>
                  <view class="item-sub">
                    <text v-if="isCurrent(item)" class="pill live">Current</text>
                    <text class="pill">{{ whereLabel(item.where) }}</text>
                    <text v-if="item.published" class="pill">Published</text>
                    <text>{{ ago(item.updatedAt) }}</text>
                    <text v-if="item.sync === 'cloud-newer'" class="note-warn">Cloud copy is newer</text>
                    <text v-else-if="item.sync === 'local-newer'" class="note-warn">Not synced</text>
                  </view>
                </view>
                <view class="item-actions" @click.stop>
                  <view v-if="!isCurrent(item)" class="btn small" @click="onOpenItem(item)">Open</view>
                  <view class="menu-anchor">
                    <view class="icon-btn" title="More" aria-label="More" @click.stop="toggleMenu(item.key)">
                      <daw-icon name="more-h" :size="18" />
                    </view>
                    <view v-if="menuKey === item.key" class="menu right" @click.stop>
                      <view class="menu-item" @click="startRename(item)"><daw-icon name="pencil" :size="16" /><text>Rename</text></view>
                      <view v-if="item.id" class="menu-item" @click="menuDo(() => duplicateLibraryItem(item))"><daw-icon name="copy" :size="16" /><text>Duplicate</text></view>
                      <view v-if="item.id && cloudAuth.user" class="menu-item" @click="menuDo(() => uploadLibraryItem(item))"><daw-icon name="upload" :size="16" /><text>{{ item.cloudId ? 'Update cloud copy' : 'Upload to cloud' }}</text></view>
                      <view v-if="item.id" class="menu-item danger" @click="menuDo(() => deleteLibraryItem(item, 'device'))"><daw-icon name="trash" :size="16" /><text>Delete from this device</text></view>
                      <view v-if="item.cloudId" class="menu-item danger" @click="menuDo(() => deleteLibraryItem(item, 'cloud'))"><daw-icon name="trash" :size="16" /><text>Delete cloud copy</text></view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <!-- Recovery -->
          <view v-else-if="hub.section === 'recovery'" class="stack">
            <text class="muted">Autosaves are written while you work and never replace a saved project. The last three per project are kept on this device.</text>
            <view v-if="!hub.autosaves.length" class="empty">
              <text class="empty-title">Nothing to recover.</text>
              <text class="muted">Unsaved edits show up here automatically.</text>
            </view>
            <view class="list">
              <view v-for="row in hub.autosaves" :key="row.id" class="item" @click="openRecovery(row)">
                <view class="thumb" :style="coverStyle(row.sourceName || row.name)"><daw-icon name="history" :size="16" /></view>
                <view class="item-main">
                  <text class="item-name">{{ row.sourceName || row.name || 'Untitled' }}</text>
                  <view class="item-sub"><text>{{ ago(row.updatedAt) }} · {{ when(row.updatedAt) }}</text></view>
                </view>
                <view class="item-actions" @click.stop>
                  <view class="btn small" @click="openRecovery(row)">Open</view>
                  <view v-if="row.id !== 'as_local'" class="icon-btn" title="Delete" aria-label="Delete" @click="deleteRecovery(row)">
                    <daw-icon name="trash" :size="16" />
                  </view>
                </view>
              </view>
            </view>
          </view>

          <!-- Discover -->
          <view v-else-if="hub.section === 'discover'" class="stack">
            <template v-if="hub.detail">
              <view class="detail">
                <view class="cover wide" :style="coverStyle(hub.detail.id)">
                  <svg class="cover-notes" viewBox="0 0 100 60" preserveAspectRatio="none">
                    <rect v-for="(bar, i) in hub.detail.preview" :key="i" :x="4 + bar[0] * 92" :y="6 + bar[1] * 46" :width="Math.max(1.6, bar[2] * 92)" height="3" rx="1.2" />
                  </svg>
                </view>
                <text class="detail-title">{{ hub.detail.title }}</text>
                <text class="muted">by {{ hub.detail.creator }} · {{ when(hub.detail.createdAt, true) }}</text>
                <text class="facts">{{ publicFacts(hub.detail) }}</text>
                <text v-if="hub.detail.description" class="detail-desc">{{ hub.detail.description }}</text>
                <view v-if="hub.detail.tags.length" class="tags">
                  <text v-for="tag in hub.detail.tags" :key="tag" class="tag">#{{ tag }}</text>
                </view>
                <view class="row-actions-main">
                  <view class="btn primary" :class="{ off: !!hub.busy }" @click="openPublic(hub.detail)">
                    <text>{{ hub.busy === 'open' ? 'Opening…' : 'Open a copy' }}</text>
                  </view>
                  <view class="btn" @click="copyText(publicLink(hub.detail.id))"><daw-icon name="link" :size="16" /><text>Copy link</text></view>
                  <view v-if="canManagePublic(hub.detail)" class="btn danger-ghost" @click="unpublishDetail(hub.detail)">Unpublish</view>
                  <view v-else class="btn ghost" @click="reportDetail(hub.detail)"><daw-icon name="flag" :size="16" /><text>Report</text></view>
                </view>
              </view>
            </template>
            <template v-else>
              <view class="toolbar">
                <view class="search">
                  <daw-icon name="search" :size="16" />
                  <input
                    class="search-input"
                    type="text"
                    placeholder="Search titles, creators, descriptions"
                    :value="hub.discoverSearch"
                    @input="onDiscoverSearch($event)"
                    @focus="setTyping(true)"
                    @blur="setTyping(false)"
                  >
                </view>
                <view class="seg">
                  <view class="seg-item" :class="{ on: hub.discoverSort === 'new' }" @click="setDiscoverSort('new')">Newest</view>
                  <view class="seg-item" :class="{ on: hub.discoverSort === 'popular' }" @click="setDiscoverSort('popular')">Popular</view>
                </view>
              </view>
              <view v-if="hub.discoverError" class="empty">
                <text class="empty-title">Discover is not reachable right now.</text>
                <text class="muted">{{ hub.discoverError }}</text>
                <view class="btn" @click="loadDiscover()">Try again</view>
              </view>
              <view v-else-if="!hub.discover.length && !hub.discoverLoading" class="empty">
                <text class="empty-title">{{ hub.discoverSearch ? 'Nothing matches.' : 'Nothing published yet.' }}</text>
                <text class="muted">Publish a project from This project and it appears here for everyone.</text>
              </view>
              <view class="grid">
                <view v-for="row in hub.discover" :key="row.id" class="tile" @click="hub.detail = row">
                  <view class="cover" :style="coverStyle(row.id)">
                    <svg class="cover-notes" viewBox="0 0 100 60" preserveAspectRatio="none">
                      <rect v-for="(bar, i) in row.preview" :key="i" :x="4 + bar[0] * 92" :y="6 + bar[1] * 46" :width="Math.max(1.6, bar[2] * 92)" height="3" rx="1.2" />
                    </svg>
                  </view>
                  <text class="tile-title">{{ row.title }}</text>
                  <text class="tile-sub">{{ row.creator }}</text>
                  <text class="tile-facts">{{ publicFacts(row) }}</text>
                </view>
                <template v-if="hub.discoverLoading && !hub.discover.length">
                  <view v-for="n in 6" :key="'s' + n" class="tile skeleton"><view class="cover" /></view>
                </template>
              </view>
              <view v-if="hub.discoverMore && !hub.discoverError" class="more-row">
                <view class="btn" :class="{ off: hub.discoverLoading }" @click="loadDiscover(true)">{{ hub.discoverLoading ? 'Loading…' : 'Show more' }}</view>
              </view>
            </template>
          </view>

          <!-- Examples -->
          <view v-else-if="hub.section === 'examples'" class="stack">
            <view class="grid">
              <view class="tile" @click="openExample">
                <view class="cover" :style="coverStyle('Re-Time')">
                  <svg class="cover-notes" viewBox="0 0 100 60" preserveAspectRatio="none">
                    <rect v-for="(bar, i) in demoSummary.preview" :key="i" :x="4 + bar[0] * 92" :y="6 + bar[1] * 46" :width="Math.max(1.6, bar[2] * 92)" height="3" rx="1.2" />
                  </svg>
                </view>
                <text class="tile-title">Re-Time</text>
                <text class="tile-sub">Orchestral demo</text>
                <text class="tile-facts">Strings, winds and brass with phrasing lanes. Opens as a new, unsaved project.</text>
              </view>
              <view class="tile" @click="startNewProject">
                <view class="cover blank"><daw-icon name="plus" :size="28" /></view>
                <text class="tile-title">Blank project</text>
                <text class="tile-sub">Start from scratch</text>
                <text class="tile-facts">One instrument track, ready to record.</text>
              </view>
            </view>
          </view>

          <!-- Account -->
          <view v-else-if="hub.section === 'account'" class="stack narrow-col">
            <template v-if="cloudAuth.user">
              <view class="card">
                <view class="acct-big">
                  <view class="avatar big"><text>{{ accountInitial(cloudAuth.user, cloudAuth.usage) }}</text></view>
                  <view class="acct-text">
                    <text class="card-title">{{ accountName }}</text>
                    <text class="muted">{{ cloudAuth.user.email }}</text>
                  </view>
                </view>
                <view v-if="cloudAuth.usage" class="meter"><view class="meter-fill" :style="{ width: Math.round(cloudAuth.usage.ratio * 100) + '%' }" /></view>
                <text class="muted">{{ usageLine }}</text>
                <text class="muted">Projects you save on this device belong to this account. Save to cloud keeps a copy you can open anywhere.</text>
                <view class="row-actions-main">
                  <view class="btn" :class="{ off: cloudAuth.busy }" @click="onSignOut">Sign out</view>
                </view>
              </view>
            </template>
            <template v-else>
              <view class="card">
                <text class="card-title">Sign in</text>
                <text class="muted">Without an account, projects stay in this device's guest library. Signing in keeps your account's projects separate and lets you sync them.</text>
                <input class="input" type="email" placeholder="Email" :value="cloudAuth.email" @input="cloudAuth.email = valueOf($event)" @focus="setTyping(true)" @blur="setTyping(false)">
                <input class="input" type="password" placeholder="Password, 6 characters or more" :value="cloudAuth.password" @input="cloudAuth.password = valueOf($event)" @focus="setTyping(true)" @blur="setTyping(false)" @keydown.enter="cloudSignIn">
                <input class="input" type="text" placeholder="Display name (for new accounts)" :value="cloudAuth.displayName" @input="cloudAuth.displayName = valueOf($event)" @focus="setTyping(true)" @blur="setTyping(false)">
                <text v-if="cloudAuth.error" class="issue">{{ cloudAuth.error }}</text>
                <text v-if="cloudAuth.notice" class="ok">{{ cloudAuth.notice }}</text>
                <view class="row-actions-main">
                  <view class="btn primary" :class="{ off: cloudAuth.busy }" @click="cloudSignIn">Sign in</view>
                  <view class="btn" :class="{ off: cloudAuth.busy }" @click="cloudSignUp">Create account</view>
                  <view class="btn ghost" :class="{ off: cloudAuth.busy }" @click="cloudSendLink">Email me a link</view>
                </view>
              </view>
            </template>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import DawIcon from '../daw-icon.vue'
import {
  session,
  setProjectName,
  updateProjectMeta,
  openMidiFilePicker,
  exportProjectWav,
  shareProjectFile,
  setTyping
} from '../../store/session.js'
import { createDemoProject } from '../../model/demo-project.js'
import {
  cloudAuth,
  refreshCloudAuth,
  cloudSignIn,
  cloudSignUp,
  cloudSendLink,
  cloudSignOut,
  accountInitial
} from '../../store/cloud-auth.js'
import {
  hub,
  SECTIONS,
  closeHub,
  refreshLibrary,
  mergeLibrary,
  filterLibrary,
  openLibraryItem,
  renameLibraryItem,
  duplicateLibraryItem,
  deleteLibraryItem,
  uploadLibraryItem,
  adoptAllGuests,
  saveNow,
  saveCopy,
  syncCurrentToCloud,
  startNewProject,
  openExample,
  openProjectFile,
  openRecovery,
  deleteRecovery,
  publishState,
  publishProblem,
  publishCurrent,
  unpublishCurrent,
  copyText,
  loadDiscover,
  canManagePublic,
  openPublic,
  reportDetail,
  unpublishDetail,
  openSharedLinkFromUrl,
  defaultCreator,
  setCreator
} from '../../store/project-hub.js'
import { META_LIMITS } from '../../lib/project-io.js'
import { formatBytes } from '../../lib/cloud-projects.js'
import { projectSummary, coverHue, formatDuration, publicLink } from '../../lib/public-projects.js'

const menuKey = ref('')
const renaming = ref('')
const renameDraft = ref('')
const draft = reactive({ title: '', description: '', creator: '', tags: '' })

function valueOf (event) {
  if (event && event.detail && event.detail.value != null) return String(event.detail.value)
  return String((event && event.target && event.target.value) || '')
}

function syncDraft () {
  const meta = session.projectMeta || {}
  draft.title = session.projectName || ''
  draft.description = meta.description || ''
  draft.creator = meta.creator || defaultCreator() || ''
  draft.tags = (meta.tags || []).join(', ')
}

function commitTitle () {
  setTyping(false)
  const next = draft.title.trim()
  if (!next) {
    draft.title = session.projectName
    return
  }
  setProjectName(next)
  draft.title = session.projectName
}

function commitMeta () {
  setTyping(false)
  const meta = session.projectMeta || {}
  if (draft.creator.trim() && draft.creator.trim() !== meta.creator) setCreator(draft.creator)
  updateProjectMeta({ description: draft.description, tags: draft.tags })
}

const topTitle = computed(() => {
  if (hub.section === 'account') return cloudAuth.user ? 'Account' : 'Sign in'
  if (hub.section === 'discover' && hub.detail) return 'Discover'
  const item = SECTIONS.find((s) => s.id === hub.section)
  return item ? item.label : 'Projects'
})

const accountName = computed(() => (cloudAuth.usage && cloudAuth.usage.displayName) || (cloudAuth.user && cloudAuth.user.email) || 'Account')
const usageLine = computed(() => {
  const usage = cloudAuth.usage
  if (!usage) return 'Signed in'
  return formatBytes(usage.usedBytes) + ' of ' + formatBytes(usage.quotaBytes) + ' cloud space used'
})

const currentSummary = computed(() => {
  if (!session.projectManagerOpen) return { preview: [], bpm: 0, durationSec: 0, trackCount: 0 }
  return projectSummary({ tempo: session.bpm, tracks: session.tracks, clips: session.clips })
})
let demoCache = null
const demoSummary = computed(() => {
  if (hub.section !== 'examples') return { preview: [] }
  if (!demoCache) {
    const demo = createDemoProject()
    demoCache = projectSummary({ tempo: demo.bpm || 120, tracks: demo.tracks, clips: demo.clips })
  }
  return demoCache
})

const factsLine = computed(() => {
  const s = currentSummary.value
  const tracks = s.trackCount === 1 ? '1 track' : s.trackCount + ' tracks'
  return Math.round(s.bpm) + ' BPM · ' + tracks + ' · ' + formatDuration(s.durationSec)
})

const statusTone = computed(() => {
  if (session.unsaved || !session.projectId) return 'warn'
  return 'ok'
})

const statusText = computed(() => {
  const parts = []
  if (!session.projectId) parts.push('Not saved yet')
  else if (session.unsaved) parts.push('Unsaved changes')
  else parts.push('Saved ' + (cloudAuth.user ? 'to your account' : 'on this device') + (session.savedAt ? ' · ' + ago(session.savedAt) : ''))
  if (session.cloudId) parts.push('In cloud')
  if (!cloudAuth.user) parts.push('Guest library')
  return parts.join(' · ')
})

const published = computed(() => publishState())
const draftProblem = computed(() => {
  if (draft.title.trim().length < 3) return 'Titles need at least 3 characters to publish.'
  if (draft.creator.trim().length < 2) return 'Add a creator name to publish.'
  return ''
})
const publishIssue = computed(() => hub.publishError || draftProblem.value)

const libraryItems = computed(() => filterLibrary(mergeLibrary(hub.local, hub.cloud), {
  search: hub.search,
  sort: hub.sort,
  filter: hub.filter
}))

function isCurrent (item) {
  return (item.id && item.id === session.projectId) || (!item.id && item.cloudId && item.cloudId === session.cloudId)
}

function whereLabel (where) {
  if (where === 'both') return 'Device + Cloud'
  if (where === 'cloud') return 'Cloud'
  return 'This device'
}

function initial (name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?'
}

function coverStyle (seed) {
  const hue = coverHue(seed)
  return {
    background: 'linear-gradient(135deg, hsl(' + hue + ' 42% 30%), hsl(' + ((hue + 48) % 360) + ' 46% 16%))'
  }
}

function publicFacts (row) {
  const parts = []
  if (row.durationSec) parts.push(formatDuration(row.durationSec))
  if (row.bpm) parts.push(Math.round(row.bpm) + ' BPM')
  if (row.trackCount) parts.push(row.trackCount + (row.trackCount === 1 ? ' track' : ' tracks'))
  parts.push(row.opens === 1 ? '1 open' : row.opens + ' opens')
  return parts.join(' · ')
}

function ago (stamp) {
  const t = Number(stamp) || 0
  if (!t) return ''
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return min + ' min ago'
  const hr = Math.round(min / 60)
  if (hr < 24) return hr + ' h ago'
  const day = Math.round(hr / 24)
  if (day < 14) return day === 1 ? 'yesterday' : day + ' days ago'
  return when(t, true)
}

function when (stamp, dateOnly) {
  if (!stamp) return ''
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return ''
  return dateOnly ? date.toLocaleDateString() : date.toLocaleString()
}

function go (section) {
  hub.section = section
  hub.detail = null
  menuKey.value = ''
  if (section === 'discover' && !hub.discover.length) loadDiscover()
  if (section === 'library' || section === 'recovery') refreshLibrary()
  if (section === 'account') refreshCloudAuth()
}

function toggleMenu (key) {
  menuKey.value = menuKey.value === key ? '' : key
}

async function menuDo (task) {
  menuKey.value = ''
  await task()
}

function startRename (item) {
  menuKey.value = ''
  renaming.value = item.key
  renameDraft.value = item.name
}

async function commitRename (item) {
  if (renaming.value !== item.key) return
  setTyping(false)
  renaming.value = ''
  await renameLibraryItem(item, renameDraft.value)
  if (isCurrent(item)) syncDraft()
}

function onOpenItem (item) {
  if (renaming.value === item.key) return
  if (isCurrent(item) && !session.unsaved) {
    closeHub()
    return
  }
  openLibraryItem(item)
}

async function onSave () {
  commitMeta()
  await saveNow()
}

async function onSaveCopy () {
  menuKey.value = ''
  const name = typeof window !== 'undefined'
    ? window.prompt('Save a copy as', (session.projectName || 'Untitled') + ' copy')
    : ''
  if (!name) return
  commitMeta()
  await saveCopy(name)
  syncDraft()
}

async function onDownload () {
  menuKey.value = ''
  commitMeta()
  await shareProjectFile()
}

async function onExportWav () {
  menuKey.value = ''
  await exportProjectWav()
}

async function onPublish () {
  commitTitle()
  commitMeta()
  if (!publishProblem()) await publishCurrent()
  else hub.publishError = publishProblem()
}

async function importMidi () {
  const count = await openMidiFilePicker()
  if (count > 0) closeHub()
}

async function onSignOut () {
  await cloudSignOut()
  hub.section = 'current'
}

let searchTimer = 0
function onDiscoverSearch (event) {
  hub.discoverSearch = valueOf(event)
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadDiscover(), 320)
}

function setDiscoverSort (sort) {
  if (hub.discoverSort === sort) return
  hub.discoverSort = sort
  loadDiscover()
}

function onKey (event) {
  if (!session.projectManagerOpen) return
  if (event.key === 'Escape') {
    if (menuKey.value) menuKey.value = ''
    else if (hub.detail) hub.detail = null
    else closeHub()
    event.stopPropagation()
  }
}

watch(() => session.projectManagerOpen, (open) => {
  if (!open) {
    setTyping(false)
    return
  }
  hub.publishError = ''
  syncDraft()
  refreshLibrary()
  if (hub.section === 'discover' && !hub.discover.length) loadDiscover()
})

watch(() => [session.projectName, session.projectMeta], () => {
  if (session.projectManagerOpen) syncDraft()
})

watch(() => cloudAuth.user && cloudAuth.user.id, () => {
  if (session.projectManagerOpen) refreshLibrary()
  if (hub.section === 'account' && cloudAuth.user) hub.section = 'current'
})

onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true)
  if (session.projectManagerOpen) {
    syncDraft()
    refreshLibrary()
  }
  openSharedLinkFromUrl()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true)
  clearTimeout(searchTimer)
})
</script>

<style scoped>
.hub-veil {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(4, 5, 7, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  --hub-bg: #111214;
  --hub-s1: #17181b;
  --hub-s2: #1e2024;
  --hub-s3: #272a30;
  --hub-line: rgba(255, 255, 255, 0.07);
  --hub-ink: #ecedf1;
  --hub-ink-2: #a2a5ae;
  --hub-ink-3: #6f727c;
  --hub-accent: #6aa8ff;
  --hub-accent-soft: rgba(106, 168, 255, 0.14);
  --hub-ok: #5fd38d;
  --hub-warn: #f0b860;
  --hub-danger: #ef6b6b;
}
.hub {
  width: min(1040px, 100%);
  height: min(720px, calc(100dvh - 32px));
  display: flex;
  background: var(--hub-bg);
  border: 1px solid var(--hub-line);
  border-radius: 16px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  color: var(--hub-ink);
  font-size: 13px;
  overflow: hidden;
}
.hub :deep(.icon) { width: auto; height: auto; flex: none; }
.rail {
  width: 220px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  padding: 18px 12px 12px;
  background: var(--hub-s1);
  border-right: 1px solid var(--hub-line);
}
.rail-head { padding: 2px 10px 16px; }
.rail-title { font-size: 15px; font-weight: 650; letter-spacing: 0.01em; }
.nav-list { display: flex; flex-direction: column; gap: 2px; }
.nav {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 10px;
  color: var(--hub-ink-2);
  cursor: pointer;
  white-space: nowrap;
}
.nav:hover { background: rgba(255, 255, 255, 0.04); color: var(--hub-ink); }
.nav.on { background: var(--hub-accent-soft); color: var(--hub-ink); }
.nav.on :deep(.icon) { color: var(--hub-accent); }
.nav-label { flex: 1; }
.nav-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--hub-s3);
  font-size: 11px;
  line-height: 20px;
  text-align: center;
  color: var(--hub-ink-2);
}
.rail-fill { flex: 1; }
.acct {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid var(--hub-line);
}
.acct:hover, .acct.on { background: rgba(255, 255, 255, 0.04); }
.avatar {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hub-accent);
  color: #0b0c0e;
  font-weight: 700;
}
.avatar.guest { background: var(--hub-s3); color: var(--hub-ink-2); }
.avatar.big { width: 48px; height: 48px; font-size: 18px; }
.acct-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.acct-name, .acct-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acct-name { font-weight: 600; }
.acct-sub { font-size: 11px; color: var(--hub-ink-3); }

.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.top {
  height: 60px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 0 24px;
  border-bottom: 1px solid var(--hub-line);
}
.top-title { flex: 1; font-size: 17px; font-weight: 650; }
.top-actions { display: flex; align-items: center; gap: 6px; }
.body { flex: 1; min-height: 0; padding: 22px 24px 28px; }
.stack { display: flex; flex-direction: column; gap: 16px; }
.narrow-col { max-width: 460px; }

.btn {
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--hub-s2);
  border: 1px solid var(--hub-line);
  color: var(--hub-ink);
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.btn:hover { background: var(--hub-s3); }
.btn.primary { background: var(--hub-accent); border-color: transparent; color: #0a0d12; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.ghost { background: transparent; }
.btn.ghost:hover { background: rgba(255, 255, 255, 0.05); }
.btn.danger-ghost { background: transparent; color: var(--hub-danger); }
.btn.small { height: 30px; padding: 0 12px; font-size: 12px; border-radius: 8px; }
.btn.off { opacity: 0.5; pointer-events: none; }
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--hub-ink-2);
  cursor: pointer;
}
.icon-btn:hover { background: rgba(255, 255, 255, 0.06); color: var(--hub-ink); }

.hero { display: flex; align-items: center; gap: 18px; }
.cover {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 5 / 3;
  background: var(--hub-s2);
}
.cover.big { width: 168px; flex: 0 0 auto; }
.cover.wide { width: 100%; max-width: 520px; border-radius: 14px; }
.cover.blank { display: flex; align-items: center; justify-content: center; color: var(--hub-ink-3); border: 1px dashed var(--hub-s3); background: transparent; }
.cover-notes { position: absolute; inset: 0; width: 100%; height: 100%; fill: rgba(255, 255, 255, 0.78); }
.hero-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.title-input {
  height: 44px;
  font-size: 22px;
  font-weight: 650;
  color: var(--hub-ink);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 10px;
  margin-left: -10px;
}
.title-input:hover { border-color: var(--hub-line); }
.title-input:focus { border-color: var(--hub-accent); background: var(--hub-s1); outline: none; }
.status { display: flex; align-items: center; gap: 8px; color: var(--hub-ink-2); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--hub-ok); }
.status-dot.warn { background: var(--hub-warn); }
.facts { color: var(--hub-ink-3); font-size: 12px; }
.row-actions-main { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--hub-s1);
  border: 1px solid var(--hub-line);
  border-radius: 14px;
}
.card-title { font-size: 14px; font-weight: 650; }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.label-row { display: flex; justify-content: space-between; }
.label { font-size: 12px; color: var(--hub-ink-2); font-weight: 550; }
.hint { font-size: 11px; color: var(--hub-ink-3); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.input, .area, .search-input {
  width: 100%;
  box-sizing: border-box;
  color: var(--hub-ink);
  background: var(--hub-bg);
  border: 1px solid var(--hub-line);
  border-radius: 10px;
  font-size: 13px;
}
.input { height: 40px; padding: 0 12px; }
.area { min-height: 84px; padding: 10px 12px; line-height: 1.45; resize: vertical; }
.input:focus, .area:focus { border-color: var(--hub-accent); outline: none; }
.publish-head { display: flex; align-items: center; gap: 10px; }
.publish-head .card-title { flex: 1; }
.pill {
  height: 20px;
  padding: 0 8px;
  border-radius: 10px;
  background: var(--hub-s3);
  color: var(--hub-ink-2);
  font-size: 11px;
  line-height: 20px;
  white-space: nowrap;
}
.pill.live { background: rgba(95, 211, 141, 0.16); color: var(--hub-ok); }
.muted { color: var(--hub-ink-2); line-height: 1.5; }
.fine { color: var(--hub-ink-3); font-size: 11px; }
.issue { color: var(--hub-warn); font-size: 12px; }
.ok { color: var(--hub-ok); font-size: 12px; }
.link-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 12px;
  border-radius: 10px;
  background: var(--hub-bg);
  border: 1px solid var(--hub-line);
  color: var(--hub-ink-2);
}
.link-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }

.menu-anchor { position: relative; }
.menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 5;
  min-width: 220px;
  padding: 6px;
  background: var(--hub-s2);
  border: 1px solid var(--hub-line);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}
.menu.right { left: auto; right: 0; }
.menu-item {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.menu-item:hover { background: var(--hub-s3); }
.menu-item.danger { color: var(--hub-danger); }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.search {
  flex: 1;
  min-width: 180px;
  height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--hub-s1);
  border: 1px solid var(--hub-line);
  color: var(--hub-ink-3);
}
.search-input { flex: 1; min-width: 0; border: 0; background: transparent; height: 36px; padding: 0; text-align: left; }
.search-input:focus { outline: none; }
.seg {
  display: flex;
  padding: 3px;
  gap: 2px;
  border-radius: 10px;
  background: var(--hub-s1);
  border: 1px solid var(--hub-line);
}
.seg-item {
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  color: var(--hub-ink-2);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.seg-item.on { background: var(--hub-s3); color: var(--hub-ink); }
.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  border-radius: 12px;
  background: var(--hub-accent-soft);
  color: var(--hub-ink);
}
.banner.warn { background: rgba(240, 184, 96, 0.12); }
.grow { flex: 1; min-width: 0; line-height: 1.45; }

.list { display: flex; flex-direction: column; gap: 2px; }
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 8px 8px 8px 10px;
  border-radius: 12px;
  cursor: pointer;
}
.item:hover { background: var(--hub-s1); }
.item.current { background: var(--hub-s1); box-shadow: inset 2px 0 0 var(--hub-accent); }
.thumb {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.86);
}
.item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.item-name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-desc { font-size: 12px; color: var(--hub-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--hub-ink-3); font-size: 12px; }
.note-warn { color: var(--hub-warn); }
.item-actions { display: flex; align-items: center; gap: 4px; }
.rename { height: 34px; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 28px 4px;
}
.empty-title { font-size: 15px; font-weight: 600; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.tile { display: flex; flex-direction: column; gap: 4px; cursor: pointer; min-width: 0; }
.tile .cover { margin-bottom: 6px; transition: transform 0.15s ease; }
.tile:hover .cover { transform: translateY(-2px); }
.tile-title { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile-sub { color: var(--hub-ink-2); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile-facts { color: var(--hub-ink-3); font-size: 11px; line-height: 1.45; }
.tile.skeleton .cover { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.5; } }
.more-row { display: flex; justify-content: center; }

.detail { display: flex; flex-direction: column; gap: 8px; max-width: 640px; }
.detail .cover { margin-bottom: 8px; }
.detail-title { font-size: 22px; font-weight: 650; }
.detail-desc { color: var(--hub-ink); line-height: 1.55; white-space: pre-wrap; margin-top: 6px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { padding: 3px 10px; border-radius: 12px; background: var(--hub-s2); color: var(--hub-ink-2); font-size: 12px; }
.detail .row-actions-main { margin-top: 10px; }

.acct-big { display: flex; align-items: center; gap: 14px; }
.meter { height: 6px; border-radius: 3px; background: var(--hub-s3); overflow: hidden; }
.meter-fill { height: 100%; background: var(--hub-accent); border-radius: 3px; }

@media (max-width: 760px) {
  .hub-veil { padding: 0; }
  .hub { flex-direction: column; height: 100dvh; border-radius: 0; border: 0; }
  .rail {
    width: auto;
    flex-direction: row;
    align-items: center;
    padding: 8px 10px;
    gap: 6px;
    border-right: 0;
    border-bottom: 1px solid var(--hub-line);
    order: 2;
  }
  .rail-head, .rail-fill { display: none; }
  .nav-list { flex-direction: row; gap: 4px; flex: 1; overflow-x: auto; }
  .nav { height: 36px; padding: 0 12px; }
  .acct { padding: 4px; border: 0; }
  .acct-text { display: none; }
  .main { order: 3; }
  .top { order: 1; padding: 0 8px 0 16px; }
  .body { padding: 16px; }
  .wide-only { display: none; }
  .hero { flex-direction: column; align-items: stretch; }
  .cover.big { width: 100%; max-width: 360px; }
  .two { grid-template-columns: 1fr; }
}

@media (pointer: coarse) {
  .btn { height: 44px; }
  .btn.small { height: 38px; }
  .icon-btn { width: 44px; height: 44px; }
  .menu-item { height: 44px; }
  .seg-item { height: 36px; }
}
</style>

<style>
uni-view.hub-scroll {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
uni-view.hub .menu-anchor,
uni-view.hub .menu,
uni-view.hub .item {
  overflow: visible !important;
}
@media (max-width: 760px) {
  uni-view.hub .nav-list { overflow-x: auto !important; }
  uni-view.hub .main { flex: 1; min-height: 0; display: flex; }
}
</style>
