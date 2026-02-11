# Preset Config Feature - Implementation Summary

## ✅ Was wurde implementiert

### Feature: Automatisches Laden von Pool & Template Provider Keys aus Beispiel-Configs

**Problem gelöst:**
- User müssen nicht mehr manuell Keys von Pool/JDS/Template Provider beschaffen
- Offizielle Beispiel-Konfigurationen können direkt geladen werden
- Alle Felder bleiben nach dem Laden editierbar (manuelle Eingabe möglich)

---

## 🏗️ Backend Implementation

### 1. TOML Parser hinzugefügt
**File:** `backend/package.json`
```json
{
  "dependencies": {
    "@iarna/toml": "^2.2.5"  // TOML Parser
  }
}
```

### 2. Config Examples Service
**File:** `backend/src/services/config-examples.service.ts`

**Features:**
- Liest alle TOML-Dateien aus `/app/config-examples/`
- Parst TOML → `ConfigInput` Format
- Kategorisiert nach:
  - Network (mainnet, testnet4, signet)
  - Infrastructure (local, hosted)
  - Template Provider (Sv2Tp, BitcoinCoreIpc)
- Generiert beschreibende Namen automatisch

**Verfügbare Beispiele (10 Configs):**
```
Mainnet - Local - Sv2 TP
Mainnet - Local - Bitcoin Core
Mainnet - Hosted - Sv2 TP
Mainnet - Hosted - Bitcoin Core

Testnet4 - Local - Sv2 TP
Testnet4 - Local - Bitcoin Core
Testnet4 - Hosted - Sv2 TP
Testnet4 - Hosted - Bitcoin Core

Signet - Local - Sv2 TP
Signet - Local - Bitcoin Core
```

### 3. API Controller & Routes
**Files:**
- `backend/src/controllers/config-examples.controller.ts`
- `backend/src/routes/config-examples.routes.ts`

**Neue Endpoints:**
```
GET /api/config-examples
→ Liste aller verfügbaren Examples

GET /api/config-examples/filter?network=testnet4&infrastructure=hosted
→ Gefilterte Liste

GET /api/config-examples/:id
→ Parsed Config als ConfigInput JSON

GET /api/config-examples/:id/toml
→ Raw TOML content
```

**Beispiel Response:**
```json
{
  "examples": [
    {
      "id": "testnet4-jdc-config-hosted-infra-example",
      "name": "Testnet4 - Hosted - Sv2 TP",
      "network": "testnet4",
      "infrastructure": "hosted",
      "templateProvider": "Sv2Tp",
      "description": "Config for Bitcoin Testnet4 using hosted infrastructure with Sv2 Template Provider"
    }
  ]
}
```

### 4. Server Integration
**File:** `backend/src/index.ts`
- Route registriert: `app.use('/api/config-examples', configExamplesRoutes)`

### 5. Dockerfile Update
**File:** `backend/Dockerfile`
```dockerfile
# Config-Examples ins Container kopieren
COPY miner-apps/jd-client/config-examples /app/config-examples
```

**Environment Variable:**
- `CONFIG_EXAMPLES_PATH` - Pfad zu Examples (default: `/app/config-examples`)

---

## 🎨 Frontend Implementation

### 1. PresetSelector Component
**Files:**
- `frontend/src/components/ConfigForm/PresetSelector.tsx`
- `frontend/src/components/ConfigForm/PresetSelector.css`

**Features:**
- Dropdown mit allen verfügbaren Examples
- "Load Preset" Button
- Beschreibung des ausgewählten Presets
- Error Handling
- Loading States

**UI:**
```
┌─────────────────────────────────────────────────────┐
│ Load from Preset                                    │
│ Start with a pre-configured example and customize.  │
│                                                      │
│ [Select configuration example ▼] [Load Preset]      │
│                                                      │
│ ℹ Config for Bitcoin Testnet4 using hosted...      │
└─────────────────────────────────────────────────────┘
```

### 2. API Service Update
**File:** `frontend/src/services/api.service.ts`

**Neue Methoden:**
```typescript
async getConfigExamples()
async getConfigExample(id: string)
async getConfigExampleToml(id: string)
```

### 3. ConfigForm Integration
**File:** `frontend/src/components/ConfigForm/ConfigForm.tsx`

**Changes:**
```typescript
import { PresetSelector } from './PresetSelector';

// Handler für Preset-Laden
const handleLoadPreset = (presetConfig: ConfigInput) => {
  setConfig(presetConfig);  // ← Füllt alle Felder
  setMessage({ type: 'success', text: 'Preset loaded!' });
};

// Render
<PresetSelector onLoadPreset={handleLoadPreset} />
```

**Verhalten:**
1. User wählt Preset aus Dropdown
2. Klickt "Load Preset"
3. **Alle Formular-Felder werden gefüllt** mit:
   - Pool Authority Public Keys ✅
   - Pool Addresses ✅
   - Template Provider Keys ✅
   - Alle anderen Config-Werte ✅
4. **User kann ALLES editieren** - keine Felder sind gesperrt
5. User kann "Save Configuration" klicken

---

## 🔑 Was die Presets enthalten

### Beispiel: "Testnet4 - Hosted - Sv2 TP"

Automatisch gefüllt werden:
```toml
# Pool Keys (automatisch!)
[[upstreams]]
authority_pubkey = "9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72"
pool_address = "testnet.demand.sv2.io:34254"
jd_address = "testnet.demand.sv2.io:34265"

# Template Provider Keys (automatisch!)
[template_provider.Sv2Tp]
address = "testnet.demand.sv2.io:8442"
public_key = "9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72"

# Authority Keys (automatisch!)
authority_public_key = "..."
authority_secret_key = "..."

# User muss nur noch eingeben:
# - user_identity (z.B. "mein-miner")
# - coinbase_reward_script (Bitcoin Address)
```

---

## 📝 User Workflow

### Option 1: Mit Preset starten (Empfohlen)
```
1. Browser → Configuration Tab
2. Dropdown: "Testnet4 - Hosted - Sv2 TP" wählen
3. "Load Preset" klicken
4. ✅ Pool Keys automatisch gefüllt
5. ✅ Template Provider Keys automatisch gefüllt
6. Nur noch user_identity + coinbase_reward_script eingeben
7. "Save Configuration" klicken
8. ✅ Fertig!
```

### Option 2: Manuell (weiterhin möglich)
```
1. Browser → Configuration Tab
2. Alle Tabs durchgehen
3. Alle Felder manuell ausfüllen
4. "Save Configuration" klicken
```

### Option 3: Preset laden + anpassen
```
1. Preset laden
2. Felder nach Bedarf ändern (z.B. anderen Pool)
3. "Save Configuration" klicken
```

---

## ✅ Dateien erstellt/geändert

**Backend (4 neue Dateien):**
- ✅ `services/config-examples.service.ts` - Service
- ✅ `controllers/config-examples.controller.ts` - Controller
- ✅ `routes/config-examples.routes.ts` - Routes
- ✅ `package.json` - @iarna/toml dependency

**Backend (3 geänderte Dateien):**
- ✅ `index.ts` - Route registriert
- ✅ `Dockerfile` - Config-Examples kopiert
- ✅ Pfad konfigurierbar via ENV

**Frontend (3 neue Dateien):**
- ✅ `components/ConfigForm/PresetSelector.tsx`
- ✅ `components/ConfigForm/PresetSelector.css`
- ✅ `services/api.service.ts` - Neue Methoden

**Frontend (1 geänderte Datei):**
- ✅ `components/ConfigForm/ConfigForm.tsx` - Integration

**Dokumentation:**
- ✅ `PRESET-FEATURE.md` (diese Datei)

---

## 🧪 Testing

```bash
# Build mit Preset Feature
docker-compose build

# Start
docker-compose up -d

# Test 1: Liste aller Examples
curl http://localhost:3000/api/config-examples

# Test 2: Specific Example laden
curl http://localhost:3000/api/config-examples/testnet4-jdc-config-hosted-infra-example

# Test 3: Raw TOML
curl http://localhost:3000/api/config-examples/testnet4-jdc-config-hosted-infra-example/toml

# Test 4: Frontend
# Browser: http://localhost:3000
# → Configuration Tab
# → Dropdown sollte 10 Examples zeigen
# → Eines auswählen und laden
# → Alle Felder sollten gefüllt sein
```

---

## 🎯 Vorteile

✅ **Keine manuelle Key-Beschaffung nötig**
- User müssen nicht zu Pool-Websites gehen
- Keine Copy-Paste Fehler

✅ **Offiziell verifiziert**
- Verwendet die offiziellen Beispiel-Configs aus dem Repo
- Immer aktuell (bei Rebuild)

✅ **Flexibel**
- 10 verschiedene Kombinationen verfügbar
- Alle Felder editierbar nach dem Laden
- Manuelle Eingabe weiterhin möglich

✅ **User-freundlich**
- Ein Klick → fertige Config
- Klare Beschreibungen
- Keine technische Expertise nötig

✅ **Wartbar**
- Examples zentral im Repo
- Automatisches Parsen
- Keine Hardcoded-Keys in GUI

---

## 🚀 Nächste Schritte

Das Feature ist **vollständig implementiert**!

**Zum Testen:**
```bash
cd /home/warioishere/github_repos/sv2-apps/miner-apps/jd-client/jd-gui
docker-compose build
docker-compose up -d
```

**Im Browser:**
1. http://localhost:3000
2. Configuration Tab
3. "Load from Preset" Section oben
4. Dropdown öffnen → sollte 10 Optionen zeigen
5. Eine wählen → "Load Preset" klicken
6. Formular sollte automatisch gefüllt werden ✅

**Manuelle Eingabe:**
- Funktioniert weiterhin genau wie vorher
- Alle Felder editierbar
- Keys können manuell eingegeben werden

---

**Status:** ✅ Production Ready!
