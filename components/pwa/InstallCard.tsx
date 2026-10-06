'use client'

import { Download, Share, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ProfileSection } from '@/components/profile/ProfileSection'
import { isIosSafari, isStandalone, promptInstall, useCanInstall } from '@/lib/pwa'

/**
 * "Install OmniWell" on Profile. Shows the browser's install dialog where one
 * is offered (Chrome, Edge, Android), the Share-menu tip on iPhone/iPad
 * Safari, and nothing once the app is installed or where neither applies.
 */
export function InstallCard() {
  const canInstall = useCanInstall()
  const [env, setEnv] = useState<{ standalone: boolean; ios: boolean } | null>(null)
  const [installed, setInstalled] = useState(false)

  // Browser checks run after mount so the server and first client render match.
  useEffect(() => setEnv({ standalone: isStandalone(), ios: isIosSafari() }), [])

  if (!env || env.standalone || installed) return null
  if (!canInstall && !env.ios) return null

  return (
    <ProfileSection id="install" title="Install OmniWell" description="Open it from your home screen like any other app." icon={Smartphone} accent="#4A5BC4">
      {canInstall ? (
        <button
          type="button"
          onClick={async () => setInstalled(await promptInstall())}
          className="btn-primary"
        >
          <Download className="h-4 w-4" aria-hidden /> Install app
        </button>
      ) : (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
          Tap <Share className="inline h-4 w-4" aria-label="Share" /> <strong>Share</strong> in Safari’s toolbar, then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </ProfileSection>
  )
}
