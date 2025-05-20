// === Zombie Domo: Retro FPS w/ PNG Gun, PNG Zombie, Moaning, CRT, Headshots, Radar, Moon, Trees ===

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
const treeImg = new Image(); treeImg.src = 'tree.png';

// --- GLOBALS ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const FIELD_SIZE = 11 * 64;
const NEON = '#00ffe7', DEEP_BG = '#181626', RETRO_PURPLE = '#a98fff', RETRO_RED = '#ff3158';
const RETRO_GREEN = '#43ff5a', SCANLINE_COLOR = 'rgba(0,0,0,0.12)';
let crosshairOnTarget = false, crosshairPulse = 0;

// --- PLAYER STATE ---
function resetPlayer() {
  return {
    x: canvas.width / 2,
    y: canvas.height / 2,
    dir: 0,
    fov: Math.PI/3,
    speed: 1.4,
    rotSpeed: 0.035,
    alive: true
  };
}

let player = resetPlayer();
let keys = {}, zombies = [], score = 0, spawnCd = 0, trees = [];
let hitFlash = 0, pointerLocked = false, lastShootTime = 0;
let gameState = 'playing', wave = 1, zombiesPerWave = 12; // more zombies default
let splatAlpha = 0, splatScale = 1;

// --- TREE GENERATION ---
function placeTrees(num = 13) {
  trees = [];
  for (let i = 0; i < num; i++) {
    let angle = Math.random() * Math.PI * 2;
    // Further distance and random elevation ("raise")
    let dist = 340 + Math.random() * 480; // Spread trees further out
    let raise = 90 + Math.random() * 100; // Higher "rise" for distant feel
    trees.push({
      x: player.x + Math.cos(angle) * dist + (Math.random() - 0.5) * 80,
      y: player.y + Math.sin(angle) * dist + (Math.random() - 0.5) * 80,
      scale: (2.2 + Math.random() * 1.0) * 0.95,    // 5% smaller trees
      raise: raise
    });
  }
}

// --- INPUT HANDLING ---
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
  let best = null, bestD = Infinity, cx = canvas.width / 2, tol = 38;
  for (let z of zombies) {
    if (z.dead) continue;
    let dx = z.x - player.x, dy = z.y - player.y, d = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    let sx = (0.5 + ang / player.fov) * canvas.width;
    if (Math.abs(sx - cx) < tol && d < bestD) { best = z; bestD = d; }
  }
  if (best) {
    best.dead = true;
    best.splat = 18;
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
  player.x += vx;
  player.y += vy;

  // Keep player roughly in the field bounds
  player.x = Math.max(64, Math.min(FIELD_SIZE-64, player.x));
  player.y = Math.max(64, Math.min(FIELD_SIZE-64, player.y));

  if (zombies.length < zombiesPerWave && spawnCd <= 0) {
    spawnZombie();
    spawnCd = 120 + Math.random()*60;
  }
  spawnCd--;

  for (let z of zombies) {
    if (!z.dead) {
      let dx = player.x - z.x, dy = player.y - z.y, dist = Math.hypot(dx, dy);
      if (dist > 26) {
        let mx = (dx/dist) * z.speed, my = (dy/dist) * z.speed;
        z.x += mx * 0.82; // slow zombies by 18%
        z.y += my * 0.82;
      }
      let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
      if (Math.abs(ang) < player.fov / 2 && dist < 420) {
        let screenPos = 0.5 + ang / player.fov;
        let pan = Math.max(-1, Math.min(1, (screenPos - 0.5) * 2));
        playMoanCanvasPosition(z, dist, pan);
      }
      if (dist < 26 && player.alive) {
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

function render() {
  // Night sky and ground
  ctx.fillStyle = DEEP_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#222';
  ctx.fillRect(0, canvas.height/2, canvas.width, canvas.height/2);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height/2);

// Removed moon by popular demand
/*
ctx.save();
ctx.globalAlpha = 0.92;
ctx.beginPath();
ctx.arc(120, 84, 54, 0, 2*Math.PI);
ctx.fillStyle = "#e8e9ff";
ctx.shadowColor = "#cccfff";
ctx.shadowBlur = 38;
ctx.fill();
ctx.shadowBlur = 0;
ctx.beginPath();
ctx.arc(138, 76, 18, 0, 2*Math.PI);
ctx.fillStyle = "#e8e9ff33";
ctx.fill();
ctx.restore();
*/


  // Draw trees (big, random raise, further away)
  if (treeImg.complete) {
    trees.slice().sort((a, b) => {
      let da = Math.hypot(a.x - player.x, a.y - player.y);
      let db = Math.hypot(b.x - player.x, b.y - player.y);
      return db - da;
    }).forEach(tree => {
      let dx = tree.x - player.x, dy = tree.y - player.y;
      let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
      let dist = Math.hypot(dx, dy);
      if (Math.abs(ang) < player.fov * 0.82 && dist > 220 && dist < 980) {
        let screenX = (0.5 + ang / player.fov) * canvas.width;
        let size = Math.min(18000 / (dist + 0.01), 1080) * tree.scale * 2.2;
        // LOWERED trees:
        let screenY = canvas.height/2 + size/2 - size - tree.raise/2;
        ctx.save();
        ctx.globalAlpha = Math.max(0.16, Math.min(0.98, 0.93 - dist/950));
        ctx.drawImage(treeImg, screenX - size/2, screenY, size, size);
        ctx.restore();
      }
    });
  }

  // Draw zombies (bigger by 20%)
  for (let z of zombies) {
    if (!zombieImg.complete) continue;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    if (Math.abs(ang) > player.fov / 2) continue;
    let screenX = (0.5 + ang / player.fov) * canvas.width;
    let size = Math.min(4000 / (dist + 0.01), 950) * 1.2; // 20% larger zombies
    let screenY = canvas.height/2 + size/2 - size;
    if (z.dead && z.splat > 0) {
      ctx.save();
      ctx.globalAlpha = z.splat / 18;
      ctx.fillStyle = RETRO_RED;
      ctx.beginPath();
      ctx.arc(screenX, canvas.height/2 + size/2, size/2.2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    } else if (!z.dead) {
      ctx.drawImage(zombieImg, screenX - size/2, screenY, size, size);
    }
  }

  // Crosshair pulse (ONLY center pulse dot, removed border lines)
  crosshairOnTarget = zombies.some(z => {
    if (z.dead) return false;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    let sx = (0.5 + ang / player.fov) * canvas.width;
    return Math.abs(sx - canvas.width/2) < 24 && dist < 320;
  });
  crosshairPulse += crosshairOnTarget ? 0.25 : -0.12;
  crosshairPulse = Math.max(0, Math.min(1, crosshairPulse));

  // Draw crosshair dot only
  const cx = canvas.width/2, cy = canvas.height/2;
  ctx.save();
  ctx.strokeStyle = crosshairOnTarget ? RETRO_GREEN : NEON;
  ctx.lineWidth = crosshairOnTarget ? 3.2 : 2;
  ctx.shadowColor = crosshairOnTarget ? RETRO_GREEN : NEON;
  ctx.shadowBlur = crosshairOnTarget ? 12 : 6;
  ctx.globalAlpha = 0.82;
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

  drawRadar();

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
    const scale = 0.38, gw = gunImg.width * scale, gh = gunImg.height * scale;
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

// --- RADAR (Player always at center, world rotates) ---
function drawRadar() {
  const RADAR_SIZE = 120;
  const RADAR_RADIUS = RADAR_SIZE/2 - 8;
  const RADAR_CX = canvas.width - RADAR_SIZE/2 - 18;
  const RADAR_CY = RADAR_SIZE/2 + 18;
  const radarZoom = 260; // How much area radar shows (bigger=zoom out)

  // Radar background
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.beginPath();
  ctx.arc(RADAR_CX, RADAR_CY, RADAR_SIZE/2, 0, 2 * Math.PI);
  ctx.fillStyle = '#101014';
  ctx.fill();
  ctx.strokeStyle = RETRO_PURPLE;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw zombies on radar
  zombies.forEach(z => {
    let relX = z.x - player.x, relY = z.y - player.y;
    // Rotate world relative to player view:
    let rotX = relX * Math.cos(-player.dir) - relY * Math.sin(-player.dir);
    let rotY = relX * Math.sin(-player.dir) + relY * Math.cos(-player.dir);
    // Scale to radar size
    let rx = RADAR_CX + (rotX / radarZoom) * RADAR_RADIUS;
    let ry = RADAR_CY + (rotY / radarZoom) * RADAR_RADIUS;
    // Only draw if within radar circle
    if ((rx - RADAR_CX)**2 + (ry - RADAR_CY)**2 < RADAR_RADIUS**2 - 8) {
      ctx.beginPath();
      ctx.arc(rx, ry, z.dead ? 4 : 7, 0, 2 * Math.PI);
      ctx.fillStyle = z.dead ? RETRO_RED : RETRO_GREEN;
      ctx.globalAlpha = z.dead ? 0.45 : 1.0;
      ctx.fill();
    }
  });

  // Draw player (triangle) always at center
  ctx.save();
  ctx.translate(RADAR_CX, RADAR_CY);
  ctx.rotate(0); // Point up
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

// --- HELPERS ---
function normalizeAngle(a) {
  while (a < -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}
function spawnZombie() {
  let angle = Math.random() * Math.PI * 2;
  let dist = 260 + Math.random() * 180;
  zombies.push({
    x: player.x + Math.cos(angle) * dist,
    y: player.y + Math.sin(angle) * dist,
    dead: false,
    splat: 0,
    speed: (0.16 + Math.random() * 0.12) * 0.82 // slower zombies
  });
}

function nextWave() {
  wave++;
  zombiesPerWave += 2; // each wave, more zombies!
  zombies = [];
  spawnCd = 0;
  gameState = 'playing';
  placeTrees(13 + Math.floor(Math.random()*7));
}
function restartGame() {
  player = resetPlayer();
  keys = {};
  zombies = [];
  score = 0;
  wave = 1;
  zombiesPerWave = 12; // start w/ more zombies
  spawnCd = 0;
  hitFlash = 0;
  splatAlpha = 0;
  splatScale = 1;
  gameState = 'playing';
  placeTrees(17);
  if (document.exitPointerLock) document.exitPointerLock();
}

// --- INIT TREES ---
placeTrees(17);

// --- RUN LOOP ---
requestAnimationFrame(gameLoop);
function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}
