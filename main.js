const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: 0x87CEEB,
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

let player, cursors, bullets, bots, storm, stormRadius;
let joystick = { x:0, y:0, active:false };
let lastFire = 0;
let botsCount = 6;
let mapBounds = { w: 3000, h: 3000 };
let cameraSpeed = 0.08;

function preload() {}

function create() {
  this.cameras.main.setBounds(0, 0, mapBounds.w, mapBounds.h);
  this.physics.world.setBounds(0,0,mapBounds.w,mapBounds.h);

  const g = this.add.rectangle(mapBounds.w/2, mapBounds.h/2, mapBounds.w, mapBounds.h, 0x90EE90);
  g.setDepth(-2);

  for (let i=0;i<60;i++){
    let x = Phaser.Math.Between(200, mapBounds.w-200);
    let y = Phaser.Math.Between(200, mapBounds.h-200);
    let r = Phaser.Math.Between(30,70);
    let c = this.add.circle(x,y,r,0x228B22);
    this.physics.add.existing(c, true);
  }

  player = this.add.circle(400, 300, 20, 0xffff66);
  this.physics.add.existing(player);
  player.body.setCollideWorldBounds(true);
  player.speed = 220;
  player.health = 100;
  player.ammo = 10;
  player.isPlayer = true;

  bots = this.physics.add.group();
  for (let i=0;i<botsCount;i++) spawnBot(this);

  bullets = this.physics.add.group();

  this.cameras.main.startFollow(player, true, cameraSpeed, cameraSpeed);
  this.cameras.main.setZoom(1.0);

  stormRadius = Math.max(mapBounds.w, mapBounds.h) * 0.6;
  storm = this.add.circle(mapBounds.w/2, mapBounds.h/2, stormRadius, 0xff4444, 0.12);
  storm.centerX = mapBounds.w/2; storm.centerY = mapBounds.h/2;

  this.physics.add.overlap(bullets, bots, (b, bot) => {
    b.destroy();
    bot.health -= 25;
    if (bot.health <= 0) bot.destroy();
  });

  this.physics.add.overlap(bullets, player, (b, p) => {
    if (!b.isFromPlayer) {
      b.destroy();
      player.health -= 15;
    }
  });

  this.physics.add.overlap(player, bots, (p, bot) => {
    p.health -= 0.2;
  });

  setupJoystick(this);

  document.getElementById('fire').addEventListener('touchstart', (e)=> {
    e.preventDefault();
    fireBullet(this, player, true);
  });
  document.getElementById('fire').addEventListener('mousedown', (e)=> {
    e.preventDefault();
    fireBullet(this, player, true);
  });

  this.hud = this.add.text(10,10, '', { fontSize: '18px', fill:'#000' }).setScrollFactor(0);
}

function update(time, delta) {
  if (joystick.active) {
    let vx = joystick.x * player.speed;
    let vy = joystick.y * player.speed;
    player.body.setVelocity(vx, vy);
    if (vx!==0 || vy!==0) player.rotation = Phaser.Math.Angle.Between(0,0,vx,vy);
  } else {
    player.body.setVelocity(0);
  }

  bots.getChildren().forEach(bot => {
    if (!bot.active) return;
    let dx = player.x - bot.x, dy = player.y - bot.y;
    let dist = Math.hypot(dx,dy);
    if (dist < 400 && Phaser.Math.Between(0,100) > 95) {
      shootAt(this, bot, player);
    }
    if (!bot.target || Phaser.Math.Distance.Between(bot.x, bot.y, bot.target.x, bot.target.y) < 20) {
      bot.target = { x: Phaser.Math.Between(200,mapBounds.w-200), y: Phaser.Math.Between(200,mapBounds.h-200) };
    }
    this.physics.moveTo(bot, bot.target.x, bot.target.y, bot.speed);
  });

  bullets.getChildren().forEach(b => {
    if (b.x < 0 || b.x > mapBounds.w || b.y < 0 || b.y > mapBounds.h) b.destroy();
  });

  if (time % 1000 < 50) {
    stormRadius = Math.max(150, stormRadius - 6);
    storm.setRadius(stormRadius);
  }
  storm.x = storm.centerX; storm.y = storm.centerY;

  let distToCenter = Phaser.Math.Distance.Between(player.x, player.y, storm.centerX, storm.centerY);
  if (distToCenter > stormRadius) {
    player.health -= 0.2;
  }

  this.hud.setText(`HP: ${Math.max(0, Math.round(player.health))}   Ammo: ${player.ammo}`);

  if (player.health <= 0) {
    endGame(this, false);
  }
  if (bots.countActive(true) === 0) {
    endGame(this, true);
  }
}

function spawnBot(scene) {
  let x = Phaser.Math.Between(200, mapBounds.w-200);
  let y = Phaser.Math.Between(200, mapBounds.h-200);
  let b = scene.add.circle(x,y,18,0xff6666);
  scene.physics.add.existing(b);
  b.body.setCollideWorldBounds(true);
  b.speed = Phaser.Math.Between(80,140);
  b.health = 100;
  bots.add(b);
}

function fireBullet(scene, origin, fromPlayer = true) {
  if (fromPlayer && player.ammo <= 0) return;
  if (fromPlayer) player.ammo--;

  let dirx = joystick.x, diry = joystick.y;
  if (!joystick.active || (dirx === 0 && diry === 0)) {
    dirx = Math.cos(origin.rotation || 0);
    diry = Math.sin(origin.rotation || 0);
  }

  let bx = scene.add.circle(origin.x + dirx*30, origin.y + diry*30, 6, 0x222222);
  scene.physics.add.existing(bx);
  bx.body.setVelocity(dirx * 600, diry * 600);
  bx.isFromPlayer = fromPlayer;
  bullets.add(bx);
}

function shootAt(scene, bot, target) {
  let dx = target.x - bot.x, dy = target.y - bot.y;
  let len = Math.hypot(dx,dy);
  if (len === 0) return;
  let nx = dx/len, ny = dy/len;
  let bx = scene.add.circle(bot.x + nx*28, bot.y + ny*28, 6, 0x000);
  scene.physics.add.existing(bx);
  bx.body.setVelocity(nx * 520, ny * 520);
  bx.isFromPlayer = false;
  bullets.add(bx);
}

function endGame(scene, won) {
  scene.add.rectangle(scene.cameras.main.midPoint.x, scene.cameras.main.midPoint.y, 400, 200, 0x000000, 0.7).setScrollFactor(0);
  scene.add.text(scene.cameras.main.midPoint.x-70, scene.cameras.main.midPoint.y-10, won ? 'YOU WIN' : 'YOU LOSE', { fontSize:'36px', fill:'#fff' }).setScrollFactor(0);
  scene.scene.pause();
}

function setupJoystick(scene) {
  const joy = document.getElementById('joy');
  joy.addEventListener('touchstart', (e)=> {
    joystick.active = true;
    handleJoyMove(e.touches[0], joy);
  });
  joy.addEventListener('touchmove', (e)=> {
    handleJoyMove(e.touches[0], joy);
  });
  joy.addEventListener('touchend', (e)=> {
    joystick.active = false; joystick.x = 0; joystick.y = 0;
  });

  joy.addEventListener('mousedown', (e)=> {
    joystick.active = true; handleJoyMove(e, joy);
  });
  window.addEventListener('mousemove', (e)=> { if (joystick.active) handleJoyMove(e, joy); });
  window.addEventListener('mouseup', (e)=> { joystick.active = false; joystick.x=0; joystick.y=0; });
}

function handleJoyMove(ev, joy) {
  const rect = joy.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  const dx = ev.clientX - cx;
  const dy = ev.clientY - cy;
  const max = rect.width/2;
  let nx = Math.max(-1, Math.min(1, dx / max));
  let ny = Math.max(-1, Math.min(1, dy / max));
  joystick.x = nx;
  joystick.y = ny;
      }
