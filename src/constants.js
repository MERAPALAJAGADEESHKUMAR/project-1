// ─────────────────────────────────────────────
//  DO OR DIE  –  Constants & shared config
// ─────────────────────────────────────────────
'use strict';

const C = {
  // Map
  MAP_SIZE: 500,
  WATER_LEVEL: -1,

  // Player
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.4,
  PLAYER_SPEED: 7,
  SPRINT_MULT: 1.7,
  CROUCH_MULT: 0.5,
  JUMP_FORCE: 10,
  GRAVITY: -22,
  MAX_HEALTH: 100,
  MAX_ARMOR: 100,

  // Camera
  CAM_DIST: 4,
  CAM_HEIGHT: 1.4,
  CAM_AIM_DIST: 2,

  // Bots
  BOT_COUNT: 24,
  BOT_HEIGHT: 1.8,

  // Zone stages (seconds for each phase)
  ZONE_STAGES: [
    { duration: 120, waitTime: 60,  startR: 240, endR: 160, damage: 2  },
    { duration: 90,  waitTime: 45,  startR: 160, endR: 90,  damage: 4  },
    { duration: 60,  waitTime: 30,  startR: 90,  endR: 40,  damage: 6  },
    { duration: 45,  waitTime: 20,  startR: 40,  endR: 10,  damage: 10 },
  ],

  // Weapons (name, damage, fireRate/s, recoil, range, ammoMax, reserveMax, type)
  WEAPONS: {
    pistol: {
      name:'Pistol', damage:28, fireRate:2.5, recoil:0.04, range:60,
      ammoMax:12, reserveMax:60, type:'semi', spread:0.03,
      color:0x888888, barrelLen:0.5
    },
    smg: {
      name:'SMG', damage:18, fireRate:12, recoil:0.025, range:50,
      ammoMax:30, reserveMax:120, type:'auto', spread:0.05,
      color:0x556677, barrelLen:0.6
    },
    ar: {
      name:'Assault Rifle', damage:30, fireRate:8, recoil:0.035, range:120,
      ammoMax:30, reserveMax:90, type:'auto', spread:0.025,
      color:0x445522, barrelLen:0.9
    },
    shotgun: {
      name:'Shotgun', damage:20, fireRate:0.8, recoil:0.12, range:30,
      ammoMax:6, reserveMax:30, type:'semi', spread:0.18, pellets:8,
      color:0x775533, barrelLen:0.8
    },
    sniper: {
      name:'Sniper Rifle', damage:95, fireRate:0.5, recoil:0.15, range:300,
      ammoMax:5, reserveMax:20, type:'bolt', spread:0.005,
      color:0x334455, barrelLen:1.4
    },
  },

  // Loot
  LOOT_COUNT: 80,
  MEDKIT_HEAL: 50,
  ARMOR_AMOUNT: 50,

  // Parachute
  PARA_PLANE_HEIGHT: 200,
  PARA_PLANE_SPEED: 60,
  PARA_FALL_SPEED: 60,
  PARA_OPEN_SPEED: 12,

  // Minimap
  MINIMAP_SIZE: 180,
};
