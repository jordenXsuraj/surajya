// The deployed commit, from Render's RENDER_GIT_COMMIT (set on every Render deploy). Shown by
// GET /healthz ("OK 2e1144b") so a deploy is confirmed by its SHA (docs/DEPLOYMENT.md, "Verify a
// deploy"). Read at call time; "unknown" locally or when the value isn't a git SHA.
function shortCommit(sha = process.env.RENDER_GIT_COMMIT) {
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha.trim())
    ? sha.trim().slice(0, 7).toLowerCase()
    : 'unknown'
}

module.exports = { shortCommit }
