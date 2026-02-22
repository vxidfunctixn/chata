import { ref, onUnmounted } from 'vue'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'

const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? 'http://localhost:3001'

export interface ChatMessage {
  text: string
  username: string
  roomId: string
  createdAt: number
  system?: boolean
}

export interface TypingDraft {
  username: string
  text: string
  cursor: number
  selectionEnd: number
  idle: boolean
}

export function useChat() {
  // autoConnect: false – łączymy dopiero po potwierdzeniu nazwy użytkownika
  const socket: Socket = io(SOCKET_URL, { autoConnect: false })

  const messages = ref<ChatMessage[]>([])
  const typingDrafts = ref<TypingDraft[]>([])
  const roomUsers = ref<string[]>([])
  const isConnected = ref(false)

  // --- Lifecycle połączenia ---
  socket.on('connect', () => {
    isConnected.value = true
    console.log('[socket] connected:', socket.id)
  })

  socket.on('disconnect', () => {
    isConnected.value = false
    console.log('[socket] disconnected')
  })

  // --- Eventy pokoju ---
  socket.on('history', (history: ChatMessage[]) => {
    messages.value = history
  })

  socket.on('message', (msg: ChatMessage) => {
    messages.value.push(msg)
  })

  socket.on('system', (msg: { text: string; createdAt: number }) => {
    messages.value.push({ ...msg, username: 'system', roomId: '', system: true })
  })

  socket.on('typingDrafts', (drafts: TypingDraft[]) => {
    typingDrafts.value = [...drafts]
  })

  socket.on('roomUsers', (users: string[]) => {
    roomUsers.value = users
  })

  // --- Akcje ---
  const connect = () => socket.connect()

  const joinRoom = (roomId: string, username: string) => {
    messages.value = []
    typingDrafts.value = []
    roomUsers.value = []
    socket.emit('joinRoom', { roomId, username })
  }

  const leaveRoom = () => {
    socket.emit('leaveRoom')
    messages.value = []
    typingDrafts.value = []
    roomUsers.value = []
  }

  const sendMessage = (roomId: string, text: string, username: string) => {
    if (!text.trim() || !roomId) return
    socket.emit('message', { roomId, text, username })
  }

  const sendTyping = (roomId: string, username: string, text: string, cursor: number, selectionEnd: number) => {
    if (!roomId) return
    socket.emit('typing', { roomId, username, text, cursor, selectionEnd })
  }

  const sendIdleTyping = (roomId: string) => {
    if (!roomId) return
    socket.emit('idleTyping', { roomId })
  }

  const sendStopTyping = (roomId: string) => {
    if (!roomId) return
    socket.emit('stopTyping', { roomId })
  }

  onUnmounted(() => {
    socket.disconnect()
  })

  return {
    isConnected,
    messages,
    typingDrafts,
    roomUsers,
    connect,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTyping,
    sendIdleTyping,
    sendStopTyping,
  }
}

