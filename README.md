# Chat – Quasar + DragonflyDB + Socket.io

Minimalny boilerplate reaktywnego chatu z live typing.

## Stack

| Warstwa   | Technologia                        |
|-----------|------------------------------------|
| Frontend  | Quasar CLI v2, Vue 3, TypeScript   |
| Backend   | Node.js, Socket.io v4, Express v5  |
| Cache/DB  | DragonflyDB (Redis-compatible)     |
| Transport | WebSocket (socket.io adapter)      |

---

## Uruchomienie

### Wymagania
- Node.js 22+
- Docker + Docker Compose

### Kroki

```bash
# 1. Zainstaluj Quasar CLI (raz globalnie)
npm i -g @quasar/cli

# 2. Utwórz projekt Quasar w katalogu frontend/
npm init quasar@latest frontend
# → wybierz: App with Quasar CLI → Vue 3 → TypeScript → Vite

# 3. Zainstaluj zależności frontendu
cd frontend
npm i socket.io-client
cd ..

# 4. Zainstaluj zależności backendu
cd backend && npm i && cd ..

# 5. Uruchom DragonflyDB + backend przez Docker
docker compose up -d

# 6. Uruchom frontend dev server
cd frontend && quasar dev
# → http://localhost:9000
```

### Test live typing
Otwórz **2 karty** przeglądarki na `http://localhost:9000` → pisz w jednej → druga widzi aktywnych typerów.

---

## Następne kroki

- [x] **Quasar UI** – `q-chat-message`, `q-scroll-area`, avatary, timestamps
- [x] **Rooms** – `socket.join(roomId)`, eventy `joinRoom` / `leaveRoom`
- [x] **Persistencja** – `LPUSH room:{id}:messages` w Dragonfly, `LTRIM` do 200 wiadomości
- [x] **Env** – `VITE_SOCKET_URL` w `frontend/.env`
- [x] **Live typing bubbles** – zamiast napisu „pisze…" pojawia się tymczasowy dymek z żywą treścią wiadomości
- [x] **Śledzenie kursora** – pozycja karetki (`selectionStart`) widoczna w dymku obserwatora
- [x] **Śledzenie zaznaczenia** – `selectionStart`/`selectionEnd` renderowane jako highlight; obsługa long-press na mobile (`selectionchange`)
- [x] **Stan idle** – brak aktywności przez 3 s przełącza dymek w półprzezroczysty stan idle zamiast go usuwać
- [x] **Sidebar online** – panel z listą użytkowników w pokoju, badge „pisze" przy aktywnych typerach, przełącznik w toolbarze
- [ ] **Top-typerzy** – Dragonfly Sorted Sets: `ZINCRBY top-typers 1 {userId}`
- [ ] **Auth** – JWT w `socket.handshake.auth.token`, middleware Socket.io
- [ ] **Debounce** – `useDebounceFn` z `@vueuse/core` przy typing evencie
