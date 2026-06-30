// Gestione dell'HUD e delle schermate (menu, pausa, game over).

import { WEAPONS } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), menu: $('menu'), gameover: $('gameover'), pause: $('pause'), options: $('options'),
      btnOptions: $('btn-options'),
      hpFill: $('hp-fill'), hpGhost: $('hp-ghost'), hpText: $('hp-text'),
      stamina: $('stamina'),
      ammo: $('ammo'), weaponName: $('weapon-name'), reloadHint: $('reload-hint'),
      waveNum: $('wave-num'), waveName: $('wave-name'), enemiesLeft: $('enemies-left'),
      score: $('score'), combo: $('combo'), souls: $('souls'), doorPrompt: $('door-prompt'),
      bossWrap: $('boss-wrap'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      countdown: $('countdown'),
      toast: $('pickup-toast'),
      crosshair: $('crosshair'),
      damageFlash: $('damage-flash'), lowhp: $('lowhp'),
      loadingWrap: $('loading-wrap'), loadingFill: $('loading-fill'), loadingLabel: $('loading-label'), tutorial: $('tutorial'),
      btnPlay: $('btn-play'), btnRestart: $('btn-restart'), btnResume: $('btn-resume'), btnQuit: $('btn-quit'),
      menuRecord: $('menu-record'),
    };
    this._bannerT = null;
    this._toastT = null;
    this._ghostT = null;
  }

  loading(frac, label) {
    this.el.loadingFill.style.width = `${Math.round(frac * 100)}%`;
    if (label) this.el.loadingLabel.textContent = label;
  }

  readyToPlay(best) {
    this.el.loadingWrap.style.display = 'none';
    this.el.loadingLabel.style.display = 'none';
    this.el.tutorial.style.display = 'none'; // il tutorial esiste solo durante il caricamento
    this.el.btnPlay.style.display = '';
    this.el.btnOptions.style.display = ''; // la rondella compare solo a risorse caricate
    this.el.menuRecord.textContent = best > 0 ? `RECORD: ${best.toLocaleString('it-IT')}` : '';
  }

  showScreen(name) {
    for (const s of ['menu', 'gameover', 'pause', 'options']) {
      this.el[s].classList.toggle('hidden', s !== name);
    }
    this.el.hud.classList.toggle('visible', name === null);
    this.el.crosshair.classList.toggle('visible', name === null);
    document.body.style.cursor = name === null ? 'none' : 'default';
  }

  crosshairPos(x, y) {
    this.el.crosshair.style.left = `${x}px`;
    this.el.crosshair.style.top = `${y}px`;
  }

  /** Diametro del mirino circolare in px (= proiezione del cono di spread; cresce col rinculo). */
  crosshairSize(radiusPx) {
    const d = Math.round(radiusPx * 2);
    const c = this.el.crosshair;
    c.style.width = `${d}px`;
    c.style.height = `${d}px`;
    c.style.margin = `${-d / 2}px 0 0 ${-d / 2}px`;
  }

  health(hp, maxHp) {
    const f = Math.max(0, hp / maxHp);
    this.el.hpFill.style.width = `${f * 100}%`;
    this.el.hpText.textContent = Math.max(0, Math.ceil(hp));
    clearTimeout(this._ghostT);
    this._ghostT = setTimeout(() => { this.el.hpGhost.style.width = `${f * 100}%`; }, 120);
    this.el.lowhp.classList.toggle('active', f < 0.32 && hp > 0);
  }

  stamina(charges) {
    const pips = this.el.stamina.children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('full', i < charges);
  }

  ammo(player) {
    const w = player.weapons[player.current];
    const reserve = w.reserve === Infinity ? '∞' : w.reserve;
    this.el.ammo.innerHTML = `${w.mag} <span class="reserve">/ ${reserve}</span>`;
    this.el.ammo.classList.toggle('low', w.mag <= Math.ceil(WEAPONS[player.current].mag * 0.25));
    this.el.weaponName.textContent = WEAPONS[player.current].name;
  }

  reloading(on) {
    this.el.reloadHint.textContent = on ? 'RICARICA…' : '';
    if (!on) this.el.ammo.classList.remove('low');
  }

  weapons(player) {
    for (const slot of document.querySelectorAll('.slot')) {
      const id = slot.dataset.w;
      slot.classList.toggle('owned', !!player.weapons[id]);
      slot.classList.toggle('active', id === player.current);
    }
  }

  wave(n, themeName) {
    this.el.waveNum.textContent = `ONDATA ${n}`;
    this.el.waveName.textContent = themeName;
  }

  enemies(n) {
    this.el.enemiesLeft.textContent = `☠ ${n}`;
  }

  score(s) {
    this.el.score.textContent = Math.round(s).toLocaleString('it-IT');
  }

  combo(mult) {
    if (mult > 1.05) {
      this.el.combo.textContent = `COMBO x${mult.toFixed(1)}`;
      this.el.combo.style.transform = 'scale(1.15)';
      setTimeout(() => { this.el.combo.style.transform = 'scale(1)'; }, 80);
    } else {
      this.el.combo.textContent = '';
    }
  }

  souls(n) {
    this.el.souls.textContent = `✦ ${Math.round(n).toLocaleString('it-IT')}`;
    this.el.souls.style.transform = 'scale(1.18)';
    clearTimeout(this._soulsT);
    this._soulsT = setTimeout(() => { this.el.souls.style.transform = 'scale(1)'; }, 90);
  }

  /** Prompt vicino a una porta: gate = oggetto porta (o null per nasconderlo), souls = Anime attuali. */
  doorPrompt(gate, souls = 0) {
    const el = this.el.doorPrompt;
    if (!gate) { el.classList.remove('show'); return; }
    const poor = souls < gate.cost;
    el.classList.toggle('poor', poor);
    el.innerHTML = poor
      ? `<b>${gate.name}</b> · serve <span class="cost">${gate.cost} ✦</span>`
      : `<span class="key">E</span> apri <b>${gate.name}</b> · <span class="cost">${gate.cost} ✦</span>`;
    el.classList.add('show');
  }

  banner(title, sub, ms = 2600) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.el.banner.classList.remove('show'), ms);
  }

  countdown(sec) {
    if (sec === null) {
      this.el.countdown.style.display = 'none';
    } else {
      this.el.countdown.style.display = 'block';
      this.el.countdown.innerHTML = `PROSSIMA ONDATA TRA <b>${Math.ceil(sec)}</b>`;
    }
  }

  bossShow(name) {
    this.el.bossWrap.style.display = 'block';
    this.el.bossName.textContent = name;
    this.el.bossFill.style.width = '100%';
  }

  bossHp(frac) {
    this.el.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
  }

  bossHide() {
    this.el.bossWrap.style.display = 'none';
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.el.toast.style.opacity = '0'; }, 1700);
  }

  damageFlash() {
    this.el.damageFlash.style.transition = 'none';
    this.el.damageFlash.style.opacity = '1';
    requestAnimationFrame(() => {
      this.el.damageFlash.style.transition = 'opacity .45s ease';
      this.el.damageFlash.style.opacity = '0';
    });
  }

  gameOver(stats, best, isRecord) {
    $('st-score').textContent = Math.round(stats.score).toLocaleString('it-IT');
    $('st-wave').textContent = stats.wave;
    $('st-kills').textContent = stats.kills;
    $('st-acc').textContent = `${stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0}%`;
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60);
    $('st-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
    $('st-best').textContent = Math.round(best).toLocaleString('it-IT');
    $('gameover-sub').textContent = isRecord ? 'NUOVO RECORD!' : "L'orda ti ha divorato";
    this.showScreen('gameover');
    this.el.lowhp.classList.remove('active');
  }
}
