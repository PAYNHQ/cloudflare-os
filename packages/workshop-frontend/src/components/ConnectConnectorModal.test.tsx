// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */

import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VendorDescription } from '@gadgets/workshop-shared/gatekeeper'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cloudflare/kumo', () => {
  const Dialog = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Root: ({ children }: { children: ReactNode }) => <>{children}</>,
      Title: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
      Description: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      Close: ({ render }: { render: (props: object) => ReactNode }) => render({}),
    },
  )
  return {
    Dialog,
    Switch: (props: ComponentProps<'input'>) => <input type="checkbox" {...props} />,
  }
})

vi.mock('./WorkshopControls', () => ({
  WorkshopButton: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type="button" {...props}>{children}</button>
  ),
  WorkshopIconButton: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type="button" {...props}>{children}</button>
  ),
}))

import ConnectConnectorModal from './ConnectConnectorModal'

const VENDOR: VendorDescription = {
  displayName: 'MCP Server Portals',
  url: 'https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/',
  color: '#f6821f',
}

describe('ConnectConnectorModal manage mode Reconnect', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    vi.restoreAllMocks()
    root = undefined
    container = undefined
  })

  async function render(props: Partial<ComponentProps<typeof ConnectConnectorModal>> = {}) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(
        <ConnectConnectorModal
          open
          mode="manage"
          vendorDescription={VENDOR}
          supportedResources={[]}
          onOpenChange={() => {}}
          credentialsValid
          {...props}
        />,
      )
      await Promise.resolve()
    })
    return container
  }

  function reconnectButton(rendered: HTMLDivElement) {
    return Array.from(rendered.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Reconnect'))
  }

  it('hides Reconnect when credentials are valid and alwaysOfferReconnect is unset', async () => {
    const rendered = await render()
    expect(reconnectButton(rendered)).toBeUndefined()
  })

  it('shows Reconnect when credentials have expired, regardless of alwaysOfferReconnect', async () => {
    const rendered = await render({ credentialsValid: false, onReconnect: vi.fn() })
    expect(reconnectButton(rendered)).toBeDefined()
  })

  it('shows Reconnect for a connector with alwaysOfferReconnect even while credentials are valid', async () => {
    // Mirrors the MCP Server Portals connector: its own `credentialsValid` can't see the portal's
    // separate on-behalf authorization lapsing, so it always offers Reconnect here.
    const onReconnect = vi.fn()
    const rendered = await render({
      credentialsValid: true,
      alwaysOfferReconnect: true,
      onReconnect,
    })
    const button = reconnectButton(rendered)
    expect(button).toBeDefined()

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })
})
