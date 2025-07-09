// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { registerNotesTreeView } = require('./notesView');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('Congratulations, your extension "bunch-of-utils" is now active!');
	context.subscriptions.push(copyTestLineNumbers());
	context.subscriptions.push(runSelectedTests());
	context.subscriptions.push(joinTextWithOperatorCommand());
	context.subscriptions.push(joinTextWithCustomOperatorCommand());
	context.subscriptions.push(propToTemplateLiteralCommand());
	context.subscriptions.push(saveUntitledNote());
	registerNotesTreeView(context);
}

const copyTestLineNumbers = () => {
	return vscode.commands.registerCommand('extension.copyTestLineNumbers', function () {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return; // Exit if no active editor
		}
		const document = editor.document;
		const uniqueLineNumbers = getTestLineNumbers(editor);
		const sortedLineNumbers = Array.from(uniqueLineNumbers).sort((a, b) => a - b);

		if (uniqueLineNumbers.size > 0) {
			const formattedLineNumbers = `${vscode.workspace.asRelativePath(document.fileName)}:${sortedLineNumbers.join(':')}`;
			vscode.env.clipboard.writeText(formattedLineNumbers);
			vscode.window.showInformationMessage(`Copied: ${formattedLineNumbers}`);
		} else {
			vscode.window.showInformationMessage('No matching lines found above the current cursor position.');
		}
	});
};

const runSelectedTests = () => {
	return vscode.commands.registerCommand('extension.runSelectedTests', function () {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return; // Exit if no active editor
		}
		const document = editor.document;
		const uniqueLineNumbers = getTestLineNumbers(editor);
		const sortedLineNumbers = Array.from(uniqueLineNumbers).sort((a, b) => a - b);

		if (uniqueLineNumbers.size > 0) {
			const formattedLineNumbers = `${vscode.workspace.asRelativePath(document.fileName)}:${sortedLineNumbers.join(':')}`;
			const testFileCommand = vscode.workspace.getConfiguration('copyTestLineNumbers').get('testFileCommand', 'rails test');
			const featureFileCommand = vscode.workspace.getConfiguration('copyTestLineNumbers').get('featureFileCommand',
				'cucumber');
			const commandToRun = document.fileName.endsWith('.feature')
				? `${featureFileCommand} ${formattedLineNumbers}`
				: `${testFileCommand} ${formattedLineNumbers}`;
			vscode.commands.executeCommand('workbench.action.terminal.toggleTerminal')
				.then(() => {
					const terminal = vscode.window.activeTerminal;
					if (terminal) {
						terminal.sendText(`${commandToRun}`);
					}
				});
		} else {
			vscode.window.showInformationMessage('No matching lines found above the current cursor position.');
		}
	});
};

const joinTextWithOperatorCommand = () => {
	return vscode.commands.registerCommand('extension.joinTextWithOperator', function () {
		joinSelectedText();
	});
};

const joinTextWithCustomOperatorCommand = () => {
	return vscode.commands.registerCommand('extension.joinTextWithCustomOperator', function () {
		vscode.window.showInputBox({
			prompt: "Enter the operator to join the selected text",
			placeHolder: "::"
		}).then(operator => {
			// If the user didn't enter an operator, use "::" as default
			if (operator === undefined) {
				vscode.window.showErrorMessage("No operator entered, operation cancelled.");
				return;
			}
			if (operator === "") {
				operator = "::";
			}
			joinSelectedText(operator);
		});
	});
};

const propToTemplateLiteralCommand = () => {
	return vscode.commands.registerCommand('extension.propToTemplateLiteral', function () {
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			const document = editor.document;
			const selections = editor.selections;  // Handle multiple selections
			const anyPropRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:(['"])(.*?)\2|\{\s*(['"])(.*?)\4\s*\})/g;  // Match propName='value' or propName="value" or propName={"value"}

			// Perform all edits within one `edit` action
			editor.edit(editBuilder => {
				selections.forEach(selection => {
					const selectedText = document.getText(selection);
					const newText = selectedText.replace(anyPropRegex, (match, propName, quoteType1, propValue1, quoteType2, propValue2) => {
						// Choose the prop value based on the matched pattern
						const propValue = propValue1 || propValue2;  // Will get `propValue1` if matched with quotes, `propValue2` if matched with curly braces
						return `${propName}={\`${propValue}\`}`;
					});

					// Replacing the entire selected block with the transformed text
					editBuilder.replace(selection, newText);
				});
			});
		}
	});
};

const getTestLineNumbers = (editor) => {
	const document = editor.document;
	const lines = document.getText().split('\n');
	const testMethodLines = [];
	const selections = editor.selections;

	for (const selection of selections) {
		const cursorPosition = selection.active.line;
		let foundMatch = false;

		if (document.languageId === 'ruby') {
			for (let i = cursorPosition; i >= 0; i--) {
				if (lines[i].trim().startsWith('def test_')) {
					testMethodLines.push(i + 1); // Add 1 to get the line number
					foundMatch = true;
					break;
				}
			}
		} else if (document.fileName.endsWith('.feature')) {
			for (let i = cursorPosition; i >= 0; i--) {
				if (lines[i].trim().startsWith('Scenario:')) {
					testMethodLines.push(i + 1); // Add 1 to get the line number
					foundMatch = true;
					break;
				}
			}
		}

		if (!foundMatch) {
			testMethodLines.push(-1); // Indicate no match found
		}
	}
	return new Set(testMethodLines.filter(line => line !== -1));
};

const joinSelectedText = (operator) => {
	const editor = vscode.window.activeTextEditor;

	if (editor) {
		const selections = editor.selections;
		let selectedTexts = [];

		if (!operator) {
			// Fetch the custom operator from settings, fallback to "::" if not set
			const config = vscode.workspace.getConfiguration('joinTextWithOperator');
			operator = config.get('operator') || '::';
		}

		// Gather all selected text
		selections.forEach(selection => {
			const text = editor.document.getText(selection);
			if (text) {
				selectedTexts.push(text);
			}
		});

		// Join the selected texts with the custom operator
		const joinedText = selectedTexts.join(operator);

		// Copy the joined text to the clipboard
		vscode.env.clipboard.writeText(joinedText).then(() => {
			vscode.window.showInformationMessage(`Joined text copied to clipboard with operator "${operator}"!`);
		});
	}
};

const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}-${hour}-${minute}`;
}

const saveUntitledNote = () => {
  return vscode.commands.registerCommand('extension.saveUntitledNote', async function () {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }

    const document = editor.document;
    if (document.isUntitled && document.isDirty) {
      const config = vscode.workspace.getConfiguration('noteSaver');
      const notesDir = config.get('notesDirectory');
      const includeDatetime = config.get('appendDatetime', true);
      const includeExtension = config.get('appendExtension', true);

      if (!notesDir || !fs.existsSync(notesDir)) {
        vscode.window.showErrorMessage('Invalid or missing notesDirectory in settings.');
        return;
      }

      const inputName = await vscode.window.showInputBox({
        prompt: 'Enter a name for the note file',
        placeHolder: 'e.g., meeting_notes'
      });

      if (!inputName) {
        vscode.window.showInformationMessage('Note saving canceled.');
        return;
      }

      let fileName = inputName;

      if (includeDatetime) {
        const datetime = formatDate(new Date());
        fileName += `_${datetime}`;
      }

      if (includeExtension) {
        const lang = document.languageId;
        const extMap = {
          plaintext: 'txt',
          javascript: 'js',
          python: 'py',
          markdown: 'md',
          json: 'json',
					ruby: 'rb',
					html: 'html',
					shellscript: 'sh'
        };
        const ext = extMap[lang] || 'txt';
        fileName += `.${ext}`;
      }

      const fullPath = path.join(notesDir, fileName);

      fs.writeFileSync(fullPath, document.getText(), 'utf8');
      vscode.workspace.openTextDocument(fullPath).then(doc => {
        vscode.window.showTextDocument(doc);
      });

      vscode.window.showInformationMessage(`Note saved to ${fullPath}`);
      vscode.commands.executeCommand('extension.refreshNotesView');
    } else {
      vscode.window.showWarningMessage('Current file is not a new unsaved file with content.');
    }
  });
};

// This method is called when your extension is deactivated
function deactivate() {
	console.log('Extension "bunch-of-utils" is now deactivated.');
}

module.exports = {
	activate,
	deactivate
};
