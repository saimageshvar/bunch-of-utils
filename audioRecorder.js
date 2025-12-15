const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

let currentPanel = undefined;
let recordingProcess = undefined;
let currentRecordingPath = undefined;

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Audio Recorder</title>
    <style>
        :root {
            --primary-color: var(--vscode-button-background);
            --primary-hover: var(--vscode-button-hoverBackground);
            --text-color: var(--vscode-editor-foreground);
            --bg-color: var(--vscode-editor-background);
            --danger-color: #f44336;
        }
        body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
        }
        .container {
            text-align: center;
            padding: 2rem;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.05);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            width: 300px;
        }
        h2 {
            margin-bottom: 1.5rem;
            font-weight: 300;
            letter-spacing: 1px;
        }
        .controls {
            display: flex;
            justify-content: center;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        button {
            padding: 12px 24px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            border-radius: 6px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 100px;
        }
        #startBtn {
            background-color: var(--primary-color);
            color: var(--vscode-button-foreground);
        }
        #startBtn:hover:not(:disabled) {
            background-color: var(--primary-hover);
            transform: translateY(-1px);
        }
        #stopBtn {
            background-color: var(--danger-color);
            color: white;
        }
        #stopBtn:hover:not(:disabled) {
            opacity: 0.9;
            transform: translateY(-1px);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        .status-container {
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 1rem;
        }
        #status {
            font-size: 0.9rem;
            opacity: 0.8;
        }
        .recording-indicator {
            width: 12px;
            height: 12px;
            background-color: var(--danger-color);
            border-radius: 50%;
            margin-right: 8px;
            display: none;
            animation: pulse 1.5s infinite;
        }
        .timer {
            font-family: monospace;
            font-size: 1.5rem;
            margin: 1rem 0;
            color: var(--text-color);
        }
        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
        }
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Audio Recorder</h2>

        <div class="timer" id="timer">00:00</div>

        <div class="controls">
            <button id="startBtn">
                <span>Start</span>
            </button>
            <button id="stopBtn" disabled>
                <span>Stop</span>
            </button>
        </div>

        <div class="status-container">
            <div class="recording-indicator" id="indicator"></div>
            <div id="status">Ready to record</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const status = document.getElementById('status');
        const indicator = document.getElementById('indicator');
        const timerDisplay = document.getElementById('timer');

        let timerInterval;
        let startTime;

        function updateTimer() {
            const now = Date.now();
            const diff = now - startTime;
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / 1000 / 60));
            timerDisplay.textContent =
                (minutes < 10 ? '0' : '') + minutes + ':' +
                (seconds < 10 ? '0' : '') + seconds;
        }

        startBtn.onclick = () => {
            vscode.postMessage({ command: 'startRecording' });
            startBtn.disabled = true;
            stopBtn.disabled = false;
            status.textContent = 'Recording...';
            indicator.style.display = 'block';

            startTime = Date.now();
            timerInterval = setInterval(updateTimer, 1000);
        };

        stopBtn.onclick = () => {
            vscode.postMessage({ command: 'stopRecording' });
            startBtn.disabled = false;
            stopBtn.disabled = true;
            status.textContent = 'Stopping...';
            indicator.style.display = 'none';
            clearInterval(timerInterval);
        };

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'error':
                    status.textContent = 'Error: ' + message.text;
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                    indicator.style.display = 'none';
                    clearInterval(timerInterval);
                    break;
                case 'saved':
                    status.textContent = 'Saved successfully';
                    setTimeout(() => {
                        status.textContent = 'Ready to record';
                        timerDisplay.textContent = '00:00';
                    }, 2000);
                    break;
            }
        });
    </script>
</body>
</html>`;
}

function recordAudio() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Please open a file to insert the audio link.');
        return;
    }

    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
            'audioRecorder',
            'Audio Recorder',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        currentPanel.webview.html = getWebviewContent();

        currentPanel.onDidDispose(
            () => {
                if (recordingProcess) {
                    stopRecording(editor);
                }
                currentPanel = undefined;
            },
            null,
            []
        );

        currentPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'startRecording':
                        startRecording(editor);
                        break;
                    case 'stopRecording':
                        stopRecording(editor);
                        break;
                }
            },
            undefined,
            []
        );
    }
}

function startRecording(editor) {
    if (recordingProcess) {
        return;
    }

    if (process.platform === 'win32') {
        const msg = 'Audio recording is not natively supported on Windows. Please install WSL or use Linux.';
        vscode.window.showErrorMessage(msg);
        if (currentPanel) {
            currentPanel.webview.postMessage({ command: 'error', text: msg });
        }
        return;
    }

    if (process.platform === 'darwin') {
        const msg = 'Audio recording on macOS requires "sox" to be installed (brew install sox).';
        // We'll let it try to spawn 'rec' or 'arecord' but warn user
        // Actually, arecord is Linux only. macOS uses 'rec' from sox.
        // For now, let's explicitly fail non-linux to be safe as requested.
        vscode.window.showErrorMessage(msg);
        if (currentPanel) {
            currentPanel.webview.postMessage({ command: 'error', text: msg });
        }
        return;
    }

    const config = vscode.workspace.getConfiguration('audioRecorder');
    const audioFolder = config.get('audioFolder') || 'audio';
    const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : path.dirname(editor.document.uri.fsPath);
    const fullAudioFolderPath = path.join(workspaceFolder, audioFolder);

    if (!fs.existsSync(fullAudioFolderPath)) {
        fs.mkdirSync(fullAudioFolderPath, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording-${timestamp}.wav`;
    currentRecordingPath = path.join(fullAudioFolderPath, filename);

    // Check for arecord
    try {
        // -f cd: 16 bit little endian, 44100Hz, stereo
        // -t wav: WAV format
        recordingProcess = cp.spawn('arecord', ['-f', 'cd', '-t', 'wav', currentRecordingPath]);

        recordingProcess.on('error', (err) => {
            vscode.window.showErrorMessage('Failed to start recording (arecord not found?): ' + err.message);
            if (currentPanel) {
                currentPanel.webview.postMessage({ command: 'error', text: err.message });
            }
            recordingProcess = undefined;
        });

    } catch (err) {
        vscode.window.showErrorMessage('Error starting recording: ' + err.message);
        if (currentPanel) {
            currentPanel.webview.postMessage({ command: 'error', text: err.message });
        }
    }
}

function stopRecording(editor) {
    if (recordingProcess) {
        recordingProcess.kill('SIGINT'); // SIGINT allows arecord to finish writing the header
        recordingProcess = undefined;

        // Give it a moment to flush and close file
        setTimeout(() => {
            if (currentRecordingPath && fs.existsSync(currentRecordingPath)) {
                const relativePath = path.relative(path.dirname(editor.document.uri.fsPath), currentRecordingPath);
                const encodedPath = relativePath.split(path.sep).map(encodeURIComponent).join('/');
                const linkText = `[Audio Recording](${encodedPath})`;

                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, linkText);
                });

                if (currentPanel) {
                    currentPanel.webview.postMessage({ command: 'saved', path: currentRecordingPath });
                }
                vscode.window.showInformationMessage(`Audio saved to ${currentRecordingPath}`);
            }
        }, 500);
    }
}

function playAudio(filePath) {
    const panel = vscode.window.createWebviewPanel(
        'audioPlayer',
        'Audio Player',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.dirname(filePath)), vscode.Uri.file(path.dirname(path.dirname(filePath)))]
        }
    );

    const fileUri = panel.webview.asWebviewUri(vscode.Uri.file(filePath));

    panel.webview.html = `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                font-family: sans-serif;
                margin: 0;
            }
            .player-container {
                background: rgba(255, 255, 255, 0.05);
                padding: 2rem;
                border-radius: 12px;
                text-align: center;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            h3 {
                margin-top: 0;
                margin-bottom: 1.5rem;
                font-weight: 300;
            }
            audio {
                outline: none;
                width: 300px;
            }
        </style>
    </head>
    <body>
        <div class="player-container">
            <h3>Now Playing</h3>
            <audio controls autoplay src="${fileUri}"></audio>
            <p style="opacity: 0.7; margin-top: 1rem; font-size: 0.9rem;">${path.basename(filePath)}</p>
        </div>
    </body>
    </html>`;
}

class AudioCodeLensProvider {
    provideCodeLenses(document, token) {
        const codeLenses = [];
        const text = document.getText();
        const regex = /\[.*?\]\((.*?\.(mp3|wav|ogg|webm))\)/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const line = document.lineAt(document.positionAt(match.index).line);
            const range = new vscode.Range(line.lineNumber, 0, line.lineNumber, 0);

            let audioPath = decodeURIComponent(match[1]);
            if (!path.isAbsolute(audioPath)) {
                audioPath = path.join(path.dirname(document.uri.fsPath), audioPath);
            }

            const cmd = {
                title: "$(play) Play Audio",
                command: "extension.playAudio",
                arguments: [audioPath]
            };

            codeLenses.push(new vscode.CodeLens(range, cmd));
        }
        return codeLenses;
    }
}

module.exports = {
    recordAudio,
    playAudio,
    AudioCodeLensProvider
};
