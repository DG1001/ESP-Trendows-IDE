class UIManager {
    constructor(ide) {
        this.ide = ide; // Reference to the main MicroPythonIDE instance

        // Cache DOM elements
        this.terminal = document.getElementById('terminal');
        this.connectBtn = document.getElementById('connectBtn');
        this.statusIndicator = document.getElementById('status');
        this.buttonsToToggle = ['runBtn', 'stopBtn', 'listFilesBtn', 'softResetBtn']; // uploadBtn handled separately
        this.terminalInput = document.getElementById('terminalInput');
        this.themeToggleBtn = document.getElementById('themeToggleBtn');
        this.sendToLlmBtn = document.getElementById('sendToLlmBtn');
        this.fileListElement = document.getElementById('fileList');
        this.fileContextMenu = document.getElementById('fileContextMenu');
        this.filenameModal = document.getElementById('filenameModal');
        this.filenameInput = document.getElementById('filenameInput');
        this.uploadProgressBarContainer = document.getElementById('uploadProgressBarContainer');
        this.uploadProgressBar = document.getElementById('uploadProgressBar');
        this.llmPromptInput = document.getElementById('llmPromptInput');
        this.acceptLlmChangesBtn = document.getElementById('acceptLlmChangesBtn');
        this.rejectLlmChangesBtn = document.getElementById('rejectLlmChangesBtn');
        this.originalEditorDiv = document.getElementById('editor'); // Main editor div
        this.editorContainerDiv = document.getElementById('editor-container'); // Parent of editor and diff editor

        this.initializeResizer();
        this.initializeContextMenuListeners();
    }

    initializeResizer() {
        const resizer = document.getElementById('resizerVertical');
        const editorPanel = document.getElementById('editorPanel'); // Not directly used for width, but good to have context
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
            
            const minPanelPixelWidth = 150;

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
                if (newTerminalWidth < minPanelPixelWidth) newTerminalWidth = minPanelPixelWidth;
            }

            terminalPanel.style.flexBasis = `${newTerminalWidth}px`;

            // Layout Monaco editors
            if (this.ide.editor && typeof this.ide.editor.layout === 'function') {
                this.ide.editor.layout();
            }
            if (this.ide.llmService && this.ide.llmService.diffEditor && typeof this.ide.llmService.diffEditor.layout === 'function') {
                this.ide.llmService.diffEditor.layout();
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            initialX = e.clientX;
            initialTerminalWidth = terminalPanel.offsetWidth;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
    }

    initializeContextMenuListeners() {
        document.addEventListener('click', (e) => {
            if (!this.fileContextMenu.contains(e.target)) {
                this.fileContextMenu.style.display = 'none';
                this.ide.contextMenuTargetFile = null;
            }
        });

        this.fileContextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (this.ide.contextMenuTargetFile) {
                    switch (action) {
                        case 'delete':
                            this.ide.promptDeleteFile(this.ide.contextMenuTargetFile);
                            break;
                        case 'rename':
                            this.ide.promptRenameFile(this.ide.contextMenuTargetFile);
                            break;
                    }
                }
                this.fileContextMenu.style.display = 'none';
                this.ide.contextMenuTargetFile = null;
            });
        });
    }

    addToTerminal(text) {
        this.terminal.textContent += text;
        this.terminal.scrollTop = this.terminal.scrollHeight;
    }

    clearTerminal() {
        this.terminal.textContent = '';
    }

    updateActiveTab(filename) {
        const activeTab = document.querySelector('.file-tabs .tab.active');
        if (activeTab) {
            activeTab.textContent = filename;
            activeTab.dataset.file = filename;
        }
        // If no active tab, one should be created or an existing one made active.
        // This logic might need to be expanded if tab management becomes more complex.
    }

    setTheme(theme) {
        document.body.classList.toggle('light-mode', theme === 'light');
        localStorage.setItem('theme', theme);
        this.ide.currentTheme = theme; // Sync back to IDE
        
        this.themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
        
        if (window.monaco) {
            monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
        }
        // Ensure diff editor theme is also updated if it exists
        if (this.ide.llmService && this.ide.llmService.diffEditor) {
             monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs'); // This applies to all Monaco instances
        }
    }
    
    toggleTheme() {
        const newTheme = this.ide.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    updateSendToModelButtonText() {
        if (this.sendToLlmBtn) {
            this.sendToLlmBtn.textContent = `Send to ${this.ide.model}`;
        }
    }
    
    updateFileBrowser(files) {
        this.ide.deviceFiles = files.map(f => f.name); // Update deviceFiles in IDE
        
        const hardwareTxtEntry = files.find(f => f.name === 'hardware.txt');
        if (hardwareTxtEntry && hardwareTxtEntry.size !== 'folder') {
            setTimeout(() => {
                this.ide.fetchHardwareContextFile(); // Call method on IDE instance
            }, 500);
        } else {
            if (this.ide.hardwareContext) {
                this.ide.hardwareContext = '';
                if (hardwareTxtEntry && hardwareTxtEntry.size === 'folder') {
                    this.addToTerminal('\nℹ️ Hardware context (hardware.txt) is a directory and will not be loaded.\n');
                } else {
                    this.addToTerminal('\nℹ️ Hardware context (hardware.txt) not found as a file or removed.\n');
                }
            }
        }

        this.fileListElement.innerHTML = '';
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.textContent = `${file.name} (${file.size === 'folder' ? 'Folder' : file.size + ' bytes'})`;
            
            fileItem.addEventListener('click', () => {
                this.fileContextMenu.style.display = 'none';
                this.ide.loadFile(file.name); // Call method on IDE instance
            });

            fileItem.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.ide.contextMenuTargetFile = file.name; // Set on IDE instance
                this.fileContextMenu.style.left = `${e.clientX}px`;
                this.fileContextMenu.style.top = `${e.clientY}px`;
                this.fileContextMenu.style.display = 'block';
            });
            this.fileListElement.appendChild(fileItem);
        });
    }

    updateConnectionStatusUI() { // Renamed from updateUI
        const uploadBtn = document.getElementById('uploadBtn');
        if (this.ide.isConnected) {
            this.connectBtn.textContent = 'Disconnect';
            this.statusIndicator.textContent = 'Connected';
            this.statusIndicator.className = 'status connected';
            this.buttonsToToggle.forEach(id => document.getElementById(id).disabled = false);
            uploadBtn.disabled = !this.ide.currentFile; // Enable if connected and a file is "active"
            this.terminalInput.disabled = false;
        } else {
            this.connectBtn.textContent = 'Connect to ESP32';
            this.statusIndicator.textContent = 'Disconnected';
            this.statusIndicator.className = 'status disconnected';
            this.buttonsToToggle.forEach(id => document.getElementById(id).disabled = true);
            uploadBtn.disabled = true;
            this.terminalInput.disabled = true;
        }
    }

    showFilenameModal() { // Renamed from showUploadModal
        this.filenameModal.style.display = 'block';
        this.filenameInput.value = this.ide.currentFile || 'untitled.py';
        this.filenameInput.focus();
        this.uploadProgressBar.style.width = '0%';
        this.uploadProgressBar.textContent = '';
        this.uploadProgressBarContainer.style.display = 'none';
    }

    closeFilenameModal() {
        this.filenameModal.style.display = 'none';
    }

    updateUploadProgress(percentage, currentBytes, totalBytes) {
        if (percentage === null) { // Error or completion, hide progress bar
            this.uploadProgressBarContainer.style.display = 'none';
            this.uploadProgressBar.style.width = '0%';
            this.uploadProgressBar.textContent = '';
            return;
        }
        this.uploadProgressBarContainer.style.display = 'block';
        this.uploadProgressBar.style.width = percentage + '%';
        if (percentage === 100) {
             this.uploadProgressBar.textContent = '100%';
        } else {
             this.uploadProgressBar.textContent = `${percentage}% (${currentBytes}/${totalBytes})`;
        }
    }

    showLLMDiffViewUI() {
        this.originalEditorDiv.style.display = 'none';
        this.llmPromptInput.style.display = 'none';
        this.sendToLlmBtn.style.display = 'none';
        this.acceptLlmChangesBtn.style.display = 'inline-block';
        this.rejectLlmChangesBtn.style.display = 'inline-block';
    }

    hideLLMDiffViewUI() {
        this.originalEditorDiv.style.display = 'block';
        if (this.ide.editor && typeof this.ide.editor.layout === 'function') {
            this.ide.editor.layout(); 
        }
        this.llmPromptInput.style.display = 'block'; 
        this.llmPromptInput.style.flexGrow = '1'; 
        this.sendToLlmBtn.style.display = 'inline-block';
        this.sendToLlmBtn.disabled = false; 
        this.acceptLlmChangesBtn.style.display = 'none';
        this.rejectLlmChangesBtn.style.display = 'none';
        this.llmPromptInput.value = ''; 
    }

    setLLMButtonState(sending) {
        if (sending) {
            this.sendToLlmBtn.disabled = true;
            this.sendToLlmBtn.innerHTML = '<span class="spinner"></span> Sending...';
        } else {
            this.sendToLlmBtn.disabled = false;
            this.updateSendToModelButtonText(); // Restore original text (e.g., "Send to DeepSeek")
        }
    }
}
