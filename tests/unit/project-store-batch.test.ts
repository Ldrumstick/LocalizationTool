import { useProjectStore } from '../../src/stores/project-store';
import { produce } from 'immer';

describe('Project Store Batch Actions', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject();
    useProjectStore.setState({
      files: {
        'file-1': {
          id: 'file-1',
          fileName: 'test.csv',
          filePath: '/test.csv',
          encoding: 'utf-8',
          headers: ['A', 'B', 'C'],
          rows: [
            { rowIndex: 0, cells: ['r0c0', 'r0c1', 'r0c2'], key: 'r0c0' },
            { rowIndex: 1, cells: ['r1c0', 'r1c1', 'r1c2'], key: 'r1c0' },
            { rowIndex: 2, cells: ['r2c0', 'r2c1', 'r2c2'], key: 'r2c0' },
          ],
          isDirty: false,
          isIgnored: false,
          lastModified: 0,
        },
      },
    });
  });

  test('insertRows should insert rows at specified index', () => {
    const { insertRows } = useProjectStore.getState();
    insertRows('file-1', 1, 2);

    const file = useProjectStore.getState().files['file-1'];
    expect(file.rows).toHaveLength(5);
    // Index 0 is original
    expect(file.rows[0].cells[0]).toBe('r0c0');
    // Index 1, 2 are new
    expect(file.rows[1].cells[0]).toBe('');
    expect(file.rows[2].cells[0]).toBe('');
    // Index 3 is old index 1
    expect(file.rows[3].cells[0]).toBe('r1c0');
    // Check rowIndex updated
    expect(file.rows[3].rowIndex).toBe(3);
    
    expect(file.isDirty).toBe(true);
  });

  test('deleteRows should delete rows at specified indices', () => {
    const { deleteRows } = useProjectStore.getState();
    // Delete index 0 and 2
    deleteRows('file-1', [0, 2]);

    const file = useProjectStore.getState().files['file-1'];
    expect(file.rows).toHaveLength(1);
    // Only old index 1 remains
    expect(file.rows[0].cells[0]).toBe('r1c0');
    expect(file.rows[0].rowIndex).toBe(0);
    
    expect(file.isDirty).toBe(true);
  });

  test('insertColumns should insert columns at specified index', () => {
    const { insertColumns } = useProjectStore.getState();
    insertColumns('file-1', 1, 1);

    const file = useProjectStore.getState().files['file-1'];
    expect(file.headers).toHaveLength(4);
    expect(file.headers[1]).toBe('');
    
    expect(file.rows[0].cells).toHaveLength(4);
    expect(file.rows[0].cells[0]).toBe('r0c0');
    expect(file.rows[0].cells[1]).toBe('');
    expect(file.rows[0].cells[2]).toBe('r0c1');
    
    expect(file.isDirty).toBe(true);
  });

  test('deleteColumns should delete columns at specified indices', () => {
    const { deleteColumns } = useProjectStore.getState();
    // Delete Middle Column (Index 1: B)
    deleteColumns('file-1', [1]);

    const file = useProjectStore.getState().files['file-1'];
    expect(file.headers).toHaveLength(2);
    expect(file.headers).toEqual(['A', 'C']);
    
    expect(file.rows[0].cells).toHaveLength(2);
    expect(file.rows[0].cells).toEqual(['r0c0', 'r0c2']);
    
    expect(file.isDirty).toBe(true);
  });

  test('duplicateRows should duplicate specified rows', () => {
    const { duplicateRows } = useProjectStore.getState();
    // Duplicate index 1
    duplicateRows('file-1', [1]);

    const file = useProjectStore.getState().files['file-1'];
    expect(file.rows).toHaveLength(4);
    // 0: r0
    // 1: r1 (original)
    // 2: r1 (copy)
    // 3: r2
    expect(file.rows[1].cells[0]).toBe('r1c0');
    expect(file.rows[2].cells[0]).toBe('r1c0'); 
    
    // Check key
    expect(file.rows[2].key).toBe('r1c0_copy');
    
    expect(file.rows[3].cells[0]).toBe('r2c0');
    expect(file.isDirty).toBe(true);
  });
});
