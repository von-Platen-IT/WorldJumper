#!/usr/bin/env bash
#
# open-dev-port.sh – gibt den Vite-Entwicklungsserver im lokalen Netz frei,
# ohne die Firewall komplett abzuschalten.
#
# Statt die Firewall zu deaktivieren, wird nur der eine benötigte TCP-Port
# geöffnet – zusätzlich beschränkt auf das lokale Subnetz und mit automatischem
# Ablauf. Die Firewall bleibt für alles andere in Betrieb.
#
#   ./scripts/open-dev-port.sh                  # Port öffnen (Standard: 4 h)
#   ./scripts/open-dev-port.sh --permanent      # dauerhaft eintragen
#   ./scripts/open-dev-port.sh --close          # sofort wieder schließen
#   ./scripts/open-dev-port.sh --status         # aktuellen Zustand anzeigen
#   ./scripts/open-dev-port.sh --dry-run        # nur zeigen, was passieren würde
#
# Das Skript fordert bei Bedarf selbst sudo-Rechte an.
#
set -euo pipefail

PORT="${PORT:-5173}"
ZONE="${ZONE:-}"
NETWORK="${NETWORK:-}"
TIMEOUT="${TIMEOUT:-4h}"
ACTION="open"
PERMANENT=0
DRY_RUN=0

ORIG_ARGS=("$@")
PROG="$(basename "$0")"

log() { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '[!] %s\n' "$*" >&2; }
die() { printf '[FEHLER] %s\n' "$*" >&2; exit 1; }
hr() { printf '%s\n' "------------------------------------------------------------"; }

usage() {
  cat <<EOF
$PROG – Entwicklungsserver kontrolliert im LAN freigeben

Verwendung:
  $PROG [Optionen]

Optionen:
  -p, --port N        TCP-Port (Standard: $PORT)
  -z, --zone NAME     firewalld-Zone (Standard: Zone der LAN-Schnittstelle)
  -n, --network CIDR  erlaubtes Quellnetz (Standard: automatisch erkannt)
  -t, --timeout ZEIT  automatischer Ablauf, z. B. 4h, 30m, 600
                      (Standard: $TIMEOUT; "--timeout ''" = kein Ablauf)
      --permanent     Regel dauerhaft speichern (kein Ablauf)
      --close         Regel sofort entfernen
      --status        Zustand anzeigen, nichts ändern
      --dry-run       nur anzeigen, nichts ändern (kein sudo nötig)
  -h, --help          diese Hilfe

Beispiele:
  $PROG                             # 4 Stunden freigeben, nur lokales Subnetz
  $PROG -p 4173 -t 1h               # Vorschau-Build für eine Stunde
  $PROG --permanent                 # dauerhaft (nur wenn wirklich gewünscht)
  $PROG --close                     # alles wieder zumachen
EOF
}

# ---------------------------------------------------------------- Argumente
while [ $# -gt 0 ]; do
  case "$1" in
    -p | --port) PORT="${2:?Port fehlt}"; shift 2 ;;
    -z | --zone) ZONE="${2:?Zone fehlt}"; shift 2 ;;
    -n | --network) NETWORK="${2:?Netz fehlt}"; shift 2 ;;
    -t | --timeout) TIMEOUT="${2-}"; shift 2 ;;
    --permanent) PERMANENT=1; shift ;;
    --close) ACTION="close"; shift ;;
    --status) ACTION="status"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "Unbekannte Option: $1 (siehe --help)" ;;
  esac
done

# ------------------------------------------------------------ Root anfordern
need_root() {
  [ "$(id -u)" -eq 0 ] && return 0
  [ "$DRY_RUN" -eq 1 ] && return 0
  [ "$ACTION" = "status" ] && return 0
  if command -v sudo >/dev/null 2>&1; then
    log "sudo-Rechte werden benötigt – bitte Passwort eingeben."
    exec sudo -E -- "$0" "${ORIG_ARGS[@]}"
  fi
  die "Root-Rechte erforderlich, 'sudo' nicht gefunden."
}
need_root

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    info "[dry-run] $*"
    return 0
  fi
  "$@"
}

# ------------------------------------------------------- Netzwerk ermitteln
LAN_IFACE=""
detect_iface() {
  ip -4 route get 1.1.1.1 2>/dev/null \
    | awk '{for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit }}'
}

detect_cidr() {
  local iface="$1"
  ip -4 -o addr show dev "$iface" 2>/dev/null | awk 'NR==1 {print $4}'
}

detect_lan_ip() {
  local cidr="$1"
  printf '%s' "${cidr%%/*}"
}

to_network() {
  # Wandelt z. B. 192.168.178.114/24 in 192.168.178.0/24 um.
  local cidr="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$cidr" <<'PY'
import ipaddress, sys
try:
    print(ipaddress.ip_network(sys.argv[1], strict=False))
except Exception:
    print(sys.argv[1])
PY
  else
    printf '%s' "$cidr"
  fi
}

LAN_IFACE="$(detect_iface || true)"
[ -n "$LAN_IFACE" ] || die "Keine LAN-Schnittstelle mit Default-Route gefunden."

LAN_CIDR="$(detect_cidr "$LAN_IFACE")"
[ -n "$LAN_CIDR" ] || die "Keine IPv4-Adresse auf $LAN_IFACE gefunden."

LAN_IP="$(detect_lan_ip "$LAN_CIDR")"
[ -n "$NETWORK" ] || NETWORK="$(to_network "$LAN_CIDR")"

# ------------------------------------------------------------ firewalld-Zone
FW_BACKEND="none"

# firewalld meldet seinen Zustand über D-Bus. Antwortet dieser kurz nicht,
# wird zusätzlich systemd befragt, damit die Erkennung nicht fälschlich
# "keine Firewall" ergibt und der Port ungeöffnet bliebe.
is_firewalld() {
  command -v firewall-cmd >/dev/null 2>&1 || return 1
  firewall-cmd --state >/dev/null 2>&1 && return 0
  systemctl is-active --quiet firewalld 2>/dev/null && return 0
  return 1
}

if is_firewalld; then
  FW_BACKEND="firewalld"
elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi '^Status: active'; then
  FW_BACKEND="ufw"
fi

if [ -z "$ZONE" ] && [ "$FW_BACKEND" = "firewalld" ]; then
  ZONE="$(firewall-cmd --get-zone-of-interface="$LAN_IFACE" 2>/dev/null || true)"
  [ -n "$ZONE" ] || ZONE="$(firewall-cmd --get-default-zone 2>/dev/null || true)"
  [ -n "$ZONE" ] || ZONE="public"
fi

# ------------------------------------------------------- Regelbeschreibung
RICH_RULE="rule family=\"ipv4\" source address=\"$NETWORK\" port port=\"$PORT\" protocol=\"tcp\" accept"
URL="http://$LAN_IP:$PORT/"

if [ "$PORT" != "5173" ] && [ "$PORT" != "4173" ]; then
  warn "Port $PORT ist kein Standard-Port des Tools. Vite nutzt 5173, die Vorschau 4173."
fi

# ------------------------------------------------------------------ Status
show_status() {
  hr
  log "Zustand"
  hr
  info "Schnittstelle : $LAN_IFACE"
  info "LAN-Adresse   : $LAN_IP  ($LAN_CIDR)"
  info "Quellnetz     : $NETWORK"
  info "Port          : $PORT/tcp"
  info "URL           : $URL"
  info "Firewall      : $FW_BACKEND"
  [ "$FW_BACKEND" = "firewalld" ] && info "Zone          : $ZONE"
  log ""
  if command -v ss >/dev/null 2>&1; then
    if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "(\*|0\.0\.0\.0):$PORT\$"; then
      info "Dev-Server    : lauscht auf allen Interfaces (gut)"
    else
      info "Dev-Server    : lauscht NICHT auf Port $PORT"
      warn "Läuft 'npm run dev'? Ohne laufenden Server nützt die Freigabe nichts."
    fi
  fi
  if [ "$FW_BACKEND" = "firewalld" ]; then
    if firewall-cmd -q --zone="$ZONE" --query-port="$PORT/tcp" 2>/dev/null; then
      info "Port-Freigabe : ja (Port $PORT/tcp ist offen)"
    else
      info "Port-Freigabe : nein (Port $PORT/tcp ist gesperrt)"
    fi
    local rr
    rr="$(firewall-cmd --zone="$ZONE" --list-rich-rules 2>/dev/null | grep -F "port=\"$PORT\"" || echo '')"
    if [ -n "$rr" ]; then
      info "Rich Rule     : aktiv"
      log "                $rr"
    else
      info "Rich Rule     : keine"
    fi
  fi
  log ""
}

# ------------------------------------------------------------------- Öffnen
do_open() {
  case "$FW_BACKEND" in
    ufw)
      run ufw allow from "$NETWORK" to any port "$PORT" proto tcp comment 'GlobeFilmTool dev'
      ;;
    firewalld)
      if [ "$PERMANENT" -eq 1 ]; then
        run firewall-cmd --permanent --zone="$ZONE" --add-rich-rule="$RICH_RULE"
        run firewall-cmd --reload
      elif [ -n "$TIMEOUT" ]; then
        run firewall-cmd --zone="$ZONE" --add-rich-rule="$RICH_RULE" --timeout="$TIMEOUT"
      else
        run firewall-cmd --zone="$ZONE" --add-rich-rule="$RICH_RULE"
      fi
      ;;
    none)
      warn "Keine aktive Firewall (firewalld/ufw) erkannt – es ist nichts freizugeben."
      info "Wenn der Host trotzdem nicht erreichbar ist, blockiert etwas anderes:"
      info "  • Firewall des VM-Hosts (z. B. Proxmox) oder des Routers"
      info "  • getrenntes VLAN / Gäste-WLAN ohne Zugriff aufs Heimnetz"
      return 0
      ;;
  esac
}

# ---------------------------------------------------------------- Schließen
do_close() {
  case "$FW_BACKEND" in
    ufw)
      run ufw delete allow from "$NETWORK" to any port "$PORT" proto tcp || true
      ;;
    firewalld)
      run firewall-cmd --zone="$ZONE" --remove-rich-rule="$RICH_RULE" 2>/dev/null || true
      run firewall-cmd --permanent --zone="$ZONE" --remove-rich-rule="$RICH_RULE" 2>/dev/null || true
      run firewall-cmd --zone="$ZONE" --remove-port="$PORT/tcp" 2>/dev/null || true
      run firewall-cmd --permanent --zone="$ZONE" --remove-port="$PORT/tcp" 2>/dev/null || true
      run firewall-cmd --reload 2>/dev/null || true
      ;;
    none)
      info "Keine aktive Firewall – nichts zu schließen."
      return 0
      ;;
  esac
}

# ------------------------------------------------------------- Selbsttest
selftest() {
  # Zugriff über die eigene LAN-Adresse läuft durch die INPUT-Kette und ist
  # damit ein brauchbarer Nachweis, dass die Regel greift.
  [ "$DRY_RUN" -eq 1 ] && return 0
  command -v curl >/dev/null 2>&1 || return 0
  local code
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://$LAN_IP:$PORT/" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then
    info "Selbsttest    : OK (HTTP $code über $LAN_IP)"
  else
    info "Selbsttest    : HTTP $code über $LAN_IP"
    warn "Der Test über die LAN-Adresse schlug fehl. Läuft 'npm run dev'?"
    warn "Direkt danach kann der Port durchaus erreichbar sein – siehe TestLocal.md."
  fi
}

# ------------------------------------------------------------------ Ablauf
case "$ACTION" in
  status)
    show_status
    exit 0
    ;;
  close)
    hr
    log "Entwicklungsserver wird gesperrt"
    hr
    do_close
    log ""
    log "Fertig. Port $PORT ist wieder geschlossen."
    exit 0
    ;;
  open)
    hr
    log "Entwicklungsserver wird für das lokale Netz freigegeben"
    hr
    info "Schnittstelle : $LAN_IFACE"
    info "LAN-Adresse   : $LAN_IP  ($LAN_CIDR)"
    info "Quellnetz     : $NETWORK"
    info "Port          : $PORT/tcp"
    info "Firewall      : $FW_BACKEND"
    [ "$FW_BACKEND" = "firewalld" ] && info "Zone          : $ZONE"
    if [ "$PERMANENT" -eq 1 ]; then
      info "Gültigkeit    : dauerhaft (--permanent)"
    elif [ -n "$TIMEOUT" ]; then
      info "Gültigkeit    : $TIMEOUT, danach automatisch wieder geschlossen"
    else
      warn "Gültigkeit    : unbefristet, bis --close ausgeführt wird"
    fi
    log ""
    do_open
    log ""
    hr
    log "Auf dem anderen Rechner im Browser öffnen:"
    log ""
    log "    $URL"
    log ""
    hr
    selftest
    log ""
    log "Hinweise:"
    log "  • Kein Neustart nötig, die Regel greift sofort."
    log "  • Die Firewall bleibt an – nur dieser eine Port ist offen."
    log "  • Freigabe beenden:  sudo $0 --close"
    log "  • Zustand prüfen:    $0 --status"
    log ""
    ;;
  *)
    die "Unbekannte Aktion: $ACTION"
    ;;
esac
