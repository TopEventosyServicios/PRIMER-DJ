"use strict";

const byId = id => document.getElementById(id);
const consolePanel = document.querySelector(".console");
const volume = byId("volume");
const bass = byId("bass");
const play = byId("play");
const mute = byId("mute");
const replay = byId("replay");
const artist = byId("artist");
const portrait = document.querySelector(".portrait");
const logo = document.querySelector(".deck-logo");
const recordA = byId("record-a");
const recordB = byId("record-b");
const meterLights = [...document.querySelectorAll(".meter i")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function platterMotion(record, speed, brakeAt) {
  const brakeAngle = speed * brakeAt;
  const stopAngle = Math.ceil(brakeAngle / 360) * 360;
  const distance = stopAngle - brakeAngle;
  const duration = 2 * distance / speed;
  return {
    record,
    brakeAt,
    stopAt: brakeAt + duration,
    angle(elapsed) {
      if (elapsed < brakeAt) return speed * elapsed;
      const progress = Math.min(1, (elapsed - brakeAt) / duration);
      return brakeAngle + distance * progress * (2 - progress);
    }
  };
}
const platters = [platterMotion(recordA, 198, 5.9), platterMotion(recordB, 191, 6.15)];
const brakeAt = Math.min(...platters.map(platter => platter.brakeAt));
const stopAt = Math.max(...platters.map(platter => platter.stopAt));
let phase = "ready";
let audio;
let soundStarted = false;
let startTime = 0;
let frameId = 0;
let ramp = null;
let lastVolume = 68;
let lastMeterTime = 0;

function setPhase(next, label) {
  phase = next;
  consolePanel.dataset.phase = next;
  byId("display").textContent = label;
}

function showSoundError(message) {
  const status = byId("sound-status");
  status.textContent = message;
  status.hidden = !message;
}

async function unlockSound() {
  try {
    audio ??= createCabinaAudio();
    bass.disabled = !audio.hasBass;
    if (bass.disabled) bass.title = "El ajuste de graves necesita un navegador con Web Audio.";
    audio.bass(Number(bass.value));
    audio.volume(Number(volume.value));
    await audio.unlock();
    soundStarted = true;
    showSoundError("");
  } catch {
    showSoundError("No se ha podido activar la música. Prueba a pulsar de nuevo.");
  }
}

function showFader(control) {
  byId(control.id + "-value").textContent = control.value;
  control.parentElement.style.setProperty("--level", control.value + "%");
}

function setVolume(value) {
  volume.value = Math.round(value);
  showFader(volume);
  const current = Number(volume.value);
  if (current > 0) lastVolume = current;
  audio?.volume(current);
  mute.textContent = current ? "Silenciar" : "Activar sonido";
  mute.setAttribute("aria-pressed", String(current === 0));
  byId("play-text").textContent = current ? "Silenciar mezcla" : "Activar sonido";
}

function rotate(record, angle) {
  record.style.setProperty("--angle", (angle % 360) + "deg");
}

function reveal() {
  const restoreFocus = document.activeElement === play;
  setPhase("revealed", "DJ REVELADO");
  for (const platter of platters) rotate(platter.record, 0);
  portrait.removeAttribute("aria-hidden");
  logo.removeAttribute("aria-hidden");
  artist.hidden = false;
  byId("start-panel").hidden = true;
  byId("replay-controls").hidden = false;
  byId("announcement").textContent = "Primer DJ confirmado: Manuel Pallarés.";
  if (restoreFocus) replay.focus({ preventScroll: true });
}

function tick(now) {
  const elapsed = (now - startTime) / 1000;
  if (ramp) {
    const progress = Math.min(1, elapsed / 1.6);
    setVolume(ramp.from + (ramp.to - ramp.from) * (progress * (2 - progress)));
    if (progress === 1) ramp = null;
  }
  if (now - lastMeterTime > 100) {
    const lit = Math.min(8, Math.round(Math.sqrt(audio?.level() || 0) * 10));
    meterLights.forEach((light, index) => light.classList.toggle("on", index < lit));
    lastMeterTime = now;
  }
  const quietMotion = reducedMotion.matches;
  if (phase === "mixing" && elapsed >= (quietMotion ? 1.6 : brakeAt)) {
    setPhase("braking", "FRENANDO PLATOS");
  }
  if (phase === "braking" && (quietMotion || elapsed >= stopAt)) reveal();
  if (phase !== "revealed") {
    for (const platter of platters) rotate(platter.record, quietMotion ? 0 : platter.angle(elapsed));
  }
  frameId = requestAnimationFrame(tick);
}

function start(autoFader) {
  cancelAnimationFrame(frameId);
  const moveFocus = document.activeElement === replay || document.activeElement === mute;
  artist.hidden = true;
  byId("replay-controls").hidden = true;
  byId("start-panel").hidden = false;
  byId("announcement").textContent = "";
  portrait.setAttribute("aria-hidden", "true");
  logo.setAttribute("aria-hidden", "true");
  if (moveFocus) play.focus({ preventScroll: true });
  const target = Math.max(56, lastVolume);
  setVolume(autoFader ? 8 : Number(volume.value));
  ramp = autoFader ? { from: 8, to: target } : null;
  setPhase("mixing", "MEZCLA EN DIRECTO");
  byId("mix-hint").textContent = "Ajusta el volumen y los graves mientras giran los platos.";
  startTime = performance.now();
  unlockSound();
  frameId = requestAnimationFrame(tick);
}

function toggleSound() {
  ramp = null;
  if (Number(volume.value) > 0 && soundStarted) {
    setVolume(0);
    return;
  }
  setVolume(Number(volume.value) || lastVolume);
  unlockSound();
}

play.addEventListener("click", () => phase === "ready" ? start(true) : toggleSound());
mute.addEventListener("click", toggleSound);
replay.addEventListener("click", () => start(true));

volume.addEventListener("input", () => {
  ramp = null;
  const value = Number(volume.value);
  if (phase === "ready" && value > 0) {
    start(false);
  } else if (phase !== "ready") {
    setVolume(value);
  }
});
for (const eventName of ["pointerup", "touchend", "keyup", "click"]) {
  volume.addEventListener(eventName, () => {
    if (Number(volume.value) > 0 && !audio?.active) unlockSound();
  });
}
bass.addEventListener("input", () => {
  showFader(bass);
  audio?.bass(Number(bass.value));
});
