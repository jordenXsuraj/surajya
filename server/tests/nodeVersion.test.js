// Render runs the Node version in package.json engines.node; server/.nvmrc is the same version for
// nvm users. The two must never disagree (docs/DEPLOYMENT.md, "Render").
const fs = require('fs')
const path = require('path')

test('.nvmrc and engines.node name the same exact Node version', () => {
  const nvmrc = fs.readFileSync(path.join(__dirname, '..', '.nvmrc'), 'utf8').trim()
  const { engines } = require('../package.json')
  expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/)
  expect(engines.node).toBe(nvmrc)
})
