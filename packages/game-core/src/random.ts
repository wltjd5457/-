export function nextRandom(state: number): [value: number, nextState: number] {
  let nextState = state >>> 0;
  nextState += 0x6d2b79f5;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return [((value ^ (value >>> 14)) >>> 0) / 4_294_967_296, nextState >>> 0];
}
