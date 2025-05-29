# MicroPython Web IDE

A simple web-based IDE for interacting with MicroPython devices (like ESP32) via the Web Serial API.

![Screenshot](screen.png)

## Features

*   **Connect/Disconnect**: Establishes a serial connection to the MicroPython device.
*   **Code Editor**: Monaco editor for editing Python files.
*   **REPL Terminal**: Direct interaction with the MicroPython REPL.
*   **File Management**:
    *   List files on the device.
    *   Upload files from the editor to the device (supports `.py` and `.txt`).
    *   Load files from the device into the editor.
    *   Context menu for files (right-click) to delete and rename.
    *   "New" button to clear the editor and start a new file.
*   **Code Execution**: Execute the currently loaded file in the editor on the device.
*   **Control**:
    *   Stop running scripts (Ctrl+C).
    *   Soft Reset (Ctrl+D).
*   **User Interface**:
    *   Tabs for open files (currently only one file active in the editor at a time).
    *   Progress bar for file uploads.
    *   Clear terminal output.
    *   Resizable splitter between the code editor and REPL terminal.
*   **LLM Integration (DeepSeek)**:
    *   Input field for DeepSeek API key (stored in browser's Local Storage and masked).
    *   Prompt input for code generation or modification.
    *   System prompt to generate MicroPython code for microcontrollers.
    *   Automatic loading of `hardware.txt` (if present as a file on the device) to provide hardware context to the LLM.
    *   **Diff View**: Displays LLM changes compared to the current code.
    *   Ability to accept or reject LLM changes.
    *   Display of token usage (Prompt, Completion, Total) and estimated cost for each LLM request, as well as a total session cost.

## Usage

1.  Open the `index.html` file in a web browser that supports the Web Serial API (e.g., Google Chrome, Microsoft Edge).
2.  Click "Connect to ESP32" and select the serial port of your device.
3.  Use the buttons in the toolbar to interact with the device, edit files, and execute code.
4.  **For the LLM function**:
    *   Enter your DeepSeek API key in the designated field in the toolbar. Token usage and estimated costs will be displayed next to it.
    *   Enter a prompt in the field below the editor and click "Send to DeepSeek".
    *   Review the changes suggested by the LLM in the diff view.
    *   Click "Accept Changes" or "Reject".
5.  **For Hardware Context with LLM**:
    *   Ensure a file named `hardware.txt` exists in the root directory of your MicroPython device.
    *   This file should contain text descriptions of your hardware setup (e.g., "LED connected to GPIO 2", "Sensor on I2C pins X and Y").
    *   The IDE will automatically load this file's content when files are listed and include it in requests to the LLM.

## Prerequisites

*   A MicroPython-enabled device (e.g., ESP32).
*   A web browser that supports the Web Serial API.
*   USB drivers for the device, if required.

## Note

This project is a simple demonstration and serves as a foundation. Errors may occur, and it lacks advanced features of a full-fledged IDE. The project is now structured with separate HTML, CSS (`style.css`), and JavaScript (`script.js`) files.
