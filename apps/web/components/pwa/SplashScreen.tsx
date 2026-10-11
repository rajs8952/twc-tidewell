import { BRAND, PILLAR_COLORS, PILLAR_ORDER } from '@/lib/brand'

/**
 * The mobile splash: the six pillar petals bloom into the OmniWell flower,
 * then the name and tagline fade in, and the whole screen fades away.
 *
 * Rendered on the server so it's on screen before any JavaScript runs, and
 * timed in CSS (globals.css, "Splash screen") so it always leaves, even on a
 * slow device. Phones only, once per visit: the inline script hides it
 * straight away if this tab has already shown it. Launching the installed
 * app starts a new visit, so it plays on every launch. Honours
 * "reduce motion" (a simple fade instead).
 */
export function SplashScreen() {
  return (
    <>
      <div id="ow-splash" aria-hidden>
        <div className="ow-splash-glow" />
        <svg viewBox="0 0 32 32" className="ow-splash-mark">
          {PILLAR_ORDER.map((k, i) => {
            const angle = (i / PILLAR_ORDER.length) * Math.PI * 2 - Math.PI / 2
            return (
              <circle
                key={k}
                className="ow-petal"
                cx={16 + Math.cos(angle) * 6.4}
                cy={16 + Math.sin(angle) * 6.4}
                r={6.2}
                fill={PILLAR_COLORS[k]}
                style={{ animationDelay: `${120 + i * 90}ms` }}
              />
            )
          })}
          <circle className="ow-core" cx={16} cy={16} r={2.6} fill="#FFFFFF" />
        </svg>
        <p className="ow-splash-name">{BRAND.name}</p>
        <p className="ow-splash-tagline">{BRAND.tagline}</p>
      </div>
      <script
        // Runs as the HTML is parsed, before first paint: hide the splash if this tab has seen it, and once it has faded.
        // (It's hidden with a flag on <html> rather than removed, so React's hydration still finds the element.)
        dangerouslySetInnerHTML={{
          __html: `(function(){var d=document.documentElement;try{if(sessionStorage.getItem('ow-splash')){d.setAttribute('data-splash','done');return}sessionStorage.setItem('ow-splash','1')}catch(e){}var s=document.getElementById('ow-splash');if(s)s.addEventListener('animationend',function(e){if(e.animationName==='ow-splash-out')d.setAttribute('data-splash','done')})})()`,
        }}
      />
    </>
  )
}
