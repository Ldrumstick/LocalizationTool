import { CSVFileData, SearchResult } from '../../types';

export type GroupedSearchItem = {
  result: SearchResult;
  index: number;
};

export type GroupedSearchResult = {
  fileId: string;
  items: GroupedSearchItem[];
};

export type VirtualSearchRow =
  | { type: 'group'; key: string; fileId: string; count: number }
  | { type: 'match'; key: string; item: GroupedSearchItem };

export type SearchListViewportSnapshot = {
  anchorKey?: string;
  anchorOffset: number;
  fallbackScrollOffset: number;
};

export type SearchListViewportResolution = {
  scrollOffset: number;
  anchorFound: boolean;
};

export type SearchResultLiveOverride = {
  fileId: string;
  rowIndex: number;
  colIndex: number;
  value: string;
};

const CONTEXT_PREVIEW_LIMIT = 50;
const objectIdentityIds = new WeakMap<object, number>();
let nextObjectIdentityId = 1;

function getObjectIdentityId(value: object | undefined): number {
  if (!value) return 0;

  const existing = objectIdentityIds.get(value);
  if (existing) return existing;

  const nextId = nextObjectIdentityId++;
  objectIdentityIds.set(value, nextId);
  return nextId;
}

export function getSearchResultKey(result: SearchResult): string {
  return `${result.fileId}:${result.rowIndex}:${result.colIndex}`;
}

export function getSearchResultDisplayRowNumber(result: SearchResult): number {
  return result.rowIndex + 1;
}

export function getSearchResultColumnLabel(headers: string[] | undefined, colIndex: number): string {
  const header = headers?.[colIndex]?.trim();
  if (header) return header;
  return `列 ${colIndex + 1}`;
}

export function buildSearchDataDependencyKey(
  files: Record<string, CSVFileData>,
  options: { isGlobalSearch: boolean; selectedFileId?: string }
): string {
  const targetFileIds = options.isGlobalSearch
    ? Object.keys(files).sort()
    : (options.selectedFileId ? [options.selectedFileId] : []);

  return targetFileIds.map((fileId) => {
    const file = files[fileId];
    if (!file) return `${fileId}:missing`;

    const rowsIdentity = getObjectIdentityId(file.rows as unknown as object | undefined);
    const headersIdentity = getObjectIdentityId(file.headers as unknown as object | undefined);
    return `${fileId}:${rowsIdentity}:${headersIdentity}:${file.rows.length}:${file.headers.length}`;
  }).join('|');
}

export function buildLocalSearchResults(
  files: CSVFileData[],
  query: string,
  options: { isRegExp: boolean; isCaseSensitive: boolean },
  liveOverride?: SearchResultLiveOverride
): SearchResult[] {
  if (!query) return [];

  let regex: RegExp | null = null;
  let searchTerms: string[] = [];
  const flags = options.isCaseSensitive ? 'g' : 'gi';

  try {
    if (options.isRegExp) {
      regex = new RegExp(query, flags);
    } else {
      const trimmed = query.trim();
      if (trimmed.includes(' ')) {
        searchTerms = trimmed.split(/\s+/).filter((term) => term.length > 0);
      } else {
        const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(pattern, flags);
      }
    }
  } catch {
    return [];
  }

  const results: SearchResult[] = [];
  files.forEach((file) => {
    if (!file.rows || file.rows.length === 0) return;

    file.rows.forEach((row) => {
      row.cells.forEach((cell, colIndex) => {
        const effectiveCell = liveOverride &&
          liveOverride.fileId === file.id &&
          liveOverride.rowIndex === row.rowIndex &&
          liveOverride.colIndex === colIndex
          ? liveOverride.value
          : cell;

        if (!effectiveCell) return;

        let isMatch = false;
        if (regex) {
          regex.lastIndex = 0;
          isMatch = regex.test(effectiveCell);
        } else if (searchTerms.length > 0) {
          const target = options.isCaseSensitive ? effectiveCell : effectiveCell.toLowerCase();
          isMatch = searchTerms.every((term) => {
            const currentTerm = options.isCaseSensitive ? term : term.toLowerCase();
            return target.includes(currentTerm);
          });
        }

        if (!isMatch) return;

        results.push({
          fileId: file.id,
          rowIndex: row.rowIndex,
          colIndex,
          key: row.key || '',
          context: effectiveCell.length > CONTEXT_PREVIEW_LIMIT
            ? `${effectiveCell.substring(0, CONTEXT_PREVIEW_LIMIT)}...`
            : effectiveCell
        });
      });
    });
  });

  return results;
}

export function groupSearchResults(results: SearchResult[]): GroupedSearchResult[] {
  const groupsMap = new Map<string, GroupedSearchResult>();

  results.forEach((result, index) => {
    const existing = groupsMap.get(result.fileId);
    if (existing) {
      existing.items.push({ result, index });
      return;
    }

    groupsMap.set(result.fileId, {
      fileId: result.fileId,
      items: [{ result, index }]
    });
  });

  return Array.from(groupsMap.values());
}

export function buildVirtualSearchRows(
  groupedResults: GroupedSearchResult[],
  collapsedFiles: Set<string>
): VirtualSearchRow[] {
  const rows: VirtualSearchRow[] = [];

  groupedResults.forEach((group) => {
    rows.push({
      type: 'group',
      key: `g-${group.fileId}`,
      fileId: group.fileId,
      count: group.items.length
    });

    if (collapsedFiles.has(group.fileId)) return;

    group.items.forEach((item) => {
      rows.push({
        type: 'match',
        key: `m-${getSearchResultKey(item.result)}`,
        item
      });
    });
  });

  return rows;
}

export function captureSearchListViewport(
  virtualRows: VirtualSearchRow[],
  scrollOffset: number,
  rowHeight: number
): SearchListViewportSnapshot | null {
  if (rowHeight <= 0) return null;

  const normalizedScrollOffset = Math.max(0, scrollOffset);
  const topRowIndex = Math.floor(normalizedScrollOffset / rowHeight);

  return {
    anchorKey: virtualRows[topRowIndex]?.key,
    anchorOffset: normalizedScrollOffset % rowHeight,
    fallbackScrollOffset: normalizedScrollOffset
  };
}

export function resolveSearchListViewport(
  virtualRows: VirtualSearchRow[],
  snapshot: SearchListViewportSnapshot,
  rowHeight: number,
  viewportHeight: number
): SearchListViewportResolution {
  const maxScrollOffset = Math.max(0, virtualRows.length * rowHeight - Math.max(0, viewportHeight));

  if (snapshot.anchorKey) {
    const anchorIndex = virtualRows.findIndex((row) => row.key === snapshot.anchorKey);
    if (anchorIndex >= 0) {
      return {
        scrollOffset: Math.min(maxScrollOffset, anchorIndex * rowHeight + snapshot.anchorOffset),
        anchorFound: true
      };
    }
  }

  return {
    scrollOffset: Math.min(maxScrollOffset, snapshot.fallbackScrollOffset),
    anchorFound: false
  };
}
