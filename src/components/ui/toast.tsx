import { useEffect, useState } from 'react'
import { Notice } from './page'

type Feedback = { message: string; tone: string }
const eventName = 'geopresensi:feedback'
export function notify(message: string, tone = 'error') {
  window.dispatchEvent(new CustomEvent<Feedback>(eventName, { detail: { message, tone } }))
}
export function ToastViewport() {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  useEffect(() => {
    const listener = (event: Event) => setFeedback((event as CustomEvent<Feedback>).detail)
    window.addEventListener(eventName, listener)
    return () => window.removeEventListener(eventName, listener)
  }, [])
  useEffect(() => {
    if (feedback?.tone !== 'success') return
    const timer = window.setTimeout(() => setFeedback(null), 5000)
    return () => window.clearTimeout(timer)
  }, [feedback])
  return feedback && <div className="academy-dashboard fixed inset-x-4 top-20 z-[90] mx-auto max-w-lg rounded-xl shadow-lg"><Notice tone={feedback.tone} onDismiss={() => setFeedback(null)}>{feedback.message}</Notice></div>
}
