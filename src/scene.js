import * as T from 'three'
import {translate} from './language.js'
import {lightBetrays} from './light-guide.js'
import {makeScream} from './scream.js'
import {menuAmbience, sealedWindowNoise} from './menu-ambience.js'
import {surfaceContact, thunderSound, tunnelImpulse} from './tunnel-acoustics.js'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {COLORS, TOOLS, clearSight, levelLayout, overlapsBarrier, predictPosition, sequence, terminalFor} from './rules.js'

const position = (object, x, y, z) => {
  object.position.set(x, y, z)
  return object
}

function texture(kind) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  let seed = 251
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  const pixels = ctx.createImageData(256, 256)
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4
    const value = (kind === 'steel' ? 83 : 58) + random()*32 + Math.sin(x/21)*7 + Math.cos(y/11+x/30)*8
    pixels.data.set([value*1.05, value*.99, value*.9, 255], i)
  }
  ctx.putImageData(pixels, 0, 0)
  for (let i = 0; i < 1900; i++) {
    ctx.fillStyle = random() < .5 ? 'rgba(0,0,0,.15)' : 'rgba(181,122,72,.09)'
    ctx.fillRect(random()*256, random()*256, 1+random()*14, 1+random()*2)
  }
  for (let i=0;i<24;i++) {
    const x=random()*256
    const y=random()*256
    const radius=8+random()*40
    const stain=ctx.createRadialGradient(x,y,0,x,y,radius)
    stain.addColorStop(0,i%4===0?'rgba(111,46,23,.45)':'rgba(7,13,13,.44)')
    stain.addColorStop(1,'rgba(0,0,0,0)')
    ctx.fillStyle=stain
    ctx.fillRect(x-radius,y-radius,radius*2,radius*2)
    if (kind==='wall') {
      ctx.fillStyle='rgba(13,18,17,.16)'
      ctx.fillRect(x,y,1+random()*3,12+random()*85)
    }
  }
  if (kind !== 'steel') {
    ctx.strokeStyle = '#272522'
    ctx.lineWidth = 4
    ctx.strokeRect(1, 1, 254, 254)
    ctx.beginPath()
    ctx.moveTo(0,128); ctx.lineTo(256,128); ctx.stroke()
  }
  const result = new T.CanvasTexture(canvas)
  result.colorSpace = T.SRGBColorSpace
  result.anisotropy = 4
  return result
}

function surfaceMaps(source, relief) {
  const width=source.image.width
  const height=source.image.height
  const base=source.image.getContext('2d').getImageData(0,0,width,height).data
  const normal=new Uint8Array(width*height*4)
  const rough=new Uint8Array(width*height*4)
  const shade=(x,y)=>base[(((y+height)%height)*width+(x+width)%width)*4+1]/255
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const offset=(y*width+x)*4
    const dx=(shade(x-1,y)-shade(x+1,y))*relief
    const dy=(shade(x,y+1)-shade(x,y-1))*relief
    const magnitude=Math.hypot(dx,dy,1)
    normal.set([128+127*dx/magnitude,128+127*dy/magnitude,128+127/magnitude,255],offset)
    const patch=.5+.24*Math.sin(x*.034+y*.071)+.16*Math.cos(y*.028-x*.057)
    const grain=Math.abs(shade(x,y)-shade(x+1,y))
    const value=Math.round(255*T.MathUtils.clamp(.3+patch*.64+grain,.24,1))
    rough.set([value,value,value,255],offset)
  }
  function map(bytes) {
    const texture=new T.DataTexture(bytes,width,height)
    texture.flipY=true
    texture.generateMipmaps=true
    texture.minFilter=T.LinearMipmapLinearFilter
    texture.magFilter=T.LinearFilter
    texture.anisotropy=4
    texture.needsUpdate=true
    return texture
  }
  return {normalMap:map(normal),roughnessMap:map(rough)}
}

function placard(lines, tint = '#e9dbc3', bloody=false) {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 384
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bloody?'#150b09':'#1c1a17'
  ctx.fillRect(0,0,768,384)
  ctx.strokeStyle = bloody?'#3b1914':'#80705b'
  ctx.lineWidth = 7
  ctx.strokeRect(19,18,730,348)
  ctx.fillStyle = tint
  ctx.font = bloody ? 'italic bold 75px "Marker Felt", cursive' : 'bold 65px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line,index)=>{
    const y=192+(index-(lines.length-1)/2)*77
    ctx.fillText(line,384,y,690)
    if(!bloody) return
    const width=Math.min(680,ctx.measureText(line).width)
    for(let drip=0;drip<17;drip++) {
      const offset=.09+.82*(Math.sin(drip*5.7+index*2.8)*.5+.5)
      const x=384-width/2+width*offset
      const length=9+(Math.cos(drip*1.4+index)*.5+.5)*45
      ctx.fillStyle=drip%3===0?'#5a1311':'#87251c'
      ctx.fillRect(x,y+9,2+drip%4,length)
    }
    ctx.fillStyle=tint
  })
  const map = new T.CanvasTexture(canvas)
  map.colorSpace = T.SRGBColorSpace
  return new T.MeshBasicMaterial({map})
}

export function createGame(host, callbacks) {
  const renderer = new T.WebGLRenderer({antialias:true, powerPreference:'high-performance'})
  const maxPixelRatio=Math.min(devicePixelRatio,1.35)
  let renderPixelRatio=maxPixelRatio
  renderer.setPixelRatio(renderPixelRatio)
  renderer.shadowMap.enabled=true
  renderer.shadowMap.type=T.PCFShadowMap
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = .88
  host.append(renderer.domElement)
  const scene = new T.Scene()
  scene.background = new T.Color(0x050507)
  scene.fog = new T.FogExp2(0x09090d, .05)
  const camera = new T.PerspectiveCamera(68, 1, .07, 96)
  camera.rotation.order = 'YXZ'
  scene.add(camera)
  scene.add(new T.HemisphereLight(0x79889e, 0x210b11, .27))
  const lamp = new T.SpotLight(0xdbeaff, 88, 35, .39, .74, 1.35)
  position(lamp, .1,.03,-.15)
  position(lamp.target, 0,-.12,-10)
  camera.add(lamp, lamp.target)
  lamp.shadow.mapSize.set(2048,2048)
  lamp.shadow.radius=2.2
  lamp.shadow.camera.near=.16
  lamp.shadow.camera.far=32
  lamp.shadow.bias=-.00018
  lamp.shadow.normalBias=.015
  const wallMap = texture('wall')
  const steelMap = texture('steel')
  const wallMaps=surfaceMaps(wallMap,3.2)
  const steelMaps=surfaceMaps(steelMap,1.5)
  const concrete = new T.MeshStandardMaterial({map:wallMap,...wallMaps,roughness:.94,normalScale:new T.Vector2(.82,.82)})
  const floor = new T.MeshPhysicalMaterial({map:steelMap,...steelMaps,color:0x959b9a,
    metalness:.49,roughness:.47,clearcoat:.65,clearcoatRoughness:.19,normalScale:new T.Vector2(.52,.48)
  })
  const iron = new T.MeshStandardMaterial({map:steelMap, ...steelMaps, color:0x817a70, metalness:.68, roughness:.67})
  const rust = new T.MeshStandardMaterial({map:steelMap, ...steelMaps, color:0x99422a, roughness:.93, metalness:.3})
  const black = new T.MeshStandardMaterial({color:0x1c1b1a, roughness:.94})
  const stripe = new T.MeshStandardMaterial({color:0xa2783e, roughness:.84})
  const redGlow = new T.MeshBasicMaterial({color:0xff592c})
  const amberGlow = new T.MeshBasicMaterial({color:0xf2a458})
  const cube = new T.BoxGeometry()
  const sphere = new T.SphereGeometry(1,18,14)
  const cylinder = new T.CylinderGeometry(1, 1, 1, 14)
  const corridor = new T.Group()
  scene.add(corridor)
  function mesh(parent, geometry, material, x,y,z, sx,sy,sz) {
    const object = new T.Mesh(geometry,material)
    position(object,x,y,z)
    object.scale.set(sx,sy,sz)
    parent.add(object)
    return object
  }
  const box = (parent, material, ...values) => mesh(parent,cube,material,...values)
  const oval = (parent, material, ...values) => mesh(parent,sphere,material,...values)
  const pipe = (parent, material, ...values) => mesh(parent,cylinder,material,...values)
  const placards=[]
  let gameLanguage='es'
  function localizedPlacard(lines,tint,bloody=false) {
    const material=placard(lines,tint,bloody)
    placards.push({lines,tint,bloody,material})
    return material
  }
  function setLanguage(language) {
    gameLanguage=language
    for(const {lines,tint,bloody,material} of placards) {
      const next=placard(lines.map(line=>translate(language,line)),tint,bloody)
      material.map.dispose()
      material.map=next.map
      material.needsUpdate=true
      next.dispose()
    }
  }
  function label(parent, lines, x,y,z,w,h, yaw=0, tint, bloody=false) {
    const sign = mesh(parent,new T.PlaneGeometry(),localizedPlacard(lines,tint,bloody),x,y,z,w,h,1)
    sign.rotation.y = yaw
    return sign
  }
  function light(parent, color, intensity, distance, x,y,z) {
    const source = new T.PointLight(color,intensity,distance,1.5)
    parent.add(position(source,x,y,z))
    return source
  }
  let endZ = -49
  let barriers = []
  let ducts = []
  let ductWalls = []
  let ventEntrances=[]
  let boardedDuct=null
  let grapple=null
  const ventLift=.43
  const grappleStart=new T.Vector3()
  const grappleEnd=new T.Vector3()
  const grappleRing=new T.TorusGeometry(.14,.031,8,20)
  const grappleGlow=new T.MeshBasicMaterial({color:0x57caff})
  const handReach = 17
  let finalDuct = null
  const ductGlow = new T.MeshBasicMaterial({color:0x8dbfcc})
  const ductSign = localizedPlacard(['VENTILACIÓN','C · AGACHARSE'],'#a5d9e0')
  const ductSignGeometry = new T.PlaneGeometry()
  const escapeSign = localizedPlacard(['SALIDA','E · ABRIR REJILLA'],'#c2f5d8')
  const finalVentSign = localizedPlacard(['ESCAPE','C · ENTRAR'],'#e3c992')
  const passageSign = localizedPlacard(['DERIVACIÓN','E · ATRAVESAR'],'#a5d9e0')
  const tiles = new T.Group()
  const partitions = new T.Group()
  const stainGeometry=new T.PlaneGeometry()
  function bloodStain(seed, dragged) {
    const canvas=document.createElement('canvas')
    canvas.width=canvas.height=256
    const ctx=canvas.getContext('2d')
    const next=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)
    for(let blot=0;blot<84;blot++){
      const x=128+(next()-.5)*(dragged?73:170)
      const y=128+(next()-.5)*(dragged?191:135)
      const radius=2+next()*(dragged?25:36)
      const shade=next()
      ctx.save()
      ctx.translate(x,y)
      ctx.scale(dragged?.49:1,dragged?1.9:.72)
      const wash=ctx.createRadialGradient(0,0,1,0,0,radius)
      wash.addColorStop(0,shade>.64?'rgba(63,6,9,.81)':'rgba(35,5,6,.70)')
      wash.addColorStop(.56,'rgba(66,7,7,.49)')
      wash.addColorStop(1,'rgba(61,7,8,0)')
      ctx.fillStyle=wash
      ctx.fillRect(-radius,-radius,radius*2,radius*2)
      ctx.restore()
    }
    for(let drop=0;drop<48;drop++){
      const x=18+next()*220
      const y=19+next()*219
      const radius=.5+next()*2.4
      ctx.fillStyle='rgba(64,7,10,.71)'
      ctx.beginPath()
      ctx.ellipse(x,y,radius,radius*(dragged?1.9:.7),0,0,Math.PI*2)
      ctx.fill()
    }
    const map=new T.CanvasTexture(canvas)
    map.colorSpace=T.SRGBColorSpace
    return new T.MeshPhysicalMaterial({
      map,color:0xc89b91,roughness:dragged?.52:.33,clearcoat:.43,transparent:true,depthWrite:false
    })
  }
  const stainMaterials=[bloodStain(1277,false),bloodStain(6339,true),bloodStain(3841,false)]
  const corridorStains=new T.Group()
  corridor.add(corridorStains)
  function placeStains(length) {
    corridorStains.clear()
    for(let distance=8;distance<length-1.5;distance+=6.8) {
      const index=Math.round(distance/6.8)
      const offset=1.6*Math.sin(distance*1.28)
      const smear=mesh(corridorStains,stainGeometry,stainMaterials[index%3],offset,.018,-distance,
        index%3===1?1.1:2.2,index%3===1?4.6:2.9,1)
      smear.rotation.set(-Math.PI/2,0,Math.sin(distance*.77)*.44)
      smear.receiveShadow=true
      if(index%3===0) {
        const side=index%2===0?1:-1
        const wall=mesh(corridorStains,stainGeometry,stainMaterials[2],side*3.986,.45,-distance+.64,1.53,1.12,1)
        wall.rotation.y=-side*Math.PI/2
        wall.receiveShadow=true
      }
    }
  }

  corridor.add(tiles,partitions)
  function buildTiles(length) {
    tiles.clear()
    const template = new T.Group()
    const batch = new Map()
    function collect() {
      template.updateMatrixWorld(true)
      for (const object of template.children) {
        const id = object.geometry.uuid+object.material.uuid
        if (!batch.has(id)) batch.set(id,{geometry:object.geometry,material:object.material,matrices:[]})
        batch.get(id).matrices.push(object.matrixWorld.clone())
      }
      template.clear()
    }
    for (let z = 8; z >= -length-4; z -= 4) {
    box(template,concrete,-4.28,2.45,z,.55,5.3,4)
    box(template,concrete,4.28,2.45,z,.55,5.3,4)
    box(template,concrete,0,5.02,z,8.5,.45,4)
    box(template,floor,0,-.17,z,8.45,.32,4)
    for (const x of [-3.95,3.95]) {
      box(template,iron,x,2.38,z,.27,4.8,.23)
      box(template,rust,x,3.97,z,.13,.14,4)
      box(template,iron,x,1.05,z,.12,.12,4)
      box(template,stripe,x*.79,.007,z,.14,.018,3.75)
      pipe(template,iron,x*.92,4.28,z,.16,4,.16).rotation.x = Math.PI/2
      pipe(template,rust,x*.92,4.28,z,.22,.17,.22).rotation.x = Math.PI/2
    }
    box(template,iron,0,4.66,z,8.12,.21,.37)
    for (let slat = 0; slat < 8; slat++) box(template,black,-3.55+slat*.12,.01,z,.036,.025,.85)
    if (z % 8 === 0) {
      for (const x of [-3.73,3.73]) {
        pipe(template,iron,x,2.35,z,.094,4.68,.094)
        for (const y of [.48,2.75,4.23]) pipe(template,rust,x,y,z,.143,.11,.143)
        box(template,black,x*.99,.2,z+1.37,.38,.39,.67)
      }
    }
    if (z % 12 === 0) {
      box(template,black,0,4.47,z,1.5,.26,.48)
      box(template,z === 0 ? redGlow : amberGlow,0,4.31,z,1.2,.045,.16)
    }
      collect()
    }
    for (const {geometry,material,matrices} of batch.values()) {
      const instances = new T.InstancedMesh(geometry,material,matrices.length)
      instances.receiveShadow=true
      instances.castShadow=material===iron || material===rust
      const tileTint=new T.Color()
      matrices.forEach((matrix,index)=>{
        instances.setMatrixAt(index,matrix)
        if(material===floor || material===concrete) {
          const z=matrix.elements[14]
          const tone=.91+Math.sin(z*.73)*.065+Math.cos(z*.31)*.038
          instances.setColorAt(index,tileTint.setRGB(tone,tone,tone))
        }
      })
      tiles.add(instances)
    }
  }
  const alarmLight=light(corridor,0xde211b,82,15,0,4.12,0)
  const failingLight=light(corridor,0xa6291d,62,16,0,3.99,-12)
  const rimLight=light(corridor,0xaf4140,35,10,2.85,3.1,-11.8)
  const corridorDownlight=new T.SpotLight(0x9eb9d9,53,17,.63,.51,1.7)
  position(corridorDownlight,-2.4,3.88,-15.2)
  position(corridorDownlight.target,.72,.08,-18)
  corridor.add(corridorDownlight,corridorDownlight.target)
  corridorDownlight.castShadow=true
  corridorDownlight.shadow.mapSize.set(1024,1024)
  corridorDownlight.shadow.autoUpdate=false
  corridorDownlight.shadow.needsUpdate=true
  corridorDownlight.shadow.camera.near=.35
  corridorDownlight.shadow.camera.far=17
  corridorDownlight.shadow.normalBias=.018
  corridorDownlight.shadow.bias=-.00013
  const cableMaterial = new T.MeshStandardMaterial({color:0x11191a,roughness:.78})
  const cable = (parent, points, radius, material=cableMaterial) => {
    const curve=new T.CatmullRomCurve3(points.map(([x,y,z])=>new T.Vector3(x,y,z)))
    parent.add(new T.Mesh(new T.TubeGeometry(curve,19,radius,6,false),material))
  }
  for (const z of [1,-7,-16,-28,-41]) {
    cable(corridor,[[-3.76,4.56,z],[ -2.3,4.13,z-.26],[.6,3.82,z-.53],[3.82,4.46,z-.82]],.03)
    cable(corridor,[[-3.87,4.31,z+.22],[-1.45,3.83,z+.14],[1.8,4.02,z-.36],[3.86,4.52,z-.64]],.019)
  }
  const haze = new T.ShaderMaterial({
    uniforms:{shift:{value:0}},transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv; uniform float shift; void main(){float band=sin(3.14159*vUv.x)*sin(3.14159*vUv.y);float grain=.7+.3*sin(vUv.x*15.0+vUv.y*6.0+shift);gl_FragColor=vec4(.43,.27,.22,band*band*grain*.09);}'
  })
  const hazePlane=new T.PlaneGeometry()
  for(const z of [-6,-15,-26,-42]) mesh(corridor,hazePlane,haze,0,.46,z,7.9,.9,1)
  box(corridor,concrete,0,2.4,10.02,8.5,5,.44)
  const backWall = box(corridor,concrete,0,2.4,-54,8.5,5,.44)
  const stairRail=new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0xa88a38,roughness:.69,metalness:.49})
  const stairTread=new T.MeshPhysicalMaterial({map:wallMap,...wallMaps,color:0x737375,
    roughness:.53,metalness:.22,clearcoat:.79,clearcoatRoughness:.16})
  for (let i=0; i<8; i++) {
    const height=(i+1)*.21
    const step=box(corridor,stairTread,0,height/2,2.35+i*.8,8.05,height,.82)
    step.receiveShadow=true
    box(corridor,iron,0,height+.006,1.96+i*.8,7.97,.018,.085).receiveShadow=true
  }
  box(corridor,stairTread,0,.84,9.35,8.05,1.68,1.3).receiveShadow=true
  for(const x of [-2.52,2.52]) {
    for(let span=0;span<4;span++){
      const z=2.15+span*1.63
      const y=.21+span*.42
      pipe(corridor,stairRail,x,y+.55,z,.044,1.1,.044).castShadow=true
      if(span<3) {
        const rail=pipe(corridor,stairRail,x,y+1.28,z+.815,.052,1.69,.052)
        rail.rotation.x=Math.atan2(1.63,.42)
        rail.castShadow=true
      }
    }
  }
  const dampPatch=new T.MeshPhysicalMaterial({
    color:0x2d2928,metalness:.56,roughness:.29,clearcoat:.88,clearcoatRoughness:.13
  })
  const dampGeometry=new T.CircleGeometry(1,24)
  for(let i=0;i<11;i++) {
    const z=1.1-i*1.56
    const x=Math.sin(i*3.8)*2.32
    const damp=mesh(corridor,dampGeometry,dampPatch,x,.003+i*.00015,z,.32+.18*(i%3),.49+.16*(i%4),1)
    damp.rotation.x=-Math.PI/2
    damp.receiveShadow=true
  }
  const stairLampGlass=new T.MeshBasicMaterial({color:0xffdcad})
  const redCageGlass=new T.MeshBasicMaterial({color:0xff4f3d})
  const fixtureRing=new T.TorusGeometry(.37,.020,6,28)
  for(const [x,y,z,red] of [[-1.24,4.34,5.65,false],[.7,4.43,-1.7,false],[2.98,2.98,2.15,true],[3.69,3,-8.25,true]]) {
    const fixture=new T.Group()
    corridor.add(position(fixture,x,y,z))
    if(red) fixture.rotation.z=-Math.PI/2
    pipe(fixture,black,0,.098,0,.40,.12,.40).castShadow=true
    oval(fixture,red?redCageGlass:stairLampGlass,0,-.055,0,.32,.19,.32)
    for(const offset of [-.08,-.21]) {
      const band=mesh(fixture,fixtureRing,iron,0,offset,0,1,1,1)
      band.rotation.x=Math.PI/2
    }
    for(let rib=0;rib<8;rib++){
      const angle=rib*Math.PI/4
      const x=Math.cos(angle), z=Math.sin(angle)
      cable(fixture,[[x*.38,.047,z*.38],[x*.37,-.15,z*.37],[x*.23,-.26,z*.23]],.017,iron)
    }
    light(fixture,red?0xff2820:0xffc780,red?28:39,8,0,-.31,0)
  }
  const wax=new T.MeshStandardMaterial({color:0xbca184,roughness:.85})
  const flame=new T.MeshBasicMaterial({color:0xffb04b})
  const stairCandles=[]
  for(const [x,z,base] of [[-3.62,4.12,.63],[3.60,-7.6,0]]) {
    for(let i=0;i<3;i++) {
      const h=.14+i*.06
      const offset=(i-1)*.105
      pipe(corridor,wax,x+offset,base+h/2,z+i*.13,.054,h,.054)
      const fire=oval(corridor,flame,x+offset,base+h+.041,z+i*.13,.022,.044,.018)
      stairCandles.push(fire)
    }
    light(corridor,0xff941f,10,4,x,base+.42,z+.12)
  }
  for(let index=0;index<4;index++) {
    const z=4.9-index*4.42
    const sag=.36+index*.07
    cable(corridor,[[-3.91,4.54,z],[-2.14,4.46,z+.18],[.12,4.43-sag,z+.45],
      [2.12,4.35,z+.81],[3.88,4.62,z+1]],.039,iron)
    cable(corridor,[[3.86,4.53,z+.35],[3.52,4.03,z+.61],[3.55,3.75,z+.80],
      [3.84,3.60,z+.93]],.031,rust)
  }
  for(const side of [-1,1]) {
    const stairWall=box(corridor,concrete,side*3.42,2.53,5.58,.81,4.85,6.70)
    stairWall.receiveShadow=true
    stairWall.castShadow=true
    box(corridor,iron,side*3.02,2.41,2.19,.19,4.75,.36).receiveShadow=true
    box(corridor,iron,side*3.02,2.41,5.07,.18,4.75,.26).receiveShadow=true
  }
  const warningPlate=box(corridor,iron,-2.995,2.76,4.55,.08,1.48,2.04)
  warningPlate.receiveShadow=true
  label(corridor,['ESCALERAS','AL INFIERNO','↓'],-2.946,2.76,4.55,1.87,1.28,Math.PI/2,'#f2d8ad')
  for(const y of [2.12,3.39]) for(const z of [3.65,5.44]) {
    pipe(corridor,rust,-2.939,y,z,.032,.018,.032).rotation.z=Math.PI/2
  }
  light(corridor,0xffc587,22,4,-2.49,3.65,4.84)
  light(corridor,0x9c101d,47,13,1.4,3.5,-12.4)
  label(corridor,['NO MIRES','ATRÁS'], -3.976,2.4,-27,2.1,1.1,Math.PI/2,'#ad3026',true)
  label(corridor,['NO TE','DETENGAS'],3.972,2.35,-13.9,2.28,1.05,-Math.PI/2,'#b03a2e',true)
  label(corridor,['ACÁ NO','AMANECE'],-3.975,2.3,-38.9,2.3,1.13,Math.PI/2,'#a52b25',true)
  const tutorial = new T.Group()
  corridor.add(tutorial)
  const windowGlass=new T.MeshPhysicalMaterial({color:0x263438,metalness:.25,roughness:.46,clearcoat:.58,
    emissive:0x111b20,emissiveIntensity:.48})
  const board=new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0x65503d,roughness:.98})
  function sealedWindow(parent,x,y,z,w,h,yaw) {
    const frame=new T.Group()
    parent.add(position(frame,x,y,z))
    frame.rotation.y=yaw
    box(frame,black,0,0,.035,w+.17,h+.16,.095)
    box(frame,windowGlass,0,0,.092,w-.12,h-.13,.025)
    for(const side of [-1,1]) {
      box(frame,iron,side*w*.5,0,.12,.13,h+.19,.18)
      box(frame,iron,0,side*h*.5,.12,w+.12,.12,.18)
    }
    box(frame,black,0,0,.119,.07,h,.045)
    box(frame,black,0,0,.119,w,.063,.045)
    for(let index=0;index<3;index++) {
      const plank=box(frame,board,0,(index-1)*h*.295,.226,w+.09,.19,.10)
      plank.rotation.z=[-.11,.19,-.13][index]
      for(const side of [-1,1]) {
        const nail=pipe(frame,iron,side*w*.41,(index-1)*h*.295+plank.rotation.z*side*w*.41,.284,.016,.024,.016)
        nail.rotation.x=Math.PI/2
      }
    }
    return frame
  }
  const windowLocations=[{x:-3.91,y:2.04,z:-4.8},{x:3.91,y:2.03,z:-10.7},{x:-3.91,y:1.86,z:-19.6},{x:3.91,y:1.73,z:-32.5},{x:-3.91,y:1.95,z:-41.7}]
  for(const {x,y,z} of windowLocations) sealedWindow(corridor,x,y,z,1.83,1.29,-Math.sign(x)*Math.PI/2)
  const windowFlash=light(corridor,0xbcccff,0,11,3.36,2.18,-10.7)
  const windowSource=new T.Vector3()
  const listenerRight=new T.Vector3()
  const surface=new T.Group()
  scene.add(position(surface,200,0,0))
  surface.visible=false
  const lightningLight=light(surface,0xa9c8ff,0,44,-3,7.9,-7.5)
  const lightning=new T.Group()
  surface.add(lightning)
  lightning.visible=false
  const lightningMaterial=new T.LineBasicMaterial({color:0xdde9ff,fog:false,transparent:true,opacity:1})
  for(const path of [
    [[-4.1,10.3,-11.5],[-3.6,8.3,-11.5],[-4.15,7.32,-11.5],[-3.13,6.12,-11.5],[-3.61,4.9,-11.5],[-2.69,3.38,-11.5],[-3.5,1.02,-11.5]],
    [[-3.13,6.12,-11.5],[-2.03,5.25,-11.5],[-2.20,4.3,-11.5],[-1.49,3.71,-11.5]],
    [[-4.15,7.32,-11.5],[-4.68,6.65,-11.5],[-5.48,6.47,-11.5]]
  ]) {
    const geometry=new T.BufferGeometry().setFromPoints(path.map(point=>new T.Vector3(...point)))
    lightning.add(new T.Line(geometry,lightningMaterial))
  }
  const soil=new T.MeshStandardMaterial({map:wallMap,...wallMaps,color:0x554536,roughness:.98})
  const bark=new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0x493926,roughness:.98})
  const pine=new T.MeshStandardMaterial({color:0x14201a,roughness:1})
  box(surface,soil,0,-.3,12,26,.59,18.6)
  box(surface,soil,0,-.3,-12,26,.59,12.5)
  for(const side of [-1,1]){
    box(surface,soil,side*7.15,-.3,-1.55,10.7,.59,8.5)
    box(surface,concrete,side*1.78,-1.8,-1.48,.24,3.59,8.45)
    box(surface,iron,side*1.82,.08,-1.48,.19,.17,8.48)
  }
  box(surface,black,0,-1.96,-5.8,3.6,3.92,.3)
  sealedWindow(surface,-.26,-1.53,-5.63,2.47,1.49,0)
  light(surface,0x728fbb,10,5,-1.27,-.44,-4.54)
  const cinematicArms=new T.Group()
  camera.add(cinematicArms)
  cinematicArms.visible=false
  const armCloth=new T.MeshStandardMaterial({map:wallMap,color:0x343830,roughness:.97})
  const armSkin=new T.MeshStandardMaterial({color:0x866555,roughness:.84})
  for(const side of [-1,1]) {
    const arm=new T.Group()
    cinematicArms.add(position(arm,side*.36,-.49,-.51))
    oval(arm,armCloth,0,-.08,.03,.085,.126,.30)
    oval(arm,armSkin,0,.07,-.27,.075,.108,.066)
    for(let digit=0;digit<4;digit++) oval(arm,armSkin,-.051+digit*.034,.142,-.28,.014,.067,.021)
    arm.rotation.x=-.68
    arm.rotation.z=side*.17
  }
  box(surface,concrete,0,-.04,2.8,3.7,.13,.31)
  for(let step=0;step<15;step++){
    const z=2.6-step*.54
    const y=-.16-step*.205
    box(surface,concrete,0,y-.092,z,3.34,.179,.55)
    box(surface,iron,0,y+.008,z+.25,3.34,.021,.053)
    if(step%4===0) for(const side of [-1,1]) pipe(surface,iron,side*1.51,y+.44,z,.035,.91,.035)
  }
  for(const side of [-1,1]) {
    const rail=pipe(surface,iron,side*1.51,-.71,-1.18,.044,8.1,.044)
    rail.rotation.x=-1.93
  }
  box(surface,bark,2.05,.64,2.0,.09,1.29,.10)
  label(surface,['ESCALERAS','AL INFIERNO'],2.05,1.24,2.06,1.43,.72,0,'#ee8c62')
  const cone=new T.ConeGeometry(1,1,8)
  let surfaceSeed=9143
  const scatter=()=>((surfaceSeed=(Math.imul(surfaceSeed,1664525)+1013904223)>>>0)/4294967296)
  for(let i=0;i<31;i++){
    const side=i%2===0?-1:1
    const x=side*(3.25+scatter()*7)
    const z=-6+scatter()*25
    const h=2.1+scatter()*3.8
    pipe(surface,bark,x,h*.45,z,.09+scatter()*.13,h*.9,.12).rotation.z=(scatter()-.5)*.18
    for(let layer=0;layer<3;layer++){
      const r=(1.42-layer*.25)*(h*.23)
      mesh(surface,cone,pine,x,h*(.66+layer*.15),z,r,h*.49,r)
    }
  }
  for(let i=0;i<39;i++){
    const x=(scatter()-.5)*18
    const z=-5+scatter()*21
    if(Math.abs(x)<2.05 && z<3.2) continue
    const size=.08+scatter()*.31
    box(surface,concrete,x,.009,z,size,.025+scatter()*.086,size*.87).rotation.y=scatter()*Math.PI
  }
  light(surface,0x8ab9ef,136,30,-3,6,5.2)
  light(surface,0xe8673d,25,9,1.27,-.74,-3.91)
  const guideOrb=new T.Group()
  tutorial.add(position(guideOrb,-2.31,1.36,-3.31))
  const guideHalo=new T.MeshBasicMaterial({color:0xf9bc63,transparent:true,opacity:.32,depthWrite:false})
  oval(guideOrb,new T.MeshBasicMaterial({color:0xffe9a4}),0,0,0,.13,.17,.13)
  oval(guideOrb,guideHalo,0,0,0,.31,.43,.31)
  light(guideOrb,0xffbb67,16,5.5,0,0,0)
  const safeBoundary = -5.8
  const safeGreen = new T.MeshBasicMaterial({color:0x73e8ae})
  box(tutorial,safeGreen,0,.019,safeBoundary,7.95,.025,.075)
  for (const x of [-3.74,3.74]) {
    box(tutorial,safeGreen,x,1.45,safeBoundary,.09,2.9,.09)
  }
  light(tutorial,0x51c893,38,8,0,3.35,-4.8)
  label(tutorial,['ZONA SEGURA'],0,3.57,safeBoundary+.08,2.2,.5,0,'#9ae9be')
  const slab = label(tutorial,['SECUENCIA','E · LEER'],.03,1.45,-4.05,1.86,.93)
  box(tutorial,iron,.03,1.46,-4.16,2.02,1.07,.2)
  box(tutorial,iron,.03,.59,-4.16,.21,1.4,.21)
  light(tutorial,0xffac66,13,6,0,2.4,-3.9)
  const terminals = [0,1,2,5].map(index => {
    const group = new T.Group()
    corridor.add(group)
    const glow = new T.MeshBasicMaterial({color:COLORS[index]})
    box(group,iron,0,1.24,0,.58,1.8,1.35)
    box(group,black,.31,1.62,0,.13,.63,.87)
    const button = box(group,glow,.4,1.58,0,.11,.2,.44)
    const title = index===1 ? 'AMARILLA' : TOOLS[index].toUpperCase()
    label(group,[title],.34,2.22,0,1.15,.51,Math.PI/2)
    light(group,COLORS[index],28,7,.65,1.56,0)
    return {group,button,tool:index}
  })
  const clueLEDs=[-1,1].map(side=>{
    const marker=new T.Group()
    corridor.add(marker)
    marker.visible=false
    box(marker,iron,0,1.38,0,.11,.94,.27)
    const material=new T.MeshBasicMaterial({color:0xffbf5f})
    for(let segment=0;segment<5;segment++) {
      box(marker,material,-side*.062,1.04+segment*.17,0,.025,.125,.092)
    }
    const spill=light(marker,0xffbf5f,0,3,-side*.19,1.38,0)
    return {side,marker,material,spill}
  })
  function updateClueLEDs() {
    const terminal=read && !opening ? terminals[terminalFor(code[progress])] : null
    for(const {side,marker,material,spill} of clueLEDs) {
      marker.visible=phase==='play' && !opening && (!terminal || terminal.group.position.x*side>0)
      if(!marker.visible) continue
      marker.position.set(side*3.74,0,terminal?.group.position.z??-4.05)
      const color=terminal ? COLORS[code[progress]] : 0xffbf5f
      material.color.setHex(color)
      spill.color.setHex(color)
      spill.intensity=5+1.2*Math.sin(time*3)
    }
  }
  const exit = new T.Group()
  corridor.add(exit)
  const liftPlate=new T.Group()
  exit.add(position(liftPlate,0,0,-1.09))
  liftPlate.visible=false
  box(liftPlate,floor,0,.012,-.12,3.15,.06,1.48).receiveShadow=true
  for(const x of [-1.56,1.56]) {
    box(liftPlate,iron,x,1.71,-.16,.15,3.42,1.39).receiveShadow=true
    box(liftPlate,stripe,x,1.22,-.16,.17,.10,1.34)
  }
  light(liftPlate,0xffd0a0,12,4,0,3.22,-.22)
  box(liftPlate,iron,0,4.09,0,2.38,.64,.16)
  label(liftPlate,['ASCENSOR'],0,4.09,.092,2.18,.48)
  const liftIndicators=Array.from({length:3},(_,index)=>
    box(liftPlate,new T.MeshBasicMaterial({color:0x351917}), (index-1)*.31,3.58,.08,.18,.105,.045))
  let liftStarted=0
  const liftViewOrigin=new T.Vector3()
  function beginLiftDescent() {
    phase='lift'
    liftStarted=time
    liftViewOrigin.copy(camera.position)
    keys.clear()
    resetLaunches()
    release()
    callbacks.current.liftStart()
    callbacks.current.message('Ascensor restaurado. Descendiendo…')
    playContact('metal',.65,0,1.2,1)
    tone(72,46,1.15,.26,'triangle')
  }
  function animateLiftDescent() {
    const elapsed=time-liftStarted
    const drop=T.MathUtils.smoothstep(elapsed,.22,1.83)*3.2
    liftPlate.position.y=-drop
    camera.position.copy(liftViewOrigin)
    camera.position.y-=drop
    camera.position.x+=Math.sin(elapsed*24)*.012*(1-Math.min(elapsed/2,1))
    if(elapsed>=2.08) resolve('clear')
  }
  const gate = new T.Group()
  exit.add(gate)
  for (const x of [-3.1,3.1]) box(exit,iron,x,2.5,0,2,5,.7)
  box(exit,iron,0,4.26,0,5,.7,.64)
  for (let i=0;i<9;i++) box(gate,i%2 ? iron : rust,-2.04+i*.51,1.96,0,.49,3.92,.28)
  for (const y of [.44,2.4,3.55]) box(gate,black,0,y,.22,4.6,.19,.21)
  label(exit,['COMPUERTA'],0,4.24,.37,2.1,.52)
  const gateLamp = box(exit,redGlow,0,3.9,.42,.56,.12,.07)
  light(exit,0xea4624,44,9,0,3.95,1.4)

  function applyLayout(layout, showBarriers) {
    endZ = -layout.length
    exit.position.z = endZ
    backWall.position.z = endZ-2
    for (const tile of tiles.children) tile.dispose()
    buildTiles(layout.length)
    placeStains(layout.length)
    partitions.clear()
    barriers = showBarriers ? layout.barriers : []
    for (const barrier of barriers) {
      const {x,z,width,depth,side} = barrier
      box(partitions,concrete,x,2.44,z,width,4.88,depth)
      box(partitions,iron,x,3.87,z+depth/2,width,.2,.15)
      box(partitions,rust,x-side*width/2,2.44,z,.15,4.88,depth+.15)
      box(partitions,amberGlow,x-side*(width/2-.12),2.35,z+depth/2+.085,.15,.52,.05)
    }
    ducts = showBarriers ? layout.ducts : []
    finalDuct = showBarriers ? layout.finalDuct : null
    ductWalls = []
    ventEntrances=[]
    for (const duct of ducts) {
      const {x,z,width,depth} = duct
      const side=Math.sign(x)
      const insideEdge=x-side*width/2
      ductWalls.push({x:insideEdge,z,width:.12,depth})
      box(partitions,iron,x,.22,z,width,.42,depth)
      box(partitions,iron,x,1.17+ventLift,z,width+.12,.17,depth)
      box(partitions,iron,insideEdge,.74,z,.12,1.56,depth)
      for(const facing of duct.final?[1]:[1,-1]) {
        const lip=z+facing*depth/2
        const hatch=new T.Group()
        partitions.add(position(hatch,x,1.39,lip))
        box(hatch,iron,0,-.42,0,width-.07,.86,.13)
        for(let bar=-2;bar<=2;bar++) box(hatch,black,bar*.21,-.42,facing*.077,.065,.71,.032)
        const anchor=mesh(partitions,grappleRing,grappleGlow,x,1.61,lip+facing*.16,1,1,1)
        box(partitions,iron,x,1.73,lip+facing*.14,.35,.12,.13)
        ventEntrances.push({duct,lip,facing,hatch,anchor,open:false})
      }
      if (duct.final) {
        const back=z-depth/2
        ductWalls.push({x,z:back,width,depth:.18})
        box(partitions,iron,x,1.0,back,width,1.12,.18)
        mesh(partitions,ductSignGeometry,escapeSign,x,1.05,back+.10,1.36,.61,1)
        mesh(partitions,ductSignGeometry,finalVentSign,x,1.96,z+depth/2+.14,1.48,.6,1)
        for (let i=1;i<8;i++) box(partitions,i%2===0?ductGlow:black,x,1.42,z+depth/2-i*.91,width-.19,.035,.065)
        continue
      }
      for (const offset of [-depth/2,depth/2]) {
        box(partitions,ductGlow,x,1.50,z+offset,width,.042,.075)
        const sign=mesh(partitions,ductSignGeometry,ductSign,x,1.92,z+offset*1.04,1.3,.58,1)
        sign.rotation.y=offset<0?Math.PI:0
      }
      mesh(partitions,ductSignGeometry,passageSign,x,.98,z-depth/2+.19,.99,.38,1)
      const outlet=duct.exit
      const outletX=Math.sign(outlet.x)*3.89
      const outletZ=outlet.name==='Junto a un terminal' ? outlet.z+1.3 : outlet.z
      box(partitions,iron,outletX,.55,outletZ,.17,1.1,1.38)
      for (let slat=-4;slat<=4;slat++) {
        box(partitions,slat%2 ? black : ductGlow,outletX-Math.sign(outletX)*.1,.51+slat*.087,outletZ,.035,.035,1.06)
      }
      for (let offset=-depth/2+.4;offset<depth/2;offset+=.69) {
        box(partitions,black,insideEdge-side*.007,.45,z+offset,.14,.48,.41)
        box(partitions,stripe,x,.43,z+offset,width-.18,.025,.055)
      }
    }
    terminals.forEach(({group},i)=>{
      const {side,z} = layout.terminals[i]
      position(group,side*3.78,0,z)
      group.rotation.y=side===1 ? Math.PI : 0
    })
    partitions.traverse(object=>{
      if (object.isMesh && !object.material.transparent) {
        object.receiveShadow=true
        object.castShadow=object.material!==ductGlow && object.material!==escapeSign
      }
    })
    gate.traverse(object=>{if(object.isMesh) object.castShadow=true})
    corridor.updateMatrixWorld(true)
  }

  const openGlow = new T.MeshBasicMaterial({color:0x9ce1b7})

  function sculpt(parent,material,rings,phase=0) {
    const segments=24
    const vertices=[]
    const uv=[]
    const indices=[]
    for (let ring=0;ring<rings.length;ring++) {
      const [y,radiusX,radiusZ,centerX=0,centerZ=0]=rings[ring]
      for (let side=0;side<=segments;side++) {
        const angle=side/segments*Math.PI*2
        const surface=1+.041*Math.sin(angle*3+ring*.69+phase)+.027*Math.cos(angle*7-ring*.55)
        vertices.push(centerX+Math.cos(angle)*radiusX*surface,y,centerZ+Math.sin(angle)*radiusZ*surface)
        uv.push(side/segments,ring/(rings.length-1))
        if (ring===rings.length-1 || side===segments) continue
        const lower=ring*(segments+1)+side
        const upper=lower+segments+1
        indices.push(lower,upper,lower+1,upper,upper+1,lower+1)
      }
    }
    const geometry=new T.BufferGeometry()
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3))
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const model=new T.Mesh(geometry,material)
    parent.add(model)
    return model
  }

  const bodyBoot = new RoundedBoxGeometry(1,1,1,2,.22)
  function humanoid() {
    const group = new T.Group()
    const torso = new T.Group()
    group.add(torso)
    const skin = new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0x504f43,roughness:.91})
    const shell = new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0x736652,roughness:.92,metalness:.21})
    const eye = new T.MeshBasicMaterial({color:0xe85028})
    const cloth = new T.MeshStandardMaterial({map:wallMap,...wallMaps,color:0x47443b,roughness:.96,
      normalScale:new T.Vector2(.34,.34)
    })
    const limbs = []
    const joints = []
    for (const side of [-1,1]) {
      const arm = new T.Group()
      const long=side===1
      torso.add(position(arm,side*(long?.47:.45),long?2.24:2.14,.02))
      sculpt(arm,cloth,[
        [-.62,.08,.09,side*.06,.013],[-.51,.12,.12,side*.065],[-.34,.145,.135,side*.045],
        [-.16,.19,.16,side*.035],[-.035,.21,.164],[.095,.147,.125],[.127,.004,.004]
      ],side)
      const forearm=new T.Group()
      arm.add(position(forearm,side*.057,-.51,.025))
      const reach=long?.60:.48
      sculpt(forearm,skin,[
        [-reach-.09,.055,.071,side*.012,.052],[-reach+.03,.077,.074,side*.018,.024],
        [-reach*.65,.089,.095,side*.03,.02],[-reach*.33,.124,.107,side*.037,.021],
        [-.07,.13,.12,side*.018,.01],[.07,.079,.101]
      ],long?1.8:-.8)
      sculpt(forearm,shell,[[-reach-.19,.02,.04,side*.005,.055],[-reach-.14,.098,.055,0,.055],
        [-reach-.05,.089,.066,0,.049],[-reach+.01,.051,.045,0,.043]])
      for (let finger=0;finger<4;finger++) {
        const x=(finger-1.5)*.046
        const span=[.124,.183,.198,.149][finger]*(long?1.12:1)
        cable(forearm,[[x,-reach-.128,.067],[x*1.16,-reach-.185,.098],
          [x*1.26,-reach-.165-span*.7,.147],[x*1.19,-reach-.15-span,.162]],.014+(finger===1?.004:0),skin)
        const nail=oval(forearm,shell,x*1.21,-reach-.15-span,.16,.012,.052,.016)
        nail.rotation.x=-.38
      }
      cable(forearm,[[side*.057,-reach-.07,.104],[side*.107,-reach-.125,.11],
        [side*.112,-reach-.23,.146],[side*.10,-reach-.25,.198]],.022,skin)
      limbs.push(arm)
      joints.push(forearm)
    }
    for (const side of [-1,1]) {
      const leg = new T.Group()
      group.add(position(leg,side*.205,1.25,0))
      sculpt(leg,cloth,[[-.68,.091,.11,.04*side,.087],[-.50,.13,.13,.036*side,.084],
        [-.31,.16,.16,.023*side,.019],[-.13,.19,.179],[.07,.18,.17]],side*2)
      const shin=new T.Group()
      leg.add(position(shin,side*.036,-.52,.078))
      sculpt(shin,skin,[[-.65,.092,.09,-.01*side,-.091],[-.51,.091,.094,0,-.108],
        [-.34,.10,.12,0,-.11],[-.18,.127,.133,0,-.055],[.055,.104,.107]])
      const boot=mesh(shin,bodyBoot,iron,0,-.651,.038,.225,.183,.391)
      boot.rotation.y=side*.13
      box(shin,black,0,-.729,.039,.223,.042,.38).rotation.y=side*.13
      limbs.push(leg)
      joints.push(shin)
    }
    sculpt(torso,cloth,[
      [1.14,.23,.15,0,-.032],[1.31,.33,.22,.01,-.035],[1.47,.294,.223,.023,-.022],
      [1.62,.31,.221,.01,-.01],[1.84,.417,.253,-.013,.023],
      [2.04,.49,.266,-.026,.022],[2.25,.494,.21,.015,-.031],
      [2.34,.379,.184,.047,-.059],[2.43,.17,.133,.025,-.02],[2.45,.096,.103,.019]
    ],.46)
    for (const side of [-1,1]) {
      cable(torso,[[side*.351,2.29,.077],[side*.295,2.15,.18],[side*.23,2.02,.241],
        [side*.264,1.83,.207],[side*.219,1.59,.174]],.021)
      for(let rib=0;rib<3;rib++) {
        const y=2.05-rib*.118
        cable(torso,[[side*.083,y-.042,.28],[side*.199,y,.265],[side*.31,y+.01,.181]],.013-rib*.002,skin)
      }
    }
    sculpt(torso,skin,[[2.28,.13,.12,0,.015],[2.43,.15,.122,.016,.093],[2.57,.10,.10,.005,.211]])
    const head = new T.Group()
    torso.add(position(head,0,2.43,.234))
    sculpt(head,skin,[
      [-.214,.025,.043,.037,.073],[-.159,.131,.148,.026,.059],[-.083,.185,.17,.01,.033],
      [.003,.217,.191,-.006,.025],[.12,.242,.226,-.015,.012],[.222,.24,.219,-.017,-.002],
      [.31,.189,.165,-.035,-.029],[.369,.106,.104,-.048,-.045],[.387,.004,.004,-.045,-.031]
    ])
    sculpt(head,shell,[
      [.057,.161,.081,.028,.164],[.105,.21,.097,.014,.151],[.18,.232,.107,.001,.155],
      [.244,.233,.088,-.024,.159],[.31,.18,.062,-.038,.135],[.345,.106,.031,-.05,.107],[.355,.016,.01,-.043,.085]
    ],1.7)
    oval(head,shell,.015,.113,.258,.044,.09,.045).rotation.z=-.09
    oval(head,black,.02,-.065,.198,.187,.136,.120)
    const jaw=new T.Group()
    head.add(position(jaw,.047,-.145,.197))
    oval(jaw,skin,.012,-.028,.01,.161,.049,.11).rotation.z=-.16
    oval(jaw,shell,.108,-.026,.021,.052,.04,.065).rotation.z=.39
    for (let i=-3;i<=3;i++) {
      const tooth=oval(jaw,shell,i*.037,-.004,.074,.011,.033+Math.abs(i)*.005,.018)
      tooth.rotation.z=i*.097
    }
    const rag=new T.MeshStandardMaterial({color:0x2e2321,roughness:1,side:T.DoubleSide})
    const tornEdges=new T.BufferGeometry()
    tornEdges.setAttribute('position',new T.Float32BufferAttribute([
      -.32,2.19,-.22, -.63,2.21,-.18, -.47,1.29,-.27,
      -.63,2.21,-.18, -.58,1.73,-.22, -.47,1.29,-.27,
      .25,2.22,-.30, .58,2.13,-.15, .52,1.56,-.23,
      .25,2.22,-.30, .52,1.56,-.23, .29,1.12,-.33
    ],3))
    tornEdges.computeVertexNormals()
    torso.add(new T.Mesh(tornEdges,rag))
    for (let j=-3;j<=3;j++) {
      oval(head,shell,j*.038,-.013,.265,.014,.038,.023)
    }
    for (const side of [-1,1]) {
      oval(head,black,side*.122,.178,.249,.104,.052,.047).rotation.z=side*.24
      const glint=oval(head,eye,side*.122,.178,.29,side===1?.028:.039,.014,.014)
      glint.rotation.z=side*.16
      oval(head,shell,side*.129,.214,.251,.09,.019,.043).rotation.z=side*.24
    }
    const split = new T.MeshStandardMaterial({color:0x211917,roughness:.9})
    cable(head,[[-.163,.38,.235],[-.202,.293,.272],[-.151,.237,.286],[-.175,.193,.292],[-.117,.123,.284]],.011,split)
    cable(head,[[-.151,.237,.288],[-.232,.212,.267],[-.259,.149,.237]],.007,split)
    cable(head,[[.19,.332,.238],[.141,.247,.269],[.182,.194,.284],[.147,.113,.291],[.193,.044,.247]],.009,split)
    cable(torso,[[-.18,2.52,.03],[-.31,2.36,.21],[-.35,2.11,.28],[-.38,1.82,.1]],.029)
    cable(torso,[[.31,2.44,-.14],[.47,2.21,-.25],[.39,1.99,-.31],[.21,1.65,-.2]],.028)
    for(const side of [-1,1]) {
      for(let i=0;i<4;i++) box(head,iron,side*(.211+i*.006),.292-i*.049,.25+i*.011,.045,.012,.027).rotation.z=side*(.36+i*.16)
    }
    scene.add(group)
    return {group,limbs,joints,torso,head,jaw,skin,shell,eye}
  }
  function goatCrawler() {
    const group=new T.Group()
    const torso=new T.Group()
    group.add(torso)
    const bone=new T.MeshPhysicalMaterial({map:steelMap,...steelMaps,color:0xc8b195,roughness:.73,clearcoat:.09})
    const rot=new T.MeshStandardMaterial({map:wallMap,...wallMaps,color:0x33211b,roughness:.9})
    const horn=new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0x392b22,roughness:.66})
    const blood=new T.MeshPhysicalMaterial({color:0x631e18,roughness:.31,clearcoat:.82,clearcoatRoughness:.22})
    const oldBlood=new T.MeshStandardMaterial({map:steelMap,color:0x3c1212,roughness:.76})
    const eye=new T.MeshBasicMaterial({color:0x8a2816})
    const spine=sculpt(torso,rot,[
      [-.69,.044,.039],[-.53,.19,.13],[-.30,.24,.15],[-.01,.30,.18],
      [.23,.34,.18],[.44,.30,.16],[.59,.21,.132],[.68,.07,.063]
    ],1.8)
    position(spine,0,.58,-.24)
    spine.rotation.x=1.35
    for(let rib=0;rib<7;rib++){
      const z=.28-rib*.143
      const w=.38-rib*.027
      const y=.73-rib*.032
      oval(torso,bone,0,y+.074,z,.098,.064,.077)
      for(const side of [-1,1]){
        cable(torso,[[side*.055,y+.064,z],[side*w*.74,y+.018,z+.031],[side*w,y-.114,z+.073],
          [side*w*.69,y-.257,z+.127],[side*.113,y-.239,z+.17]],.027-rib*.0019,bone)
        if((rib+side)%3===0) cable(torso,[[side*w*.76,y-.078,z+.059],
          [side*w*.72,y-.139,z+.071],[side*w*.65,y-.226,z+.13]],.016,oldBlood)
      }
    }
    for(let part=0;part<4;part++){
      oval(torso,part%2?bone:oldBlood,(part-1.5)*.111,.29,-.92,.097,.076,.17)
    }
    const head=new T.Group()
    torso.add(position(head,0,.91,.42))
    sculpt(head,bone,[
      [-.245,.032,.054,.014,.357],[-.193,.107,.081,.015,.321],[-.111,.115,.129,0,.231],
      [-.046,.154,.173,-.015,.13],[.052,.211,.199,-.014,.056],[.168,.231,.174,-.015,.005],
      [.223,.179,.155,.003,-.043],[.265,.081,.091,-.01,-.063],[.274,.009,.012,-.01,-.068]
    ],.55)
    oval(head,black,.02,-.143,.390,.078,.041,.049)
    cable(head,[[-.022,.188,.159],[.008,.10,.229],[.006,.018,.277],[.025,-.073,.348],[.012,-.155,.408]],.023,bone)
    const jaw=new T.Group()
    head.add(position(jaw,0,-.095,.033))
    for(const side of [-1,1]){
      const socket=oval(head,black,side*.147,.056,.177,.087,.066,.069)
      socket.rotation.y=side*.41
      oval(head,eye,side*.143,.054,.226,.022,.012,.015)
      cable(head,[[side*.209,.103,.129],[side*.219,.04,.196],[side*.167,-.04,.242],[side*.09,-.128,.333]],.027,bone)
      cable(head,[[side*.122,.015,.228],[side*.123,-.059,.269],[side*.09,-.152,.337]],.014,oldBlood)
      cable(jaw,[[side*.17,.01,.051],[side*.149,-.096,.165],[side*.083,-.171,.32],[side*.021,-.153,.382]],.031,bone)
      for(let tooth=0;tooth<5;tooth++){
        const z=.16+tooth*.042
        oval(jaw,bone,side*(.123-tooth*.014),-.09-tooth*.011,z,.013,.028,.014)
      }
      sculpt(head,horn,[
        [.139,.105,.103,side*.161,-.079],[.212,.109,.106,side*.228,-.114],
        [.318,.092,.096,side*.302,-.159],[.437,.074,.082,side*.362,-.229],
        [.544,.054,.063,side*.398,-.312],[.648,.038,.040,side*.402,-.408],
        [.724,.022,.024,side*.372,-.50],[.771,.004,.004,side*.325,-.567]
      ],side)
      for(let ring=0;ring<5;ring++) {
        const y=.215+ring*.077
        oval(head,oldBlood,side*(.235+.036*ring),y,-.116-ring*.045,.094-ring*.009,.014,.086-ring*.009)
      }
    }
    cable(head,[[.178,.052,.222],[.158,-.019,.253],[.12,-.078,.29],
      [.095,-.152,.385],[.074,-.222,.403]],.013,blood)
    const arms=[]
    for(const side of [-1,1]){
      const upper=new T.Group()
      const lower=new T.Group()
      const palm=new T.Group()
      group.add(upper,lower,palm)
      sculpt(upper,rot,[[-1,.079,.073],[-.72,.103,.089],[-.46,.161,.112],[-.18,.162,.13],[.03,.095,.094]],side)
      sculpt(lower,bone,[[-1,.064,.075],[-.84,.082,.091],[-.57,.094,.111],[-.29,.123,.104],[-.11,.113,.113],[.035,.084,.095]],side)
      oval(lower,oldBlood,side*.055,-.37,.072,.047,.23,.047)
      oval(palm,bone,0,.029,.066,.145,.072,.159)
      for(let digit=0;digit<4;digit++){
        const x=(digit-1.5)*.076
        const length=[.41,.52,.56,.45][digit]
        cable(palm,[[x,.037,.082],[x*1.10,.061,.199],[x*1.32,.048,length-.071],
          [x*1.37,-.018,length]],.029-digit*.002,bone)
        cable(palm,[[x*1.31,.05,length-.09],[x*1.37,.01,length+.012],
          [x*1.41,-.045,length+.064]],.017,digit===1 || digit===2 ? blood : horn)
      }
      arms.push({side,upper,lower,palm,pressed:false})
    }
    scene.add(group)
    return {group,torso,head,jaw,arms,horn}
  }
  const guardian=goatCrawler()
  const strikeSet=new T.Group()
  surface.add(strikeSet)
  strikeSet.visible=false
  const standingLegs=[]
  const charredHide=new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0x433329,roughness:.89})
  const hoof=new T.MeshStandardMaterial({color:0x201b17,roughness:.63})
  for(const side of [-1,1]){
    const leg=new T.Group()
    strikeSet.add(leg)
    sculpt(leg,charredHide,[
      [-.95,.067,.068,side*.045,.05],[-.81,.073,.077,side*.05,.071],
      [-.61,.081,.093,side*.045,-.155],[-.44,.13,.123,side*.015,.04],
      [-.26,.147,.135,0,.129],[-.11,.158,.128,0,.047],[.06,.09,.08,0,0]
    ],side)
    for(let toe=0;toe<2;toe++){
      const foot=mesh(leg,bodyBoot,hoof,(toe-.5)*.068+side*.04,-.938,.105,.069,.11,.177)
      foot.rotation.y=side*.10
    }
    standingLegs.push({leg,side})
  }
  const hitMaterial=new T.LineBasicMaterial({color:0xe6f1ff,transparent:true,opacity:0,fog:false})
  for(const streak of [
    [[-4.3,11,-1],[-3.72,8.82,-1],[-4.06,7.22,-1],[-3.08,5.4,-1],[-3.26,3.83,-1],[-2.58,2.93,-1],[-2.68,1.96,-.77]],
    [[-3.08,5.4,-1],[-2.28,4.11,-1],[-2.37,3.48,-1],[-1.61,2.74,-1]]
  ]) {
    const geometry=new T.BufferGeometry().setFromPoints(streak.map(point=>new T.Vector3(...point)))
    strikeSet.add(new T.Line(geometry,hitMaterial))
  }
  const strikeLight=light(strikeSet,0xb9d4ff,0,19,-2.72,3.3,-.81)
  const coalLight=light(strikeSet,0xef4f1c,0,5,-2.68,.47,-.77)
  const emberMaterial=new T.MeshBasicMaterial({color:0xff8e39,fog:false})
  const embers=Array.from({length:24},(_,index)=>{
    const particle=oval(strikeSet,emberMaterial,0,0,0,.025,.025,.025)
    particle.visible=false
    return particle
  })
  const smokeCanvas=document.createElement('canvas')
  smokeCanvas.width=smokeCanvas.height=96
  const smokeContext=smokeCanvas.getContext('2d')
  for(let cloud=0;cloud<14;cloud++){
    const x=48+Math.sin(cloud*2.9)*23
    const y=48+Math.cos(cloud*3.9)*24
    const density=smokeContext.createRadialGradient(x,y,0,x,y,23)
    density.addColorStop(0,'rgba(95,88,79,.37)')
    density.addColorStop(1,'rgba(80,73,67,0)')
    smokeContext.fillStyle=density
    smokeContext.fillRect(x-23,y-23,46,46)
  }
  const smokeTexture=new T.CanvasTexture(smokeCanvas)
  const strikeSmoke=Array.from({length:7},()=>{
    const sprite=new T.Sprite(new T.SpriteMaterial({map:smokeTexture,transparent:true,opacity:0,depthWrite:false}))
    strikeSet.add(sprite)
    return sprite
  })
  const successor=humanoid()
  const stalkerVeins=new T.MeshStandardMaterial({color:0x6be0d8,emissive:0x29a9bd,
    emissiveIntensity:1.17,roughness:.52})
  const stalkerPlate=new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0x2b3c43,roughness:.58,metalness:.52})
  for(const side of [-1,1]) {
    cable(successor.head,[[side*.21,.29,.16],[side*.169,.234,.251],[side*.117,.184,.292],[side*.179,.119,.255]],.010,stalkerVeins)
    cable(successor.torso,[[side*.10,2.12,.28],[side*.31,2.05,.227],[side*.37,1.82,.198],[side*.23,1.67,.221]],.016,stalkerVeins)
    const shoulder=oval(successor.torso,stalkerPlate,side*.43,2.21,-.04,.25,.19,.23)
    shoulder.rotation.z=side*.28
    cable(successor.torso,[[side*.44,2.34,-.15],[side*.58,2.29,-.044],[side*.60,2.22,.064],[side*.51,2.14,.136]],.013,stalkerVeins)
  }
  const spineShape=new T.ConeGeometry(1,1,7)
  const spineMetal=new T.MeshStandardMaterial({color:0x202326,roughness:.62,metalness:.21})
  for(const side of [-1,1]) {
    for(let index=0;index<6;index++) {
      const spine=mesh(successor.torso,spineShape,spineMetal,side*(.18+index*.062),
        2.47-index*.044,-.20,.066,.43-index*.032,.081)
      spine.rotation.set(-.38,0,-side*(.45+index*.16))
    }
  }
  for(const arm of successor.joints.slice(0,2)) {
    for(let index=0;index<3;index++) {
      const x=(index-1)*.045
      cable(arm,[[x,-.48,.07],[x*1.3,-.63,.12],[x*1.45,-.81,.21],[x*1.2,-.90,.28]],.015,spineMetal)
    }
  }
  const stalkerGlow=light(successor.group,0xb22b24,3,5.5,0,1.93,.54)
  successor.eye.fog=false
  const duelLevel=level=>level===12 || level===15
  const limboLight=new T.Group()
  scene.add(limboLight)
  limboLight.visible=false
  const lightCore=new T.MeshBasicMaterial({color:0xfff4c4})
  const lightVeil=new T.MeshBasicMaterial({color:0xffb657,transparent:true,opacity:.21,depthWrite:false})
  oval(limboLight,lightCore,0,0,0,.12,.45,.11)
  oval(limboLight,lightVeil,0,0,0,.48,.74,.27)
  const strikePoints=new T.Float32BufferAttribute(new Float32Array(18),3)
  const strikeGeometry=new T.BufferGeometry()
  strikeGeometry.setAttribute('position',strikePoints)
  const limboBeam=new T.Line(strikeGeometry,new T.LineBasicMaterial({color:0xffd489,transparent:true,opacity:.78}))
  limboBeam.frustumCulled=false
  scene.add(limboBeam)
  limboBeam.visible=false
  const duelLamp=light(limboLight,0xffc97b,0,13,0,0,0)
  let duelPending=false
  let duelStart=-1
  let duelCue=false
  const glowMaterial=new T.MeshBasicMaterial({color:0x68d5ec,transparent:true,opacity:.24,side:T.BackSide,
    depthTest:false,depthWrite:false,fog:false,blending:T.AdditiveBlending})
  function buildCreatureGlow(model) {
    const parts=[model.head,model.torso,model.jaw]
    if(model.arms) for(const {upper,lower,palm} of model.arms) parts.push(upper,lower,palm)
    else parts.push(...model.limbs,...model.joints)
    return parts.flatMap(part=>{
      const meshes=part.children.filter(child=>child.isMesh)
      const visible=meshes.slice(0,part===model.head?4:3)
      if(part===model.head && model.horn) visible.push(...meshes.filter(child=>child.material===model.horn))
      return visible.map(original=>{
      const edge=new T.Mesh(original.geometry,glowMaterial)
      edge.scale.setScalar(1.055)
      edge.visible=false
      edge.renderOrder=20
      original.add(edge)
      return edge
      })
    })
  }
  const guardianGlow=buildCreatureGlow(guardian)
  const successorGlow=buildCreatureGlow(successor)
  const setGlow=(pieces,visible)=>pieces.forEach(piece=>{piece.visible=visible})
  let lightGift=null
  let lightBetrayed=false
  let maskBonus=0
  let ward=false
  const guideGifts={glow:'La luz te dio una chispa. La silueta se ve con más claridad.',
    mask:'La luz te dio una carga: tu próxima máscara dura dos segundos más.',
    shield:'La luz te dio un amparo contra un ataque.'}
  let monster=guardian
  for(const model of [guardian,successor]) model.group.traverse(object=>{
    if(object.isMesh && object.material!==glowMaterial) {
      object.castShadow=true
      object.receiveShadow=true
    }
  })
  successor.group.visible=false
  const trialHall=new T.Group()
  scene.add(position(trialHall,-220,0,0))
  trialHall.visible=false
  const trialLength=54
  const tileGroup=new T.Group()
  trialHall.add(tileGroup)
  for(let z=3;z>-trialLength-4;z-=4){
    box(tileGroup,concrete,-3.26,1.95,z,.55,4.1,4)
    box(tileGroup,concrete,3.26,1.95,z,.55,4.1,4)
    box(tileGroup,floor,0,-.12,z,6.5,.23,4)
    box(tileGroup,concrete,0,4.1,z,6.5,.31,4)
    box(tileGroup,iron,0,3.86,z,6.12,.24,.28)
    const left=box(tileGroup,redGlow,-2.92,.63,z,.07,.07,.44)
    left.rotation.z=.02
    box(tileGroup,redGlow,2.92,.63,z,.07,.07,.44)
    if(z===3 || z===-13 || z===-29 || z===-45)light(trialHall,0xc02017,44,14,0,3.58,z)
  }
  box(trialHall,concrete,0,2,-trialLength-3,6.6,4.1,.39)
  const demons=Array.from({length:5},(_,index)=>{
    const body=(index%2===0?guardian.group:successor.group).clone(true)
    body.visible=false
    trialHall.add(body)
    return body
  })
  let rescueAt=null
  const companion=new T.Group()
  camera.add(companion)
  companion.visible=false
  const companionCore=new T.MeshBasicMaterial({color:0xaef6ff,depthTest:false,depthWrite:false})
  const companionRing=new T.MeshBasicMaterial({color:0x438fb0,depthTest:false,depthWrite:false})
  oval(companion,companionCore,0,0,0,.036,.047,.036).renderOrder=12
  const orbit=mesh(companion,new T.TorusGeometry(.067,.007,8,28),companionRing,0,0,0,1,1,1)
  orbit.renderOrder=12
  const rescueVeil=new T.MeshBasicMaterial({color:0x3ddcff,transparent:true,opacity:0,depthTest:false,depthWrite:false})
  const rescueScreen=mesh(camera,new T.PlaneGeometry(12,12),rescueVeil,0,0,-.14,1,1,1)
  rescueScreen.renderOrder=13
  rescueScreen.visible=false
  const coreMaterial=new T.MeshBasicMaterial({color:0xe94137})
  const bossCore=oval(guardian.torso,coreMaterial,0,.72,.48,.113,.14,.055)
  bossCore.visible=false
  const bossLight=light(guardian.torso,0xf2331f,0,5,0,.73,.53)
  function styleMonster(isSuccessor) {
    setGlow(guardianGlow,false)
    setGlow(successorGlow,false)
    guardian.group.visible=false
    successor.group.visible=false
    limboLight.visible=false
    limboBeam.visible=false
    trialHall.visible=false
    rescueAt=null
    rescueScreen.visible=false
    monster=isSuccessor?successor:guardian
    monster.group.add(silhouette,shadow)
    silhouette.position.set(0,isSuccessor?2.8:1.14,isSuccessor?.56:.79)
    shadow.scale.set(isSuccessor?1.9:2.3,isSuccessor?1.55:2.75,1)
    if(isSuccessor) {
      successor.skin.color.setHex(0x33434b)
      successor.shell.color.setHex(0x687779)
      successor.eye.color.setHex(0xff3b29)
      successor.head.scale.set(.82,1.16,1)
    }
  }
  const silhouette = light(monster.group,0xe73218,5,3,0,2.8,.56)
  const shadowCanvas = document.createElement('canvas')
  shadowCanvas.width = shadowCanvas.height = 64
  const shadowContext = shadowCanvas.getContext('2d')
  const gradient = shadowContext.createRadialGradient(32,32,2,32,32,29)
  gradient.addColorStop(0,'rgba(4,2,1,.76)')
  gradient.addColorStop(1,'rgba(4,2,1,0)')
  shadowContext.fillStyle = gradient
  shadowContext.fillRect(0,0,64,64)
  const shadow = mesh(monster.group,new T.PlaneGeometry(),new T.MeshBasicMaterial({
    map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false
  }),0,.022,0,1.9,1.55,1)
  shadow.rotation.x=-Math.PI/2

  const hands = new T.Group()
  camera.add(hands)
  const gloveColors = COLORS.map(color => new T.MeshPhysicalMaterial({
    color:new T.Color(color).multiplyScalar(.56),...steelMaps,roughness:.62,metalness:.32,clearcoat:.18
  }))
  const glovePlate = new RoundedBoxGeometry(1,1,1,2,.16)
  const plate = (parent,material,...dimensions) => mesh(parent,glovePlate,material,...dimensions)
  const glove = []
  for (const i of [0,1,2,5]) {
    const part = new T.Group()
    hands.add(part)
    plate(part,black,0,-.11,.085,.225,.20,.39)
    plate(part,iron,0,.02,.14,.209,.15,.15)
    plate(part,black,0,0,-.024,.262,.223,.285)
    plate(part,gloveColors[i],0,.087,-.025,.242,.096,.253)
    for(const side of [-1,1]) {
      plate(part,iron,side*.098,.129,.045,.024,.019,.028)
      plate(part,iron,side*.098,.129,-.104,.024,.019,.028)
    }
    if(i===2) {
      const ring=pipe(part,gloveColors[i],0,.015,-.173,.139,.13,.139)
      ring.rotation.x=Math.PI/2
      const gasket=pipe(part,black,0,.015,-.249,.112,.045,.112)
      gasket.rotation.x=Math.PI/2
      const button=pipe(part,iron,0,.015,-.28,.061,.035,.061)
      button.rotation.x=Math.PI/2
    } else {
      const thumbSide=i===0?1:-1
      for(let digit=0;digit<4;digit++) {
        const x=thumbSide*(.082-digit*.053)
        const length=[.119,.148,.137,.103][digit]
        const width=[.047,.050,.047,.041][digit]
        const spread=thumbSide*(1.1-digit)*.12
        const finger=new T.Group()
        part.add(position(finger,x,.046,-.151+Math.abs(digit-1)*.009))
        finger.rotation.set(.08,spread,0)
        plate(finger,black,0,0,-length*.47,width,.065,length)
        plate(finger,gloveColors[i],0,.022,-length*.22,width*.96,.043,length*.55)
        const distal=plate(finger,gloveColors[i],0,.018,-length*.76,width*.89,.05,length*.45)
        distal.rotation.x=-.19
        for(const offset of [.46,.56]) {
          plate(finger,black,0,.037,-length*offset,width*.86,.008,.007)
        }
      }
      const thumb=plate(part,gloveColors[i],thumbSide*.132,-.002,-.095,.059,.070,.123)
      thumb.rotation.y=-thumbSide*.53
    }
    glove[i]=part
  }
  const leftGloveCore=new T.MeshBasicMaterial({color:0x3dd8ff})
  const poweredCuff=new T.MeshStandardMaterial({map:steelMap,...steelMaps,color:0x641b19,metalness:.65,roughness:.5})
  const coreRing=new T.TorusGeometry(.048,.007,8,26)
  const wristScreen=new T.MeshBasicMaterial({color:0x1a92ed})
  const wristIcon=new T.MeshBasicMaterial({color:0x9ffaff})
  for(const i of [0,1,2,5]) {
    const hand=glove[i]
    if(i===0) {
      plate(hand,poweredCuff,0,.136,-.041,.183,.04,.173)
      pipe(hand,black,0,.157,-.045,.064,.031,.064)
      const ring=mesh(hand,coreRing,leftGloveCore,0,.178,-.045,1,1,1)
      ring.rotation.x=-Math.PI/2
      oval(hand,leftGloveCore,0,.175,-.045,.029,.016,.029)
      oval(hand,new T.MeshBasicMaterial({color:0xffaba0}),0,.186,-.045,.013,.007,.013)
      const outerRing=mesh(hand,coreRing,poweredCuff,0,.173,-.045,1.26,1.26,1.26)
      outerRing.rotation.x=-Math.PI/2
      for(const x of [-.067,.067]) for(const z of [-.102,.015]) {
        pipe(hand,iron,x,.158,z,.012,.013,.012)
      }
    } else {
      plate(hand,iron,0,.137,-.033,.174,.042,.155)
      plate(hand,black,0,.150,-.033,.159,.042,.142)
      plate(hand,wristScreen,0,.174,-.033,.129,.007,.111)
      oval(hand,wristIcon,0,.181,-.067,.010,.004,.010)
      plate(hand,wristIcon,0,.18,.010,.077,.003,.006)
      for(const [x,z,angle,length] of [[0,-.039,0,.041],[-.016,-.039,-.64,.031],[.016,-.039,.64,.031],[-.011,-.009,.38,.036],[.011,-.009,-.38,.036]]) {
        plate(hand,wristIcon,x,.180,z,.006,.003,length).rotation.y=angle
      }
    }
  }
  const railMetal=new T.MeshPhysicalMaterial({map:steelMap,...steelMaps,color:0x6f7e83,metalness:.73,roughness:.49})
  for(const [slot,part] of glove.entries()) {
    if(!part)continue
    plate(part,iron,0,-.043,.237,.252,.19,.105)
    plate(part,gloveColors[slot],0,.017,.224,.233,.097,.074)
    for(const stripe of [-1,1]) {
      plate(part,railMetal,stripe*.064,.067,.221,.026,.012,.055).rotation.y=stripe*.24
    }
    for(const side of [-1,1]) {
      plate(part,railMetal,side*.088,.032,.112,.019,.033,.172)
      const bolt=pipe(part,railMetal,side*.076,.073,.072,.020,.018,.020)
      bolt.rotation.y=.24
      plate(part,black,side*.076,.084,.072,.027,.006,.006)
      cable(part,[[side*.106,-.041,.255],[side*.131,-.004,.164],[side*.106,.036,.089],[side*.091,.045,.035]],.008)
    }
    for(let rib=0;rib<4;rib++) plate(part,railMetal,0,-.003,.195-rib*.035,.192,.019,.016)
    plate(part,railMetal,0,.023,.090,.142,.089,.107)
    pipe(part,black,0,.065,.087,.062,.036,.062)
    const spoolRim=pipe(part,gloveColors[slot],0,.086,.087,.052,.018,.052)
    spoolRim.rotation.y=Math.PI*.17
    for(let layer=0;layer<3;layer++) {
      const winding=mesh(part,new T.TorusGeometry(.032+layer*.005,.0027,7,20),
        railMetal,0,.097,.087,1,1,1)
      winding.rotation.x=-Math.PI/2
    }
    pipe(part,railMetal,0,.096,.087,.02,.018,.02)
  }
  const finaleGun=new T.Group()
  camera.add(finaleGun)
  finaleGun.visible=false
  plate(finaleGun,board,0,-.075,.11,.125,.126,.40)
  plate(finaleGun,iron,0,.015,-.11,.117,.118,.33)
  for(const side of [-1,1]) {
    const barrel=pipe(finaleGun,railMetal,side*.026,.022,-.44,.027,.54,.027)
    barrel.rotation.x=Math.PI/2
    const shadowedMouth=pipe(finaleGun,black,side*.026,.022,-.712,.019,.009,.019)
    shadowedMouth.rotation.x=Math.PI/2
  }
  plate(finaleGun,board,0,-.05,-.412,.10,.054,.24)
  const finaleRunner=new T.Group()
  scene.add(finaleRunner)
  finaleRunner.visible=false
  const runnerArmor=new T.MeshStandardMaterial({color:0x36404c,metalness:.64,roughness:.32})
  const runnerGlow=new T.MeshBasicMaterial({color:0xffb958})
  oval(finaleRunner,runnerArmor,0,0,0,.27,.22,.22)
  oval(finaleRunner,runnerGlow,0,.08,.18,.13,.037,.031)
  for(const side of [-1,1]) {
    oval(finaleRunner,runnerArmor,side*.19,-.13,.035,.099,.076,.15)
    oval(finaleRunner,runnerGlow,side*.22,0,0,.026,.16,.17)
  }
  const runnerTrailMaterial=new T.MeshBasicMaterial({
    color:0xffb958,transparent:true,opacity:0,depthWrite:false
  })
  const runnerTrail=oval(scene,runnerTrailMaterial,0,0,0,1,.044,.066)
  runnerTrail.visible=false
  const finaleBolt=new T.Line(new T.BufferGeometry().setFromPoints([
    new T.Vector3(-.5,5.2,0),new T.Vector3(.15,3.6,.1),new T.Vector3(-.28,2.5,0),
    new T.Vector3(.23,1.41,.14),new T.Vector3(0,0,0)
  ]),new T.LineBasicMaterial({color:0xd9efff,transparent:true,opacity:0}))
  scene.add(finaleBolt)
  finaleBolt.visible=false
  const finaleLightning=light(scene,0xb8daff,0,9,200,2.5,2.6)
  const finaleFlare=light(camera,0xff9845,0,8,0,-.18,-.92)
  const elementIndicator = new T.MeshBasicMaterial({color:COLORS[1]})
  box(glove[1],elementIndicator,0,.112,.015,.12,.025,.11)
  const tetherGeometry=new T.CylinderGeometry(.015,.015,1,10)
  const launches=[0x417aab,0xb16950].map(color=>{
    const tether=new T.Group()
    tether.visible=false
    camera.add(tether)
    const material=new T.MeshStandardMaterial({
      color,emissive:color,emissiveIntensity:.27,metalness:.38,roughness:.49
    })
    const sections=Array.from({length:12},()=>{
      const section=new T.Mesh(tetherGeometry,material)
      section.frustumCulled=false
      tether.add(section)
      return section
    })
    return {tether,sections,target:new T.Vector3(),tool:0,remaining:0,duration:.64}
  })
  const rightLaunch=launches[1]
  function resetLaunches() {
    for(const launch of launches) {
      launch.remaining=0
      launch.tether.visible=false
    }
  }
  const tetherStart=new T.Vector3()
  const tetherEnd=new T.Vector3()
  const tetherPrevious=new T.Vector3()
  const tetherNext=new T.Vector3()
  const tetherDirection=new T.Vector3()
  const tetherUp=new T.Vector3(0,1,0)
  const handTarget=new T.Vector3()
  const handOffset=new T.Vector3()
  const launchRay=new T.Raycaster()
  const sparks = new T.BufferGeometry()
  const points = []
  let dustSeed = 17
  const random = () => ((dustSeed = (Math.imul(dustSeed,1664525)+1013904223)>>>0)/4294967296)
  for (let i=0;i<620;i++) points.push((random()-.5)*8,random()*4.8,9-random()*62)
  sparks.setAttribute('position',new T.Float32BufferAttribute(points,3))
  const dustMaterial = new T.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{lampPosition:{value:new T.Vector3()},lampDirection:{value:new T.Vector3()},lit:{value:0},time:{value:0}},
    vertexShader:`
      uniform vec3 lampPosition;
      uniform vec3 lampDirection;
      uniform float lit;
      uniform float time;
      varying float brightness;
      void main(){
        vec3 drift=vec3(sin(position.z*1.2+time*.31)*.13,cos(position.x*3.5+time*.22)*.12,0.0);
        vec4 world=modelMatrix*vec4(position+drift,1.0);
        vec3 ray=world.xyz-lampPosition;
        float range=length(ray);
        float cone=smoothstep(.915,.982,dot(normalize(ray),lampDirection));
        brightness=.12+lit*cone*exp(-range*.082)*.74;
        vec4 view=viewMatrix*world;
        gl_PointSize=clamp(24.0/max(1.0,-view.z),1.0,5.0);
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader:`
      varying float brightness;
      void main(){
        float speck=1.0-smoothstep(.17,.5,length(gl_PointCoord-vec2(.5)));
        gl_FragColor=vec4(.83,.77,.67,speck*brightness);
      }`
  })
  const dust = new T.Points(sparks,dustMaterial)
  scene.add(dust)

  const hologram=new T.Group()
  scene.add(hologram)
  hologram.visible=false
  const hologramMaterial=new T.MeshBasicMaterial({color:0x63e0ff,transparent:true,opacity:.64,wireframe:true,depthWrite:false})
  oval(hologram,hologramMaterial,0,1.66,0,.15,.19,.14)
  oval(hologram,hologramMaterial,0,1.17,0,.24,.34,.13)
  for(const side of [-1,1]) {
    oval(hologram,hologramMaterial,side*.29,1.08,0,.076,.29,.073).rotation.z=side*.17
    oval(hologram,hologramMaterial,side*.12,.43,0,.093,.39,.085)
  }
  let hologramUntil=0
  let hologramReadyAt=0
  const keys = new Set()
  const look = new T.Vector3()
  const targetDirection = new T.Vector3()
  const distanceTarget = new T.Vector3()
  let crouchRequested=false
  let jumpHeight=0
  let jumpVelocity=0
  const lastSeen = new T.Vector3()
  const lastVelocity = new T.Vector3()
  const playerVelocity = new T.Vector3()
  const searchAt = new T.Vector3()
  const patrolTarget = new T.Vector3()
  let patrolDirection=1
  let patrolPause=0
  let enemyStepDistance=0
  let stalkerStrideWeight=0
  let enemyStepSide=1
  let confusedUntil=0
  let nextRoar=0
  let sawPlayer=false
  let finalEncounter=false
  let finalPursuitAt=-Infinity
  let finale=null
  let passage=null
  let passageUntil=0
  let bumpedWhileInvisible=false
  let equipped=5
  let switchRemaining=0
  const switchTime=.54
  const switchAxis=new T.Vector3(0,0,1)
  const switchRotation=new T.Quaternion()
  let phase = 'menu', level = 1, selected = 5, element = 1, code = sequence(1), progress = 0, read = false
  let age = 0, cooldown = 0, invisible = 0, attackStarted = 0
  let opening = false, lastHud = ''
  let bossVulnerable=false
  let bossDefeated=false
  let guardWeakened=false
  let defeatedAt=0
  const enemyName=()=>level>10?'El Acechador':'El Guardián'
  let yaw = 0, pitch = 0, time = 0, prev = performance.now(), raf
  let audio, output, droneGain, menuTrack, tunnelTrack, windowGain, windowPan, quiet = false
  let mouse = null
  const subscriptions = new AbortController()
  const on = (element,event,listener) => element.addEventListener(event,listener,{signal:subscriptions.signal})
  const heightAt = z => z < 1.94 ? 0 : Math.min(1.68,Math.ceil((z-1.94)/.8)*.21)
  function soundContext() {
    try {
      if (!audio) {
        audio = new AudioContext()
        output = audio.createGain()
        output.gain.value = quiet ? 0 : .35
        output.connect(audio.destination)
        const drone = audio.createOscillator()
        drone.type = 'sine'
        drone.frequency.value = 46
        droneGain = audio.createGain()
        droneGain.gain.value = 0
        drone.connect(droneGain).connect(output)
        drone.start()
      }
      syncAmbience()
      return audio.resume().then(()=>audio.state==='running').catch(()=>false)
    } catch {
      return Promise.resolve(false)
    }
  }
  function syncAmbience() {
    if(!audio || !output) return
    const at=audio.currentTime
    const inMenu=phase==='menu'
    if(inMenu && !menuTrack) menuTrack=ambienceTrack(false)
    if(!inMenu && !tunnelTrack) tunnelTrack=ambienceTrack(true)
    menuTrack?.gain.setTargetAtTime(inMenu?.83:0,at,.20)
    tunnelTrack?.gain.setTargetAtTime(inMenu?0:.74,at,.39)
    droneGain.gain.setTargetAtTime(inMenu?0:.048,at,.17)
  }
  function ambienceTrack(tunnel) {
    const rate=22050
    const channels=menuAmbience(rate,tunnel)
    const buffer=audio.createBuffer(2,channels[0].length,rate)
    channels.forEach((channel,index)=>buffer.copyToChannel(channel,index))
    const gain=audio.createGain()
    gain.gain.value=0
    const track=audio.createBufferSource()
    track.buffer=buffer
    track.loop=true
    track.connect(gain).connect(output)
    if(tunnel) {
      const send=audio.createGain()
      send.gain.value=.38
      gain.connect(send).connect(wetTunnel())
    }
    track.start()
    return gain
  }
  function updateWindowAudio() {
    if(!audio || !output) return
    if(!windowGain) {
      const rate=22050
      const samples=sealedWindowNoise(rate)
      const buffer=audio.createBuffer(1,samples.length,rate)
      buffer.copyToChannel(samples,0)
      const sound=audio.createBufferSource()
      sound.buffer=buffer
      sound.loop=true
      const wall=audio.createBiquadFilter()
      wall.type='lowpass'
      wall.frequency.value=1450
      windowGain=audio.createGain()
      windowGain.gain.value=0
      windowPan=audio.createStereoPanner()
      sound.connect(wall).connect(windowGain).connect(windowPan).connect(output)
      const reflection=audio.createGain()
      reflection.gain.value=.55
      windowGain.connect(reflection).connect(wetTunnel())
      sound.start()
    }
    const at=audio.currentTime
    const nearest=phase==='intro' ? {x:199.74,y:-1.53,z:-5.48}
      : windowLocations.reduce((best,next)=>Math.abs(next.z-camera.position.z)<Math.abs(best.z-camera.position.z)?next:best)
    windowSource.set(nearest.x,nearest.y,nearest.z).sub(camera.position)
    const distance=windowSource.length()
    listenerRight.set(1,0,0).applyQuaternion(camera.quaternion)
    const pan=distance>.01 ? windowSource.normalize().dot(listenerRight) : 0
    windowPan.pan.setTargetAtTime(pan*.83,at,.16)
    const gain=phase==='menu'?.72:phase==='intro'?.92:phase==='play'?.67:0
    windowGain.gain.setTargetAtTime(gain/(1+distance*.11+distance*distance*.014),at,.24)
  }
  function tone(frequency, end, duration, volume, type='triangle', destination=output) {
    if (!audio || !output || quiet) return
    const now = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(frequency,now)
    osc.frequency.exponentialRampToValueAtTime(end,now+duration)
    gain.gain.setValueAtTime(volume,now)
    gain.gain.exponentialRampToValueAtTime(.001,now+duration)
    osc.connect(gain).connect(destination)
    osc.start(now)
    osc.stop(now+duration)
  }
  let screamBuffers
  let screamIndex=0
  function scream() {
    if (!audio || !output || quiet) return
    if (!screamBuffers) {
      screamBuffers=[5221,6743,8917].map(seed=>{
        const waveform=makeScream(audio.sampleRate,seed)
        const buffer=audio.createBuffer(1,waveform.length,audio.sampleRate)
        buffer.copyToChannel(waveform,0)
        return buffer
      })
    }
    const voice=audio.createBufferSource()
    voice.buffer=screamBuffers[screamIndex++ % screamBuffers.length]
    const direct=audio.createGain()
    direct.gain.value=1.95
    voice.connect(direct).connect(output)
    addTunnelEcho(voice,[[.086,.38,-.52],[.173,.24,.61],[.287,.13,-.29]])
    voice.start()
  }
  function addTunnelEcho(source,reflections) {
    for (const [delay,volume,pan] of reflections) {
      const reflection=audio.createDelay(.3)
      reflection.delayTime.value=delay
      const wall=audio.createBiquadFilter()
      wall.type='lowpass'
      wall.frequency.value=2650-delay*3500
      const gain=audio.createGain()
      gain.gain.value=volume
      const position=audio.createStereoPanner()
      position.pan.value=pan
      source.connect(reflection).connect(wall).connect(gain).connect(position).connect(output)
    }
  }
  let roomReverb
  function wetTunnel() {
    if(!roomReverb) {
      roomReverb=audio.createConvolver()
      roomReverb.normalize=false
      const samples=tunnelImpulse(audio.sampleRate,914)
      const impulse=audio.createBuffer(2,samples.length,audio.sampleRate)
      impulse.copyToChannel(samples,0)
      impulse.copyToChannel(tunnelImpulse(audio.sampleRate,627),1)
      roomReverb.buffer=impulse
      roomReverb.connect(output)
    }
    return roomReverb
  }
  const contactBuffers=new Map()
  function playContact(kind,level,pan,wet,variant) {
    if (!audio || !output || quiet) return
    const key=kind+variant
    let buffer=contactBuffers.get(key)
    if(!buffer) {
      const sample=surfaceContact(audio.sampleRate,1327+variant*283,kind)
      buffer=audio.createBuffer(1,sample.length,audio.sampleRate)
      buffer.copyToChannel(sample,0)
      contactBuffers.set(key,buffer)
    }
    const effect=audio.createBufferSource()
    effect.buffer=buffer
    const direction=audio.createStereoPanner()
    direction.pan.value=pan
    const near=audio.createGain()
    near.gain.value=level
    effect.connect(near).connect(direction).connect(output)
    const send=audio.createGain()
    send.gain.value=level*wet
    effect.connect(send).connect(wetTunnel())
    effect.start()
  }
  function scrape(gap,side) {
    const distanceLevel=1.2/(1+gap*.23)
    playContact('hinge',distanceLevel,side*.28,1.2,side===1?1:2)
  }
  let bootSide=1
  function footstep(running,z) {
    bootSide*=-1
    const metal=z>1.94 || insideDuct(camera.position.x,z)
    const level=running?.37:.26
    playContact(metal?'metal':'concrete',level,bootSide*.12,.84,bootSide===1?1:2)
  }
  let thunderBuffer
  function thunder(outside) {
    if(!audio || !output || quiet) return
    if(!thunderBuffer) {
      const wave=thunderSound(audio.sampleRate)
      thunderBuffer=audio.createBuffer(1,wave.length,audio.sampleRate)
      thunderBuffer.copyToChannel(wave,0)
    }
    const source=audio.createBufferSource()
    source.buffer=thunderBuffer
    const muffler=audio.createBiquadFilter()
    muffler.type='lowpass'
    muffler.frequency.value=outside?2700:580
    const volume=audio.createGain()
    volume.gain.value=outside?.67:.45
    source.connect(muffler).connect(volume).connect(output)
    const reflections=audio.createGain()
    reflections.gain.value=outside?.25:.58
    volume.connect(reflections).connect(wetTunnel())
    source.start()
  }
  function lock() {
    try { renderer.domElement.requestPointerLock?.()?.catch(()=>{}) } catch {}
  }
  function release() {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
    keys.clear()
    mouse = null
  }
  const down=new T.Vector3(0,-1,0)
  const upperAnchor=new T.Vector3()
  const elbowAnchor=new T.Vector3()
  const wristAnchor=new T.Vector3()
  const boneDirection=new T.Vector3()
  const faceFocus=new T.Vector3()
  const impactOrigin=new T.Vector3()
  const enemyAtImpact=new T.Vector3()
  const lungeVector=new T.Vector3()
  const originalView=new T.Quaternion()
  const impactView=new T.Quaternion()
  const mirror=new T.Group()
  scene.add(mirror)
  mirror.visible=false
  const mirrorTarget=new T.WebGLRenderTarget(384,448)
  mirrorTarget.texture.repeat.x=-1
  mirrorTarget.texture.offset.x=1
  const reflectionCamera=new T.PerspectiveCamera(39,384/448,.08,12)
  const reflectionLayer=7
  reflectionCamera.layers.set(reflectionLayer)
  for(const model of [guardian,successor]) model.group.traverse(object=>{
    if(object.isMesh) object.layers.enable(reflectionLayer)
  })
  const reflectionLight=new T.PointLight(0xb6e9ff,18,8,2)
  reflectionLight.layers.set(reflectionLayer)
  scene.add(reflectionLight)
  const reflectionBackground=new T.Color(0x081222)
  const mirrorMaterial=new T.MeshBasicMaterial({
    map:mirrorTarget.texture,color:0xc8ebff,transparent:true,opacity:.94,toneMapped:false,depthWrite:false,depthTest:false
  })
  const mirrorPane=new T.Mesh(new T.PlaneGeometry(.88,1.07),mirrorMaterial)
  mirrorPane.renderOrder=20
  mirror.add(mirrorPane)
  const mirrorEdge=new T.LineLoop(new T.BufferGeometry().setFromPoints([
    new T.Vector3(-.44,-.535,.006),new T.Vector3(.44,-.535,.006),
    new T.Vector3(.44,.535,.006),new T.Vector3(-.44,.535,.006)
  ]),new T.LineBasicMaterial({color:0x91eaff,transparent:true,depthTest:false,depthWrite:false}))
  mirrorEdge.renderOrder=21
  mirror.add(mirrorEdge)
  const mirrorCrack=new T.LineSegments(new T.BufferGeometry().setFromPoints([
    [0,0],[.15,.19],[.15,.19],[.44,.29],[.15,.19],[.17,.535],
    [0,0],[-.23,.18],[-.23,.18],[-.44,.15],[-.23,.18],[-.31,.535],
    [0,0],[-.11,-.19],[-.11,-.19],[-.44,-.32],[-.11,-.19],[-.16,-.535],
    [0,0],[.19,-.14],[.19,-.14],[.44,-.1],[.19,-.14],[.29,-.535]
  ].map(([x,y])=>new T.Vector3(x,y,.012))),new T.LineBasicMaterial({color:0xd5f8ff,transparent:true,depthTest:false,depthWrite:false}))
  mirrorCrack.renderOrder=22
  mirror.add(mirrorCrack)
  const shardMaterial=new T.MeshBasicMaterial({
    color:0x9ee8ff,side:T.DoubleSide,transparent:true,opacity:1,depthWrite:false
  })
  const shardGeometry=new T.BufferGeometry().setFromPoints([
    new T.Vector3(-.052,-.035,0),new T.Vector3(.064,-.047,0),new T.Vector3(.014,.078,0)
  ])
  const mirrorShards=Array.from({length:13},()=>{
    const shard=new T.Mesh(shardGeometry,shardMaterial)
    mirror.add(shard)
    return shard
  })
  function renderReflection() {
    const head=monster.head.getWorldPosition(faceFocus)
    reflectionCamera.position.copy(head).addScaledVector(lungeVector,2.28)
    reflectionCamera.position.y+=.16
    reflectionCamera.lookAt(head.x,head.y-.16,head.z)
    reflectionLight.position.copy(reflectionCamera.position)
    reflectionLight.position.y+=.55
    const background=scene.background
    const target=renderer.getRenderTarget()
    scene.background=reflectionBackground
    renderer.setRenderTarget(mirrorTarget)
    renderer.render(scene,reflectionCamera)
    renderer.setRenderTarget(target)
    scene.background=background
  }
  const prototype=new T.Group()
  scene.add(prototype)
  prototype.visible=false
  const prototypeEye=new T.MeshBasicMaterial({color:0xffa648})
  const prototypeCore=oval(prototype,iron,0,0,0,.28,.22,.18)
  oval(prototype,prototypeEye,0,0,.174,.13,.037,.016)
  for(const side of [-1,1]) {
    cable(prototype,[[side*.18,.02,0],[side*.42,.09,.01],[side*.49,-.22,.075],
      [side*.29,-.54,.14]],.027,iron)
    oval(prototype,prototypeEye,side*.29,-.54,.14,.043,.063,.04)
  }
  const allySignal=new T.PointLight(0x64ddff,0,4)
  scene.add(allySignal)
  let crystalReadyAt=0
  let allyUntil=0
  let reclaimAt=-1
  let rescuePulls=0
  let grabbedAlly=false
  function resetAlliance() {
    crystalReadyAt=0
    allyUntil=0
    reclaimAt=-1
    rescuePulls=0
    grabbedAlly=false
    prototype.visible=false
    allySignal.intensity=0
    mirror.visible=false
  }
  function pullAlly() {
    const enemy=monster.group
    if(!grabbedAlly && camera.position.distanceTo(enemy.position)>7) {
      callbacks.current.message('ChatGPT: Acercate a tu aliado y agarralo con clic izquierdo.')
      return
    }
    if(grabbedAlly) rescuePulls++
    grabbedAlly=true
    const launch=launches[0]
    launch.tool=0
    launch.remaining=launch.duration=.64
    launch.target.copy(enemy.position)
    launch.target.y+=monster===guardian?.78:1.42
    tone(210+rescuePulls*48,320+rescuePulls*52,.17,.23,'triangle')
    if(rescuePulls<5) return
    reclaimAt=-1
    rescuePulls=0
    grabbedAlly=false
    prototype.visible=false
    enemy.rotation.z=0
    allyUntil=Infinity
    callbacks.current.message('ChatGPT: ¡Ganaste! El monstruo eligió quedarse con vos.')
  }
  function updateAlliance(enemy,dt) {
    const allied=age<allyUntil && !bossDefeated && duelStart<0
    if(allied) {
      allySignal.position.copy(enemy.position)
      allySignal.position.y+=1.04
      allySignal.intensity=3.5
      return true
    }
    allySignal.intensity=0
    if(allyUntil>0) {
      allyUntil=0
      if(bossDefeated || duelStart>=0) return false
      reclaimAt=age
      prototype.visible=true
      rescuePulls=0
      grabbedAlly=false
      callbacks.current.message('ChatGPT: ¡El Prototipo se lo lleva! Agarralo con clic izquierdo y tirá con Espacio.')
      tone(115,49,1.1,.32,'sawtooth')
    }
    if(reclaimAt<0) return false
    const elapsed=age-reclaimAt
    const latch=T.MathUtils.smoothstep(elapsed,0,.64)
    const drag=T.MathUtils.smoothstep(elapsed,.65,5.0)
    const away=enemy.position.z<=camera.position.z?-1:1
    const nextZ=T.MathUtils.clamp(enemy.position.z+away*dt*drag*(grabbedAlly?.12:.85),endZ+1.1,9.1)
    if(!guardBlocked(enemy.position.x,nextZ)) enemy.position.z=nextZ
    prototype.position.set(enemy.position.x,enemy.position.y+(monster===guardian?1.5:2.66)+(1-latch)*1.32,
      enemy.position.z-.24*away)
    prototype.rotation.y=away<0?0:Math.PI
    prototypeCore.rotation.z=Math.sin(elapsed*6)*.13
    enemy.rotation.z=.15*Math.sin(drag*Math.PI)
    if(elapsed<5.5) return true
    prototype.visible=false
    reclaimAt=-1
    enemy.rotation.z=0
    rescuePulls=0
    grabbedAlly=false
    invisible=Math.max(invisible,3)
    callbacks.current.message('ChatGPT: Ganó el Prototipo. Alejate mientras seguís invisible.')
    tone(170,68,.64,.20)
    return false
  }
  let mirrorSettled=false
  let impactPlayed=false
  let attackSide=1
  let crawlTravel=0
  let crawlEffort=0
  function moveBone(bone,from,to) {
    bone.position.copy(from)
    boneDirection.copy(to).sub(from)
    bone.scale.y=boneDirection.length()
    if (bone.scale.y>.001) bone.quaternion.setFromUnitVectors(down,boneDirection.normalize())
  }
  function crawlPose(dt,distance,intensity,scanning,gap) {
    crawlTravel+=distance/1.36
    crawlEffort=T.MathUtils.lerp(crawlEffort,distance>0?1:0,Math.min(1,dt*8))
    const drag=crawlTravel*Math.PI*2
    guardian.torso.position.y=Math.sin(drag*2)*.048*crawlEffort+Math.sin(time*2.7)*.014
    guardian.torso.rotation.set(.06+Math.sin(drag)*.09*crawlEffort,Math.sin(drag)*.058*crawlEffort,Math.cos(drag)*.063*crawlEffort)
    guardian.head.rotation.set(-.07+Math.sin(drag)*.105*crawlEffort,
      Math.sin(time*(scanning?4.4:1.65))*(scanning?.35:.09),.085+Math.sin(time*1.92)*.054)
    guardian.jaw.rotation.x=.13+Math.max(0,Math.sin(time*(intensity?10:2.2)))*(intensity?.55:.14)
    for(const arm of guardian.arms){
      const phase=(crawlTravel+(arm.side===1?.5:0))%1
      const planting=phase<.57
      const recovery=(phase-.57)/.43
      const stride=planting?1-phase/.57:T.MathUtils.smoothstep(recovery,0,1)
      const lift=planting?0:Math.sin(recovery*Math.PI)*.245*crawlEffort
      upperAnchor.set(arm.side*.31,.68+guardian.torso.position.y,.25)
      wristAnchor.set(arm.side*(.70+.052*crawlEffort),.064+lift,.28+stride*.78*crawlEffort)
      elbowAnchor.set(arm.side*(.63+lift*.21),.34+lift*.26,.14+stride*.39*crawlEffort)
      moveBone(arm.upper,upperAnchor,elbowAnchor)
      moveBone(arm.lower,elbowAnchor,wristAnchor)
      arm.palm.position.copy(wristAnchor)
      arm.palm.rotation.set(lift*1.23,arm.side*-.13,arm.side*.035)
      if(planting && !arm.pressed && distance>0 && gap<19) scrape(gap,arm.side)
      arm.pressed=planting
    }
  }
  function preview() {
    phase='menu'; release()
    resetAlliance()
    hologram.visible=false
    syncAmbience()
    surface.visible=false
    cinematicArms.visible=false
    finaleGun.visible=false
    finaleFlare.intensity=0
    corridor.visible=true
    tutorial.visible=false
    liftPlate.visible=false
    styleMonster(false)
    crawlTravel=0
    crawlEffort=0
    bossCore.visible=false
    bossLight.intensity=0
    monster.group.rotation.set(0,0,0)
    monster.group.scale.set(1,1,1)
    applyLayout(levelLayout(1),false)
    position(camera,-2.78,1.83,1.72)
    camera.lookAt(1.42,2.24,-12)
    position(monster.group,1.48,0,-6.8)
    monster.group.rotation.y=-.35
    monster.torso.rotation.x=.16
    monster.group.visible=true
    hands.visible=false
    resetLaunches()
    gate.position.y=0
    lamp.intensity=37
  }
  function start(nextLevel) {
    resetAlliance()
    surface.visible=false
    cinematicArms.visible=false
    finaleGun.visible=false
    finaleFlare.intensity=0
    corridor.visible=true
    level=nextLevel;
    gloveColors[0].color.setHex(0x641b19)
    leftGloveCore.color.setHex(0xff342b)
    for(const tool of [1,2,5]) gloveColors[tool].color.setHex(0x2b2e32)
    liftPlate.visible=level!==20
    liftPlate.position.y=0
    selected=5; element=1;
    elementIndicator.color.setHex(COLORS[element]);
    tutorial.visible=true
    const layout=levelLayout(level)
    styleMonster(level>10)
    lightGift=null
    lightBetrayed=false
    maskBonus=0
    ward=false
    guideOrb.visible=true
    duelPending=false
    duelStart=-1
    duelCue=false
    patrolDirection=1
    patrolPause=0
    enemyStepDistance=0
    stalkerStrideWeight=0
    enemyStepSide=1
    crawlTravel=0
    crawlEffort=0
    equipped=5
    switchRemaining=0
    grapple=null
    boardedDuct=null
    bossVulnerable=false
    bossDefeated=false
    guardWeakened=level>6 && level<=10
    bossCore.visible=false
    bossLight.intensity=0
    monster.group.rotation.set(0,0,0)
    applyLayout(layout,true)
    crouchRequested=false
    jumpHeight=0
    jumpVelocity=0
    nextRoar=0
    sawPlayer=false
    finalEncounter=false
    finalPursuitAt=-Infinity
    finale=null
    monster.group.scale.set(1,1,1)
    passage=null
    passageUntil=0
    code=sequence(level); progress=0; read=false; opening=false
    elapsedStep=0
    hologram.visible=false
    hologramUntil=0
    hologramReadyAt=0
    age=0; cooldown=0; invisible=0; confusedUntil=0; bumpedWhileInvisible=false; lastHud=''
    yaw=0; pitch=-.28
    position(camera,0,heightAt(8.75)+1.64,8.75)
    position(monster.group,0,0,layout.guardZ)
    scene.fog.density=.05+Math.min(.026,Math.log2(level)*.0024)
    monster.group.visible=true
    gate.position.y=0
    gateLamp.material=redGlow
    terminals.forEach(({button,tool})=>button.material.color.setHex(COLORS[tool]))
    camera.rotation.set(pitch,yaw,0,'YXZ')
    hands.visible=true
    resetLaunches()
    finaleGun.visible=false
    finaleFlare.intensity=0
    lamp.intensity=0
    phase='play'
    soundContext()
    lock()
  }
  function openGuide() {
    if(phase!=='play') return
    phase='pause'
    release()
    callbacks.current.guide()
  }
  function collectLightGift() {
    guideOrb.visible=false
    if(level===15 && lightBetrays()) {
      lightBetrayed=true
      beginBetrayal()
      return
    }
    lightGift=level%3===1?'glow':level%3===2?'mask':'shield'
    if(lightGift==='mask') {
      maskBonus=2
      cooldown=0
    }
    if(lightGift==='shield') ward=true
    tone(310,630,.5,.18,'sine')
    callbacks.current.message(guideGifts[lightGift])
  }
  function beginBetrayal() {
    phase='betrayal'
    rescueAt=time
    keys.clear()
    rescueScreen.visible=true
    rescueVeil.opacity=.12
    safeGreen.color.setHex(0x351a14)
    callbacks.current.betrayalStart()
    callbacks.current.message('La Luz te traicionó. ChatGPT: ¡Atrás, yo te cubro!')
    tone(103,31,.45,.31,'sawtooth')
    tone(280,680,.64,.16,'triangle')
  }
  function animateRescue() {
    const elapsed=time-rescueAt
    companion.position.set(.39*(1-T.MathUtils.smoothstep(elapsed,0,.5)),-.22,-.88)
    companion.scale.setScalar(1+2.6*Math.sin(Math.PI*T.MathUtils.clamp(elapsed/1.5,0,1)))
    rescueVeil.opacity=.46*Math.sin(Math.PI*T.MathUtils.clamp(elapsed/1.5,0,1))
    const showHall=elapsed>=.52 && elapsed<1.04
    if(showHall) {
      trialHall.position.copy(camera.position)
      trialHall.position.y=0
      trialHall.rotation.y=yaw
      trialHall.visible=true
      corridor.visible=false
      for(const [index,body] of demons.entries()) {
        body.visible=true
        body.position.set((index-2)*.88,0,-3-index*.75+elapsed*1.2)
        body.rotation.y=Math.PI
      }
    } else {
      trialHall.visible=false
      corridor.visible=true
    }
    if(elapsed<1.5) return
    rescueAt=null
    rescueScreen.visible=false
    safeGreen.color.setHex(0x73e8ae)
    invisible=Math.max(invisible,5)
    phase='play'
    callbacks.current.betrayalRescued()
    callbacks.current.message('ChatGPT cerró la trampa. Seguimos desde acá.')
    if(document.pointerLockElement!==renderer.domElement) pause()
  }
  function companionHint() {
    if(reclaimAt>=0) {
      callbacks.current.message('ChatGPT: Agarralo con clic izquierdo y tirá varias veces con Espacio.')
      return
    }
    const message=opening
      ? (finalDuct ? 'ChatGPT: Abrí el ducto con E y subí con la mano azul.' : 'ChatGPT: La compuerta está abierta. Seguí hacia el fondo.')
      : bossVulnerable
        ? (level===6 ? 'ChatGPT: Usá electricidad en el núcleo amarillo.' : 'ChatGPT: Apuntá al núcleo con la mano roja.')
        : read ? 'ChatGPT: Seguí el código de izquierda a derecha y revisá la distancia al próximo terminal.'
          : 'ChatGPT: Buscá la placa del nivel y leela con E.'
    callbacks.current.message(message)
    tone(440,590,.16,.09,'triangle')
  }
  function pause() {
    if (phase !== 'play') return
    phase='pause'
    release()
    callbacks.current.pause()
  }
  function resolve(result) {
    phase=result
    limboBeam.visible=false
    release()
    if (result==='clear') tone(173,340,.65,.25)
    callbacks.current[result]()
  }
  const worldAim = new T.Vector3()
  const blocked = (x,z,margin) => barriers.some(barrier=>overlapsBarrier(barrier,x,z,margin))
  const insideDuct = (x,z,margin=0) => ducts.some(duct=>overlapsBarrier(duct,x,z,margin))
  function playerBlocked(x,z,crouching) {
    return (z>2.18 && Math.abs(x)>2.74) || blocked(x,z,.27) || ductWalls.some(wall=>overlapsBarrier(wall,x,z,.24))
      || ducts.some(duct=>duct!==boardedDuct && overlapsBarrier(duct,x,z,.15))
      || ventEntrances.some(entry=>!entry.open && entry.duct===boardedDuct
        && overlapsBarrier({x:entry.duct.x,z:entry.lip,width:entry.duct.width,depth:.12},x,z,.22))
      || ((!crouching || jumpHeight>.06) && insideDuct(x,z,.12))
  }
  const ductJunction = () => ducts.find(duct=>overlapsBarrier(duct,camera.position.x,camera.position.z)
    && !duct.final && camera.position.z<duct.z-.2)
  const nearFinalExit = () => finalDuct && opening && insideDuct(camera.position.x,camera.position.z)
    && camera.position.z<finalDuct.z-finalDuct.depth/2+.83
  const guardBlocked = (x,z) => blocked(x,z,.21) || insideDuct(x,z,.32)
  function setSearchTarget(enemy,target) {
    searchAt.copy(enemy.position)
    for (let step=1;step<=12;step++) {
      const x=T.MathUtils.lerp(enemy.position.x,target.x,step/12)
      const z=T.MathUtils.lerp(enemy.position.z,target.z,step/12)
      if (guardBlocked(x,z) || !clearSight(barriers,enemy.position,{x,z})) break
      searchAt.set(x,heightAt(z),z)
    }
  }
  function patrolDestination(enemy) {
    const edge=patrolDirection>0?safeBoundary-1.85:endZ+3.3
    if(Math.abs(enemy.position.x)>1.05) {
      const x=enemy.position.x
      const z=enemy.position.z
      if(guardBlocked(x*.80,z)) {
        for(let offset=.35;offset<7;offset+=.35) {
          const next=z+offset*patrolDirection
          const alternative=z-offset*patrolDirection
          for(const candidate of [next,alternative]) {
            if(candidate>safeBoundary-.7 || candidate<endZ+1.3) continue
            if(!guardBlocked(x,candidate) && !guardBlocked(x*.80,candidate)
              && clearSight(ductWalls,enemy.position,{x,z:candidate})) return patrolTarget.set(x,0,candidate)
          }
        }
      }
      return patrolTarget.set(0,0,z)
    }
    if(Math.abs(enemy.position.z-edge)<.34) {
      patrolDirection*=-1
      patrolPause=age+1.2
      return patrolTarget.copy(enemy.position)
    }
    return patrolTarget.set(monster===successor?0:.59*Math.sin(enemy.position.z*.22),0,edge)
  }
  function aimedAt(object, range, angle) {
    object.getWorldPosition(worldAim)
    const delta = targetDirection.copy(worldAim).sub(camera.position)
    camera.getWorldDirection(look)
    return delta.length() < range && look.dot(delta.normalize()) > angle && clearSight(barriers,camera.position,worldAim) && clearSight(ductWalls,camera.position,worldAim)
  }
  function ventAtAim(range,angle,closedOnly=false) {
    return ventEntrances.find(entry=>(!closedOnly || !entry.open) && aimedAt(entry.anchor,range,angle))
  }
  function openVent(entry) {
    if(entry.duct.final && !opening) {
      callbacks.current.message('Primero activá el código de la salida.')
      return
    }
    entry.open=true
    playContact('metal',.48,Math.sign(entry.duct.x)*.38,.81,1)
    callbacks.current.message('Ducto abierto. Apuntá al anclaje y usá la mano azul.')
  }
  function grappleVent(entry) {
    if(!entry.open) {
      callbacks.current.message('Abrí la compuerta del ducto con E.')
      return
    }
    if(boardedDuct===entry.duct) return
    const entranceSide=(camera.position.z-entry.lip)*entry.facing
    if(entranceSide<-.12) return
    grappleStart.copy(camera.position)
    grappleEnd.set(entry.duct.x+Math.sign(entry.duct.x)*-.05,.77+ventLift,entry.lip-entry.facing*.54)
    grapple={entry,at:age}
    const launch=launches[0]
    launch.tool=0
    launch.remaining=launch.duration=.78
    entry.anchor.getWorldPosition(launch.target)
    tone(110,340,.4,.19,'triangle')
  }
  function beginFinale() {
    phase='finale'
    resetAlliance()
    release()
    finale={started:time,shots:0,lastShot:-Infinity,revealed:false}
    corridor.visible=false
    surface.visible=true
    cinematicArms.visible=false
    strikeSet.visible=false
    hands.visible=false
    resetLaunches()
    setGlow(guardianGlow,false)
    setGlow(successorGlow,false)
    successor.group.visible=false
    guardian.group.visible=true
    guardian.group.scale.set(1,1,1)
    guardian.group.rotation.set(0,0,0)
    lamp.intensity=38
    position(camera,200,1.64,5.92)
    camera.lookAt(200.14,1.23,10)
    callbacks.current.finaleStart()
    callbacks.current.message('Saliste del Limbo. Algo te agarra y tira de vos.')
    scrape(.4,-1)
  }
  function finaleShot() {
    if (!finale?.revealed || finale.shots>=3 || time-finale.lastShot<.49) return
    finale.lastShot=time
    finale.shots++
    playContact('metal',1.34,0,1.15,2)
    tone(150,25,.28,.74,'triangle')
    tone(320,48,.15,.24,'sawtooth')
    callbacks.current.finaleCount(finale.shots)

  }
  function animateFinale(dt) {
    const elapsed=time-finale.started
    const pull=T.MathUtils.smoothstep(elapsed,.22,1.6)
    const recoil=Math.max(0,1-(time-finale.lastShot)/.31)
    const afterShot=time-finale.lastShot
    const closingStrike=finale.shots===3
    const downed=closingStrike?T.MathUtils.smoothstep(afterShot,.91,1.41):0
    const bodyZ=2.08+pull*.87-finale.shots*.25-downed*.51
    position(guardian.group,200.08, -.32*downed,bodyZ)
    guardian.group.rotation.set(downed*.31,.03,-downed*.67)
    crawlPose(dt,dt*(pull<1?1.2:0),finale.shots<3,false,Infinity)
    const hook=T.MathUtils.smoothstep(elapsed,.32,.89)*(1-downed)
    const claw=guardian.arms[1]
    upperAnchor.set(.31,.68,.25)
    elbowAnchor.set(.59,.47,.26+hook*.30)
    wristAnchor.set(.42,.22,.67+hook*.56-finale.shots*.07)
    moveBone(claw.upper,upperAnchor,elbowAnchor)
    moveBone(claw.lower,elbowAnchor,wristAnchor)
    claw.palm.position.copy(wristAnchor)
    claw.palm.rotation.x=-hook*.23
    position(camera,200.05-pull*.29,1.64-pull*.85+recoil*.04+downed*.36,5.92-pull*1.79+recoil*.05+downed*.42)
    const turn=T.MathUtils.smoothstep(elapsed,.13,1.08)
    camera.rotation.set(-.075-pull*.16+recoil*.18,Math.PI*(1-turn),-.065*pull*(1-downed),'YXZ')
    if(turn>.99) {
      camera.lookAt(guardian.group.position.x,guardian.group.position.y+.91,guardian.group.position.z+.26)
      camera.rotateX(recoil*.11)
      camera.rotateZ(-.058*pull)
    }
    if(elapsed>=1.73 && !finale.revealed) {
      finale.revealed=true
      finaleGun.visible=true
      callbacks.current.finaleReady()
      callbacks.current.message('La escopeta. Te acordás del regalo de la luz.')
    }
    position(finaleGun,.12,-.26-recoil*.04,-.38+recoil*.19)
    finaleGun.rotation.x=recoil*.26
    finaleFlare.intensity=time-finale.lastShot<.073?88:0
    if(closingStrike) {
      const entry=T.MathUtils.smoothstep(afterShot,.08,.28)
      const dash=T.MathUtils.smoothstep(afterShot,.78,1.09)
      const exitDash=T.MathUtils.smoothstep(afterShot,2.72,2.91)
      const runnerX=196.6+entry*2.65+dash*1.58+exitDash*6
      finaleRunner.visible=afterShot>=.10 && afterShot<2.91
      position(finaleRunner,runnerX,.75+.23*Math.sin(dash*Math.PI),bodyZ+.39)
      finaleRunner.rotation.set(.14,Math.PI/2,-afterShot*Math.PI*(dash>0?10:4))
      const speaking=afterShot>=1.1 && afterShot<2.72
      if(speaking) {
        finaleRunner.rotation.set(0,0,0)
        camera.lookAt(finaleRunner.position.x,finaleRunner.position.y,finaleRunner.position.z)
        if(!finale.runnerSpoke) {
          finale.runnerSpoke=true
          speakLight('Qué lento eres para disparar.','You’re so slow at shooting.')
          callbacks.current.message('Qué lento eres para disparar.')
        }
      }
      runnerTrail.visible=(afterShot>=.78 && afterShot<1.39) || (afterShot>=2.72 && afterShot<3.12)
      position(runnerTrail,runnerX-.75,.78,bodyZ+.39)
      runnerTrail.scale.x=.25+dash*.94
      runnerTrailMaterial.opacity=.78*(1-T.MathUtils.smoothstep(afterShot,afterShot<2.72?1.02:2.91,afterShot<2.72?1.39:3.12))
      if(afterShot>=.895 && !finale.runnerImpact) {
        finale.runnerImpact=true
        tone(150,37,.32,.45,'triangle')
        playContact('metal',.76,-.3,1.1,2)
        callbacks.current.message('Un destello cruzó el túnel. La cabra soltó tu pierna.')
      }
    }
    if(finale.shots===3 && time-finale.lastShot>3.35) {
      finaleGun.visible=false
      finaleRunner.visible=false
      runnerTrail.visible=false
      finaleBolt.visible=false
      finaleLightning.intensity=0
      finaleFlare.intensity=0
      resolve('clear')
    }
  }
  function selectHand(tool) {
    if (selected===tool) return
    selected=tool
    if (switchRemaining===0 && rightLaunch.remaining===0) switchRemaining=switchTime
    tone(136,78,.18,.14)
  }
  function shoot(tool,paired=false) {
    if(tool===0 && reclaimAt>=0) {
      if(!grabbedAlly) pullAlly()
      return
    }
    const launch=launches[tool===0?0:1]
    if (launch.remaining>0 || (tool!==0 && (switchRemaining>0 || equipped!==selected))) return
    if(tool===0) {
      const entrance=ventAtAim(8,.975)
      if(entrance) {
        grappleVent(entrance)
        return
      }
    }
    launch.tool=tool
    launch.remaining=launch.duration=.64
    const aimPoint=launch.target
    if (tool === 1) tone(830,165,.24,.16,'sawtooth')
    else if (tool === 3) tone(135,46,.38,.24,'sawtooth')
    else if (tool === 4) tone(980,410,.36,.18,'sine')
    else tone(155,58,.2,.19,'triangle')
    camera.getWorldDirection(look)
    launchRay.set(camera.position,look)
    launchRay.far=handReach
    const hit=launchRay.intersectObjects([partitions,gate],true)[0]
    aimPoint.copy(camera.position).addScaledVector(look,hit?Math.max(.3,hit.distance-.07):handReach)
    if(paired) {
      handOffset.set(tool===0?-.16:.16,0,0).applyQuaternion(camera.quaternion)
      aimPoint.add(handOffset)
    }
    if (bossVulnerable && !bossDefeated) {
      const requiredTool=level===6?1:5
      if(paired && tool!==requiredTool) return
      if (!aimedAt(bossCore,handReach,.983)) {
        if (level===6) {
          const distance=bossCore.getWorldPosition(worldAim).distanceTo(camera.position)
          callbacks.current.message(distance>handReach
            ? 'El núcleo está fuera de alcance. Acercate por el pasillo central.'
            : 'El disparo no dio en el núcleo. Apuntá a la luz amarilla del pecho con el camino libre.')
        }
        return
      }
      bossCore.getWorldPosition(aimPoint)
      if (tool!==requiredTool) {
        callbacks.current.message(level===6 ? 'Equipá la amarilla con 2 y elegí electricidad con R.' : 'Equipá la mano roja con 1 y dispará al núcleo con clic derecho.')
        return
      }
      if (level===6) guardWeakened=true
      else bossDefeated=true
      defeatedAt=age
      bossVulnerable=false
      bossCore.visible=false
      bossLight.intensity=0
      opening=true
      gateLamp.material=openGlow
      scream()
      tone(57,19,1,.5,'triangle')
      callbacks.current.message(level===6 ? 'Debilitaste al Guardián. Ahora se mueve más despacio. Cruzá la compuerta.' : 'Derrotaste al Guardián. La compuerta ya está abierta.')
      return
    }
    const terminal = terminals.findIndex(({button})=>aimedAt(button,handReach,.971))
    if (terminal >= 0 && !opening && !bossVulnerable && !duelPending) {
      const family = terminalFor(tool)
      if(paired && terminal!==family) return
      terminals[terminal].button.getWorldPosition(aimPoint)
      if (!read) callbacks.current.message('Lee la placa con E para conocer la secuencia.')
      else if (terminal !== family) callbacks.current.message('Ese terminal requiere la mano '+(terminal===1?'amarilla':TOOLS[terminals[terminal].tool].toLowerCase())+'.')
      else if (code[progress] !== tool) {
        tone(79,44,.53,.29,'sawtooth')
        callbacks.current.message('Pulso incorrecto. Revisá el siguiente paso en la placa.')
      } else {
        progress++
        terminals[terminal].button.material.color.setHex(COLORS[tool])
        tone(310,590,.27,.24)
        if (progress === code.length) {
          completeCode()
        }
      }
    }
  }
  function speakLight(es,en) {
    if (quiet || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return
    const voices=window.speechSynthesis.getVoices()
    const voice=voices.find(item=>item.localService && item.lang.startsWith(gameLanguage))
    const cue=new SpeechSynthesisUtterance(gameLanguage==='en'?en:es)
    cue.lang=gameLanguage==='en'?'en-US':'es-MX'
    cue.rate=1.05
    cue.pitch=.87
    if(voice) cue.voice=voice
    window.speechSynthesis.speak(cue)
  }
  function limboDuel(dt) {
    const reborn=level===15
    const fighter=reborn?guardian:successor
    if(duelPending && duelStart<0 && camera.position.z<endZ+14) {
      duelStart=age
      guardian.group.visible=reborn
      successor.group.visible=!reborn
      fighter.group.rotation.set(0,-Math.PI/2,0)
      fighter.group.scale.set(1,1,1)
      limboLight.visible=true
      crawlTravel=0
      crawlEffort=0
      scream()
      callbacks.current.message(reborn?'La cabra reencarnó. Una luz se interpone.':'La luz se interpone entre vos y el Acechador.')
    }
    if(duelStart<0) return
    const timeInFight=age-duelStart
    const beat=timeInFight*6.0
    const lunge=Math.max(0,Math.sin(beat))**2
    const counter=Math.max(0,-Math.sin(beat))**2
    const rear=endZ+4.17
    position(fighter.group,2.48-lunge*(reborn?.86:1.06),Math.sin(lunge*Math.PI)*.1,rear+.12*Math.sin(beat))
    position(limboLight,-2.59+counter*.72,1.47+Math.sin(beat*.55)*.26,rear-.17)
    limboLight.rotation.z=Math.sin(beat*.7)*.26
    duelLamp.intensity=47+counter*87
    if(reborn) {
      crawlPose(dt,dt*(.22+lunge*.72),true,false,Infinity)
      guardian.torso.rotation.y-=counter*.19
    } else {
      successor.torso.rotation.set(.12+lunge*.32-counter*.21,-counter*.18,.15*counter)
      successor.head.rotation.set(-.08+counter*.17,.16*Math.sin(beat),-.17+counter*.29)
      successor.jaw.rotation.x=.19+lunge*.41
      successor.limbs[0].rotation.x=-.53-lunge*.82
      successor.limbs[1].rotation.x=-.30-lunge*1.06
      successor.joints[0].rotation.x=-.11-counter*.51
      successor.joints[1].rotation.x=-.24-counter*.39
      successor.limbs[2].rotation.x=.22*lunge
      successor.limbs[3].rotation.x=-.31*lunge
    }
    limboBeam.visible=counter>.23
    if(limboBeam.visible) {
      for(let index=0;index<6;index++) {
        const ratio=index/5
        strikePoints.setXYZ(index,T.MathUtils.lerp(limboLight.position.x,fighter.group.position.x-.22,ratio),
          T.MathUtils.lerp(limboLight.position.y,reborn?.87:1.93,ratio)+Math.sin(ratio*Math.PI)*Math.sin(beat+index*2.1)*.23,
          rear+Math.sin(ratio*Math.PI)*Math.cos(index*1.8+beat)*.27)
      }
      strikePoints.needsUpdate=true
    }
    if(timeInFight>=1.55 && !duelCue) {
      duelCue=true
      opening=true
      gateLamp.material=openGlow
      tone(460,130,.56,.34)
      speakLight('¡Corre! ¡Ahora!','Run! Now!')
      callbacks.current.message('La luz: ¡CORRÉ! Pasá por la compuerta.')
    }
  }
  function completeCode() {
    if(duelLevel(level)) {
      duelPending=true
      callbacks.current.message('El código está listo. Seguí hacia la compuerta.')
      return
    }
    if (level===6 || level===10) {
      bossVulnerable=true
      bossCore.visible=true
      const coreColor=level===6?0xffcd4d:0xe94137
      coreMaterial.color.setHex(coreColor)
      bossCore.scale.set(level===6?.16:.113,level===6?.18:.14,.065)
      bossLight.color.setHex(coreColor)
      bossLight.intensity=35
      position(monster.group,0,0,endZ+4.7)
      monster.group.rotation.y=0
      confusedUntil=0
      callbacks.current.message(level===6 ? 'El Guardián está al fondo. Usá electricidad contra el núcleo amarillo para debilitarlo.' : 'El Guardián está al fondo. Usá la mano roja contra el núcleo brillante.')
      return
    }
    opening=true
    gateLamp.material=openGlow
    tone(46,25,1.1,.4,'triangle')
    callbacks.current.message(finalDuct ? 'La luz te dejó una escopeta para la salida. Buscá el ducto del fondo.' : 'Compuerta abierta. Corre hacia el fondo.')
  }
  function deployHologram() {
    if (age<hologramReadyAt) return
    let spot=null
    for(let distance=.75;distance<=5;distance+=.5) {
      const x=camera.position.x-Math.sin(yaw)*distance
      const z=camera.position.z-Math.cos(yaw)*distance
      if(Math.abs(x)>3.15 || z<endZ+.65 || guardBlocked(x,z)) break
      if(z<safeBoundary-.45) spot={x,z}
    }
    if(!spot) {
      callbacks.current.message('Apuntá a un tramo despejado del pasillo para proyectar el holograma.')
      return
    }
    position(hologram,spot.x,heightAt(spot.z),spot.z)
    hologram.rotation.y=yaw+Math.PI
    hologram.visible=true
    hologramUntil=age+5
    hologramReadyAt=age+14
    tone(290,710,.31,.16,'triangle')
    callbacks.current.message('Holograma activo. Aprovechá la distracción.')
  }
  function useInvisibility() {
    if(cooldown>0) return
    lastSeen.copy(camera.position)
    lastVelocity.copy(playerVelocity)
    invisible=5+maskBonus
    const boosted=maskBonus>0
    maskBonus=0
    bumpedWhileInvisible=false
    cooldown=17
    tone(660,182,.55,.21,'sine')
    callbacks.current.message(boosted?'Máscara activada. Tenés siete segundos.':'Máscara activada. Tenés cinco segundos.')
  }
  function attackPlayer() {
    if (phase!=='play') return
    if(ward) {
      ward=false
      invisible=2.5
      bumpedWhileInvisible=true
      callbacks.current.message('El amparo de la luz te salvó. Alejate.')
      tone(364,660,.45,.29)
      return
    }
    if(age<crystalReadyAt) {
      lungeVector.subVectors(camera.position,monster.group.position)
      lungeVector.y=0
      lungeVector.normalize()
      const x=T.MathUtils.clamp(camera.position.x+lungeVector.x*.75,-3.37,3.37)
      const z=T.MathUtils.clamp(camera.position.z+lungeVector.z*.75,endZ+.62,9.5)
      if (!playerBlocked(x,z,crouchRequested)) {
        camera.position.x=x
        camera.position.z=z
      }
      invisible=Math.max(invisible,2.5)
      bumpedWhileInvisible=true
      callbacks.current.message('ChatGPT: El cristal se está recargando. ¡Alejate del monstruo!')
      tone(93,38,.34,.34)
      return
    }
    setGlow(guardianGlow,false)
    setGlow(successorGlow,false)
    phase='attack'
    attackStarted=time
    impactPlayed=false
    mirrorSettled=false
    impactOrigin.copy(camera.position)
    originalView.copy(camera.quaternion)
    enemyAtImpact.copy(monster.group.position)
    lungeVector.set(impactOrigin.x-enemyAtImpact.x,0,impactOrigin.z-enemyAtImpact.z)
    if(lungeVector.lengthSq()<.0001) lungeVector.set(0,0,1)
    lungeVector.normalize()
    attackSide=lungeVector.x<0?-1:1
    mirror.position.copy(impactOrigin).addScaledVector(lungeVector,-.44)
    mirror.rotation.y=Math.atan2(lungeVector.x,lungeVector.z)
    mirror.visible=true
    mirrorPane.visible=true
    mirrorEdge.visible=true
    mirrorCrack.visible=false
    for(const shard of mirrorShards) shard.visible=false
    keys.clear()
    resetLaunches()
    monster.group.rotation.y=Math.atan2(lungeVector.x,lungeVector.z)
    if(monster===guardian) scrape(1,attackSide)
    tone(69,32,.24,.30)
    callbacks.current.attack()
  }
  function animateAttack() {
    const elapsed=time-attackStarted
    const spring=T.MathUtils.smoothstep(elapsed,.31,.73)
    const calm=T.MathUtils.smoothstep(elapsed,1.32,2.52)
    const reach=spring*(1-calm)
    const enemy=monster.group
    {
      const distance=monster===guardian?.46:.34
      enemy.position.copy(enemyAtImpact).addScaledVector(lungeVector,reach*distance)
      enemy.position.y+=Math.sin(reach*Math.PI)*.16
      enemy.rotation.y=Math.atan2(lungeVector.x,lungeVector.z)+calm*.72
      enemy.rotation.x=-.19*reach
      if(monster===guardian){
        guardian.torso.rotation.x=-.13*reach
        for(const arm of guardian.arms){
          const near=arm.side===attackSide
          upperAnchor.set(arm.side*.29,.74,.23)
          elbowAnchor.set(arm.side*(.58-.19*reach),.36+.54*reach,.42)
          wristAnchor.set(arm.side*(.70-.44*reach),.10+reach*(near?1.05:.66),.54+reach*.33)
          moveBone(arm.upper,upperAnchor,elbowAnchor)
          moveBone(arm.lower,elbowAnchor,wristAnchor)
          arm.palm.position.copy(wristAnchor)
          arm.palm.rotation.x=-.34-.83*reach
        }
      } else {
        monster.limbs[0].rotation.x=-1.17*reach
        monster.limbs[1].rotation.x=-1.51*reach
      }
    }
    const bloom=T.MathUtils.smoothstep(elapsed,.02,.31)
    mirror.scale.set(.04+.73*bloom,.06+.51*bloom,1)
    mirrorCrack.visible=elapsed>=.73 && elapsed<1.36
    mirrorMaterial.color.setHex(elapsed>=1.36?0xb4f8ff:0xc8ebff)
    mirrorPane.visible=mirrorEdge.visible=elapsed<2.78
    const shattered=Math.max(0,elapsed-2.78)
    shardMaterial.opacity=Math.max(0,1-shattered*2.2)
    for(const [index,shard] of mirrorShards.entries()) {
      shard.visible=shattered>0 && shattered<.46
      const x=Math.sin(index*2.4)
      const y=Math.cos(index*2.4)
      shard.position.set(x*(.23+shattered*.76),y*.31+shattered*.29-shattered*shattered*2.1,shattered*.52)
      shard.rotation.set(shattered*(index%3+2),shattered*(3-index%5),index+shattered*5)
    }
    monster.jaw.rotation.x=.14+reach*.43
    camera.position.copy(impactOrigin)
    camera.position.addScaledVector(lungeVector,Math.sin(calm*Math.PI)*.10)
    monster.head.getWorldPosition(faceFocus)
    camera.lookAt(elapsed<2.78?mirror.position:faceFocus)
    impactView.copy(camera.quaternion)
    const settle=T.MathUtils.smoothstep(elapsed,2.78,3.42)
    camera.quaternion.copy(originalView).slerp(impactView,.88*bloom*(1-settle))
    if(elapsed>=.73 && !impactPlayed) {
      impactPlayed=true
      tone(96,28,.36,.64)
      scrape(1.3,-attackSide)
      tone(1250,430,.28,.14,'triangle')
    }
    if(elapsed>=1.36 && !mirrorSettled) {
      mirrorSettled=true
      callbacks.current.message('ChatGPT: El cristal lo frenó. Mirá, está bajando las garras.')
      tone(280,590,.65,.25,'triangle')
    }
    if(elapsed>=3.42) {
      mirror.visible=false
      camera.position.copy(impactOrigin)
      camera.quaternion.copy(originalView)
      crystalReadyAt=age+25
      allyUntil=age+14
      phase='play'
      callbacks.current.attackSurvived()
      callbacks.current.message('El monstruo se volvió tu aliado. Te sigue por ahora.')
    }
  }
  on(window,'keydown',e=>{
    if (phase==='intro' && e.code==='Escape') {
      e.preventDefault()
      finishIntro()
      return
    }
    if(phase==='finale') {
      if(!e.repeat && e.code==='KeyX') finaleShot()
      return
    }
    if (phase !== 'play' || passage || grapple) return
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault()
    keys.add(e.code)
    if (e.repeat) return
    if (e.code==='Space' && reclaimAt>=0 && grabbedAlly) {
      pullAlly()
      return
    }
    if (e.code==='Escape') pause()
    if (e.code==='KeyQ') useInvisibility()
    if (e.code==='KeyV') {
      shoot(0,true)
      shoot(selected===1?element:selected,true)
    }
    if (e.code==='KeyG') deployHologram()
    if (e.code==='KeyH') companionHint()
    if (e.code==='KeyL') {
      openGuide()
      return
    }
    if (e.code==='Digit1') selectHand(5)
    if (e.code==='Digit2') selectHand(1)
    if (e.code==='Digit3') selectHand(2)
    if (e.code==='KeyR' && selected===1) {
      element = element===1 ? 3 : element===3 ? 4 : 1
      elementIndicator.color.setHex(COLORS[element])
      tone(290,410,.13,.12)
    }
    if (e.code==='KeyE') {
      if(guideOrb.visible && aimedAt(guideOrb,4.3,.981)) {
        collectLightGift()
        return
      }
      const entrance=ventAtAim(3.25,.916,true)
      if(entrance) {
        openVent(entrance)
        return
      }
      if (nearFinalExit()) {
        beginFinale()
        return
      }
      const junction=ductJunction()
      if (junction) {
        passage=junction.exit
        passageUntil=age+.66
        resetLaunches()
            tone(94,56,.66,.3,'triangle')
        callbacks.current.message('Atravesando la derivación…')
        return
      }
    }
    if (e.code==='KeyE' && aimedAt(slab,3.1,.66)) {
      if (!read) {
        read=true
        tone(230,195,.28,.16)
      }
      callbacks.current.message('La placa marca el orden de las manos.')
    }
    if (e.code==='KeyM') callbacks.current.message('Mantené una pared entre vos y el Guardián para que pierda el rastro.')
    if (e.code==='KeyC' && (!crouchRequested || !insideDuct(camera.position.x,camera.position.z,.18))) crouchRequested=!crouchRequested
    if (e.code==='Space' && jumpHeight===0 && jumpVelocity===0 && !crouchRequested && !insideDuct(camera.position.x,camera.position.z,.21)) {
      jumpVelocity=4.5
      tone(51,35,.12,.15)
    }
    if (e.code==='KeyX') shoot(selected===1?element:selected)
    if (e.code==='KeyF') lamp.intensity=lamp.intensity ? 0 : 88
  })
  on(window,'keyup',e=>keys.delete(e.code))
  on(window,'blur',pause)
  on(document,'pointerlockchange',()=>{
    if (document.pointerLockElement !== renderer.domElement) pause()
  })
  on(renderer.domElement,'mousedown',e=>{
    if(phase==='finale') {
      if(e.button===0) finaleShot()
      return
    }
    if (phase!=='play' || passage) return
    if (!grapple && (e.button===1 || (e.button===0 && e.altKey))) {
      mouse={x:e.clientX,y:e.clientY}
      return
    }
    if (e.button!==0 && e.button!==2) return
    const both=(e.buttons&3)===3
    if (grapple && !both) return
    e.preventDefault()
    if (document.pointerLockElement !== renderer.domElement) lock()
    const rightTool=selected===1?element:selected
    if (both || e.button===0) shoot(0,both)
    if (both || e.button===2) shoot(rightTool,both)
  })
  on(renderer.domElement,'contextmenu',e=>e.preventDefault())
  on(window,'mouseup',()=>{mouse=null})
  on(document,'mousemove',e=>{
    if (phase!=='play') return
    if (document.pointerLockElement===renderer.domElement) {
      yaw-=e.movementX*.00225
      pitch=T.MathUtils.clamp(pitch-e.movementY*.00225,-1.24,1.24)
    } else if (mouse) {
      yaw-=(e.clientX-mouse.x)*.004
      pitch=T.MathUtils.clamp(pitch-(e.clientY-mouse.y)*.004,-1.24,1.24)
      mouse={x:e.clientX,y:e.clientY}
    }
  })
  function size() {
    renderer.setSize(host.clientWidth,host.clientHeight,false)
    camera.aspect=host.clientWidth/Math.max(1,host.clientHeight)
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(size)
  observer.observe(host)
  size()
  preview()
  let introAge=0
  let introStep=0
  let introBeat=0
  const strikeTime=10.62
  let dazzledStrike=-Infinity
  const glareDirection=new T.Vector3()
  const glareOffset=new T.Vector3()
  let nextWindowAudio=0
  let nextStormStrike=3.25
  let strikeAt=-Infinity
  let thunderAt=Infinity
  let thunderOutside=false
  function lightningStrike(outside) {
    strikeAt=time
    if(phase==='intro') {
      lightningLight.position.set(outside?-3:.22,outside?7.9:-.91,outside?-7.5:-5.18)
    }
    thunderAt=time+(outside?.71:1.06)
    thunderOutside=outside
    if(!outside) {
      const nearest=windowLocations.reduce((best,next)=>Math.abs(next.z-camera.position.z)<Math.abs(best.z-camera.position.z)?next:best)
      windowFlash.position.set(nearest.x*.86,nearest.y+.22,nearest.z)
    }
  }
  function animateStorm() {
    if((phase==='menu' || phase==='play') && time>=nextStormStrike) {
      nextStormStrike=time+14.5+Math.sin(time*.81)*2.3
      lightningStrike(false)
    }
    const elapsed=time-strikeAt
    const strength=elapsed<.55 ? Math.exp(-elapsed*8.3):0
    if(phase==='play' && elapsed<.38 && dazzledStrike!==strikeAt) {
      camera.getWorldDirection(glareDirection)
      glareOffset.copy(windowFlash.position).sub(camera.position)
      const distance=glareOffset.length()
      if(distance>0 && distance<13 && glareOffset.dot(glareDirection)/distance>.958
        && clearSight(barriers,camera.position,windowFlash.position) && clearSight(ductWalls,camera.position,windowFlash.position)) {
        dazzledStrike=strikeAt
        callbacks.current.windowGlare()
      }
    }
    lightning.visible=phase==='intro' && thunderOutside && elapsed<.18
    lightningMaterial.opacity=Math.min(1,strength*1.46)
    lightningLight.intensity=phase==='intro'?strength*(thunderOutside?315:37):0
    windowFlash.intensity=phase==='menu'||phase==='play'?strength*108:0
    if(time>=thunderAt) {
      thunderAt=Infinity
      thunder(thunderOutside && phase==='intro')
    }
  }
  const openingShots=[
    [0,0,1.64,13,-.12,1.21,3],
    [2.25,0,1.64,7.5,.02,.94,2.55],
    [3.55,-.14,1.64,4.12,.17,.12,.67],
    [4.35,-.08,1.64,3.15,-.04,-.66,-1.1],
    [5.10,0,1.28,2.04,0,-.82,-1.85],
    [6.25,0,.31,-.72,0,-1.92,-4.9],
    [7.40,0,-.89,-3.7,-.16,-1.59,-5.59],
    [8.08,-.28,-1.03,-4.55,-.26,-1.45,-5.59],
    [8.74,-.31,-1.01,-4.96,-.24,-1.31,-5.59],
    [9.28,-.30,-1.01,-4.99,.71,-1.86,-5.17],
    [9.58,-.35,-1.15,-4.91,.45,-1.86,-5.25],
    [9.89,-.62,-1.75,-3.96,.31,-1.84,-5.15],
    [10.39,-.74,-2.02,-3.75,.40,-1.81,-5.18],
    [10.62,-.78,-2.03,-3.70,.38,-1.67,-5.04],
    [10.94,-.78,-2.07,-3.69,.18,-2.01,-4.77],
    [11.67,-.77,-2.08,-3.68,.16,-2.15,-4.72],
    [12.34,-.78,-2.08,-3.68,.14,-2.19,-4.67],
    [13.07,-.78,-2.08,-3.68,.14,-2.19,-4.67]
  ]
  function animateGoatStrike(elapsed,dt) {
    if(elapsed<9.26) return
    position(strikeSet,2.94,-2.78,-4.14)
    guardian.group.visible=true
    strikeSet.visible=true
    const after=elapsed-strikeTime
    const fall=T.MathUtils.smoothstep(after,.03,.77)
    const recoil=Math.sin(Math.PI*T.MathUtils.clamp(after/.47,0,1))
    const shove=T.MathUtils.smoothstep(elapsed,9.30,9.70)
    const lunge=T.MathUtils.smoothstep(elapsed,10.23,10.67)
    const x=.99-shove*.69-lunge*.17+fall*.09
    const z=-5.19+shove*.19+lunge*.42
    position(guardian.group,200+x,-2.79+.61*(1-fall)+recoil*.24+lunge*(1-fall)*.16,z)
    guardian.group.rotation.set(-.25*(1-fall)+recoil*.15,-.13-fall*.22,fall*.11-recoil*.19)
    crawlPose(dt,fall>0?dt*.23:0,after>=0,false,Infinity)
    for(const arm of guardian.arms) {
      if(after>=.93) continue
      const amount=1-fall
      const side=arm.side
      upperAnchor.set(side*.31,.68,.25)
      elbowAnchor.set(side*(.58+amount*.07),.34+recoil*.26,.13+recoil*.17)
      wristAnchor.set(side*.7,.08+recoil*.35,.48-recoil*.2)
      moveBone(arm.upper,upperAnchor,elbowAnchor)
      moveBone(arm.lower,elbowAnchor,wristAnchor)
      arm.palm.position.copy(wristAnchor)
      arm.palm.rotation.x=-recoil*.65
    }
    for(const {leg,side} of standingLegs){
      const blow=T.MathUtils.smoothstep(after,.04,.74)
      position(leg,x-2.94+side*(.212+blow*.62),1.14-blow*.87,z+4.14-.64+blow*.42)
      leg.rotation.set(blow*(side===1?-.91:1.04),-.13+side*blow*.55,side*blow*1.51)
      const ash=1-T.MathUtils.smoothstep(after,.68,1.47)
      leg.visible=ash>.04
      leg.scale.setScalar(Math.max(.04,ash))
    }
    const active=after>=0
    const flash=active?Math.exp(-after*10.2):0
    hitMaterial.opacity=after<.18?flash:0
    strikeLight.intensity=flash*295
    coalLight.intensity=active?24*Math.exp(-after*1.76):0
    embers.forEach((ember,index)=>{
      const life=.36+(index%9)*.071
      ember.visible=active && after<life
      if(!ember.visible) return
      const angle=index*2.399
      const far=after*(.74+(index%5)*.15)
      position(ember,-2.68+Math.cos(angle)*far,
        .43+after*(1.05+(index%7)*.29)-after*after*1.6,-.77+Math.sin(angle)*far)
      ember.scale.setScalar(.015+(life-after)*.027)
    })
    strikeSmoke.forEach((cloud,index)=>{
      const drift=after-index*.084
      cloud.visible=drift>=0
      if(!cloud.visible) return
      position(cloud,-2.68+Math.sin(index*2.2)*.27+drift*.31,.34+drift*.65+index*.1,-.78+Math.cos(index*3)*.26)
      cloud.scale.setScalar(.45+drift*.49)
      cloud.material.opacity=Math.min(.58,drift*2)*Math.exp(-drift*.83)
    })
  }
  function intro() {
    phase='intro'
    release()
    introAge=0
    introStep=0
    strikeSet.visible=false
    introBeat=0
    strikeAt=-Infinity
    thunderAt=Infinity
    surface.visible=true
    corridor.visible=false
    monster.group.visible=false
    hands.visible=false
    introPose(0)
    lamp.intensity=0
    soundContext()
  }
  function introPose(elapsed) {
    const next=openingShots.findIndex(shot=>shot[0]>elapsed)
    const end=next<0?openingShots.length-1:Math.max(1,next)
    const from=openingShots[end-1]
    const to=openingShots[end]
    const f=T.MathUtils.clamp((elapsed-from[0])/(to[0]-from[0]),0,1)
    const interpolate=index=>T.MathUtils.lerp(from[index],to[index],f)
    const stride=elapsed>3.55 && elapsed<4.35?.012:.032
    position(camera,200+interpolate(1)+Math.sin(elapsed*6.2)*.023,
      interpolate(2)+Math.sin(elapsed*11.6)*stride,interpolate(3))
    camera.lookAt(200+interpolate(4),interpolate(5),interpolate(6))
    camera.rotateZ(Math.sin(elapsed*5.8)*.011-T.MathUtils.smoothstep(elapsed,9.47,10.3)*.59)
    const story=elapsed
    cinematicArms.visible=story>7.86 && story<10.28
    const pull=T.MathUtils.smoothstep(story,7.86,8.47)
    const shove=T.MathUtils.smoothstep(story,9.36,9.81)
    cinematicArms.position.set(-shove*.11,pull*.15-shove*.27,-pull*.14+shove*.19)
    cinematicArms.rotation.z=.31*shove
  }
  function finishIntro() {
    if(phase!=='intro') return
    phase='transition'
    surface.visible=false
    cinematicArms.visible=false
    corridor.visible=true
    callbacks.current.introDone()
  }
  let elapsedStep=0
  let fpsWindowStart=0
  let fpsFrames=0
  let frameRate=0
  let nextCorridorShadow=0
  function animate(now) {
    if(fpsWindowStart===0) fpsWindowStart=now
    fpsFrames++
    if(now-fpsWindowStart>=500) {
      frameRate=Math.round(fpsFrames*1000/(now-fpsWindowStart))
      fpsWindowStart=now
      fpsFrames=0
      if(phase==='play' && frameRate<24 && renderPixelRatio>.65) {
        renderPixelRatio=Math.max(.65,renderPixelRatio-.15)
        renderer.setPixelRatio(renderPixelRatio)
      }
    }
    raf=requestAnimationFrame(animate)
    const dt=Math.min((now-prev)/1000,.05)
    prev=now
    time+=dt
    haze.uniforms.shift.value=time*.77
    alarmLight.intensity=56+Math.sin(time*2.2)*9
    const flicker=Math.pow(Math.max(0,Math.sin(time*1.36+1)),15)
    failingLight.intensity=(phase==='menu'?51:31)*(1-flicker*(.59+.29*Math.sin(time*19)))
    rimLight.intensity=(phase==='menu'?29:11)+Math.sin(time*.8)*4
    dust.position.x=Math.sin(time*.22)*.13
    if (phase==='intro') {
      const lastIntroAge=introAge
      introAge+=dt
      introPose(introAge)
      animateGoatStrike(introAge,dt)
      if(lastIntroAge<strikeTime && introAge>=strikeTime) {
        thunder(true)
        scream()
        playContact('claw',1.05,-.37,1.3,1)
      }
      const story=introAge
      if(lastIntroAge<2.06 && introAge>=2.06) lightningStrike(true)
      if(lastIntroAge<8.17 && story>=8.17) lightningStrike(false)
      if (introAge-introStep>.51 && (introAge<3.58 || (story>4.38 && story<7.76))) {
        introStep=introAge
        tone(story>4.38?76:53,31,.16,.15)
      }
      if(introBeat===0 && story>=8.32) {
        introBeat=1
        playContact('metal',.68,-.16,1.1,2)
        playContact('claw',.50,.42,1.17,1)
      }
      if(introBeat===1 && story>=9.26) {
        introBeat=2
        guardian.group.visible=true
        guardian.group.rotation.set(0,-.71,0)
        guardian.group.scale.set(1,1,1)
        scream()
      }
      if(introBeat===2 && story>=9.59) {
        introBeat=3
        playContact('claw',.97,.47,1.1,2)
        tone(99,28,.42,.65)
      }
      if(introBeat===3 && story>=12.29) {
        introBeat=4
        callbacks.current.introBlackout()
      }
      if (introAge>=openingShots.at(-1)[0]) finishIntro()
    }
    if (phase==='menu') {
      camera.position.x=-2.87+Math.sin(time*.24)*.15
      camera.lookAt(-.92,1.62,-6.8)
      crawlPose(dt,(.14+.08*Math.sin(time*2))*dt,false,false,Infinity)
      silhouette.intensity=5.9+Math.sin(time*3)*1.4
    }
    if (phase==='play') {
      age+=dt
      guideOrb.position.y=1.36+Math.sin(age*2.25)*.095
      guideHalo.opacity=.24+.085*Math.sin(age*2)
      for(const entry of ventEntrances) {
        entry.hatch.rotation.x=T.MathUtils.lerp(entry.hatch.rotation.x,entry.open?-entry.facing*1.61:0,Math.min(1,dt*12))
      }
      if(grapple) {
        const pull=T.MathUtils.smoothstep(age-grapple.at,0,.64)
        camera.position.copy(grappleStart).lerp(grappleEnd,pull)
        camera.position.y+=Math.sin(pull*Math.PI)*.39
        if(pull>=1) {
          boardedDuct=grapple.entry.duct
          crouchRequested=true
          yaw=grapple.entry.facing===1?0:Math.PI
          pitch=0
          grapple=null
        }
      }
      if (passage && age>=passageUntil) {
        position(camera,passage.x,heightAt(passage.z)+.77,passage.z)
        yaw=0
        pitch=0
        callbacks.current.message('Salida del ducto · '+passage.name)
        passage=null
        boardedDuct=null
      }
      const moveX=Number(keys.has('KeyD') || keys.has('ArrowRight'))-Number(keys.has('KeyA') || keys.has('ArrowLeft'))
      const moveZ=Number(keys.has('KeyS') || keys.has('ArrowDown'))-Number(keys.has('KeyW') || keys.has('ArrowUp'))
      const moving=!passage && !grapple && (moveX!==0 || moveZ!==0)
      const crouching=crouchRequested
      const running=moving && !crouching && (keys.has('ShiftLeft') || keys.has('ShiftRight'))
      let audibleStep=false
      const previousX=camera.position.x
      const previousZ=camera.position.z
      if (moving) {
        const speed=(crouching?2.25:running?6.2:3.55)*dt/Math.hypot(moveX,moveZ)
        const x = T.MathUtils.clamp(camera.position.x+(moveX*Math.cos(yaw)+moveZ*Math.sin(yaw))*speed,-3.37,3.37)
        const z = T.MathUtils.clamp(camera.position.z+(-moveX*Math.sin(yaw)+moveZ*Math.cos(yaw))*speed,opening && gate.position.y>2.4 && (Math.abs(x)<1.8 || camera.position.z<endZ-.35)?endZ-1.55:endZ+.62,9.5)
        if (!playerBlocked(x,camera.position.z,crouching)) camera.position.x=x
        if (!playerBlocked(camera.position.x,z,crouching)) camera.position.z=z
        const stepped=!crouching && jumpHeight===0 && jumpVelocity===0
          && (camera.position.x!==previousX || camera.position.z!==previousZ)
        if (stepped) {
          elapsedStep+=dt
          if (elapsedStep>=(running?.29:.47)) {
            elapsedStep=0
            audibleStep=true
            footstep(running,camera.position.z)
          }
        } else elapsedStep=0
      } else elapsedStep=0
      if(boardedDuct && !overlapsBarrier(boardedDuct,camera.position.x,camera.position.z,.16)) boardedDuct=null
      playerVelocity.set((camera.position.x-previousX)/Math.max(dt,.001),0,(camera.position.z-previousZ)/Math.max(dt,.001))
      if (jumpVelocity!==0 || jumpHeight>0) {
        jumpHeight+=jumpVelocity*dt
        jumpVelocity-=12.5*dt
        if (jumpHeight<=0) {
          jumpHeight=0
          jumpVelocity=0
          tone(58,30,.12,.22)
        }
      }
      const bob=moving ? Math.sin(age*(running?17:12))*(running?.064:.037) : Math.sin(age*2.2)*.012
      if(!grapple) camera.position.y=T.MathUtils.lerp(camera.position.y,heightAt(camera.position.z)+(boardedDuct?ventLift:0)+(crouching?.77:1.64)+jumpHeight+bob,Math.min(dt*13,1))
      camera.rotation.set(pitch,yaw,0,'YXZ')
      for(const launch of launches) launch.remaining=Math.max(0,launch.remaining-dt)
      cooldown=Math.max(0,cooldown-dt)
      invisible=Math.max(0,invisible-dt)
      if(duelLevel(level)) limboDuel(dt)
      if (opening) {
        gate.position.y=Math.min(4.2,gate.position.y+dt*2.2)
        if (!finalDuct && camera.position.z<endZ-.65) beginLiftDescent()
      }
      const previousSwitch=switchRemaining
      switchRemaining=Math.max(0,switchRemaining-dt)
      if (previousSwitch>switchTime/2 && switchRemaining<=switchTime/2) equipped=selected
      if (switchRemaining===0 && equipped!==selected && rightLaunch.remaining===0) switchRemaining=switchTime
      const swapProgress=1-switchRemaining/switchTime
      const turn=T.MathUtils.smoothstep(1-Math.abs(2*swapProgress-1),0,1)
      const retract=Math.sin(Math.PI*swapProgress)
      glove.forEach((part,i)=>{
        part.visible=i===0 || i===equipped
        if (part.visible) {
          const side = i===0?-1:1
          const switching=i===0?0:retract
          position(part,side*.43+Math.sin(age*6)*.009,-.42+bob*.4-switching*.64,-.81)
          part.rotation.set(Math.PI/2-.17,-side*.12,side*.19)
          if(i!==0 && switchRemaining>0) {
            part.quaternion.premultiply(switchRotation.setFromAxisAngle(switchAxis,-Math.PI*turn))
          }
        }
      })
      for(const {tether,sections,target,tool,remaining,duration} of launches) {
        tether.visible=remaining>0
        if(!tether.visible) continue
        const elapsed=duration-remaining
        const travel=.2
        const retractAt=duration-.29+(duration>.7?.15:0)
        const extension=T.MathUtils.smoothstep(elapsed,0,travel)
          *(1-T.MathUtils.smoothstep(elapsed,retractAt,duration))
        const emitter=glove[tool===3 || tool===4 ? 1 : tool]
        handOffset.set(0,0,.14).applyQuaternion(emitter.quaternion)
        tetherStart.copy(emitter.position).add(handOffset)
        handTarget.copy(target)
        camera.worldToLocal(handTarget)
        handOffset.set(0,.035,-.32).applyQuaternion(emitter.quaternion)
        emitter.position.lerp(handTarget.sub(handOffset),extension)
        handOffset.set(0,0,.14).applyQuaternion(emitter.quaternion)
        tetherEnd.copy(emitter.position).add(handOffset)
        const slack=Math.min(.32,tetherStart.distanceTo(tetherEnd)*.09)
        tetherPrevious.copy(tetherStart)
        for(const [index,section] of sections.entries()) {
          const t=(index+1)/sections.length
          tetherNext.copy(tetherStart).lerp(tetherEnd,t)
          tetherNext.y-=Math.sin(t*Math.PI)*slack
          tetherDirection.subVectors(tetherNext,tetherPrevious)
          const length=tetherDirection.length()
          section.visible=length>.001
          if(section.visible) {
            section.position.copy(tetherPrevious).lerp(tetherNext,.5)
            section.scale.y=length+.005
            section.quaternion.setFromUnitVectors(tetherUp,tetherDirection.normalize())
          }
          tetherPrevious.copy(tetherNext)
        }
      }
      hologram.visible=age<hologramUntil
      wristScreen.color.setHex(hologram.visible?0x42dfff:0x1562ac)
      hologramMaterial.opacity=.51+.12*Math.sin(age*39)
      const enemy=monster.group
      if (finalDuct && opening && !finalEncounter && camera.position.z<endZ+15) {
        finalEncounter=true
        if (Math.hypot(camera.position.x-enemy.position.x,camera.position.z-enemy.position.z)>15) {
          position(enemy,-1.75,0,endZ+12.2)
        }
        callbacks.current.message(enemyName()+' llegó al tramo final. Encontrá el ducto de escape.')
      }
      const protectedByAlliance=updateAlliance(enemy,dt)
      const allied=age<allyUntil
      const gap=Math.hypot(camera.position.x-enemy.position.x,camera.position.z-enemy.position.z)
      const diff=Math.log2(level)
      const unobstructed=clearSight(barriers,enemy.position,camera.position) && clearSight(ductWalls,enemy.position,camera.position)
      const safe=camera.position.z>=safeBoundary
      const inDuct=crouching && insideDuct(camera.position.x,camera.position.z,.13)
      const inFinal=finalDuct && opening && overlapsBarrier(finalDuct,camera.position.x,camera.position.z)
      const ghostVisible=!bossDefeated && duelStart<0 && !unobstructed && gap<camera.far-4
      glowMaterial.opacity=(lightGift==='glow'?.34:.23)+Math.sin(age*3.2)*.033
      setGlow(guardianGlow,ghostVisible && monster===guardian)
      setGlow(successorGlow,ghostVisible && monster===successor)
      const bearing=T.MathUtils.euclideanModulo(Math.round(Math.atan2(
        (enemy.position.x-camera.position.x)*Math.cos(yaw)-(enemy.position.z-camera.position.z)*Math.sin(yaw),
        -(enemy.position.x-camera.position.x)*Math.sin(yaw)-(enemy.position.z-camera.position.z)*Math.cos(yaw)
      )/(Math.PI/2)),4)
      stalkerVeins.emissiveIntensity=.45+Math.sin(age*2.3)*.11
      stalkerGlow.intensity=1.35+Math.sin(age*2.3)*.29
      // Enemy models face local +Z. A crouched player can pass behind or beside them.
      const frontDistance=(camera.position.x-enemy.position.x)*Math.sin(enemy.rotation.y)
        +(camera.position.z-enemy.position.z)*Math.cos(enemy.rotation.y)
      const inView=!crouching || frontDistance>gap*.45
      const distracted=hologram.visible && !bossVulnerable
        && Math.hypot(hologram.position.x-enemy.position.x,hologram.position.z-enemy.position.z)<15
        && clearSight(barriers,enemy.position,hologram.position) && clearSight(ductWalls,enemy.position,hologram.position)
      const seesPlayer=!protectedByAlliance && (!distracted || gap<.9) && inView && duelStart<0 && !bossDefeated && !safe && !inDuct && invisible===0 && gap<9+diff*.55 && unobstructed
      if (seesPlayer && !inFinal && !sawPlayer && age>=nextRoar) {
        nextRoar=age+6
        scream()
        callbacks.current.message('¡'+enemyName()+' te vio!'+(cooldown===0?' Presioná Q para usar la máscara.':''))
      }
      sawPlayer=seesPlayer
      if(!protectedByAlliance && inFinal && finalEncounter && finalPursuitAt===-Infinity) {
        finalPursuitAt=age
        position(enemy,finalDuct.x,ventLift,finalDuct.z+finalDuct.depth/2+1.15)
        enemy.rotation.y=Math.PI
        scream()
        callbacks.current.message('¡El Acechador entró al ducto! Avanzá hasta la rejilla.')
      }
      const reaching=!protectedByAlliance && finalPursuitAt!==-Infinity && inFinal
      const beforeEnemyX=enemy.position.x
      const beforeEnemyZ=enemy.position.z
      if(reaching && age-finalPursuitAt>1.45) {
        enemy.position.z=Math.max(camera.position.z+.49,enemy.position.z-dt*1.72)
        enemy.position.x=finalDuct.x
        enemy.position.y=ventLift
        enemy.rotation.y=Math.PI
        if(invisible===0 && enemy.position.z-camera.position.z<.82) attackPlayer()
      }
      enemy.scale.y=T.MathUtils.lerp(enemy.scale.y,reaching?.36:1,Math.min(dt*7,1))
      if (seesPlayer) {
        lastSeen.copy(camera.position)
        lastVelocity.copy(playerVelocity)
        confusedUntil=0
      }
      if (!protectedByAlliance && !crouching && duelStart<0 && !safe && !inDuct && invisible>0 && gap<.9 && unobstructed && !bumpedWhileInvisible) {
        bumpedWhileInvisible=true
        confusedUntil=age+3.5
        const prediction=predictPosition(lastSeen,lastVelocity,{minZ:endZ+.8,maxZ:9.35})
        setSearchTarget(enemy,prediction)
        tone(164,109,.44,.22,'triangle')
        callbacks.current.message(enemyName()+' se confundió. Está buscando donde esperaba encontrarte.')
      }
      const listening=!protectedByAlliance && age<patrolPause && duelStart<0 && !bossDefeated && !bossVulnerable
        && !safe && !reaching && !seesPlayer && age>=confusedUntil
      if (listening && audibleStep && gap<(running?13:9)*(unobstructed?1:.72)) {
        setSearchTarget(enemy,camera.position)
        confusedUntil=age+3.5
        callbacks.current.message('El monstruo oyó tus pasos. Agachate con C para moverte en silencio.')
      }
      const searching=!protectedByAlliance && duelStart<0 && !bossDefeated && !safe && age<confusedUntil && !seesPlayer
      const followingHologram=!protectedByAlliance && distracted && !seesPlayer && !reaching && duelStart<0 && !bossDefeated
      const patrolling=!protectedByAlliance && !followingHologram && duelStart<0 && !bossDefeated && !bossVulnerable && !seesPlayer && !searching && !reaching && age>=patrolPause
      const target=followingHologram?hologram.position:searching?searchAt:patrolling?patrolDestination(enemy):camera.position
      const delta=distanceTarget.set(target.x-enemy.position.x,0,target.z-enemy.position.z)
      const remaining=delta.length()
      const strideLimit=allied?2.1:followingHologram?.72:patrolling?.11:searching?.24:.77
      const advancing=!reaching && ((allied && !inDuct) || followingHologram || patrolling || searching || (seesPlayer && invisible===0)) && remaining>strideLimit+.02
      const stalkerSprinting=monster===successor && seesPlayer && advancing
      if (advancing) {
        const speed=(allied?2.73:patrolling?1.04+diff*.065:searching?1.72:(2.06+diff*.205)*(stalkerSprinting?1.34:1))*(guardWeakened?.64:1)*(level===12?.80:1)
        const advance=Math.min(dt*speed,remaining-strideLimit)/remaining
        const x=enemy.position.x+delta.x*advance
        const z=Math.min(enemy.position.z+delta.z*advance,allied?9.1:safeBoundary-.42)
        if (!guardBlocked(x,enemy.position.z)) enemy.position.x=x
        if (!guardBlocked(enemy.position.x,z)) enemy.position.z=z
        enemy.position.y=heightAt(enemy.position.z)
        const heading=Math.atan2(delta.x,delta.z)
        if (patrolling) {
          const change=Math.atan2(Math.sin(heading-enemy.rotation.y),Math.cos(heading-enemy.rotation.y))
          enemy.rotation.y+=change*Math.min(1,dt*4)
        } else enemy.rotation.y=heading
      }
      const moved=Math.hypot(enemy.position.x-beforeEnemyX,enemy.position.z-beforeEnemyZ)
      if (monster===guardian) {
        crawlPose(dt,bossDefeated?0:moved,seesPlayer,searching,gap)
      } else if(duelStart<0) {
        const stepLength=stalkerSprinting?.98:.79
        enemyStepDistance+=moved
        if(enemyStepDistance>=stepLength) {
          enemyStepDistance%=stepLength
          enemyStepSide*=-1
          if(gap<23) {
            const side=(enemy.position.x-camera.position.x)*Math.cos(yaw)
              -(enemy.position.z-camera.position.z)*Math.sin(yaw)
            const pan=T.MathUtils.clamp(side/Math.max(gap,1)+enemyStepSide*.08,-1,1)
            const volume=(unobstructed?.92:.55)/(1+gap*.19)
            playContact(reaching?'metal':'concrete',volume,pan,1.1,enemyStepSide===1?1:2)
          }
        }
        stalkerStrideWeight=T.MathUtils.damp(stalkerStrideWeight,moved>.0001?1:0,9,dt)
        const weight=stalkerStrideWeight
        const step=enemyStepDistance/stepLength
        const cycle=(step+(enemyStepSide===1?0:1))*.5
        const counterSwing=Math.cos(cycle*Math.PI*2)*weight
        const landing=Math.exp(-step*9)*weight
        if(reclaimAt<0) enemy.rotation.z=T.MathUtils.damp(enemy.rotation.z,0,12,dt)
        monster.torso.rotation.x=(reaching?.49:.13+(stalkerSprinting?.23:.09)*weight)+.025*landing
        monster.torso.rotation.y=.037*counterSwing
        monster.head.rotation.y=.06*Math.sin(time*1.75)*(1-weight)-.031*counterSwing
        monster.jaw.rotation.x=.08+(seesPlayer?.32:.085)*(1+Math.sin(time*(seesPlayer?13:2.1)))
        monster.head.rotation.z=searching?.085*Math.sin(time*3.5):-.022
        for(let side=0;side<2;side++) {
          const phase=(cycle+side*.5)%1
          const stance=stalkerSprinting?.43:.55
          const planted=phase<stance
          const swing=T.MathUtils.clamp((phase-stance)/(1-stance),0,1)
          const stepSpan=stepLength*stance
          // Match the planted foot's backward travel to the body's forward travel.
          const footZ=(planted?stepSpan*(1-2*phase/stance)
            :stepSpan*(2*T.MathUtils.smoothstep(swing,0,1)-1))*weight
          const lift=Math.sin(swing*Math.PI)**2*(stalkerSprinting?.29:.16)*weight
          const upper=.526
          const lower=.68
          const down=1.19-.065*weight-lift
          const reach=Math.min(Math.hypot(footZ,down),upper+lower-.002)
          const knee=Math.acos(T.MathUtils.clamp((reach*reach-upper*upper-lower*lower)/(2*upper*lower),-1,1))
          const hip=-Math.atan2(footZ,down)-Math.atan2(lower*Math.sin(knee),upper+lower*Math.cos(knee))
          const thigh=hip+Math.atan2(.078,.52)
          monster.limbs[side+2].rotation.x=reaching?thigh*weight:thigh
          monster.joints[side+2].rotation.x=reaching?.37:knee-Math.atan2(.078,.52)
          monster.limbs[side].rotation.x=-(side===0?1:-1)*counterSwing*(stalkerSprinting?.47:.24)+(side===1&&reaching?-1.12:0)
          monster.joints[side].rotation.x=-.22-Math.max(0,(side===0?1:-1)*counterSwing)*.19
        }
      }
      if (bossDefeated) {
        enemy.rotation.z=-Math.min(.77,(age-defeatedAt)*1.35)
        enemy.position.y=-Math.min(.27,(age-defeatedAt)*.34)
      }
      if (phase==='play' && seesPlayer && gap<.9) attackPlayer()
      const terminal=terminals.findIndex(({button})=>aimedAt(button,handReach,.971))
      const aimedVent=ventAtAim(8,.975)
      const closedVent=ventAtAim(3.25,.916,true)
      const hint=passage ? '' : guideOrb.visible && aimedAt(guideOrb,4.3,.981) ? 'E · Recoger regalo de la luz' : closedVent ? 'E · Abrir ducto' : aimedVent?.open && !boardedDuct ? 'Clic izquierdo · Agarrar anclaje' : nearFinalExit() ? 'E · Abrir la rejilla y escapar' : bossVulnerable && aimedAt(bossCore,handReach,.983) ? (level===6?'2 · Electricidad y clic derecho':'1 y clic derecho · Núcleo') : ductJunction() ? 'E · Tomar la derivación' : aimedAt(slab,3.1,.66) ? 'E · Leer placa' : terminal>=0 && !opening ? (terminal===0?'Clic izquierdo · Azul':'Clic derecho · '+(terminal===1?'Amarilla':TOOLS[terminals[terminal].tool])) : ''
      let bossDistance = null
      if (level===6 && bossVulnerable) bossDistance=Math.ceil(bossCore.getWorldPosition(worldAim).distanceTo(camera.position))
      let distance = null
      if (read && !opening && !bossVulnerable && !duelPending) {
        const next=code[progress]
        terminals[terminalFor(next)].button.getWorldPosition(worldAim)
        distance=Math.round(Math.hypot(worldAim.x-camera.position.x,worldAim.z-camera.position.z))
      }
      liftIndicators.forEach((indicator,index)=>indicator.material.color.setHex(progress>index?0x6cffaa:0x351917))
      const summary={selected,element,distance,frameRate,allied,crystalCooldown:Math.ceil(Math.max(0,crystalReadyAt-age)),reclaiming:reclaimAt>=0,grabbedAlly,rescuePulls,hologramCooldown:Math.ceil(Math.max(0,hologramReadyAt-age)),lightGift,lightBetrayed,ward,maskBonus,creatureDistance:!bossDefeated && duelStart<0?Math.round(gap):null,creatureBearing:bearing,safe,inDuct,crouching,finalEscape:!!finalDuct && opening,passage:!!passage,detected:seesPlayer && invisible===0,searching,enemy:enemyName(),bossVulnerable,bossDefeated,guardWeakened,bossDistance,duelPending,duelCue,flashlight:lamp.intensity>0,invisible:Math.ceil(invisible),cooldown:Math.ceil(cooldown),danger:seesPlayer && gap<3.9,progress,code:read?code:null,hint,objective:opening?2:read?1:0}
      const stamp=JSON.stringify(summary)
      if (stamp!==lastHud && phase==='play') {
        lastHud=stamp
        callbacks.current.hud(summary)
      }
    }
    if (phase==='attack') animateAttack()
    if (phase==='finale') animateFinale(dt)
    if (phase==='lift') animateLiftDescent()
    companion.visible=phase==='play' || phase==='betrayal'
    orbit.rotation.set(time*.9,time*1.4,.5)
    if (phase==='betrayal') animateRescue()
    else {
      companion.position.set(.39,-.22+Math.sin(time*3)*.019,-.88)
      companion.scale.setScalar(1)
    }
    animateStorm()
    if(time>=nextWindowAudio) {
      nextWindowAudio=time+.066
      updateWindowAudio()
    }
    const lit=lamp.intensity>0
    lamp.castShadow=lit
    if(corridor.visible && time>=nextCorridorShadow) {
      corridorDownlight.shadow.needsUpdate=true
      nextCorridorShadow=time+.14
    }
    lamp.getWorldPosition(dustMaterial.uniforms.lampPosition.value)
    camera.getWorldDirection(dustMaterial.uniforms.lampDirection.value)
    dustMaterial.uniforms.lit.value=lit?1:0
    dustMaterial.uniforms.time.value=time
    stairCandles.forEach((fire,index)=>{fire.scale.y=.044*(.9+.15*Math.sin(time*15+index*2.7))})
    updateClueLEDs()
    if(mirror.visible && mirrorPane.visible) renderReflection()
    renderer.render(scene,camera)
  }
  raf=requestAnimationFrame(animate)
  return {
    start,intro,finishIntro,pause,menu:preview,enableAudio:soundContext,setLanguage,openGuide,
    resume() {phase='play';soundContext();lock()},
    mute(value) {quiet=value;if(output)output.gain.value=value?0:.35},
    dispose() {
      phase='menu'
      release()
      observer.disconnect()
      subscriptions.abort()
      cancelAnimationFrame(raf)
      audio?.close().catch(()=>{})
      const resources=new Set()
      scene.traverse(object=>{
        if(object.geometry)resources.add(object.geometry)
        if(object.material) {
          resources.add(object.material)
          for(const property of ['map','normalMap','roughnessMap']) {
            if(object.material[property]) resources.add(object.material[property])
          }
        }
      })
      resources.add(redGlow);resources.add(openGlow)
      resources.delete(mirrorTarget.texture)
      resources.forEach(resource=>resource.dispose())
      mirrorTarget.dispose()
      lamp.shadow.map?.dispose()
      corridorDownlight.shadow.map?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }
}
