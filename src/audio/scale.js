// Pitch helpers shared by the music (sound.js) and the effects (sfx.js).
export const YO = [0, 2, 5, 7, 9]; // D E G A B
export const IN = [0, 1, 5, 7, 8]; // D Eb G A Bb (miyako-bushi)
export const ROOT = 293.66; // D4
export const hz = (semi) => ROOT * 2 ** (semi / 12);
