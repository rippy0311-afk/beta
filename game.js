(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const keys = new Set();
  const defaultBindings = Object.freeze({ left:'ArrowLeft', right:'ArrowRight', jump:'Space', dash:'ShiftLeft', attack:'KeyZ', repair:'KeyE', menu:'Escape' });
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
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version:2, bindings:{ ...bindings }, volume:Number($('#volumeControl').value) }));
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
      const storedBindings = { ...defaultBindings, ...(isRecord(data?.bindings) ? data.bindings : {}) };
      const codes = Object.keys(defaultBindings).map(action => storedBindings[action]);
      if (!isRecord(data) || ![1,2].includes(data.version) || !inRange(data.volume, 0, 100) || !isRecord(data.bindings) ||
          !codes.every(validCode) || new Set(codes).size !== codes.length || codes.slice(0, -1).includes('Escape')) throw new Error('Invalid settings');
      Object.keys(defaultBindings).forEach(action => bindings[action] = storedBindings[action]);
      $('#volumeControl').value = data.volume;
      $('#volumeValue').textContent = `${data.volume}%`;
    } catch {
      $('#settingsStatus').textContent = '保存済み設定を読み込めません。初期設定で開始しました。';
    }
  }
  let bindingAction = null;
  const tuning = { gravity:GAME_CONFIG.gravity, playerSpeed:GAME_CONFIG.playerSpeed, jumpVelocity:GAME_CONFIG.jumpVelocity };
  let mechanicNumbers = { ...MECHANIC_NUMBERS, ...(STAGE_NUMERIC_OVERRIDES[1] || {}) };
  const mechanic = (key) => mechanicNumbers[key] ?? MECHANIC_NUMBERS[key];
  // 実装を追加するときは abilities に機能名を足すだけで、開発・セーブ画面から扱える土台になる。
  const abilities = FEATURES.abilitySystem ? { airDash:false, doubleJump:false, glide:false } : {};
  const AIR_DASH_MAX_LEVEL = 5;
  const abilityLevels = { airDash: 1 };
  const images = { background: new Image(), terrain: new Image(), repairBefore:new Image(), repairAfter:new Image(), orb: new Image(), sprites: new Image(), walk: new Image(), groundDash: new Image(), enemy: new Image(), attack: new Image(), pieceSlime: new Image(), futureWindow:new Image(), restoredResident:new Image(), memoryFragment:new Image() };
  images.background.src = 'assets/Background/Chapter1/stage-01-background.png';
  images.terrain.src = 'assets/stages/Chapter1/stage-01-platform.png';
  // オーブは基礎足場のシートではなく、専用の結晶が入った素材シートから描画する。
  images.orb.src = 'assets/terrain-assets.png';
  images.sprites.src = 'assets/ren-sprites.png';
  images.walk.src = 'assets/ren-walk-cycle-5.png?v=3';
  images.groundDash.src = 'assets/ren-ground-dash-cycle.png?v=2';
  images.enemy.src = 'assets/corruption-wisp.png';
  images.attack.src = 'assets/ren-attack-cycle.png';
  images.pieceSlime.src = 'assets/piece-and-half-slime.png';
  images.futureWindow.src = 'assets/narrative/future-window.png';
  images.restoredResident.src = 'assets/narrative/restored-resident.png';
  images.memoryFragment.src = 'assets/narrative/memory-fragment.png';

  const world = { camera: 0, backgroundOffset: 0, started: !FEATURES.titleScreen, completed: 0, complete: 0, messageShown: false, particles: [], afterimages:[], repairWaves:[], attackFlash:0, gateExit:0, gateExitParticles:[], hitStop:0, temporaryPlatforms:[], footsteps:[], history:[], thrownOrbs:[], bellWaves:[], gravityDirection:1, timeShifted:false, todoTimer:0, lastGround:null, narrative:null, fragmentTaken:false, residentSpoken:false, signShown:false, idleLoreShown:false, idleTime:0, mapOpen:false, boundaryMode:false, boundarySeen:false, boundaryPlatforms:[], menuOpen: false, controlGuide:false, developerOpen: false, courseSelect: false, clearedCourses: 0, currentCourse: 1, floating: false, stageClear: false, gateHintShown: false, guideSeen: false, repaired: 0, time: 0, checkpointIndex: 0, dialogueOpen: false, toastTimer: null, toastCountdownTimer: null, toastEndsAt: 0, autoSaveTimer: null, combo: 0, comboTimer: 0, stageBanner: 0, stageTipShown: false, stats:{orbs:0,repairs:0,enemies:0,checkpoints:0,jumps:0,dashes:0,attacks:0} };
  const player = { x: 110, y: 450, w: 46, h: 74, vx: 0, vy: 0, grounded: false, facing: 1, walkClock: 0, groundDash: 0, dashCooldown: 0, invulnerable: 0, attack: 0, attackCooldown: 0, airDashAvailable: false, airDash: 0, coyote:0, jumpBuffer:0, orbCharges:0, lastFootstepCell:null, copiedWispCharges:0, copiedWispTimer:0 };
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
  const stageAsset = (stage, kind) => `assets/stages/Chapter1/${kind.replace('{stage}',String(stage).padStart(2,'0'))}`;
  const stageBackgroundAsset = (stage) => `assets/Background/Chapter1/stage-${String(stage).padStart(2,'0')}-background.png`;
  const abilityGuides = [
    { course:3, name:'Astra', color:'#b777ff', ability:'能力の星図を案内する' },
    { course:5, name:'Sol', color:'#ffe15b', ability:'Air Dash を託す' },
    { course:8, name:'Terra', color:'#62df82', ability:'大地の力を調律する' },
    { course:11, name:'Luna', color:'#ff6575', ability:'月影の力を調律する' },
  ];
  function loadCourse(number) {
    world.currentCourse=number; abilities.airDash=number>=5;
    world.boundaryMode=false; world.boundaryPlatforms=[]; world.boundarySeen=false; world.mapOpen=false;
    player.copiedWispCharges=0; player.copiedWispTimer=0;
    mechanicNumbers={ ...MECHANIC_NUMBERS, ...(STAGE_NUMERIC_OVERRIDES[number] || {}) };
    world.narrative=NARRATIVE_STAGE_CONTENT[number] || null;
    world.fragmentTaken=false; world.residentSpoken=false; world.signShown=false; world.idleLoreShown=false; world.idleTime=0; world.echoShown=false;
    images.background.src=stageBackgroundAsset(number);
    images.terrain.src=stageAsset(number,'stage-{stage}-platform.png');
    images.repairBefore.src=stageAsset(number,'repair-{stage}-before.png');
    images.repairAfter.src=stageAsset(number,'repair-{stage}-after.png');
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
  function setMenu(open) { if (!world.started || (open && world.stageClear)) return; world.menuOpen = open; if (open) setControlGuide(false); $('#pauseMenu').hidden = !open; if (open) $('#resumeGame').focus(); }
  function syncDevOrbControl() {
    if (!FEATURES.developerTools) return;
    $('#devOrbs').max=shards.length;
    $('#devOrbs').value=world.completed;
  }
  function setDeveloper(open) { if (!FEATURES.developerTools) return; world.developerOpen=open; $('#developerPanel').hidden=!open; if(open) { $('#devX').value=Math.round(player.x); $('#devY').value=Math.round(player.y); $('#devAirDash').value=abilityLevels.airDash; syncDevOrbControl(); $('#devSpeed').focus(); } }
  function renderCourseMap() {
    document.querySelectorAll('.course-route path').forEach((path) => path.classList.toggle('is-visible',Number(path.dataset.step)<=world.clearedCourses));
    document.querySelectorAll('.course-node').forEach((node) => {
      const course=Number(node.dataset.course);
      if (course===14) {
        const unlocked=FEATURES.boundaryExpedition && world.clearedCourses>=13;
        node.hidden=!unlocked; node.disabled=!unlocked;
        node.classList.toggle('cleared',false); node.classList.toggle('available',unlocked); node.classList.toggle('locked',!unlocked);
        node.style.removeProperty('--island-image');
        return;
      }
      const cleared=course<=world.clearedCourses; const available=course===world.clearedCourses+1;
      node.style.setProperty('--island-image',`url("assets/stages/Chapter1/stage-${String(course).padStart(2,'0')}-island.png")`);
      node.classList.toggle('cleared',cleared); node.classList.toggle('available',available); node.classList.toggle('locked',!cleared&&!available); node.disabled=!cleared&&!available;
    });
  }
  function showCourseSelect(message='次の行き先を選んでください。') { setDeveloper(false); setControlGuide(false); world.courseSelect=true; world.menuOpen=false; $('#pauseMenu').hidden=true; closeDialogue(); $('#courseSelect').hidden=false; renderCourseMap(); $('#courseMessage').textContent=message; }
  function openCourseSelect() { world.clearedCourses=Math.max(world.clearedCourses,world.currentCourse); persistWorldProgress(); showCourseSelect(world.currentCourse===13?'CHAPTER 1 COMPLETE！ アルケアの航路がひとつ完成した。':'次の行き先を選んでください。'); }
  function closeCourseSelect() { world.courseSelect=false; $('#courseSelect').hidden=true; }
  function resetGame() { world.camera=0; world.backgroundOffset=0; world.time=0; world.checkpointIndex=0; world.completed=0; world.complete=0; world.repaired=0; world.combo=0; world.comboTimer=0; world.hitStop=0; world.temporaryPlatforms=[]; world.footsteps=[]; world.history=[]; world.thrownOrbs=[]; world.bellWaves=[]; world.gravityDirection=1; world.timeShifted=false; world.todoTimer=0; world.lastGround=null; world.stats={orbs:0,repairs:0,enemies:0,checkpoints:0,jumps:0,dashes:0,attacks:0}; world.stageTipShown=false; world.messageShown=false; world.gateHintShown=false; world.guideSeen=false; world.particles=[]; world.afterimages=[]; world.repairWaves=[]; world.attackFlash=0; world.gateExit=0; world.gateExitParticles=[]; world.stageClear=false; world.courseSelect=false; world.floating=false; setControlGuide(false); $('#devFloat').textContent='浮遊：OFF'; $('#stageClear').hidden=true; $('#courseSelect').hidden=true; const start=checkpoints[0],startPlatform=platforms.find(p=>p.id===start.platformId); player.x=start.x; player.y=(startPlatform?.y||520)-20-player.h; player.vx=0; player.vy=0; player.attack=0; player.attackCooldown=0; player.groundDash=0; player.dashCooldown=0; player.airDash=0; player.airDashAvailable=abilities.airDash; player.coyote=0; player.jumpBuffer=0; player.orbCharges=0; player.lastFootstepCell=null; player.invulnerable=0; shards.forEach(s=>s.taken=false); repairPoints.forEach(p=>{p.repaired=false;p.promptShown=false;}); platforms.forEach(p=>p.active=p.defaultActive ?? !['bridge-a','bridge-b'].includes(p.id)); checkpoints.forEach((p,i)=>p.active=i===0); enemies.forEach(e=>{e.alive=true;e.purified=false;}); $('#completeBar').style.width='0%'; updateHud(); $('#runTimer').textContent='00:00.00'; setMenu(false); showDialogue(abilities.airDash?'ピース「Air Dashが使えるよ！ 空中で X を押して、向いている方向へ飛ぼう。」':GAME_CONFIG.initialDialogue); }
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
    if (course===14) { startBoundaryExpedition(); return; }
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
  function renderControlGuide() {
    $('#guideLeft').textContent=keyLabel(bindings.left); $('#guideRight').textContent=keyLabel(bindings.right);
    $('#guideJump').textContent=keyLabel(bindings.jump); $('#guideDash').textContent=keyLabel(bindings.dash);
    $('#guideAttack').textContent=keyLabel(bindings.attack); $('#guideRepair').textContent=keyLabel(bindings.repair); $('#guideMenu').textContent=keyLabel(bindings.menu);
    $('#guideAirDashRow').classList.toggle('is-locked',!abilities.airDash);
    $('#guideAirDashStatus').textContent=abilities.airDash ? '空中・各着地1回' : 'STAGE 5で解放';
  }
  function setControlGuide(open) { world.controlGuide=Boolean(open) && world.started && !world.menuOpen && !world.stageClear && !world.courseSelect; $('#controlGuide').hidden=!world.controlGuide; $('#controlGuidePrompt').setAttribute('aria-expanded',String(world.controlGuide)); if(world.controlGuide) renderControlGuide(); }
  $('#controlGuidePrompt').onclick=()=>setControlGuide(!world.controlGuide);
  function renderBindings() { document.querySelectorAll('.key-bind').forEach((button) => { button.textContent=keyLabel(bindings[button.dataset.action]); button.classList.toggle('is-listening',button.dataset.action===bindingAction); }); $('.pause-window header span').textContent=`${keyLabel(bindings.menu)}で戻る`; renderControlGuide(); }
  // ゲーム中は矢印を移動に残し、画面内に選択肢があるときだけ空間的なキーボード移動へ切り替える。
  function navigationRoot() {
    if (world.courseSelect) return $('#courseSelect');
    if (world.stageClear) return $('#stageClear');
    if (world.menuOpen) return $('#pauseMenu');
    if (world.developerOpen) return $('#developerPanel');
    if (!world.started && !$('#startScreen').hidden) return $('#startScreen');
    return null;
  }
  function moveUiFocus(key) {
    const root=navigationRoot();
    // 数値入力・セレクト上の矢印は、従来どおり値の変更に使う。
    if (!root || document.activeElement?.matches('input,select,textarea')) return false;
    const choices=[...root.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])')]
      .filter(element=>element.getClientRects().length && !element.closest('[hidden]'));
    if (!choices.length) return false;
    const current=choices.includes(document.activeElement) ? document.activeElement : choices[0];
    if (current !== document.activeElement) { current.focus({preventScroll:true}); return true; }
    const base=current.getBoundingClientRect(); const center={x:base.left+base.width/2,y:base.top+base.height/2};
    const directional=choices.filter(choice=> {
      if (choice===current) return false;
      const rect=choice.getBoundingClientRect(), dx=rect.left+rect.width/2-center.x, dy=rect.top+rect.height/2-center.y;
      return key==='ArrowLeft' ? dx < -2 : key==='ArrowRight' ? dx > 2 : key==='ArrowUp' ? dy < -2 : dy > 2;
    });
    if (!directional.length) return true;
    directional.sort((a,b)=> {
      const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
      const adx=ra.left+ra.width/2-center.x, ady=ra.top+ra.height/2-center.y, bdx=rb.left+rb.width/2-center.x, bdy=rb.top+rb.height/2-center.y;
      const ascore=(key==='ArrowLeft'||key==='ArrowRight' ? Math.abs(adx)+Math.abs(ady)*.42 : Math.abs(ady)+Math.abs(adx)*.42);
      const bscore=(key==='ArrowLeft'||key==='ArrowRight' ? Math.abs(bdx)+Math.abs(bdy)*.42 : Math.abs(bdy)+Math.abs(bdx)*.42);
      return ascore-bscore;
    });
    directional[0].focus({preventScroll:true}); return true;
  }
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
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code) && moveUiFocus(e.code)) { e.preventDefault(); return; }
    if (e.code === 'KeyH' && world.started && !world.menuOpen && !world.courseSelect && !world.stageClear) { e.preventDefault(); setControlGuide(!world.controlGuide); return; }
    if (world.controlGuide && e.code === 'Escape') { e.preventDefault(); setControlGuide(false); return; }
    if (e.code === 'F2' && FEATURES.developerTools) { e.preventDefault(); setDeveloper(!world.developerOpen); return; }
    if (!e.repeat && world.started && !world.menuOpen && !world.courseSelect && !world.stageClear) {
      if (e.code==='KeyM' && FEATURES.handDrawnMap) { e.preventDefault(); world.mapOpen=!world.mapOpen; showToast(world.mapOpen?'ピース「歩いた道を地図に描いたよ。」':'ピース「地図を閉じた。」'); return; }
      if (e.code==='KeyV' && FEATURES.enemyAbilityCopy && player.copiedWispCharges>0 && player.copiedWispTimer<=0) { e.preventDefault(); player.copiedWispCharges--; player.copiedWispTimer=6; showToast('ピース「コピーした風で、ゆっくり落ちる！」'); return; }
      if (e.code==='KeyQ' && FEATURES.rewind) { e.preventDefault(); rewindPlayer(); return; }
      if (e.code==='KeyR' && FEATURES.gravityRotation) { e.preventDefault(); world.gravityDirection*=-1; player.grounded=false; showToast(world.gravityDirection>0?'ピース「重力を戻したよ。」':'ピース「重力が反転した！」'); return; }
      if (e.code==='KeyT' && FEATURES.timeShift) { e.preventDefault(); world.timeShifted=!world.timeShifted; showToast(world.timeShifted?'ピース「時間の層をずらした。」':'ピース「時間の層を戻した。」'); return; }
      if (e.code==='KeyC' && FEATURES.orbThrow) { e.preventDefault(); throwOrb(); return; }
      if (e.code==='KeyK' && FEATURES.todoErase) { e.preventDefault(); world.todoTimer=mechanic('todoEraseDuration'); showToast('ピース「TODO を一時的に消した！」'); return; }
    }
    if (Object.values(bindings).includes(e.code)) e.preventDefault();
    if (e.code === bindings.menu) { setMenu(!world.menuOpen); return; }
    keys.add(e.code); if (e.code === bindings.jump && !world.started) $('#startButton').click();
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); if (FEATURES.variableJump && e.code===bindings.jump && player.vy < -220) player.vy *= .52; });
  document.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key; button.addEventListener('pointerdown', () => keys.add(key)); button.addEventListener('pointerup', () => keys.delete(key)); button.addEventListener('pointerleave', () => keys.delete(key));
  });

  function input(name) { return keys.has(bindings[name]) || keys.has(name); }
  function rect(a,b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
  function platformX(platform) {
    if (!FEATURES.windPlatforms || platform.temp || platform.id==='start' || platform.id==='goal') return platform.x;
    const amplitude=platform.id.includes('bridge') ? mechanic('windBridgeAmplitude') : mechanic('windPlatformAmplitude');
    return platform.x + Math.sin(world.time*mechanic('windSpeed') + platform.x*.012) * amplitude;
  }
  function platformY(platform) {
    if (!FEATURES.rhythmPlatforms || platform.temp || platform.id==='start' || platform.id==='goal') return platform.y;
    return platform.y + Math.sin(world.time*mechanic('rhythmPlatformSpeed') + platform.x*.009) * mechanic('rhythmPlatformAmplitude');
  }
  function surfaces() { return [...platforms, ...(world.boundaryPlatforms || []), ...world.temporaryPlatforms]; }
  function addTemporaryPlatform(x,y,w=112,h=22,life=2.4,type='memory') {
    world.temporaryPlatforms.push({id:`temp-${performance.now()}-${Math.random()}`,x,y,w,h,life,type,temp:true,active:true});
  }
  function purgeEnemy(enemy) {
    if (!enemy || !enemy.alive) return false;
    enemy.alive=false; enemy.purified=true; enemy.purifiedAt=world.time;
    world.stats.enemies++; addComplete(8);
    if(FEATURES.hitStop) world.hitStop=.055;
    if(FEATURES.particles) for(let i=0;i<18;i++) world.particles.push({x:enemy.x+28,y:enemy.y+25,vx:(Math.random()-.5)*260,vy:-40-Math.random()*190,life:.65,color:'#b9ffda'});
    return true;
  }
  function grantWispWind() {
    if (!FEATURES.enemyAbilityCopy) return;
    player.copiedWispCharges=Math.min(3,(player.copiedWispCharges||0)+1);
    showToast(`ピース「半端スライムの風をコピーした！ Vで使える（${player.copiedWispCharges}）」`);
  }
  function rewindPlayer() {
    if (!FEATURES.rewind || world.history.length<10) return;
    const snapshot=world.history[Math.max(0,world.history.length-mechanic('rewindFrames'))];
    player.x=snapshot.x; player.y=snapshot.y; player.vx=snapshot.vx*.3; player.vy=0; player.invulnerable=mechanic('rewindInvulnerability');
    world.history.length=0;
    showToast('ピース「少し前の足場へ戻ったよ。」');
  }
  function throwOrb() {
    if (!FEATURES.orbThrow || player.orbCharges<=0) return;
    player.orbCharges--; world.thrownOrbs.push({x:player.x+player.w/2,y:player.y+28,vx:player.facing*mechanic('orbThrowSpeed'),vy:-90,life:mechanic('orbThrowLife')});
    showToast('ピース「オーブを投げた！」');
  }
  function startBoundaryExpedition() {
    if(!FEATURES.boundaryExpedition || world.clearedCourses<13) return;
    closeCourseSelect(); loadCourse(13); resetGame(); world.started=true; world.boundaryMode=true; world.boundarySeen=false; world.boundaryPlatforms=[];
    const y=goalGate.y+82, x=goalGate.x+190;
    for(let i=0;i<6;i++) world.boundaryPlatforms.push({id:`boundary-${i}`,x:x+i*225,y:y-(i%2)*42,w:175,h:40,active:true,temp:true,life:99999,type:'boundary'});
    player.x=x+18; player.y=y-20-player.h; player.vx=0; player.vy=0; player.grounded=true; player.airDashAvailable=true;
    showDialogue('ピース「地図の外……？　まだ作られていないのに、道がある。」');
  }
  function memoryCount() { try { return JSON.parse(localStorage.getItem('beta.memory-fragments.v1') || '[]').length; } catch { return 0; } }
  function rememberCurrentFragment() { if(!FEATURES.worldMemory) return; try { const values=new Set(JSON.parse(localStorage.getItem('beta.memory-fragments.v1') || '[]')); values.add(world.currentCourse); localStorage.setItem('beta.memory-fragments.v1',JSON.stringify([...values])); } catch { /* 進行はこの起動中にも維持される。 */ } }
  function updateNarrative(dt) {
    const story=world.narrative;
    if(!story) return;
    if(FEATURES.dynamicSigns && !world.signShown && world.time>.75) { world.signShown=true; showToast(`記録板「${story.sign}」`); }
    if(FEATURES.memoryFragments && !world.fragmentTaken && Math.hypot(player.x-story.fragment[0],player.y-story.fragment[1])<72) {
      world.fragmentTaken=true; rememberCurrentFragment(); showToast(`記憶の断片「${story.memory}」`);
      if(FEATURES.particles) for(let i=0;i<20;i++)world.particles.push({x:story.fragment[0],y:story.fragment[1],vx:(Math.random()-.5)*180,vy:-Math.random()*190,life:.7,color:'#cba8ff'});
    }
    const repaired=repairPoints.some(point=>point.repaired);
    if(FEATURES.restorationEchoes && repaired && !world.echoShown){world.echoShown=true; const point=repairPoints.find(item=>item.repaired); for(let i=0;i<18;i++)world.particles.push({x:point.x,y:point.y,vx:(Math.random()-.5)*170,vy:-60-Math.random()*180,life:.9,color:'#fff0a2'});}
    if(FEATURES.restoredResidents && repaired && !world.residentSpoken && Math.abs(player.x-(repairPoints[0]?.x||0))<180) { world.residentSpoken=true; showToast(`工房の精霊「${story.resident}」`); }
    if(FEATURES.idleLore) { world.idleTime=Math.abs(player.vx)<5 ? world.idleTime+dt : 0; if(world.idleTime>5 && !world.idleLoreShown) { world.idleLoreShown=true; showToast(`ピース「${story.memory}」`); } }
  }
  function addComplete(value) { world.complete=Math.min(100,world.complete+value); $('#completeBar').style.width=`${world.complete}%`; }
  function collect(shard) { shard.taken = true; world.completed++; world.stats.orbs++; player.orbCharges++; addComplete(10); if (FEATURES.particles) for (let i=0;i<16;i++) world.particles.push({x:shard.x,y:shard.y,vx:(Math.random()-.5)*240,vy:(Math.random()-.8)*250,life:1}); if(FEATURES.orbTrail) for(let i=0;i<10;i++) world.particles.push({x:shard.x,y:shard.y,vx:(Math.random()-.5)*160,vy:-40-Math.random()*170,life:.45,color:'#8cf7ff'}); updateHud(); }
  function saveCheckpoint() {
    if (!FEATURES.autoSave || !FEATURES.saveData) return;
    const slotIndex=activeSaveSlot ?? 0;
    const data=snapshot();
    if (!validSave(data)) return;
    try { localStorage.setItem(SLOT_KEYS[slotIndex],JSON.stringify(data)); activeSaveSlot=slotIndex; renderSlots(); showAutoSaveIndicator(); }
    catch { /* ゲーム進行は止めず、セーブ画面で状態を確認できるようにする。 */ }
  }
  function repair() { const target=FEATURES.enemyPurification && enemies.find(enemy=>enemy.alive && Math.hypot(enemy.x+enemy.w/2-(player.x+player.w/2),enemy.y+enemy.h/2-(player.y+player.h/2))<88); if(target){if(purgeEnemy(target)){grantWispWind();}return;} const point=repairPoints.find(p=>!p.repaired && Math.abs((player.x+player.w/2)-p.x)<80 && Math.abs((player.y+player.h)-p.y)<100); if(!point)return; const firstRepair=world.currentCourse===1 && world.repaired===0; point.repaired=true; world.repaired++; world.stats.repairs++; const bridge=platforms.find(p=>p.id===point.platformId); if(bridge)bridge.active=true; addComplete(24); if(FEATURES.repairPulse)world.repairWaves.push({x:point.x,y:point.y,life:.7}); for(let i=0;i<26;i++)world.particles.push({x:point.x,y:point.y,vx:(Math.random()-.5)*300,vy:(Math.random()-.9)*330,life:.85,color:'#f7f6b2'}); if(FEATURES.repairDust) for(let i=0;i<18;i++)world.particles.push({x:point.x+(Math.random()-.5)*165,y:point.y+22,vx:(Math.random()-.5)*190,vy:-30-Math.random()*115,life:.65,color:'#e6d7ab'}); showToast(world.currentCourse===1 ? (firstRepair?'ピース「うわー！直った！よかった～」':'ピース「これも直った！よかった。」') : `ピース「${point.hint}を直したよ。」`); updateHud(); }
  function respawn() { const point=checkpoints[world.checkpointIndex]; const platform=platforms.find(p=>p.id===point.platformId); player.x=point.x; player.y=platform ? platform.y-20-player.h : 430; player.vx=0; player.vy=0; player.invulnerable=1.1; }
  function strike() {
    player.attack = .34; player.attackCooldown = .40; world.stats.attacks++;
    if(FEATURES.attackLunge && player.grounded) player.vx += player.facing*115;
    if(FEATURES.attackArc) world.attackFlash=.16;
    if (!player.grounded) {
      // 空中攻撃は右図のような浅い弧を描く：小さく上昇してから慣性と重力で前方へ落下する。
      player.vy = Math.min(player.vy, -180);
      player.vx += player.facing * 70;
    }
    const hitbox = { x: player.facing > 0 ? player.x + player.w - 3 : player.x - 96, y: player.y + 10, w: 98, h: 54 };
    for (const enemy of enemies) if (enemy.alive && rect(hitbox, enemy)) {
      enemy.alive = false; world.stats.enemies++; addComplete(8); if(FEATURES.hitStop)world.hitStop=.055;
      if (FEATURES.comboMeter) { world.combo++; world.comboTimer=2.6; }
      if (FEATURES.particles) for (let i=0;i<22;i++) world.particles.push({x:enemy.x+28,y:enemy.y+25,vx:(Math.random()-.5)*330,vy:(Math.random()-.7)*310,life:.65,color:'#f04dff'});
    }
  }
  function updateHud() { const percent = Math.min(100, Math.round((world.completed * 12 + world.repaired * 26 + enemies.filter(e=>!e.alive).length * 4))); $('#completionValue').textContent = `${percent}%`; $('#completionBar').style.width = `${percent}%`; $('#shardCount').textContent = '◇'.repeat(Math.min(5,world.completed)) + '◆'.repeat(Math.max(0,5-world.completed)); $('#segmentLabel').textContent=`STAGE ${world.currentCourse} / 13　${courseNames[world.currentCourse-1]}`; }
  function beginGateExit() { if (world.gateExit > 0 || world.stageClear) return; world.gateExit=.92; player.vx=0; player.vy=0; player.attack=0; player.groundDash=0; const targetX=goalGate.x+goalGate.w/2, targetY=goalGate.y-46; world.gateExitParticles=[]; for(let y=10;y<112;y+=9) for(let x=-38;x<=38;x+=10) { const delay=((112-y)/112)*.34+Math.random()*.045; world.gateExitParticles.push({x:player.x+player.w/2+x,y:player.y+y,targetX,targetY,delay,duration:.40+Math.random()*.10,size:3+Math.random()*4,color:Math.random()>.42?'#fff3a2':'#60e8ff',spin:(Math.random()-.5)*42}); } closeDialogue(); }
  function finishStage() { if (world.stageClear) return; world.stageClear=true; player.vx=0; player.vy=0; $('#clearStage').textContent=`ACT I ・ STAGE ${world.currentCourse} / 13`; $('#clearTime').textContent=$('#runTimer').textContent; $('#clearShards').textContent=`${world.stats.orbs} / ${shards.length}`; $('#clearRepairs').textContent=`${world.stats.repairs} / ${repairPoints.length}`; $('#clearEnemies').textContent=world.stats.enemies; $('#clearCheckpoints').textContent=world.stats.checkpoints; $('#clearJumps').textContent=world.stats.jumps; $('#clearDashes').textContent=world.stats.dashes; $('#clearAttacks').textContent=world.stats.attacks; const remembered=world.fragmentTaken || memoryCount()>=world.currentCourse; $('#clearMessage').textContent=FEATURES.alternateEnding && remembered ? `${courseNames[world.currentCourse-1]}を完成させ、失われた記憶もつなぎ直した。` : `${courseNames[world.currentCourse-1]}を完成させた。次の浮島が、雲の向こうで待っている。`; closeDialogue(); $('#stageClear').hidden=false; $('#resultCourseSelect').focus(); }
  let last = performance.now();
  function step(now) {
    const dt = Math.min(.033, (now-last)/1000); last=now;
    if (world.started && !world.menuOpen && !world.developerOpen && !world.courseSelect && !world.stageClear && !world.dialogueOpen) update(dt); draw(); requestAnimationFrame(step);
  }
  function update(dt) {
    if (world.hitStop>0) { world.hitStop=Math.max(0,world.hitStop-dt); return; }
    if (world.gateExit > 0) { world.gateExit=Math.max(0,world.gateExit-dt); if(world.gateExit===0) finishStage(); return; }
    // 空中攻撃だけは、開始時の慣性と重力に従って放物線を描く。
    // 地上攻撃中は通常どおり移動入力を受け付ける。
    const wasAirborne=!player.grounded;
    const airAttacking = player.attack > 0 && !player.grounded;
    const airDashing = player.airDash > 0;
    const groundDashing = player.groundDash > 0;
    const dir = (input('right')?1:0)-(input('left')?1:0);
    if (world.floating) {
      const vertical=(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0);
      player.vx=dir*tuning.playerSpeed; player.vy=vertical*tuning.playerSpeed; player.grounded=false;
      if(dir)player.facing=dir;
    } else if (!airAttacking && !airDashing && !groundDashing) {
      player.vx = dir * tuning.playerSpeed;
      if (dir) player.facing = dir;
      // 5コマを見分けられるよう、歩行のコマ進行はダッシュよりゆっくりにする。
      if (dir && player.grounded) player.walkClock += dt * 9;
    } else if (airAttacking) {
      // 空中攻撃中は入力を受けず、攻撃開始時の移動速度だけが慣性として緩やかに減衰する。
      player.vx *= Math.pow(0.06, dt);
    }
    // Shift は歩きアニメーションを速くするだけではない、独立した地上ダッシュ。
    // 地面で一度だけ大きく踏み込み、専用の5コマ姿勢で前へ抜ける。
    if (!world.floating && input('dash') && player.grounded && player.dashCooldown <= 0 && !airAttacking) {
      const dashDirection=dir || player.facing;
      player.facing=dashDirection; player.groundDash=.30; player.dashCooldown=5; player.vx=dashDirection*720;
      keys.delete(bindings.dash); keys.delete('dash');
      if(FEATURES.dashAfterimages) for(let i=0;i<4;i++)world.afterimages.push({x:player.x-player.facing*i*18,y:player.y,life:.34-i*.045,color:'#65e7ff'});
      if (FEATURES.particles) for(let i=0;i<10;i++) world.particles.push({x:player.x+player.w/2-player.facing*18,y:player.y+player.h-7,vx:-player.facing*(70+Math.random()*150),vy:-Math.random()*80,life:.28,color:'#b8f9ff'});
    }
    if (FEATURES.jumpBuffer && input('jump')) player.jumpBuffer=.13;
    const canJump=player.grounded || (FEATURES.coyoteJump && player.coyote>0);
    if (!world.floating && player.jumpBuffer>0 && canJump) { player.vy=-tuning.jumpVelocity; player.grounded=false; player.coyote=0; player.jumpBuffer=0; world.stats.jumps++; keys.delete(bindings.jump); keys.delete('jump'); }
    if (abilities.airDash && !player.grounded && player.airDashAvailable && keys.has('KeyX')) {
      // Lv1=主人公1人分、以後は0.5人分ずつ増加し、Lv5で最大3人分まで届く。
      const distance=player.w*(1+(abilityLevels.airDash-1)*.5);
      player.airDashAvailable=false; player.airDash=.18; player.vx=player.facing*distance/.18; player.vy=-35; world.stats.dashes++;
      if(FEATURES.airDashRing) world.repairWaves.push({x:player.x+player.w/2,y:player.y+player.h/2,life:.38,color:'#ffe45a',max:64});
      if(FEATURES.dashAfterimages) for(let i=0;i<5;i++)world.afterimages.push({x:player.x-player.facing*i*14,y:player.y+i*2,life:.30-i*.035,color:'#fff09a'});
      if(FEATURES.dashPlatforms) addTemporaryPlatform(player.x-30,player.y+player.h+18,112,20,mechanic('dashPlatformLife'),'dash');
      keys.delete('KeyX'); if(FEATURES.particles) for(let i=0;i<16;i++)world.particles.push({x:player.x+player.w/2,y:player.y+34,vx:-player.facing*(70+Math.random()*180),vy:(Math.random()-.5)*140,life:.35,color:'#ffe45a'});
    }
    if (input('attack') && player.attackCooldown <= 0) { strike(); if(FEATURES.bellWave){world.bellWaves.push({x:player.x+player.w/2,y:player.y+34,life:mechanic('bellWaveLife')});} if(FEATURES.rainStairs && !player.grounded)addTemporaryPlatform(player.x-30,player.y+player.h+26,110,18,mechanic('rainStairLife'),'rain'); keys.delete(bindings.attack); keys.delete('attack'); }
    // 最初の島だけ、未完成の足場に気づく導入会話を表示する。
    const nearbyRepair=world.currentCourse===1 && repairPoints.find(point=>!point.repaired && !point.promptShown && Math.abs((player.x+player.w/2)-point.x)<80 && Math.abs((player.y+player.h)-point.y)<100);
    if (nearbyRepair) {
      nearbyRepair.promptShown=true;
      showToast(world.repaired===0?'ピース「あれ？なんで壊れてるんだろう？」':'ピース「あれ？ここも壊れてる。」');
    }
    if (input('repair')) { repair(); keys.delete(bindings.repair); }
    const copiedGlide=player.copiedWispTimer>0 ? .48 : 1;
    const gravity=world.gravityDirection*tuning.gravity*mechanic('gravityMultiplier')*copiedGlide;
    if (!world.floating) player.vy += gravity * dt; player.x += player.vx*(FEATURES.heightLayer && player.y<mechanic('heightLayerY')?mechanic('heightLayerSpeedMultiplier'):1)*dt; player.y += player.vy*dt; player.grounded=false;
    for (const p of surfaces()) { if(!p.active) continue;
      const px=platformX(p), py=platformY(p), surfaceY=py-20;
      const descending=player.vy*world.gravityDirection>=0;
      const isOnTop=world.gravityDirection>0 && player.y+player.h>=surfaceY && player.y+player.h-player.vy*dt<=surfaceY+12;
      const isOnBottom=world.gravityDirection<0 && player.y<=py+p.h && player.y-player.vy*dt>=py+p.h-12;
      if(descending && player.x+player.w>px && player.x<px+p.w && (isOnTop||isOnBottom)) {
        const landingSpeed=Math.abs(player.vy); player.y=world.gravityDirection>0 ? surfaceY-player.h : py+p.h; player.vy=0; player.grounded=true; player.coyote=FEATURES.coyoteJump?.10:0; player.airDashAvailable=abilities.airDash; world.lastGround={x:player.x,y:player.y+player.h+20};
        if (FEATURES.landingDust && wasAirborne && landingSpeed>210) for(let i=0;i<8;i++)world.particles.push({x:player.x+player.w/2,y:surfaceY,vx:(Math.random()-.5)*140,vy:-Math.random()*90,life:.35,color:'#d8f6ff'});
      }
    }
    // 未回収オーブがある限り、ゲートは実体のある壁として行く手を止める。TODO消去中だけは短時間すり抜けられる。
    if (world.todoTimer<=0 && world.completed < shards.length && player.x + player.w > goalGate.x && player.x < goalGate.x + goalGate.w && player.y + player.h > goalGate.y - goalGate.h && player.y < goalGate.y) {
      player.x = goalGate.x - player.w; player.vx = 0;
      if (!world.gateHintShown) { world.gateHintShown=true; showToast(`ピース「あと ${shards.length-world.completed} 個のオーブが必要だよ。集めたオーブがゲートのレンガになるんだ。」`); }
    }
    if (player.y>750 || player.y<-130) { if(FEATURES.fallAssist && world.lastGround)addTemporaryPlatform(world.lastGround.x-50,world.lastGround.y,mechanic('fallAssistWidth'),22,mechanic('fallAssistLife'),'assist'); respawn(); }
    player.invulnerable = Math.max(0, player.invulnerable-dt);
    player.attack = Math.max(0, player.attack-dt); player.groundDash = Math.max(0,player.groundDash-dt); player.dashCooldown = Math.max(0,player.dashCooldown-dt); player.airDash = Math.max(0,player.airDash-dt); player.attackCooldown = Math.max(0, player.attackCooldown-dt); player.copiedWispTimer=Math.max(0,(player.copiedWispTimer||0)-dt);
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const beat=FEATURES.rhythmPatrol ? .55+Math.abs(Math.sin(world.time*mechanic('rhythmPlatformSpeed')+enemy.phase))*.9 : 1;
      enemy.x += enemy.speed * enemy.dir * dt * beat * (world.timeShifted ? mechanic('timeShiftEnemyRate') : 1);
      if (enemy.x < enemy.min || enemy.x > enemy.max) { enemy.dir *= -1; enemy.x = Math.max(enemy.min, Math.min(enemy.max, enemy.x)); }
      // 敵も主人公と同じ重力と足場上面を使う。足場の高さが変わるコースでも沈んだり浮いたりしない。
      enemy.vy=(enemy.vy||0)+tuning.gravity*dt; enemy.y+=enemy.vy*dt;
      for(const p of surfaces()) { const py=platformY(p),surfaceY=py-20,px=platformX(p); if(enemy.vy>=0 && enemy.x+enemy.w>px && enemy.x<px+p.w && enemy.y+enemy.h>=surfaceY && enemy.y+enemy.h-enemy.vy*dt<=surfaceY+14) { enemy.y=surfaceY-enemy.h; enemy.vy=0; break; } }
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
    if(FEATURES.footstepMemory && player.grounded){const cell=Math.round((player.x+player.w/2)/mechanic('footstepCellSize'));if(cell!==player.lastFootstepCell){const revisited=world.footsteps.includes(cell);world.footsteps.push(cell);world.footsteps=world.footsteps.slice(-mechanic('footstepMemoryWindow'));player.lastFootstepCell=cell;if(revisited)addTemporaryPlatform(player.x+player.facing*82,player.y+player.h+26,mechanic('footstepPlatformWidth'),20,mechanic('footstepPlatformLife'),'memory');}}
    if(FEATURES.blueprintWalk) for(const point of repairPoints) if(!point.repaired && Math.abs(player.x-point.x)<85 && player.groundDash>0 && (point.blueprintUntil||0)<world.time){point.blueprintUntil=world.time+mechanic('blueprintLife');addTemporaryPlatform(point.x-92,point.y+18,184,20,mechanic('blueprintLife'),'blueprint');}
    world.history.push({x:player.x,y:player.y,vx:player.vx}); if(world.history.length>150)world.history.shift();
    for(const orb of world.thrownOrbs){orb.x+=orb.vx*dt;orb.y+=orb.vy*dt;orb.vy+=tuning.gravity*mechanic('orbThrowGravityMultiplier')*dt;for(const enemy of enemies)if(enemy.alive&&rect({x:orb.x-10,y:orb.y-10,w:20,h:20},enemy)){purgeEnemy(enemy);orb.life=0;}}
    world.thrownOrbs=world.thrownOrbs.filter(orb=>(orb.life-=dt)>0);
    for(const wave of world.bellWaves) for(const enemy of enemies)if(enemy.alive&&Math.hypot(enemy.x-player.x,enemy.y-player.y)<mechanic('bellWaveRadius')){enemy.dir*=-1;}
    world.bellWaves=world.bellWaves.filter(wave=>(wave.life-=dt)>0);
    const guide=currentGuide(); const guidePlatform=guide && platforms[Math.max(1,Math.floor(platforms.length*.45))];
    if (guide && guidePlatform && !world.guideSeen && Math.abs(player.x-guidePlatform.x)<120) { world.guideSeen=true; showDialogue(`${guide.name}「${guide.ability}。私たちはピースと同じ、未完成の力から生まれた案内人だよ。」`); }
    for (let i=world.checkpointIndex+1;i<checkpoints.length;i++) {
      const point=checkpoints[i];
      if (player.x >= point.x) { world.checkpointIndex=i; point.active=true; world.stats.checkpoints++; saveCheckpoint(); showToast('ピース「チェックポイント更新！」'); updateHud(); }
    }
    if (world.completed === shards.length && rect(player,{x:goalGate.x+36,y:goalGate.y-96,w:56,h:96})) beginGateExit();
    const finalBoundary=world.boundaryPlatforms.at(-1);
    if (world.boundaryMode && finalBoundary && !world.boundarySeen && player.x>finalBoundary.x+finalBoundary.w-24) { world.boundarySeen=true; showDialogue('ピース「ここから先は、まだ白紙だ。……でも、いつか道になる。」'); }
    if (FEATURES.comboMeter) { world.comboTimer=Math.max(0,world.comboTimer-dt); if(!world.comboTimer)world.combo=0; }
    if (FEATURES.courseTips && !world.stageTipShown && world.time>.12) { world.stageTipShown=true; showToast(world.currentCourse===5?'ピース「この縦坑は Air Dash で切り抜けよう！」':'ピース「青い風標が次の足場への道しるべだよ。」'); }
    updateNarrative(dt);
    world.time += dt; const mins=Math.floor(world.time/60).toString().padStart(2,'0'); const secs=(world.time%60).toFixed(2).padStart(5,'0'); $('#runTimer').textContent=`${mins}:${secs}`;
    const lookAhead=FEATURES.cameraLookAhead ? Math.max(-90,Math.min(150,player.vx*.18)) : 0;
    world.camera += ((player.x-260+lookAhead)-world.camera) * Math.min(1,dt*4); world.camera=Math.max(0,world.camera);
    // 一枚背景を非ループで使う。走るほどわずかに早く流れるが、前景より遥かに遅い。
    const backgroundRate = 0.022 + Math.min(0.030, Math.abs(player.vx) / tuning.playerSpeed * 0.030);
    world.backgroundOffset = Math.max(0, Math.min(380, world.backgroundOffset + player.vx * backgroundRate * dt));
    world.attackFlash=Math.max(0,world.attackFlash-dt); world.todoTimer=Math.max(0,world.todoTimer-dt); player.coyote=Math.max(0,player.coyote-dt); player.jumpBuffer=Math.max(0,player.jumpBuffer-dt);
    world.afterimages=world.afterimages.filter(effect=>(effect.life-=dt)>0);
    world.repairWaves=world.repairWaves.filter(effect=>(effect.life-=dt)>0);
    world.temporaryPlatforms=world.temporaryPlatforms.filter(platform=>(platform.life-=dt)>0);
    world.particles = world.particles.filter((p) => (p.life-=dt)>0); world.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=500*dt;});
  }
  function drawImagePart(img, sx,sy,sw,sh, dx,dy,dw,dh) { ctx.drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh); }
  function drawSketchMap() {
    if (!FEATURES.handDrawnMap || !world.mapOpen) return;
    const trail=world.history;
    ctx.save(); ctx.translate(24,122); ctx.fillStyle='#071428eF'; ctx.fillRect(0,0,242,142); ctx.strokeStyle='#92ecff'; ctx.lineWidth=1; ctx.strokeRect(0,0,242,142);
    ctx.fillStyle='#e6fbff'; ctx.font='800 11px sans-serif'; ctx.fillText('SKETCH MAP',12,18); ctx.fillStyle='#8eddf2'; ctx.font='10px sans-serif'; ctx.fillText('歩いた道だけが現れる',12,34);
    if (trail.length>1) {
      const minX=Math.min(...trail.map(point=>point.x)), maxX=Math.max(...trail.map(point=>point.x))+1;
      const minY=Math.min(...trail.map(point=>point.y)), maxY=Math.max(...trail.map(point=>point.y))+1;
      ctx.beginPath(); ctx.strokeStyle='#ffe77b'; ctx.lineWidth=2;
      trail.forEach((point,index)=>{const x=18+(point.x-minX)/(maxX-minX)*206,y=128-(point.y-minY)/(maxY-minY)*74; index?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke();
      const latest=trail.at(-1); const px=18+(latest.x-minX)/(maxX-minX)*206, py=128-(latest.y-minY)/(maxY-minY)*74;
      ctx.fillStyle='#75f1ff';ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();
    } else { ctx.fillStyle='#7898b7'; ctx.fillText('まだ足跡が少ない。歩いて地図を描こう。',12,80); }
    ctx.fillStyle='#b9d9f4';ctx.font='800 9px sans-serif';ctx.fillText('M  閉じる',174,132); ctx.restore();
  }
  function draw() {
    ctx.clearRect(0,0,GAME_CONFIG.width,GAME_CONFIG.height);
    ctx.fillStyle='#071126';ctx.fillRect(0,0,GAME_CONFIG.width,GAME_CONFIG.height);
    // 1650pxへ広げた一枚絵を最大380pxだけ移動。繰り返し描画は行わない。
    ctx.drawImage(images.background,-world.backgroundOffset,0,1650,GAME_CONFIG.height);
    if(FEATURES.windParticles){ctx.save();ctx.globalAlpha=.2;ctx.strokeStyle='#c8f7ff';for(let i=0;i<14;i++){const x=(i*113+performance.now()/38)%1380-50,y=135+(i*71)%390;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+32,y-2);ctx.stroke();}ctx.restore();}
    if (FEATURES.speedStreaks && Math.abs(player.vx)>tuning.playerSpeed*.72) { ctx.save();ctx.globalAlpha=.28;ctx.strokeStyle='#b8f9ff';ctx.lineWidth=2;for(let i=0;i<10;i++){const y=170+i*38+(i%2)*9;const x=player.facing>0?80+i*65:810-i*65;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-player.facing*(55+i*6),y);ctx.stroke();}ctx.restore(); }
    ctx.save(); ctx.translate(-world.camera,0);
    for (const p of surfaces()) if(p.active) {
      // 修復前の基礎は active=false のため、見た目だけでなく当たり判定も存在しない。
      const px=platformX(p),py=platformY(p);
      if(p.temp){ctx.save();ctx.globalAlpha=Math.min(1,p.life/.32);ctx.fillStyle=p.type==='rain'?'#8cefff':p.type==='blueprint'?'#b6a5ff':p.type==='assist'?'#fff2a5':'#8cffdf';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;ctx.fillRect(px,py,p.w,p.h);ctx.restore();}
      else if(images.terrain.complete && images.terrain.naturalWidth) drawImagePart(images.terrain,0,0,images.terrain.naturalWidth,images.terrain.naturalHeight,px,py-18,p.w,p.h+70);
    }
    // 未完成のアーチ。青いオーブレンガが1個ずつ増え、全14個で出口が開く。
    if(FEATURES.goalBeacon && world.completed<shards.length){const pulse=18+Math.sin(performance.now()/210)*7;ctx.save();ctx.translate(goalGate.x+goalGate.w/2,goalGate.y-118);ctx.globalAlpha=.55;ctx.strokeStyle='#8ef6ff';ctx.shadowColor='#5fe7ff';ctx.shadowBlur=14;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,pulse,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-42);ctx.lineTo(0,42);ctx.stroke();ctx.restore();}
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
    if(FEATURES.gateSparkles){ctx.save();ctx.fillStyle=built===shards.length?'#fff1a4':'#65e8ff';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=9;for(let i=0;i<5;i++){const a=performance.now()/270+i*1.7;ctx.fillRect(goalGate.x+goalGate.w/2+Math.cos(a)*62-2,goalGate.y-74+Math.sin(a*1.4)*48,4,4);}ctx.restore();}
    for (let i=1;i<checkpoints.length;i++) { const point=checkpoints[i]; const platform=platforms.find(p=>p.id===point.platformId); if(!platform || !platform.active)continue; const fy=platform.y-84; ctx.save();ctx.translate(point.x,fy);ctx.strokeStyle=point.active?'#ffe77c':'#a8d5ec';ctx.lineWidth=3;ctx.shadowColor=point.active?'#ffc84a':'#3ddfff';ctx.shadowBlur=point.active?14:7;if(FEATURES.checkpointBeam&&point.active){ctx.globalAlpha=.18;ctx.strokeStyle='#fff19b';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(8,15);ctx.lineTo(8,-120);ctx.stroke();ctx.globalAlpha=1;}if(FEATURES.checkpointAura&&point.active){ctx.globalAlpha=.3;ctx.beginPath();ctx.arc(7,15,25+Math.sin(performance.now()/180)*5,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}ctx.beginPath();ctx.moveTo(0,48);ctx.lineTo(0,0);ctx.lineTo(22,8);ctx.lineTo(0,17);ctx.closePath();ctx.stroke();ctx.fillStyle=point.active?'#fff0a4':'#75dcff';ctx.fill();ctx.fillStyle='#e9f8ff';ctx.font='bold 10px sans-serif';ctx.fillText('CP',5,-4);ctx.restore(); }
    // スピードランの進行方向を、浮遊する青い風標でさりげなく示す。
    for (const [x,y] of courseMarkers) { ctx.save(); ctx.translate(x,y); ctx.fillStyle='#aaf6ff'; ctx.shadowColor='#40dfff';ctx.shadowBlur=10; ctx.beginPath();ctx.moveTo(-13,-7);ctx.lineTo(8,-7);ctx.lineTo(8,-14);ctx.lineTo(22,0);ctx.lineTo(8,14);ctx.lineTo(8,7);ctx.lineTo(-13,7);ctx.closePath();ctx.fill();ctx.restore(); }
    const narrative=world.narrative;
    if(narrative && FEATURES.futureWindows && images.futureWindow.complete) ctx.drawImage(images.futureWindow,narrative.window[0]-88,narrative.window[1]-145,176,220);
    if(narrative && FEATURES.memoryFragments && !world.fragmentTaken && images.memoryFragment.complete){ctx.save();ctx.translate(narrative.fragment[0],narrative.fragment[1]+Math.sin(performance.now()/260)*7);ctx.shadowColor='#d6a8ff';ctx.shadowBlur=20;ctx.drawImage(images.memoryFragment,-28,-36,56,72);ctx.restore();}
    if(narrative && FEATURES.restoredResidents && repairPoints.some(point=>point.repaired) && images.restoredResident.complete){const anchor=repairPoints[0];ctx.save();ctx.translate(anchor.x+92,anchor.y-20+Math.sin(performance.now()/280)*4);ctx.shadowColor='#a8fff0';ctx.shadowBlur=17;ctx.drawImage(images.restoredResident,-30,-38,60,72);ctx.restore();}
    if(narrative && FEATURES.dynamicSigns){ctx.save();ctx.fillStyle='#07142ad9';ctx.strokeStyle='#7ccdf4';ctx.lineWidth=2;ctx.fillRect(narrative.window[0]-85,narrative.window[1]+75,170,28);ctx.strokeRect(narrative.window[0]-85,narrative.window[1]+75,170,28);ctx.fillStyle='#e2f7ff';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText(narrative.sign,narrative.window[0],narrative.window[1]+93);ctx.textAlign='start';ctx.restore();}
    if(FEATURES.repairPulse||FEATURES.airDashRing) for(const wave of world.repairWaves){const t=1-wave.life/(wave.max?.38:.7),r=10+(wave.max||115)*t;ctx.save();ctx.globalAlpha=(1-t)*.75;ctx.strokeStyle=wave.color||'#fff59f';ctx.lineWidth=3;ctx.beginPath();ctx.arc(wave.x,wave.y,r,0,Math.PI*2);ctx.stroke();ctx.restore();}
    for (const point of repairPoints) {
      // E修復の対象は露出した非可動の基礎。完成後は対応する建築物として表示する。
      const repairImage=point.repaired ? images.repairAfter : images.repairBefore;
      if(repairImage.complete && repairImage.naturalWidth) ctx.drawImage(repairImage,point.x-120,point.y-86,240,128);
      if(FEATURES.bridgeNames && point.repaired){ctx.save();ctx.fillStyle='#fff0ac';ctx.shadowColor='#ffce5a';ctx.shadowBlur=8;ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(`修復済み：${point.hint}`,point.x,point.y-96);ctx.textAlign='start';ctx.restore();}
      if(!point.repaired) { ctx.save();ctx.translate(point.x,point.y);ctx.strokeStyle='#fff39c';ctx.lineWidth=3;ctx.shadowColor='#f6e767';ctx.shadowBlur=16;ctx.strokeRect(-15,-15,30,30);ctx.fillStyle='#fff6b6';ctx.font='bold 13px sans-serif';ctx.fillText('E 修復',-25,-25);ctx.restore(); }
    }
    if (FEATURES.collectibles) for (const s of shards) if(!s.taken) { const pulse=FEATURES.orbPulse?1+Math.sin(performance.now()/180+s.x)*.12:1;ctx.save(); ctx.translate(s.x,s.y+Math.sin(performance.now()/230+s.x)*7);ctx.scale(pulse,pulse); ctx.shadowColor='#55eaff';ctx.shadowBlur=22; drawImagePart(images.orb,1075,515,190,230,-26,-30,52,64);if(FEATURES.orbPulse){ctx.fillStyle='#d9ffff';for(let i=0;i<3;i++){const a=performance.now()/260+i*2.1;ctx.fillRect(Math.cos(a)*30-2,Math.sin(a)*19-2,4,4);}}ctx.restore(); }
    if(FEATURES.dashAfterimages) for(const echo of world.afterimages){ctx.save();ctx.globalAlpha=Math.min(.45,echo.life*1.5);ctx.fillStyle=echo.color;ctx.fillRect(echo.x-7,echo.y+22,58,58);ctx.restore();}
    if(FEATURES.shadowGuide){const target=shards.find(shard=>!shard.taken);if(target){ctx.save();ctx.globalAlpha=.36;ctx.fillStyle='#11172f';ctx.translate(player.x+player.w/2+(target.x>player.x?mechanic('shadowGuideDistance'):-mechanic('shadowGuideDistance')),player.y+player.h-3);ctx.beginPath();ctx.ellipse(0,0,22,6,0,0,Math.PI*2);ctx.fill();ctx.restore();}}
    if(FEATURES.playerShadow){ctx.save();ctx.globalAlpha=.34;ctx.fillStyle='#020611';ctx.beginPath();ctx.ellipse(player.x+player.w/2,player.y+player.h+5,28,6,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    const spriteState = !player.grounded ? 2 : Math.abs(player.vx)>2 ? 1 : 0;
    ctx.save(); ctx.translate(player.x+player.w/2,player.y); if(player.facing<0)ctx.scale(-1,1);
    const drawPlayerSprite=()=>{ if(player.attack > 0) { const elapsed=.34-player.attack; const attackFrame=elapsed<.11?0:elapsed<.23?1:2; const frames=[[18,70,590,570,-52,-6,104,101],[610,90,830,535,-67,-1,146,96],[1450,90,690,535,-53,-1,112,96]][attackFrame]; drawImagePart(images.attack,...frames); } else if(player.groundDash > 0) { const frame=Math.min(4,Math.floor((.30-player.groundDash)/.06)); const frameWidth=images.groundDash.width/5; drawImagePart(images.groundDash,frame*frameWidth,200,frameWidth,470,-52,0,104,108); } else if(spriteState===1) { const frame=Math.floor(player.walkClock)%5; const frameWidth=images.walk.width/5; drawImagePart(images.walk,frame*frameWidth,100,frameWidth,550,-45,-6,90,108); } else drawImagePart(images.sprites,[60,650,1240][spriteState],145,530,730,-42,0,84,108); };
    if(world.gateExit > 0) { const dissolve=Math.min(1,(.92-world.gateExit)/.58); ctx.save(); ctx.beginPath(); ctx.rect(-80,-18,160,Math.max(0,124*(1-dissolve))); ctx.clip(); drawPlayerSprite(); ctx.restore(); } else drawPlayerSprite(); if(FEATURES.attackArc&&world.attackFlash>0){ctx.globalAlpha=world.attackFlash/.16;ctx.strokeStyle='#bdf9ff';ctx.lineWidth=5;ctx.beginPath();ctx.arc(player.facing*24,34,48,-1.1,1.1);ctx.stroke();}ctx.restore();
    const pieceY = player.y - 34 + Math.sin(performance.now()/220)*7; ctx.save();ctx.translate(player.x-16,pieceY);ctx.globalAlpha=world.gateExit>0?Math.max(0,1-((.92-world.gateExit)/.32)):1;ctx.shadowColor='#b9f8ff';ctx.shadowBlur=16;drawImagePart(images.pieceSlime,130,150,580,620,-22,-22,45,50);ctx.restore();
    const guide=currentGuide(); const guidePlatform=guide && platforms[Math.max(1,Math.floor(platforms.length*.45))];
    if(guide && guidePlatform) { const gy=guidePlatform.y-20-56+Math.sin(performance.now()/230)*6; ctx.save();ctx.translate(guidePlatform.x+guidePlatform.w/2,gy);ctx.shadowColor=guide.color;ctx.shadowBlur=20;drawImagePart(images.pieceSlime,130,150,580,620,-24,-24,48,54);ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=.58;ctx.fillStyle=guide.color;ctx.fillRect(-28,-28,56,62);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#f7fbff';ctx.textAlign='center';ctx.font='bold 12px sans-serif';ctx.fillText(guide.name,0,-35);ctx.textAlign='start';ctx.restore(); }
    for (const enemy of enemies) if (enemy.alive) { const bob = Math.sin(performance.now()/210 + enemy.phase) * 4; const stealth=FEATURES.particleStealth ? Math.min(1,mechanic('particleStealthMinimum')+Math.abs(player.vx)/tuning.playerSpeed) : 1; ctx.save();ctx.globalAlpha=stealth; ctx.translate(enemy.x + enemy.w/2, enemy.y + bob); ctx.shadowColor='#5eeaff'; ctx.shadowBlur=10; if(enemy.dir<0)ctx.scale(-1,1); drawImagePart(images.pieceSlime,1060,260,650,560,-35,-8,70,60); if(FEATURES.enemyEyes){ctx.fillStyle='#ff6cf0';ctx.shadowColor='#ff4ee8';ctx.shadowBlur=8;ctx.fillRect(7,-1,5,5);ctx.fillRect(17,-1,5,5);}ctx.restore();if(FEATURES.enemyDirectionMarkers){ctx.save();ctx.globalAlpha=stealth;ctx.translate(enemy.x+enemy.w/2,enemy.y-10);ctx.fillStyle='#ff90eb';ctx.beginPath();ctx.moveTo(enemy.dir*10,0);ctx.lineTo(-enemy.dir*5,-5);ctx.lineTo(-enemy.dir*5,5);ctx.closePath();ctx.fill();ctx.restore();} }
    for(const orb of world.thrownOrbs){ctx.save();ctx.translate(orb.x,orb.y);ctx.fillStyle='#fff7a6';ctx.shadowColor='#59edff';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(const wave of world.bellWaves){const t=1-wave.life/mechanic('bellWaveLife');ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#fff2a0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(wave.x,wave.y,18+t*110,0,Math.PI*2);ctx.stroke();ctx.restore();}
    if(world.gateExit > 0) { const elapsed=.92-world.gateExit; for(const p of world.gateExitParticles) { const raw=(elapsed-p.delay)/p.duration; if(raw<0) continue; const t=Math.min(1,raw), eased=1-(1-t)*(1-t); const x=p.x+(p.targetX-p.x)*eased+Math.sin(t*Math.PI)*p.spin, y=p.y+(p.targetY-p.y)*eased-Math.sin(t*Math.PI)*18; ctx.save();ctx.globalAlpha=(1-t)*.95;ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=10;ctx.fillRect(x-p.size/2,y-p.size/2,p.size,p.size);ctx.restore(); } }
    if(FEATURES.particles) for(const p of world.particles){ctx.globalAlpha=p.life;ctx.fillStyle=p.color || '#b8faff';ctx.fillRect(p.x-2,p.y-2,5,5);ctx.globalAlpha=1;}
    ctx.restore();
    if (world.boundaryMode) { ctx.save();ctx.fillStyle='#d2c6ff';ctx.font='800 12px monospace';ctx.fillText('UNBUILT WORLD // CHAPTER 2 ?',40,104);ctx.restore(); }
    drawSketchMap();
    if(FEATURES.dangerVignette && (player.y>620 || enemies.some(enemy=>enemy.alive&&Math.hypot(enemy.x-player.x,enemy.y-player.y)<95))){ctx.save();ctx.globalAlpha=player.y>620?.32:.18;ctx.strokeStyle='#ff4f8d';ctx.lineWidth=32;ctx.strokeRect(0,0,GAME_CONFIG.width,GAME_CONFIG.height);ctx.restore();}
    if (FEATURES.orbCompass) { const target=shards.filter(shard=>!shard.taken).sort((a,b)=>Math.abs(a.x-player.x)-Math.abs(b.x-player.x))[0]; if(target){const direction=Math.sign(target.x-player.x)||1;ctx.save();ctx.translate(640,42);ctx.fillStyle='#b9f9ff';ctx.shadowColor='#4ce7ff';ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(direction*18,0);ctx.lineTo(-direction*10,-10);ctx.lineTo(-direction*10,10);ctx.closePath();ctx.fill();ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('NEXT ORB',0,-16);ctx.restore();} }
    if (FEATURES.comboMeter && world.combo>1) { ctx.save();ctx.globalAlpha=Math.min(1,world.comboTimer);ctx.fillStyle='#fff09a';ctx.shadowColor='#ffb744';ctx.shadowBlur=12;ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText(`COMBO ×${world.combo}`,640,92);ctx.restore(); }
    if(FEATURES.groundDashReadyHint && player.grounded && player.dashCooldown<=0 && !world.menuOpen){ctx.save();ctx.globalAlpha=.72;ctx.fillStyle='#c5f7ff';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('SHIFT  DASH READY',1160,54);ctx.restore();}
    if(FEATURES.enemyAbilityCopy && (player.copiedWispTimer>0 || player.copiedWispCharges>0)){ctx.save();ctx.fillStyle='#c8ffdd';ctx.shadowColor='#61f4a1';ctx.shadowBlur=10;ctx.font='800 11px sans-serif';ctx.textAlign='center';ctx.fillText(player.copiedWispTimer>0?`WISP WIND  ${player.copiedWispTimer.toFixed(1)}s`:`WISP WIND  V ×${player.copiedWispCharges}`,640,116);ctx.restore();}
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
