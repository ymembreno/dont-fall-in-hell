const duration = 24
const twoPi = 2 * Math.PI

const textureEvents = [
  {at:2.7,length:2.1,pan:-.61,kind:'breath'},
  {at:6.9,length:1.05,pan:.75,kind:'metal'},
  {at:10.1,length:1.35,pan:-.46,kind:'knock'},
  {at:14.0,length:2.8,pan:.59,kind:'breath'},
  {at:19.3,length:1.3,pan:-.76,kind:'metal'},
  {at:21.7,length:1.45,pan:.38,kind:'knock'}
]

const tunnelEvents = [
  {at:1.4,length:1.1,pan:-.73,kind:'drop'},
  {at:4.5,length:2.75,pan:.55,kind:'furnace'},
  {at:8.5,length:1.38,pan:.71,kind:'knock'},
  {at:12.8,length:1.05,pan:-.62,kind:'drop'},
  {at:16.1,length:3.1,pan:-.43,kind:'furnace'},
  {at:21.4,length:1.5,pan:.57,kind:'metal'}
]

export function menuAmbience(rate, tunnel = false) {
  const events=tunnel?tunnelEvents:textureEvents
  const left = new Float32Array(rate * duration)
  const right = new Float32Array(left.length)
  let seed = 41773
  let low = 0
  let mids = 0
  let current = 0
  for (let sample = 0; sample < left.length; sample++) {
    const t = sample / rate
    const loop = twoPi * t / duration
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = seed / 2147483648 - 1
    low += .018 * (noise - low)
    mids += .12 * (noise - mids)
    const tension = .67 + .25 * Math.sin(loop * 2 + .4) + .08 * Math.sin(loop * 5)
    const drone = (tunnel?.027:.058) * Math.sin(twoPi * 39 * t + .4 * Math.sin(loop * 2))
      + tension * (tunnel?.014:.032) * Math.sin(twoPi * 58.5 * t - Math.sin(loop))
      + (tunnel?.008:.016) * Math.sin(twoPi * 68.625 * t + .8 * Math.sin(loop * 5))
      + (tunnel?.008:.017) * tension * Math.sin(twoPi * 107.125 * t + Math.sin(loop * 3))
    const furnace = tunnel ? .025*Math.sin(twoPi*43.5*t+Math.sin(loop*7))
      + .011*Math.sin(twoPi*87*t)*(1+.5*Math.sin(loop*8)) : 0
    const pressure=Math.sin(twoPi*31.75*t+.44*Math.sin(loop*3))*.024
      *(.64+.22*Math.cos(loop*2)+.14*Math.sin(loop*7))
    const air = furnace + pressure + low * (tunnel?.035:.07)
    let l = drone + air
    let r = drone - air * .32
    const event = events[current]
    if (event) {
      const elapsed = t - event.at
      if (elapsed >= event.length) current++
      else if (elapsed >= 0) {
        const p = elapsed / event.length
        const swell = Math.sin(Math.PI * p) ** 2
        let effect
        if (event.kind === 'breath') {
          effect = swell * ((mids - low) * .27 + .025 * Math.sin(twoPi * (109 * elapsed - 4 * elapsed * elapsed)))
        } else if(event.kind==='drop') {
          const drip=delay=>{
            const age=Math.max(0,elapsed-delay)
            return Math.min(1,age*152)*Math.exp(-21*age)*Math.sin(twoPi*(730*age-210*age*age))
          }
          effect=.072*(drip(0)+drip(.15)*.49+drip(.32)*.22)
        } else if(event.kind==='furnace') {
          const heat=Math.max(0,Math.sin(elapsed*12.7+.9))**2
          const grind=Math.sin(twoPi*(49*elapsed+4*elapsed*elapsed))+.42*Math.sin(twoPi*94*elapsed)
          effect=swell*(grind*.035+(mids-low)*heat*.14)
        } else if (event.kind === 'metal') {
          const waver = Math.sin(twoPi * (418 * elapsed + 133 * elapsed * elapsed) + Math.sin(elapsed * 37))
          effect = swell * (waver * .04 + (mids - low) * .28) * (.63 + .37 * Math.sin(elapsed * 31) ** 2)
        } else {
          const tap = Math.exp(-22 * elapsed) * Math.min(1, elapsed * 150)
          const delay = Math.max(0, elapsed - .24)
          const reflected = Math.exp(-20 * delay) * Math.min(1, delay * 165)
          effect = (tap + reflected * .42) * (.12 * Math.sin(twoPi * 91 * elapsed) + mids * .25)
        }
        const pan = event.pan * (.8 + .2 * Math.cos(Math.PI * p))
        l += effect * Math.sqrt((1 - pan) * .5)
        r += effect * Math.sqrt((1 + pan) * .5)
      }
    }
    left[sample] = Math.tanh(l * 1.3)
    right[sample] = Math.tanh(r * 1.3)
  }
  if(!tunnel) return [left,right]
  // The asymmetric cross-channel taps give distant sounds audible wall reflections.
  const reflections=[[.043,.21],[.091,.17],[.173,.11],[.312,.073],[.56,.039]]
    .map(([delay,gain])=>[Math.round(rate*delay),gain])
  const reflectedLeft=new Float32Array(left.length)
  const reflectedRight=new Float32Array(right.length)
  for(let index=0;index<left.length;index++) {
    let l=left[index]*.91
    let r=right[index]*.91
    for(const [delay,gain] of reflections) {
      const tap=(index-delay+left.length)%left.length
      l+=right[tap]*gain
      r+=left[tap]*gain*.88
    }
    reflectedLeft[index]=Math.tanh(l)
    reflectedRight[index]=Math.tanh(r)
  }
  return [reflectedLeft,reflectedRight]
}

export function sealedWindowNoise(rate) {
  const seconds=18
  const samples=new Float32Array(rate*seconds)
  const rattles=[1.97,2.06,5.25,8.62,8.78,13.01,15.89,16.02]
  let seed=87915
  let slow=0
  let fast=0
  for(let i=0;i<samples.length;i++) {
    const time=i/rate
    const white=((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2147483648)-1
    slow+=.011*(white-slow)
    fast+=.18*(white-fast)
    const cycle=twoPi*time/seconds
    const gust=(.53+.26*Math.cos(cycle*3)+.16*Math.sin(cycle*5+.2))**2
    let rattle=0
    for(const click of rattles) {
      const age=time-click
      if(age>0 && age<.53) {
        const attack=Math.min(1,age*200)*Math.exp(-age*15)
        rattle+=attack*(.079*Math.sin(twoPi*482*age)+.046*Math.sin(twoPi*913*age)+.12*(fast-slow))
      }
    }
    const draft=(slow*.35+fast*.065)*gust
    const fade=Math.min(1,time*13,(seconds-time)*13)
    samples[i]=Math.tanh((draft+rattle)*fade)
  }
  return samples
}
