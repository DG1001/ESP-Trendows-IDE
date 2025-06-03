class MicroPythonIDE {
    constructor(editor) {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.currentFile = 'main.py';
        this.editor = editor;
        this.files = {'main.py': this.editor.getValue()};
        this.model = localStorage.getItem('model') || 'deepseek-chat';
        this.deepSeekApiKey = localStorage.getItem('deepSeekApiKey') || '';
        this.openaiApiKey = localStorage.getItem('openaiApiKey') || '';
        this.ollamaUrl = localStorage.getItem('ollamaUrl') || 'http://localhost:11434';
        this.ollamaModel = localStorage.getItem('ollamaModel') || '';
        // Properties moved to LLMService: this.diffEditor, this.diffEditorContainerDiv
        // DOM elements like originalEditorDiv, editorContainerDiv are accessed/managed by UIManager
        this.totalSessionCostUnits = 0; // Für die Kostensummierung
        this.contextMenuTargetFile = null;
        this.deviceFiles = []; // Zum Speichern der aktuellen Dateiliste vom Gerät
        this.hardwareContext = ''; // Für den Inhalt von hardware.txt
        this.isLoadingHardwareContext = false; // Flag für das Laden von hardware.txt
        
        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.uiManager = new UIManager(this); // Must be initialized before setTheme call
        this.llmService = new LLMService(this);
        
        this.uiManager.setTheme(this.currentTheme); // Initialize theme via UIManager
        
        this.initializeEventListeners();
        this.checkWebSerialSupport();
        this.uiManager.updateSendToModelButtonText(); // Update button text via UIManager
        // API key and model inputs in the modal are typically set when the modal is opened or saved,
        // but if direct setting on load is needed, UIManager could handle it or IDE can do it if elements are standard.
        // For now, assuming modal handles its own input population or it's done on save.
        // If these lines are critical for initial modal display, they might need adjustment:
        // document.getElementById('deepSeekApiKeyInput').value = this.deepSeekApiKey; (etc.)
    }

    checkWebSerialSupport() {
        if (!('serial' in navigator)) {
            this.uiManager.addToTerminal('❌ Web Serial API not supported. Please use Chrome or Edge.\n');
        }
    }

    initializeEventListeners() {
        document.getElementById('connectBtn').addEventListener('click', () => this.toggleConnection());
        document.getElementById('runBtn').addEventListener('click', () => this.runCode());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopExecution());
        document.getElementById('uploadBtn').addEventListener('click', () => this.uiManager.showFilenameModal());
        document.getElementById('listFilesBtn').addEventListener('click', () => this.listFiles());
        document.getElementById('softResetBtn').addEventListener('click', () => this.softReset());
        document.getElementById('clearTerminalBtn').addEventListener('click', () => this.uiManager.clearTerminal());
        document.getElementById('terminalInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendCommand();
        });
        document.getElementById('saveFileBtn').addEventListener('click', () => this.uploadFile());
        document.getElementById('newFileBtn').addEventListener('click', () => this.newFile());

        // F5 für Ausführen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F5') {
                e.preventDefault();
                if (this.isConnected) this.runCode();
            }
        });

        // Editor Änderungen speichern
        this.editor.onDidChangeModelContent(() => {
            this.files[this.currentFile] = this.editor.getValue();
        });

        document.getElementById('modelConfigBtn').addEventListener('click', () => {
            document.getElementById('modelConfigModal').style.display = 'block';
        });

        document.getElementById('saveModelConfigBtn').addEventListener('click', () => {
            this.model = document.getElementById('modelSelect').value;
            this.deepSeekApiKey = document.getElementById('deepSeekApiKeyInput').value;
            this.openaiApiKey = document.getElementById('openaiApiKeyInput').value;
            this.ollamaUrl = document.getElementById('ollamaUrlInput').value;
            this.ollamaModel = document.getElementById('ollamaModelInput').value;
            localStorage.setItem('model', this.model);
            localStorage.setItem('deepSeekApiKey', this.deepSeekApiKey);
            localStorage.setItem('openaiApiKey', this.openaiApiKey);
            localStorage.setItem('ollamaUrl', this.ollamaUrl);
            localStorage.setItem('ollamaModel', this.ollamaModel);
            document.getElementById('modelConfigModal').style.display = 'none';
            this.uiManager.updateSendToModelButtonText();
        });

        document.getElementById('themeToggleBtn').addEventListener('click', () => this.uiManager.toggleTheme());
        
        document.getElementById('sendToLlmBtn').addEventListener('click', () => this.llmService.callLLMApi());
        document.getElementById('acceptLlmChangesBtn').addEventListener('click', () => this.llmService.acceptLLMChanges());
        document.getElementById('rejectLlmChangesBtn').addEventListener('click', () => this.llmService.rejectLLMChanges());

        // initializeResizer and initializeContextMenuListeners are called by UIManager constructor
    }

    newFile() {
        if (this.llmService.diffEditor) { // Check on LLMService instance
            this.llmService.rejectLLMChanges(); 
        }
        this.editor.setValue('');
        this.currentFile = 'untitled.py'; // Standardmäßig .py
        this.files[this.currentFile] = '';
        this.uiManager.updateActiveTab(this.currentFile);
        this.uiManager.updateConnectionStatusUI(); // This will correctly set uploadBtn state
        this.uiManager.addToTerminal(`\n✨ New file '${this.currentFile}' created in editor.\n`);
    }

    async fetchHardwareContextFile() {
        if (!this.isConnected) return;
        this.uiManager.addToTerminal('\nℹ️ Attempting to load hardware context (hardware.txt)...\n');
        this.isLoadingHardwareContext = true;
        this.hardwareContext = ''; // Clear old context

        this.uiManager.addToTerminal('🛑 Stopping any running scripts (before loading hardware context)...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand('\r');   // Enter, um die REPL-Zeile zu säubern
        await new Promise(resolve => setTimeout(resolve, 50));

        const loadHardwareCode = `
try:
    with open('hardware.txt', 'r') as f_hw:
        print('===HARDWARE_CONTEXT_' + 'START===')
        print(f_hw.read())
        print('===HARDWARE_CONTEXT_' + 'END===')
except Exception as e_hw:
    print('===HARDWARE_CONTEXT_START===') # Send marker so isLoadingHardwareContext is reset
    print(f"Error reading hardware.txt: {e_hw}")
    print('===HARDWARE_CONTEXT_' + 'END===')
`;
        await this.sendRawCommand('\x05'); // Paste-Modus
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand(loadHardwareCode.replace(/\n/g, '\r') + '\r');
        await this.sendRawCommand('\x04'); // Ausführen
        await new Promise(resolve => setTimeout(resolve, 50)); // Kurze Pause
        await this.sendRawCommand('\r'); // REPL-Zeile säubern
        // Das Ergebnis wird in startReading() verarbeitet
    }

    async _executeDeviceCommand(command, successMessage, errorMessagePrefix) {
        if (!this.isConnected) return;

        this.uiManager.addToTerminal('🛑 Stopping any running scripts (before device command)...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand('\r');   // Enter to clear REPL line
        await new Promise(resolve => setTimeout(resolve, 50));
        
        this.uiManager.addToTerminal(`\n⚙️ Executing: ${command.splitlines ? command.splitlines()[0] : command}\n`); // Show only first line for multi-line commands
        
        const script = `
try:
    import os
    ${command}
    print("===CMD_SUCCESS===")
except Exception as e:
    print(f"===CMD_ERROR===:{e}")
`;
        await this.sendRawCommand('\x05'); // Paste-Modus starten
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand(script.replace(/\n/g, '\r') + '\r');
        await this.sendRawCommand('\x04'); // Paste-Modus beenden und ausführen
        await new Promise(resolve => setTimeout(resolve, 50)); // Kurze Pause
        await this.sendRawCommand('\r'); // REPL-Zeile säubern
        await new Promise(resolve => setTimeout(resolve, 150)); // Restliche Wartezeit, falls für Befehlsausführung benötigt

        // Hier könnte man auf ===CMD_SUCCESS=== oder ===CMD_ERROR=== in der Terminalausgabe lauschen,
        // aber für den Moment verlassen wir uns auf die Terminalausgabe und aktualisieren die Dateiliste.
        // Eine robustere Lösung würde eine Callback-Mechanik oder Promises verwenden, die auf die Marker warten.        
        if (successMessage) this.uiManager.addToTerminal(`\n✅ ${successMessage}\n`);
        this.listFiles(); // Always update file list
    }

    promptDeleteFile(filename) {
        if (confirm(`Are you sure you want to delete the file '${filename}'?`)) {
            this._executeDeviceCommand(`os.remove('${filename}')`, `File '${filename}' deleted.`);
        }
    }

    promptRenameFile(oldFilename) {
        const newFilename = prompt(`Enter new name for '${oldFilename}':`, oldFilename);
        if (newFilename && newFilename !== oldFilename) {
            if (!newFilename.endsWith('.py') && !newFilename.endsWith('.txt')) {
                 alert('Filename must end with .py or .txt.');
                 return;
            }
            this._executeDeviceCommand(`os.rename('${oldFilename}', '${newFilename}')`, `File '${oldFilename}' renamed to '${newFilename}'.`);
            if (this.currentFile === oldFilename) {
                this.currentFile = newFilename;
                this.uiManager.updateActiveTab(newFilename);
            }
        }
    }

    async toggleConnection() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        try {
            this.uiManager.addToTerminal('🔌 Connecting to ESP32...\n');
            
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();

            this.isConnected = true;
            this.uiManager.updateConnectionStatusUI();
            
            this.uiManager.addToTerminal('✅ Successfully connected!\n');
            
            // Stoppe evtl. laufende Skripte und stelle sicher, dass die REPL bereit ist
            this.uiManager.addToTerminal('🛑 Stopping any running scripts (after connection)...\n');
            await this.sendRawCommand('\x03'); // Ctrl+C (Stop)
            await new Promise(resolve => setTimeout(resolve, 50)); // Give time for Ctrl+C to be processed
            await this.sendRawCommand('\r');   // Enter to clear REPL line
            await new Promise(resolve => setTimeout(resolve, 50));
                                
            this.startReading();
            
        } catch (error) {
            this.uiManager.addToTerminal(`❌ Connection error: ${error.message}\n`);
        }
    }

    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                this.reader.releaseLock();
            }
            if (this.writer) {
                this.writer.releaseLock();
            }
            if (this.port) {
                await this.port.close();
            }
            this.uiManager.addToTerminal('🔌 Disconnected.\n');
            
        } catch (error) {
            this.uiManager.addToTerminal(`❌ Error disconnecting: ${error.message}\n`);
        } finally {
            this.isConnected = false;
            this.uiManager.updateConnectionStatusUI();
        }
    }

    async startReading() {
        try {
            let buffer = '';
            while (this.isConnected) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                const text = new TextDecoder().decode(value);
                this.uiManager.addToTerminal(text); // Add raw data to terminal display
                
                buffer += text; // Accumulate raw data in buffer

                let processedSomethingInLoop = true; 
                while (processedSomethingInLoop) {
                    processedSomethingInLoop = false;

                    // 1. Try to process file list
                    const fileListResult = this.parseFileList(buffer);
                    if (fileListResult) {
                        this.uiManager.updateFileBrowser(fileListResult.files); // Delegate to UIManager
                        buffer = buffer.substring(fileListResult.processedLength);
                        processedSomethingInLoop = true;
                        continue; 
                    }

                    // 2. Try to process file content for editor
                    if (!this.isLoadingHardwareContext) {
                        const fileContentResult = this.parseFileContent(buffer);
                        if (fileContentResult) {
                            this.editor.setValue(fileContentResult.content);
                            this.files[this.currentFile] = fileContentResult.content;
                            buffer = buffer.substring(fileContentResult.processedLength);
                            processedSomethingInLoop = true;
                            continue;
                        }
                    }
                    
                    // 3. Try to process hardware context
                    if (this.isLoadingHardwareContext && buffer.includes('===HARDWARE_CONTEXT_END===')) {
                        const hardwareContextResult = this.parseHardwareContext(buffer);
                        if (hardwareContextResult) { 
                            this.hardwareContext = hardwareContextResult.content;
                            if (hardwareContextResult.status === 'success') {
                                if (hardwareContextResult.content) {
                                    this.uiManager.addToTerminal('\n✅ Hardware context (hardware.txt) loaded.\n');
                                } else {
                                    this.uiManager.addToTerminal('\nℹ️ Hardware context (hardware.txt) is empty.\n');
                                }
                            }
                            // Error message is handled by parseHardwareContext itself.
                            this.isLoadingHardwareContext = false; 
                            buffer = buffer.substring(hardwareContextResult.processedLength);
                            processedSomethingInLoop = true;
                            continue;
                        } else if (buffer.includes('===HARDWARE_CONTEXT_START===') && buffer.includes('===HARDWARE_CONTEXT_END===')) {
                            // Safety net: If parseHardwareContext returned null but markers were present,
                            // it implies an issue not caught by specific error strings or an incomplete message that got fully buffered.
                            this.uiManager.addToTerminal('\n⚠️ Hardware context (hardware.txt) could not be fully parsed, though markers were present.\n');
                            this.isLoadingHardwareContext = false;
                            const endMarkerIndex = buffer.indexOf('===HARDWARE_CONTEXT_END===');
                            if (endMarkerIndex !== -1) {
                                buffer = buffer.substring(endMarkerIndex + '===HARDWARE_CONTEXT_END==='.length);
                            } else {
                                buffer = ''; // Fallback
                            }
                            processedSomethingInLoop = true; 
                            continue;
                        }
                    }
                }
            }
        } catch (error) {
            if (this.isConnected) {
                this.uiManager.addToTerminal(`❌ Read error: ${error.message}\n`);
            }
        }
    }

    async sendRawCommand(command) {
        if (!this.writer) return;
        
        const encoder = new TextEncoder();
        await this.writer.write(encoder.encode(command));
    }

    async sendCommand() {
        const input = document.getElementById('terminalInput');
        const command = input.value;
        
        if (!command.trim()) return;
        
        this.uiManager.addToTerminal(`>>> ${command}\n`);
        await this.sendRawCommand(command + '\r\n');
        
        input.value = '';
    }

    async runCode() {
        if (!this.isConnected) return;
        
        if (!this.currentFile) {
            this.uiManager.addToTerminal('\n❌ Please upload a file first.\n');
            return;
        }
        
        this.uiManager.addToTerminal(`\n=== Executing ${this.currentFile} ===\n`);

        this.uiManager.addToTerminal('🛑 Stopping any running scripts (before code execution)...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand('\r');   // Enter to clear REPL line
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Code ausführen mittels Paste-Modus und exec
        // await this.sendRawCommand('\r\n'); // Nicht mehr nötig, da \r oben gesendet wurde

        // Construct the script with \r line endings for paste mode

        const pythonScriptSource = `try:
    with open('${this.currentFile}', 'r') as f:
        exec(f.read())
except OSError:
    print("Error: ${this.currentFile} not found")
except SyntaxError as e:
    print(f"SyntaxError in ${this.currentFile}: {e}")
`;
        const pythonScript = pythonScriptSource.replace(/\n/g, '\r') + '\r';                

        await this.sendRawCommand('\x05'); // Ctrl-E: Paste-Modus starten
        await new Promise(resolve => setTimeout(resolve, 100)); // Kurze Pause
        
        await this.sendRawCommand(pythonScript); // pythonScript hat bereits \r Endungen
        // Keine zusätzliche Pause hier, da der gesamte Block auf einmal gesendet wird
        
        await this.sendRawCommand('\x04'); // Ctrl-D: Paste-Modus beenden und ausführen
        await new Promise(resolve => setTimeout(resolve, 50)); // Kurze Pause danach
        await this.sendRawCommand('\r'); // REPL-Zeile säubern
        await new Promise(resolve => setTimeout(resolve, 50)); 
    }

    async stopExecution() {
        if (!this.isConnected) return;
        
        this.uiManager.addToTerminal('\n🛑 Stopping execution...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
    }

    async softReset() {
        if (!this.isConnected) return;
        
        this.uiManager.addToTerminal('\n🔄 Soft Resetting...\n');
        await this.sendRawCommand('\x04'); // Ctrl+D
    }

    async uploadFile() {
        const filename = document.getElementById('filenameInput').value;
        if (!filename) return;
        if (!filename.endsWith('.py') && !filename.endsWith('.txt')) {
            this.uiManager.addToTerminal('\n❌ Filename must end with .py or .txt\n');
            return;
        }
        
        const code = this.editor.getValue();
        this.currentFile = filename;
        this.uiManager.updateActiveTab(filename); // Tab aktualisieren
        this.uiManager.updateConnectionStatusUI(); // Update button states, esp. uploadBtn

        const chunkSize = 200; // Noch kleinere Chunk-Größe
        const totalChunks = Math.ceil(code.length / chunkSize);

        const progressBarContainer = document.getElementById('uploadProgressBarContainer');
        const progressBar = document.getElementById('uploadProgressBar');
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        this.uiManager.updateUploadProgress(0, 0, code.length); // Show progress bar
        
        this.uiManager.addToTerminal(`\n📤 Uploading ${filename} (${code.length} chars, ${totalChunks} chunks)...\n`);
        this.uiManager.addToTerminal('⚠️ Please wait while the file is being uploaded...\n');
        
        try {
            // Datei erstellen
            await this.sendRawCommand('\x05');
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduziert von 200ms
            await this.sendRawCommand(`f=open('${filename}','w')\r\n`);
            await this.sendRawCommand('\x04');
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduziert von 200ms
            
            // Code in Chunks hochladen
            for (let i = 0; i < totalChunks; i++) {
                const chunk = code.substring(i * chunkSize, (i + 1) * chunkSize);
                // Sonderzeichen escapen
                const escapedChunk = chunk
                    .replace(/\\/g, '\\\\')
                    .replace(/'/g, "\\'")
                    .replace(/\r/g, '\\r')
                    .replace(/\n/g, '\\n');
                
                try {
                    await this.sendRawCommand('\x05');
                    await new Promise(resolve => setTimeout(resolve, 100)); // Reduziert von 200ms
                    await this.sendRawCommand(`f.write('${escapedChunk}')\r\n`);
                    await this.sendRawCommand('\x04');
                    await new Promise(resolve => setTimeout(resolve, 100)); // Reduziert von 200ms
                    
                    // Fortschritt anzeigen
                    const progress = Math.round(((i + 1) / totalChunks) * 100);
                    this.uiManager.addToTerminal(`\r🔼 Uploaded: ${progress}% (${Math.min((i + 1) * chunkSize, code.length)}/${code.length})`);
                    this.uiManager.updateUploadProgress(progress, Math.min((i + 1) * chunkSize, code.length), code.length);
                } catch (error) {
                    this.uiManager.addToTerminal(`\n❌ Error in chunk ${i+1}: ${error.message}\n`);
                    this.uiManager.updateUploadProgress(null); // Hide progress bar on error
                    throw error;
                }
            }
            
            // Datei schließen
            await this.sendRawCommand('\x05');
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduziert von 200ms
            await this.sendRawCommand('f.close()\r\n');
            await this.sendRawCommand('\x04');
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduziert von 200ms
            
            this.uiManager.addToTerminal(`\n✅ ${filename} uploaded successfully!\n`);
            this.uiManager.updateUploadProgress(100, code.length, code.length);
            
        } catch (error) {
            this.uiManager.addToTerminal(`\n❌ Error during upload: ${error.message}\n`);
            this.uiManager.updateUploadProgress(null); // Hide progress bar on error
        } finally {
            // Kurze Verzögerung, bevor das Modal geschlossen wird, damit der Benutzer 100% sieht
            setTimeout(() => {
                this.uiManager.closeFilenameModal();
                this.uiManager.updateUploadProgress(null); // Ensure it's hidden for next time
            }, 500);
            setTimeout(() => this.listFiles(), 1000); // listFiles nach dem Schließen des Modals
        }
    }

    async loadFile(filename) {
        if (this.llmService.diffEditor) { // Check on LLMService instance
            this.llmService.rejectLLMChanges();
        }
        if (!this.isConnected) return;        this.uiManager.addToTerminal('🛑 Stopping any running scripts (before loading file)...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand('\r');   // Enter to clear REPL line
        await new Promise(resolve => setTimeout(resolve, 50));
        
        this.uiManager.addToTerminal(`\n📥 Loading ${filename}...\n`);
        
        const loadCode = `
try:
    with open('${filename}', 'r') as f:
        print('===FILE_CONTENT_START===')
        print(f.read())
        print('===FILE_CONTENT_END===')
except Exception as e:
    print('Error:', e)
`;
        
        await this.sendRawCommand('\x05');
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.sendRawCommand(loadCode.replace(/\n/g, '\r') + '\r'); // Korrektur und korrekte Zeilenenden
        await this.sendRawCommand('\x04');
        await new Promise(resolve => setTimeout(resolve, 50)); // Kurze Pause
        await this.sendRawCommand('\r'); // REPL-Zeile säubern
        
        // Datei im Editor anzeigen
        this.currentFile = filename;
        this.uiManager.updateActiveTab(filename); // Tab aktualisieren
        this.uiManager.updateConnectionStatusUI(); // Update button states
        // this.editor.setValue(''); // Entfernt: Inhalt wird durch Lesevorgang in startReading() gefüllt
    }

    parseFileContent(buffer) {
        const startMarker = '===FILE_CONTENT_START===';
        const endMarker = '===FILE_CONTENT_END===';
        const startIndex = buffer.indexOf(startMarker);
        if (startIndex === -1) return null;

        const endIndexMarker = buffer.indexOf(endMarker, startIndex + startMarker.length);
        if (endIndexMarker === -1) return null;
        
        let content = buffer.substring(startIndex + startMarker.length, endIndexMarker);
        content = content.replace(/\r\n/g, '\n');
        content = content.replace(/^\n+|\n+$/g, ''); // Trim leading/trailing newlines
        return { content: content, processedLength: endIndexMarker + endMarker.length };
    }

    parseHardwareContext(buffer) { // Changed parameter name from text to buffer
        const startMarker = '===HARDWARE_CONTEXT_START===';
        const endMarker = '===HARDWARE_CONTEXT_END===';
        
        // Find the LAST occurrence of the start marker to skip over echoes.
        const startIndex = buffer.lastIndexOf(startMarker); 
        if (startIndex === -1) return null; // Start marker not found at all

        // Now search for the end marker *after* this last start marker.
        const endIndexMarker = buffer.indexOf(endMarker, startIndex + startMarker.length);
        if (endIndexMarker === -1) return null; 
        
        const processedLength = endIndexMarker + endMarker.length; // Define processedLength
        let content = buffer.substring(startIndex + startMarker.length, endIndexMarker);
        content = content.replace(/\r\n/g, '\n').trim();
        
        if (content.startsWith("Error reading hardware.txt:")) {
            this.uiManager.addToTerminal(`\n⚠️ ${content}\n`); 
            return { content: '', status: 'error', processedLength: processedLength };
        }
        return { content: content, status: 'success', processedLength: processedLength };
    }

    async listFiles() {
        if (!this.isConnected) return;

        this.uiManager.addToTerminal('🛑 Stopping any running scripts (before listing files)...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand('\r');   // Enter to clear REPL line
        await new Promise(resolve => setTimeout(resolve, 50));
        
        this.uiManager.addToTerminal('\n📁 Listing files...\n');
        
        const listCode = `
import os
print('===FILELIST_START===')
for file in os.listdir():
    try:
        stat = os.stat(file)
        size = stat[6]
        print(f'{file}|{size}')
    except:
        print(f'{file}|folder')
print('===FILELIST_END===')
`;
        
        await this.sendRawCommand('\x05');
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.sendRawCommand(listCode.replace(/\n/g, '\r') + '\r'); // Korrekte Zeilenenden für Paste-Modus
        await this.sendRawCommand('\x04');
        await new Promise(resolve => setTimeout(resolve, 50)); // Kurze Pause
        await this.sendRawCommand('\r'); // REPL-Zeile säubern
    }

    parseFileList(buffer) {
        const startMarker = '===FILELIST_START===';
        const endMarker = '===FILELIST_END===';
        const startIndex = buffer.indexOf(startMarker);
        if (startIndex === -1) return null; 

        const endIndexMarker = buffer.indexOf(endMarker, startIndex + startMarker.length);
        if (endIndexMarker === -1) return null;

        const fileListText = buffer.substring(startIndex + startMarker.length, endIndexMarker).trim();
        const lines = fileListText.split('\n');
        const files = [];
        for (const line of lines) {
            if (line.trim() === '') continue; 
            const parts = line.split('|');
            if (parts.length === 2 && parts[0].trim() !== '') {
               files.push({name: parts[0].trim(), size: parts[1].trim()});
            } else {
                console.warn("Skipping malformed file list line:", line);
            }
        }
        return { files: files, processedLength: endIndexMarker + endMarker.length };
    }

    // updateFileBrowser method moved to UIManager.js
    // addToTerminal method moved to UIManager.js
    // clearTerminal method moved to UIManager.js
    // updateUI method moved to UIManager.js and renamed to updateConnectionStatusUI
}

function closeModal() {
    // This global function is called by the (onclick) attribute in HTML
    // It needs to access the UIManager instance on the global `ide` object.
    if (window.ide && window.ide.uiManager) {
        window.ide.uiManager.closeFilenameModal();
    }
}

// Monaco Editor initialisieren
function initEditor() {
    try {
        require(['vs/editor/editor.main'], function() {
            const editor = monaco.editor.create(document.getElementById('editor'), {
                value: [
                    "# Your MicroPython code here...",
                    "print('Hello ESP32!')",
                    "",
                    "# Example: Blink LED",
                    "from machine import Pin",
                    "import time",
                    "",
                    "led = Pin(2, Pin.OUT)  # GPIO 2 for built-in LED",
                    "",
                    "for i in range(10):",
                    "    led.on()",
                    "    time.sleep(0.5)",
                    "    led.off()",
                    "    time.sleep(0.5)",
                    "    print('Blink ' + str(i + 1))  # f-string removed for wider compatibility"
                ].join('\n'),
                language: 'python',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                roundedSelection: true,
                scrollBeyondLastLine: false,
                renderWhitespace: 'selection',
                tabSize: 4
            });

            // IDE initialisieren und Editor übergeben
            window.ide = new MicroPythonIDE(editor);
        });
    } catch (error) {
        console.error('Editor Initialization Error:', error);
        // Fallback falls Monaco nicht lädt
        const editorElement = document.getElementById('editor');
        editorElement.innerHTML = '<textarea style="width:100%;height:100%;background:#1e1e1e;color:#d4d4d4;border:none;padding:10px;font-family:monospace;font-size:14px;" id="fallbackEditor"># Your MicroPython code here...\nprint(\'Hello ESP32!\')</textarea>';
        window.ide = new MicroPythonIDE({
            getValue: () => document.getElementById('fallbackEditor').value,
            setValue: (content) => document.getElementById('fallbackEditor').value = content,
            onDidChangeModelContent: (callback) => {
                document.getElementById('fallbackEditor').addEventListener('input', callback);
            }
        });
    }
}

// Editor laden wenn alles fertig ist
if (document.readyState === 'complete') {
    initEditor();
} else {
    window.addEventListener('load', initEditor);
}
