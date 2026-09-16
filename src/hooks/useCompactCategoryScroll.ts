import { useEffect, type RefObject } from 'react'

/** Keep the selected item visible when a category column becomes a horizontal strip. */
export function useCompactCategoryScroll(root: RefObject<HTMLElement | null>, selector: string, activePage: string) {
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 700px)')
    const reveal = () => {
      if (!narrow.matches) return
      const nav = root.current?.querySelector<HTMLElement>(selector)
      const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
      if (!nav || !active) return
      const item = active.getBoundingClientRect()
      nav.scrollLeft += item.left - nav.getBoundingClientRect().left - (nav.clientWidth - item.width) / 2
    }
    reveal()
    narrow.addEventListener('change', reveal)
    return () => narrow.removeEventListener('change', reveal)
  }, [root, selector, activePage])
}
