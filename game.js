// === Zombie Domo: Retro FPS w/ PNG Gun, PNG Zombie, Sliding Zombies, Moaning, CRT, Headshots ===

// --- SOUND EFFECTS ---
let gunSound = new Audio('shotgun.mp3');
gunSound.volume = 0.48;
function playGunSound() {
  let sfx = gunSound.cloneNode();
  sfx.volume = gunSound.volume;
  sfx.play();
}

let moanSound = new Audio('moan.mp3');
moanSound.volume = 0.45;
function playMoanCanvasPosition(z, dist, pan) {
  const now = performance.now();
  if (!z._lastMoanTime || now - z._lastMoanTime > 1200 + Math.random()*600) {
    z._lastMoanTime = now;
    let sfx = moanSound.cloneNode();
    let vol = 1 - Math.min(1, dist/420);
    sfx.volume = Math.max(0.2, Math.min(1.0, vol*0.8+0.2));
    sfx.play();
  }
}

// --- LOAD PNG ASSETS ---
const gunImg = new Image(); gunImg.src = 'gun.png';
const zombieImg = new Image(); zombieImg.src = 'zombie.png';

// --- GLOBALS & MAP ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const map = [
  [1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,0,1,0,1,0,1,0,1],
  [1,0,0,1,0,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1]
];
const MAP_W = map[0].length, MAP_H = map.length, TILE = 64;

const NEON = '#00ffe7', DEEP_BG = '#181626', RETRO_PURPLE = '#a98fff', RETRO_RED = '#ff3158';
const RETRO_GREEN = '#43ff5a', SCANLINE_COLOR = 'rgba(0,0,0,0.12)';

let crosshairOnTarget = false;
let crosshairPulse = 0;

// --- PLAYER STATE ---
function findSafePlayerSpawn() {
  let empties = [];
  for (let y = 1; y < MAP_H - 1; y++)
    for (let x = 1; x < MAP_W - 1; x++)
      if (map[y][x] === 0) empties.push({x: x + 0.5, y: y + 0.5});
  return empties.length ? empties[Math.floor(Math.random()*empties.length)] : {x: 2.5, y: 2.5};
}
function resetPlayer() {
  let s = findSafePlayerSpawn();
  return {x: s.x * TILE, y: s.y * TILE, dir: 0, fov: Math.PI/3, speed: 2.5, rotSpeed: 0.045, alive: true};
}
let player = resetPlayer();
let keys = {}, zombies = [], score = 0, spawnCd = 0;
let hitFlash = 0, pointerLocked = false, lastShootTime = 0;
let gameState = 'playing', wave = 1, zombiesPerWave = 5;
let splatAlpha = 0, splatScale = 1;

// --- POINTER LOCK & INPUT HANDLING ---
canvas.tabIndex = 1;
window.addEventListener('load', () => canvas.focus());
canvas.addEventListener('click', () => {
  if (!player.alive) return restartGame();
  canvas.focus();
  if (!pointerLocked) {
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
    canvas.requestPointerLock();
  }
});
function updatePointerLockState() {
  pointerLocked = (
    document.pointerLockElement === canvas ||
    document.mozPointerLockElement === canvas
  );
}
document.addEventListener('pointerlockchange', updatePointerLockState, false);
document.addEventListener('mozpointerlockchange', updatePointerLockState, false);

document.addEventListener('mousemove', function(e) {
  if (player.alive && gameState === 'playing' && pointerLocked) {
    player.dir += e.movementX * 0.0025;
  }
});
window.addEventListener('keydown', e => {
  if (!player.alive && (e.key === 'r' || e.key === 'R')) return restartGame();
  keys[e.key.toLowerCase()] = true;
  if (['w','a','s','d','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key === ' ') shoot();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener('mousedown', e => { if (player.alive && e.button === 0) shoot(); });

// --- GAME LOOP ---
function shoot() {
  if (!player.alive || gameState !== 'playing') return;
  let now = Date.now();
  if (now - lastShootTime < 150) return;
  lastShootTime = now;
  playGunSound();
  let best = null, bestD = Infinity, cx = canvas.width / 2, tol = 20;
  for (let z of zombies) {
    if (z.dead) continue;
    let dx = z.x - player.x, dy = z.y - player.y, d = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    let sx = (0.5 + ang / player.fov) * canvas.width;
    if (Math.abs(sx - cx) < tol && d < bestD) { best = z; bestD = d; }
  }
  if (best) {
    best.dead = true;
    best.splat = 14; // smaller splat for visibility
    score++;
  }
}

function update() {
  if (gameState !== 'playing') return;

  if (keys['arrowleft']) player.dir -= player.rotSpeed;
  if (keys['arrowright']) player.dir += player.rotSpeed;
  let vx = 0, vy = 0;
  if (keys['w']) { vx += Math.cos(player.dir) * player.speed; vy += Math.sin(player.dir) * player.speed; }
  if (keys['s']) { vx -= Math.cos(player.dir) * player.speed; vy -= Math.sin(player.dir) * player.speed; }
  if (keys['a']) { vx += Math.cos(player.dir - Math.PI/2) * player.speed; vy += Math.sin(player.dir - Math.PI/2) * player.speed; }
  if (keys['d']) { vx += Math.cos(player.dir + Math.PI/2) * player.speed; vy += Math.sin(player.dir + Math.PI/2) * player.speed; }
  let nx = player.x + vx, ny = player.y + vy;
  if (!isWall(nx, player.y)) player.x = nx;
  if (!isWall(player.x, ny)) player.y = ny;

  if (zombies.length < zombiesPerWave && spawnCd <= 0) {
    spawnZombie();
    spawnCd = 120 + Math.random()*60;
  }
  spawnCd--;

  for (let z of zombies) {
    if (!z.dead) {
      let dx = player.x - z.x, dy = player.y - z.y, dist = Math.hypot(dx, dy);
      if (dist > 24) {
        let mx = (dx/dist) * z.speed, my = (dy/dist) * z.speed;
        if (!isWall(z.x + mx, z.y)) z.x += mx;
        if (!isWall(z.x, z.y + my)) z.y += my;
      }
      let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
      if (Math.abs(ang) < player.fov / 2 && dist < 420) {
        let screenPos = 0.5 + ang / player.fov;
        let pan = Math.max(-1, Math.min(1, (screenPos - 0.5) * 2));
        playMoanCanvasPosition(z, dist, pan);
      }
      if (dist < 24 && player.alive) {
        player.alive = false;
        gameState = 'dead';
        hitFlash = 18;
        splatAlpha = 1;
        splatScale = 1;
      }
    }
    if (z.splat > 0) z.splat--;
  }

  if (gameState === 'playing' && zombies.length === zombiesPerWave && zombies.every(z => z.dead)) {
    setTimeout(() => {
      if (confirm(`Wave ${wave} cleared!\nContinue to next wave?`)) nextWave();
    }, 400);
    gameState = 'waiting';
  }

  if (!player.alive && splatAlpha > 0) {
    splatAlpha *= 0.93;
    splatScale += 0.02;
  }
}

// --- DRAW ---
function render() {
  ctx.fillStyle = DEEP_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#222';
  ctx.fillRect(0, canvas.height/2, canvas.width, canvas.height/2);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height/2);

  // Draw zombies
  for (let z of zombies) {
    if (!zombieImg.complete) continue;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    if (Math.abs(ang) > player.fov / 2) continue;
    let screenX = (0.5 + ang / player.fov) * canvas.width;
    let size = Math.min(2200 / (dist + 0.01), 120);
    let screenY = canvas.height/2 + size/2 - size;

    if (z.dead && z.splat > 0) {
      ctx.save();
      ctx.globalAlpha = z.splat / 14;
      ctx.fillStyle = RETRO_RED;
      ctx.beginPath();
      ctx.arc(screenX, canvas.height/2 + size/2, size/2.7, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    } else if (!z.dead) {
      ctx.drawImage(zombieImg, screenX - size/2, screenY, size, size);
    }
  }

  // Crosshair pulse
  crosshairOnTarget = zombies.some(z => {
    if (z.dead) return false;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    let sx = (0.5 + ang / player.fov) * canvas.width;
    return Math.abs(sx - canvas.width/2) < 18 && dist < 320;
  });
  crosshairPulse += crosshairOnTarget ? 0.25 : -0.12;
  crosshairPulse = Math.max(0, Math.min(1, crosshairPulse));

  // Draw crosshair +
  const cx = canvas.width/2, cy = canvas.height/2;
  ctx.save();
  ctx.strokeStyle = crosshairOnTarget ? RETRO_GREEN : NEON;
  ctx.lineWidth = crosshairOnTarget ? 3.2 : 2;
  ctx.shadowColor = crosshairOnTarget ? RETRO_GREEN : NEON;
  ctx.shadowBlur = crosshairOnTarget ? 12 : 6;
  ctx.globalAlpha = 0.82;
  // horizontal
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
  // vertical
  ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Neon dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4 + 8 * crosshairPulse, 0, 2 * Math.PI);
  ctx.fillStyle = crosshairOnTarget ? RETRO_GREEN : NEON;
  ctx.globalAlpha = 0.43 + 0.4 * crosshairPulse;
  ctx.fill();
  ctx.restore();

  // CRT scanlines
  ctx.save();
  ctx.globalAlpha = 0.13;
  for (let y = 0; y < canvas.height; y += 3) {
    ctx.fillStyle = SCANLINE_COLOR;
    ctx.fillRect(0, y, canvas.width, 1);
  }
  ctx.restore();

  // HUD
  ctx.save();
  ctx.font = 'bold 23px Courier New,monospace';
  ctx.shadowColor = RETRO_GREEN; ctx.shadowBlur = 9;
  ctx.fillStyle = '#fff';
  ctx.fillText(`SCORE: ${score}`, 24, 44);
  ctx.fillText(`WAVE: ${wave}`, 24, 78);
  ctx.shadowBlur = 0; ctx.restore();

  // Gun sprite
  if (gunImg.complete) {
    const scale = 0.34, gw = gunImg.width * scale, gh = gunImg.height * scale;
    ctx.drawImage(gunImg, (canvas.width - gw) / 2, canvas.height - gh - 6, gw, gh);
  }

  // Death splat
  if (!player.alive && splatAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = splatAlpha;
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(splatScale, splatScale);
    ctx.fillStyle = 'rgba(255,50,80,0.23)';
    for (let i = 0; i < 11; i++) {
      let ang = i * (2 * Math.PI / 11) + Math.random()*0.18;
      let r = 82 + Math.random()*38, rad = 17 + Math.random()*9;
      ctx.beginPath();
      ctx.arc(Math.cos(ang)*r, Math.sin(ang)*r, rad, 0, 2*Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  // Game over & wave overlays
  ctx.save();
  if (!player.alive) {
    ctx.globalAlpha = 0.93;
    ctx.shadowColor = RETRO_RED; ctx.shadowBlur = 23;
    ctx.fillStyle = RETRO_RED;
    ctx.font = 'bold 78px monospace'; ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2-36);
    ctx.shadowBlur = 0; ctx.font = 'bold 34px monospace'; ctx.fillStyle = '#fff';
    ctx.fillText('Score: '+score, canvas.width/2, canvas.height/2+30);
    ctx.font = 'bold 21px monospace';
    ctx.fillText('Press [R] or Click to Restart', canvas.width/2, canvas.height/2+68);
  } else if (gameState === 'waiting') {
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = RETRO_GREEN; ctx.shadowBlur = 19;
    ctx.fillStyle = RETRO_GREEN;
    ctx.font = 'bold 42px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${wave} CLEARED!`, canvas.width/2, canvas.height/2-18);
    ctx.shadowBlur = 0; ctx.font = 'bold 24px monospace'; ctx.fillStyle = '#fff';
    ctx.fillText('Press OK to Continue', canvas.width/2, canvas.height/2+22);
  }
  ctx.restore();
}

// --- HELPERS ---
function normalizeAngle(a) {
  while (a < -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}
function isWall(x, y) {
  let mx = Math.floor(x / TILE), my = Math.floor(y / TILE);
  return map[my] && map[my][mx] === 1;
}
function spawnZombie() {
  const spawns = [[1,1],[10,1],[1,6],[10,6],[6,1],[6,6]];
  let safe = spawns.filter(([mx, my]) => Math.hypot((mx + 0.5)*TILE - player.x, (my + 0.5)*TILE - player.y) > TILE * 2);
  let [mx, my] = (safe.length ? safe : spawns)[Math.floor(Math.random() * (safe.length || spawns.length))];
  zombies.push({ x: (mx + 0.5) * TILE, y: (my + 0.5) * TILE, dead: false, splat: 0, speed: 0.3 + Math.random() * 0.2 });
}
function nextWave() {
  wave++;
  zombiesPerWave += 2;
  zombies = [];
  spawnCd = 0;
  gameState = 'playing';
}
function restartGame() {
  player = resetPlayer();
  keys = {};
  zombies = [];
  score = 0;
  wave = 1;
  zombiesPerWave = 5;
  spawnCd = 0;
  hitFlash = 0;
  splatAlpha = 0;
  splatScale = 1;
  gameState = 'playing';
  if (document.exitPointerLock) document.exitPointerLock();
}

// --- RUN LOOP ---
requestAnimationFrame(gameLoop);
function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}
