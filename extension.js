// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Work tracking state
let workTrackingInterval = null;
let workLogFilePath = null;

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
	context.subscriptions.push(startWorkTrackingCommand());
	context.subscriptions.push(stopWorkTrackingCommand());
	context.subscriptions.push(openWorkLogCommand());
	context.subscriptions.push(workTrackingStatusCommand());

	// Initialize work log file path
	initializeWorkLogPath();

	// Auto-start work tracking if enabled
	const config = vscode.workspace.getConfiguration('workTracker');
	const autoStart = config.get('autoStart', false);
	if (autoStart) {
		// Delay auto-start slightly to ensure everything is initialized
		setTimeout(() => {
			startWorkTrackingInternal();
		}, 1000);
	}
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

// Work Tracking Functions
const initializeWorkLogPath = () => {
	const config = vscode.workspace.getConfiguration('workTracker');
	const customPath = config.get('logFilePath');
	const logFormat = config.get('logFormat', 'text');

	// Determine file extension based on format
	let fileExtension;
	switch (logFormat) {
		case 'json':
			fileExtension = '.jsonl'; // JSON Lines format
			break;
		case 'csv':
			fileExtension = '.csv';
			break;
		default:
			fileExtension = '.txt';
			break;
	}

	if (customPath && customPath.trim() !== '') {
		workLogFilePath = customPath;
	} else {
		// Default to .vscode folder in workspace
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceFolder) {
			const vscodeFolderPath = path.join(workspaceFolder, '.vscode');
			// Ensure .vscode directory exists
			if (!fs.existsSync(vscodeFolderPath)) {
				fs.mkdirSync(vscodeFolderPath, { recursive: true });
			}
			workLogFilePath = path.join(vscodeFolderPath, `work-log${fileExtension}`);
		}
	}
};

const startWorkTrackingCommand = () => {
	return vscode.commands.registerCommand('extension.startWorkTracking', function () {
		startWorkTrackingInternal();
	});
};

const startWorkTrackingInternal = () => {
	if (workTrackingInterval) {
		vscode.window.showWarningMessage('Work tracking is already running.');
		return;
	}

	// Re-initialize the log file path in case settings changed
	initializeWorkLogPath();

	const config = vscode.workspace.getConfiguration('workTracker');
	const intervalSeconds = config.get('trackingInterval', 300); // Default 5 minutes

	// Start tracking immediately
	logCurrentWorkActivity();

	// Set up periodic tracking
	workTrackingInterval = setInterval(() => {
		logCurrentWorkActivity();
	}, intervalSeconds * 1000);

	vscode.window.showInformationMessage(`Work tracking started! Logging every ${intervalSeconds} seconds.`);
};

const stopWorkTrackingCommand = () => {
	return vscode.commands.registerCommand('extension.stopWorkTracking', function () {
		if (!workTrackingInterval) {
			vscode.window.showWarningMessage('Work tracking is not currently running.');
			return;
		}

		clearInterval(workTrackingInterval);
		workTrackingInterval = null;

		// Log final entry based on format
		const config = vscode.workspace.getConfiguration('workTracker');
		const logFormat = config.get('logFormat', 'text');

		let stopMessage;
		switch (logFormat) {
			case 'json':
				stopMessage = JSON.stringify({
					timestamp: new Date().toISOString(),
					event: 'work_tracking_stopped',
					message: 'Work tracking stopped'
				}) + '\n';
				break;
			case 'csv':
				// For CSV, we'll just add a comment if it's text format
				stopMessage = '';
				break;
			default:
				stopMessage = '\n--- Work tracking stopped ---\n';
				break;
		}

		if (stopMessage) {
			appendToWorkLog(stopMessage);
		}

		vscode.window.showInformationMessage('Work tracking stopped.');
	});
};

const openWorkLogCommand = () => {
	return vscode.commands.registerCommand('extension.openWorkLog', function () {
		if (!workLogFilePath || !fs.existsSync(workLogFilePath)) {
			vscode.window.showWarningMessage('Work log file not found. Start work tracking first.');
			return;
		}

		vscode.workspace.openTextDocument(workLogFilePath).then(doc => {
			vscode.window.showTextDocument(doc);
		});
	});
};

const logCurrentWorkActivity = async () => {
	const config = vscode.workspace.getConfiguration('workTracker');
	const trackBranch = config.get('trackBranch', true);
	const trackActiveFile = config.get('trackActiveFile', true);
	const logFormat = config.get('logFormat', 'text');

	const timestamp = new Date();
	const isoTimestamp = timestamp.toISOString();
	const localTimestamp = timestamp.toLocaleString();

	// Collect activity data
	const activityData = {
		timestamp: isoTimestamp,
		localTimestamp: localTimestamp,
		branch: null,
		branchError: null,
		activeFile: null,
		fileName: null,
		line: null,
		column: null,
		workspace: null
	};

	// Track current git branch
	if (trackBranch) {
		try {
			const branch = await getCurrentGitBranch();
			activityData.branch = branch || 'Unknown';
		} catch (error) {
			activityData.branchError = error.message;
		}
	}

	// Track active file
	if (trackActiveFile) {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			activityData.fileName = vscode.workspace.asRelativePath(editor.document.fileName);
			const cursorPosition = editor.selection.active;
			activityData.line = cursorPosition.line + 1;
			activityData.column = cursorPosition.character + 1;
			activityData.activeFile = `${activityData.fileName} (Line: ${activityData.line}, Col: ${activityData.column})`;
		} else {
			activityData.activeFile = 'None';
		}
	}

	// Track workspace folder
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		activityData.workspace = workspaceFolder.name;
	}

	// Format the log entry based on the selected format
	let logEntry;
	switch (logFormat) {
		case 'json':
			logEntry = JSON.stringify(activityData) + '\n';
			break;
		case 'csv':
			logEntry = formatAsCSV(activityData);
			break;
		default: // 'text'
			logEntry = formatAsText(activityData);
			break;
	}

	appendToWorkLog(logEntry);
};

const getCurrentGitBranch = () => {
	return new Promise((resolve, reject) => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceFolder) {
			reject(new Error('No workspace folder'));
			return;
		}

		exec('git branch --show-current', { cwd: workspaceFolder }, (error, stdout) => {
			if (error) {
				reject(new Error('Not a git repository or git not available'));
				return;
			}

			const branch = stdout.trim();
			resolve(branch || 'Unknown');
		});
	});
};

const appendToWorkLog = (content) => {
	if (!workLogFilePath) {
		console.error('Work log file path not initialized');
		return;
	}

	try {
		fs.appendFileSync(workLogFilePath, content);
	} catch (error) {
		console.error('Error writing to work log:', error);
		vscode.window.showErrorMessage(`Error writing to work log: ${error.message}`);
	}
};

const formatAsText = (data) => {
	let logEntry = `\n[${data.localTimestamp}]\n`;

	if (data.branch) {
		logEntry += `  Branch: ${data.branch}\n`;
	} else if (data.branchError) {
		logEntry += `  Branch: Unable to detect (${data.branchError})\n`;
	}

	if (data.activeFile) {
		logEntry += `  Active File: ${data.activeFile}\n`;
	}

	if (data.workspace) {
		logEntry += `  Workspace: ${data.workspace}\n`;
	}

	return logEntry;
};

const formatAsCSV = (data) => {
	// Check if this is the first entry (for CSV header)
	const isFirstEntry = !fs.existsSync(workLogFilePath) || fs.statSync(workLogFilePath).size === 0;

	let csvEntry = '';
	if (isFirstEntry) {
		csvEntry = 'timestamp,branch,fileName,line,column,workspace\n';
	}

	// Escape CSV values and handle nulls
	const escapeCSV = (value) => {
		if (value === null || value === undefined) return '';
		const str = String(value);
		if (str.includes(',') || str.includes('"') || str.includes('\n')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	};

	csvEntry += `${escapeCSV(data.timestamp)},${escapeCSV(data.branch || '')},${escapeCSV(data.fileName || '')},${escapeCSV(data.line || '')},${escapeCSV(data.column || '')},${escapeCSV(data.workspace || '')}\n`;

	return csvEntry;
};

const workTrackingStatusCommand = () => {
	return vscode.commands.registerCommand('extension.workTrackingStatus', function () {
		const isRunning = workTrackingInterval !== null;
		const config = vscode.workspace.getConfiguration('workTracker');
		const intervalSeconds = config.get('trackingInterval', 300);
		const logFormat = config.get('logFormat', 'text');
		const autoStart = config.get('autoStart', false);

		const statusMessage = `Work Tracking Status:
			• Status: ${isRunning ? 'RUNNING' : 'STOPPED'}
			• Auto-start: ${autoStart ? 'ENABLED' : 'DISABLED'}
			• Interval: ${intervalSeconds} seconds
			• Log format: ${logFormat}
			• Log file: ${workLogFilePath || 'Not initialized'}`;

		vscode.window.showInformationMessage(statusMessage);
	});
};

// This method is called when your extension is deactivated
function deactivate() {
	// Clean up work tracking interval if it's running
	if (workTrackingInterval) {
		clearInterval(workTrackingInterval);
		workTrackingInterval = null;

		// Log final entry
		if (workLogFilePath) {
			const config = vscode.workspace.getConfiguration('workTracker');
			const logFormat = config.get('logFormat', 'text');

			let stopMessage;
			switch (logFormat) {
				case 'json':
					stopMessage = JSON.stringify({
						timestamp: new Date().toISOString(),
						event: 'extension_deactivated',
						message: 'Extension deactivated, work tracking stopped'
					}) + '\n';
					break;
				case 'csv':
					stopMessage = '';
					break;
				default:
					stopMessage = '\n--- Extension deactivated, work tracking stopped ---\n';
					break;
			}

			if (stopMessage) {
				appendToWorkLog(stopMessage);
			}
		}
	}
}

module.exports = {
	activate,
	deactivate
};
