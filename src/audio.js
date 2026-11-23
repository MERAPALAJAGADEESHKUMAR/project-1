// ─────────────────────────────────────────────
//  DO OR DIE  –  Audio (Web Audio API)
// ─────────────────────────────────────────────
'use strict';

const Audio = (() => {
  let ctx = null;
  let masterGain, sfxGain, musicGain;
  let ambientOsc = null;
  let volumes = { music: 0.4, sfx: 0.8 };

  function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain(); masterGain.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = volumes.sfx; sfxGain.connect(masterGain);
      musicGain = ctx.createGain(); musicGain.gain.value = volumes.music; musicGain.connect(masterGain);
    } catch(e) { console.warn('Audio init failed', e); }
  }

  function resume() { if(ctx && ctx.state === 'suspended') ctx.resume(); }

  function noise(duration, freq, type='sine', vol=0.3, decay=true) {
    if(!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if(decay) osc.frequency.exponentialRampToValueAtTime(freq*0.3, ctx.currentTime + duration);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    if(decay) gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(sfxGain);
    osc.start(); osc.stop(ctx.currentTime + duration);
  }

  function bufferNoise(duration, vol=0.3) {
    if(!ctx) return;
    const bufSize = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0; i<bufSize; i++) data[i] = (Math.random()*2-1);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 2000; filter.Q.value = 0.5;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.buffer = buf; src.connect(filter); filter.connect(gain); gain.connect(sfxGain);
    src.start(); src.stop(ctx.currentTime + duration);
  }

  const sounds = {
    shoot_pistol:  () => { bufferNoise(0.08, 0.5); noise(0.1, 800,'square',0.2); },
    shoot_smg:     () => { bufferNoise(0.05, 0.4); noise(0.08,1200,'square',0.15); },
    shoot_ar:      () => { bufferNoise(0.09, 0.6); noise(0.12, 600,'square',0.25); },
    shoot_shotgun: () => { bufferNoise(0.18, 0.8); noise(0.2, 200,'sawtooth',0.3); },
    shoot_sniper:  () => { bufferNoise(0.25, 0.9); noise(0.3, 400,'sawtooth',0.4); },
    reload:        () => { noise(0.1,300,'square',0.15,false); setTimeout(()=>noise(0.05,500,'square',0.1,false), 400); },
    pickup:        () => noise(0.15, 880,'sine',0.2,false),
    heal:          () => { noise(0.2,440,'sine',0.2,false); setTimeout(()=>noise(0.2,660,'sine',0.15,false),150); },
    footstep:      () => bufferNoise(0.05, 0.08),
    jump:          () => noise(0.15, 300,'sine',0.2),
    land:          () => bufferNoise(0.1, 0.25),
    hit_self:      () => { bufferNoise(0.05,0.3); noise(0.08,150,'sawtooth',0.2); },
    zone_damage:   () => noise(0.1, 100,'sawtooth',0.2),
    bot_die:       () => { bufferNoise(0.1, 0.3); noise(0.15,200,'square',0.15); },
    parachute_open:() => { noise(0.5,80,'sine',0.3,false); bufferNoise(0.5,0.1); },
    ui_click:      () => noise(0.05,1000,'square',0.1,false),
  };

  function play(name) {
    resume();
    if(sounds[name]) sounds[name]();
  }

  function startAmbient() {
    if(!ctx || ambientOsc) return;
    // Wind ambient
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 300;
    osc.type = 'sawtooth'; osc.frequency.value = 60;
    gain.gain.value = 0.04;
    osc.connect(filter); filter.connect(gain); gain.connect(musicGain);
    osc.start();
    ambientOsc = osc;
  }

  function stopAmbient() {
    if(ambientOsc) { ambientOsc.stop(); ambientOsc = null; }
  }

  function setVolume(type, val) {
    volumes[type] = val;
    if(type === 'sfx' && sfxGain) sfxGain.gain.value = val;
    if(type === 'music' && musicGain) musicGain.gain.value = val;
  }

  return { init, play, startAmbient, stopAmbient, setVolume, resume };
})();
