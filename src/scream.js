const duration = 1.87
const contour = [
  [0,83],[.13,92],[.28,176],[.36,247],[.49,226],[.60,264],
  [.74,217],[.88,224],[1.02,173],[1.19,147],[1.34,113],[1.51,82],[1.87,63]
]

function bandpass(rate, frequency, quality) {
  const angle = 2 * Math.PI * frequency / rate
  const alpha = Math.sin(angle) / (2 * quality)
  const gain = alpha / (1 + alpha)
  const feedback = 2 * Math.cos(angle) / (1 + alpha)
  const damping = (1 - alpha) / (1 + alpha)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return input => {
    const result = gain * (input - x2) + feedback * y1 - damping * y2
    x2 = x1
    x1 = input
    y2 = y1
    y1 = result
    return result
  }
}

function rise(value, begin, end) {
  const amount = Math.max(0, Math.min(1, (value - begin) / (end - begin)))
  return amount * amount * (3 - 2 * amount)
}

export function makeScream(rate, seed = 5221) {
  const samples = new Float32Array(Math.ceil(rate * duration))
  const chest = bandpass(rate, 292, 1.2)
  const openVowel = bandpass(rate, 762, 3.1)
  const strainedVowel = bandpass(rate, 1110, 3.5)
  const throat = bandpass(rate, 1450, 3)
  const edge = bandpass(rate, 2480, 4.2)
  const breath = bandpass(rate, 1860, 1.9)
  let phase = 0, cycle = 0, segment = 0, jitter = 1, shimmer = 1, previousPulse = 0
  const variant = seed % 17 / 17
  const white = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2147483648 - 1
  }

  for (let index = 0; index < samples.length; index++) {
    const time = index / rate
    while (segment < contour.length - 2 && time >= contour[segment + 1][0]) segment++
    const [fromTime, fromPitch] = contour[segment]
    const [toTime, toPitch] = contour[segment + 1]
    const blend = rise(time, fromTime, toTime)
    const pitch = (fromPitch + (toPitch - fromPitch) * blend) *
      (1 + variant * .105 + .043 * Math.sin(time * 45) + .021 * Math.sin(time * 97))

    phase += pitch * jitter / rate
    if (phase >= 1) {
      phase -= 1
      cycle++
      jitter = 1 + white() * .073
      shimmer = .85 + white() * .25
    }
    const open = .46 + .095 * Math.sin(time * 18)
    const close = open + .20
    const fold = phase < open ? .5 - .5 * Math.cos(Math.PI * phase / open)
      : phase < close ? Math.cos((phase - open) / .20 * Math.PI / 2) : 0
    const crack = rise(time, .55, .66) * (1 - rise(time, .80, .91))
    const pulse = fold * shimmer * (cycle % 2 ? 1 - .50 * crack : 1)
    const hiss = white()
    const voice = (pulse - previousPulse) * 9 + hiss * (.15 + .34 * crack)
    previousPulse = pulse
    const straining = rise(time, .33, .64)
    const resonant = .49 * chest(voice) + (1.6 - straining * .77) * openVowel(voice)
      + (.61 + straining * .75) * strainedVowel(voice) + .42 * throat(voice) + .57 * edge(voice)
    const vocalEnvelope = rise(time, .128, .287) * (1 - rise(time, .94, 1.63))
    const intake = rise(time, .015, .074) * (1 - rise(time, .12, .25))
    const exhale = rise(time, 1.19, 1.37) * (1 - rise(time, 1.48, 1.87))
    const raw = resonant * vocalEnvelope + breath(hiss) * (intake * .45 + exhale * .48)
    samples[index] = Math.tanh(raw * .86) * .78
  }
  return samples
}
