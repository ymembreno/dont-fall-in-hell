export const BETRAYAL_CHANCE = .5

export function lightBetrays(random = Math.random) {
  return random() < BETRAYAL_CHANCE
}

export function guideAnswer(question, level, hud, language) {
  const en=language==='en'
  const q=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
  const say=(es,english)=>en?english:es
  if(/traicion|betray|confiar/.test(q)) {
    return hud.lightBetrayed
      ? say('Te traicioné y apagué el refugio. Las criaturas te derribaron al pasar.', 'I betrayed you and shut down the safe zone. The creatures knocked you down as they passed.')
      : say('Cada vez que recogés mi regalo en el nivel 15 hay un 50 % de probabilidad de que te traicione.', 'Each time you collect my gift on level 15, there is a 50% chance I will betray you.')
  }
  if(/codigo|secuencia|code|sequence/.test(q)) {
    if(!hud.code) return say('Primero leé la placa con E en la zona segura.', 'First read the plaque with E in the safe zone.')
    const esNames=['Azul','Electricidad','Presión','Fuego','Hielo','Roja']
    const enNames=['Blue','Electricity','Pressure','Fire','Ice','Red']
    const names=en?enNames:esNames
    return say('Código: ','Code: ')+hud.code.map((item,index)=>names[item]+(index<(hud.progress??0)?' ✓':'')).join(' → ')
  }
  if(/donde.*(cabra|guardian|acechador|criatura|enemigo)|where.*(goat|guardian|stalker|creature|enemy)|distancia.*(cabra|guardian|acechador)/.test(q)) {
    return hud.creatureDistance==null
      ? say('En esta escena no tengo una posición activa de la criatura.', 'I have no active creature location in this scene.')
      : say('Está a unos '+hud.creatureDistance+' m, '+['delante','a tu derecha','detrás','a tu izquierda'][hud.creatureBearing]+'. Su resplandor atraviesa paredes.', 'It is roughly '+hud.creatureDistance+' m away, '+['ahead','to your right','behind you','to your left'][hud.creatureBearing]+'. Its glow shows through walls.')
  }
  if(/resplandor|silueta|glow|pared|wall/.test(q)) return say('El resplandor marca a la criatura cuando una pared la oculta. Si la tenés delante y a la vista, ves su cuerpo directamente.', 'The glow marks the creature when a wall hides it. With a clear view, you see its body directly.')
  if(/mascara|invisib|mask/.test(q)) {
    if(hud.invisible) return say('Te quedan '+hud.invisible+' segundos de invisibilidad.', 'You have '+hud.invisible+' seconds of invisibility left.')
    if(hud.cooldown) return say('La máscara se recarga en '+hud.cooldown+' segundos.', 'The mask recharges in '+hud.cooldown+' seconds.')
    return say('Presioná Q para activar la máscara. Dura cinco segundos, o dos más si recogiste una carga adicional.', 'Press Q to activate the mask. It lasts five seconds, or two more if you picked up a mask charge.')
  }
  if(/regalo|objeto|entrega|gift|item|reward|amparo/.test(q)) {
    if(hud.lightBetrayed) return say('Ese regalo desencadenó la persecución. El refugio vuelve a estar activo al regresar al nivel.', 'That gift triggered the chase. The safe zone is active again when you return to the level.')
    if(hud.lightGift==='shield' && !hud.ward) return say('Ya usaste el amparo de este nivel.', 'You already used this level’s ward.')
    if(hud.lightGift==='shield') return say('Mi amparo evita un ataque. Se consume cuando te protege.', 'My ward blocks one attack. It is consumed when it protects you.')
    if(hud.lightGift==='mask' && !hud.maskBonus) return say('Ya usaste la carga adicional de este nivel.', 'You already used this level’s extra charge.')
    if(hud.lightGift==='mask') return say('Mi carga extra prolonga tu próxima invisibilidad dos segundos.', 'My extra charge extends your next invisibility by two seconds.')
    if(hud.lightGift==='glow') return say('Mi chispa hace más visible la silueta detrás de las paredes durante este nivel.', 'My spark makes the silhouette behind walls clearer for this level.')
    return say('Buscá mi luz dorada junto a la placa, apuntale y presioná E para recoger un regalo.', 'Look for my golden light by the plaque, aim at it, and press E to collect a gift.')
  }
  if(/ducto|ventil|vent|escond|refug|safe zone|hide/.test(q)) return say('La línea verde marca el refugio. Abrí la compuerta con E y apuntá al anclaje con la mano azul para subir. Adentro te agachás automáticamente. En una derivación, E te lleva a otra salida.', 'The green line marks the safe zone. Open a hatch with E and use the blue hand on its anchor to climb in. You crouch automatically inside. At a branch, E takes you to another exit.')
  if(/mano|celda|terminal|hand|cell|equip/.test(q)) return say('Las manos ya tienen energía. Clic izquierdo usa la azul. Con 1, 2 y 3 elegís la mano derecha y con R cambiás el elemento de la amarilla.', 'The hands already have power. Left-click uses blue. Choose the right hand with 1, 2 or 3, and press R to switch the yellow hand’s element.')
  if(/rayo|destello|ventana|lightning|window/.test(q)) return say('Mirar directo a una ventana cuando relampaguea te encandila un momento. Girá la vista si ves el destello.', 'Looking at a window during lightning dazzles you briefly. Turn away if you see it flash.')
  if(/guardar|progreso|repetir|save|progress/.test(q)) return say('Tu avance se guarda por nombre en este navegador. Podés repetir cualquier nivel desbloqueado desde el menú.', 'Progress is saved by name in this browser. Replay any unlocked level from the menu.')
  if(/salir|escapar|nivel|objetivo|que hago|exit|escape|level|objective|what.*do|debilit|derrot/.test(q)) {
    if(level===6) return say('Completá el código y dispará electricidad al núcleo amarillo. Después cruzá la compuerta.', 'Complete the code and fire electricity at the yellow core. Then go through the gate.')
    if(level===10) return say('Completá el código y dispará con la roja al núcleo del Guardián.', 'Complete the code and fire the red hand at the Guardian’s core.')
    if(level===12 || level===15) return say('Completá el código y acercate a la compuerta. Cuando te diga que corras, atravesala.', 'Complete the code and approach the gate. When I tell you to run, go through it.')
    if(level===20) return say('Completá el código, abrí el ducto y subí con la azul. Avanzá sin detenerte y abrí la rejilla con E.', 'Complete the code, open the vent and climb with the blue hand. Keep moving and open the exit grate with E.')
    return say('Leé la placa, activá los terminales en orden y cruzá la compuerta.', 'Read the plaque, activate the terminals in order, and go through the gate.')
  }
  return say('No sé la respuesta a eso. Puedo ayudarte con tu nivel, el código, la criatura, las manos, la máscara o los ductos.', 'I don’t know the answer to that. I can help with your level, the code, the creature, the hands, the mask, or the vents.')
}
