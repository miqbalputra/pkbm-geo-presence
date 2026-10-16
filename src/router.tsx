import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

const RouterContext = createContext(null)

type NavigateOptions = { replace?: boolean }
type RouteProps = { path: string; element: ReactNode }
type RouterProps = { children?: ReactNode }

function normalizePath(path) {
  if (!path) return '/'
  const value = path.split('?')[0].split('#')[0]
  if (value === '/') return value
  return value.replace(/\/+$/, '') || '/'
}

function readBrowserLocation() {
  return { pathname: normalizePath(window.location.pathname), search: window.location.search || '' }
}

function parseDestination(to: string) {
  const target = new URL(to, window.location.origin)
  return { pathname: normalizePath(target.pathname), search: target.search || '' }
}

function routeMatches(routePath, pathname) {
  const current = normalizePath(pathname)
  const target = normalizePath(routePath)

  if (target === '*') return true
  if (target.endsWith('/*')) return current === target.slice(0, -2) || current.startsWith(`${target.slice(0, -2)}/`)
  if (target === '/') return current === '/' || current === '/admin' || current === '/guru'
  return current === target || current.endsWith(target)
}

export function Router({ children }: RouterProps) {
  const [location, setLocation] = useState(() => readBrowserLocation())

  useEffect(() => {
    const onPopState = () => setLocation(readBrowserLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    const next = parseDestination(to)
    const current = readBrowserLocation()
    const nextURL = `${next.pathname}${next.search}`
    if (options.replace) window.history.replaceState({}, '', nextURL)
    else if (next.pathname !== current.pathname || next.search !== current.search) window.history.pushState({}, '', nextURL)
    setLocation(next)
  }, [])

  const value = useMemo(() => ({ ...location, navigate }), [location, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export const BrowserRouter = Router

export function useLocation() {
  const context = useContext(RouterContext)
  return context ? { pathname: context.pathname, search: context.search || '' } : readBrowserLocation()
}

export function useNavigate() {
  const context = useContext(RouterContext)
  return context?.navigate || (() => {})
}

export function Route(_props: RouteProps) {
  return null
}

export function Routes({ children }: RouterProps) {
  const { pathname } = useLocation()
  const routeList = Array.isArray(children) ? children : [children]
  const match = routeList
    .filter(Boolean)
    .map((route) => route.props || route)
    .find((route) => routeMatches(route.path, pathname))
  return match?.element || null
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate()
  useEffect(() => navigate(to, { replace }), [navigate, replace, to])
  return null
}

export function NavLink({ to, children, className, onClick, end = false, ...props }: { to: string; children?: ReactNode | ((state: { isActive: boolean }) => ReactNode); className?: string | ((state: { isActive: boolean }) => string); onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void; end?: boolean; [key: string]: unknown }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const active = end ? normalizePath(pathname) === normalizePath(to) : routeMatches(to, pathname)
  const resolvedClassName = typeof className === 'function' ? className({ isActive: active }) : className

  const handleClick = (event) => {
    if (onClick) onClick(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }

  return <a href={to} className={resolvedClassName} onClick={handleClick} {...props}>{typeof children === 'function' ? children({ isActive: active }) : children}</a>
}
