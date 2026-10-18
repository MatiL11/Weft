import { describe, expect, it } from 'vitest'
import { libraryHref, parseLibraryView, videoListQuery } from './library'

describe('library view', () => {
  it('reads the view from the URL', () => {
    expect(parseLibraryView({ workspace: 'w', folder: 'f', q: '  plan ', view: 'trash' })).toEqual({
      workspaceId: 'w',
      folder: 'f',
      query: 'plan',
      trash: true,
    })
    expect(parseLibraryView({ q: ['a', 'b'], view: 'grid' })).toEqual({
      workspaceId: undefined,
      folder: undefined,
      query: undefined,
      trash: false,
    })
    expect(parseLibraryView({ q: 'x'.repeat(200) }).query).toHaveLength(100)
  })

  it('builds dashboard links and API queries', () => {
    expect(libraryHref({})).toBe('/')
    expect(libraryHref({ workspaceId: 'w', folder: 'root', query: 'a b' })).toBe(
      '/?workspace=w&folder=root&q=a+b',
    )
    expect(libraryHref({ workspaceId: 'w', folder: 'f', trash: true })).toBe(
      '/?workspace=w&view=trash',
    )
    expect(videoListQuery({ workspaceId: 'w', folder: 'f' })).toBe('workspaceId=w&folderId=f')
    // A search looks everywhere, not just in the open folder.
    expect(videoListQuery({ folder: 'f', query: 'x' })).toBe('q=x')
    expect(videoListQuery({ trash: true, query: 'x' })).toBe('trash=1')
  })
})
