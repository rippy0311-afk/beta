(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const keys = new Set();
  const defaultBindings = Object.freeze({ left:'ArrowLeft', right:'ArrowRight', jump:'Space', attack:'KeyZ', repair:'KeyE', menu:'Escape' });
  const bindings = { ...defaultBindings };
  const SETTINGS_KEY = 'beta.settings.v1';
  const WORLD_PROGRESS_KEY = 'beta.world-progress.v1';
  const AUTOSAVE_NOTICE_KEY = 'beta.autosave-notice.v1';
  const SLOT_KEYS = ['beta.save.v1.1', 'beta.save.v1.2', 'beta.save.v1.3'];
  // 現在プレイ中のスロット。これと同じスロットは再読み込みできない。
  let activeSaveSlot = null;
  let pendingAutoSave = null;
  const DEFAULT_VOLUME = 70;
  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const validCode = (code) => typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Escape|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Bracket(Left|Right)|Semicolon|Quote|Backquote|Backslash|Comma|Period|Slash|Minus|Equal|Numpad[0-9])$/.test(code);
  function readStored(key) {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }
  function restoreWorldProgress() {
    try {
      const data=readStored(WORLD_PROGRESS_KEY);
      return isRecord(data) && data.version===1 && Number.isInteger(data.clearedCourses) && inRange(data.clearedCourses,0,13) ? data.clearedCourses : 0;
    } catch { return 0; }
  }
  function persistWorldProgress() {
    try { localStorage.setItem(WORLD_PROGRESS_KEY,JSON.stringify({version:1,clearedCourses:world.clearedCourses})); } catch { /* コース進行はこの起動中も維持する。 */ }
  }
  function isFirstAccess() {
    try { if (localStorage.getItem(AUTOSAVE_NOTICE_KEY)) return false; localStorage.setItem(AUTOSAVE_NOTICE_KEY,'shown'); return true; }
    catch { return false; }
  }
  function persistSettings() {
    if (!FEATURES.persistentSettings) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version:1, bindings:{ ...bindings }, volume:Number($('#volumeControl').value) }));
      $('#settingsStatus').textContent = '設定を保存しました。';
    } catch {
      $('#settingsStatus').textContent = '設定を保存できません。この起動中のみ有効です。';
      $('#keyConfigHint').textContent = '変更はこの起動中のみ有効です。設定を保存できません。';
    }
  }
  function restoreSettings() {
    if (!FEATURES.persistentSettings) return;
    try {
      const data = readStored(SETTINGS_KEY);
      if (data === null) return;
      const codes = Object.keys(defaultBindings).map(action => data.bindings?.[action]);
      if (!isRecord(data) || data.version !== 1 || !inRange(data.volume, 0, 100) || !isRecord(data.bindings) ||
          !codes.every(validCode) || new Set(codes).size !== codes.length || codes.slice(0, -1).includes('Escape')) throw new Error('Invalid settings');
      Object.keys(defaultBindings).forEach(action => bindings[action] = data.bindings[action]);
      $('#volumeControl').value = data.volume;
      $('#volumeValue').textContent = `${data.volume}%`;
    } catch {
      $('#settingsStatus').textContent = '保存済み設定を読み込めません。初期設定で開始しました。';
    }
  }
  let bindingAction = null;
  const tuning = { gravity:GAME_CONFIG.gravity, playerSpeed:GAME_CONFIG.playerSpeed, jumpVelocity:GAME_CONFIG.jumpVelocity };
  // 実装を追加するときは abilities に機能名を足すだけで、開発・セーブ画面から扱える土台になる。
  const abilities = FEATURES.abilitySystem ? { airDash:false, doubleJump:false, glide:false } : {};
  const AIR_DASH_MAX_LEVEL = 5;
  const abilityLevels = { airDash: 1 };
  const images = { background: new Image(), terrain: new Image(), orb: new Image(), sprites: new Image(), walk: new Image(), enemy: new Image(), attack: new Image(), pieceSlime: new Image() };
  images.background.src = 'assets/castle-under-construction-background.png';
  images.terrain.src = 'assets/foundation-terrain.png';
  // オーブは基礎足場のシートではなく、専用の結晶が入った素材シートから描画する。
  images.orb.src = 'assets/terrain-assets.png';
  images.sprites.src = 'assets/ren-sprites.png';
  images.walk.src = 'assets/ren-walk-cycle.png';
  images.enemy.src = 'assets/corruption-wisp.png';
  images.attack.src = 'assets/ren-attack-cycle.png';
  images.pieceSlime.src = 'assets/piece-and-half-slime.png';

  const world = { camera: 0, backgroundOffset: 0, started: !FEATURES.titleScreen, completed: 0, complete: 0, messageShown: false, particles: [], menuOpen: false, developerOpen: false, courseSelect: false, clearedCourses: 0, currentCourse: 1, floating: false, stageClear: false, gateHintShown: false, guideSeen: false, repaired: 0, time: 0, checkpointIndex: 0, dialogueOpen: false, toastTimer: null, toastCountdownTimer: null, toastEndsAt: 0, autoSaveTimer: null, combo: 0, comboTimer: 0, stageBanner: 0, stageTipShown: false, stats:{orbs:0,repairs:0,enemies:0,checkpoints:0,jumps:0,dashes:0,attacks:0} };
  const player = { x: 110, y: 450, w: 46, h: 74, vx: 0, vy: 0, grounded: false, facing: 1, walkClock: 0, invulnerable: 0, attack: 0, attackCooldown: 0, airDashAvailable: false, airDash: 0 };
  // 速度を維持しながら渡る、長い浮島スプリント航路。着地点と次の目印を常に画面内に置く。
  const platforms = [
    ['start',0,580,440,60], ['p01',510,530,230,50], ['bridge-a',800,470,190,50], ['p02',1060,540,270,60],
    ['p03',1420,490,220,55], ['p04',1710,420,190,55], ['p05',1980,500,250,60], ['p06',2310,445,210,55],
    ['p07',2590,390,240,60], ['p08',2910,470,205,55], ['p09',3190,530,290,65], ['p10',3560,450,215,55],
    ['p11',3850,360,200,55], ['p12',4130,430,260,60], ['p13',4480,510,230,60], ['p14',4790,450,195,55],
    ['bridge-b',5060,390,240,55], ['p15',5390,470,250,60], ['p16',5720,400,180,55], ['p17',5980,340,245,55],
    ['p18',6310,430,220,60], ['p19',6610,510,275,65], ['p20',6970,440,210,55], ['p21',7260,365,205,55],
    ['p22',7550,445,260,60], ['p23',7900,520,250,65], ['p24',8230,440,220,55], ['goal',8540,365,460,70]
  ].map(([id,x,y,w,h]) => ({id,x,y,w,h,active:!['bridge-a','bridge-b'].includes(id)}));
  const shards = [[585,450],[1490,410],[1795,330],[2355,375],[2670,315],[3630,360],[4210,340],[4860,370],[5500,390],[6110,285],[6820,420],[7420,310],[8030,450],[8680,290]].map(([x,y]) => ({x,y,taken:false}));
  const repairPoints = [
    { x: 705, y: 474, repaired:false, promptShown:false, platformId:'bridge-a', hint:'仮設足場を作る' },
    { x: 4980, y: 430, repaired:false, promptShown:false, platformId:'bridge-b', hint:'風に揺れる連絡橋を完成させる' }
  ];
  // ゴールのゲートは、ステージ内に残ったオーブの数だけレンガが抜けている。
  // 回収済みオーブ1個が、そのまま1個の完成レンガとして組み込まれる。
  const goalGate = { x: 8760, y: 345, w: 128, h: 160 };
  // 現在の長い航路は第1章のSTAGE 1。旗は区間を分けるのでなく、リスタート地点だけを記録する。
  const checkpoints = [
    {x:110, platformId:'start', active:true}, {x:2010,platformId:'p05',active:false}, {x:4510,platformId:'p13',active:false},
    {x:6640,platformId:'p19',active:false}, {x:8260,platformId:'p24',active:false}
  ];
  const courseOneState = { platforms:platforms.map(p=>({...p})), shards:shards.map(s=>({...s})), repairs:repairPoints.map(p=>({...p})), checkpoints:checkpoints.map(p=>({...p})) };
  const courseMarkers = [[540,480],[845,410],[1450,420],[1740,350],[2350,380],[2950,400],[3590,385],[4170,350],[4830,390],[5100,330],[5760,340],[6050,270],[6990,370],[7280,300],[7950,450],[8580,300]];
  const courseOneMarkers = courseMarkers.map(point=>[...point]);
  const courseNames=['はじまりの足場島','雲裂きの工区','宙吊りの回廊','崩れた採掘路','風切りの縦坑','月光の結晶庭','夜渡りの連橋','風化した尖塔','氷雲の足場','熔岩雲の抜け道','落下遺跡の航路','星喰いの外縁','Chapter 1 最終工区'];
  const abilityGuides = [
    { course:3, name:'Astra', color:'#b777ff', ability:'能力の星図を案内する' },
    { course:5, name:'Sol', color:'#ffe15b', ability:'Air Dash を託す' },
    { course:8, name:'Terra', color:'#62df82', ability:'大地の力を調律する' },
    { course:11, name:'Luna', color:'#ff6575', ability:'月影の力を調律する' },
  ];
  function loadCourse(number) {
    world.currentCourse=number; abilities.airDash=number>=5;
    world.stageBanner=FEATURES.stageBanner ? 2.5 : 0;
    if(number===1){ platforms.splice(0,platforms.length,...courseOneState.platforms.map(p=>({...p,defaultActive:p.active}))); shards.splice(0,shards.length,...courseOneState.shards.map(s=>({...s}))); repairPoints.splice(0,repairPoints.length,...courseOneState.repairs.map(p=>({...p}))); checkpoints.splice(0,checkpoints.length,...courseOneState.checkpoints.map(p=>({...p}))); enemies.splice(0,enemies.length,...courseOneEnemies.map(enemy=>({...enemy}))); courseMarkers.splice(0,courseMarkers.length,...courseOneMarkers.map(point=>[...point])); goalGate.x=8760; goalGate.y=345; return; }
    const layout=stageLayouts[number];
    platforms.splice(0,platforms.length,...layout.terrain.map(([id,x,y,w,h,active=true])=>({id,x,y,w,h,active,defaultActive:active})));
    shards.splice(0,shards.length,...layout.orbs.map(([x,y])=>({x,y,taken:false})));
    repairPoints.splice(0,repairPoints.length,...layout.repairs.map(([x,y,platformId,hint])=>({x,y,repaired:false,promptShown:false,platformId,hint})));
    checkpoints.splice(0,checkpoints.length,...layout.checkpoints.map(([x,platformId],index)=>({x,platformId,active:index===0})));
    enemies.splice(0,enemies.length,...layout.enemies.map(([x,y,min,max,speed,dir])=>({x,y,min,max,speed,dir,w:56,h:54,phase:Math.random()*6,alive:true,type:'half-slime'})));
    courseMarkers.splice(0,courseMarkers.length,...layout.markers.map(([x,y])=>[x,y]));
    goalGate.x=layout.goal[0]; goalGate.y=layout.goal[1];
  }
  function currentGuide() { return abilityGuides.find(guide=>guide.course===world.currentCourse); }
  // 敵と歩行は Beta の常設ゲームシステム。FEATURES には置かない。
  const enemies = [
    { x: 1080, y: 455, min: 1060, max: 1260, speed: 55, dir: 1, w: 56, h: 54, phase: 0, alive: true, type:'half-slime' },
    { x: 2040, y: 445, min: 1990, max: 2190, speed: 72, dir: -1, w: 56, h: 54, phase: 1.5, alive: true, type:'half-slime' },
    { x: 3260, y: 455, min: 3200, max: 3420, speed: 68, dir: 1, w:56,h:54,phase:3,alive:true,type:'half-slime' },
    { x: 5490, y: 415, min:5400,max:5590,speed:80,dir:-1,w:56,h:54,phase:4,alive:true,type:'half-slime' },
    { x: 7640, y: 390, min:7560,max:7780,speed:86,dir:1,w:56,h:54,phase:5,alive:true,type:'half-slime' },
  ];
  const courseOneEnemies=enemies.map(enemy=>({...enemy}));
  const stageLayouts=window.BETA_STAGE_LAYOUTS;
  // Each slot is independent: a damaged or newer slot must not prevent other slots loading.
  function validSave(data) {
    const flags = (value, length) => Array.isArray(value) && value.length === length && value.every(x => typeof x === 'boolean');
    return isRecord(data) && data.version === 1 && data.stage === 1 &&
      inRange(data.savedAt, 0, 8640000000000000) && isRecord(data.player) &&
      inRange(data.player.x, 0, 12000-player.w) && inRange(data.player.y, -1000, 700) &&
      [1,-1].includes(data.player.facing) && inRange(data.time, 0, 1e9) && inRange(data.complete, 0, 100) &&
      (data.course === undefined || Number.isInteger(data.course) && inRange(data.course, 1, 13)) &&
      (data.clearedCourses === undefined || Number.isInteger(data.clearedCourses) && inRange(data.clearedCourses, 0, 13)) &&
      Number.isInteger(data.checkpointIndex) && inRange(data.checkpointIndex, 0, 4) &&
      flags(data.shards, 14) && Array.isArray(data.repairs) && data.repairs.every(x => typeof x === 'boolean') && flags(data.enemies, enemies.length) &&
      isRecord(data.abilities) && ['dash','doubleJump','glide'].every(key => data.abilities[key] === undefined || typeof data.abilities[key] === 'boolean') &&
      (data.abilityLevels === undefined || isRecord(data.abilityLevels) && Number.isInteger(data.abilityLevels.airDash) && inRange(data.abilityLevels.airDash,1,AIR_DASH_MAX_LEVEL)) &&
      (data.stats === undefined || isRecord(data.stats) && Object.values(data.stats).every(value=>Number.isInteger(value) && inRange(value,0,100000)));
  }
  function snapshot() {
    return { version:1, stage:1, savedAt:Date.now(), player:{ x:player.x, y:player.y, facing:player.facing },
      time:world.time, complete:world.complete, course:world.currentCourse, clearedCourses:world.clearedCourses, checkpointIndex:world.checkpointIndex,
      shards:shards.map(s=>s.taken), repairs:repairPoints.map(p=>p.repaired), enemies:enemies.map(e=>e.alive), abilities:{ ...abilities }, abilityLevels:{ ...abilityLevels }, stats:{...world.stats} };
  }
  function loadSave(data, slotIndex=null, { pause=false }={}) {
    // Validate the entire record before mutating gameplay, and discard transient input/animation state.
    if (!validSave(data)) throw new Error('Invalid save');
    loadCourse(data.course ?? 1); resetGame(); keys.clear(); bindingAction=null; renderBindings();
    world.started=true; $('#startScreen').hidden=true;
    world.developerOpen=false; $('#developerPanel').hidden=true;
    Object.assign(player, data.player, { grounded:false, walkClock:0, invulnerable:1.1 });
    world.time=data.time; world.complete=data.complete;
    world.checkpointIndex=FEATURES.checkpoint ? data.checkpointIndex : 0;
    checkpoints.forEach((point,index)=>point.active=index<=world.checkpointIndex);
    shards.forEach((shard,index)=>shard.taken=FEATURES.collectibles && data.shards[index]);
    repairPoints.forEach((point,index)=> {
      point.repaired=FEATURES.worldRestoration && data.repairs[index];
      platforms.find(p=>p.id===point.platformId).active=point.repaired;
    });
    enemies.forEach((enemy,index)=>enemy.alive=data.enemies[index]);
    Object.keys(abilities).forEach(key=>abilities[key]=data.abilities[key] === true);
    abilityLevels.airDash=Math.max(1,Math.min(AIR_DASH_MAX_LEVEL,data.abilityLevels?.airDash ?? 1));
    if (data.stats) world.stats={...world.stats,...data.stats};
    world.clearedCourses=data.clearedCourses ?? 0; world.completed=shards.filter(s=>s.taken).length; world.repaired=repairPoints.filter(p=>p.repaired).length;
    world.camera=Math.max(0,player.x-260); world.backgroundOffset=Math.min(380,player.x*.04);
    $('#completeBar').style.width=`${world.complete}%`; updateHud();
    $('#runTimer').textContent=`${Math.floor(world.time/60).toString().padStart(2,'0')}:${(world.time%60).toFixed(2).padStart(5,'0')}`;
    activeSaveSlot=slotIndex;
    if (pause) closeDialogue();
    else showToast(`セーブデータを自動で読み込みました。STAGE ${world.currentCourse} のチェックポイント ${world.checkpointIndex+1} から再開します。`);
    setMenu(pause);
    renderSlots();
  }
  function renderSlots() {
    if (!FEATURES.saveData) return;
    $('#saveSlots').replaceChildren();
    SLOT_KEYS.forEach((key,index)=> {
      let data=null, damaged=false;
      try { data=readStored(key); damaged=data !== null && !validSave(data); }
      catch { damaged=true; }
      const row=document.createElement('div'); row.className='save-slot';
      const label=document.createElement('p');
      label.textContent=`SLOT ${index+1} — ${damaged ? '読み込めません（削除または上書き可能）' : data ? `${new Date(data.savedAt).toLocaleString()} · CP ${data.checkpointIndex+1} · ◇ ${data.shards.filter(Boolean).length}/${shards.length}` : '空きスロット'}`;
      row.append(label);
      for (const [action,title] of [['save','保存'],['load','読込'],['delete','削除']]) {
        const button=document.createElement('button'); button.textContent=title; button.dataset.slot=index+1; button.dataset.saveAction=action;
        button.setAttribute('aria-label',`スロット${index+1}を${title}`);
        button.disabled=action==='load' ? !data || damaged || activeSaveSlot===index : action==='delete' && !data && !damaged;
        button.onclick=()=> {
          if (!FEATURES.saveData) return;
          try {
            if (action==='save') {
              if ((data || damaged) && !confirm(`スロット${index+1}を上書きしますか？`)) return;
              const next=snapshot();
              if (!validSave(next)) throw new Error('Unsafe position');
              localStorage.setItem(key,JSON.stringify(next));
              activeSaveSlot=index;
            } else if (action==='load') {
              const current=readStored(key);
              if (!validSave(current)) throw new Error('Invalid save');
              if (!confirm('現在の進行を保存データに置き換えますか？')) return;
              loadSave(current,index,{ pause:true });
            } else {
              if (!confirm(`スロット${index+1}を削除しますか？`)) return;
              localStorage.removeItem(key);
            }
            renderSlots(); $('#saveStatus').textContent=`スロット${index+1}を${title}しました。`;
          } catch { $('#saveStatus').textContent='操作できませんでした。保存領域・保存データを確認してください。現在の冒険は続けられます。'; }
        };
        row.append(button);
      }
      $('#saveSlots').append(row);
    });
  }
  $('#saveTab').hidden=!FEATURES.saveData;
  renderSlots();

  function enabled(element, on) { element.hidden = !on; }
  enabled($('#hud'), FEATURES.hud); enabled($('#dialogue'), FEATURES.dialogue); enabled($('#mobileControls'), FEATURES.mobileControls); enabled($('#developerPanel'), FEATURES.developerTools);
  function showDialogue(text) {
    if (!FEATURES.dialogue) return;
    clearTimeout(world.toastTimer);
    clearInterval(world.toastCountdownTimer);
    keys.clear();
    world.dialogueOpen=true;
    $('#dialogueText').textContent=text;
    $('#dialogue').hidden=false;
    $('#dialogue').classList.remove('is-toast');
    $('#closeDialogue').hidden=false;
    $('#toastCountdown').hidden=true;
    $('.game-frame').classList.add('is-dialogue');
    $('#closeDialogue').focus();
  }
  function showToast(text, duration=3000) {
    if (!FEATURES.dialogue) return;
    clearTimeout(world.toastTimer);
    clearInterval(world.toastCountdownTimer);
    // 通常の案内はプレイを止めず、既存のテキストボックスだけを短時間表示する。
    world.dialogueOpen=false;
    $('#dialogueText').textContent=text;
    $('#dialogue').classList.add('is-toast');
    $('#closeDialogue').hidden=true;
    $('#toastCountdown').hidden=false;
    $('#dialogue').hidden=false;
    $('.game-frame').classList.remove('is-dialogue');
    world.toastEndsAt=performance.now()+duration;
    const updateToastCountdown=() => $('#toastCountdown').textContent=`あと ${Math.max(0,(world.toastEndsAt-performance.now())/1000).toFixed(1)}秒`;
    updateToastCountdown();
    world.toastCountdownTimer=setInterval(updateToastCountdown,100);
    world.toastTimer=setTimeout(closeDialogue,duration);
  }
  function closeDialogue() {
    clearTimeout(world.toastTimer);
    clearInterval(world.toastCountdownTimer);
    world.toastTimer=null;
    world.toastCountdownTimer=null;
    world.dialogueOpen=false;
    $('#dialogue').hidden=true;
    $('#dialogue').classList.remove('is-toast');
    $('#closeDialogue').hidden=false;
    $('#toastCountdown').hidden=true;
    $('.game-frame').classList.remove('is-dialogue');
  }
  function showAutoSaveIndicator() {
    clearTimeout(world.autoSaveTimer);
    $('#autosaveIndicator').hidden=false;
    world.autoSaveTimer=setTimeout(() => $('#autosaveIndicator').hidden=true,1400);
  }
  closeDialogue();
  $('#closeDialogue').onclick = closeDialogue;
  $('#startButton').onclick = () => { world.started = true; $('#startScreen').hidden = true; showDialogue(GAME_CONFIG.initialDialogue); };
  function setMenu(open) { if (!world.started || (open && world.stageClear)) return; world.menuOpen = open; $('#pauseMenu').hidden = !open; if (open) $('#resumeGame').focus(); }
  function syncDevOrbControl() {
    if (!FEATURES.developerTools) return;
    $('#devOrbs').max=shards.length;
    $('#devOrbs').value=world.completed;
  }
  function setDeveloper(open) { if (!FEATURES.developerTools) return; world.developerOpen=open; $('#developerPanel').hidden=!open; if(open) { $('#devX').value=Math.round(player.x); $('#devY').value=Math.round(player.y); $('#devAirDash').value=abilityLevels.airDash; syncDevOrbControl(); $('#devSpeed').focus(); } }
  function renderCourseMap() {
    document.querySelectorAll('.course-route path').forEach((path) => path.classList.toggle('is-visible',Number(path.dataset.step)<=world.clearedCourses));
    document.querySelectorAll('.course-node').forEach((node) => {
      const course=Number(node.dataset.course); const cleared=course<=world.clearedCourses; const available=course===world.clearedCourses+1;
      node.classList.toggle('cleared',cleared); node.classList.toggle('available',available); node.classList.toggle('locked',!cleared&&!available); node.disabled=!cleared&&!available;
    });
  }
  function showCourseSelect(message='次の行き先を選んでください。') { setDeveloper(false); world.courseSelect=true; world.menuOpen=false; $('#pauseMenu').hidden=true; closeDialogue(); $('#courseSelect').hidden=false; renderCourseMap(); $('#courseMessage').textContent=message; }
  function openCourseSelect() { world.clearedCourses=Math.max(world.clearedCourses,world.currentCourse); persistWorldProgress(); showCourseSelect(world.currentCourse===13?'CHAPTER 1 COMPLETE！ アルケアの航路がひとつ完成した。':'次の行き先を選んでください。'); }
  function closeCourseSelect() { world.courseSelect=false; $('#courseSelect').hidden=true; }
  function resetGame() { world.camera=0; world.backgroundOffset=0; world.time=0; world.checkpointIndex=0; world.completed=0; world.complete=0; world.repaired=0; world.combo=0; world.comboTimer=0; world.stats={orbs:0,repairs:0,enemies:0,checkpoints:0,jumps:0,dashes:0,attacks:0}; world.stageTipShown=false; world.messageShown=false; world.gateHintShown=false; world.guideSeen=false; world.particles=[]; world.stageClear=false; world.courseSelect=false; world.floating=false; $('#devFloat').textContent='浮遊：OFF'; $('#stageClear').hidden=true; $('#courseSelect').hidden=true; const start=checkpoints[0],startPlatform=platforms.find(p=>p.id===start.platformId); player.x=start.x; player.y=(startPlatform?.y||520)-20-player.h; player.vx=0; player.vy=0; player.attack=0; player.attackCooldown=0; player.airDash=0; player.airDashAvailable=abilities.airDash; player.invulnerable=0; shards.forEach(s=>s.taken=false); repairPoints.forEach(p=>{p.repaired=false;p.promptShown=false;}); platforms.forEach(p=>p.active=p.defaultActive ?? !['bridge-a','bridge-b'].includes(p.id)); checkpoints.forEach((p,i)=>p.active=i===0); enemies.forEach(e=>e.alive=true); $('#completeBar').style.width='0%'; updateHud(); $('#runTimer').textContent='00:00.00'; setMenu(false); showDialogue(abilities.airDash?'ピース「Air Dashが使えるよ！ 空中で X を押して、向いている方向へ飛ぼう。」':GAME_CONFIG.initialDialogue); }
  $('#resumeGame').onclick = () => setMenu(false); $('#restartGame').onclick = resetGame;
  $('#exitStage').onclick = () => {
    // 退出は現在のステージ用オートセーブだけを削除し、解放済みコースの記録は残す。
    try { if (activeSaveSlot !== null) localStorage.removeItem(SLOT_KEYS[activeSaveSlot]); } catch { /* ストレージ不可でもメモリ上の進行は破棄する。 */ }
    if (pendingAutoSave?.index === activeSaveSlot) pendingAutoSave=null;
    activeSaveSlot=null; resetGame(); closeDialogue(); world.started=false;
    renderSlots(); showCourseSelect('ステージの途中進行を破棄しました。次の行き先を選んでください。');
  };
  $('#retryStage').onclick = resetGame;
  $('#resultCourseSelect').onclick = () => { $('#stageClear').hidden=true; openCourseSelect(); };
  $('#returnToTitle').onclick = () => { resetGame(); world.started=false; closeDialogue(); showCourseSelect(); };
  $('#courseToTitle').onclick = () => { closeCourseSelect(); resetGame(); world.started=false; closeDialogue(); showCourseSelect(); };
  document.querySelectorAll('.course-node').forEach((node) => node.onclick = () => {
    const course=Number(node.dataset.course);
    if (course > world.clearedCourses + 1) return;
    if (pendingAutoSave?.data.course === course) {
      const saved=pendingAutoSave; pendingAutoSave=null; closeCourseSelect(); loadSave(saved.data,saved.index,{ pause:false }); return;
    }
    activeSaveSlot=null; closeCourseSelect(); loadCourse(course); resetGame(); world.started=true; $('#startScreen').hidden=true;
  });
  document.querySelectorAll('.menu-tab').forEach((tab) => tab.onclick = () => { document.querySelectorAll('.menu-tab').forEach(x=>x.classList.toggle('is-active',x===tab)); document.querySelectorAll('.menu-panel').forEach(x=>x.classList.toggle('is-active',x.dataset.content===tab.dataset.panel)); });
  restoreSettings();
  $('#volumeControl').oninput = (e) => { $('#volumeValue').textContent = `${e.target.value}%`; persistSettings(); };
  const keyLabel = (code) => ({ ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓', Space:'Space', Escape:'Esc', Enter:'Enter', ShiftLeft:'Shift', ShiftRight:'Shift', ControlLeft:'Ctrl', ControlRight:'Ctrl', AltLeft:'Alt', AltRight:'Alt' }[code] || code.replace(/^Key/, '').replace(/^Digit/, ''));
  function renderBindings() { document.querySelectorAll('.key-bind').forEach((button) => { button.textContent=keyLabel(bindings[button.dataset.action]); button.classList.toggle('is-listening',button.dataset.action===bindingAction); }); $('.pause-window header span').textContent=`${keyLabel(bindings.menu)}で戻る`; }
  function beginBinding(action) { bindingAction=action; keys.clear(); $('#keyConfigHint').textContent=`「${document.querySelector(`[data-action="${action}"]`).parentElement.firstElementChild.textContent}」に割り当てるキーを押してください。Escでキャンセル`; renderBindings(); }
  document.querySelectorAll('.key-bind').forEach((button) => button.onclick = () => beginBinding(button.dataset.action));
  $('#resetKeys').onclick = () => { Object.assign(bindings,defaultBindings); bindingAction=null; keys.clear(); $('#keyConfigHint').textContent='初期キーに戻しました。'; renderBindings(); persistSettings(); };
  $('#resetSettings').onclick = () => {
    Object.assign(bindings, defaultBindings); bindingAction=null; keys.clear(); renderBindings();
    $('#volumeControl').value=DEFAULT_VOLUME; $('#volumeValue').textContent=`${DEFAULT_VOLUME}%`;
    $('#keyConfigHint').textContent='初期キーに戻しました。';
    $('#settingsStatus').textContent='初期設定に戻しました。';
    if (FEATURES.persistentSettings) {
      try { localStorage.removeItem(SETTINGS_KEY); }
      catch { $('#settingsStatus').textContent='保存済み設定を削除できません。この起動中のみ初期設定になります。'; }
    }
  };
  renderBindings();
  if (FEATURES.developerTools) {
    $('#devSpeed').value=tuning.playerSpeed; $('#devJump').value=tuning.jumpVelocity; $('#devGravity').value=tuning.gravity;
    checkpoints.forEach((point,index) => { const option=document.createElement('option'); option.value=index; option.textContent=`CP ${index + 1}　x:${point.x}`; $('#devCheckpoint').append(option); });
    $('#devSpeed').oninput=(e) => tuning.playerSpeed=Math.max(40,Number(e.target.value)||GAME_CONFIG.playerSpeed);
    $('#devJump').oninput=(e) => tuning.jumpVelocity=Math.max(100,Number(e.target.value)||GAME_CONFIG.jumpVelocity);
    $('#devGravity').oninput=(e) => tuning.gravity=Math.max(0,Number(e.target.value)||GAME_CONFIG.gravity);
    $('#devTeleport').onclick=() => { player.x=Number($('#devX').value)||0; player.y=Number($('#devY').value)||0; player.vx=0; player.vy=0; };
    $('#devCheckpointMove').onclick=() => { world.checkpointIndex=Number($('#devCheckpoint').value); respawn(); };
    $('#devSetOrbs').onclick=() => {
      const total=shards.length;
      const count=Math.max(0,Math.min(total,Math.floor(Number($('#devOrbs').value)||0)));
      // 所持数は回収済みフラグから導く。開発操作でもゲート・HUD・セーブで矛盾しない。
      shards.forEach((shard,index)=>shard.taken=index<count);
      world.completed=count;
      world.complete=Math.round(count/total*100);
      $('#completeBar').style.width=`${world.complete}%`;
      updateHud(); syncDevOrbControl();
    };
    $('#devAirDash').oninput=(event) => { abilityLevels.airDash=Math.max(1,Math.min(AIR_DASH_MAX_LEVEL,Math.floor(Number(event.target.value)||1))); event.target.value=abilityLevels.airDash; };
    $('#devFloat').onclick=() => { world.floating=!world.floating; player.vy=0; $('#devFloat').textContent=`浮遊：${world.floating?'ON':'OFF'}`; };
    $('#closeDeveloper').onclick=() => setDeveloper(false);
  }
  if (!FEATURES.titleScreen) $('#startScreen').hidden = true;
  addEventListener('keydown', (e) => {
    if (bindingAction) {
      e.preventDefault();
      if (e.code === 'Escape') { bindingAction=null; $('#keyConfigHint').textContent='変更をキャンセルしました。'; renderBindings(); return; }
      if (!validCode(e.code)) { $('#keyConfigHint').textContent='このキーは割り当てできません。別のキーを選んでください。'; return; }
      const duplicate=Object.entries(bindings).find(([action,code]) => action!==bindingAction && code===e.code);
      if (duplicate) { $('#keyConfigHint').textContent=`${keyLabel(e.code)} はすでに「${document.querySelector(`[data-action="${duplicate[0]}"]`).parentElement.firstElementChild.textContent}」に使われています。`; return; }
      bindings[bindingAction]=e.code; bindingAction=null; $('#keyConfigHint').textContent='キーを変更しました。'; renderBindings(); persistSettings(); return;
    }
    // 会話はゲーム入力より優先する。閉じるまで操作・メニュー・開発パネルは反応しない。
    if (world.dialogueOpen) {
      if (e.code === 'Escape' || e.code === 'Space') {
        e.preventDefault(); closeDialogue();
      }
      return;
    }
    if (e.code === 'F2' && FEATURES.developerTools) { e.preventDefault(); setDeveloper(!world.developerOpen); return; }
    if (Object.values(bindings).includes(e.code)) e.preventDefault();
    if (e.code === bindings.menu) { setMenu(!world.menuOpen); return; }
    keys.add(e.code); if (e.code === bindings.jump && !world.started) $('#startButton').click();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  document.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key; button.addEventListener('pointerdown', () => keys.add(key)); button.addEventListener('pointerup', () => keys.delete(key)); button.addEventListener('pointerleave', () => keys.delete(key));
  });

  function input(name) { return keys.has(bindings[name]) || keys.has(name); }
  function rect(a,b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
  function addComplete(value) { world.complete=Math.min(100,world.complete+value); $('#completeBar').style.width=`${world.complete}%`; }
  function collect(shard) { shard.taken = true; world.completed++; world.stats.orbs++; addComplete(10); if (FEATURES.particles) for (let i=0;i<16;i++) world.particles.push({x:shard.x,y:shard.y,vx:(Math.random()-.5)*240,vy:(Math.random()-.8)*250,life:1}); updateHud(); }
  function saveCheckpoint() {
    if (!FEATURES.autoSave || !FEATURES.saveData) return;
    const slotIndex=activeSaveSlot ?? 0;
    const data=snapshot();
    if (!validSave(data)) return;
    try { localStorage.setItem(SLOT_KEYS[slotIndex],JSON.stringify(data)); activeSaveSlot=slotIndex; renderSlots(); showAutoSaveIndicator(); }
    catch { /* ゲーム進行は止めず、セーブ画面で状態を確認できるようにする。 */ }
  }
  function repair() { const point=repairPoints.find(p=>!p.repaired && Math.abs((player.x+player.w/2)-p.x)<80 && Math.abs((player.y+player.h)-p.y)<100); if(!point)return; const firstRepair=world.currentCourse===1 && world.repaired===0; point.repaired=true; world.repaired++; world.stats.repairs++; const bridge=platforms.find(p=>p.id===point.platformId); if(bridge)bridge.active=true; addComplete(24); for(let i=0;i<26;i++)world.particles.push({x:point.x,y:point.y,vx:(Math.random()-.5)*300,vy:(Math.random()-.9)*330,life:.85,color:'#f7f6b2'}); showToast(world.currentCourse===1 ? (firstRepair?'ピース「うわー！直った！よかった～」':'ピース「これも直った！よかった。」') : `ピース「${point.hint}を直したよ。」`); updateHud(); }
  function respawn() { const point=checkpoints[world.checkpointIndex]; const platform=platforms.find(p=>p.id===point.platformId); player.x=point.x; player.y=platform ? platform.y-20-player.h : 430; player.vx=0; player.vy=0; player.invulnerable=1.1; }
  function strike() {
    player.attack = .34; player.attackCooldown = .40; world.stats.attacks++;
    if (!player.grounded) {
      // 空中攻撃は右図のような浅い弧を描く：小さく上昇してから慣性と重力で前方へ落下する。
      player.vy = Math.min(player.vy, -180);
      player.vx += player.facing * 70;
    }
    const hitbox = { x: player.facing > 0 ? player.x + player.w - 3 : player.x - 96, y: player.y + 10, w: 98, h: 54 };
    for (const enemy of enemies) if (enemy.alive && rect(hitbox, enemy)) {
      enemy.alive = false; world.stats.enemies++; addComplete(8);
      if (FEATURES.comboMeter) { world.combo++; world.comboTimer=2.6; }
      if (FEATURES.particles) for (let i=0;i<22;i++) world.particles.push({x:enemy.x+28,y:enemy.y+25,vx:(Math.random()-.5)*330,vy:(Math.random()-.7)*310,life:.65,color:'#f04dff'});
    }
  }
  function updateHud() { const percent = Math.min(100, Math.round((world.completed * 12 + world.repaired * 26 + enemies.filter(e=>!e.alive).length * 4))); $('#completionValue').textContent = `${percent}%`; $('#completionBar').style.width = `${percent}%`; $('#shardCount').textContent = '◇'.repeat(Math.min(5,world.completed)) + '◆'.repeat(Math.max(0,5-world.completed)); $('#segmentLabel').textContent=`STAGE ${world.currentCourse} / 13　${courseNames[world.currentCourse-1]}`; }
  function finishStage() { if (world.stageClear) return; world.stageClear=true; player.vx=0; player.vy=0; $('#clearStage').textContent=`ACT I ・ STAGE ${world.currentCourse} / 13`; $('#clearTime').textContent=$('#runTimer').textContent; $('#clearShards').textContent=`${world.stats.orbs} / ${shards.length}`; $('#clearRepairs').textContent=`${world.stats.repairs} / ${repairPoints.length}`; $('#clearEnemies').textContent=world.stats.enemies; $('#clearCheckpoints').textContent=world.stats.checkpoints; $('#clearJumps').textContent=world.stats.jumps; $('#clearDashes').textContent=world.stats.dashes; $('#clearAttacks').textContent=world.stats.attacks; $('#clearMessage').textContent=`${courseNames[world.currentCourse-1]}を完成させた。次の浮島が、雲の向こうで待っている。`; closeDialogue(); $('#stageClear').hidden=false; $('#resultCourseSelect').focus(); }
  let last = performance.now();
  function step(now) {
    const dt = Math.min(.033, (now-last)/1000); last=now;
    if (world.started && !world.menuOpen && !world.developerOpen && !world.courseSelect && !world.stageClear && !world.dialogueOpen) update(dt); draw(); requestAnimationFrame(step);
  }
  function update(dt) {
    // 空中攻撃だけは、開始時の慣性と重力に従って放物線を描く。
    // 地上攻撃中は通常どおり移動入力を受け付ける。
    const wasAirborne=!player.grounded;
    const airAttacking = player.attack > 0 && !player.grounded;
    const airDashing = player.airDash > 0;
    const dir = (input('right')?1:0)-(input('left')?1:0);
    if (world.floating) {
      const vertical=(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0);
      player.vx=dir*tuning.playerSpeed; player.vy=vertical*tuning.playerSpeed; player.grounded=false;
      if(dir)player.facing=dir;
    } else if (!airAttacking && !airDashing) {
      player.vx = dir * tuning.playerSpeed;
      if (dir) player.facing = dir;
      if (dir && player.grounded) player.walkClock += dt * 13;
    } else if (airAttacking) {
      // 空中攻撃中は入力を受けず、攻撃開始時の移動速度だけが慣性として緩やかに減衰する。
      player.vx *= Math.pow(0.06, dt);
    }
    if (!world.floating && input('jump') && player.grounded) { player.vy=-tuning.jumpVelocity; player.grounded=false; world.stats.jumps++; keys.delete(bindings.jump); keys.delete('jump'); }
    if (abilities.airDash && !player.grounded && player.airDashAvailable && keys.has('KeyX')) {
      // Lv1=主人公1人分、以後は0.5人分ずつ増加し、Lv5で最大3人分まで届く。
      const distance=player.w*(1+(abilityLevels.airDash-1)*.5);
      player.airDashAvailable=false; player.airDash=.18; player.vx=player.facing*distance/.18; player.vy=-35; world.stats.dashes++;
      keys.delete('KeyX'); if(FEATURES.particles) for(let i=0;i<16;i++)world.particles.push({x:player.x+player.w/2,y:player.y+34,vx:-player.facing*(70+Math.random()*180),vy:(Math.random()-.5)*140,life:.35,color:'#ffe45a'});
    }
    if (input('attack') && player.attackCooldown <= 0) { strike(); keys.delete(bindings.attack); keys.delete('attack'); }
    // 最初の島だけ、未完成の足場に気づく導入会話を表示する。
    const nearbyRepair=world.currentCourse===1 && repairPoints.find(point=>!point.repaired && !point.promptShown && Math.abs((player.x+player.w/2)-point.x)<80 && Math.abs((player.y+player.h)-point.y)<100);
    if (nearbyRepair) {
      nearbyRepair.promptShown=true;
      showToast(world.repaired===0?'ピース「あれ？なんで壊れてるんだろう？」':'ピース「あれ？ここも壊れてる。」');
    }
    if (input('repair')) { repair(); keys.delete(bindings.repair); }
    if (!world.floating) player.vy += tuning.gravity * dt; player.x += player.vx*dt; player.y += player.vy*dt; player.grounded=false;
    for (const p of platforms) { if(!p.active) continue;
      const surfaceY = p.y - 20; // 芝生上面より2px上に置き、主人公が沈んで見えないようにする。
      if (player.vy >= 0 && player.x+player.w > p.x && player.x < p.x+p.w && player.y+player.h >= surfaceY && player.y+player.h-player.vy*dt <= surfaceY+12) {
        const landingSpeed=player.vy; player.y=surfaceY-player.h; player.vy=0; player.grounded=true; player.airDashAvailable=abilities.airDash;
        if (FEATURES.landingDust && wasAirborne && landingSpeed>210) for(let i=0;i<8;i++)world.particles.push({x:player.x+player.w/2,y:surfaceY,vx:(Math.random()-.5)*140,vy:-Math.random()*90,life:.35,color:'#d8f6ff'});
      }
    }
    // 未回収オーブがある限り、ゲートは実体のある壁として行く手を止める。
    if (world.completed < shards.length && player.x + player.w > goalGate.x && player.x < goalGate.x + goalGate.w && player.y + player.h > goalGate.y - goalGate.h && player.y < goalGate.y) {
      player.x = goalGate.x - player.w; player.vx = 0;
      if (!world.gateHintShown) { world.gateHintShown=true; showToast(`ピース「あと ${shards.length-world.completed} 個のオーブが必要だよ。集めたオーブがゲートのレンガになるんだ。」`); }
    }
    if (player.y>750) respawn();
    player.invulnerable = Math.max(0, player.invulnerable-dt);
    player.attack = Math.max(0, player.attack-dt); player.airDash = Math.max(0,player.airDash-dt); player.attackCooldown = Math.max(0, player.attackCooldown-dt);
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.x += enemy.speed * enemy.dir * dt;
      if (enemy.x < enemy.min || enemy.x > enemy.max) { enemy.dir *= -1; enemy.x = Math.max(enemy.min, Math.min(enemy.max, enemy.x)); }
      // 敵も主人公と同じ重力と足場上面を使う。足場の高さが変わるコースでも沈んだり浮いたりしない。
      enemy.vy=(enemy.vy||0)+tuning.gravity*dt; enemy.y+=enemy.vy*dt;
      for(const p of platforms) { const surfaceY=p.y-20; if(enemy.vy>=0 && enemy.x+enemy.w>p.x && enemy.x<p.x+p.w && enemy.y+enemy.h>=surfaceY && enemy.y+enemy.h-enemy.vy*dt<=surfaceY+14) { enemy.y=surfaceY-enemy.h; enemy.vy=0; break; } }
      if(enemy.y>760) { enemy.y=260; enemy.vy=0; }
      if (!player.invulnerable && rect(player, { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h })) respawn();
    }
    if (FEATURES.collectibles) for (const shard of shards) if (!shard.taken) {
      if (FEATURES.orbMagnet) {
        const dx=(player.x+player.w/2)-shard.x, dy=(player.y+player.h/2)-shard.y, distance=Math.hypot(dx,dy);
        if (distance<145 && distance>1) { shard.x+=dx/distance*dt*210; shard.y+=dy/distance*dt*210; }
      }
      if (rect(player,{x:shard.x-20,y:shard.y-20,w:40,h:48})) collect(shard);
    }
    const guide=currentGuide(); const guidePlatform=guide && platforms[Math.max(1,Math.floor(platforms.length*.45))];
    if (guide && guidePlatform && !world.guideSeen && Math.abs(player.x-guidePlatform.x)<120) { world.guideSeen=true; showDialogue(`${guide.name}「${guide.ability}。私たちはピースと同じ、未完成の力から生まれた案内人だよ。」`); }
    for (let i=world.checkpointIndex+1;i<checkpoints.length;i++) {
      const point=checkpoints[i];
      if (player.x >= point.x) { world.checkpointIndex=i; point.active=true; world.stats.checkpoints++; saveCheckpoint(); showToast('ピース「チェックポイント更新！」'); updateHud(); }
    }
    if (world.completed === shards.length && rect(player,{x:goalGate.x+36,y:goalGate.y-96,w:56,h:96})) finishStage();
    if (FEATURES.comboMeter) { world.comboTimer=Math.max(0,world.comboTimer-dt); if(!world.comboTimer)world.combo=0; }
    if (FEATURES.courseTips && !world.stageTipShown && world.time>.12) { world.stageTipShown=true; showToast(world.currentCourse===5?'ピース「この縦坑は Air Dash で切り抜けよう！」':'ピース「青い風標が次の足場への道しるべだよ。」'); }
    world.time += dt; const mins=Math.floor(world.time/60).toString().padStart(2,'0'); const secs=(world.time%60).toFixed(2).padStart(5,'0'); $('#runTimer').textContent=`${mins}:${secs}`;
    world.camera += ((player.x-260)-world.camera) * Math.min(1,dt*4); world.camera=Math.max(0,world.camera);
    // 一枚背景を非ループで使う。走るほどわずかに早く流れるが、前景より遥かに遅い。
    const backgroundRate = 0.022 + Math.min(0.030, Math.abs(player.vx) / tuning.playerSpeed * 0.030);
    world.backgroundOffset = Math.max(0, Math.min(380, world.backgroundOffset + player.vx * backgroundRate * dt));
    world.particles = world.particles.filter((p) => (p.life-=dt)>0); world.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=500*dt;});
  }
  function drawImagePart(img, sx,sy,sw,sh, dx,dy,dw,dh) { ctx.drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh); }
  function draw() {
    ctx.clearRect(0,0,GAME_CONFIG.width,GAME_CONFIG.height);
    ctx.fillStyle='#071126';ctx.fillRect(0,0,GAME_CONFIG.width,GAME_CONFIG.height);
    // 1650pxへ広げた一枚絵を最大380pxだけ移動。繰り返し描画は行わない。
    ctx.drawImage(images.background,-world.backgroundOffset,0,1650,GAME_CONFIG.height);
    if (FEATURES.speedStreaks && Math.abs(player.vx)>tuning.playerSpeed*.72) { ctx.save();ctx.globalAlpha=.28;ctx.strokeStyle='#b8f9ff';ctx.lineWidth=2;for(let i=0;i<10;i++){const y=170+i*38+(i%2)*9;const x=player.facing>0?80+i*65:810-i*65;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-player.facing*(55+i*6),y);ctx.stroke();}ctx.restore(); }
    ctx.save(); ctx.translate(-world.camera,0);
    for (const p of platforms) if(p.active) { const sx = p.x < 450 ? 28 : 680; drawImagePart(images.terrain,sx,60,700,420,p.x,p.y-18,p.w,p.h+70); }
    // 未完成のアーチ。青いオーブレンガが1個ずつ増え、全14個で出口が開く。
    ctx.save(); ctx.translate(goalGate.x,goalGate.y); const built=Math.min(shards.length,world.completed); const brickW=22, brickH=14;
    ctx.shadowColor=built===shards.length?'#fff09a':'#2fe4ff'; ctx.shadowBlur=built===shards.length?18:9;
    // 8個で半円アーチ、左右3個ずつで脚を作る。オーブは必要な形に変化する素材として扱う。
    const gateBricks=[];
    for(let i=0;i<8;i++) { const angle=Math.PI-(Math.PI*i/7); gateBricks.push({ x:goalGate.w/2+Math.cos(angle)*49, y:-94-Math.sin(angle)*48, angle:angle-Math.PI/2 }); }
    [-66,-42,-18].forEach(y => gateBricks.push({x:15,y,angle:0}));
    [-66,-42,-18].forEach(y => gateBricks.push({x:goalGate.w-15,y,angle:0}));
    gateBricks.forEach((brick,index) => { const filled=index<built; ctx.save();ctx.translate(brick.x,brick.y);ctx.rotate(brick.angle);ctx.fillStyle=filled?'#60e8ff':'#122a51';ctx.strokeStyle=filled?'#f2fff8':'#49719a';ctx.lineWidth=2;ctx.fillRect(-brickW/2,-brickH/2,brickW-2,brickH-2);ctx.strokeRect(-brickW/2,-brickH/2,brickW-2,brickH-2);if(filled){ctx.fillStyle='#efffb9';ctx.fillRect(-3,-3,6,5);}ctx.restore(); });
    ctx.strokeStyle=built===shards.length?'#fff2a5':'#66c9ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(14,-94);ctx.bezierCurveTo(14,-158,goalGate.w-14,-158,goalGate.w-14,-94);ctx.lineTo(goalGate.w-14,0);ctx.stroke();
    if(built===shards.length) {
      // 全オーブで門の中に黄色い渦が生まれる。触れるとコース選択マップへ戻る。
      const swirlTime=performance.now()/360; ctx.save();ctx.translate(goalGate.w/2,-46);ctx.globalCompositeOperation='screen';
      for(let i=0;i<4;i++){const radius=12+i*8;ctx.strokeStyle=i===3?'#fff6a4':'#ffd841';ctx.lineWidth=5-i*.7;ctx.globalAlpha=.92-i*.15;ctx.beginPath();ctx.arc(0,0,radius,swirlTime+i*1.7,swirlTime+i*1.7+Math.PI*1.52);ctx.stroke();}
      ctx.globalAlpha=.75;ctx.fillStyle='#fff6b1';ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    ctx.fillStyle='#e9fbff';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(`ORB BRICKS  ${built} / ${shards.length}`,goalGate.w/2,-goalGate.h-12);ctx.textAlign='start';ctx.restore();
    for (let i=1;i<checkpoints.length;i++) { const point=checkpoints[i]; const platform=platforms.find(p=>p.id===point.platformId); if(!platform || !platform.active)continue; const fy=platform.y-84; ctx.save();ctx.translate(point.x,fy);ctx.strokeStyle=point.active?'#ffe77c':'#a8d5ec';ctx.lineWidth=3;ctx.shadowColor=point.active?'#ffc84a':'#3ddfff';ctx.shadowBlur=point.active?14:7;if(FEATURES.checkpointAura&&point.active){ctx.globalAlpha=.3;ctx.beginPath();ctx.arc(7,15,25+Math.sin(performance.now()/180)*5,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}ctx.beginPath();ctx.moveTo(0,48);ctx.lineTo(0,0);ctx.lineTo(22,8);ctx.lineTo(0,17);ctx.closePath();ctx.stroke();ctx.fillStyle=point.active?'#fff0a4':'#75dcff';ctx.fill();ctx.fillStyle='#e9f8ff';ctx.font='bold 10px sans-serif';ctx.fillText('CP',5,-4);ctx.restore(); }
    // スピードランの進行方向を、浮遊する青い風標でさりげなく示す。
    for (const [x,y] of courseMarkers) { ctx.save(); ctx.translate(x,y); ctx.fillStyle='#aaf6ff'; ctx.shadowColor='#40dfff';ctx.shadowBlur=10; ctx.beginPath();ctx.moveTo(-13,-7);ctx.lineTo(8,-7);ctx.lineTo(8,-14);ctx.lineTo(22,0);ctx.lineTo(8,14);ctx.lineTo(8,7);ctx.lineTo(-13,7);ctx.closePath();ctx.fill();ctx.restore(); }
    for (const point of repairPoints) if(!point.repaired) { ctx.save(); ctx.translate(point.x,point.y); ctx.strokeStyle='#fff39c'; ctx.lineWidth=3; ctx.shadowColor='#f6e767';ctx.shadowBlur=16;ctx.strokeRect(-15,-15,30,30);ctx.fillStyle='#fff6b6';ctx.font='bold 13px sans-serif';ctx.fillText('E 修復',-25,-25);ctx.restore(); }
    if (FEATURES.collectibles) for (const s of shards) if(!s.taken) { const pulse=FEATURES.orbPulse?1+Math.sin(performance.now()/180+s.x)*.12:1;ctx.save(); ctx.translate(s.x,s.y+Math.sin(performance.now()/230+s.x)*7);ctx.scale(pulse,pulse); ctx.shadowColor='#55eaff';ctx.shadowBlur=22; drawImagePart(images.orb,1075,515,190,230,-26,-30,52,64);ctx.restore(); }
    const spriteState = !player.grounded ? 2 : Math.abs(player.vx)>2 ? 1 : 0;
    ctx.save(); ctx.translate(player.x+player.w/2,player.y); if(player.facing<0)ctx.scale(-1,1); if(player.attack > 0) { const elapsed=.34-player.attack; const attackFrame=elapsed<.11?0:elapsed<.23?1:2; const frames=[[18,70,590,570,-52,-6,104,101],[610,90,830,535,-67,-1,146,96],[1450,90,690,535,-53,-1,112,96]][attackFrame]; drawImagePart(images.attack,...frames); } else if(spriteState===1) { const frame=Math.floor(player.walkClock)%2; drawImagePart(images.walk,[190,1010][frame],125,700,760,-45,-2,90,110); } else drawImagePart(images.sprites,[60,650,1240][spriteState],145,530,730,-42,0,84,108);ctx.restore();
    const pieceY = player.y - 34 + Math.sin(performance.now()/220)*7; ctx.save();ctx.translate(player.x-16,pieceY);ctx.shadowColor='#b9f8ff';ctx.shadowBlur=16;drawImagePart(images.pieceSlime,130,150,580,620,-22,-22,45,50);ctx.restore();
    const guide=currentGuide(); const guidePlatform=guide && platforms[Math.max(1,Math.floor(platforms.length*.45))];
    if(guide && guidePlatform) { const gy=guidePlatform.y-20-56+Math.sin(performance.now()/230)*6; ctx.save();ctx.translate(guidePlatform.x+guidePlatform.w/2,gy);ctx.shadowColor=guide.color;ctx.shadowBlur=20;drawImagePart(images.pieceSlime,130,150,580,620,-24,-24,48,54);ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=.58;ctx.fillStyle=guide.color;ctx.fillRect(-28,-28,56,62);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#f7fbff';ctx.textAlign='center';ctx.font='bold 12px sans-serif';ctx.fillText(guide.name,0,-35);ctx.textAlign='start';ctx.restore(); }
    for (const enemy of enemies) if (enemy.alive) { const bob = Math.sin(performance.now()/210 + enemy.phase) * 4; ctx.save(); ctx.translate(enemy.x + enemy.w/2, enemy.y + bob); ctx.shadowColor='#5eeaff'; ctx.shadowBlur=10; if(enemy.dir<0)ctx.scale(-1,1); drawImagePart(images.pieceSlime,1060,260,650,560,-35,-8,70,60); if(FEATURES.enemyEyes){ctx.fillStyle='#ff6cf0';ctx.shadowColor='#ff4ee8';ctx.shadowBlur=8;ctx.fillRect(7,-1,5,5);ctx.fillRect(17,-1,5,5);}ctx.restore(); }
    if(FEATURES.particles) for(const p of world.particles){ctx.globalAlpha=p.life;ctx.fillStyle=p.color || '#b8faff';ctx.fillRect(p.x-2,p.y-2,5,5);ctx.globalAlpha=1;}
    ctx.restore();
    if (FEATURES.orbCompass) { const target=shards.filter(shard=>!shard.taken).sort((a,b)=>Math.abs(a.x-player.x)-Math.abs(b.x-player.x))[0]; if(target){const direction=Math.sign(target.x-player.x)||1;ctx.save();ctx.translate(640,42);ctx.fillStyle='#b9f9ff';ctx.shadowColor='#4ce7ff';ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(direction*18,0);ctx.lineTo(-direction*10,-10);ctx.lineTo(-direction*10,10);ctx.closePath();ctx.fill();ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('NEXT ORB',0,-16);ctx.restore();} }
    if (FEATURES.comboMeter && world.combo>1) { ctx.save();ctx.globalAlpha=Math.min(1,world.comboTimer);ctx.fillStyle='#fff09a';ctx.shadowColor='#ffb744';ctx.shadowBlur=12;ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText(`COMBO ×${world.combo}`,640,92);ctx.restore(); }
    if (FEATURES.stageBanner && world.stageBanner>0) { world.stageBanner=Math.max(0,world.stageBanner-1/60);ctx.save();ctx.globalAlpha=Math.min(1,world.stageBanner*2);ctx.fillStyle='#eafcff';ctx.shadowColor='#45dfff';ctx.shadowBlur=18;ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText(`STAGE ${world.currentCourse}　${courseNames[world.currentCourse-1]}`,640,165);ctx.restore(); }
    ctx.fillStyle='#061024aa';ctx.fillRect(0,680,1280,40); if(FEATURES.debug){ctx.fillStyle='white';ctx.font='14px monospace';ctx.fillText(`x:${Math.round(player.x)}  shards:${world.completed}`,20,700);}
  }
  function prepareCourseMap() {
    world.clearedCourses=restoreWorldProgress();
    const candidates=[];
    if (FEATURES.saveData) SLOT_KEYS.forEach((key,index) => {
      try { const data=readStored(key); if (validSave(data)) candidates.push({ data, index }); }
      catch { /* 壊れたスロットは他の正常なスロットの検出を妨げない。 */ }
    });
    candidates.sort((a,b) => b.data.savedAt-a.data.savedAt);
    pendingAutoSave=candidates[0] ?? null;
    if (pendingAutoSave) {
      const saved=pendingAutoSave.data;
      // セーブ中だったコースは、コース一覧上で選べる状態にしておく。
      world.clearedCourses=Math.max(world.clearedCourses,saved.clearedCourses ?? 0,(saved.course ?? 1)-1);
    }
    world.started=false; $('#startScreen').hidden=true;
    showCourseSelect(pendingAutoSave?'保存中のコースを選ぶと、チェックポイントから自動で再開します。':'次の行き先を選んでください。');
    if (isFirstAccess()) showDialogue('このゲームはオートセーブを使用します');
  }
  prepareCourseMap();
  requestAnimationFrame(step);
})();
