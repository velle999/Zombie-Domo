// === Zombie Domo: FPS, Arena, Touch, Red Pulse, Health, Pause Menu, Wave Logic, Full 2025 Edition ===

// --- SOUND EFFECTS ---
const pistolSound = new Audio('pistol.mp3'); pistolSound.volume = 0.5;
const shotgunSound = new Audio('shotgun.mp3'); shotgunSound.volume = 0.20;
const moanSound = new Audio('moan.mp3'); moanSound.volume = 0.55;
const headshotDing = new Audio('headshot.mp3'); headshotDing.volume = 1.0;

// --- PNG ASSETS WITH DEBUG ---
function imgAsset(path) {
  const img = new Image();
  img.src = path;
  img.onload = () => console.log(`[ASSET] Loaded: ${path}`);
  img.onerror = () => console.warn(`[ASSET] MISSING: ${path} (check path!)`);
  return img;
}
const pistolImg = imgAsset('gun.png');
const shotgunImg = imgAsset('shotgun.png');
const zombieImg = imgAsset('zombie.png');
const bossImg = imgAsset('boss.png');
const treeImg = imgAsset('tree.png');
const crosshairImg = imgAsset('crosshair.png');
const shotgunPowerupImg = imgAsset('shotgun.png');
const medkitImg = imgAsset('medkit.png'); // Use your medkit image, or use shotgun.png as placeholder

// --- CANVAS SETUP ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;
ctx.imageSmoothingEnabled = false;

// --- CONSTANTS ---
const FIELD_SIZE = 704;
const ARENA_RADIUS = FIELD_SIZE * 0.49;
const ARENA_CENTER_X = FIELD_SIZE / 2;
const ARENA_CENTER_Y = FIELD_SIZE / 2;

const NEON = '#00ffe7', RETRO_RED = '#ff3158', RETRO_GREEN = '#43ff5a';

// --- GLOBAL GAME STATE ---
let crosshairOnTarget = false, crosshairPulse = 0;
let paused = false, overlayMenuActive = false;
let player = resetPlayer(), keys = {}, zombies = [], score = 0, spawnCd = 0, trees = [];
let pointerLocked = false, lastShootTime = 0, gameState = 'playing', wave = 1, zombiesPerWave = 12;
let splatAlpha = 0, splatScale = 1, boss = null, popups = [], powerups = [], firstShotgunPowerupGiven = false;

// --- HIGH SCORE ---
function getHighScore() { return Number(localStorage.getItem('zombiedomo_highscore') || "0"); }
function setHighScore(val) { localStorage.setItem('zombiedomo_highscore', String(val)); }

// --- PAUSE MENU ---
function showPauseMenu() {
  paused = true;
  overlayMenuActive = true;
  document.body.style.cursor = '';
  console.log('[GAME] Paused');
}
function hidePauseMenu() {
  paused = false;
  overlayMenuActive = false;
  if (pointerLocked && canvas.requestPointerLock) canvas.requestPointerLock();
  console.log('[GAME] Unpaused');
}
function quitGame() {
  paused = false;
  overlayMenuActive = false;
  window.location.reload();
}
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!overlayMenuActive) showPauseMenu();
    else hidePauseMenu();
  }
});

// --- PLAYER STATE ---
function resetPlayer() {
  return {
    x: FIELD_SIZE / 2,
    y: FIELD_SIZE / 2,
    dir: 0,
    look: 0,
    fov: Math.PI / 3,
    speed: 1.4,
    rotSpeed: 0.035,
    alive: true,
    weapon: 'pistol',
    shotgunAmmo: 0,
    hp: 5,          // Player health
    maxhp: 5        // Max health
  };
}

// --- ANGLE NORMALIZE ---
function normalizeAngle(a) {
  while (a < -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

// --- INPUT HANDLING (PointerLock, Keys, Touch) ---
canvas.tabIndex = 1;
window.addEventListener('load', () => canvas.focus());
canvas.addEventListener('click', () => {
  if (!player.alive) return fullGameReset();
  if (overlayMenuActive) return; // Don't re-lock pointer if menu up
  canvas.focus();
  if (!pointerLocked) {
    (canvas.requestPointerLock || canvas.mozRequestPointerLock).call(canvas);
  }
});
function updatePointerLockState() {
  pointerLocked = document.pointerLockElement === canvas || document.mozPointerLockElement === canvas;
}
document.addEventListener('pointerlockchange', updatePointerLockState, false);
document.addEventListener('mozpointerlockchange', updatePointerLockState, false);
document.addEventListener('mousemove', function (e) {
  if (player.alive && gameState === 'playing' && pointerLocked && !paused) {
    player.dir += e.movementX * 0.0025;
    player.look += e.movementY * 0.22;
    player.look = Math.max(-160, Math.min(160, player.look));
  }
});
window.addEventListener('keydown', e => {
  if (!player.alive && (e.key === 'r' || e.key === 'R')) return fullGameReset();
  if (paused && (e.key === 'p' || e.key === 'P')) { hidePauseMenu(); return; }
  if (paused && (e.key === 'r' || e.key === 'R')) { fullGameReset(); return; }
  keys[e.key.toLowerCase()] = true;
  if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', ' ', 'e'].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key === ' ') shoot();
  if (e.key.toLowerCase() === 'e') trySwitchShotgun();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener('mousedown', e => { if (player.alive && e.button === 0 && !paused) shoot(); });

// --- TOUCH CONTROLS ---
let touch = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
let touchTurnLeft = false, touchTurnRight = false, touchShoot = false;
function setupTouchControls() {
  canvas.addEventListener('touchstart', e => {
    for (let t of e.touches) {
      if (t.clientX < canvas.width * 0.3 && t.clientY > canvas.height * 0.6) {
        touch.active = true; touch.startX = t.clientX; touch.startY = t.clientY; touch.dx = 0; touch.dy = 0;
      }
      if (t.clientX > canvas.width * 0.75 && t.clientY > canvas.height * 0.60) {
        let relY = (t.clientY - canvas.height * 0.85);
        if (relY > 30) touchTurnRight = true;
        else if (relY < -30) touchTurnLeft = true;
        else touchShoot = true;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    for (let t of e.touches) {
      if (touch.active) {
        touch.dx = t.clientX - touch.startX;
        touch.dy = t.clientY - touch.startY;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    touch.active = false;
    touchTurnLeft = touchTurnRight = touchShoot = false;
    touch.dx = touch.dy = 0;
  });
}
setupTouchControls();

// --- TREE GENERATION ---
function placeTrees(num = 15) {
  trees = [];
  const minDist = ARENA_RADIUS * 0.55;
  const maxDist = ARENA_RADIUS - 24;
  for (let i = 0; i < num; i++) {
    let angle = Math.random() * Math.PI * 2;
    let dist = minDist + Math.random() * (maxDist - minDist);
    let scale = 0.95 + Math.random() * 1.9;
    let baseScale = 5.5 + Math.random() * 3.0;
    trees.push({
      x: ARENA_CENTER_X + Math.cos(angle) * dist,
      y: ARENA_CENTER_Y + Math.sin(angle) * dist,
      scale,
      baseScale,
      radius: 36 * scale * baseScale
    });
  }
}

// --- POWERUP SYSTEM (SHOTGUN/MEDKIT) ---
function spawnPowerup({ inFront = false } = {}) {
  let px = player.x, py = player.y, angle = player.dir, dist = 0;
  if (inFront) { dist = 100; }
  else { angle = Math.random() * Math.PI * 2; dist = 190 + Math.random() * 300; }
  // 20% medkit, 80% shotgun
  if (Math.random() < 0.2) {
    powerups.push({ x: px + Math.cos(angle) * dist, y: py + Math.sin(angle) * dist, kind: 'medkit', taken: false, radius: 32 + Math.random() * 8 });
    console.log('[SPAWN] Medkit powerup spawned.');
  } else {
    powerups.push({ x: px + Math.cos(angle) * dist, y: py + Math.sin(angle) * dist, kind: 'shotgun', taken: false, radius: 32 + Math.random() * 8 });
    console.log('[SPAWN] Shotgun powerup spawned.');
  }
}
function maybeSpawnPowerup() { if (Math.random() < 0.25) spawnPowerup(); }

// --- SHOOT LOGIC ---
function playGunSound() {
  let sfx = (player.weapon === 'shotgun' ? shotgunSound : pistolSound).cloneNode();
  sfx.volume = (player.weapon === 'shotgun' ? shotgunSound : pistolSound).volume; try { sfx.play(); } catch(e){}
}
function playMoanCanvasPosition(z, dist, pan) {
  const now = performance.now();
  if (!z._lastMoanTime || now - z._lastMoanTime > 1200 + Math.random() * 600) {
    z._lastMoanTime = now;
    let sfx = moanSound.cloneNode();
    let vol = 1 - Math.min(1, dist / 420);
    sfx.volume = Math.max(0.2, Math.min(1.0, vol * 0.8 + 0.2));
    try { sfx.play(); } catch(e){}
  }
}
function playHeadshotSound() { let sfx = headshotDing.cloneNode(); sfx.volume = 1.0; try { sfx.play(); } catch(e){} }

function shoot() {
  if (!player.alive || gameState !== 'playing' || paused) return;
  let now = Date.now(), cooldown = (player.weapon === 'shotgun') ? 400 : 160;
  if (now - lastShootTime < cooldown) return;
  lastShootTime = now; playGunSound();
  if (player.weapon === 'shotgun') {
    let pellets = 5, spread = 0.09;
    for (let p = 0; p < pellets; ++p) shotgunBlast(player.dir + (Math.random() - 0.5) * spread);
    player.shotgunAmmo--;
    if (player.shotgunAmmo <= 0) {
      player.weapon = 'pistol';
      popups.push({ msg: 'Out of shotgun ammo!', x: canvas.width / 2, y: 140, t: performance.now(), color: RETRO_RED });
    }
  } else pistolShoot();
}
function pistolShoot() {
  let cx = canvas.width / 2, cy = canvas.height / 2 + player.look, best = null, bestD = Infinity, headshot = false, hitX = 0, hitY = 0;
  for (let z of zombies.concat(boss ? [boss] : [])) {
    if (!z || z.dead) continue;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy), ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    let size = z.isBoss ? z.size : Math.min(4000 / (dist + 0.01), 950) * 1.2, sx = (0.5 + ang / player.fov) * canvas.width, sy = canvas.height / 2 + size / 2 - size;
    if (Math.abs(sx - cx) < size * 0.23 && Math.abs(cy - (sy + size * 0.54)) < size * 0.53 && dist < bestD) {
      if (cy < sy + size * 0.29) headshot = true;
      best = z; bestD = dist; hitX = sx; hitY = cy;
    }
  }
  if (best) applyGunDamage(best, headshot, hitX, hitY, 1);
}
function shotgunBlast(fireAngle) {
  let cx = canvas.width / 2, cy = canvas.height / 2 + player.look;
  for (let z of zombies.concat(boss ? [boss] : [])) {
    if (!z || z.dead) continue;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy), ang = normalizeAngle(Math.atan2(dy, dx) - fireAngle);
    let size = z.isBoss ? z.size : Math.min(4000 / (dist + 0.01), 950) * 1.2, sx = (0.5 + ang / player.fov) * canvas.width, sy = canvas.height / 2 + size / 2 - size;
    if (Math.abs(sx - cx) < size * 0.25 && Math.abs(cy - (sy + size * 0.54)) < size * 0.60) {
      let headshot = (cy < sy + size * 0.29);
      applyGunDamage(z, headshot, sx, cy, 2);
    }
  }
}
function applyGunDamage(target, headshot, x, y, baseDamage) {
  if (target.isBoss) {
    let damage = headshot ? 2 * baseDamage : baseDamage;
    target.hp -= damage;
    if (headshot) {
      score += 10; target.headshotTime = performance.now(); playHeadshotSound();
      popups.push({ msg: 'HEADSHOT!', x, y, t: performance.now(), color: '#fff22a' });
      popups.push({ msg: '+10', x, y: y + 32, t: performance.now(), color: '#fff' });
    } else {
      score += 2; popups.push({ msg: '+2', x, y: y + 28, t: performance.now(), color: '#fff' });
    }
    if (target.hp <= 0) {
      target.dead = true; target.splat = 30; score += 50;
      popups.push({ msg: 'BOSS DOWN!', x, y: y - 32, t: performance.now(), color: '#fff22a' });
      popups.push({ msg: '+50', x, y, t: performance.now(), color: '#fff' });
    }
  } else {
    target.dead = true; target.splat = headshot ? 24 : 18;
    if (headshot) {
      score += 5; target.headshotTime = performance.now(); playHeadshotSound();
      popups.push({ msg: 'HEADSHOT!', x, y, t: performance.now(), color: '#fff22a' });
      popups.push({ msg: '+5', x, y: y + 28, t: performance.now(), color: '#fff' });
    } else {
      score++; popups.push({ msg: '+1', x, y: y + 28, t: performance.now(), color: '#fff' });
    }
  }
}
function trySwitchShotgun() {
  if (player.shotgunAmmo > 0 && player.weapon !== 'shotgun') {
    player.weapon = 'shotgun';
    popups.push({ msg: 'SHOTGUN!', x: canvas.width / 2, y: 100, t: performance.now(), color: RETRO_GREEN });
  }
}

// --- POWERUP PICKUP CHECK ---
function updatePowerups() {
  for (let pu of powerups) {
    if (pu.taken) continue;
    let dist = Math.hypot(player.x - pu.x, player.y - pu.y);
    if (dist < pu.radius + 28) {
      pu.taken = true;
      if (pu.kind === 'shotgun') {
        player.weapon = 'shotgun'; player.shotgunAmmo = 10 + Math.floor(Math.random() * 8);
        popups.push({ msg: 'Picked up SHOTGUN!', x: canvas.width / 2, y: 80, t: performance.now(), color: RETRO_GREEN });
        console.log('[PICKUP] Shotgun powerup!');
      }
      if (pu.kind === 'medkit') {
        if (player.hp < player.maxhp) {
          player.hp = Math.min(player.maxhp, player.hp + 2);
          popups.push({ msg: 'MEDKIT!', x: canvas.width / 2, y: 100, t: performance.now(), color: '#43ff5a' });
          console.log('[PICKUP] Medkit!');
        }
      }
    }
  }
  powerups = powerups.filter(pu => !pu.taken);
}

// --- ARENA/ZOMBIE SPAWNING ---
function spawnZombie() {
  let angle = Math.random() * Math.PI * 2;
  let minDist = ARENA_RADIUS * 0.42;
  let maxDist = ARENA_RADIUS * 0.98;
  let dist = minDist + Math.random() * (maxDist - minDist);
  zombies.push({
    x: ARENA_CENTER_X + Math.cos(angle) * dist,
    y: ARENA_CENTER_Y + Math.sin(angle) * dist,
    dead: false,
    splat: 0,
    speed: ((0.16 + Math.random() * 0.12) * 0.82) * zombieSpeedMultiplier()
  });
}
function zombieSpeedMultiplier() {
  return 1 + (wave - 1) * 0.13;
}
function spawnBoss() {
  boss = {
    x: player.x + Math.cos(Math.random() * 2 * Math.PI) * 380,
    y: player.y + Math.sin(Math.random() * 2 * Math.PI) * 380,
    dead: false,
    splat: 0,
    size: 380,
    speed: 0.09 * zombieSpeedMultiplier(),
    hp: 18,
    maxhp: 18,
    isBoss: true
  };
  popups.push({ msg: 'BOSS INCOMING!', x: canvas.width / 2, y: 120, t: performance.now(), color: RETRO_RED });
  maybeSpawnPowerup();
}

// --- MAIN UPDATE ---
function update() {
  if (gameState !== 'playing' || paused) return;

  // Movement
  let vx = 0, vy = 0;
  if (keys['arrowleft'] || touchTurnLeft) player.dir -= player.rotSpeed;
  if (keys['arrowright'] || touchTurnRight) player.dir += player.rotSpeed;
  if (keys['w'] || (touch.active && touch.dy < -12)) {
    vx += Math.cos(player.dir) * player.speed;
    vy += Math.sin(player.dir) * player.speed;
  }
  if (keys['s'] || (touch.active && touch.dy > 12)) {
    vx -= Math.cos(player.dir) * player.speed;
    vy -= Math.sin(player.dir) * player.speed;
  }
  if (keys['a'] || (touch.active && touch.dx < -12)) {
    vx += Math.cos(player.dir - Math.PI / 2) * player.speed;
    vy += Math.sin(player.dir - Math.PI / 2) * player.speed;
  }
  if (keys['d'] || (touch.active && touch.dx > 12)) {
    vx += Math.cos(player.dir + Math.PI / 2) * player.speed;
    vy += Math.sin(player.dir + Math.PI / 2) * player.speed;
  }
  player.x += vx; player.y += vy;

  // Arena Clamp
  let distFromCenter = Math.hypot(player.x - ARENA_CENTER_X, player.y - ARENA_CENTER_Y);
  if (distFromCenter > ARENA_RADIUS - 18) {
    let angle = Math.atan2(player.y - ARENA_CENTER_Y, player.x - ARENA_CENTER_X);
    player.x = ARENA_CENTER_X + Math.cos(angle) * (ARENA_RADIUS - 18);
    player.y = ARENA_CENTER_Y + Math.sin(angle) * (ARENA_RADIUS - 18);
  }

  // Touch shoot
  if (touchShoot) { shoot(); touchShoot = false; }

  // Shotgun spawn
  if (wave === 1 && !firstShotgunPowerupGiven && zombies.length >= Math.floor(zombiesPerWave / 2)) {
    spawnPowerup({ inFront: true }); firstShotgunPowerupGiven = true;
    popups.push({ msg: 'SHOTGUN SPAWNED!', x: canvas.width / 2, y: 180, t: performance.now(), color: RETRO_GREEN });
  }

  // Spawning
  if (!boss && zombies.length < zombiesPerWave && spawnCd <= 0) { spawnZombie(); spawnCd = 120 + Math.random() * 60; }
  if (!boss && zombies.length === zombiesPerWave && zombies.every(z => z.dead)) spawnBoss();
  spawnCd--;
  for (let z of zombies.concat(boss ? [boss] : [])) {
    if (!z || z.dead) continue;
    let dx = player.x - z.x, dy = player.y - z.y, dist = Math.hypot(dx, dy);
    if (dist > 26) {
      let mx = (dx / dist) * z.speed, my = (dy / dist) * z.speed;
      z.x += mx * 0.82; z.y += my * 0.82;
    }
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    if (Math.abs(ang) < player.fov / 2 && dist < 420) {
      let screenPos = 0.5 + ang / player.fov, pan = Math.max(-1, Math.min(1, (screenPos - 0.5) * 2));
      playMoanCanvasPosition(z, dist, pan);
    }
    // Zombie bite logic (health)
    if (dist < 26 && player.alive && !z.justBit) {
      player.hp -= 1;
      z.justBit = 18;
      popups.push({ msg: '-1 HP', x: canvas.width / 2, y: 70, t: performance.now(), color: RETRO_RED });
      if (player.hp <= 0) {
        player.alive = false;
        gameState = 'dead';
        splatAlpha = 1;
        splatScale = 1;
      }
    }
    if (z.justBit) z.justBit--;
    if (z.splat > 0) z.splat--;
  }
  updatePowerups();

  // Wave clear check
  let allZombiesDead = zombies.every(z => z.dead) && (!boss || boss.dead);
  if (gameState === 'playing' && zombies.length === zombiesPerWave && allZombiesDead) {
    setTimeout(() => {
      if (score > getHighScore()) setHighScore(score);
      verboseWaveCleared();
      advanceToNextWave();
    }, 400);
    gameState = 'waiting';
  }
  if (!player.alive && splatAlpha > 0) { splatAlpha *= 0.93; splatScale += 0.02; if (score > getHighScore()) setHighScore(score); }
}

function verboseWaveCleared() {
  console.log(`[WAVE] Wave ${wave} complete. Score: ${score}, High Score: ${getHighScore()}`);
  alert(`WAVE ${wave} COMPLETE!\nScore: ${score}\nHigh Score: ${getHighScore()}`);
}

function advanceToNextWave() {
  wave++;
  zombies = [];
  boss = null;
  zombiesPerWave = 12 + Math.floor((wave - 1) * 2.4);
  player.x = FIELD_SIZE / 2;
  player.y = FIELD_SIZE / 2;
  player.hp = Math.max(1, player.hp); // Carry wounds between waves
  spawnCd = 0;
  splatAlpha = 0;
  splatScale = 1;
  gameState = 'playing';
  popups = [];
  placeTrees(15);
  maybeSpawnPowerup();
  firstShotgunPowerupGiven = false;
  console.log(`[WAVE] Welcome to Wave ${wave}. More zombies. Have fun.`);
}

// --- GAME/RESTART LOGIC ---
function fullGameReset() {
  player = resetPlayer(); 
  keys = {}; 
  zombies = []; 
  boss = null; 
  score = 0; 
  wave = 1;
  zombiesPerWave = 12;
  powerups = []; 
  spawnCd = 0; 
  splatAlpha = 0; 
  splatScale = 1; 
  gameState = 'playing'; 
  popups = [];
  placeTrees(15); 
  maybeSpawnPowerup(); 
  firstShotgunPowerupGiven = false;
  if (document.exitPointerLock) document.exitPointerLock();
  paused = false;
  overlayMenuActive = false;
  console.log('[GAME] Full game reset. Back to Wave 1, zero points, and existential dread.');
}

// --- POPUPS ---
function drawPopups() {
  let now = performance.now();
  for (let i = popups.length - 1; i >= 0; i--) {
    let p = popups[i], life = now - p.t;
    if (life > 1000) { popups.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = 1 - (life / 1000);
    ctx.font = /HEADSHOT|BOSS DOWN|SHOTGUN|MEDKIT/i.test(p.msg) ? 'bold 34px monospace' : 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.color || '#fff';
    ctx.shadowColor = p.color;
    ctx.shadowBlur = /HEADSHOT|BOSS DOWN|SHOTGUN|MEDKIT/i.test(p.msg) ? 18 : 7;
    ctx.fillText(p.msg, p.x, p.y - (life / 25));
    ctx.restore();
  }
}

// --- RADAR ---
function drawRadar() {
  const RADAR_SIZE = 120;
  const RADAR_RADIUS = RADAR_SIZE / 2 - 8;
  const RADAR_CX = canvas.width - RADAR_SIZE / 2 - 18;
  const RADAR_CY = RADAR_SIZE / 2 + 18;
  const radarZoom = 260;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.arc(RADAR_CX, RADAR_CY, RADAR_SIZE / 2, 0, 2 * Math.PI);
  ctx.fillStyle = '#101014';
  ctx.fill();
  zombies.concat(boss ? [boss] : []).forEach(z => {
    if (!z || z.dead) return;
    let relX = z.x - player.x, relY = z.y - player.y;
    let rotX = relX * Math.cos(-player.dir) - relY * Math.sin(-player.dir);
    let rotY = relX * Math.sin(-player.dir) + relY * Math.cos(-player.dir);
    let rx = RADAR_CX + (rotX / radarZoom) * RADAR_RADIUS;
    let ry = RADAR_CY + (rotY / radarZoom) * RADAR_RADIUS;
    if ((rx - RADAR_CX) ** 2 + (ry - RADAR_CY) ** 2 < RADAR_RADIUS ** 2 - 8) {
      ctx.beginPath();
      ctx.arc(rx, ry, z.isBoss ? 12 : 7, 0, 2 * Math.PI);
      ctx.fillStyle = z.isBoss ? '#fff' : RETRO_GREEN;
      ctx.globalAlpha = 1.0;
      ctx.fill();
    }
  });
  ctx.save();
  ctx.translate(RADAR_CX, RADAR_CY);
  ctx.rotate(0);
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(8, 10);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fillStyle = NEON;
  ctx.shadowColor = RETRO_GREEN;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1.0;
  ctx.restore();
}

// --- HEALTH BAR (in HUD) ---
function drawHealthBar() {
  ctx.save();
  const healthBarW = 180, healthBarH = 26;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#333';
  ctx.fillRect(24, 128, healthBarW, healthBarH);
  ctx.fillStyle = player.hp > 2 ? '#43ff5a' : '#ff3158';
  ctx.fillRect(24, 128, healthBarW * (player.hp / player.maxhp), healthBarH);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(24, 128, healthBarW, healthBarH);
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.97;
  ctx.textAlign = 'left';
  ctx.fillText(`HEALTH: ${player.hp} / ${player.maxhp}`, 32, 147);
  ctx.restore();
}

// --- RENDER FUNCTION ---
function render() {
  // --- Retro BG ---
  ctx.fillStyle = "#141217"; ctx.fillRect(0, 0, canvas.width, canvas.height / 2);
  ctx.fillStyle = "#232426"; ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height * 0.92, FIELD_SIZE * 0.9, Math.PI, 2 * Math.PI, false);
  ctx.fillStyle = "#222";
  ctx.fill();
  ctx.restore();

  // --- Red Pulse on Danger ---
  let danger = zombies.concat(boss ? [boss] : []).some(z => !z.dead && Math.hypot(z.x - player.x, z.y - player.y) < 80);
  if (danger) {
    let pulse = (Math.sin(performance.now() / 140) + 1) * 0.5;
    let alpha = 0.19 + 0.29 * pulse;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = RETRO_RED;
    ctx.lineWidth = 21 + 12 * pulse;
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.stroke();
    ctx.restore();
  }

  // --- Draw Trees ---
  for (let t of trees) {
    if (!treeImg.complete) continue;
    let dx = t.x - player.x, dy = t.y - player.y;
    let dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    if (Math.abs(ang) > player.fov / 2) continue;
    let screenX = (0.5 + ang / player.fov) * canvas.width;
    let size = Math.min(4200 / (dist + 1), 1600) * t.scale * t.baseScale;
    let baseY = (canvas.height / 2) + player.look * 0.09 + 40;
    let screenY = baseY - size;
    if (screenY + size < baseY) {
      ctx.drawImage(
        treeImg,
        Math.round(screenX - size / 2),
        Math.round(screenY),
        Math.round(size),
        Math.round(size)
      );
    } else {
      let visibleHeight = size - ((screenY + size) - baseY);
      if (visibleHeight > 0) {
        let cropY = treeImg.height * (1 - visibleHeight / size);
        ctx.drawImage(
          treeImg,
          0, cropY, treeImg.width, treeImg.height - cropY,
          Math.round(screenX - size / 2),
          Math.round(baseY - visibleHeight),
          Math.round(size),
          Math.round(visibleHeight)
        );
      }
    }
  }

  // --- Draw zombies ---
  for (let z of zombies) {
    if (!zombieImg.complete) continue;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    if (Math.abs(ang) > player.fov / 2) continue;
    let screenX = (0.5 + ang / player.fov) * canvas.width;
    let size = Math.min(4000 / (dist + 0.01), 950) * 1.2;
    let screenY = canvas.height / 2 + size / 2 - size;
    if (!z.dead) {
      // --- Red Glow Outline ---
      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.shadowColor = '#ff2544';
      ctx.shadowBlur = 24;
      ctx.drawImage(
        zombieImg,
        Math.round(screenX - size / 2),
        Math.round(screenY),
        Math.round(size),
        Math.round(size)
      );
      ctx.restore();

      // --- Main Zombie Sprite ---
      ctx.drawImage(
        zombieImg,
        Math.round(screenX - size / 2),
        Math.round(screenY),
        Math.round(size),
        Math.round(size)
      );
    }
    if (z.headshotTime && performance.now() - z.headshotTime < 700) {
      ctx.save();
      ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff22a';
      ctx.shadowColor = '#fffab0';
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 1 - (performance.now() - z.headshotTime) / 700;
      let popupY = canvas.height / 2 - 80 - ((performance.now() - z.headshotTime) / 7);
      ctx.fillText('HEADSHOT!', canvas.width / 2, popupY);
      ctx.restore();
    }
  }

  // --- Draw boss ---
  if (boss && !boss.dead && bossImg.complete) {
    let dx = boss.x - player.x, dy = boss.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    if (Math.abs(ang) <= player.fov / 2) {
      let screenX = (0.5 + ang / player.fov) * canvas.width;
      let size = boss.size;
      let screenY = canvas.height / 2 + size / 2 - size;
      // --- Red Glow Outline ---
      ctx.save();
      ctx.globalAlpha = 0.97;
      ctx.shadowColor = '#ff2544';
      ctx.shadowBlur = 36;
      ctx.drawImage(bossImg, Math.round(screenX - size / 2), Math.round(screenY), Math.round(size), Math.round(size));
      ctx.restore();

      // --- Main Boss Sprite ---
      ctx.drawImage(bossImg, Math.round(screenX - size / 2), Math.round(screenY), Math.round(size), Math.round(size));
      // --- Health Bar & Label ---
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(screenX - size / 2, screenY - 20, size, 14);
      ctx.fillStyle = '#ff3158';
      ctx.fillRect(screenX - size / 2 + 2, screenY - 18, (size - 4) * boss.hp / boss.maxhp, 10);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(screenX - size / 2, screenY - 20, size, 14);
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#000';
      ctx.fillText('BOSS', screenX, screenY - 8);

      if (boss.headshotTime && performance.now() - boss.headshotTime < 700) {
        ctx.save();
        ctx.font = 'bold 40px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff22a';
        ctx.shadowColor = '#fffab0';
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 1 - (performance.now() - boss.headshotTime) / 700;
        let popupY = canvas.height / 2 - 140 - ((performance.now() - boss.headshotTime) / 7);
        ctx.fillText('HEADSHOT!', canvas.width / 2, popupY);
        ctx.restore();
      }
    }
  }

  drawPopups();
  drawHealthBar();

  // --- Crosshair ---
  const cx = canvas.width / 2, cy = canvas.height / 2 + player.look;
  let crosshairScale = crosshairOnTarget ? (0.62 + 0.13 * crosshairPulse) : (1.0 + 0.16 * crosshairPulse);
  let size = 44 * crosshairScale;
  if (crosshairImg.complete) {
    ctx.save();
    ctx.globalAlpha = 0.93;
    ctx.drawImage(crosshairImg, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  }

  // CRT scanlines
  ctx.save();
  ctx.globalAlpha = 0.13;
  for (let y = 0; y < canvas.height; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, canvas.width, 1);
  }
  ctx.restore();

  drawRadar();

  // HUD
  ctx.save();
  ctx.font = 'bold 23px Courier New,monospace';
  ctx.shadowColor = '#43ff5a'; ctx.shadowBlur = 9;
  ctx.fillStyle = '#fff';
  ctx.fillText(`SCORE: ${score}`, 24, 44);
  ctx.fillText(`WAVE: ${wave}`, 24, 78);
  ctx.fillText(`HIGH: ${getHighScore()}`, 24, 112);
  if (player.weapon === 'shotgun') {
    ctx.fillStyle = '#ff3158';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`SHOTGUN [E]`, 600, 54);
    ctx.fillText(`AMMO: ${player.shotgunAmmo}`, 600, 84);
  } else {
    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 21px monospace';
    ctx.fillText(`PISTOL [Default]`, 590, 54);
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`[E] for Shotgun`, 590, 82);
  }
  ctx.shadowBlur = 0; ctx.restore();

  // Gun sprite
  let gunSprite = player.weapon === 'shotgun' ? shotgunImg : pistolImg;
  if (gunSprite.complete) {
    let scale = 0.38;
    if (player.weapon === 'shotgun') scale *= 0.90;
    const gw = gunSprite.width * scale, gh = gunSprite.height * scale;
    let yOffset = (player.weapon === 'shotgun')
      ? Math.round(canvas.height - gh - 6 + canvas.height * 0.10)
      : Math.round(canvas.height - gh - 6);
    ctx.drawImage(gunSprite, Math.round((canvas.width - gw) / 2), yOffset, Math.round(gw), Math.round(gh));
  }

  // Death splat
  if (!player.alive && splatAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = splatAlpha;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(splatScale, splatScale);
    ctx.fillStyle = 'rgba(255,50,80,0.23)';
    for (let i = 0; i < 11; i++) {
      let ang = i * (2 * Math.PI / 11) + Math.random() * 0.18;
      let r = 82 + Math.random() * 38, rad = 17 + Math.random() * 9;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, rad, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  // Game over & wave overlays
  ctx.save();
  if (!player.alive) {
    ctx.globalAlpha = 0.93;
    ctx.shadowColor = '#ff3158'; ctx.shadowBlur = 23;
    ctx.fillStyle = '#ff3158';
    ctx.font = 'bold 78px monospace'; ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 36);
    ctx.shadowBlur = 0; ctx.font = 'bold 34px monospace'; ctx.fillStyle = '#fff';
    ctx.fillText('Score: ' + score, canvas.width / 2, canvas.height / 2 + 30);
    ctx.font = 'bold 21px monospace';
    ctx.fillText('High: ' + getHighScore(), canvas.width / 2, canvas.height / 2 + 60);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('Press [R] or Click to Restart', canvas.width / 2, canvas.height / 2 + 98);
  } else if (gameState === 'waiting') {
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = '#43ff5a'; ctx.shadowBlur = 19;
    ctx.fillStyle = '#43ff5a';
    ctx.font = 'bold 42px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${wave} CLEARED!`, canvas.width / 2, canvas.height / 2 - 18);
    ctx.shadowBlur = 0; ctx.font = 'bold 24px monospace'; ctx.fillStyle = '#fff';
    ctx.fillText('Press OK to Continue', canvas.width / 2, canvas.height / 2 + 22);
  } else if (paused) {
    // Pause Menu
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = '#222d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
    ctx.font = 'bold 66px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#00ffe7';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = 'bold 32px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('[P] Resume   [R] Restart   [Esc] Close', canvas.width / 2, canvas.height / 2 + 44);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('[Reload Page to Quit]', canvas.width / 2, canvas.height / 2 + 78);
  }
  ctx.restore();

  // --- Touch UI ---
  if ('ontouchstart' in window) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); // D-Pad
    ctx.arc(90, canvas.height - 90, 60, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath(); // Right button
    ctx.arc(canvas.width - 80, canvas.height - 90, 46, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = "bold 34px monospace";
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ff3158';
    ctx.fillText("FIRE", canvas.width - 104, canvas.height - 84);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#00ffe7";
    ctx.fillText("MOVE", 54, canvas.height - 75);
    ctx.restore();
  }
}

// --- INIT ---
placeTrees(15);
maybeSpawnPowerup();

// --- GAME LOOP ---
requestAnimationFrame(gameLoop);
function gameLoop() {
  if (!paused) update();
  render();
  requestAnimationFrame(gameLoop);
}
