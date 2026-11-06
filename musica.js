"use strict";

function createCabinaAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return createTrackPlayer();
  const context = new Audio();
  const mix = context.createGain();
  mix.gain.value = 0.72;
  const bass = context.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 145;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 12;
  limiter.ratio.value = 4;
  const master = context.createGain();
  master.gain.value = 0;
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  const waveform = new Uint8Array(analyser.fftSize);
  mix.connect(bass).connect(limiter).connect(master).connect(analyser).connect(context.destination);

  const tempo = 124;
  const interval = 60 / tempo / 4;
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 71], [55, 59, 62, 64]];
  const roots = [33, 29, 36, 31];
  const notes = [[76, 79], [72, 76], [76, 79], [74, 71]];
  const frequency = note => 440 * 2 ** ((note - 69) / 12);
  let next = 0;
  let step = 0;
  let timer = 0;

  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.22), context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  function envelope(time, attack, duration, level, destination = mix) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    gain.connect(destination);
    return gain;
  }

  function kick(time) {
    const drum = context.createOscillator();
    drum.frequency.setValueAtTime(145, time);
    drum.frequency.exponentialRampToValueAtTime(46, time + 0.16);
    drum.connect(envelope(time, 0.003, 0.35, 0.78));
    drum.start(time);
    drum.stop(time + 0.36);
  }

  function percussion(time, type, cutoff, duration, level) {
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    source.connect(filter).connect(envelope(time, 0.002, duration, level));
    source.start(time);
    source.stop(time + duration);
  }

  function tone(time, note, type, duration, level, cutoff) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency(note);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(cutoff * 0.32, time + duration);
    oscillator.connect(filter).connect(envelope(time, 0.012, duration, level));
    oscillator.start(time);
    oscillator.stop(time + duration + 0.01);
  }

  function scheduleBeat(step, time) {
    const beat = step % 16;
    const bar = Math.floor(step / 16) % chords.length;
    const swing = beat % 2 === 1 ? 0.009 : 0;
    if (beat % 4 === 0) kick(time);
    if (beat === 4 || beat === 12) {
      percussion(time, "bandpass", 1650, 0.13, 0.36);
      percussion(time + 0.013, "highpass", 2300, 0.081, 0.19);
    }
    if (beat % 4 === 2) percussion(time, "highpass", 6800, 0.13, 0.19);
    if (beat % 4 === 3) percussion(time + swing, "highpass", 8400, 0.044, 0.077);
    if (beat % 4 === 2 || beat === 15) {
      tone(time + swing, roots[bar] + (beat === 15 ? 12 : 0), "sawtooth", 0.20, 0.26, 490);
    }
    if (beat === 2 || beat === 7 || beat === 10) {
      for (const note of chords[bar]) tone(time + swing, note, "triangle", 0.33, 0.070, 2200);
    }
    if (beat === 6 || beat === 14) tone(time, notes[bar][beat === 6 ? 0 : 1], "sine", 0.30, 0.115, 3800);
  }

  function schedule() {
    if (context.state !== "running") return;
    if (next < context.currentTime) next = context.currentTime + 0.015;
    while (next < context.currentTime + 0.12) {
      scheduleBeat(step, next);
      next += interval;
      step = (step + 1) % 64;
    }
  }

  return {
    hasBass: true,
    get active() { return context.state === "running"; },
    async unlock() {
      await context.resume();
      if (!timer) timer = window.setInterval(schedule, 25);
      schedule();
    },
    volume(value) {
      master.gain.setTargetAtTime((value / 100) ** 1.7 * 0.94, context.currentTime, 0.035);
    },
    bass(value) {
      bass.gain.setTargetAtTime((value - 50) / 5, context.currentTime, 0.06);
    },
    level() {
      if (context.state !== "running") return 0;
      analyser.getByteTimeDomainData(waveform);
      let peak = 0;
      for (const sample of waveform) peak = Math.max(peak, Math.abs(sample - 128));
      return peak / 128;
    }
  };
}

function createTrackPlayer() {
  const track = new Audio("mezcla.mp3");
  track.loop = true;
  return {
    hasBass: false,
    get active() { return !track.paused && track.readyState >= 2; },
    unlock() { return track.play(); },
    volume(value) {
      track.muted = value === 0;
      track.volume = (value / 100) ** 1.7;
    },
    bass() {},
    level() {
      if (track.paused || track.muted) return 0;
      return track.volume * (0.2 + 0.4 * Math.exp(-6 * (track.currentTime * 124 / 60 % 1)));
    }
  };
}
