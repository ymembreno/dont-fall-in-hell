export const MAX_LEVEL = 20
export const TOOLS = ['Azul', 'Electricidad', 'Presión', 'Fuego', 'Hielo', 'Roja']
export const COLORS = [0x399fff, 0xffca4c, 0xa3a3a3, 0xff7039, 0x9be7f7, 0xe53835]
export const progressKey = name => 'cheto-del-terror:v1:' + name.trim().normalize('NFC').toLocaleLowerCase()

export function readProgress(name) {
  try {
    const progress = JSON.parse(localStorage.getItem(progressKey(name)))
    if (!progress || typeof progress.name !== 'string' || !progress.name.trim()) return null
    return {name: progress.name, level: Math.max(1, Math.min(MAX_LEVEL, Math.trunc(progress.level) || 1)), complete: progress.complete === true}
  } catch {
    return null
  }
}

export function mergeProgress(previous, next) {
  return {...next,level:Math.max(previous?.level ?? 1,next.level),complete:!!(previous?.complete || next.complete)}
}

export function sequence(level) {
  let state = Math.imul(level, 2654435761) >>> 0
  const random = limit => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state >>> 12) % limit
  }
  const code = [0,1,2,3,4,5]
  for (let i = code.length - 1; i > 0; i--) {
    const j = random(i + 1)
    ;[code[i], code[j]] = [code[j], code[i]]
  }
  return code
}

export function levelLayout(level) {
  const length = 49 + (level - 1) * 2.2
  let state = Math.imul(level, 1597334677) >>> 0
  const random = () => ((state = (Math.imul(state,1664525) + 1013904223) >>> 0) / 4294967296)
  const barriers = []
  const terminals = []
  let side = random() < .5 ? -1 : 1
  for (let distance = 11; distance < length - (level === MAX_LEVEL ? 11.5 : 7); distance += 7.5 + random()*4) {
    const width = 1.9 + random()*.72
    const x = side*(4.03-width/2)
    barriers.push({x,z:-distance,width,depth:.62 + random()*.46, side})
    side *= -1
  }
  for (let index = 0; index < 3; index++) {
    const barrier = barriers[Math.floor(index*(barriers.length-1)/2)]
    terminals.push({side:random()<.5?-1:1,z:barrier.z+2.2+random()*.7})
  }
  terminals.push({side:-terminals[1].side,z:terminals[1].z})
  const ducts = []
  for (let i=0;i<barriers.length-1;i+=2) {
    const front=barriers[i]
    const back=barriers[i+1]
    const span=front.z-back.z
    const depth=Math.min(4.1,span*.42)
    const candidates=[.5,.36,.64].flatMap(fraction=>[-front.side,front.side].map(side=>({
      x:side*3.1, z:front.z-span*fraction, width:1.8, depth
    })))
    const duct=candidates.find(({x,z})=>terminals.every(terminal=>
      Math.sign(x)!==terminal.side || Math.abs(terminal.z-z)>(depth+1.35)/2+.15
    ))
    if (duct) ducts.push(duct)
  }
  let guardZ=-16
  while (guardZ > -length+2 && terminals.some(terminal=>Math.abs(terminal.z-guardZ)<6)) guardZ-=.25
  const sections = [
    {from:7,to:length*.38,name:'Pasillo de servicio'},
    {from:length*.38,to:length*.68,name:'Galería de mantenimiento'},
    {from:length*.68,to:length-4,name:'Tramo de la compuerta'}
  ]
  const usedExits = new Set()
  const terminalExits = new Set()
  const visitedSections = new Set()
  for (const duct of ducts) {
    if (ducts.indexOf(duct)%2===0) {
      const targets=terminals.filter(terminal=>Math.abs(terminal.z-duct.z)>6
        && !usedExits.has(terminal.z) && !terminalExits.has(terminal.z))
      const terminal=targets[Math.floor(random()*targets.length)]
      if (terminal) {
        terminalExits.add(terminal.z)
        usedExits.add(terminal.z)
        duct.exit={name:'Junto a un terminal',x:terminal.side*1.05,z:terminal.z}
        continue
      }
    }
    const candidates = sections.flatMap(({from,to,name})=>{
      const exits = []
      for (let distance=Math.ceil(from);distance<to;distance+=1) {
        const z=-distance
        if (Math.abs(z-duct.z)<8 || usedExits.has(z)) continue
        if (barriers.some(barrier=>Math.abs(z-barrier.z)<1.25)) continue
        if (terminals.some(terminal=>Math.abs(z-terminal.z)<1.15) || Math.abs(z-guardZ)<3.2) continue
        if (ducts.some(other=>Math.abs(z-other.z)<other.depth/2+1.1)) continue
        exits.push({z,name})
      }
      return exits
    })
    const fresh=candidates.filter(exit=>!visitedSections.has(exit.name))
    const pool=fresh.length ? fresh : candidates
    const exit=pool[Math.floor(random()*pool.length)] ?? {z:-length+3,name:'Tramo de la compuerta'}
    usedExits.add(exit.z)
    visitedSections.add(exit.name)
    duct.exit={...exit,x:(random()<.5?-1:1)*1.05}
  }
  const finalDuct=level===MAX_LEVEL ? {x:3.1,z:-length+5.05,width:1.8,depth:7.8,final:true} : null
  if (finalDuct) {
    ducts.push(finalDuct)
  }
  return {length, barriers, terminals, ducts, guardZ, finalDuct}
}

export function overlapsBarrier(barrier, x, z, margin = 0) {
  return Math.abs(x-barrier.x) < barrier.width/2+margin && Math.abs(z-barrier.z) < barrier.depth/2+margin
}

export function clearSight(barriers, from, to) {
  return !barriers.some(({x,z,width,depth}) => {
    let near = 0
    let far = 1
    for (const [origin, delta, center, half] of [
      [from.x,to.x-from.x,x,width/2],
      [from.z,to.z-from.z,z,depth/2]
    ]) {
      if (Math.abs(delta) < .00001) {
        if (Math.abs(origin-center) > half) return false
        continue
      }
      const first = (center-half-origin)/delta
      const last = (center+half-origin)/delta
      near = Math.max(near,Math.min(first,last))
      far = Math.min(far,Math.max(first,last))
      if (near > far) return false
    }
    return true
  })
}

export const terminalFor = tool => tool === 5 ? 3 : tool === 3 || tool === 4 ? 1 : tool

export function predictPosition(lastSeen, velocity, limits) {
  return {
    x: Math.max(-3.37, Math.min(3.37, lastSeen.x + velocity.x*.85)),
    z: Math.max(limits.minZ, Math.min(limits.maxZ, lastSeen.z + velocity.z*.85))
  }
}
