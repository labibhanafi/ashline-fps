// ASHLINE — the HUD: every readout the player fights by, drawn as DOM over the canvas.
// Health and armour bottom-left, money and ammunition bottom-right, the round clock and
// score top-centre, killfeed top-right, and a live minimap top-left that shows the yard,
// both sites, the charge and your teammates — never the enemy. update() runs once a
// frame and touches the DOM only where a value actually changed.
import { TIMING } from './config.js';
import { BOXES, SITES, MAP_BOUNDS } from './mapdata.js';
import { BUY_MENU } from './config.js';

const $ = (id) => document.getElementById(id);

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function createHud(state) {
  const el = {
    root: $('hud'),
    cross: $('crosshair'),
    hit: $('hitmarker'),
    hpBar: $('hp-bar'),
    hpText: $('hp-text'),
    armor: $('armor-tag'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    gunName: $('gun-name'),
    money: $('money'),
    timer: $('timer'),
    phase: $('phase-label'),
    scoreJ: $('score-j'),
    scoreW: $('score-w'),
    round: $('round-label'),
    feed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buy: $('buymenu'),
    buyMoney: $('buy-money'),
    buyItems: $('buy-items'),
    board: $('scoreboard'),
    boardBody: $('board-body'),
    progress: $('progress'),
    progressFill: $('progress-fill'),
    progressLabel: $('progress-label'),
    prompt: $('prompt'),
    damage: $('damage-vignette'),
    dmgDir: $('damage-dir'),
    flash: $('flash-overlay'),
    spectate: $('spectate'),
    minimap: $('minimap'),
    grenades: $('grenades'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let lastFeedCount = 0;
  let buyBuilt = false;
  let onBuy = null;

  function buildBuyMenu() {
    el.buyItems.innerHTML = '';
    for (const item of BUY_MENU) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-item';
      row.dataset.id = item.id;
      row.innerHTML = `<kbd>${item.key}</kbd><span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span>`;
      row.addEventListener('click', () => {
        if (onBuy) onBuy(item);
        refreshBuyMenu();
      });
      el.buyItems.appendChild(row);
    }
    buyBuilt = true;
  }

  function refreshBuyMenu() {
    if (!buyBuilt) buildBuyMenu();
    const p = state.player;
    el.buyMoney.textContent = `$${p.money}`;
    for (const row of el.buyItems.children) {
      const item = BUY_MENU.find((i) => i.id === row.dataset.id);
      let owned = false;
      if (item.kind === 'weapon') owned = !!(p.guns.primary && p.guns.primary.id === item.id);
      if (item.kind === 'armor') owned = p.armor;
      if (item.kind === 'grenade') owned = p.grenades[item.id] > 0;
      row.classList.toggle('owned', owned);
      row.classList.toggle('poor', !owned && p.money < item.price);
    }
  }

  function drawMinimap() {
    const c = el.minimap;
    const sx = c.width / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX);
    const sz = c.height / (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ);
    const px = (x) => (x - MAP_BOUNDS.minX) * sx;
    const pz = (z) => (z - MAP_BOUNDS.minZ) * sz;
    mapCtx.fillStyle = '#20262e';
    mapCtx.fillRect(0, 0, c.width, c.height);
    mapCtx.fillStyle = '#454c54';
    for (const b of BOXES) {
      if (b.w > 30 || b.d > 30) continue; // skip the perimeter
      mapCtx.fillRect(px(b.minX), pz(b.minZ), b.w * sx, b.d * sz);
    }
    for (const s of SITES) {
      mapCtx.strokeStyle = s.letter === 'A' ? '#f2a33c' : '#35c4b5';
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.arc(px(s.x), pz(s.z), s.r * sx, 0, Math.PI * 2);
      mapCtx.stroke();
      mapCtx.fillStyle = mapCtx.strokeStyle;
      mapCtx.font = 'bold 10px system-ui';
      mapCtx.textAlign = 'center';
      mapCtx.fillText(s.letter, px(s.x), pz(s.z) + 3);
    }
    const ch = state.charge;
    if (ch.state === 'planted' || ch.state === 'dropped' || ch.state === 'carried') {
      const cx = ch.state === 'carried' && ch.carrier ? ch.carrier.pos.x : ch.pos.x;
      const cz = ch.state === 'carried' && ch.carrier ? ch.carrier.pos.z : ch.pos.z;
      mapCtx.fillStyle = ch.state === 'planted' && Math.sin(state.time * 6) > 0 ? '#ff4444' : '#ffd75e';
      mapCtx.save();
      mapCtx.translate(px(cx), pz(cz));
      mapCtx.rotate(Math.PI / 4);
      mapCtx.fillRect(-3, -3, 6, 6);
      mapCtx.restore();
    }
    for (const f of state.combatants) {
      if (!f.alive || f.team !== state.playerTeam) continue;
      mapCtx.fillStyle = f.isPlayer ? '#ffffff' : state.playerTeam === 'jackal' ? '#f2a33c' : '#35c4b5';
      mapCtx.beginPath();
      mapCtx.arc(px(f.pos.x), pz(f.pos.z), f.isPlayer ? 3.4 : 2.6, 0, Math.PI * 2);
      mapCtx.fill();
      if (f.isPlayer) {
        mapCtx.strokeStyle = '#ffffff';
        mapCtx.beginPath();
        mapCtx.moveTo(px(f.pos.x), pz(f.pos.z));
        mapCtx.lineTo(px(f.pos.x) - Math.sin(f.yaw) * 8, pz(f.pos.z) - Math.cos(f.yaw) * 8);
        mapCtx.stroke();
      }
    }
  }

  return {
    setBuyHandler(fn) {
      onBuy = fn;
    },
    refreshBuyMenu,
    showBanner(title, sub) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.hidden = false;
    },
    hideBanner() {
      el.banner.hidden = true;
    },
    update(dt, opts) {
      const showBoard = !!(opts && opts.board);
      const p = state.player;
      const inGame = state.phase !== 'menu';
      el.root.style.display = inGame ? 'block' : 'none';
      if (!inGame) return;
      // Health, armour, money.
      el.hpBar.style.width = `${Math.max(0, p.hp)}%`;
      el.hpBar.style.background = p.hp > 50 ? '#7ec850' : p.hp > 25 ? '#f2a33c' : '#e5484d';
      el.hpText.textContent = `${Math.ceil(p.hp)}`;
      el.armor.style.visibility = p.armor ? 'visible' : 'hidden';
      el.money.textContent = `$${p.money}`;
      // Weapon and ammunition.
      if (p.gun) {
        el.ammoMag.textContent = p.gun.reloading ? '——' : `${p.gun.mag}`;
        el.ammoReserve.textContent = `/ ${p.gun.reserve}`;
        el.gunName.textContent = p.gun.def.name + (p.gun.reloading ? ' · RELOADING' : '');
        el.ammoMag.style.color = p.gun.mag === 0 ? '#e5484d' : '';
      }
      const nades = [];
      for (const kind of ['frag', 'flash', 'smoke']) {
        if (p.grenades[kind] > 0) nades.push(`${kind === p.grenadeSel ? '▸' : ''}${kind} ×${p.grenades[kind]}`);
      }
      el.grenades.textContent = nades.join('  ');
      // Clock, score, round.
      const planted = state.charge.state === 'planted';
      el.timer.textContent = planted ? fmtTime(state.charge.timer) : fmtTime(state.phaseTimer);
      el.timer.style.color = planted ? '#e5484d' : '';
      el.phase.textContent = state.phase === 'buy'
        ? `BUY TIME — ${state.attackTeam === state.playerTeam ? 'attack' : 'defend'} ${state.attackSite ? state.attackSite.name : ''}`
        : planted ? `CHARGE PLANTED — SITE ${state.charge.site.letter}` : state.phase === 'over' ? 'ROUND OVER' : 'LIVE';
      el.scoreJ.textContent = `${state.scores.jackal}`;
      el.scoreW.textContent = `${state.scores.warden}`;
      el.round.textContent = `ROUND ${Math.max(1, state.round)} / ${TIMING.maxRounds} · ${state.playerTeam === 'jackal' ? 'JACKALS' : 'WARDENS'} (you)`;
      // Crosshair spread follows the gun's true cone.
      if (p.gun) {
        const spreadPx = 6 + (p.gun.def.spreadBase + p.gun.bloom) * 900 + Math.min(26, p.speedNow * 5);
        el.cross.style.setProperty('--sp', `${spreadPx.toFixed(0)}px`);
      }
      el.cross.style.opacity = p.alive && state.phase === 'live' ? '1' : '0.25';
      const sinceHit = state.time - state.hitmark;
      el.hit.style.opacity = sinceHit < 0.14 ? '1' : '0';
      el.hit.style.color = state.hitmarkKill ? '#e5484d' : '#ece7db';
      // Killfeed: last five, fading after five seconds.
      if (state.killfeed.length !== lastFeedCount) {
        lastFeedCount = state.killfeed.length;
        el.feed.innerHTML = state.killfeed.slice(-5).map((k) => `<div>${k.text}</div>`).join('');
      }
      // Buy menu and scoreboard.
      const showBuy = state.phase === 'buy' && p.alive && (!opts || opts.buy !== false);
      el.buy.hidden = !showBuy;
      if (showBuy) refreshBuyMenu();
      el.board.hidden = !showBoard;
      if (showBoard) {
        const rows = state.roundLog.map((r) => `<div>${r}</div>`).join('');
        el.boardBody.innerHTML = `<div class="board-score">JACKALS ${state.scores.jackal} — ${state.scores.warden} WARDENS</div>`
          + `<div class="board-stats">You: ${state.playerStats.kills} kills · ${state.playerStats.deaths} deaths · $${p.money}</div>`
          + rows;
      }
      // Plant / defuse progress and prompts.
      const ch = state.charge;
      const acting = ch.actor === p && (ch.state === 'carried' || ch.state === 'planted');
      el.progress.hidden = !acting;
      if (acting) {
        el.progressFill.style.width = `${Math.floor(ch.progress * 100)}%`;
        el.progressLabel.textContent = ch.state === 'carried' ? 'PLANTING THE CHARGE…' : 'DEFUSING…';
      }
      let prompt = '';
      if (state.phase === 'live' && p.alive) {
        if (ch.carrier === p) {
          prompt = 'You carry the charge — reach a site and hold E to plant';
        } else if (ch.state === 'planted' && p.team === state.defendTeam
          && Math.hypot(p.pos.x - ch.pos.x, p.pos.z - ch.pos.z) < 2.2) {
          prompt = 'Hold E to defuse the charge';
        } else if (ch.state === 'dropped' && p.team === state.attackTeam
          && Math.hypot(p.pos.x - ch.pos.x, p.pos.z - ch.pos.z) < 2.2) {
          prompt = 'Walk over the charge to pick it up';
        }
      }
      el.prompt.textContent = prompt;
      // Damage and flash overlays, spectate note.
      const hurtAgo = state.time - p.lastHurtAt;
      const lowHp = p.hp <= 30 && p.alive ? 0.24 + Math.sin(state.time * 4) * 0.06 : 0;
      el.damage.style.opacity = `${Math.max(lowHp, hurtAgo < 0.45 ? 0.42 : 0)}`;
      if (state.damageFrom && state.time - state.damageFrom.at < 1.1 && p.alive) {
        const dx = state.damageFrom.x - p.pos.x;
        const dz = state.damageFrom.z - p.pos.z;
        const bearing = Math.atan2(-dx, -dz);
        const rel = bearing - p.yaw;
        el.dmgDir.style.opacity = '1';
        el.dmgDir.style.transform = `translate(-50%,-50%) rotate(${(-rel).toFixed(3)}rad)`;
      } else {
        el.dmgDir.style.opacity = '0';
      }
      const blindLeft = Math.max(0, p.blindUntil - state.time);
      el.flash.style.opacity = blindLeft > 0 ? `${Math.min(0.97, blindLeft / 1.2)}` : '0';
      el.spectate.hidden = p.alive || state.phase !== 'live';
      if (!p.alive && state.spectate) el.spectate.textContent = `You are down — spectating ${state.spectate.name}`;
      drawMinimap();
    },
  };
}
