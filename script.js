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
        this.diffEditor = null;
        this.diffEditorContainerDiv = null;
        this.originalEditorDiv = document.getElementById('editor');
        this.editorContainerDiv = document.getElementById('editor-container');
        this.totalSessionCostUnits = 0; // Für die Kostensummierung
        this.contextMenuTargetFile = null;
        this.deviceFiles = []; // Zum Speichern der aktuellen Dateiliste vom Gerät
        this.hardwareContext = ''; // Für den Inhalt von hardware.txt
        this.isLoadingHardwareContext = false; // Flag für das Laden von hardware.txt
        
        // Initialize theme
        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.setTheme(this.currentTheme);
        
        this.initializeEventListeners();
        this.checkWebSerialSupport();
        document.getElementById('deepSeekApiKeyInput').value = this.deepSeekApiKey;
        document.getElementById('openaiApiKeyInput').value = this.openaiApiKey;
        document.getElementById('ollamaUrlInput').value = this.ollamaUrl;
        document.getElementById('ollamaModelInput').value = this.ollamaModel;
        document.getElementById('modelSelect').value = this.model;
        this.updateSendToModelButton();
    }

    checkWebSerialSupport() {
        if (!('serial' in navigator)) {
            this.addToTerminal('❌ Web Serial API not supported. Please use Chrome or Edge.\n');
        }
    }

    initializeEventListeners() {
        document.getElementById('connectBtn').addEventListener('click', () => this.toggleConnection());
        document.getElementById('runBtn').addEventListener('click', () => this.runCode());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopExecution());
        document.getElementById('uploadBtn').addEventListener('click', () => this.showUploadModal());
        document.getElementById('listFilesBtn').addEventListener('click', () => this.listFiles());
        document.getElementById('softResetBtn').addEventListener('click', () => this.softReset());
        document.getElementById('clearTerminalBtn').addEventListener('click', () => this.clearTerminal());
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
            this.updateSendToModelButton();
        });

        document.getElementById('themeToggleBtn').addEventListener('click', () => this.toggleTheme());
        
        document.getElementById('sendToLlmBtn').addEventListener('click', () => this.callDeepSeekApi());
        document.getElementById('acceptLlmChangesBtn').addEventListener('click', () => this.acceptLLMChanges());
        document.getElementById('rejectLlmChangesBtn').addEventListener('click', () => this.rejectLLMChanges());

        this.initializeResizer();
        this.initializeContextMenuListeners();
    }

    initializeContextMenuListeners() {
        const contextMenu = document.getElementById('fileContextMenu');
        document.addEventListener('click', (e) => { // Globaler Klick zum Schließen
            if (!contextMenu.contains(e.target)) {
                contextMenu.style.display = 'none';
                this.contextMenuTargetFile = null;
            }
        });

        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (this.contextMenuTargetFile) {
                    switch (action) {
                        case 'delete':
                            this.promptDeleteFile(this.contextMenuTargetFile);
                            break;
                        case 'rename':
                            this.promptRenameFile(this.contextMenuTargetFile);
                            break;
                    }
                }
                contextMenu.style.display = 'none';
                this.contextMenuTargetFile = null;
            });
        });
    }

    initializeResizer() {
        const resizer = document.getElementById('resizerVertical');
        const editorPanel = document.getElementById('editorPanel');
        const terminalPanel = document.getElementById('terminalPanel');
        const fileBrowser = document.querySelector('.file-browser');

        let initialX = 0;
        let initialTerminalWidth = 0;

        const onMouseMove = (e) => {
            const dx = e.clientX - initialX;
            let newTerminalWidth = initialTerminalWidth - dx;

            const mainContentWidth = resizer.parentElement.offsetWidth;
            const fileBrowserWidth = fileBrowser.offsetWidth;
            const resizerWidth = resizer.offsetWidth;
            
            const minPanelPixelWidth = 150; // Mindestbreite für Editor und Terminal in Pixeln

            const maxTerminalWidth = mainContentWidth - fileBrowserWidth - resizerWidth - minPanelPixelWidth;
            
            if (newTerminalWidth < minPanelPixelWidth) {
                newTerminalWidth = minPanelPixelWidth;
            }
            if (newTerminalWidth > maxTerminalWidth) {
                newTerminalWidth = maxTerminalWidth;
            }
            
            const currentEditorWidth = mainContentWidth - fileBrowserWidth - resizerWidth - newTerminalWidth;
            if (currentEditorWidth < minPanelPixelWidth) {
                newTerminalWidth = mainContentWidth - fileBrowserWidth - resizerWidth - minPanelPixelWidth;
                if (newTerminalWidth < minPanelPixelWidth) newTerminalWidth = minPanelPixelWidth; // Erneut prüfen
            }

            terminalPanel.style.flexBasis = `${newTerminalWidth}px`;

            if (this.editor && typeof this.editor.layout === 'function') {
                this.editor.layout();
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Verhindert Textauswahl während des Ziehens
            initialX = e.clientX;
            initialTerminalWidth = terminalPanel.offsetWidth;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'col-resize'; // Zeigt den Cursor global an
            document.body.style.userSelect = 'none'; // Verhindert Textauswahl global
        });
    }

    async callDeepSeekApi() {
        const prompt = document.getElementById('llmPromptInput').value;
        const originalCode = this.editor.getValue(); // Originalcode speichern

        if (!this.deepSeekApiKey) {
            this.addToTerminal('\n❌ Please enter a DeepSeek API Key first.\n');
            console.error('DeepSeek API Key missing.');
            alert('Please enter a DeepSeek API Key in the field at the top right first.');
            return;
        }

        if (!prompt) {
            this.addToTerminal('\nℹ️ Please enter a prompt for DeepSeek.\n');
            alert('Please enter a prompt for DeepSeek.');
            return;
        }

        this.addToTerminal('\n🤖 Sending request to DeepSeek...\n');
        const sendToLlmBtn = document.getElementById('sendToLlmBtn');
        sendToLlmBtn.disabled = true;
        sendToLlmBtn.innerHTML = '<span class="spinner"></span> Sending...';

        const systemPrompt = "You are a helpful assistant that generates MicroPython code for microcontrollers. Ensure the code is valid MicroPython and directly usable on devices like ESP32. Only output the Python code, without any surrounding text or explanations unless explicitly asked.";
            
        let userPromptContent = `${prompt}\n\nCurrent code in editor (if any, otherwise generate new code):\n\`\`\`python\n${originalCode}\n\`\`\``;

        if (this.hardwareContext) {
            userPromptContent = `Consider the following hardware configuration:\n<hardware_info>\n${this.hardwareContext}\n</hardware_info>\n\n${userPromptContent}`;
            this.addToTerminal('\nℹ️ Sending hardware context to LLM.\n');
        }

        let API_URL, apiKey, requestBody, headers;
        if (this.model.startsWith('deepseek')) {
            API_URL = `https://api.deepseek.com/chat/completions`;
            apiKey = this.deepSeekApiKey;
            requestBody = {
                model: this.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPromptContent }
                ],
                temperature: 0.7,
                // max_tokens: 2048, // Kann bei Bedarf angepasst werden
            };
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
        } else if (this.model.startsWith('gpt')) {
            API_URL = `https://api.openai.com/v1/chat/completions`;
            apiKey = this.openaiApiKey;
            requestBody = {
                model: this.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPromptContent }
                ],
                temperature: 0.7,
                // max_tokens: 2048, // Kann bei Bedarf angepasst werden
            };
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
        } else if (this.model === 'ollama') {
            if (!this.ollamaModel) {
                this.addToTerminal('\n❌ Please enter an Ollama model name.\n');
                return;
            }
            API_URL = `${this.ollamaUrl}/api/chat`;
            apiKey = ''; // Ollama doesn't require API key
            requestBody = {
                model: this.ollamaModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPromptContent }
                ],
                stream: false,
                options: {
                    temperature: 0.7
                }
            };
            headers = {
                'Content-Type': 'application/json'
            };
        } else {
            this.addToTerminal('\n❌ Unsupported model selected.\n');
            return;
        }

        console.log('DeepSeek API Request Body:', requestBody);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('DeepSeek API Error Response:', errorData);
                this.addToTerminal(`\n❌ Error from DeepSeek API: ${response.status} ${response.statusText}\nDetails: ${JSON.stringify(errorData.error?.message || errorData)}\n`);
                throw new Error(`API request failed with status ${response.status}: ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            console.log('DeepSeek API Success Response:', data);

            // Nutzungsdaten und Kosten aktualisieren
            if (data.usage) {
                const usage = data.usage;
                const promptTokens = usage.prompt_tokens || 0;
                const completionTokens = usage.completion_tokens || 0;
                const totalTokens = usage.total_tokens || 0;

                // Preise für deepseek-chat (angenommen, bitte verifizieren):
                // Input: 1 RMB / 1M tokens => 0.000001 RMB / token
                // Output: 2 RMB / 1M tokens => 0.000002 RMB / token
                // Wir verwenden "Mikro-Einheiten" (µ) zur Darstellung, wobei 1µ ~ 1 RMB / 1M Input Tokens
                const costPerMillionInputTokens = 1; 
                const costPerMillionOutputTokens = 2;

                const currentCost = (promptTokens / 1000000) * costPerMillionInputTokens + 
                                  (completionTokens / 1000000) * costPerMillionOutputTokens;
                
                this.totalSessionCostUnits += currentCost;

                document.getElementById('promptTokens').textContent = promptTokens;
                document.getElementById('completionTokens').textContent = completionTokens;
                document.getElementById('totalTokens').textContent = totalTokens;
                document.getElementById('lastCost').textContent = currentCost.toFixed(6); // Zeigt z.B. 0.000123 an
                document.getElementById('totalSessionCost').textContent = this.totalSessionCostUnits.toFixed(6);
            } else {
                // Reset, falls keine Nutzungsdaten vorhanden sind
                document.getElementById('promptTokens').textContent = 'N/A';
                document.getElementById('completionTokens').textContent = 'N/A';
                document.getElementById('totalTokens').textContent = 'N/A';
                document.getElementById('lastCost').textContent = 'N/A';
            }

            let llmOutput;
            if (this.model === 'ollama') {
                if (data.message && data.message.content) {
                    llmOutput = data.message.content;
                } else {
                    console.warn('Ollama response did not contain message.content:', data);
                    this.addToTerminal('\n⚠️ Ollama response did not contain message.content.\n');
                    return;
                }
            } else {
                if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                    llmOutput = data.choices[0].message.content;
                } else {
                    console.warn('API response did not contain expected content:', data);
                    this.addToTerminal('\n⚠️ The model did not return code or had an unexpected response structure.\n');
                    return;
                }
            }
            
            // Versuche, reinen Code aus Markdown-Codeblöcken zu extrahieren
            const codeBlockMatch = llmOutput.match(/```python\n([\s\S]*?)\n```|```([\s\S]*?)\n```/);
            let newCode = llmOutput; 

            if (codeBlockMatch) {
                newCode = codeBlockMatch[1] || codeBlockMatch[2]; 
                const textBefore = llmOutput.substring(0, codeBlockMatch.index).trim();
                const textAfter = llmOutput.substring(codeBlockMatch.index + codeBlockMatch[0].length).trim();
                if (textBefore) console.log("LLM Info (vor Codeblock):", textBefore);
                if (textAfter) console.log("LLM Info (nach Codeblock):", textAfter);
            } else {
                 // Wenn kein expliziter Codeblock, aber die Ausgabe mit "python" beginnt (manchmal bei DeepSeek)
                 if (llmOutput.toLowerCase().startsWith("python\n")) {
                     newCode = llmOutput.substring("python\n".length);
                 }
                 console.log("LLM Info (kein expliziter Python-Codeblock gefunden, verwende angepasste/gesamte Ausgabe als Code):", llmOutput);
            }
            
            // Entferne mögliche einleitende/abschließende Leerzeilen, die vom LLM kommen könnten
            newCode = newCode.trim();

            // Diff-Ansicht anzeigen, anstatt den Editor direkt zu aktualisieren
            this.showDiff(originalCode, newCode);
            this.addToTerminal('\n✅ Code received from LLM. Please review the changes.\n');
            // document.getElementById('llmPromptInput').value = ''; // Now done in hideDiffAndRestoreEditor

        } catch (error) {
            console.error('Error requesting DeepSeek API:', error);
            this.addToTerminal(`\n❌ Error communicating with DeepSeek: ${error.message}\n`);
        } finally {
            sendToLlmBtn.disabled = false;
            this.updateSendToModelButton();
        }
    }

    showDiff(originalCode, newCode) {
        this.originalEditorDiv.style.display = 'none'; // Haupteditor ausblenden

        // Vorherigen Diff-Editor entfernen, falls vorhanden
        if (this.diffEditorContainerDiv) {
            this.diffEditorContainerDiv.remove();
        }
        if (this.diffEditor) {
            this.diffEditor.dispose(); // Wichtig: Monaco Editor Instanzen disposen
            this.diffEditor = null;
        }

        this.diffEditorContainerDiv = document.createElement('div');
        this.diffEditorContainerDiv.style.width = '100%';
        this.diffEditorContainerDiv.style.height = '100%'; // Nimmt die volle Höhe des Parents
        this.editorContainerDiv.appendChild(this.diffEditorContainerDiv);

        this.diffEditor = monaco.editor.createDiffEditor(this.diffEditorContainerDiv, {
            theme: this.currentTheme === 'dark' ? 'vs-dark' : 'vs',
            automaticLayout: true,
            readOnly: false, // Erlaube Bearbeitung in der "modified" Seite, falls gewünscht
            originalEditable: false, // Original sollte nicht bearbeitbar sein
            renderSideBySide: true // Standard ist nebeneinander
        });

        const originalModel = monaco.editor.createModel(originalCode, 'python');
        const modifiedModel = monaco.editor.createModel(newCode, 'python');

        this.diffEditor.setModel({
            original: originalModel,
            modified: modifiedModel
        });

        // Buttons im Prompt-Panel umschalten
        document.getElementById('llmPromptInput').style.display = 'none';
        document.getElementById('sendToLlmBtn').style.display = 'none';
        document.getElementById('acceptLlmChangesBtn').style.display = 'inline-block';
        document.getElementById('rejectLlmChangesBtn').style.display = 'inline-block';
    }

    hideDiffAndRestoreEditor() {
        if (this.diffEditor) {
            // Modelle explizit disposen, bevor der Editor disposed wird
            const model = this.diffEditor.getModel();
            if (model && model.original) model.original.dispose();
            if (model && model.modified) model.modified.dispose();
            this.diffEditor.dispose();
            this.diffEditor = null;
        }
        if (this.diffEditorContainerDiv) {
            this.diffEditorContainerDiv.remove();
            this.diffEditorContainerDiv = null;
        }
        this.originalEditorDiv.style.display = 'block';
        this.editor.layout(); // Haupteditor neu zeichnen lassen

        // Buttons im Prompt-Panel zurücksetzen
        document.getElementById('llmPromptInput').style.display = 'block'; // Zurück zu block oder initial
        document.getElementById('llmPromptInput').style.flexGrow = '1'; // explizit wiederherstellen
        document.getElementById('sendToLlmBtn').style.display = 'inline-block';
        document.getElementById('sendToLlmBtn').disabled = false; // Sicherstellen, dass der Senden-Button wieder aktiv ist
        document.getElementById('acceptLlmChangesBtn').style.display = 'none';
        document.getElementById('rejectLlmChangesBtn').style.display = 'none';
        document.getElementById('llmPromptInput').value = ''; // Prompt-Feld leeren
    }

    acceptLLMChanges() {
        if (!this.diffEditor) return;
        const acceptedCode = this.diffEditor.getModel().modified.getValue();
        this.editor.setValue(acceptedCode);
        this.files[this.currentFile] = acceptedCode;
        this.addToTerminal('\n✅ LLM changes accepted.\n');
        this.hideDiffAndRestoreEditor();
    }

    rejectLLMChanges() {
        if (!this.diffEditor) return; // Should not happen, but just in case
        this.addToTerminal('\n❌ LLM changes rejected.\n');
        this.hideDiffAndRestoreEditor();
    }

    updateActiveTab(filename) {
        const activeTab = document.querySelector('.file-tabs .tab.active');
        if (activeTab) {
            activeTab.textContent = filename;
            activeTab.dataset.file = filename;
        }
    }

    setTheme(theme) {
        document.body.classList.toggle('light-mode', theme === 'light');
        localStorage.setItem('theme', theme);
        
        const themeBtn = document.getElementById('themeToggleBtn');
        themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
        
        // Update Monaco editor theme
        if (window.monaco) {
            monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
        }
    }
    
    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(this.currentTheme);
    }

    updateSendToModelButton() {
        const button = document.getElementById('sendToLlmBtn');
        if (button) {
            button.textContent = `Send to ${this.model}`;
        }
    }

    newFile() {
        if (this.diffEditor) { // Wenn in Diff-Ansicht, zuerst Änderungen verwerfen
            this.rejectLLMChanges(); 
        }
        this.editor.setValue('');
        this.currentFile = 'untitled.py'; // Standardmäßig .py
        this.files[this.currentFile] = '';
        this.updateActiveTab(this.currentFile);
        // Upload-Button aktivieren, wenn verbunden, da jetzt eine (leere) Datei zum Speichern vorhanden ist
        document.getElementById('uploadBtn').disabled = !this.isConnected;
        this.addToTerminal(`\n✨ New file '${this.currentFile}' created in editor.\n`);
    }

    async fetchHardwareContextFile() {
        if (!this.isConnected) return;
        this.addToTerminal('\nℹ️ Attempting to load hardware context (hardware.txt)...\n');
        this.isLoadingHardwareContext = true;
        this.hardwareContext = ''; // Clear old context

        this.addToTerminal('🛑 Stopping any running scripts (before loading hardware context)...\n');
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

        this.addToTerminal('🛑 Stopping any running scripts (before device command)...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand('\r');   // Enter to clear REPL line
        await new Promise(resolve => setTimeout(resolve, 50));

        this.addToTerminal(`\n⚙️ Executing: ${command.splitlines ? command.splitlines()[0] : command}\n`); // Show only first line for multi-line commands
        
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
        if (successMessage) this.addToTerminal(`\n✅ ${successMessage}\n`);
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
                this.updateActiveTab(newFilename);
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
            this.addToTerminal('🔌 Connecting to ESP32...\n');
            
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });

            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();

            this.isConnected = true;
            this.updateUI();
            
            this.addToTerminal('✅ Successfully connected!\n');
            
            // Stoppe evtl. laufende Skripte und stelle sicher, dass die REPL bereit ist
            this.addToTerminal('🛑 Stopping any running scripts (after connection)...\n');
            await this.sendRawCommand('\x03'); // Ctrl+C (Stop)
            await new Promise(resolve => setTimeout(resolve, 50));
            await this.sendRawCommand('\r');   // Enter to clear REPL line
            await new Promise(resolve => setTimeout(resolve, 50));
                                
            this.startReading();
            
        } catch (error) {
            this.addToTerminal(`❌ Connection error: ${error.message}\n`);
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
            this.addToTerminal('🔌 Disconnected.\n');
            
        } catch (error) {
            this.addToTerminal(`❌ Error disconnecting: ${error.message}\n`);
        } finally {
            this.isConnected = false;
            this.updateUI();
        }
    }

    async startReading() {
        try {
            let buffer = '';
            while (this.isConnected) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                const text = new TextDecoder().decode(value);
                this.addToTerminal(text); // Add raw data to terminal display
                
                buffer += text; // Accumulate raw data in buffer

                let processedSomethingInLoop = true; 
                while (processedSomethingInLoop) {
                    processedSomethingInLoop = false;

                    // 1. Try to process file list
                    const fileListResult = this.parseFileList(buffer);
                    if (fileListResult) {
                        this.updateFileBrowser(fileListResult.files);
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
                                    this.addToTerminal('\n✅ Hardware context (hardware.txt) loaded.\n');
                                } else {
                                    this.addToTerminal('\nℹ️ Hardware context (hardware.txt) is empty.\n');
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
                            this.addToTerminal('\n⚠️ Hardware context (hardware.txt) could not be fully parsed, though markers were present.\n');
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
                this.addToTerminal(`❌ Read error: ${error.message}\n`);
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
        
        this.addToTerminal(`>>> ${command}\n`);
        await this.sendRawCommand(command + '\r\n');
        
        input.value = '';
    }

    async runCode() {
        if (!this.isConnected) return;
        
        if (!this.currentFile) {
            this.addToTerminal('\n❌ Please upload a file first.\n');
            return;
        }
        
        this.addToTerminal(`\n=== Executing ${this.currentFile} ===\n`);

        this.addToTerminal('🛑 Stopping any running scripts (before code execution)...\n');
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
        
        this.addToTerminal('\n🛑 Stopping execution...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
    }

    async softReset() {
        if (!this.isConnected) return;
        
        this.addToTerminal('\n🔄 Soft Resetting...\n');
        await this.sendRawCommand('\x04'); // Ctrl+D
    }

    showUploadModal() {
        document.getElementById('filenameModal').style.display = 'block';
        document.getElementById('filenameInput').value = this.currentFile;
        document.getElementById('filenameInput').focus();
        // Fortschrittsbalken zurücksetzen und ausblenden
        const progressBarContainer = document.getElementById('uploadProgressBarContainer');
        const progressBar = document.getElementById('uploadProgressBar');
        progressBar.style.width = '0%';
        progressBar.textContent = '';
        progressBarContainer.style.display = 'none';
    }

    async uploadFile() {
        const filename = document.getElementById('filenameInput').value;
        if (!filename) return;
        if (!filename.endsWith('.py') && !filename.endsWith('.txt')) {
            this.addToTerminal('\n❌ Filename must end with .py or .txt\n');
            return;
        }
        
        const code = this.editor.getValue();
        this.currentFile = filename;
        this.updateActiveTab(filename); // Tab aktualisieren
        const chunkSize = 200; // Noch kleinere Chunk-Größe
        const totalChunks = Math.ceil(code.length / chunkSize);

        const progressBarContainer = document.getElementById('uploadProgressBarContainer');
        const progressBar = document.getElementById('uploadProgressBar');
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        progressBarContainer.style.display = 'block';
        
        this.addToTerminal(`\n📤 Uploading ${filename} (${code.length} chars, ${totalChunks} chunks)...\n`);
        this.addToTerminal('⚠️ Please wait while the file is being uploaded...\n');
        
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
                    this.addToTerminal(`\r🔼 Uploaded: ${progress}% (${(i + 1) * chunkSize}/${code.length})`);
                    progressBar.style.width = progress + '%';
                    progressBar.textContent = progress + '%';
                } catch (error) {
                    this.addToTerminal(`\n❌ Error in chunk ${i+1}: ${error.message}\n`);
                    progressBarContainer.style.display = 'none'; // Hide progress bar on error
                    throw error;
                }
            }
            
            // Datei schließen
            await this.sendRawCommand('\x05');
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduziert von 200ms
            await this.sendRawCommand('f.close()\r\n');
            await this.sendRawCommand('\x04');
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduziert von 200ms
            
            this.addToTerminal(`\n✅ ${filename} uploaded successfully!\n`);
            progressBar.textContent = '100%'; // Ensure it shows 100%
            
        } catch (error) {
            this.addToTerminal(`\n❌ Error during upload: ${error.message}\n`);
            progressBarContainer.style.display = 'none'; // Hide progress bar on error
        } finally {
            // Kurze Verzögerung, bevor das Modal geschlossen wird, damit der Benutzer 100% sieht
            setTimeout(() => {
                closeModal();
                // Fortschrittsbalken für das nächste Mal ausblenden (wird auch in showUploadModal gemacht, aber sicher ist sicher)
                progressBarContainer.style.display = 'none';
                progressBar.style.width = '0%';
                progressBar.textContent = '';
            }, 500);
            setTimeout(() => this.listFiles(), 1000); // listFiles nach dem Schließen des Modals
        }
    }

    async loadFile(filename) {
        if (!this.isConnected) return;

        this.addToTerminal('🛑 Stopping any running scripts (before loading file)...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand('\r');   // Enter to clear REPL line
        await new Promise(resolve => setTimeout(resolve, 50));
        
        this.addToTerminal(`\n📥 Loading ${filename}...\n`);
        
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
        this.updateActiveTab(filename); // Tab aktualisieren
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
            this.addToTerminal(`\n⚠️ ${content}\n`); 
            return { content: '', status: 'error', processedLength: processedLength };
        }
        return { content: content, status: 'success', processedLength: processedLength };
    }

    async listFiles() {
        if (!this.isConnected) return;

        this.addToTerminal('🛑 Stopping any running scripts (before listing files)...\n');
        await this.sendRawCommand('\x03'); // Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.sendRawCommand('\r');   // Enter to clear REPL line
        await new Promise(resolve => setTimeout(resolve, 50));
        
        this.addToTerminal('\n📁 Listing files...\n');
        
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

    updateFileBrowser(files) {
        this.deviceFiles = files.map(f => f.name); // Aktuelle Dateinamen speichern
        
        // Prüfen, ob hardware.txt vorhanden ist und eine Datei ist, dann laden/aktualisieren
        const hardwareTxtEntry = files.find(f => f.name === 'hardware.txt');
        if (hardwareTxtEntry && hardwareTxtEntry.size !== 'folder') {
            // Add a delay before fetching hardware.txt
            setTimeout(() => {
                this.fetchHardwareContextFile();
            }, 500);
        } else {
            if (this.hardwareContext) { // hardware.txt not found (as a file), clear context
                this.hardwareContext = '';
                if (hardwareTxtEntry && hardwareTxtEntry.size === 'folder') {
                    this.addToTerminal('\nℹ️ Hardware context (hardware.txt) is a directory and will not be loaded.\n');
                } else {
                    this.addToTerminal('\nℹ️ Hardware context (hardware.txt) not found as a file or removed.\n');
                }
            }
        }

        const fileListElement = document.getElementById('fileList');
        const contextMenu = document.getElementById('fileContextMenu');
        fileListElement.innerHTML = '';
        
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.textContent = `${file.name} (${file.size === 'folder' ? 'Folder' : file.size + ' bytes'})`;
            
            fileItem.addEventListener('click', () => {
                contextMenu.style.display = 'none'; // Kontextmenü ausblenden, falls offen
                this.loadFile(file.name);
            });

            fileItem.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.contextMenuTargetFile = file.name;
                contextMenu.style.left = `${e.clientX}px`;
                contextMenu.style.top = `${e.clientY}px`;
                contextMenu.style.display = 'block';
            });
            fileListElement.appendChild(fileItem);
        });
    }

    addToTerminal(text) {
        const terminal = document.getElementById('terminal');
        terminal.textContent += text;
        terminal.scrollTop = terminal.scrollHeight;
    }

    clearTerminal() {
        document.getElementById('terminal').textContent = '';
    }

    updateUI() {
        const connectBtn = document.getElementById('connectBtn');
        const status = document.getElementById('status');
        // 'newFileBtn' wird hier nicht mehr aufgeführt, da er immer aktiv sein soll.
        // 'uploadBtn' wird separat behandelt (z.B. in newFile oder wenn eine Datei geladen wird).
        const buttonsToToggle = ['runBtn', 'stopBtn', 'listFilesBtn', 'softResetBtn'];
        const terminalInput = document.getElementById('terminalInput');
        
        if (this.isConnected) {
            connectBtn.textContent = 'Disconnect';
            status.textContent = 'Connected';
            status.className = 'status connected';
            buttonsToToggle.forEach(id => document.getElementById(id).disabled = false);
            document.getElementById('uploadBtn').disabled = false; // Generally allow upload when connected
            terminalInput.disabled = false;
        } else {
            connectBtn.textContent = 'Connect to ESP32';
            status.textContent = 'Disconnected';
            status.className = 'status disconnected';
            buttonsToToggle.forEach(id => document.getElementById(id).disabled = true);
            document.getElementById('uploadBtn').disabled = true; // Upload only when connected
            terminalInput.disabled = true;
        }
    }
}

function closeModal() {
    document.getElementById('filenameModal').style.display = 'none';
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
