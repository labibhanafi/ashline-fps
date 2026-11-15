// ASHLINE — the match: two halves of six rounds, first to seven. This module owns the
// round lifecycle (buy -> live -> planted -> over), the money, the buy menu's rules, and
// the charge: dropped at the attacker spawn, carried to a site, planted, and then either
// detonated or defused. Kills are reported here by weapons.js through state.onKill.
import { TIMING, ECONOMY, GRENADES } from './config.js';
import { SPAWNS, SITES, siteAt } from './mapdata.js';
import { enemyOf, aliveCount } from './state.js';
import { createPlayerCombatant } from './player.js';
import { createBot, buildBotMesh, botBuy, assignRoles, BOT_NAMES } from './bots.js';
import { giveWeapon } from './weapons.js';
import { explosionDamage } from './combat.js';
import { WEAPONS } from './config.js';

let FX = null;
let AUDIO = null;
let CHARGE = null;

export function initRounds(fx, audio, chargeVisual) {
  FX = fx;
  AUDIO = audio;
  CHARGE = chargeVisual;
}

// Build the ten fighters once: the player, four teammates, five opponents.
export function createMatch(state, scene) {
  const player = createPlayerCombatant();
  player.money = ECONOMY.startMoney;
  giveWeapon(player, 'sidearm');
  state.player = player;
  state.combatants = [player];
  let id = 1;
  for (const team of ['jackal', 'warden']) {
    const names = BOT_NAMES[team];
    const count = team === player.team ? 4 : 5; // five a side, the player included
    for (let i = 0; i < count; i += 1) {
      const bot = createBot(id, names[i % names.length], team);
      bot.homeTeam = team;
      id += 1;
      bot.money = ECONOMY.startMoney;
      giveWeapon(bot, 'sidearm');
      bot.mesh = buildBotMesh(team);
      scene.add(bot.mesh);
      state.combatants.push(bot);
    }
  }
  state.onKill = onKill;
}

function faceCenterYaw(x, z) {
  return Math.atan2(-(0 - x), -(0 - z));
}

function resetFighter(state, c, sx, sz) {
  c.alive = true;
  c.hp = 100;
  c.pos.set(sx, 0, sz);
  c.vel.set(0, 0, 0);
  c.yaw = faceCenterYaw(sx, sz);
  c.pitch = 0;
  c.punch = 0;
  c.crouch = false;
  c.blindUntil = 0;
  c.speedNow = 0;
  if (!c.guns.sidearm) giveWeapon(c, 'sidearm');
  c.gun = c.guns.primary || c.guns.sidearm;
  if (c.gun) {
    c.gun.mag = c.gun.def.mag;
    c.gun.reserve = c.gun.def.reserve;
    c.gun.reloading = false;
  }
  if (c.brain) {
    c.brain.target = null;
    c.brain.lastSeenAt = -9;
    c.brain.lastSeenPos = null;
    c.brain.path = [];
    c.brain.goal = null;
    c.brain.baseYaw = undefined;
  }
}

export function startRound(state) {
  state.round += 1;
  state.half = state.round <= TIMING.halfRound ? 1 : 2;
  state.attackTeam = state.half === 1 ? 'jackal' : 'warden';
  state.defendTeam = enemyOf(state.attackTeam);
  state.playerTeam = state.player.team;
  for (const team of ['jackal', 'warden']) {
    const members = state.combatants.filter((c) => c.team === team);
    members.forEach((c, i) => {
      const [sx, sz] = SPAWNS[team][i % SPAWNS[team].length];
      resetFighter(state, c, sx, sz);
    });
  }
  for (const c of state.combatants) if (!c.isPlayer) botBuy(state, c);
  const [ax, az] = SPAWNS[state.attackTeam][0];
  state.charge.state = 'dropped';
  state.charge.carrier = null;
  state.charge.site = null;
  state.charge.pos = { x: ax + 2.5, y: 0, z: az - 2.5 };
  state.charge.progress = 0;
  state.charge.actor = null;
  state.charge.timer = 0;
  state.noises.length = 0;
  state.smokes.length = 0;
  state.flashes.length = 0;
  for (const g of state.grenadeList) if (g.mesh) FX.scene.remove(g.mesh);
  state.grenadeList.length = 0;
  assignRoles(state);
  state.phase = 'buy';
  state.phaseTimer = TIMING.buySeconds;
  state.spectate = null;
}

function pay(state, team, amount) {
  for (const c of state.combatants) {
    if (c.team === team) c.money = Math.min(ECONOMY.maxMoney, c.money + amount);
  }
}

export function endRound(state, winner, reason, winPay) {
  if (state.phase === 'over' || state.phase === 'matchover') return;
  state.scores[winner] += 1;
  state.lastRound = { winner, reason };
  state.roundLog.push(`R${state.round}: ${winner === 'jackal' ? 'Jackals' : 'Wardens'} — ${reason}`);
  pay(state, winner, winPay);
  pay(state, enemyOf(winner), ECONOMY.lossBonus);
  state.phase = 'over';
  state.phaseTimer = TIMING.endSeconds;
  if (AUDIO) AUDIO.roundEnd(winner === state.playerTeam);
}

function matchDecided(state) {
  return state.scores.jackal >= TIMING.roundsToWin
    || state.scores.warden >= TIMING.roundsToWin
    || state.round >= TIMING.maxRounds;
}

export function onKill(state, victim, attacker, zone, def) {
  const via = def ? def.name : 'Shard Grenade';
  const head = zone === 'head' ? ' (headshot)' : '';
  state.killfeed.push({ text: `${attacker.name} ▸ ${via} ▸ ${victim.name}${head}`, at: state.time });
  if (attacker.team !== victim.team) {
    attacker.money = Math.min(ECONOMY.maxMoney, attacker.money + ECONOMY.killReward);
  }
  if (attacker.isPlayer) state.playerStats.kills += 1;
  if (victim.isPlayer) state.playerStats.deaths += 1;
  victim.guns.primary = null; // a death costs the primary; the sidearm is forever
  victim.armor = false;
  if (state.charge.carrier === victim) {
    state.charge.state = 'dropped';
    state.charge.carrier = null;
    state.charge.pos = { x: victim.pos.x, y: 0, z: victim.pos.z };
    state.charge.progress = 0;
    state.charge.actor = null;
  }
  if (victim.isPlayer) {
    const mate = state.combatants.find((c) => !c.isPlayer && c.team === victim.team && c.alive);
    state.spectate = mate || null;
  }
  if (state.phase !== 'live') return;
  const planted = state.charge.state === 'planted';
  if (aliveCount(state, victim.team) === 0) {
    if (planted && victim.team === state.defendTeam) {
      endRound(state, state.attackTeam, 'Defenders eliminated', ECONOMY.winElimination);
    } else if (!planted) {
      endRound(state, attacker.team === victim.team ? enemyOf(victim.team) : attacker.team, 'Elimination', ECONOMY.winElimination);
    }
    // Planted and the attackers are wiped: the charge still ticks. Play on.
  }
}

// The buy menu's rules for the player. Returns true when the purchase went through.
const GRENADE_CAPS = { frag: 2, flash: 2, smoke: 1 };
export function buyItem(state, item) {
  const p = state.player;
  if (!p.alive || state.phase !== 'buy') return false;
  if (p.money < item.price) return false;
  if (item.kind === 'weapon') {
    p.money -= item.price;
    giveWeapon(p, item.id);
  } else if (item.kind === 'armor') {
    if (p.armor) return false;
    p.money -= item.price;
    p.armor = true;
  } else if (item.kind === 'grenade') {
    if (p.grenades[item.id] >= GRENADE_CAPS[item.id]) return false;
    p.money -= item.price;
    p.grenades[item.id] += 1;
  }
  return true;
}

function actorWants(state, c) {
  if (c.isPlayer) return state.playerInteracting;
  return state.time - c.brain.lastSeenAt > 1.1; // a bot works the charge when it feels safe
}

function stepCharge(state, dt) {
  const ch = state.charge;
  if (ch.state === 'dropped') {
    for (const c of state.combatants) {
      if (c.alive && c.team === state.attackTeam && Math.hypot(c.pos.x - ch.pos.x, c.pos.z - ch.pos.z) < 1.4) {
        ch.state = 'carried';
        ch.carrier = c;
        if (AUDIO && c.isPlayer) AUDIO.interact();
        break;
      }
    }
    return;
  }
  if (ch.state === 'carried') {
    const carrier = ch.carrier;
    if (!carrier || !carrier.alive) return;
    ch.pos = { x: carrier.pos.x, y: 0, z: carrier.pos.z };
    const site = siteAt(carrier.pos.x, carrier.pos.z);
    if (site && actorWants(state, carrier)) {
      ch.progress += dt / TIMING.plantSeconds;
      ch.actor = carrier;
      if (ch.progress >= 1) {
        ch.state = 'planted';
        ch.site = site;
        ch.timer = TIMING.detonateSeconds;
        ch.progress = 0;
        ch.actor = null;
        carrier.money = Math.min(ECONOMY.maxMoney, carrier.money + ECONOMY.plantPersonalBonus);
        pay(state, state.attackTeam, ECONOMY.plantTeamBonus);
        state.killfeed.push({ text: `The charge is planted at ${site.name} (${site.letter})`, at: state.time });
        if (AUDIO) AUDIO.beep(true);
      }
    } else {
      ch.progress = Math.max(0, ch.progress - dt * 1.5);
      ch.actor = null;
    }
    return;
  }
  if (ch.state === 'planted') {
    ch.timer -= dt;
    if (AUDIO && ch.timer > 0) {
      const interval = ch.timer < 10 ? 0.5 : 1;
      if (Math.floor(ch.timer / interval) !== Math.floor((ch.timer + dt) / interval)) AUDIO.beep(ch.timer < 5);
    }
    let defuser = null;
    for (const c of state.combatants) {
      if (c.alive && c.team === state.defendTeam && Math.hypot(c.pos.x - ch.pos.x, c.pos.z - ch.pos.z) < 1.7 && actorWants(state, c)) {
        defuser = c;
        break;
      }
    }
    if (defuser) {
      ch.progress += dt / TIMING.defuseSeconds;
      ch.actor = defuser;
      if (ch.progress >= 1) {
        ch.state = 'defused';
        if (AUDIO) AUDIO.interact();
        endRound(state, state.defendTeam, 'Charge defused', ECONOMY.winObjective);
        return;
      }
    } else {
      ch.actor = null;
    }
    if (ch.timer <= 0) {
      ch.state = 'detonated';
      if (FX) FX.explosion(ch.pos.x, 0.6, ch.pos.z);
      if (AUDIO) AUDIO.explosion(ch.pos.x, ch.pos.z);
      state.shake = 1;
      explosionDamage(state, ch.pos.x, 0.8, ch.pos.z, 9, 120, null, WEAPONS.rifle);
      endRound(state, state.attackTeam, 'Charge detonated', ECONOMY.winObjective);
    }
  }
}

export function stepRounds(state, dt) {
  if (state.phase === 'buy') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.phase = 'live';
      state.phaseTimer = TIMING.roundSeconds;
    }
    return;
  }
  if (state.phase === 'live') {
    stepCharge(state, dt);
    if (state.phase !== 'live') return;
    if (state.charge.state !== 'planted') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        endRound(state, state.defendTeam, 'Time expired', ECONOMY.winTimeout);
      }
    }
    return;
  }
  if (state.phase === 'over') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      if (matchDecided(state)) {
        state.phase = 'matchover';
        state.winner = state.scores.jackal === state.scores.warden
          ? 'draw'
          : state.scores.jackal > state.scores.warden ? 'jackal' : 'warden';
      } else {
        // The half-time swap: after round 6 the player changes sides.
        if (state.round === TIMING.halfRound) {
          state.player.team = state.player.team === 'jackal' ? 'warden' : 'jackal';
          swapBotTeams(state);
        }
        startRound(state);
      }
    }
  }
}

// At the half every bot trades sides, so the player keeps a four-bot squad and simply
// defends where he attacked. Meshes are rebuilt in the new colours and names follow.
function swapBotTeams(state) {
  const counts = { jackal: 0, warden: 0 };
  for (const c of state.combatants) {
    if (c.isPlayer) continue;
    c.team = enemyOf(c.team);
    c.name = BOT_NAMES[c.team][counts[c.team] % BOT_NAMES[c.team].length];
    counts[c.team] += 1;
    if (c.mesh && FX) {
      FX.scene.remove(c.mesh);
      c.mesh = buildBotMesh(c.team);
      FX.scene.add(c.mesh);
    }
  }
}

// Play-again: wipe the match back to kickoff — scores, money, loadouts, and every bot
// restored to its home team with its home colours and name.
export function resetMatchData(state) {
  state.scores.jackal = 0;
  state.scores.warden = 0;
  state.playerStats.kills = 0;
  state.playerStats.deaths = 0;
  state.killfeed.length = 0;
  state.roundLog.length = 0;
  state.lastRound = null;
  state.winner = null;
  state.player.team = 'jackal';
  const counts = { jackal: 0, warden: 0 };
  for (const c of state.combatants) {
    if (!c.isPlayer) {
      c.team = c.homeTeam || c.team;
      c.name = BOT_NAMES[c.team][counts[c.team] % BOT_NAMES[c.team].length];
      counts[c.team] += 1;
      if (c.mesh && FX) {
        FX.scene.remove(c.mesh);
        c.mesh = buildBotMesh(c.team);
        FX.scene.add(c.mesh);
      }
    }
    c.money = ECONOMY.startMoney;
    c.guns = { primary: null, sidearm: null };
    giveWeapon(c, 'sidearm');
    c.armor = false;
    c.grenades = { frag: 0, flash: 0, smoke: 0 };
    c.grenadeSel = 'frag';
  }
}

// Where the charge mesh sits this frame: on the carrier's back, or on the ground.
export function syncCharge(state) {
  if (!CHARGE) return;
  const ch = state.charge;
  const g = CHARGE.group;
  const inPlay = state.phase === 'buy' || state.phase === 'live' || state.phase === 'over';
  g.visible = inPlay && ch.state !== 'detonated' && ch.state !== 'defused';
  if (!g.visible) return;
  if (ch.state === 'carried' && ch.carrier) {
    const c = ch.carrier;
    g.position.set(c.pos.x + Math.sin(c.yaw) * 0.34, 1.18, c.pos.z + Math.cos(c.yaw) * 0.34);
    g.rotation.y = c.yaw;
  } else {
    g.position.set(ch.pos.x, 0.2, ch.pos.z);
    g.rotation.y = 0.6;
  }
  CHARGE.setBlink(state.time, ch.state === 'planted');
}

export { SITES };
