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
      // Return date groups
      const files = fs.readdirSync(this.notesDir).filter(f => fs.statSync(path.join(this.notesDir, f)).isFile());
      const grouped = {};

      files.forEach(file => {
        const fullPath = path.join(this.notesDir, file);
        const stat = fs.statSync(fullPath);
        // Use creation date (birthtime) instead of modification date
        const date = stat.birthtime.toISOString().split('T')[0];
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(file);
      });

      const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
      return Promise.resolve(dates.map(date => ({
        type: 'date',
        label: date,
        id: `date-${date}`
      })));
    } else {
      // Return files for a specific date
      const date = element.label;
      const files = fs.readdirSync(this.notesDir).filter(f => fs.statSync(path.join(this.notesDir, f)).isFile());
      const grouped = {};
      files.forEach(file => {
        const fullPath = path.join(this.notesDir, file);
        const stat = fs.statSync(fullPath);
        // Use creation date (birthtime) instead of modification date
        const fileDate = stat.birthtime.toISOString().split('T')[0];
        if (!grouped[fileDate]) grouped[fileDate] = [];
        grouped[fileDate].push(file);
      });
      const children = (grouped[date] || []).sort().map(file => {
        const fullPath = path.join(this.notesDir, file);
        return {
          type: 'file',
          label: file,
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
    vscode.workspace.openTextDocument(filePath).then(doc => vscode.window.showTextDocument(doc));
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

    // Read all files from notes directory
    const files = fs.readdirSync(notesDir)
      .filter(f => {
        try {
          return fs.statSync(path.join(notesDir, f)).isFile();
        } catch (err) {
          console.error(`Error reading file ${f}:`, err);
          return false;
        }
      })
      .map(file => {
        const fullPath = path.join(notesDir, file);
        const stat = fs.statSync(fullPath);
        const createdDate = stat.birthtime.toISOString().split('T')[0];
        const createdTime = stat.birthtime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        return {
          label: file,
          description: `Created: ${createdDate} ${createdTime}`,
          fullPath: fullPath
        };
      })
      .sort((a, b) => b.description.localeCompare(a.description)); // Sort by date, newest first

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
