import React, {useEffect, useMemo, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {createGame} from './scene.js'
import {guideAnswer} from './light-guide.js'
import {LanguagePicker} from './LanguagePicker.jsx'
import {MAX_LEVEL, TOOLS, levelLayout, mergeProgress, progressKey, readProgress} from './rules.js'
import {languageKey,readLanguage,translate} from './language.js'
import './style.css'

const levelTitle=level=>level>=10?'Vueltas en el Limbo':''
const objectives = ['Leé la placa con E.', 'Activá los terminales en el orden de la placa.', 'Cruza la compuerta del fondo.']

function App() {
  const host = useRef(null)
  const game = useRef(null)
  const [sessionSaves, setSessionSaves] = useState({})
  const [language, setLanguage] = useState(readLanguage)
  const [showLanguages,setShowLanguages] = useState(false)
  const choosingLanguage=!language || showLanguages
  function chooseLanguage(ui, preferred) {
    setLanguage(ui)
    setShowLanguages(false)
    try { localStorage.setItem('no-bajes:preferred-language',preferred) } catch {}
  }
  const [finaleShots,setFinaleShots]=useState(null)
  const [glare, setGlare] = useState(0)
  const t=text=>translate(language,text)
  const [name, setName] = useState('')
  const [levelChoice, setLevelChoice] = useState(null)
  const [player, setPlayer] = useState('')
  const [level, setLevel] = useState(1)
  const levelLength = useMemo(() => levelLayout(level).length.toFixed(1), [level])
  const [mode, setMode] = useState('menu')
  const [introDark, setIntroDark] = useState(false)
  const [showHeadphones, setShowHeadphones] = useState(true)
  const [hud, setHud] = useState({})
  const [question,setQuestion]=useState('')
  const [dialogue,setDialogue]=useState([])
  const dialogueLog=useRef(null)
  const [notice, setNotice] = useState('')
  const [sound, setSound] = useState(true)
  const [soundReady, setSoundReady] = useState(false)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimer = useRef()
  const flashTimer = useRef()
  const callbacks = useRef({})
  function flash(message) {
    setNotice(message)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setNotice(''), 4300)
  }
  function store(progress) {
    const key = progressKey(progress.name)
    const latest = mergeProgress(readProgress(progress.name), sessionSaves[key] ?? progress)
    const merged = mergeProgress(latest, progress)
    try {
      localStorage.setItem(key, JSON.stringify(merged))
      setStorageError(false)
      setSaved(true)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => setSaved(false), 2500)
    } catch {
      clearTimeout(saveTimer.current)
      setSaved(false)
      setStorageError(true)
    }
    setSessionSaves(current => ({...current, [key]: mergeProgress(current[key], merged)}))
  }
  callbacks.current = {
    hud: setHud, message: flash,
    guide: () => {setQuestion('');setMode('guide')},
    betrayalStart: () => setMode('betrayal'),
    betrayalRescued: () => setMode('play'),
    finaleStart: () => {setNotice('');setFinaleShots(null);setMode('finale')},
    finaleReady: () => setFinaleShots(0),
    finaleCount: setFinaleShots,
    introDone: () => enter(1),
    introBlackout: () => setIntroDark(true),
    windowGlare: () => setGlare(current=>current+1),
    attack: () => {setNotice(''); setMode('attack')},
    attackSurvived: () => setMode('play'),
    liftStart: () => setMode('lift'),
    pause: () => setMode(current => current === 'play' ? 'pause' : current),
    dead: () => { setNotice(''); setMode('dead') },
    clear: () => {
      store({name: player, level: Math.min(level + 1, MAX_LEVEL), complete: level === MAX_LEVEL})
      setNotice('')
      setMode(level === MAX_LEVEL ? 'end' : 'clear')
    }
  }
  useEffect(() => {
    try {
      game.current = createGame(host.current, callbacks)
    } catch {
      setError('No se pudo iniciar WebGL. Abre el juego en un navegador de escritorio con aceleración gráfica.')
    }
    return () => { game.current?.dispose(); clearTimeout(flashTimer.current); clearTimeout(saveTimer.current) }
  }, [])
  useEffect(()=>{
    if(!language) return
    document.documentElement.lang=language
    document.title=language==='en'?'Don’t Go Down to Hell':'No bajes al infierno'
    game.current?.setLanguage(language)
    try { localStorage.setItem(languageKey,language) } catch {}
  },[language])
  useEffect(()=>{
    if(dialogueLog.current) dialogueLog.current.scrollTop=dialogueLog.current.scrollHeight
  },[dialogue,mode])
  function askLight(event) {
    event.preventDefault()
    const text=question.trim()
    if(!text)return
    const answer=guideAnswer(text,level,hud,language)
    setDialogue(current=>[...current,{text,answer}])
    setQuestion('')
  }
  function closeGuide() {
    setMode('play')
    game.current.resume()
  }
  function enter(nextLevel, nextName = player) {
    setPlayer(nextName)
    setLevel(nextLevel)
    store({name: nextName, level: nextLevel, complete: false})
    setHud({})
    setDialogue([])
    setGlare(0)
    setMode('play')
    game.current.start(nextLevel)
    flash(nextLevel === 1
      ? nextName + ', bajaste por el agujero sin leer el letrero. Ahora la entrada está cerrada.'
      : nextName + (nextLevel>10?', algo más te espera en el pasillo.':', el Guardián ya sabe que estás aquí.'))
  }
  function launch(nextLevel, nextName) {
    if (nextLevel!==1) {
      enter(nextLevel, nextName)
      return
    }
    setPlayer(nextName)
    setLevel(1)
    setNotice('')
    setIntroDark(false)
    setMode('intro')
    game.current.intro()
  }
  async function enableAudio() {
    if(sound && !soundReady && await game.current?.enableAudio()) setSoundReady(true)
  }
  function toggleAudio() {
    if(sound && !soundReady) {
      void enableAudio()
      return
    }
    game.current?.mute(sound)
    setSound(!sound)
    if(!sound) void game.current?.enableAudio().then(setSoundReady)
  }
  function menu() {
    game.current.menu()
    setNotice('')
    setName('')
    setLevelChoice(null)
    setMode('menu')
  }
  const cleanName = name.trim()
  const save = cleanName ? sessionSaves[progressKey(cleanName)] ?? readProgress(cleanName) : null
  const maxUnlocked=save?.level ?? 1
  const selectedLevel=Math.min(levelChoice ?? maxUnlocked,maxUnlocked)
  const chapter=levelTitle(selectedLevel)
  const buttonLabel=selectedLevel===1?'Descender'
    : selectedLevel===maxUnlocked && !save?.complete ? 'Continuar · Nivel '+selectedLevel : 'Jugar · Nivel '+selectedLevel
  return <>
    <div ref={host} className="viewport" aria-hidden="true" />
    {mode !== 'play' && mode !== 'attack' && mode !== 'finale' && mode !== 'lift' && mode !== 'betrayal' && mode !== 'intro' && <div className="veil" />}
    <div className="grain" />
    <div inert={showHeadphones || choosingLanguage}>
    {mode === 'intro' ? <div className={introDark ? "cinematic dark" : "cinematic"}>
      <button type="button" onClick={() => game.current.finishIntro()}>{t('Saltar introducción')} <kbd>Esc</kbd></button>
    </div> : mode === 'attack' ? <div className="subtitle" role="status">{t(notice || 'La barrera de espejo detuvo el ataque.')}</div> : mode === 'lift' ? <div className="subtitle" role="status">{t(notice || 'Ascensor restaurado. Descendiendo…')}</div> : mode === 'finale' ? <>
      {notice && <div className="subtitle" role="status">{t(notice)}</div>}
      {finaleShots!==null && <div className="finale-prompt" role="status">
        {finaleShots<3 ? t('Clic izquierdo o X · Disparar') : t('Último disparo')} · {finaleShots}/3
      </div>}
    </> : mode === 'betrayal' ? <>
      {notice && <div className="subtitle" role="status">{t(notice)}</div>}
    </> : mode === 'guide' ? <main className="guide-panel" aria-labelledby="guide-title" onKeyDown={event=>{if(event.key==='Escape')closeGuide()}}>
      <div>
        <h2 id="guide-title">{t('LA LUZ')}</h2>
        <p>{t('Preguntá sobre tu partida')}</p>
        <div className="guide-log" ref={dialogueLog} aria-live="polite">
          {dialogue.map(({text,answer},index)=><div key={index}><p className="guide-question">{text}</p><p>{answer}</p></div>)}
        </div>
        <form onSubmit={askLight}>
          <label htmlFor="guide-question">{t('Tu pregunta')}</label>
          <input id="guide-question" autoFocus value={question} onChange={event=>setQuestion(event.target.value)}/>
          <button className="primary" disabled={!question.trim()}>{t('Preguntar')}</button>
        </form>
        <button className="secondary" type="button" onClick={closeGuide}>{t('Volver al juego')}</button>
      </div>
    </main> : mode === 'play' ? <>
      <header className="game-header"><div className="mark">{t('NIVEL')}<span> / </span>{String(level).padStart(3,'0')}<span>·</span>{levelLength} m{levelTitle(level) && <span className="chapter-title">{levelTitle(level)}</span>}</div><div className="top-controls"><button type="button" onClick={()=>game.current.openGuide()}>{t('Preguntarle a la luz')} · L</button><button type="button" onClick={() => game.current.pause()}>{t('Pausa · Esc')}</button></div></header>
      {hud.frameRate>0 && <div className="frame-rate">{hud.frameRate} FPS</div>}
      <div className="crystal-meter">
        <b>{t('Cristal')}</b>
        <meter min="0" max="25" value={25-(hud.crystalCooldown||0)} aria-label={t('Cristal')} />
        <span>{Math.round((25-(hud.crystalCooldown||0))*4)}%</span>
      </div>
      <div className={hud.safe ? "mission safe" : "mission"}>
        <small>{t(hud.safe ? 'ZONA SEGURA' : hud.inDuct ? 'DUCTO · OCULTO' : hud.allied ? 'ALIADO' : hud.detected ? ((hud.enemy || 'El Guardián')+' te ve').toUpperCase() : hud.searching ? ((hud.enemy || 'El Guardián')+' está confundido').toUpperCase() : 'OBJETIVO')}</small>
        <p>{t(hud.duelCue ? 'La luz: ¡CORRÉ! Pasá por la compuerta.' : hud.duelPending ? 'Seguí hacia la compuerta.' : hud.detected ? 'Girá detrás de una pared para perderlo.' : hud.bossVulnerable ? (level===6?'Dispará electricidad al núcleo amarillo para debilitar al Guardián.':'Apuntá al núcleo del Guardián y dispará con la mano roja.') : hud.bossDefeated ? 'Derrotaste al Guardián. Cruzá la compuerta.' : level===6 && hud.guardWeakened ? 'El Guardián está debilitado. Cruzá la compuerta.' : hud.finalEscape ? 'Abrí el ducto, subí con la mano azul y buscá la rejilla de salida.' : objectives[hud.objective || 0])}</p>
        <ol className="lift-objectives" aria-label={t('Objetivos del ascensor')}>
          <li><span aria-hidden="true">{hud.progress>=3?'✓':'□'}</span> {t('Restaurá la energía del ascensor')} ({Math.min(hud.progress||0,3)}/3)</li>
          <li><span aria-hidden="true">{hud.progress>=6?'✓':'□'}</span> {t('Resolvé los tres mecanismos de manos')} ({Math.max(0,(hud.progress||0)-3)}/3)</li>
          <li><span aria-hidden="true">□</span> {t(level===MAX_LEVEL?'Escapá del Limbo':'Descendé y encontrá la salida')}</li>
        </ol>
        {level===6 && hud.guardWeakened && <p className="milestone" role="status">{t('✓ Debilitaste al Guardián. Compuerta abierta.')}</p>}
        {level===6 && hud.bossVulnerable && <p className="milestone active-core">{t('Núcleo amarillo')} · {hud.bossDistance} m · 2, {t('Electricidad y clic derecho')}</p>}
        {hud.code && <b>{hud.code.map((id, i) => <span key={i} className={'c'+id}>{t(TOOLS[id])}{i < hud.progress ? ' ✓' : ''}</span>)}</b>}
        {hud.distance !== null && hud.distance !== undefined && <p className="range">{t('Distancia en línea recta al próximo terminal')} · {hud.distance} m</p>}
      </div>
      <div className="crosshair" />
      {hud.reclaiming && <div className="prompt" role="status">{t(hud.grabbedAlly ? 'Espacio · Tirar del cable' : 'Clic izquierdo · Agarrar al aliado')} · {hud.rescuePulls}/5</div>}
      {!hud.reclaiming && hud.hint && <div className="prompt">{t(hud.hint)}</div>}
      {notice && <div className="subtitle" role="status">{t(notice)}</div>}
      {glare>0 && <div key={glare} className="window-glare" aria-hidden="true" />}
      {hud.danger && <div className="danger" />}
      {hud.passage && <div className="duct-passage" aria-hidden="true" />}
      {hud.invisible > 0 && <div className="invisible mask-view" />}
      <div className="equipment">
        <div className={'c5'+(!hud.selected || hud.selected===5 ? ' selected' : '')}><i className="equipment-hand" aria-hidden="true" /><kbd>1</kbd>{t('Roja')}</div>
        <div className={'c1'+(hud.selected===1 ? ' selected' : '')}><i className="equipment-hand" aria-hidden="true" /><kbd>2</kbd>{t('Amarilla')}</div>
        <div className={'c2'+(hud.selected===2 ? ' selected' : '')}><i className="equipment-hand" aria-hidden="true" /><kbd>3</kbd>{t('Presión gris')}</div>
        <div className={hud.hologramCooldown?'':'c0'}><i className="equipment-hologram" aria-hidden="true" /><kbd>G</kbd>{t('Holograma')}{hud.hologramCooldown>0 && ` · ${hud.hologramCooldown} s`}</div>
      </div>
      <div className="tools">
        <div className={hud.crystalCooldown?'':'c0'}>{t(hud.crystalCooldown ? 'Cristal recargando' : 'Cristal listo')}{hud.crystalCooldown>0 && ` · ${hud.crystalCooldown} s`}</div>
        <div className={hud.flashlight ? 'selected' : ''}><kbd>F</kbd>{t(hud.flashlight ? 'Linterna encendida' : 'Encender linterna')}</div>
        <div className="c0"><kbd>H</kbd>{t('ChatGPT · Pista')}</div>
        <div><kbd>C</kbd>{t(hud.crouching ? 'Agachado' : 'Agacharte')}</div>
        <div className="c0 selected">{t('Clic izq. · Azul')}</div>
        <div title={t('Clic izquierdo y derecho · Ambas manos')}><kbd>V</kbd>{t('Ambas manos')}</div>
        {hud.selected === 1 && <div className={'c'+(hud.element || 1)}><kbd>R</kbd>{t(TOOLS[hud.element || 1])}</div>}
        <div className={hud.invisible ? 'c0 selected' : ''}><kbd>Q</kbd>{t(hud.invisible ? 'Máscara · Invisible '+hud.invisible+' s' : hud.cooldown ? 'Máscara · Recarga '+hud.cooldown+' s' : 'Máscara lista')}</div>
      </div>
    </> : <>
      <header className="top"><div className="mark"><i /> {chapter || (t('NO BAJES')+' / '+t('AL INFIERNO'))}</div><div className="top-controls"><button type="button" onClick={()=>setShowLanguages(true)}>{t('Idioma')}</button><button type="button" aria-pressed={sound && soundReady} onClick={toggleAudio}>{t(sound && !soundReady ? 'Activar audio' : sound ? 'Audio sí' : 'Audio no')}</button></div></header>
      {mode === 'menu' ? <main className="menu">
        <div className="eyebrow">{t('TERROR EN PRIMERA PERSONA')}</div>
        <h1>{chapter ? 'VUELTAS' : t('NO BAJES')}<br /><em>{chapter ? 'EN EL LIMBO' : t('AL INFIERNO')}</em></h1>
        <p className="intro">{t('Encontraste un agujero y bajaste sin mirar el letrero.')}<br />{t('Ahora algo hará lo posible por que te quedes.')}</p>
        <form onSubmit={e => {e.preventDefault(); if (cleanName && !error) launch(selectedLevel, cleanName)}}>
          <label htmlFor="name">{t('NOMBRE DEL JUGADOR')}</label>
          <input autoComplete="off" id="name" value={name} placeholder={t('Escribe tu nombre')} maxLength={24} required onPointerDown={enableAudio} onKeyDown={enableAudio} onChange={e => {setName(e.target.value); setLevelChoice(null)}} />
          {maxUnlocked>1 && <>
            <label htmlFor="level-choice">{t('NIVEL DESBLOQUEADO')}</label>
            <select id="level-choice" value={selectedLevel} onChange={e => setLevelChoice(Number(e.target.value))}>
              {Array.from({length:maxUnlocked},(_,index)=><option key={index+1} value={index+1}>{t('Nivel')} {index+1}{levelTitle(index+1) ? ' · '+levelTitle(index+1) : ''}</option>)}
            </select>
          </>}
          {chapter && <span className="chapter-name">{chapter}</span>}
          <button className="primary" disabled={!cleanName || !!error}>{t(buttonLabel)} <span aria-hidden="true">↘</span></button>
        </form>
        {error && <p role="alert">{t(error)}</p>}
      </main> : <main className="panel">
        <div className="eyebrow">{t('NIVEL')} {String(level).padStart(3,'0')}{levelTitle(level) ? ' · '+levelTitle(level) : ''}</div>
        <h2>{t({pause:'En pausa',dead:'Te encontró',clear:'Compuerta abierta',end:'Autorizado a salir'}[mode])}</h2>
        <p>{t({pause:'Algo se mueve ahí abajo.',dead:player+', la oscuridad da una segunda oportunidad.',clear:level===6 ? player+', debilitaste al Guardián.' : player+', la compuerta da a otro tramo de escaleras.',end:player+', vos y ChatGPT salieron del Limbo.'}[mode])}</p>
        {mode !== 'end' && <button className="primary" onClick={() => {
          if (mode === 'pause') { setMode('play'); game.current.resume() }
          else enter(mode === 'clear' ? level + 1 : level)
        }}>{t({pause:'Volver al juego',dead:'Reiniciar nivel',clear:'Bajar al siguiente nivel'}[mode])} <span>↘</span></button>}
        <button className="secondary" onClick={menu}>{t('Menú principal')}</button>
      </main>}
      <footer><span>{t('WASD · MOVER')}</span><span>{t('RATÓN · MIRAR')}</span><span>{t('E · LEER')}</span><span>{t('C · AGACHARTE')}</span><span>{t('ESPACIO · SALTAR')}</span><span>{t('CLIC IZQ. · AZUL')}</span><span>{t('CLIC DER. · MANO DERECHA')}</span><span>{t('1–3 · CAMBIAR DERECHA')}</span><span>{t('R · ELEMENTO')}</span><span>{t('F · LINTERNA')}</span><span>{t('Q · MÁSCARA')}</span><span>{t('L · LUZ')}</span><span>{t('SHIFT · CORRER')}</span></footer>
    </>}
    </div>
    {choosingLanguage && !showHeadphones && <LanguagePicker language={language} canClose={!!language}
      onClose={()=>setShowLanguages(false)} onChoose={chooseLanguage} />}
    {showHeadphones && <div className="headphones-screen" onAnimationEnd={() => setShowHeadphones(false)}>
      <div className="headphones-notice">
        <svg className="headphones-icon" viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <path d="M15 55v-9a33 33 0 0 1 66 0v9" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <rect x="12" y="50" width="20" height="32" rx="7" stroke="currentColor" strokeWidth="4" />
          <rect x="64" y="50" width="20" height="32" rx="7" stroke="currentColor" strokeWidth="4" />
          <path d="M26 57v18m44-18v18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p role="status">{t('Audífonos recomendados')}</p>
      </div>
    </div>}
    {saved && <div className="save-notice" role="status">
      <svg viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <path d="M29 29C16 29 8 19 9 6c6 10 13 12 23 18m11 5C56 29 64 19 63 6c-6 10-13 12-23 18" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>
        <path d="m27 25 9-5 9 5 9 10-8 12-5 14-5 5-5-5-5-14-8-12 9-10Z" fill="currentColor"/>
        <path d="m23 35 9 3-3 6-6-4v-5Zm26 0-9 3 3 6 6-4v-5ZM33 51h6l-3 5-3-5Z" fill="#17110e"/>
        <path d="m36 29 2 6-2 5" stroke="#7c5c4c" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      {t('Partida guardada')}
    </div>}
    {storageError && <div className="storage" role="alert">{t('El navegador bloqueó el guardado. El progreso se conserva mientras esta pestaña esté abierta.')}</div>}
  </>
}

createRoot(document.getElementById('root')).render(<App />)
