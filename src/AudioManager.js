/** @type {!Map<string, string>} */
const soundUrls = new Map();

/** @type {!Map<string, AudioBuffer>} */
const namedAudioBuffers = new Map();

export class AudioManager {
  constructor() {
    /** @private {AudioContext} */
    this.audioContext = new AudioContext();
    /** @private {WeakMap<?, AudioBufferSourceNode>} All the sounds, mapped to who is originating them. No source can have two sounds running at once */
    this.activeSounds = new WeakMap();
  }

  loadAllSounds() {
    const promises = [];
    soundUrls.forEach((src, name) => {
      if (namedAudioBuffers.has(name)) return;

      promises.push(
        this.loadSound(src).then((audio) => {
          namedAudioBuffers.set(name, audio);
        })
      );
    });

    return Promise.all(promises).then(() => {});
  }

  /**
   * Loads sound from an external url
   * @param {string} url - The url to download from
   * @returns {Promise<AudioBuffer>}
   */
  loadSound(url) {
    return fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`failed to load ${url}`);
        return response.arrayBuffer();
      })
      .then((buffer) => this.audioContext.decodeAudioData(buffer));
  }

  /**
   * @param {?} source
   * @param {string} name
   */
  playNamedSound(source, name) {
    const sound = namedAudioBuffers.get(name);
    if (!sound) {
      if (!soundUrls.has(name)) {
        throw new Error(`Unrecognized sound "${name}"`);
      } else {
        throw new Error("Unloaded sound");
      }
    }

    this.playSound(source, sound);
  }

  /**
   * Plays the given sound, attributed to the in-game source. If there is
   * already a sound running from that source, the previous one is stopped
   * @param {?} source - The source of the audio
   * @param {AudioBuffer} buffer
   */
  playSound(source, buffer) {
    const activeSounds = this.activeSounds;

    const priorSound = activeSounds.get(source);
    if (priorSound) {
      priorSound.stop();
    }

    const audioContext = this.audioContext;
    const audioSource = audioContext.createBufferSource();
    audioSource.buffer = buffer;
    audioSource.connect(audioContext.destination);
    audioSource.start();
    activeSounds.set(source, audioSource);
  }
}

/**
 *
 * @param {Object} args
 * @param {string} args.name
 * @param {string} args.src
 */
export function registerSound(args) {
  soundUrls.set(args.name, args.src);
}
