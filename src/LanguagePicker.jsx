import React, {useEffect, useMemo, useState} from 'react'

const pageSize=60
const nativeUI={spa:'es',eng:'en'}
const normalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().trim()
const displayName=(item,language)=>language==='en'?item.reference:item.es || item.reference

export function LanguagePicker({language, canClose, onClose, onChoose}) {
  const [catalog,setCatalog]=useState(null)
  const [failed,setFailed]=useState(false)
  const [query,setQuery]=useState('')
  const [limit,setLimit]=useState(pageSize)
  const [preferred,setPreferred]=useState(null)
  const en=language==='en'
  useEffect(()=>{
    let live=true
    import('./data/languages.json')
      .then(({default:items})=>{ if(live)setCatalog(items) })
      .catch(()=>{ if(live)setFailed(true) })
    return ()=>{live=false}
  },[])
  const results=useMemo(()=>{
    if(!catalog)return []
    const term=normalize(query)
    const tokens=term?term.split(/\s+/):[]
    const matches=catalog.flatMap(item=>{
      const name=normalize(displayName(item,language))
      const text=normalize([item.id,item.tag,item.reference,item.es,item.native,...item.aliases].join(' '))
      if(tokens.some(token=>!text.includes(token)))return []
      const priority=term && (name===term||item.id===term||item.tag===term)?0
        :term && name.startsWith(term)?1 : !term && Object.hasOwn(nativeUI,item.id)?0 : 2
      return [{item,name,priority}]
    })
    const order=new Intl.Collator(en?'en':'es',{sensitivity:'base'})
    return matches.sort((a,b)=>a.priority-b.priority || order.compare(a.name,b.name)).map(({item})=>item)
  },[catalog,query,language,en])
  return <main className="language-screen" aria-labelledby="language-picker-title">
    <div className="language-picker">
      <h1 id="language-picker-title">{en?'What language do you speak?':'¿Qué idioma hablás?'}</h1>
      {!language && <p lang="en">What language do you speak?</p>}
      {preferred ? <>
        <p className="preferred-language">{displayName(preferred,language)}</p>
        <p>{en?'This language is in the catalog. Choose Spanish or English to play.':'El idioma está en el catálogo. Para jugar, elegí español o inglés.'}</p>
        <div className="language-options">
          <button className="primary" type="button" lang="es" onClick={()=>onChoose('es',preferred.id)}>Español</button>
          <button className="primary" type="button" lang="en" onClick={()=>onChoose('en',preferred.id)}>English</button>
        </div>
        <button className="secondary" type="button" onClick={()=>setPreferred(null)}>{en?'Back to languages':'Volver a los idiomas'}</button>
      </> : <>
        <label className="language-search" htmlFor="language-search">{en?'Search languages':'Buscar idioma / Search languages'}</label>
        <input id="language-search" autoFocus value={query} onChange={event=>{setQuery(event.target.value);setLimit(pageSize)}} placeholder={en?'Type a name or code':'Escribí un nombre o código'} />
        <p className="language-count" aria-live="polite">{failed?(en?'The catalog could not load.':'No se pudo cargar el catálogo.')
          :catalog?(en?results.length+' languages found':results.length+' idiomas encontrados')
          :(en?'Loading languages…':'Cargando idiomas…')}</p>
        {failed ? <div className="language-options">
          <button className="primary" type="button" lang="es" onClick={()=>onChoose('es','spa')}>Español</button>
          <button className="primary" type="button" lang="en" onClick={()=>onChoose('en','eng')}>English</button>
        </div> : <ul className="language-list">
          {results.slice(0,limit).map(item=>{
            const ui=nativeUI[item.id]
            const name=displayName(item,language)
            return <li key={item.id}><button type="button" onClick={()=>ui?onChoose(ui,item.id):setPreferred(item)}>
              <span>{name}{item.native && item.native!==name && <small lang={item.tag}>{item.native}</small>}</span>
              <small>{ui?(en?'Game language':'Idioma del juego'):item.id}</small>
            </button></li>
          })}
        </ul>}
        {results.length>limit && <button className="secondary" type="button" onClick={()=>setLimit(current=>current+pageSize)}>{en?'Show more languages':'Ver más idiomas'}</button>}
      </>}
      {canClose && <button className="secondary" type="button" onClick={onClose}>{en?'Close':'Cerrar'}</button>}
    </div>
  </main>
}
