// === Zombie Domo: Retro FPS v3: PNG Crosshair, Score Popups, Loud Headshots ===

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
let headshotDing = new Audio('headshot.mp3');
headshotDing.volume = 1.0; // MAX volume!
function playHeadshotSound() {
  let sfx = headshotDing.cloneNode();
  sfx.volume = 1.0;
  sfx.play();
}

// --- LOAD PNG ASSETS ---
const gunImg = new Image(); gunImg.src = 'gun.png';
const zombieImg = new Image(); zombieImg.src = 'zombie.png';
const treeImg = new Image(); treeImg.src = 'tree.png';
const bossImg = new Image(); bossImg.src = 'zombie.png'; // Re-use zombie.png or use boss.png
const crosshairImg = new Image(); crosshairImg.src = 'crosshair.png';

// --- GLOBALS ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;
ctx.imageSmoothingEnabled = false;

const FIELD_SIZE = 11 * 64;
const NEON = '#00ffe7', DEEP_BG = '#181626', RETRO_PURPLE = '#a98fff', RETRO_RED = '#ff3158';
const RETRO_GREEN = '#43ff5a', SCANLINE_COLOR = 'rgba(0,0,0,0.12)';
let crosshairOnTarget = false, crosshairPulse = 0, crosshairIsOnBoss = false;

// --- Local High Score ---
function getHighScore() {
  return Number(localStorage.getItem('zombiedomo_highscore') || "0");
}
function setHighScore(val) {
  localStorage.setItem('zombiedomo_highscore', String(val));
}

// --- PLAYER STATE ---
function resetPlayer() {
  return {
    x: canvas.width / 2,
    y: canvas.height / 2,
    dir: 0,
    look: 0,
    fov: Math.PI/3,
    speed: 1.4,
    rotSpeed: 0.035,
    alive: true
  };
}
let player = resetPlayer();
let keys = {}, zombies = [], score = 0, spawnCd = 0, trees = [];
let hitFlash = 0, pointerLocked = false, lastShootTime = 0;
let gameState = 'playing', wave = 1, zombiesPerWave = 12;
let splatAlpha = 0, splatScale = 1;
let highScore = getHighScore();
let boss = null;
const FINAL_WAVE = 5;
let popups = [];

// --- TREE GENERATION ---
function placeTrees(num = 13) {
  trees = [];
  for (let i = 0; i < num; i++) {
    let angle = Math.random() * Math.PI * 2;
    let dist = 340 + Math.random() * 480;
    let raise = 90 + Math.random() * 100;
    trees.push({
      x: player.x + Math.cos(angle) * dist + (Math.random() - 0.5) * 80,
      y: player.y + Math.sin(angle) * dist + (Math.random() - 0.5) * 80,
      scale: (2.2 + Math.random() * 1.0) * 0.95,
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

// INVERTED MOUSE!
document.addEventListener('mousemove', function(e) {
  if (player.alive && gameState === 'playing' && pointerLocked) {
    player.dir += e.movementX * 0.0025;
    player.look += e.movementY * 0.22; // inverted
    player.look = Math.max(-160, Math.min(160, player.look));
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

// --- SHOOT FUNCTION WITH HEADSHOTS, POPUPS, BOSS ---
function shoot() {
  if (!player.alive || gameState !== 'playing') return;
  let now = Date.now();
  if (now - lastShootTime < 150) return;
  lastShootTime = now;
  playGunSound();
  let cx = canvas.width / 2;
  let cy = canvas.height / 2 + player.look;
  let best = null, bestD = Infinity, headshot = false, hitX = 0, hitY = 0;
  for (let z of zombies.concat(boss ? [boss] : [])) {
    if (!z || z.dead) continue;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    let sx = (0.5 + ang / player.fov) * canvas.width;
    let size = z.isBoss ? z.size : Math.min(4000 / (dist + 0.01), 950) * 1.2;
    let sy = canvas.height/2 + size/2 - size;
    if (Math.abs(sx - cx) < size * 0.23 && Math.abs(cy - (sy + size * 0.54)) < size * 0.53 && dist < bestD) {
      if (cy < sy + size * 0.29) headshot = true;
      best = z; bestD = dist;
      hitX = sx;
      hitY = cy;
    }
  }
  if (best) {
    if (best.isBoss) {
      let damage = headshot ? 2 : 1;
      best.hp -= damage;
      if (headshot) {
        score += 10;
        best.headshotTime = performance.now();
        playHeadshotSound();
        popups.push({msg: 'HEADSHOT!', x: hitX, y: hitY, t: performance.now(), color: '#fff22a'});
        popups.push({msg: '+10', x: hitX, y: hitY+32, t: performance.now(), color: '#fff'});
      } else {
        score += 2;
        popups.push({msg: '+2', x: hitX, y: hitY+28, t: performance.now(), color: '#fff'});
      }
      if (best.hp <= 0) {
        best.dead = true;
        best.splat = 30;
        score += 50;
        popups.push({msg: 'BOSS DOWN!', x: hitX, y: hitY-32, t: performance.now(), color: '#fff22a'});
        popups.push({msg: '+50', x: hitX, y: hitY, t: performance.now(), color: '#fff'});
      }
    } else {
      best.dead = true;
      best.splat = headshot ? 24 : 18;
      if (headshot) {
        score += 5;
        best.headshotTime = performance.now();
        playHeadshotSound();
        popups.push({msg: 'HEADSHOT!', x: hitX, y: hitY, t: performance.now(), color: '#fff22a'});
        popups.push({msg: '+5', x: hitX, y: hitY+28, t: performance.now(), color: '#fff'});
      } else {
        score++;
        popups.push({msg: '+1', x: hitX, y: hitY+28, t: performance.now(), color: '#fff'});
      }
    }
  }
}

// --- SCORE/HEADSHOT POPUPS ---
function drawPopups() {
  let now = performance.now();
  for (let i = popups.length - 1; i >= 0; i--) {
    let p = popups[i];
    let life = now - p.t;
    if (life > 820) { popups.splice(i,1); continue; }
    ctx.save();
    ctx.globalAlpha = 1 - (life / 820);
    ctx.font = /HEADSHOT|BOSS DOWN/i.test(p.msg) ? 'bold 34px monospace' : 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.color || '#fff';
    ctx.shadowColor = p.color;
    ctx.shadowBlur = /HEADSHOT|BOSS DOWN/i.test(p.msg) ? 18 : 7;
    ctx.fillText(p.msg, p.x, p.y - (life/25));
    ctx.restore();
  }
}

// --- UPDATE & GAME LOOP ---
function update() {
  if (gameState !== 'playing') return;
  if (keys['arrowleft']) player.dir -= player.rotSpeed;
  if (keys['arrowright']) player.dir += player.rotSpeed;
  let vx = 0, vy = 0;
  if (keys['w']) { vx += Math.cos(player.dir) * player.speed; vy += Math.sin(player.dir) * player.speed; }
  if (keys['s']) { vx -= Math.cos(player.dir) * player.speed; vy -= Math.sin(player.dir) * player.speed; }
  if (keys['a']) { vx += Math.cos(player.dir - Math.PI/2) * player.speed; vy += Math.sin(player.dir - Math.PI/2) * player.speed; }
  if (keys['d']) { vx += Math.cos(player.dir + Math.PI/2) * player.speed; vy += Math.sin(player.dir + Math.PI/2) * player.speed; }
  player.x += vx; player.y += vy;
  player.x = Math.max(64, Math.min(FIELD_SIZE-64, player.x));
  player.y = Math.max(64, Math.min(FIELD_SIZE-64, player.y));

  // Spawn zombies, then boss if needed
  if (!boss && wave === FINAL_WAVE && zombies.length === 0) {
    spawnBoss();
  } else if (zombies.length < zombiesPerWave && spawnCd <= 0) {
    spawnZombie();
    spawnCd = 120 + Math.random()*60;
  }
  spawnCd--;
  for (let z of zombies.concat(boss ? [boss] : [])) {
    if (!z || z.dead) continue;
    let dx = player.x - z.x, dy = player.y - z.y, dist = Math.hypot(dx, dy);
    if (dist > 26) {
      let mx = (dx/dist) * z.speed, my = (dy/dist) * z.speed;
      z.x += mx * 0.82;
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
    if (z.splat > 0) z.splat--;
  }

  // Check wave clear (including boss)
  let allZombiesDead = zombies.every(z => z.dead) && (!boss || boss.dead);
  if (gameState === 'playing' && zombies.length === zombiesPerWave && allZombiesDead) {
    setTimeout(() => {
      if (wave === FINAL_WAVE) {
        if (score > highScore) setHighScore(score);
        alert("YOU WIN! Final Score: " + score + "\nHigh Score: " + getHighScore());
        restartGame();
      } else if (confirm(`Wave ${wave} cleared!\nContinue to next wave?`)) {
        nextWave();
      }
    }, 400);
    gameState = 'waiting';
  }

  if (!player.alive && splatAlpha > 0) {
    splatAlpha *= 0.93;
    splatScale += 0.02;
    if (score > highScore) setHighScore(score);
  }
}

// --- RENDER LOOP ---
function render() {
  ctx.fillStyle = DEEP_BG; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#222'; ctx.fillRect(0, canvas.height/2, canvas.width, canvas.height/2);
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height/2);

  // Draw trees
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
        let screenY = canvas.height/2 + size/2 - size - tree.raise/2;
        ctx.save();
        ctx.globalAlpha = Math.max(0.16, Math.min(0.98, 0.93 - dist/950));
        ctx.drawImage(treeImg, Math.round(screenX - size/2), Math.round(screenY), Math.round(size), Math.round(size));
        ctx.restore();
      }
    });
  }

  // Draw zombies
  for (let z of zombies) {
    if (!zombieImg.complete) continue;
    let dx = z.x - player.x, dy = z.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    if (Math.abs(ang) > player.fov / 2) continue;
    let screenX = (0.5 + ang / player.fov) * canvas.width;
    let size = Math.min(4000 / (dist + 0.01), 950) * 1.2;
    let screenY = canvas.height/2 + size/2 - size;
    if (!z.dead) {
      ctx.drawImage(zombieImg, Math.round(screenX - size/2), Math.round(screenY), Math.round(size), Math.round(size));
    }
    // Headshot popup
    if (z.headshotTime && performance.now() - z.headshotTime < 700) {
      ctx.save();
      ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff22a';
      ctx.shadowColor = '#fffab0';
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 1 - (performance.now() - z.headshotTime)/700;
      let popupY = canvas.height/2 - 80 - ((performance.now() - z.headshotTime)/7);
      ctx.fillText('HEADSHOT!', canvas.width/2, popupY);
      ctx.restore();
    }
  }

  // Draw boss
  if (boss && !boss.dead && bossImg.complete) {
    let dx = boss.x - player.x, dy = boss.y - player.y, dist = Math.hypot(dx, dy);
    let ang = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    if (Math.abs(ang) <= player.fov / 2) {
      let screenX = (0.5 + ang / player.fov) * canvas.width;
      let size = boss.size;
      let screenY = canvas.height/2 + size/2 - size;
      ctx.save();
      ctx.globalAlpha = 0.98;
      ctx.drawImage(bossImg, Math.round(screenX - size/2), Math.round(screenY), Math.round(size), Math.round(size));
      // Boss HP bar
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(screenX-size/2, screenY-20, size, 14);
      ctx.fillStyle = RETRO_RED;
      ctx.fillRect(screenX-size/2+2, screenY-18, (size-4)*boss.hp/boss.maxhp, 10);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(screenX-size/2, screenY-20, size, 14);
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#000';
      ctx.fillText('BOSS', screenX, screenY-8);
      ctx.restore();
      // Headshot popup
      if (boss.headshotTime && performance.now() - boss.headshotTime < 700) {
        ctx.save();
        ctx.font = 'bold 40px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff22a';
        ctx.shadowColor = '#fffab0';
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 1 - (performance.now() - boss.headshotTime)/700;
        let popupY = canvas.height/2 - 140 - ((performance.now() - boss.headshotTime)/7);
        ctx.fillText('HEADSHOT!', canvas.width/2, popupY);
        ctx.restore();
      }
    }
  }

  // Score and headshot popups (NEW)
  drawPopups();

  // --- Crosshair: PNG version ---
  const cx = canvas.width/2, cy = canvas.height/2 + player.look;
  let crosshairScale = crosshairOnTarget ? (0.62 + 0.13*crosshairPulse) : (1.0 + 0.16*crosshairPulse);
  let size = 44 * crosshairScale;
  if (crosshairImg.complete) {
    ctx.save();
    ctx.globalAlpha = 0.93;
    ctx.drawImage(crosshairImg, cx - size/2, cy - size/2, size, size);
    ctx.restore();
  }

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
  ctx.fillText(`HIGH: ${getHighScore()}`, 24, 112);
  ctx.shadowBlur = 0; ctx.restore();

  // Gun sprite
  if (gunImg.complete) {
    const scale = 0.38, gw = gunImg.width * scale, gh = gunImg.height * scale;
    ctx.drawImage(gunImg, Math.round((canvas.width - gw) / 2), Math.round(canvas.height - gh - 6), Math.round(gw), Math.round(gh));
  }

  // Death splat (for fun, keeps original animation when you die)
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
    ctx.fillText('High: '+getHighScore(), canvas.width/2, canvas.height/2+60);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('Press [R] or Click to Restart', canvas.width/2, canvas.height/2+98);
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

// --- RADAR ---
function drawRadar() {
  const RADAR_SIZE = 120;
  const RADAR_RADIUS = RADAR_SIZE/2 - 8;
  const RADAR_CX = canvas.width - RADAR_SIZE/2 - 18;
  const RADAR_CY = RADAR_SIZE/2 + 18;
  const radarZoom = 260;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.arc(RADAR_CX, RADAR_CY, RADAR_SIZE/2, 0, 2 * Math.PI);
  ctx.fillStyle = '#101014';
  ctx.fill();
  zombies.concat(boss ? [boss] : []).forEach(z => {
    if (!z || z.dead) return;
    let relX = z.x - player.x, relY = z.y - player.y;
    let rotX = relX * Math.cos(-player.dir) - relY * Math.sin(-player.dir);
    let rotY = relX * Math.sin(-player.dir) + relY * Math.cos(-player.dir);
    let rx = RADAR_CX + (rotX / radarZoom) * RADAR_RADIUS;
    let ry = RADAR_CY + (rotY / radarZoom) * RADAR_RADIUS;
    if ((rx - RADAR_CX)**2 + (ry - RADAR_CY)**2 < RADAR_RADIUS**2 - 8) {
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
    speed: (0.16 + Math.random() * 0.12) * 0.82
  });
}
function spawnBoss() {
  boss = {
    x: player.x + Math.cos(Math.random() * 2 * Math.PI) * 380,
    y: player.y + Math.sin(Math.random() * 2 * Math.PI) * 380,
    dead: false,
    splat: 0,
    size: 310,
    speed: 0.09,
    hp: 7,
    maxhp: 7,
    isBoss: true
  };
}
function nextWave() {
  wave++;
  zombiesPerWave += 2;
  zombies = [];
  boss = null;
  spawnCd = 0;
  gameState = 'playing';
  placeTrees(13 + Math.floor(Math.random()*7));
}
function restartGame() {
  player = resetPlayer();
  keys = {};
  zombies = [];
  boss = null;
  score = 0;
  wave = 1;
  zombiesPerWave = 12;
  spawnCd = 0;
  hitFlash = 0;
  splatAlpha = 0;
  splatScale = 1;
  gameState = 'playing';
  popups = [];
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
