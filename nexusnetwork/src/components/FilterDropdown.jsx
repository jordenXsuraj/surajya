import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A small filter dropdown anchored below its button (Home feed filter, Connect scope filter).
// The panel is drawn above the page (portal, fixed position) so a scrolling row can't clip it and it
// overlays the content instead of pushing it down; it stays inside the screen. Closes on choosing, on
// tapping outside and on Esc. Keyboard: ↑/↓ (or Home/End) move, Enter/Space choose, Tab/Esc close.
//
// options: [{ value, label, icon }]
export default function FilterDropdown({ value, options, onChange, label = 'Filter' }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const optionRefs = useRef([])
  const id = useId()
  const current = options.find(o => o.value === value) ?? options[0]

  const place = useCallback(() => {
    const b = buttonRef.current?.getBoundingClientRect()
    if (!b) return
    const width = Math.min(220, window.innerWidth - 24)
    const left = Math.min(Math.max(12, b.left), window.innerWidth - width - 12)
    setPos({ top: b.bottom + 6, left, width })
  }, [])

  const close = useCallback((focusButton = true) => {
    setOpen(false)
    if (focusButton) buttonRef.current?.focus()
  }, [])

  function openMenu() {
    place()
    setActive(Math.max(0, options.findIndex(o => o.value === value)))
    setOpen(true)
  }

  // follow the button while open (page scroll, resize, the row scrolling sideways)
  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    const onDown = e => {
      if (!panelRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) close(false)
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, place, close])

  useLayoutEffect(() => {
    if (open) optionRefs.current[active]?.focus()
  }, [open, active])

  function choose(v) {
    if (v !== value) onChange(v)
    close()
  }

  function onPanelKey(e) {
    const last = options.length - 1
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a >= last ? 0 : a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? last : a - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(last) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') close(false)
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active].value) }
  }

  return (
    <div className="scope-select-wrap">
      <button ref={buttonRef} type="button" className="scope-select fdd-button"
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openMenu() } }}>
        {current.icon} {current.label}
      </button>
      <span className="scope-arrow" aria-hidden="true">▾</span>
      {open && pos && createPortal(
        <ul ref={panelRef} id={`${id}-list`} className="fdd-panel" role="listbox" aria-label={label}
          style={{ top: pos.top, left: pos.left, minWidth: Math.min(180, pos.width), maxWidth: pos.width }}
          onKeyDown={onPanelKey}>
          {options.map((o, i) => {
            const selected = o.value === value
            return (
              <li key={o.value} ref={el => { optionRefs.current[i] = el }} role="option" aria-selected={selected}
                tabIndex={i === active ? 0 : -1} className={`fdd-option${selected ? ' on' : ''}`}
                onClick={() => choose(o.value)} onMouseEnter={() => setActive(i)}>
                <span className="fdd-icon" aria-hidden="true">{o.icon}</span>
                <span className="fdd-label">{o.label}</span>
                <span className="fdd-tick" aria-hidden="true">{selected ? '✓' : ''}</span>
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </div>
  )
}
