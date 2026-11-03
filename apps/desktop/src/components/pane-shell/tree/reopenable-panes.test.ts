import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $pluginDecisions, $pluginRecords, publishPlugin } from '@/contrib/plugins-store'
import { registry } from '@/contrib/registry'

import { group, split } from './model'
import { reopenablePanes } from './reopenable-panes'
import { $dismissedPanes, $layoutTree, closeTreePane, isPaneVisible } from './store'

vi.mock('@/store/notifications', () => ({ notify: vi.fn() }))

const disposers: (() => void)[] = []

function registerPane(paneId: string, source: string) {
  const dispose = registry.register({
    area: 'panes',
    data: { placement: 'right' },
    id: paneId,
    render: () => null,
    source,
    title: `${paneId} title`
  })

  disposers.push(dispose)

  return dispose
}

/** A loaded single-pane plugin wired through the real plugins store, so the
 *  close → disable → reopen → enable round trip runs the production path. */
function loadSinglePanePlugin(pluginId: string, name: string) {
  let dispose: (() => void) | null = registerPane(`${pluginId}:pane`, `plugin:${pluginId}`)

  publishPlugin(
    { id: pluginId, kind: 'disk', name, status: 'loaded' },
    {
      activate: () => {
        dispose ??= registerPane(`${pluginId}:pane`, `plugin:${pluginId}`)
        $pluginRecords.set({ ...$pluginRecords.get(), [pluginId]: { ...$pluginRecords.get()[pluginId], status: 'loaded' } })
      },
      deactivate: () => {
        dispose?.()
        dispose = null
      }
    }
  )
}

const listedIds = () => reopenablePanes().map(pane => pane.id)

beforeEach(() => {
  window.localStorage.clear()
  $dismissedPanes.set(new Set())
  $pluginDecisions.set({})
  $pluginRecords.set({})
})

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
})

describe('Open tab list', () => {
  it('lists a closed pane of a multi-pane plugin and reopens it', () => {
    registerPane('bots:pane', 'plugin:bots')
    registerPane('bots:routines', 'plugin:bots')
    $layoutTree.set(
      split('row', [
        group(['workspace'], { active: 'workspace', id: 'g-main' }),
        group(['bots:pane'], { active: 'bots:pane', id: 'g-bots' }),
        group(['bots:routines'], { active: 'bots:routines', id: 'g-routines' })
      ])
    )

    closeTreePane('bots:routines')
    expect(listedIds()).toContain('bots:routines')
    expect(listedIds()).not.toContain('bots:pane')

    reopenablePanes()
      .find(pane => pane.id === 'bots:routines')!
      .open()

    expect(isPaneVisible('bots:routines')).toBe(true)
    expect(listedIds()).not.toContain('bots:routines')
  })

  it('lists a single-pane plugin closed from its tab under the plugin name and re-enables it', async () => {
    loadSinglePanePlugin('strata', 'Strata')
    $layoutTree.set(
      split('row', [
        group(['workspace'], { active: 'workspace', id: 'g-main' }),
        group(['strata:pane'], { active: 'strata:pane', id: 'g-strata' })
      ])
    )

    closeTreePane('strata:pane')
    expect($pluginRecords.get().strata.status).toBe('disabled')

    const entry = reopenablePanes().find(pane => pane.id === 'strata:pane')

    expect(entry?.title).toBe('Strata')

    entry!.open()
    await vi.waitFor(() => expect(isPaneVisible('strata:pane')).toBe(true))
    expect($pluginDecisions.get().strata).toBe(true)
    expect(listedIds()).not.toContain('strata:pane')
  })

  it('never lists on-screen panes, the workspace or document tiles', () => {
    registerPane('files', 'core')
    registerPane('session-tile:abc', 'core')
    $layoutTree.set(
      split('row', [
        // The session tile sits behind the workspace: off screen, yet a document
        // tile, so it must still stay off the list.
        group(['workspace', 'session-tile:abc'], { active: 'workspace', id: 'g-main' }),
        group(['files'], { active: 'files', id: 'g-files' })
      ])
    )

    expect(listedIds()).not.toContain('files')
    expect(listedIds()).not.toContain('workspace')
    expect(listedIds()).not.toContain('session-tile:abc')
  })
})
