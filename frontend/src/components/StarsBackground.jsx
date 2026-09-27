// Adapted from the Animate UI "Stars Background" component (animate-ui.com).
// Stars are placed only inside the scrolling layer (the original scattered most of them off screen).
import { useEffect, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

const LAYER_WIDTH = 2560
const LAYER_HEIGHT = 2000

function makeStars(count, color) {
  const shadows = []
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * LAYER_WIDTH)
    const y = Math.floor(Math.random() * LAYER_HEIGHT)
    shadows.push(`${x}px ${y}px ${color}`)
  }
  return shadows.join(', ')
}

function StarLayer({ count, size, duration, twinkle, color, opacity, animated }) {
  const [boxShadow] = useState(() => makeStars(count, color))
  const dot = { width: size, height: size, boxShadow }

  return (
    <motion.div
      initial={false}
      animate={animated ? { y: [0, -LAYER_HEIGHT], opacity: [opacity, opacity * 0.45, opacity] } : undefined}
      transition={{
        y: { repeat: Infinity, duration, ease: 'linear' },
        opacity: { repeat: Infinity, duration: twinkle, ease: 'easeInOut' },
      }}
      style={{ opacity }}
      className="absolute left-0 top-0 w-full will-change-transform"
    >
      <div className="absolute rounded-full bg-transparent" style={dot} />
      <div className="absolute rounded-full bg-transparent" style={{ ...dot, top: LAYER_HEIGHT }} />
    </motion.div>
  )
}

const INDIGO = '#3f3cbb'
const WHITE = '#ffffff'

export default function StarsBackground({ factor = 0.05, speed = 50, className = '' }) {
  const reduce = useReducedMotion()
  const offsetX = useMotionValue(0)
  const offsetY = useMotionValue(0)
  const springX = useSpring(offsetX, { stiffness: 50, damping: 20 })
  const springY = useSpring(offsetY, { stiffness: 50, damping: 20 })

  useEffect(() => {
    if (reduce) return
    const follow = (e) => {
      offsetX.set(-(e.clientX - window.innerWidth / 2) * factor)
      offsetY.set(-(e.clientY - window.innerHeight / 2) * factor)
    }
    window.addEventListener('pointermove', follow, { passive: true })
    return () => window.removeEventListener('pointermove', follow)
  }, [reduce, factor, offsetX, offsetY])

  const animated = !reduce

  return (
    <div aria-hidden="true" className={`pointer-events-none overflow-hidden ${className}`}>
      <motion.div style={{ x: springX, y: springY }}>
        <StarLayer count={1500} size={2} duration={speed} twinkle={5} color={INDIGO} opacity={0.55} animated={animated} />
        <StarLayer count={650} size={3} duration={speed * 1.6} twinkle={7} color={WHITE} opacity={1} animated={animated} />
        <StarLayer count={280} size={5} duration={speed * 2.4} twinkle={9} color={WHITE} opacity={0.9} animated={animated} />
      </motion.div>
    </div>
  )
}
