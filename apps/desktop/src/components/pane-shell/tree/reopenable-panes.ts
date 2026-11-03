/**
 * The zone menu's "Open tab" list: every pane the user can bring back that is
 * not on screen now — closed, minimized, hidden, or behind a sibling tab.
 *
 * Two sources:
 *  - registered panes (core tool panes, multi-pane plugins' dismissed panes),
 *    reopened through `restoreTreePane` so an owning store's toggle stays
 *    truthful;
 *  - panes of a DISABLED plugin still in the tree — closing a single-pane
 *    plugin's tab disables the plugin but keeps the pane id in place
 *    (`closeTreePane`), so its tab is listed under the plugin's name and
 *    reopening re-enables the plugin, which restores the pane where it was.
 *
 * Document tiles (sessions, previews, page routes, plugin workspaces) are not
 * listed: closing one ends it, and the sidebar / their own surface reopens it.
 * Summon-only panes (logs) leave the registry AND the tree when closed, so they
 * never appear here; their palette toggle stays the single door in.
 */

import { $pluginRecords, setPluginEnabled } from '@/contrib/plugins-store'
import { registry } from '@/contrib/registry'
import { PREVIEW_TILE_PREFIX } from '@/store/preview-explicit'

import { allPaneIds } from './model'
import { paneChrome } from './renderer/track-model'
import { $layoutTree, isPaneVisible, restoreTreePane, revealTreePane } from './store'

export interface ReopenablePane {
  id: string
  title: string
  open: () => void
}

const DOCUMENT_TILE_PREFIXES = ['session-tile:', `${PREVIEW_TILE_PREFIX}:`, 'route-tile:', 'plugin-workspace:']

const isDocumentTile = (paneId: string) => DOCUMENT_TILE_PREFIXES.some(prefix => paneId.startsWith(prefix))

function registeredPanes(): ReopenablePane[] {
  return registry
    .getArea('panes')
    .filter(c => !isDocumentTile(c.id) && !paneChrome(c).uncloseable && !isPaneVisible(c.id))
    .map(c => ({
      id: c.id,
      title: paneChrome(c).tabTitleText?.() ?? c.title ?? c.id,
      open: () => restoreTreePane(c.id)
    }))
}

function disabledPluginPanes(registered: ReadonlySet<string>): ReopenablePane[] {
  const tree = $layoutTree.get()

  if (!tree) {
    return []
  }

  const records = $pluginRecords.get()

  return allPaneIds(tree).flatMap(paneId => {
    const record = records[paneId.slice(0, paneId.indexOf(':'))]

    if (registered.has(paneId) || !paneId.includes(':') || record?.status !== 'disabled') {
      return []
    }

    return [
      {
        id: paneId,
        title: record.name,
        open: () => {
          void setPluginEnabled(record.id, true).then(() => revealTreePane(paneId))
        }
      }
    ]
  })
}

/** Resolved when the menu opens (no subscription), like the zone menu's other rows. */
export function reopenablePanes(): ReopenablePane[] {
  const registered = new Set(registry.getArea('panes').map(c => c.id))

  return [...registeredPanes(), ...disabledPluginPanes(registered)]
}
