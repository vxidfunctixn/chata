<template>
  <!-- Dialog wyboru nazwy użytkownika -->
  <q-dialog v-model="showUsernameDialog" persistent>
    <q-card style="min-width: 340px">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="chat" color="primary" size="28px" class="q-mr-sm" />
        <div class="text-h6">Witaj w chacie!</div>
      </q-card-section>

      <q-card-section>
        <q-input
          v-model="usernameInput"
          outlined
          label="Twoja nazwa użytkownika"
          autofocus
          maxlength="24"
          counter
          @keyup.enter="confirmUsername"
        />
        <q-select
          v-model="roomInput"
          outlined
          label="Pokój"
          :options="availableRooms"
          class="q-mt-sm"
        />
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          color="primary"
          label="Dołącz"
          unelevated
          :disable="!usernameInput.trim()"
          @click="confirmUsername"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Główna strona czatu -->
  <q-page class="column no-wrap" style="height: 100dvh">
    <!-- Nagłówek pokoju -->
    <q-toolbar class="bg-primary text-white shadow-2" style="min-height: 48px">
      <q-icon name="tag" size="20px" />
      <q-toolbar-title class="text-subtitle1 q-ml-xs">{{ currentRoom }}</q-toolbar-title>
      <q-chip
        dense
        color="white"
        text-color="primary"
        icon="person"
        class="q-mr-sm"
      >
        {{ username }}
      </q-chip>
      <q-badge
        :color="isConnected ? 'positive' : 'negative'"
        rounded
        :label="isConnected ? 'online' : 'offline'"
        class="q-mr-sm"
      />
      <q-btn
        flat
        round
        dense
        :icon="showSidebar ? 'group' : 'group_off'"
        color="white"
        @click="showSidebar = !showSidebar"
      >
        <q-badge v-if="roomUsers.length" color="white" text-color="primary" floating>{{ roomUsers.length }}</q-badge>
      </q-btn>
    </q-toolbar>

    <!-- Zawartość: czat + sidebar -->
    <div class="row no-wrap col" style="min-height: 0">

      <!-- Kolumna czatu -->
      <div class="column no-wrap col" style="min-width: 0">

    <!-- Lista wiadomości -->
    <q-scroll-area ref="scrollAreaRef" class="col">
      <div class="q-px-sm q-pt-sm q-pb-xs">
        <template v-for="(msg, i) in messages" :key="i">
          <!-- Wiadomość systemowa -->
          <div
            v-if="msg.system"
            class="text-center text-caption text-grey-6 q-my-xs"
          >
            <q-icon name="info" size="12px" class="q-mr-xs" />{{ msg.text }}
          </div>

          <!-- Wiadomość użytkownika -->
          <q-chat-message
            v-else
            :name="msg.username === username ? 'Ty' : msg.username"
            :text="[msg.text]"
            :stamp="formatTime(msg.createdAt)"
            :sent="msg.username === username"
            :bg-color="msg.username === username ? 'primary' : 'grey-10'"
            :text-color="msg.username === username ? 'white' : 'grey-2'"
          >
            <template #avatar>
              <q-avatar
                :color="avatarColor(msg.username)"
                text-color="white"
                size="36px"
                class="q-mx-xs"
                style="flex-shrink: 0"
              >
                {{ initials(msg.username) }}
              </q-avatar>
            </template>
          </q-chat-message>
        </template>

        <!-- Tymczasowe dymki live typing -->
        <transition-group name="draft-pop" tag="div">
          <div
            v-for="draft in visibleDrafts"
            :key="'draft-' + draft.username"
            class="draft-wrapper"
            :class="{ 'draft-idle': draft.idle }"
          >
          <q-chat-message
            :sent="false"
            bg-color="grey-9"
            text-color="grey-2"
          >
            <template #name>
              <span class="text-grey-5 text-caption">
                {{ draft.username }}
                <q-badge
                  color="orange-8"
                  label="pisze"
                  class="q-ml-xs"
                  style="vertical-align: middle; font-size: 10px"
                />
              </span>
            </template>
            <template #avatar>
              <q-avatar
                :color="avatarColor(draft.username)"
                text-color="white"
                size="36px"
                class="q-mx-xs"
                style="flex-shrink: 0"
              >
                {{ initials(draft.username) }}
              </q-avatar>
            </template>
              <div style="white-space: pre-wrap; word-break: break-word">
                <span>{{ draft.text.slice(0, draft.cursor) }}</span>
                <span
                  v-if="draft.cursor !== draft.selectionEnd"
                  class="typing-selection"
                >{{ draft.text.slice(draft.cursor, draft.selectionEnd) }}</span>
                <span class="typing-cursor" />
                <span>{{ draft.text.slice(draft.selectionEnd) }}</span>
              </div>
            </q-chat-message>
          </div>
        </transition-group>

        <!-- Kotwica do auto-scroll -->
        <div ref="bottomAnchorRef" style="height: 1px" />
      </div>
    </q-scroll-area>

    <q-separator />

    <div class="q-pa-sm">
      <q-input
        ref="inputRef"
        v-model="inputText"
        outlined
        dense
        :placeholder="`Wiadomość w #${currentRoom}`"
        :disable="!isConnected"
        maxlength="500"
        autogrow
        @update:model-value="handleTyping"
        @focus="onInputFocus"
        @blur="onInputBlur"
        @click="handleSelectionChange"
        @keyup="handleSelectionChange"
        @mouseup="handleSelectionChange"
        @touchend="handleSelectionChange"
        @select="handleSelectionChange"
        @keyup.enter.exact.prevent="handleSend"
      >
        <template #append>
          <q-btn
            flat
            round
            icon="send"
            color="primary"
            :disable="!inputText.trim() || !isConnected"
            @click="handleSend"
          />
        </template>
      </q-input>
    </div>

      </div><!-- /kolumna czatu -->

      <!-- Sidebar online -->
      <transition name="sidebar">
        <div v-if="showSidebar" class="sidebar-panel column no-wrap">
          <div class="sidebar-header row items-center q-px-md q-py-sm">
            <q-icon name="group" size="16px" class="q-mr-xs text-grey-5" />
            <span class="text-caption text-grey-4 text-uppercase" style="letter-spacing:.06em">Online &mdash; {{ roomUsers.length }}</span>
          </div>
          <q-scroll-area class="col">
            <q-list dense class="q-pb-sm">
              <q-item
                v-for="user in sortedUsers"
                :key="user"
                class="q-py-xs"
              >
                <q-item-section avatar>
                  <q-avatar
                    :color="avatarColor(user)"
                    text-color="white"
                    size="30px"
                  >
                    {{ initials(user) }}
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label :class="user === username ? 'text-white' : 'text-grey-3'" style="font-size:13px">
                    {{ user === username ? 'Ty' : user }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge
                    v-if="typingDrafts.some(d => d.username === user)"
                    color="orange-8"
                    label="pisze"
                    style="font-size:9px"
                  />
                </q-item-section>
              </q-item>
            </q-list>
          </q-scroll-area>
        </div>
      </transition>

    </div><!-- /row -->
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import type { QScrollArea, QInput } from 'quasar'
import { useChat } from 'src/composables/useChat'

// --- Chat composable ---
const { isConnected, messages, typingDrafts, roomUsers, connect, joinRoom, sendMessage, sendTyping, sendIdleTyping, sendStopTyping } =
  useChat()

// --- Username / room setup ---
const showUsernameDialog = ref(true)
const showSidebar = ref(true)
const usernameInput = ref('')
const username = ref('')
const currentRoom = ref('general')
const roomInput = ref('general')
const availableRooms = ['general', 'dev', 'random', 'offtopic']

const confirmUsername = () => {
  if (!usernameInput.value.trim()) return
  username.value = usernameInput.value.trim()
  currentRoom.value = roomInput.value
  showUsernameDialog.value = false
  connect()
}

// Dołącz do pokoju po połączeniu
watch(isConnected, (connected) => {
  if (connected) joinRoom(currentRoom.value, username.value)
})

// --- Dymki live typing (filtruj siebie) ---
const visibleDrafts = computed(() =>
  typingDrafts.value.filter((d) => d.username !== username.value),
)

// --- Lista online (siebie na górze, reszta A-Z) ---
const sortedUsers = computed(() => [
  ...roomUsers.value.filter((u) => u === username.value),
  ...roomUsers.value.filter((u) => u !== username.value).sort(),
])

// --- Refs ---
const scrollAreaRef = ref<QScrollArea>()
const bottomAnchorRef = ref<HTMLElement>()
const inputRef = ref<QInput>()

const getNativeInput = () =>
  inputRef.value?.nativeEl as HTMLInputElement | HTMLTextAreaElement | null

watch(
  [messages, typingDrafts],
  async () => {
    await nextTick()
    const el = scrollAreaRef.value?.getScrollTarget()
    if (el) el.scrollTop = el.scrollHeight
  },
  { deep: true },
)

// --- Input i typing ---
const inputText = ref('')
let typingTimer: ReturnType<typeof setTimeout> | null = null

const sendCurrentTyping = async (delayed = false) => {
  if (delayed) await new Promise((r) => setTimeout(r, 0))
  else await nextTick()
  const text = inputText.value
  if (!text) {
    if (typingTimer) clearTimeout(typingTimer)
    sendStopTyping(currentRoom.value)
    return
  }
  const native = getNativeInput()
  const cursor = native?.selectionStart ?? text.length
  const selectionEnd = native?.selectionEnd ?? cursor
  sendTyping(currentRoom.value, username.value, text, cursor, selectionEnd)
  if (typingTimer) clearTimeout(typingTimer)
  typingTimer = setTimeout(() => sendIdleTyping(currentRoom.value), 3000)
}

const handleTyping = () => { void sendCurrentTyping(false) }

const handleSelectionChange = () => {
  if (!inputText.value) return
  void sendCurrentTyping(true)
}

let selectionChangeCleanup: (() => void) | null = null

const onInputFocus = () => {
  const handler = () => handleSelectionChange()
  document.addEventListener('selectionchange', handler)
  selectionChangeCleanup = () => document.removeEventListener('selectionchange', handler)
}

const onInputBlur = () => {
  selectionChangeCleanup?.()
  selectionChangeCleanup = null
}

onUnmounted(() => {
  selectionChangeCleanup?.()
})

const handleSend = () => {
  const text = inputText.value.trim()
  if (!text || !isConnected.value) return
  sendMessage(currentRoom.value, text, username.value)
  inputText.value = ''
  if (typingTimer) clearTimeout(typingTimer)
  sendStopTyping(currentRoom.value)
}

// --- Helpers avatara ---
const AVATAR_COLORS = [
  'primary', 'secondary', 'accent', 'teal', 'deep-purple',
  'pink', 'indigo', 'cyan', 'orange', 'green',
]

const avatarColor = (name: string): string => {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx] ?? 'primary'
}

const initials = (name: string): string =>
  name.slice(0, 2).toUpperCase()

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
</script>

<style scoped>
/* ── Sidebar ─────────────────────────────────────── */
.sidebar-panel {
  width: 200px;
  flex-shrink: 0;
  background: #1a1a2e;
  border-left: 1px solid rgba(255, 255, 255, 0.07);
}

.sidebar-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  min-height: 36px;
}

.sidebar-enter-active,
.sidebar-leave-active {
  transition: width 0.22s ease, opacity 0.22s ease;
  overflow: hidden;
}
.sidebar-enter-from,
.sidebar-leave-to {
  width: 0 !important;
  opacity: 0;
}

/* ── Dymek tymczasowy live typing ────────────────── */
.draft-pop-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.draft-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.draft-pop-enter-from,
.draft-pop-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* Wrapper dymku – transition zawsze aktywny w obu kierunkach */
.draft-wrapper {
  transition: opacity 0.15s ease;
}

/* Stan nieaktywny – wolniejsze zaciemnienie */
.draft-wrapper.draft-idle {
  opacity: 0.4;
  transition: opacity 0.5s ease;
}

/* Migający kursor w dymku */
.typing-cursor {
  display: inline-block;
  width: 0;
  border-left: 2px solid currentColor;
  height: 1em;
  vertical-align: text-bottom;
  margin: 0 -1px;
  animation: blink 0.9s step-start infinite;
}

/* Zaznaczony tekst w dymku */
.typing-selection {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 2px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
</style>

