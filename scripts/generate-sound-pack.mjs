import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(projectRoot, "public", "audio");
const sampleRate = 44_100;
const twoPi = Math.PI * 2;
let randomState = 0x47554947;

function random() {
  randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
  return randomState / 0x1_0000_0000;
}

function createTrack(duration) {
  const length = Math.ceil(duration * sampleRate);
  return {
    duration,
    left: new Float32Array(length),
    right: new Float32Array(length),
  };
}

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function wave(type, phase) {
  const cycle = phase / twoPi;
  if (type === "triangle") return 2 * Math.abs(2 * (cycle - Math.floor(cycle + 0.5))) - 1;
  if (type === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  return Math.sin(phase);
}

function envelope(time, duration, attack, release, decay = 0) {
  const inGain = Math.min(1, time / Math.max(attack, 0.001));
  const outGain = Math.min(1, (duration - time) / Math.max(release, 0.001));
  return Math.max(0, Math.min(inGain, outGain)) * Math.exp(-decay * time);
}

function addTone(track, {
  start,
  duration,
  frequency,
  amplitude = 0.1,
  type = "sine",
  attack = 0.01,
  release = 0.12,
  decay = 0,
  pan = 0,
  sweep = 0,
  vibrato = 0,
  vibratoRate = 5,
}) {
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(track.left.length, Math.ceil((start + duration) * sampleRate));
  const leftGain = Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = Math.sin((pan + 1) * Math.PI / 4);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / sampleRate - start;
    const currentFrequency = Math.max(25, frequency + sweep * time + Math.sin(twoPi * vibratoRate * time) * vibrato);
    phase += twoPi * currentFrequency / sampleRate;
    const value = wave(type, phase) * amplitude * envelope(time, duration, attack, release, decay);
    track.left[index] += value * leftGain;
    track.right[index] += value * rightGain;
  }
}

function addKalimba(track, start, duration, note, amplitude = 0.08, pan = 0) {
  const frequency = midi(note);
  addTone(track, { start, duration, frequency, amplitude, decay: 2.5, release: 0.18, pan });
  addTone(track, { start, duration: duration * 0.74, frequency: frequency * 2.01, amplitude: amplitude * 0.24, decay: 4.8, release: 0.1, pan });
  addTone(track, { start, duration: duration * 0.52, frequency: frequency * 3.98, amplitude: amplitude * 0.1, decay: 7, release: 0.08, pan });
}

function addBell(track, start, duration, note, amplitude = 0.08, pan = 0) {
  const frequency = midi(note);
  addTone(track, { start, duration, frequency, amplitude, attack: 0.004, release: 0.2, decay: 1.7, pan });
  addTone(track, { start, duration, frequency: frequency * 2.006, amplitude: amplitude * 0.37, attack: 0.003, release: 0.18, decay: 2.4, pan: pan * -0.5 });
  addTone(track, { start, duration, frequency: frequency * 3.01, amplitude: amplitude * 0.13, attack: 0.003, release: 0.14, decay: 3.2, pan });
}

function addNoise(track, {
  start,
  duration,
  amplitude = 0.08,
  attack = 0.003,
  release = 0.1,
  decay = 0,
  pan = 0,
  filter = "low",
  cutoff = 0.08,
}) {
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(track.left.length, Math.ceil((start + duration) * sampleRate));
  const leftGain = Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = Math.sin((pan + 1) * Math.PI / 4);
  let low = 0;
  let priorLow = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / sampleRate - start;
    const white = random() * 2 - 1;
    low += cutoff * (white - low);
    const high = white - low;
    const band = low - priorLow;
    priorLow = low;
    const source = filter === "high" ? high : filter === "band" ? band * 8 : low;
    const value = source * amplitude * envelope(time, duration, attack, release, decay);
    track.left[index] += value * leftGain;
    track.right[index] += value * rightGain;
  }
}

function addPad(track, start, duration, notes, amplitude = 0.022) {
  notes.forEach((note, index) => {
    const pan = notes.length === 1 ? 0 : -0.52 + index / (notes.length - 1) * 1.04;
    addTone(track, {
      start,
      duration,
      frequency: midi(note),
      amplitude,
      type: "sine",
      attack: 0.8,
      release: 1.1,
      pan,
      vibrato: 0.4,
      vibratoRate: 0.22 + index * 0.04,
    });
  });
}

function fadeEdges(track, seconds = 0.08) {
  const samples = Math.max(1, Math.floor(seconds * sampleRate));
  for (let index = 0; index < samples; index += 1) {
    const gain = index / samples;
    track.left[index] *= gain;
    track.right[index] *= gain;
    const end = track.left.length - 1 - index;
    track.left[end] *= gain;
    track.right[end] *= gain;
  }
}

function normalize(track, peakTarget = 0.78) {
  let peak = 0;
  for (let index = 0; index < track.left.length; index += 1) {
    peak = Math.max(peak, Math.abs(track.left[index]), Math.abs(track.right[index]));
  }
  const gain = peak > peakTarget ? peakTarget / peak : 1;
  for (let index = 0; index < track.left.length; index += 1) {
    track.left[index] *= gain;
    track.right[index] *= gain;
  }
}

function wavBuffer(track) {
  normalize(track);
  const dataSize = track.left.length * 4;
  const output = Buffer.allocUnsafe(44 + dataSize);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVE", 8);
  output.write("fmt ", 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(2, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 4, 28);
  output.writeUInt16LE(4, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < track.left.length; index += 1) {
    output.writeInt16LE(Math.max(-32_768, Math.min(32_767, Math.round(track.left[index] * 32_767))), 44 + index * 4);
    output.writeInt16LE(Math.max(-32_768, Math.min(32_767, Math.round(track.right[index] * 32_767))), 46 + index * 4);
  }
  return output;
}

function homeGardenMusic() {
  const bpm = 72;
  const beat = 60 / bpm;
  const bars = 16;
  const track = createTrack(bars * 4 * beat);
  const chords = [[48, 55, 60, 64], [53, 57, 60, 65], [45, 52, 57, 60], [43, 50, 55, 59]];
  const melody = [64, 67, 69, 67, 64, 62, 60, 62, 64, 67, 72, 69, 67, 64, 62, 60];
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * 4 * beat;
    const chord = chords[bar % chords.length];
    addPad(track, start, 4 * beat - 0.08, chord, 0.018);
    addTone(track, { start, duration: 2.8 * beat, frequency: midi(chord[0] - 12), amplitude: 0.026, type: "triangle", attack: 0.08, release: 0.45, decay: 0.35 });
    addKalimba(track, start + beat * 0.25, beat * 1.25, melody[bar], 0.055, bar % 2 ? 0.2 : -0.2);
    addKalimba(track, start + beat * 2.25, beat * 1.05, melody[(bar + 5) % melody.length], 0.043, bar % 2 ? -0.3 : 0.3);
    if (bar % 4 === 1) {
      const chirpStart = start + beat * 3.1;
      addTone(track, { start: chirpStart, duration: 0.22, frequency: 1_750, amplitude: 0.018, sweep: 1_400, attack: 0.01, release: 0.06, pan: 0.65 });
      addTone(track, { start: chirpStart + 0.18, duration: 0.18, frequency: 2_050, amplitude: 0.014, sweep: -500, attack: 0.01, release: 0.05, pan: 0.65 });
    }
  }
  addNoise(track, { start: 0, duration: track.duration, amplitude: 0.028, attack: 1.5, release: 1.5, filter: "low", cutoff: 0.004 });
  fadeEdges(track);
  return track;
}

function quietLibraryMusic() {
  const bpm = 60;
  const beat = 60 / bpm;
  const bars = 8;
  const track = createTrack(bars * 4 * beat);
  const chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 60]];
  const melody = [[64, 67], [60, 64], [57, 60], [62, 67]];
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * 4 * beat;
    const chord = chords[bar % 4];
    addPad(track, start, 4 * beat - 0.1, chord, 0.016);
    addTone(track, { start, duration: 3.2 * beat, frequency: midi(chord[0] - 12), amplitude: 0.02, attack: 0.7, release: 0.9 });
    addBell(track, start + beat * 0.55, beat * 1.7, melody[bar % 4][0], 0.038, -0.18);
    addBell(track, start + beat * 2.6, beat * 1.25, melody[bar % 4][1], 0.03, 0.22);
  }
  addNoise(track, { start: 0, duration: track.duration, amplitude: 0.015, attack: 1, release: 1, filter: "low", cutoff: 0.003 });
  fadeEdges(track);
  return track;
}

function turtleParkMusic() {
  const bpm = 108;
  const beat = 60 / bpm;
  const bars = 16;
  const track = createTrack(bars * 4 * beat);
  const chords = [[48, 52, 55], [53, 57, 60], [45, 52, 57], [43, 50, 55]];
  const melody = [72, 69, 67, 64, 67, 69, 72, 74, 76, 72, 69, 67, 69, 67, 64, 62];
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * 4 * beat;
    const chord = chords[bar % 4];
    addPad(track, start, 4 * beat - 0.08, chord, 0.014);
    for (let pulse = 0; pulse < 4; pulse += 1) {
      addTone(track, {
        start: start + pulse * beat,
        duration: beat * 0.58,
        frequency: midi(chord[0] - 12),
        amplitude: 0.043,
        type: "triangle",
        attack: 0.01,
        release: 0.12,
        decay: 1.6,
      });
      addNoise(track, { start: start + pulse * beat, duration: 0.08, amplitude: pulse % 2 ? 0.035 : 0.055, release: 0.06, filter: "high", cutoff: 0.16 });
    }
    addKalimba(track, start + beat * 0.25, beat * 0.75, melody[bar], 0.065, -0.25);
    addKalimba(track, start + beat * 1.25, beat * 0.72, melody[(bar + 2) % melody.length], 0.047, 0.25);
    addKalimba(track, start + beat * 2.5, beat * 0.92, melody[(bar + 5) % melody.length], 0.058, 0.05);
  }
  fadeEdges(track);
  return track;
}

const effects = {
  "ui-tap": () => {
    const track = createTrack(0.16);
    addTone(track, { start: 0, duration: 0.12, frequency: 620, amplitude: 0.12, type: "triangle", sweep: -520, release: 0.08, decay: 8 });
    addNoise(track, { start: 0, duration: 0.045, amplitude: 0.1, release: 0.04, filter: "high", cutoff: 0.22 });
    return track;
  },
  "reward-star": () => sequence([[76, 0], [79, 0.13], [84, 0.28]], 0.88, "bell"),
  "reward-ticket": () => sequence([[72, 0], [76, 0.11], [79, 0.24], [84, 0.39]], 0.9, "kalimba"),
  "fruit-pick": () => {
    const track = createTrack(0.4);
    addTone(track, { start: 0, duration: 0.32, frequency: 520, amplitude: 0.14, type: "sine", sweep: 520, release: 0.13, decay: 4 });
    addNoise(track, { start: 0.02, duration: 0.09, amplitude: 0.06, release: 0.08, filter: "high", cutoff: 0.14 });
    return track;
  },
  "fruit-catch": () => sequence([[67, 0], [74, 0.09]], 0.38, "kalimba"),
  "feed-bite": () => {
    const track = createTrack(0.72);
    [0.02, 0.22, 0.44].forEach((start, index) => {
      addNoise(track, { start, duration: 0.16, amplitude: 0.16 - index * 0.02, release: 0.12, decay: 5, filter: "band", cutoff: 0.12 });
      addTone(track, { start, duration: 0.12, frequency: 175 - index * 12, amplitude: 0.06, release: 0.1, decay: 5 });
    });
    return track;
  },
  "water-splash": () => {
    const track = createTrack(0.85);
    addNoise(track, { start: 0, duration: 0.72, amplitude: 0.22, attack: 0.01, release: 0.32, decay: 2.1, filter: "high", cutoff: 0.05 });
    [0.08, 0.17, 0.29].forEach((start, index) => addTone(track, { start, duration: 0.22, frequency: 740 + index * 180, amplitude: 0.035, sweep: -300, release: 0.12 }));
    return track;
  },
  "hide-found": () => sequence([[67, 0], [72, 0.13], [76, 0.27], [79, 0.42]], 1.0, "bell"),
  "sleep-yawn": () => {
    const track = createTrack(1.4);
    addTone(track, { start: 0.05, duration: 1.15, frequency: 330, amplitude: 0.11, sweep: -145, attack: 0.18, release: 0.35, vibrato: 5, vibratoRate: 4 });
    addTone(track, { start: 0.2, duration: 0.9, frequency: 220, amplitude: 0.045, sweep: -70, attack: 0.2, release: 0.3 });
    return track;
  },
  "page-turn": () => {
    const track = createTrack(0.62);
    addNoise(track, { start: 0, duration: 0.55, amplitude: 0.16, attack: 0.03, release: 0.18, decay: 1.7, filter: "high", cutoff: 0.06, pan: -0.4 });
    addNoise(track, { start: 0.12, duration: 0.4, amplitude: 0.1, attack: 0.03, release: 0.12, decay: 2.6, filter: "band", cutoff: 0.08, pan: 0.45 });
    return track;
  },
  "answer-correct": () => sequence([[64, 0], [67, 0.15], [72, 0.31], [76, 0.5]], 1.06, "bell"),
  "answer-retry": () => sequence([[67, 0], [64, 0.2], [62, 0.4]], 0.9, "kalimba", 0.055),
  "travel-depart": () => sequence([[55, 0], [62, 0.17], [67, 0.34], [71, 0.54]], 1.05, "kalimba"),
  "travel-arrive": () => sequence([[60, 0], [64, 0.14], [67, 0.28], [72, 0.45], [76, 0.64]], 1.25, "bell"),
  "card-unlock": () => sequence([[72, 0], [76, 0.11], [79, 0.22], [84, 0.36], [88, 0.58]], 1.3, "bell"),
  "game-jump": () => {
    const track = createTrack(0.42);
    addTone(track, { start: 0, duration: 0.35, frequency: 320, amplitude: 0.15, type: "triangle", sweep: 880, attack: 0.005, release: 0.12, decay: 2.5 });
    return track;
  },
  "game-hit": () => {
    const track = createTrack(0.34);
    addTone(track, { start: 0, duration: 0.28, frequency: 180, amplitude: 0.16, type: "triangle", sweep: -80, release: 0.16, decay: 4 });
    addNoise(track, { start: 0, duration: 0.15, amplitude: 0.1, release: 0.12, filter: "low", cutoff: 0.12 });
    return track;
  },
  "game-win": () => sequence([[60, 0], [64, 0.13], [67, 0.26], [72, 0.42], [76, 0.62], [79, 0.82]], 1.45, "kalimba", 0.085),
  "game-star": () => sequence([[79, 0], [86, 0.11]], 0.46, "bell", 0.07),
  "new-record": () => sequence([[67, 0], [72, 0.12], [76, 0.24], [79, 0.38], [84, 0.58], [88, 0.83]], 1.62, "bell", 0.085),
};

function sequence(notes, duration, instrument = "kalimba", amplitude = 0.07) {
  const track = createTrack(duration);
  notes.forEach(([note, start], index) => {
    const noteDuration = Math.min(0.68, duration - start);
    const pan = index % 2 ? 0.18 : -0.18;
    if (instrument === "bell") addBell(track, start, noteDuration, note, amplitude, pan);
    else addKalimba(track, start, noteDuration, note, amplitude, pan);
  });
  return track;
}

const music = {
  "home-garden": homeGardenMusic,
  "quiet-library": quietLibraryMusic,
  "turtle-park": turtleParkMusic,
};

async function encodeMp3(track, wavPath, mp3Path, title, bitrate) {
  await writeFile(wavPath, wavBuffer(track));
  const encoded = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", wavPath,
    "-codec:a", "libmp3lame",
    "-b:a", bitrate,
    "-ar", String(sampleRate),
    "-metadata", `title=${title}`,
    "-metadata", "artist=龟龟伴读原创声音包",
    mp3Path,
  ], { encoding: "utf8" });
  if (encoded.status !== 0) throw new Error(encoded.stderr || `无法生成 ${mp3Path}`);
}

async function main() {
  const temporary = await mkdtemp(join(tmpdir(), "guigu-sound-pack-"));
  const manifest = { version: 1, generatedAt: new Date().toISOString(), music: {}, effects: {} };
  try {
    await Promise.all([
      mkdir(join(outputRoot, "music"), { recursive: true }),
      mkdir(join(outputRoot, "sfx"), { recursive: true }),
    ]);
    for (const [id, create] of Object.entries(music)) {
      const track = create();
      const wavPath = join(temporary, `${id}.wav`);
      const mp3Path = join(outputRoot, "music", `${id}.mp3`);
      await encodeMp3(track, wavPath, mp3Path, id, "96k");
      manifest.music[id] = { src: `/audio/music/${id}.mp3`, duration: Number(track.duration.toFixed(3)), loop: true };
    }
    for (const [id, create] of Object.entries(effects)) {
      const track = create();
      const wavPath = join(temporary, `${id}.wav`);
      const mp3Path = join(outputRoot, "sfx", `${id}.mp3`);
      await encodeMp3(track, wavPath, mp3Path, id, "80k");
      manifest.effects[id] = { src: `/audio/sfx/${id}.mp3`, duration: Number(track.duration.toFixed(3)) };
    }
    await writeFile(join(outputRoot, "sound-pack.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`Generated ${Object.keys(music).length} music loops and ${Object.keys(effects).length} effects in ${outputRoot}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

await main();
