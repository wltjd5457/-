const BPM = 130;
const STEP_SECONDS = 60 / BPM / 4;
const MELODY: readonly (number | null)[] = [
  72, 76, 79, 81, 79, 76, 74, null,
  74, 77, 81, 83, 81, 77, 76, null,
  76, 79, 84, 83, 81, 79, 76, 74,
  72, 74, 76, 79, 81, 79, 76, 72,
];
const COUNTER_MELODY: readonly (number | null)[] = [
  64, null, 67, null, 64, null, 67, null,
  65, null, 69, null, 65, null, 69, null,
  67, null, 72, null, 69, null, 67, null,
  64, null, 67, null, 69, null, 67, null,
];
const BASS = [48, 55, 53, 55, 48, 57, 53, 55] as const;

export function createArcadeAudio() {
  if (typeof AudioContext === "undefined") {
    return null;
  }

  const context = new AudioContext();
  const master = context.createGain();
  const music = context.createGain();
  const effects = context.createGain();
  const lead = context.createStereoPanner();
  const counter = context.createStereoPanner();
  master.gain.value = 0.55;
  music.gain.value = 0;
  effects.gain.value = 0.45;
  lead.pan.value = -0.28;
  counter.pan.value = 0.28;
  lead.connect(music);
  counter.connect(music);
  music.connect(master);
  effects.connect(master);
  master.connect(context.destination);

  let musicRunning = false;
  let timer: number | null = null;
  let nextStepAt = 0;
  let step = 0;

  function scheduleMusic(): void {
    while (nextStepAt < context.currentTime + 0.2) {
      const melodyNote = MELODY[step % MELODY.length] ?? null;
      const counterNote = COUNTER_MELODY[step % COUNTER_MELODY.length] ?? null;
      const bassNote = BASS[Math.floor(step / 4) % BASS.length] ?? BASS[0];
      if (melodyNote !== null) {
        playTone(lead, melodyNote, nextStepAt, STEP_SECONDS * 0.52, 0.14, "square");
      }
      if (counterNote !== null) {
        playTone(
          counter,
          counterNote,
          nextStepAt,
          STEP_SECONDS * 0.82,
          0.12,
          "triangle",
        );
      }
      if (step % 4 === 0) {
        playTone(
          music,
          bassNote,
          nextStepAt,
          STEP_SECONDS * 1.35,
          0.14,
          "triangle",
        );
      }
      if (step % 4 === 2) {
        playTone(music, bassNote + 7, nextStepAt, STEP_SECONDS * 0.65, 0.055, "square");
      }
      nextStepAt += STEP_SECONDS;
      step += 1;
    }
  }

  function setMusicRunning(running: boolean): void {
    if (running === musicRunning) {
      return;
    }
    musicRunning = running;
    const now = context.currentTime;
    music.gain.cancelScheduledValues(now);
    music.gain.setTargetAtTime(running ? 0.42 : 0, now, 0.035);

    if (running) {
      void context.resume();
      nextStepAt = now + 0.05;
      step = 0;
      scheduleMusic();
      timer = window.setInterval(scheduleMusic, 60);
    } else if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function playEffect(
    midi: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endMidi = midi,
    delay = 0,
  ): void {
    if (context.state === "closed") {
      return;
    }
    playTone(
      effects,
      midi,
      context.currentTime + 0.005 + delay,
      duration,
      volume,
      type,
      endMidi,
    );
  }

  return {
    setMusicRunning,
    setMuted(muted: boolean) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(muted ? 0 : 0.55, now, 0.02);
      if (!muted && musicRunning) {
        void context.resume();
      }
    },
    playShot() {
      playEffect(88, 0.045, 0.09, "square", 81);
    },
    playDefeat(boss: boolean) {
      if (boss) {
        playEffect(60, 0.16, 0.14, "square", 72);
        playEffect(67, 0.2, 0.12, "square", 79, 0.09);
        return;
      }
      playEffect(79, 0.07, 0.1, "square", 86);
    },
    playPlayerHit() {
      playEffect(52, 0.16, 0.16, "sawtooth", 40);
    },
    playVaultHit() {
      playEffect(43, 0.2, 0.15, "square", 35);
    },
    dispose() {
      setMusicRunning(false);
      void context.close();
    },
  };
}

function playTone(
  destination: AudioNode,
  midi: number,
  startAt: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  endMidi = midi,
): void {
  const context = destination.context;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(midiFrequency(midi), startAt);
  oscillator.frequency.exponentialRampToValueAtTime(
    midiFrequency(endMidi),
    startAt + duration,
  );
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.01);
}

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
