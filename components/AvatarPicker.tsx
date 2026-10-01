'use client'

import { Camera, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { resizeImage } from '@/lib/image'
import { Avatar } from './Avatar'

interface Props {
  src: string | null
  name: string
  onPick: (blob: Blob, previewUrl: string) => void
}

export function AvatarPicker({ src, name, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/')) return setError('Choose an image file: JPG, PNG or WebP.')
    if (file.size > 15 * 1024 * 1024) return setError('That image is over 15 MB. Choose a smaller one.')
    setBusy(true)
    try {
      const blob = await resizeImage(file)
      onPick(blob, URL.createObjectURL(blob))
    } catch {
      setError('That image couldn’t be read. Try a JPG or PNG.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative rounded-full"
        aria-label={src ? 'Change profile photo' : 'Add profile photo'}
      >
        <Avatar src={src} name={name || '?'} size={80} />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white ring-4 ring-mist transition group-hover:bg-tide-600">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </span>
      </button>
      <div className="text-sm">
        <button type="button" onClick={() => inputRef.current?.click()} className="font-bold text-tide-600 hover:underline">
          {src ? 'Change photo' : 'Add a photo'}
        </button>
        <p className="text-muted">Square crop, any image under 15 MB.</p>
        {error && <p className="mt-1 font-semibold text-alert">{error}</p>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={handleChange} tabIndex={-1} />
    </div>
  )
}
