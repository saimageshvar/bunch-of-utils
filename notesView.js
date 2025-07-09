const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

class NotesProvider {
  constructor(notesDir) {
    this.notesDir = notesDir;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!fs.existsSync(this.notesDir)) {
      return Promise.resolve([]);
    }

    if (!element) {
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
      return Promise.resolve(dates.map(date => new vscode.TreeItem(date, vscode.TreeItemCollapsibleState.Collapsed)));
    } else {
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
        const item = new vscode.TreeItem(file, vscode.TreeItemCollapsibleState.None);
        item.command = {
          command: 'extension.openNoteFile',
          title: 'Open Note File',
          arguments: [fullPath]
        };
        item.contextValue = 'noteItem';
        return item;
      });
      return Promise.resolve(children);
    }
  }
}

function registerNotesTreeView(context) {
  const config = vscode.workspace.getConfiguration('noteSaver');
  const notesDir = config.get('notesDirectory');
  if (!notesDir || !fs.existsSync(notesDir)) {
    vscode.window.showWarningMessage('Note directory does not exist.');
    return;
  }

  const notesProvider = new NotesProvider(notesDir);
  vscode.window.registerTreeDataProvider('notesView', notesProvider);

  context.subscriptions.push(vscode.commands.registerCommand('extension.refreshNotesView', () => {
    notesProvider.refresh();
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

module.exports = {
  registerNotesTreeView
};
