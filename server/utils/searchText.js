// User text that ends up inside a MongoDB $regex (search boxes, skill filters) is matched
// literally and only up to 50 characters: "C++" finds C++ (not every skill with a "c"), ".*" is
// just text, and patterns like "(a+)+$" can never make the database backtrack.

const MAX_SEARCH_LENGTH = 50

/** Escapes every regular-expression character. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The trimmed text (first 50 characters), or '' for anything that is not a string. */
function searchText(value) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, MAX_SEARCH_LENGTH).trim()
}

/** A case-insensitive "contains" match for the user's text, or null when there is none. */
function containsText(value) {
  const text = searchText(value)
  return text ? { $regex: literal(text), $options: 'i' } : null
}

module.exports = { MAX_SEARCH_LENGTH, literal, searchText, containsText }
