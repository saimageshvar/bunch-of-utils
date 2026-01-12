const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

class NotesProvider {
  constructor(notesDir) {
    this.notesDir = notesDir;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.isExpanded = true; // Default to expanded
  }

  // Recursively collect all files under the notes directory
  _getAllFiles() {
    const results = [];
    const walk = dir => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir);
      } catch (err) {
        console.error(`Failed to read directory ${dir}:`, err);
        return;
      }
      entries.forEach(entry => {
        const full = path.join(dir, entry);
        let stat;
        try {
          stat = fs.statSync(full);
        } catch (err) {
          console.error(`Failed to stat ${full}:`, err);
          return;
        }
        if (stat.isFile()) {
          results.push({ fullPath: full, stat });
        } else if (stat.isDirectory()) {
          // Skip hidden directories (start with a dot)
          if (path.basename(full).startsWith('.')) return;
          walk(full);
        }
      });
    };
    walk(this.notesDir);
    return results;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  toggleCollapse() {
    this.isExpanded = !this.isExpanded;
    // Fire with undefined to force complete tree rebuild
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    // element is now a plain object, convert it to TreeItem
    if (element.type === 'date') {
      const collapsibleState = this.isExpanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
      const item = new vscode.TreeItem(element.label, collapsibleState);
      // Include the state in the ID to force refresh when state changes
      item.id = `${element.id}-${this.isExpanded ? 'expanded' : 'collapsed'}`;
      return item;
    } else {
      // File item
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      item.command = element.command;
      item.contextValue = element.contextValue;
      return item;
    }
  }

  getChildren(element) {
    if (!fs.existsSync(this.notesDir)) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Return date groups using all files recursively
      const filesWithStats = this._getAllFiles();
      const grouped = {};

      filesWithStats.forEach(({ fullPath, stat }) => {
        const date = stat.birthtime.toISOString().split('T')[0];
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push({ fullPath, stat });
      });

      // Sort dates newest first
      const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
      return Promise.resolve(dates.map(date => ({
        type: 'date',
        label: date,
        id: `date-${date}`
      })));
    } else {
      // Return files for a specific date (include nested files and relative path in label)
      const date = element.label;
      const filesWithStats = this._getAllFiles();
      const children = filesWithStats
        .filter(({ stat }) => stat.birthtime.toISOString().split('T')[0] === date)
        // Sort by birthtime newest first
        .sort((a, b) => b.stat.birthtime - a.stat.birthtime)
        .map(({ fullPath }) => {
          const rel = path.relative(this.notesDir, fullPath);
          return {
            type: 'file',
            label: rel,
            id: `note-${fullPath}`,
            command: {
              command: 'extension.openNoteFile',
              title: 'Open Note File',
              arguments: [fullPath]
            },
            contextValue: 'noteItem'
          };
        });
      return Promise.resolve(children);
    }
  }
}

function registerNotesTreeView(context) {
  const config = vscode.workspace.getConfiguration('noteSaver');
  const notesDir = config.get('notesDirectory');

  // Always register the quick pick command, even if notes directory doesn't exist
  context.subscriptions.push(vscode.commands.registerCommand('extension.quickPickNote', () => {
    showNotesQuickPick();
  }));

  if (!notesDir || !fs.existsSync(notesDir)) {
    vscode.window.showWarningMessage('Note directory does not exist.');
    return;
  }

  const notesProvider = new NotesProvider(notesDir);
  vscode.window.registerTreeDataProvider('notesView', notesProvider);

  context.subscriptions.push(vscode.commands.registerCommand('extension.refreshNotesView', () => {
    notesProvider.refresh();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('extension.toggleNotesCollapse', () => {
    notesProvider.toggleCollapse();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('extension.openNoteFile', filePath => {
    // Accept either a string path or a vscode.Uri or command-argument style
    let fp = filePath;
    if (filePath && filePath.command && Array.isArray(filePath.command.arguments)) {
      fp = filePath.command.arguments[0];
    }
    if (filePath instanceof vscode.Uri) {
      fp = filePath.fsPath;
    }

    vscode.workspace.openTextDocument(fp).then(doc => vscode.window.showTextDocument(doc)).catch(err => {
      vscode.window.showErrorMessage(`Failed to open file: ${err.message}`);
      console.error(`Failed to open file ${fp}:`, err);
    });
  }));

  context.subscriptions.push(vscode.commands.registerCommand('extension.deleteNoteFile', filePath => {
    let pathToDelete = filePath.command.arguments[0];
    if (filePath instanceof vscode.Uri) {
      pathToDelete = filePath.fsPath;
    }

    fs.unlinkSync(pathToDelete);
    notesProvider.refresh();
    vscode.window.showInformationMessage(`Deleted: ${pathToDelete}`);
  }));
}

function showNotesQuickPick() {
  try {
    const config = vscode.workspace.getConfiguration('noteSaver');
    const notesDir = config.get('notesDirectory');

    if (!notesDir) {
      vscode.window.showErrorMessage('Notes directory is not configured. Please set "noteSaver.notesDirectory" in settings.');
      return;
    }

    if (!fs.existsSync(notesDir)) {
      vscode.window.showErrorMessage(`Notes directory does not exist: ${notesDir}`);
      return;
    }

    // Read all files from notes directory recursively
    const collect = dir => {
      const acc = [];
      const walk = d => {
        let entries = [];
        try {
          entries = fs.readdirSync(d);
        } catch (err) {
          console.error(`Failed to read dir ${d}:`, err);
          return;
        }
        entries.forEach(entry => {
          const full = path.join(d, entry);
          let stat;
          try {
            stat = fs.statSync(full);
          } catch (err) {
            console.error(`Failed to stat ${full}:`, err);
            return;
          }
          if (stat.isFile()) {
            acc.push({ fullPath: full, stat });
          } else if (stat.isDirectory()) {
            walk(full);
          }
        });
      };
      walk(dir);
      return acc;
    };

    const files = collect(notesDir)
      .map(({ fullPath, stat }) => {
        const createdDate = stat.birthtime.toISOString().split('T')[0];
        const createdTime = stat.birthtime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const rel = path.relative(notesDir, fullPath);
        return {
          label: rel,
          description: `Created: ${createdDate} ${createdTime}`,
          fullPath: fullPath,
          birthtimeMs: stat.birthtimeMs || stat.birthtime.getTime()
        };
      })
      // Sort by birthtime newest first
      .sort((a, b) => b.birthtimeMs - a.birthtimeMs);

    if (files.length === 0) {
      vscode.window.showInformationMessage('No notes found in the notes directory.');
      return;
    }

    // Create quick pick
    const quickPick = vscode.window.createQuickPick();
    quickPick.placeholder = 'Search and select a note to open';
    quickPick.items = files;
    quickPick.matchOnDescription = true;

    // Handle selection
    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected && selected.fullPath) {
        vscode.workspace.openTextDocument(selected.fullPath).then(doc => {
          vscode.window.showTextDocument(doc);
        }).catch(err => {
          vscode.window.showErrorMessage(`Failed to open file: ${err.message}`);
          console.error(`Failed to open file ${selected.fullPath}:`, err);
        });
      }
      quickPick.hide();
    });

    // Handle dismissal
    quickPick.onDidHide(() => {
      quickPick.dispose();
    });

    quickPick.show();
  } catch (error) {
    vscode.window.showErrorMessage(`Error opening quick pick: ${error.message}`);
    console.error('Error in showNotesQuickPick:', error);
  }
}

module.exports = {
  registerNotesTreeView
};
