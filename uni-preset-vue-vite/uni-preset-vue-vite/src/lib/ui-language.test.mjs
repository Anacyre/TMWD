import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('..', import.meta.url))
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/

function walk (dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(vue|js|mjs|css)$/.test(name)) out.push(path)
  }
  return out
}

const hits = []
for (const dir of ['components', 'store']) {
  for (const file of walk(join(src, dir))) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (CJK.test(line)) hits.push(relative(src, file) + ':' + (i + 1) + '  ' + line.trim().slice(0, 80))
    })
  }
}
if (hits.length) throw new Error('UI text must be English:\n' + hits.join('\n'))

console.log('ui-language ok')
