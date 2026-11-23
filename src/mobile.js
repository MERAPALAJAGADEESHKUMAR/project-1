// ─────────────────────────────────────────────
//  DO OR DIE  –  Mobile Controls
// ─────────────────────────────────────────────
'use strict';

const Mobile = (() => {
  let active = false;

  // Joystick state
  let joystickActive = false;
  let joystickBase = {x:0,y:0};
  let joystickCurrent = {x:0,y:0};

  // Camera look (right half of screen drag)
  let lookTouchId = null;
  let lookLast = {x:0,y:0};

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  }

  function init() {
    if(active || !isMobile()) return; // never register touch listeners twice
    active = true;
    document.getElementById('mobileControls').style.display='block';

    const joystickZone = document.getElementById('joystickZone');
    const joystickKnob = document.getElementById('joystickKnob');

    // Joystick
    joystickZone.addEventListener('touchstart', e => {
      e.preventDefault();
      joystickActive = true;
      const t = e.touches[0];
      const rect = joystickZone.getBoundingClientRect();
      joystickBase = {x: rect.left+rect.width/2, y: rect.top+rect.height/2};
    }, {passive:false});

    document.addEventListener('touchmove', e => {
      e.preventDefault();
      for(const t of e.touches) {
        // Check if it's the look touch (right side)
        const halfW = window.innerWidth/2;
        if(t.identifier === lookTouchId) {
          const dx = t.clientX - lookLast.x;
          const dy = t.clientY - lookLast.y;
          Player.mobileLook(dx*1.5, dy*1.5);
          lookLast = {x:t.clientX, y:t.clientY};
        } else if(joystickActive && t.clientX < halfW) {
          joystickCurrent = {x:t.clientX, y:t.clientY};
          const maxR = 50;
          let dx = joystickCurrent.x - joystickBase.x;
          let dy = joystickCurrent.y - joystickBase.y;
          const len = Math.sqrt(dx*dx+dy*dy);
          if(len>maxR){dx=dx/len*maxR;dy=dy/len*maxR;}
          joystickKnob.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          Player.mobileMove(dx/maxR, dy/maxR);
        }
      }
    }, {passive:false});

    document.addEventListener('touchstart', e => {
      for(const t of e.touches) {
        if(t.clientX > window.innerWidth/2 && t.identifier !== lookTouchId) {
          lookTouchId = t.identifier;
          lookLast = {x:t.clientX, y:t.clientY};
        }
      }
    }, {passive:false});

    document.addEventListener('touchend', e => {
      for(const t of e.changedTouches) {
        if(t.identifier === lookTouchId) lookTouchId=null;
        if(t.clientX < window.innerWidth/2) {
          joystickActive=false;
          joystickKnob.style.transform='translate(-50%,-50%)';
          Player.mobileMove(0,0);
        }
      }
    }, {passive:false});

    // Buttons
    document.getElementById('btnFire').addEventListener('touchstart', e=>{
      e.preventDefault(); Player.mobileShoot();
    }, {passive:false});
    document.getElementById('btnJump').addEventListener('touchstart', e=>{
      e.preventDefault(); Player.mobileJump();
    }, {passive:false});
    document.getElementById('btnReload').addEventListener('touchstart', e=>{
      e.preventDefault(); Player.mobileReload();
    }, {passive:false});
    document.getElementById('btnCrouch').addEventListener('touchstart', e=>{
      e.preventDefault(); Player.mobileCrouch();
    }, {passive:false});

    console.log('[Mobile] Controls active');
  }

  return { init, isActive:()=>active };
})();
