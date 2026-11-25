import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {extname} from 'node:path'
import {spawn} from 'node:child_process'

const origin = 'http://127.0.0.1:4180'
const root = new URL('../dist/', import.meta.url)
const contentTypes = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'}
const server = createServer(async (request, response) => {
  const {pathname} = new URL(request.url, origin)
  const file = pathname === '/' ? 'index.html' : pathname.slice(1)
  if (!/^(index\.html|assets\/[\w.-]+\.(js|css))$/.test(file)) {
    response.writeHead(404).end()
    return
  }
  try {
    const data = await readFile(new URL(file, root))
    response.writeHead(200, {'Content-Type': contentTypes[extname(file)]+'; charset=utf-8'})
    response.end(data)
  } catch {
    response.writeHead(404).end()
  }
})

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? 'El puerto 4180 ya está en uso. Si el juego ya está abierto, vuelve a esa pestaña.'
    : error.message)
  process.exitCode = 1
})
server.listen(4180,'127.0.0.1',() => {
  console.log('No bajes al infierno · '+origin)
  if (process.argv.includes('--open')) spawn('/usr/bin/open',[origin],{stdio:'ignore'})
})
