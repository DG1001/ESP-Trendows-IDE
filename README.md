# MicroPython Web IDE

Eine einfache webbasierte IDE zur Interaktion mit MicroPython-Geräten (wie ESP32) über die Web Serial API.

![Screenshoot](screen.png)

## Funktionen

*   **Verbinden/Trennen**: Stellt eine serielle Verbindung zum MicroPython-Gerät her.
*   **Code-Editor**: Monaco-Editor für die Bearbeitung von Python-Dateien.
*   **REPL-Terminal**: Direkte Interaktion mit der MicroPython REPL.
*   **Datei-Management**:
    *   Dateien auf dem Gerät auflisten.
    *   Dateien vom Editor auf das Gerät hochladen.
    *   Dateien vom Gerät in den Editor laden.
*   **Code-Ausführung**: Ausführen der aktuell im Editor geladenen Datei auf dem Gerät.
*   **Steuerung**:
    *   Laufende Skripte stoppen (Ctrl+C).
    *   Soft Reset (Ctrl+D).
*   **Benutzeroberfläche**:
    *   Tabs für geöffnete Dateien (derzeit nur eine Datei gleichzeitig aktiv im Editor).
    *   Fortschrittsanzeige beim Hochladen von Dateien.
    *   Terminalausgabe löschen.
*   **LLM-Integration (DeepSeek)**:
    *   Eingabefeld für DeepSeek API-Schlüssel (wird im Local Storage des Browsers gespeichert).
    *   Prompt-Eingabe zur Code-Generierung oder -Anpassung direkt im Editor.
    *   System-Prompt zur Generierung von MicroPython-Code für Mikrocontroller.

## Verwendung

1.  Öffnen Sie die `index.html` Datei in einem Webbrowser, der die Web Serial API unterstützt (z.B. Google Chrome, Microsoft Edge).
2.  Klicken Sie auf "Mit ESP32 verbinden" und wählen Sie den seriellen Port Ihres Geräts.
3.  Nutzen Sie die Buttons in der Toolbar, um mit dem Gerät zu interagieren, Dateien zu bearbeiten und Code auszuführen.
4.  **Für die LLM-Funktion**: Geben Sie Ihren DeepSeek API-Schlüssel in das dafür vorgesehene Feld in der Toolbar ein. Geben Sie dann einen Prompt in das Feld unter dem Editor ein und klicken Sie auf "An DeepSeek senden".

## Voraussetzungen

*   Ein MicroPython-fähiges Gerät (z.B. ESP32).
*   Ein Webbrowser, der die Web Serial API unterstützt.
*   USB-Treiber für das Gerät, falls erforderlich.

## Hinweis

Dieses Projekt ist eine einfache Demonstration und dient als Grundlage. Es können Fehler auftreten und es fehlen fortgeschrittene Funktionen einer vollwertigen IDE.
