#!/usr/bin/env bash
# setup-network.sh – aktualizuje .env i docker-compose.yml z aktualnym IP
# i wyświetla gotowe komendy do PowerShell (Administrator)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/frontend/.env"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

# ── Pobierz aktualne IP ────────────────────────────────────────────────────
WSL_IP=$(hostname -I | awk '{print $1}')
WIN_IP=$(powershell.exe -NoProfile -Command \
  "Get-NetIPAddress -AddressFamily IPv4 | \
   Where-Object { \$_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' -and \$_.IPAddress -notmatch '^169' } | \
   Select-Object -First 1 -ExpandProperty IPAddress" 2>/dev/null | tr -d '\r\n')

if [[ -z "$WSL_IP" || -z "$WIN_IP" ]]; then
  echo "❌ Nie udało się pobrać adresów IP. Sprawdź połączenie WiFi."
  exit 1
fi

echo "🔍 WSL2 IP:       $WSL_IP"
echo "🔍 Windows WiFi:  $WIN_IP"
echo ""

# ── Zaktualizuj frontend/.env ──────────────────────────────────────────────
sed -i "s|VITE_SOCKET_URL=.*|VITE_SOCKET_URL=http://$WIN_IP:3001|" "$ENV_FILE"
echo "✅ $ENV_FILE  →  VITE_SOCKET_URL=http://$WIN_IP:3001"

# ── Zaktualizuj docker-compose.yml ────────────────────────────────────────
sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=http://localhost:9000,http://$WIN_IP:9000|" "$COMPOSE_FILE"
echo "✅ $COMPOSE_FILE  →  CORS_ORIGINS=...,$WIN_IP:9000"

echo ""
echo "🔄 Przebudowuję backend..."
docker compose -f "$COMPOSE_FILE" up -d --build backend 2>&1 | grep -E 'Built|Started|Running|error' || true

echo ""
echo "┌─────────────────────────────────────────────────────────────────────┐"
echo "│  Wklej w PowerShell (Administrator):                                │"
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""
echo "netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9000 connectaddress=$WSL_IP connectport=9000"
echo "netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3001 connectaddress=$WSL_IP connectport=3001"
echo "netsh advfirewall firewall delete rule name=\"WSL2 Chat 9000\" >nul 2>&1; netsh advfirewall firewall add rule name=\"WSL2 Chat 9000\" dir=in action=allow protocol=TCP localport=9000"
echo "netsh advfirewall firewall delete rule name=\"WSL2 Chat 3001\" >nul 2>&1; netsh advfirewall firewall add rule name=\"WSL2 Chat 3001\" dir=in action=allow protocol=TCP localport=3001"
echo ""
echo "┌─────────────────────────────────────────────────────────────────────┐"
printf "│  %-69s │\n" "Aplikacja będzie dostępna pod:"
printf "│  %-69s │\n" "http://$WIN_IP:9000"
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""
echo "▶  Uruchom frontend: cd frontend && quasar dev"
