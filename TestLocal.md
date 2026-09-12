# TestLocal – Entwicklungsserver im lokalen Netz erreichbar machen

Anleitung für den Zugriff von einem **anderen Rechner im Heimnetz** auf den Vite-Entwicklungsserver dieses Rechners.

---

## Kurzfassung

Auf **diesem** Rechner (dem Entwicklungshost):

```bash
npm run dev        # Terminal 1 – Dev-Server starten (muss laufen)

npm run lan        # Terminal 2 – Port im lokalen Netz freigeben (fragt nach Passwort)
```

Dann auf dem **anderen** Rechner im Browser öffnen:

```text
http://192.168.178.114:5173/
```

Fertig. Die Freigabe schließt sich nach 4 Stunden von selbst. Sofort beenden:

```bash
npm run lan:close
```

---

## 1. Diagnose: was hier tatsächlich blockiert

Die Anwendung ist nicht das Problem. Die Messung auf diesem Rechner ergab:

| Prüfung | Ergebnis |
| --- | --- |
| LAN-Schnittstelle | `ens18` (virtuelle Maschine) |
| LAN-Adresse | `192.168.178.114/24`, Gateway `192.168.178.1` |
| Dev-Server lauscht | **ja**, auf `*:5173` – also allen Interfaces (korrekt) |
| Firewall | `firewalld` ist **aktiv** und **enabled** |
| Aktive Zone für `ens18` | `public` (Standardzone) |
| Erlaubte Dienste in `public` | nur `dhcpv6-client` |
| Erlaubte Ports in `public` | nur `5432/tcp` (PostgreSQL) |
| Port `5173/tcp` | **nicht freigegeben** → `firewall-cmd --query-port=5173/tcp` = `no` |
| SSH auf Port 22 | lauscht **nicht** |

**Ursache:** Der Vite-Server lauscht korrekt auf allen Interfaces (`server.host: true` ist in [`vite.config.ts`](vite.config.ts:1) gesetzt), aber `firewalld` verwirft eingehende Verbindungen von anderen Hosts auf Port 5173, weil dieser Port in der Zone `public` nicht erlaubt ist. Der Rechner selbst kommt über `localhost` durch – deshalb fällt es lokal nicht auf.

---

## 2. Empfohlene Lösung: Skript

Statt die Firewall abzuschalten, wird **nur der eine benötigte Port** geöffnet, zusätzlich **auf das lokale Subnetz begrenzt** und mit **automatischem Ablauf** versehen. Die Firewall bleibt für alles andere in Betrieb.

### 2.1 Öffnen

```bash
npm run lan
```

Das Skript [`scripts/open-dev-port.sh`](scripts/open-dev-port.sh:1) macht dabei Folgendes:

1. ermittelt LAN-Schnittstelle, LAN-Adresse und Subnetz (`192.168.178.0/24`),
2. ermittelt die firewalld-Zone der Schnittstelle (`public`),
3. trägt eine auf das Subnetz begrenzte Regel für Port 5173 ein,
4. setzt einen Ablauf-Timer (Standard 4 h),
5. prüft, ob der Dev-Server lauscht und macht einen Selbsttest über die LAN-Adresse,
6. gibt die URL aus, die auf dem anderen Rechner zu öffnen ist.

Das Skript fordert bei Bedarf selbst `sudo` an – es muss **nicht** mit `sudo` gestartet werden.

### 2.2 Optionen

```bash
bash scripts/open-dev-port.sh --help

npm run lan                                   # 4 Stunden, nur lokales Subnetz
npm run lan -- --timeout 30m                  # nur 30 Minuten
npm run lan -- --timeout ''                   # ohne Ablauf (bis --close)
npm run lan -- --permanent                    # dauerhaft in die Konfiguration
npm run lan -- --port 4173                    # Vorschau-Build statt Dev-Server
npm run lan -- --network 192.168.178.0/24     # Subnetz fest vorgeben
npm run lan -- --dry-run                      # nur anzeigen, nichts ändern
npm run lan:status                            # Zustand anzeigen (ohne sudo möglich)
npm run lan:close                             # Freigabe sofort entfernen
```

### 2.3 Erwartete Ausgabe

```text
------------------------------------------------------------
Entwicklungsserver wird für das lokale Netz freigegeben
------------------------------------------------------------
  Schnittstelle : ens18
  LAN-Adresse   : 192.168.178.114  (192.168.178.114/24)
  Quellnetz     : 192.168.178.0/24
  Port          : 5173/tcp
  Firewall      : firewalld
  Zone          : public
  Gültigkeit    : 4h, danach automatisch wieder geschlossen

------------------------------------------------------------
Auf dem anderen Rechner im Browser öffnen:

    http://192.168.178.114:5173/
------------------------------------------------------------
```

---

## 3. Alternative: manuell mit `firewall-cmd`

Falls kein Skript gewünscht ist. Alle Varianten erfordern Root-Rechte.

### 3.1 Empfohlen – befristet und aufs Subnetz begrenzt

```bash
sudo firewall-cmd --zone=public \
  --add-rich-rule='rule family="ipv4" source address="192.168.178.0/24" port port="5173" protocol="tcp" accept' \
  --timeout=4h
```

Die Regel verschwindet nach vier Stunden automatisch wieder. `--timeout` akzeptiert auch `30m`, `1h` oder Sekunden.

### 3.2 Einfach, aber für alle Quellen

```bash
sudo firewall-cmd --zone=public --add-port=5173/tcp --timeout=4h
```

Öffnet den Port für **jeden** Host, der den Rechner erreichen kann. Auf einem Heimnetz vertretbar, im Gäste-/Firmennetz nicht.

### 3.3 Dauerhaft

```bash
sudo firewall-cmd --permanent --zone=public \
  --add-rich-rule='rule family="ipv4" source address="192.168.178.0/24" port port="5173" protocol="tcp" accept'
sudo firewall-cmd --reload
```

Diese Variante überlebt Neustarts. Nur verwenden, wenn der Dev-Server dauerhaft von außen erreichbar sein soll.

### 3.4 Nachsehen und zurücknehmen

```bash
# Was ist gerade erlaubt?
firewall-cmd --zone=public --list-all
firewall-cmd --zone=public --list-rich-rules
firewall-cmd --zone=public --query-port=5173/tcp

# Befristete/aktive Regel sofort entfernen
sudo firewall-cmd --zone=public --remove-rich-rule='rule family="ipv4" source address="192.168.178.0/24" port port="5173" protocol="tcp" accept'

# Dauerhafte Regel entfernen
sudo firewall-cmd --permanent --zone=public --remove-rich-rule='rule family="ipv4" source address="192.168.178.0/24" port port="5173" protocol="tcp" accept'
sudo firewall-cmd --reload
```

---

## 4. Lösung ohne Firewall-Änderung: SSH-Tunnel

Wenn der Zugriff auf den Rechner per SSH möglich ist, braucht die Firewall **gar nicht** angefasst zu werden – und die Verbindung ist zusätzlich verschlüsselt.

Auf dem **anderen** Rechner:

```bash
ssh -N -L 5173:localhost:5173 benutzer@192.168.178.114
```

Danach dort im Browser `http://localhost:5173/` öffnen. Der gesamte Verkehr läuft durch den verschlüsselten SSH-Kanal; Port 5173 bleibt nach außen geschlossen.

**Wichtig:** Auf diesem Rechner lauscht derzeit **kein `sshd` auf Port 22**. Diese Variante funktioniert also erst, wenn SSH aktiviert wurde:

```bash
sudo systemctl enable --now sshd
sudo firewall-cmd --zone=public --add-service=ssh --timeout=4h
```

Danach steht auch die Tunnel-Variante zur Verfügung. Das ist die sauberste Lösung, wenn man sie dauerhaft einrichten möchte.

---

## 5. Warum die Firewall nicht einfach abschalten?

Technisch möglich, aber unnötig riskant:

```bash
# NICHT empfohlen
sudo systemctl stop firewalld
```

Gründe:

- **Bestehende Freigaben würden mitgeöffnet.** Auf diesem Rechner läuft bereits eine Datenbank; Port `5432/tcp` (und über Docker zusätzlich `5433`) ist bewusst nach außen freigegeben. Fällt die Firewall, ist auch das ungeschützt.
- **Es gibt keinen Mehrwert.** Das gezielte Öffnen nur des Dev-Ports erreicht dasselbe und lässt sich automatisch zurücknehmen.
- **Vergessensrisiko.** Eine abgeschaltete Firewall bleibt oft abgeschaltet. Eine Regel mit `--timeout` räumt sich selbst auf.

Wenn es dennoch unbedingt temporär sein soll, dann **nie dauerhaft** und immer mit sofortiger Wiederaktivierung:

```bash
sudo systemctl stop firewalld     # nur für einen kurzen Test
# ... testen ...
sudo systemctl start firewalld    # sofort wieder einschalten
```

---

## 6. Hot Reload und WebSockets

Vite nutzt für Hot Module Replacement einen WebSocket über **denselben Port** wie der Dev-Server (5173, `ws://`). Eine Portfreigabe für TCP 5173 deckt beides ab – es ist keine zweite Regel nötig. Die Seite lädt beim Speichern automatisch neu, sobald die Verbindung steht.

---

## 7. Test von einem anderen Rechner

**Linux / macOS:**

```bash
# Ist der Port überhaupt offen?
nc -vz 192.168.178.114 5173

# Antwortet der Webserver?
curl -I http://192.168.178.114:5173/
```

**Windows (PowerShell):**

```powershell
Test-NetConnection 192.168.178.114 -Port 5173
```

Dann im Browser öffnen:

```text
http://192.168.178.114:5173/
```

---

## 8. Fehlersuche

| Symptom | Ursache / Lösung |
| --- | --- |
| `Verbindung fehlgeschlagen` | Regel fehlt oder ist abgelaufen. `npm run lan:status` prüfen, dann erneut `npm run lan`. |
| Port in `--status` als offen gemeldet, aber kein Zugriff | Dev-Server läuft nicht. `npm run dev` in einem eigenen Terminal starten. |
| Immer noch kein Zugriff, Port ist offen | Anderer Rechner ist in einem **Gäste-WLAN** oder anderen VLAN. Gäste-Netze dürfen meist nicht ins Heimnetz. Ins normale WLAN wechseln. |
| Anderer Rechner ist per **VPN** verbunden | VPN deaktivieren oder Split-Tunneling einrichten; sonst geht der Verkehr an der Route vorbei. |
| Zugriff per **Hostname** statt IP scheitert mit `Blocked request` | Vite blockiert fremde Hostnamen (DNS-Rebinding-Schutz). Entweder die IP verwenden oder in [`vite.config.ts`](vite.config.ts:1) unter `server` einen Eintrag `allowedHosts` ergänzen. |
| Zugriff per IP scheitert ebenfalls | `server.host: true` fehlt. In [`vite.config.ts`](vite.config.ts:1) ist `server: { host: true }` bereits gesetzt. |
| Firewall ist konfiguriert, trotzdem unerreichbar | Bei virtuellen Maschinen blockiert oft eine **zweite** Firewall auf dem Host-System (z. B. Proxmox) oder im Router. Diese Anleitung regelt nur die Firewall **in** der VM. |
| `firewall-cmd: command not found` | Kein `firewalld`. Falls `ufw` genutzt wird, deckt das Skript das ab; sonst die Firewall-Software des Systems verwenden. |
| Passwortabfrage von `sudo` | Erwartet. Das Skript fordert die Rechte selbst an. |

---

## 9. Sicherheitseinordnung

- Die Freigabe ist **auf das lokale Subnetz beschränkt** (`192.168.178.0/24`) und **befristet** (Standard 4 h).
- Der Vite-Dev-Server liefert **Quellcode und Quelldateien** des Projekts aus. Das ist im eigenen Heimnetz in Ordnung, in fremden Netzen jedoch nicht.
- Vor der Nutzung in fremden Netzen (Konferenz, Hotel, öffentliches WLAN) die Freigabe vorher beenden: `npm run lan:close`.
- Es werden **keine** zusätzlichen Dienste geöffnet und **keine** dauerhaften Regeln gesetzt, solange `--permanent` nicht ausdrücklich verwendet wird.

---

## 10. Befehlsreferenz

| Aufgabe | Befehl |
| --- | --- |
| Dev-Server starten | `npm run dev` |
| Port freigeben (4 h, Subnetz) | `npm run lan` |
| Freigabe beenden | `npm run lan:close` |
| Zustand anzeigen | `npm run lan:status` |
| Nur simulieren | `npm run lan -- --dry-run` |
| Andere Dauer | `npm run lan -- --timeout 30m` |
| Dauerhaft | `npm run lan -- --permanent` |
| Vorschau-Build freigeben | `npm run build && npm run preview` und dann `npm run lan -- --port 4173` |
| Erreichbarkeit testen | `curl -I http://192.168.178.114:5173/` |
| Firewall-Regeln ansehen | `firewall-cmd --zone=public --list-all` |
