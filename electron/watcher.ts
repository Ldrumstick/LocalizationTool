import type * as Chokidar from 'chokidar';
const chokidar = eval('require')('chokidar') as typeof Chokidar;
import path from 'path';
import fs from 'fs/promises';
import { BrowserWindow } from 'electron';
import { readFileAndDecode } from './file-utils';

let watcher: Chokidar.FSWatcher | null = null;
let lastSaveMap: Map<string, number> = new Map();

//Debounce timer map
const debounceMap: Map<string, NodeJS.Timeout> = new Map();

export function updateLastSaveTime(filePath: string) {
    lastSaveMap.set(filePath, Date.now());
}

export function stopWatcher() {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    // Clear debounce timers
    debounceMap.forEach(timer => clearTimeout(timer));
    debounceMap.clear();
}

export function setupWatcher(mainWindow: BrowserWindow, projectPath: string) {
    stopWatcher(); // Stop existing if any

    watcher = chokidar.watch(projectPath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        depth: 0 // Only watch root directory 
    });

    watcher.on('change', (filePath: string) => {
        if (!filePath.toLowerCase().endsWith('.csv')) return;

        // Check if self-triggered
        const now = Date.now();
        const lastSave = lastSaveMap.get(filePath) || 0;
        if (now - lastSave < 1000) {
            // Ignore if saved within last 1 second by us
            return;
        }

        // Debounce
        if (debounceMap.has(filePath)) {
            clearTimeout(debounceMap.get(filePath)!);
        }

        const timer = setTimeout(async () => {
            debounceMap.delete(filePath);
            
            try {
                // Read new content
                const stats = await fs.stat(filePath);
                const fileData = await readFileAndDecode(filePath);
                
                // Construct ID (same as scanCSVFiles)
                const id = Buffer.from(filePath).toString('base64');

                mainWindow.webContents.send('file:external-change', {
                    fileId: id,
                    fileName: path.basename(filePath),
                    filePath: filePath,
                    lastModified: stats.mtimeMs,
                    data: fileData // Verify if we want to send full data or just notify?
                                 // Plan says: "Read latest content".
                });
            } catch (err) {
                console.error(`Error handling external change for ${filePath}:`, err);
            }
        }, 500); // 500ms debounce

        debounceMap.set(filePath, timer);
    });
}
