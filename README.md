# DO OR DIE 🎮

A browser-based 3D third-person battle royale game inspired by Free Fire. **1 player vs 24 AI bots** on an island map — last one alive wins.

Built entirely with vanilla JavaScript + [Three.js](https://threejs.org/) (CDN). No server, no build step, no paid assets.

---

## 🚀 How to Run

### Option 1 — Live Server (recommended)
```bash
# Using VS Code + Live Server extension:
# Right-click index.html → "Open with Live Server"

# OR using Python:
cd "do or die game"
python -m http.server 8080
# Then open: http://localhost:8080

# OR using Node.js / npx:
npx serve .
# Then open the printed URL
```

> **Why a server?** The game loads JS modules from `/src/` — browsers block local file `file://` cross-origin reads. Any static file server will work.

### Option 2 — Direct file open (Chrome only workaround)
Launch Chrome with: `chrome --allow-file-access-from-files` then open `index.html`.

---

## 🎮 Controls

| Action | Key / Mouse |
|--------|-------------|
| Move | WASD |
| Look / Aim | Mouse |
| Jump | Space |
| Sprint | Shift |
| Crouch | C |
| Shoot | Left Click |
| Aim Down Sights | Right Click |
| Reload | R |
| Pick Up | E |
| Switch Weapon 1/2/3 | 1 / 2 / 3 |
| Land (parachute) | F |
| Open / Close parachute | Space (while falling) |

**Mobile:** Virtual joystick + on-screen buttons are auto-detected.

---

## 🗺 Game Flow

1. **Main Menu** → Click **PLAY**
2. **Parachute Phase** — You fall from a plane. Use **Space** to open/close your chute, **WASD** to steer, **F** to land immediately.
3. **Battle** — Loot weapons, medkits, armor. Kill bots. Stay inside the shrinking blue zone.
4. **Win/Lose** — See your rank, kills, and survival time. Play again!

---

## 🗂 Project Structure

```
do or die game/
├── index.html          # Entry point, all CSS, HTML shells
├── README.md
├── src/
│   ├── constants.js    # C{} – all tunable game values
│   ├── audio.js        # Web Audio API sound engine
│   ├── map.js          # Terrain, buildings, trees, rocks
│   ├── weapons.js      # Weapon meshes, shooting, tracers, hit FX
│   ├── loot.js         # Loot spawning, pickup, inventory
│   ├── zone.js         # Safe zone shrink logic + visual
│   ├── player.js       # Player movement, camera, input, parachute
│   ├── bots.js         # 24 AI bots (state machine)
│   ├── ui.js           # HUD, minimap, kill feed, menus
│   ├── mobile.js       # Touch joystick + buttons
│   └── main.js         # Scene, lights, game loop, menu wiring
└── assets/
    ├── sounds/         # (optional) drop .ogg/.mp3 here for custom sounds
    └── textures/       # (optional) drop textures here
```

---

## 🔫 Weapons

| Weapon | Damage | Fire Rate | Range | Ammo |
|--------|--------|-----------|-------|------|
| Pistol | 28 | 2.5/s | 60 m | 12/60 |
| SMG | 18 | 12/s | 50 m | 30/120 |
| Assault Rifle | 30 | 8/s | 120 m | 30/90 |
| Shotgun | 20×8 | 0.8/s | 30 m | 6/30 |
| Sniper Rifle | 95 | 0.5/s | 300 m | 5/20 |

---

## 🤖 AI Bots

- **24 bots** parachute in simultaneously
- State machine: `parachute → idle → patrol → loot → chase → fight → dead`
- Variable difficulty (0.3–1.0): affects aim accuracy and reaction time
- Bots pick up loot, seek cover, chase/shoot player and each other
- Dead bots drop loot

---

## 🔵 Safe Zone

4 shrink stages, each with a waiting period then a shrinking period:

| Stage | Wait | Shrink | From → To | Damage/s |
|-------|------|--------|-----------|----------|
| 1 | 60s | 120s | 240→160 | 2 |
| 2 | 45s | 90s | 160→90 | 4 |
| 3 | 30s | 60s | 90→40 | 6 |
| 4 | 20s | 45s | 40→10 | 10 |

---

## ⚙ Settings

- **Mouse Sensitivity** — slider in Settings menu
- **SFX / Music Volume** — sliders in Settings menu
- **Graphics** — Low / Medium / High (affects pixel ratio & fog)

---

## 🛠 Tech Stack

- **Three.js r128** (CDN) — 3D rendering
- **Web Audio API** — procedurally generated sound effects
- **Vanilla ES5/6** — no build tools, no bundler
- Low-poly primitives only — no external 3D model files

---

## 📈 Performance Tips

- Use **Low** graphics on older devices
- The game targets **60 FPS** via object pooling (bullet tracers, hit particles)
- Bots use simple distance-based LOS (no expensive raycasts)

---

## 🎨 Customizing

Edit `src/constants.js` to tune:
- `C.BOT_COUNT` — number of bots (default 24)
- `C.WEAPONS` — weapon stats
- `C.ZONE_STAGES` — zone timing and damage
- `C.PLAYER_SPEED`, `C.JUMP_FORCE`, etc.

---

*Made with ❤ using Three.js — no external paid assets.*
