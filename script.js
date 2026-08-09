(function(){
  const game = document.getElementById('game');
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d', { alpha:true });
  const character = document.getElementById('character');
  const scoreVal = document.getElementById('scoreVal');
  const comboEl = document.getElementById('combo');
  const hullEl = document.getElementById('hull');
  const levelTag = document.getElementById('levelTag');
  const startScreen = document.getElementById('startScreen');
  const overScreen = document.getElementById('overScreen');
  const pauseScreen = document.getElementById('pauseScreen');
  const finalScore = document.getElementById('finalScore');
  const highScoreEl = document.getElementById('highScore');
  const bestComboEl = document.getElementById('bestCombo');
  const hint = document.getElementById('hint');
  const pauseBtn = document.getElementById('pauseBtn');
  const soundBtn = document.getElementById('soundBtn');
  const powerBar = document.getElementById('powerBar');
  const powerIcon = document.getElementById('powerIcon');
  const powerName = document.getElementById('powerName');
  const powerFillInner = document.getElementById('powerFillInner');

  let W = window.innerWidth, H = window.innerHeight;
  let DPR = Math.min(2, window.devicePixelRatio || 1);

  function resize(){
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    initStars();
  }
  window.addEventListener('resize', resize);

  // ---------- Sound ----------
  let audioCtx = null;
  let soundOn = true;
  function ensureAudio(){ if(!audioCtx){ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } }
  function beep(freq, dur, type, gainVal, delay){
    if(!soundOn) return;
    try{
      ensureAudio();
      const t0 = audioCtx.currentTime + (delay||0);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(gainVal||0.12, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0+dur);
    }catch(e){}
  }
  function sfxCatch(combo){ beep(520 + Math.min(combo,10)*30, 0.12, 'triangle', 0.1); }
  function sfxHit(){ beep(140, 0.25, 'sawtooth', 0.14); beep(90,0.3,'square',0.08,0.05); }
  function sfxPower(){ beep(660,0.09,'sine',0.1); beep(880,0.09,'sine',0.1,0.09); beep(1100,0.12,'sine',0.1,0.18); }
  function sfxOver(){ beep(300,0.2,'sawtooth',0.12); beep(220,0.25,'sawtooth',0.12,0.15); beep(140,0.35,'sawtooth',0.12,0.32); }

  soundBtn.addEventListener('click', ()=>{
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    if(soundOn){ ensureAudio(); }
  });

  function vibrate(ms){ if(navigator.vibrate){ try{ navigator.vibrate(ms); }catch(e){} } }

  // ---------- Starfield (drawn on canvas, cheap) ----------
  let stars = [];
  function initStars(){
    stars = [];
    const count = Math.floor((W*H)/13000);
    for(let i=0;i<count;i++){
      stars.push({
        x: Math.random()*W,
        y: Math.random()*H,
        r: Math.random()*1.5+0.3,
        speed: Math.random()*0.4+0.1,
        tw: Math.random()*Math.PI*2
      });
    }
  }

  // ---------- Game state ----------
  const GOOD = [{e:'💎',pts:10,c:'#33FFE0'},{e:'🔷',pts:10,c:'#33FFE0'},{e:'🪙',pts:8,c:'#FFD9A0'},{e:'⚡',pts:14,c:'#FFEA70'},{e:'🌟',pts:20,c:'#FF9F1C'}];
  const BAD = ['☄️','💣','👾','🛸'];
  const POWER = [{e:'🛡️',type:'shield'},{e:'🧲',type:'magnet'}];

  let charX = 0, targetX = 0;
  let score = 0, highScore = 0;
  let lives = 3;
  let combo = 0, bestCombo = 0;
  let running = false, paused = false;
  let items = [];
  let particles = [];
  let floatTexts = [];
  let spawnTimer = 0;
  let lastTime = 0;
  let elapsed = 0;
  let rafId = null;
  let speedMultiplier = 1;
  let activePower = null;
  let level = 1;

  function renderHull(){
    hullEl.innerHTML = '';
    for(let i=0;i<3;i++){
      const d = document.createElement('div');
      d.className = 'hp' + (i>=lives ? ' lost':'');
      d.textContent = '🔋';
      hullEl.appendChild(d);
    }
  }

  function setCharVisual(){
    const dx = targetX - charX;
    const tilt = Math.max(-22, Math.min(22, dx*0.25));
    character.style.transform = `translate3d(${charX-38}px,0,0) rotate(${tilt}deg)`;
  }

  function moveTarget(x){ targetX = Math.max(38, Math.min(W-38, x)); }

  let dragging = false;
  game.addEventListener('pointerdown', (e)=>{
    if(!running || paused) return;
    dragging = true;
    moveTarget(e.clientX);
  });
  game.addEventListener('pointermove', (e)=>{
    if(!running || paused) return;
    if(dragging || e.pointerType === 'mouse'){ moveTarget(e.clientX); }
  });
  window.addEventListener('pointerup', ()=>{ dragging = false; });

  const keys = {};
  window.addEventListener('keydown', (e)=>{ keys[e.key]=true; if(e.key===' ') togglePause(); });
  window.addEventListener('keyup', (e)=>{ keys[e.key]=false; });

  function spawnItem(){
    const roll = Math.random();
    let kind, data;
    if(roll < 0.08 && !activePower){
      kind = 'power';
      data = POWER[Math.floor(Math.random()*POWER.length)];
    } else if(roll < 0.08 + 0.25){
      kind = 'bad';
      data = { e: BAD[Math.floor(Math.random()*BAD.length)] };
    } else {
      kind = 'good';
      data = GOOD[Math.floor(Math.random()*GOOD.length)];
    }
    items.push({
      x: 36 + Math.random()*(W-72), y:-40,
      speed: (2.1 + Math.random()*1.6) * speedMultiplier,
      kind, pts: data.pts||0, powerType: data.type, emoji: data.e,
      rot:(Math.random()-0.5)*50, rotSpeed:(Math.random()-0.5)*3
    });
  }

  function spawnParticles(x,y,color,count){
    for(let i=0;i<(count||10);i++){
      const ang = Math.random()*Math.PI*2;
      const dist = 1 + Math.random()*2.5;
      particles.push({
        x, y,
        vx: Math.cos(ang)*dist,
        vy: Math.sin(ang)*dist,
        size: 3+Math.random()*3,
        color,
        life: 1
      });
    }
  }

  function popText(x,y,text,color){
    floatTexts.push({ x, y, text, color, life:1 });
  }

  let shakeX = 0, shakeY = 0, shakeTime = 0;
  function shakeScreen(){ shakeTime = 180; }

  function activatePower(type){
    activePower = { type, timeLeft: 6000, duration:6000 };
    character.classList.toggle('shielded', type==='shield');
    character.classList.toggle('magnet', type==='magnet');
    powerBar.classList.add('show');
    powerIcon.textContent = type==='shield' ? '🛡️' : '🧲';
    powerName.textContent = type==='shield' ? 'سپر فعال' : 'آهنربا فعال';
    sfxPower();
    vibrate(20);
  }

  function clearPower(){
    if(!activePower) return;
    character.classList.remove('shielded','magnet');
    powerBar.classList.remove('show');
    activePower = null;
  }

  function updateCombo(hit){
    if(hit){ combo = 0; }
    else { combo++; bestCombo = Math.max(bestCombo, combo); }
    comboEl.textContent = combo >= 3 ? `کمبو x${Math.min(9, 1+Math.floor(combo/3))}` : '';
  }

  function loseLife(itX, itY){
    if(activePower && activePower.type==='shield'){
      clearPower();
      spawnParticles(itX,itY,'#7C5CFF',14);
      popText(itX,itY,'سپر جذب کرد!','#B9A6FF');
      vibrate(15);
      return;
    }
    lives--;
    renderHull();
    shakeScreen();
    sfxHit();
    vibrate([30,20,30]);
    updateCombo(true);
    spawnParticles(itX,itY,'#FF4757',16);
    if(lives<=0) endGame();
  }

  function gainScore(base, itX, itY){
    updateCombo(false);
    const mult = combo>=3 ? Math.min(9,1+Math.floor(combo/3)) : 1;
    const gained = base*mult;
    score += gained;
    scoreVal.textContent = score;
    spawnParticles(itX,itY,'#33FFE0',9);
    popText(itX,itY,'+'+gained, mult>1 ? '#FF9F1C' : '#33FFE0');
    sfxCatch(combo);
    vibrate(8);
  }

  function endGame(){
    running = false;
    cancelAnimationFrame(rafId);
    sfxOver();
    vibrate([40,30,40,30,60]);
    highScore = Math.max(highScore, score);
    finalScore.textContent = score;
    highScoreEl.textContent = highScore;
    bestComboEl.textContent = bestCombo;
    overScreen.style.display = 'flex';
    items = []; particles = []; floatTexts = [];
    clearPower();
  }

  function togglePause(){
    if(!running) return;
    paused = !paused;
    if(paused){
      pauseScreen.style.display='flex';
      pauseBtn.textContent='▶';
      cancelAnimationFrame(rafId);
    } else {
      resumeGame();
    }
  }
  function resumeGame(){
    paused = false;
    pauseScreen.style.display='none';
    pauseBtn.textContent='⏸';
    lastTime = 0;
    rafId = requestAnimationFrame(tick);
  }
  pauseBtn.addEventListener('click', togglePause);

  const faDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  function toFa(n){ return String(n).split('').map(c=> /[0-9]/.test(c) ? faDigits[+c] : c).join(''); }

  function drawFrame(dt){
    ctx.clearRect(0,0,W,H);

    ctx.save();
    stars.forEach(s=>{
      s.y += s.speed * (dt/16.6) * (0.6 + speedMultiplier*0.5);
      s.tw += 0.03;
      if(s.y > H) s.y = -2;
      const alpha = 0.4 + Math.sin(s.tw)*0.35;
      ctx.beginPath();
      ctx.fillStyle = `rgba(180,220,255,${Math.max(0.15,alpha)})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.restore();

    if(running && !paused){
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font = '38px sans-serif';
      items.forEach(it=>{
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rot*Math.PI/180);
        ctx.fillText(it.emoji, 0, 0);
        ctx.restore();
      });

      for(let i=particles.length-1;i>=0;i--){
        const p = particles[i];
        p.x += p.vx*(dt/16.6); p.y += p.vy*(dt/16.6);
        p.vy += 0.05*(dt/16.6);
        p.life -= dt/450;
        if(p.life<=0){ particles.splice(i,1); continue; }
        ctx.globalAlpha = Math.max(0,p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      ctx.font = '900 16px Orbitron, sans-serif';
      for(let i=floatTexts.length-1;i>=0;i--){
        const t = floatTexts[i];
        t.y -= 0.9*(dt/16.6);
        t.life -= dt/650;
        if(t.life<=0){ floatTexts.splice(i,1); continue; }
        ctx.globalAlpha = Math.max(0,t.life);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  function tick(ts){
    if(!running || paused) return;
    if(!lastTime) lastTime = ts;
    const dt = Math.min(40, ts-lastTime);
    lastTime = ts;
    elapsed += dt;

    speedMultiplier = 1 + Math.min(1.6, elapsed/60000);
    const newLevel = 1 + Math.floor(elapsed/20000);
    if(newLevel !== level){ level = newLevel; levelTag.textContent = 'مرحله ' + toFa(level); }

    if(keys['ArrowLeft']||keys['a']) moveTarget(charX-14);
    if(keys['ArrowRight']||keys['d']) moveTarget(charX+14);

    charX += (targetX-charX)*0.22;
    setCharVisual();

    if(activePower){
      activePower.timeLeft -= dt;
      powerFillInner.style.width = Math.max(0,(activePower.timeLeft/activePower.duration)*100)+'%';
      if(activePower.timeLeft<=0) clearPower();
    }

    spawnTimer += dt;
    const interval = Math.max(340, 950 - elapsed/45);
    if(spawnTimer > interval){ spawnTimer = 0; spawnItem(); }

    const charTop = H - 34 - 76;
    const charBottom = H - 34;

    for(let i=items.length-1;i>=0;i--){
      const it = items[i];
      if(activePower && activePower.type==='magnet' && it.kind==='good'){
        const dx = charX - it.x;
        if(Math.abs(it.y-charTop) < 260 && Math.abs(dx) < 160){
          it.x += dx*0.06;
        }
      }
      it.y += it.speed*(dt/16.6);
      it.rot += it.rotSpeed;

      if(it.y > charTop && it.y < charBottom+20 && Math.abs(it.x-charX) < 44){
        if(it.kind==='bad'){ loseLife(it.x,it.y); }
        else if(it.kind==='power'){ activatePower(it.powerType); spawnParticles(it.x,it.y,'#FF9F1C',12); }
        else { gainScore(it.pts, it.x, it.y); }
        items.splice(i,1);
        continue;
      }
      if(it.y > H+40){ items.splice(i,1); }
    }

    if(shakeTime > 0){
      shakeTime -= dt;
      shakeX = (Math.random()-0.5)*6;
      shakeY = (Math.random()-0.5)*6;
      game.style.transform = `translate(${shakeX}px,${shakeY}px)`;
    } else if(shakeX || shakeY){
      shakeX = 0; shakeY = 0;
      game.style.transform = 'translate(0,0)';
    }

    drawFrame(dt);
    rafId = requestAnimationFrame(tick);
  }

  function startGame(){
    ensureAudio();
    startScreen.style.display='none';
    overScreen.style.display='none';
    pauseScreen.style.display='none';
    score=0; lives=3; combo=0; bestCombo=0; elapsed=0; spawnTimer=0; lastTime=0; level=1;
    speedMultiplier=1;
    charX = W/2; targetX = W/2;
    items = []; particles = []; floatTexts = [];
    clearPower();
    scoreVal.textContent='0';
    comboEl.textContent='';
    levelTag.textContent='مرحله ۱';
    renderHull();
    setCharVisual();
    running = true; paused = false;
    hint.style.opacity='0.9';
    setTimeout(()=>{ hint.style.transition='opacity 1s'; hint.style.opacity='0'; }, 3200);
    rafId = requestAnimationFrame(tick);
  }

  document.getElementById('playBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);
  document.getElementById('resumeBtn').addEventListener('click', resumeGame);
  document.getElementById('restartFromPauseBtn').addEventListener('click', startGame);

  resize();
  renderHull();
  charX = W/2; targetX = W/2;
  setCharVisual();

  let idleRaf = null;
  function idleLoop(){
    drawFrame(16);
    if(!running) idleRaf = requestAnimationFrame(idleLoop);
  }
  idleLoop();
})();
