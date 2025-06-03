class LLMService {
    constructor(ide) {
        this.ide = ide;
        this.diffEditor = null;
        this.diffEditorContainerDiv = null; // This will be created dynamically
    }

    async callLLMApi() { // Renamed from callDeepSeekApi
        const prompt = this.ide.uiManager.llmPromptInput.value;
        const originalCode = this.ide.editor.getValue();

        // API Key and model checks
        if (this.ide.model.startsWith('deepseek') && !this.ide.deepSeekApiKey) {
            this.ide.uiManager.addToTerminal('\n❌ Please enter a DeepSeek API Key first.\n');
            alert('Please enter a DeepSeek API Key in the model configuration.');
            return;
        }
        if (this.ide.model.startsWith('gpt') && !this.ide.openaiApiKey) {
            this.ide.uiManager.addToTerminal('\n❌ Please enter an OpenAI API Key first.\n');
            alert('Please enter an OpenAI API Key in the model configuration.');
            return;
        }
        if (this.ide.model === 'ollama' && !this.ide.ollamaModel) {
             this.ide.uiManager.addToTerminal('\n❌ Please enter an Ollama model name in the model configuration.\n');
             alert('Please enter an Ollama model name in the model configuration.');
             return;
        }

        if (!prompt) {
            this.ide.uiManager.addToTerminal('\nℹ️ Please enter a prompt.\n');
            alert('Please enter a prompt.');
            return;
        }

        this.ide.uiManager.addToTerminal(`\n🤖 Sending request to ${this.ide.model}...\n`);
        this.ide.uiManager.setLLMButtonState(true);

        const systemPrompt = "You are a helpful assistant that generates MicroPython code for microcontrollers. Ensure the code is valid MicroPython and directly usable on devices like ESP32. Only output the Python code, without any surrounding text or explanations unless explicitly asked.";
        let userPromptContent = `${prompt}\n\nCurrent code in editor (if any, otherwise generate new code):\n\`\`\`python\n${originalCode}\n\`\`\``;

        if (this.ide.hardwareContext) {
            userPromptContent = `Consider the following hardware configuration:\n<hardware_info>\n${this.ide.hardwareContext}\n</hardware_info>\n\n${userPromptContent}`;
            this.ide.uiManager.addToTerminal('\nℹ️ Sending hardware context to LLM.\n');
        }

        let API_URL, apiKey, requestBody, headers;
        if (this.ide.model.startsWith('deepseek')) {
            API_URL = `https://api.deepseek.com/chat/completions`;
            apiKey = this.ide.deepSeekApiKey;
            requestBody = {
                model: this.ide.model,
                messages: [ { role: "system", content: systemPrompt }, { role: "user", content: userPromptContent } ],
                temperature: 0.7,
            };
            headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        } else if (this.ide.model.startsWith('gpt')) {
            API_URL = `https://api.openai.com/v1/chat/completions`;
            apiKey = this.ide.openaiApiKey;
            requestBody = {
                model: this.ide.model,
                messages: [ { role: "system", content: systemPrompt }, { role: "user", content: userPromptContent } ],
                temperature: 0.7,
            };
            headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        } else if (this.ide.model === 'ollama') {
            API_URL = `${this.ide.ollamaUrl}/api/chat`;
            // apiKey = ''; // Ollama doesn't require API key in header typically
            requestBody = {
                model: this.ide.ollamaModel,
                messages: [ { role: "system", content: systemPrompt }, { role: "user", content: userPromptContent } ],
                stream: false,
                options: { temperature: 0.7 }
            };
            headers = { 'Content-Type': 'application/json' };
        } else {
            this.ide.uiManager.addToTerminal('\n❌ Unsupported model selected.\n');
            this.ide.uiManager.setLLMButtonState(false);
            return;
        }

        console.log('LLM API Request Body:', requestBody);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('LLM API Error Response:', errorData);
                this.ide.uiManager.addToTerminal(`\n❌ Error from LLM API: ${response.status} ${response.statusText}\nDetails: ${JSON.stringify(errorData.error?.message || errorData)}\n`);
                throw new Error(`API request failed with status ${response.status}: ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            console.log('LLM API Success Response:', data);

            if (data.usage) {
                const usage = data.usage;
                const promptTokens = usage.prompt_tokens || 0;
                const completionTokens = usage.completion_tokens || 0;
                const totalTokens = usage.total_tokens || 0;
                const costPerMillionInputTokens = 1; 
                const costPerMillionOutputTokens = 2;
                const currentCost = (promptTokens / 1000000) * costPerMillionInputTokens + (completionTokens / 1000000) * costPerMillionOutputTokens;
                this.ide.totalSessionCostUnits += currentCost; // Update on IDE instance
                document.getElementById('promptTokens').textContent = promptTokens;
                document.getElementById('completionTokens').textContent = completionTokens;
                document.getElementById('totalTokens').textContent = totalTokens;
                document.getElementById('lastCost').textContent = currentCost.toFixed(6);
                document.getElementById('totalSessionCost').textContent = this.ide.totalSessionCostUnits.toFixed(6);
            } else {
                document.getElementById('promptTokens').textContent = 'N/A';
                document.getElementById('completionTokens').textContent = 'N/A';
                document.getElementById('totalTokens').textContent = 'N/A';
                document.getElementById('lastCost').textContent = 'N/A';
            }

            let llmOutput;
            if (this.ide.model === 'ollama') {
                if (data.message && data.message.content) {
                    llmOutput = data.message.content;
                } else {
                    console.warn('Ollama response did not contain message.content:', data);
                    this.ide.uiManager.addToTerminal('\n⚠️ Ollama response did not contain message.content.\n');
                    return;
                }
            } else {
                 if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                    llmOutput = data.choices[0].message.content;
                } else {
                    console.warn('API response did not contain expected content:', data);
                    this.ide.uiManager.addToTerminal('\n⚠️ The model did not return code or had an unexpected response structure.\n');
                    return;
                }
            }
           
            const codeBlockMatch = llmOutput.match(/```python\n([\s\S]*?)\n```|```([\s\S]*?)\n```/);
            let newCode = llmOutput; 
            if (codeBlockMatch) {
                newCode = codeBlockMatch[1] || codeBlockMatch[2]; 
            } else {
                 if (llmOutput.toLowerCase().startsWith("python\n")) {
                     newCode = llmOutput.substring("python\n".length);
                 }
            }
            newCode = newCode.trim();

            this.showDiff(originalCode, newCode);
            this.ide.uiManager.addToTerminal('\n✅ Code received from LLM. Please review the changes.\n');

        } catch (error) {
            console.error('Error requesting LLM API:', error);
            this.ide.uiManager.addToTerminal(`\n❌ Error communicating with LLM: ${error.message}\n`);
        } finally {
            this.ide.uiManager.setLLMButtonState(false);
        }
    }

    showDiff(originalCode, newCode) {
        this.ide.uiManager.showLLMDiffViewUI();

        if (this.diffEditorContainerDiv) { // Remove previous if exists
            this.diffEditorContainerDiv.remove();
        }
        if (this.diffEditor) {
            this.diffEditor.dispose();
            this.diffEditor = null;
        }

        this.diffEditorContainerDiv = document.createElement('div');
        this.diffEditorContainerDiv.style.width = '100%';
        this.diffEditorContainerDiv.style.height = '100%';
        this.ide.uiManager.editorContainerDiv.appendChild(this.diffEditorContainerDiv); // Append to the main editor's parent

        this.diffEditor = monaco.editor.createDiffEditor(this.diffEditorContainerDiv, {
            theme: this.ide.currentTheme === 'dark' ? 'vs-dark' : 'vs',
            automaticLayout: true,
            readOnly: false, 
            originalEditable: false,
            renderSideBySide: true
        });

        const originalModel = monaco.editor.createModel(originalCode, 'python');
        const modifiedModel = monaco.editor.createModel(newCode, 'python');

        this.diffEditor.setModel({
            original: originalModel,
            modified: modifiedModel
        });
    }

    hideDiffAndRestoreEditor() {
        if (this.diffEditor) {
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
        this.ide.uiManager.hideLLMDiffViewUI();
    }

    acceptLLMChanges() {
        if (!this.diffEditor) return;
        const acceptedCode = this.diffEditor.getModel().modified.getValue();
        this.ide.editor.setValue(acceptedCode); // Update main editor
        this.ide.files[this.ide.currentFile] = acceptedCode; // Update in-memory store
        this.ide.uiManager.addToTerminal('\n✅ LLM changes accepted.\n');
        this.hideDiffAndRestoreEditor();
    }

    rejectLLMChanges() {
        if (!this.diffEditor) return;
        this.ide.uiManager.addToTerminal('\n❌ LLM changes rejected.\n');
        this.hideDiffAndRestoreEditor();
    }
}
