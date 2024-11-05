// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('Congratulations, your extension "bunch-of-utils" is now active!');
	context.subscriptions.push(joinTextWithOperatorCommand());
	context.subscriptions.push(joinTextWithCustomOperatorCommand());
	context.subscriptions.push(propToTemplateLiteralCommand());
}

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
}

// This method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
};
