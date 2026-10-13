import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraCapture } from './CameraCapture'

function fakeStream() {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
}

describe('CameraCapture', () => {
  afterEach(cleanup)

  it('start met de achtercamera en wisselt naar een selfie met de flip-knop', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream())
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })

    render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />)

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) })))
    await screen.findByRole('button', { name: /foto maken/i })

    fireEvent.click(screen.getByRole('button', { name: /wissel tussen selfie en achtercamera/i }))

    await waitFor(() => expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'user' } }) })))
  })

  it('valt terug op het bestandsinvoerveld als getUserMedia ontbreekt, met selfie-optie', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })

    render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />)

    const input = await screen.findByLabelText(/foto maken/i)
    expect(input).toHaveAttribute('capture', 'environment')

    fireEvent.click(screen.getByRole('button', { name: /wissel naar selfie/i }))
    expect(input).toHaveAttribute('capture', 'user')
  })

  beforeEach(() => vi.restoreAllMocks())
})
