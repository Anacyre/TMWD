import { reactive } from 'vue'
import {
  currentUser,
  fetchUsage,
  onAuthChange,
  signInWithPassword,
  signUpWithPassword,
  sendMagicLink,
  signOut,
  cloudErrorMessage
} from '../lib/cloud-projects.js'

export const cloudAuth = reactive({
  user: null,
  usage: null,
  tab: 'local',
  busy: false,
  error: '',
  notice: '',
  email: '',
  password: '',
  displayName: '',
  ready: false
})

let watching = false

function applyUser (user) {
  cloudAuth.user = user
  if (!user) cloudAuth.usage = null
}

export async function refreshCloudAuth () {
  try {
    const user = await currentUser()
    applyUser(user)
    cloudAuth.usage = user ? await fetchUsage() : null
  } catch (err) {
    cloudAuth.error = cloudErrorMessage(err)
  } finally {
    cloudAuth.ready = true
  }
  return cloudAuth.user
}

export function watchCloudAuth () {
  if (watching) return
  watching = true
  refreshCloudAuth()
  onAuthChange((user) => {
    applyUser(user)
    if (user) fetchUsage().then((usage) => { cloudAuth.usage = usage }).catch(() => {})
    else cloudAuth.usage = null
  })
}

export async function cloudSignIn () {
  cloudAuth.busy = true
  cloudAuth.error = ''
  cloudAuth.notice = ''
  try {
    await signInWithPassword(cloudAuth.email, cloudAuth.password)
    await refreshCloudAuth()
  } catch (err) {
    cloudAuth.error = cloudErrorMessage(err, 'Sign-in failed')
  } finally {
    cloudAuth.busy = false
  }
}

export async function cloudSignUp () {
  cloudAuth.busy = true
  cloudAuth.error = ''
  cloudAuth.notice = ''
  try {
    const result = await signUpWithPassword(cloudAuth.email, cloudAuth.password, cloudAuth.displayName)
    await refreshCloudAuth()
    if (result && result.user && !result.session) {
      cloudAuth.notice = 'Check your inbox to confirm the account, then sign in.'
    }
  } catch (err) {
    cloudAuth.error = cloudErrorMessage(err, 'Sign-up failed')
  } finally {
    cloudAuth.busy = false
  }
}

export async function cloudSendLink () {
  cloudAuth.busy = true
  cloudAuth.error = ''
  try {
    await sendMagicLink(cloudAuth.email)
    cloudAuth.notice = 'A sign-in link is on its way.'
  } catch (err) {
    cloudAuth.error = cloudErrorMessage(err, 'Could not send the link')
  } finally {
    cloudAuth.busy = false
  }
}

export async function cloudSignOut () {
  cloudAuth.busy = true
  try {
    await signOut()
    applyUser(null)
    cloudAuth.usage = null
  } catch (err) {
    cloudAuth.error = cloudErrorMessage(err)
  } finally {
    cloudAuth.busy = false
  }
}

export function accountInitial (user, usage) {
  const name = (usage && usage.displayName) || (user && user.email) || '?'
  return String(name).trim().charAt(0).toUpperCase() || '?'
}
