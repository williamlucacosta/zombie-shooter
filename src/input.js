// Gestione input: tastiera, mouse (posizione NDC + pulsanti), rotella.

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    this.mouseNDC = { x: 0, y: 0 };
    this.mousePix = { x: innerWidth / 2, y: innerHeight / 2 };
    this.mouseDown = false;
    this.mousePressed = false;
    this.wheelDelta = 0;
    // mouse-look in prima persona (pointer lock)
    this.pointerLocked = false;
    this.wantLock = false;     // true quando la modalità FPS è attiva
    this.lookDX = 0;           // movimento mouse accumulato nel frame (consumato dal loop)
    this.lookDY = 0;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedThisFrame.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });

    addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        // in pointer lock contano solo i delta relativi (mouse-look)
        this.lookDX += e.movementX || 0;
        this.lookDY += e.movementY || 0;
        return;
      }
      this.mousePix.x = e.clientX;
      this.mousePix.y = e.clientY;
      this.mouseNDC.x = (e.clientX / innerWidth) * 2 - 1;
      this.mouseNDC.y = -(e.clientY / innerHeight) * 2 + 1;
    });
    domElement.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // in FPS un click serve ad agganciare il puntatore: non spara
      if (this.wantLock && !this.pointerLocked) { this.dom.requestPointerLock?.(); return; }
      this.mouseDown = true; this.mousePressed = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    addEventListener('wheel', (e) => { this.wheelDelta += Math.sign(e.deltaY); }, { passive: true });
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
      if (!this.pointerLocked) this.mouseDown = false;
    });
  }

  requestLock() { this.dom.requestPointerLock?.(); }
  exitLock() { if (document.pointerLockElement === this.dom) document.exitPointerLock?.(); }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressedThisFrame.has(code); }

  /** Da chiamare a fine frame: azzera gli eventi "edge". */
  endFrame() {
    this.pressedThisFrame.clear();
    this.mousePressed = false;
    this.wheelDelta = 0;
    this.lookDX = 0;
    this.lookDY = 0;
  }
}
