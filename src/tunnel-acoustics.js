function noiseGenerator(seed) {
  return () => {
    seed = (Math.imul(seed,1664525)+1013904223)>>>0
    return seed/2147483648-1
  }
}

export function tunnelImpulse(rate,seed) {
  const samples=new Float32Array(Math.ceil(rate*2.8))
  const noise=noiseGenerator(seed)
  const side=seed%2
  for(const [time,gain] of [[.036,.43],[.082,.32],[.147,.25],[.251,.19],[.398,.10]]) {
    samples[Math.round((time+side*.007)*rate)]=gain
  }
  let low=0
  for(let i=Math.round(rate*.052);i<samples.length;i++) {
    const time=i/rate-.052
    low+=.18*(noise()-low)
    const buildup=Math.min(1,time*19)
    samples[i]+=low*buildup*Math.exp(-time*2.82)*.025
  }
  return samples
}

function hingeCreak(rate,seed) {
  const duration=.76
  const samples=new Float32Array(Math.ceil(rate*duration))
  const noise=noiseGenerator(seed)
  const pitch=520+Math.abs(seed%83)
  let phase=0
  let friction=0
  for(let i=0;i<samples.length;i++) {
    const t=i/rate
    const progress=t/duration
    const drag=Math.sin(Math.PI*progress)**1.25
    const stutter=.45+.55*Math.sin(t*47+Math.sin(t*19))**2
    phase+=2*Math.PI*(pitch+480*drag+96*Math.sin(t*27)+34*Math.sin(t*119))/rate
    friction+=.21*(noise()-friction)
    const squeal=Math.sin(phase)+.36*Math.sin(phase*2.03)+.14*Math.sin(phase*3.12)
    const groan=.32*Math.sin(phase*.31)
    samples[i]=Math.tanh(drag*(stutter*(squeal*.28+groan)+friction*.23))
  }
  return samples
}

export function surfaceContact(rate,seed,kind) {
  if(kind==='hinge') return hingeCreak(rate,seed)
  const claw=kind==='claw'
  const metal=kind==='metal'
  const noise=noiseGenerator(seed)
  const length=claw?.59:metal?.29:.25
  const samples=new Float32Array(Math.ceil(rate*length))
  let bass=0, middle=0, phase=0
  const bumps=claw?[.004,.036,.091,.144,.23,.34,.39]:[.006,.049,.084]
  for(let i=0;i<samples.length;i++){
    const t=i/rate
    const white=noise()
    bass+=.025*(white-bass)
    middle+=.19*(white-middle)
    let strike=0
    for(const contact of bumps){
      const dt=t-contact
      if(dt>0) strike+=Math.min(1,dt*650)*Math.exp(-dt*(claw?56:103))
    }
    const envelope=Math.min(1,t*90)*Math.max(0,1-t/length)**1.4
    phase+=(claw?950+480*Math.sin(t*8.3)+90*Math.sin(t*61):metal?350:121)/rate
    const grit=white-middle
    const thickness=claw?.29:.18
    const rasp=claw ? envelope*(.26+Math.sin(t*61)**2*.39) : 0
    const body=(strike*.58+rasp)*(thickness*(middle-bass)+grit*(claw?.23:.09))
    const ring=claw ? (.024*strike+.064*rasp)*Math.sin(phase*2*Math.PI)
      : strike*(metal?.019:.041)*Math.sin(phase*2*Math.PI)
    samples[i]=Math.tanh((body+ring+strike*bass*.17)*2.8)
  }
  return samples
}

export function thunderSound(rate) {
  const length=3.1
  const samples=new Float32Array(Math.ceil(rate*length))
  const noise=noiseGenerator(14641)
  let bass=0, air=0
  for(let i=0;i<samples.length;i++){
    const t=i/rate
    const white=noise()
    bass+=.014*(white-bass)
    air+=.072*(white-air)
    const head=Math.min(1,t*95)*Math.exp(-t*10)
    const rumble=Math.min(1,t*4.8)*Math.exp(-t*1.52)
    const clusters=.62+.23*Math.sin(t*10.2)+.15*Math.sin(t*24.1)
    const end=Math.min(1,(length-t)*12)
    samples[i]=Math.tanh((bass*2.7*rumble*clusters+(air-bass)*head*.84+white*head*.145)*1.45)*end
  }
  return samples
}
