/* Lab 10: new input modality on top of the unmodified Lab 7 visualization.
   All commands activate the SAME buttons/slider handled by ../lab7/lab7.js. */
(function () {
    "use strict";

    // Keep parsing and mapping independent from the input modality. This is
    // also used by the typed-command fallback and the repeatable test suite.
    const SMALL_NUMBERS = {
        one: 1, two: 2, three: 3, four: 4, five: 5,
        six: 6, seven: 7, eight: 8, nine: 9,
        ten: 10, eleven: 11, twelve: 12, thirteen: 13,
        fourteen: 14, fifteen: 15, sixteen: 16,
        seventeen: 17, eighteen: 18, nineteen: 19
    };
    const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };

    function parseNumber(text) {
        const normalized = text.trim().toLowerCase().replace(/-/g, " ");
        if (/^\d+$/.test(normalized)) return Number(normalized);
        if (Object.hasOwn(SMALL_NUMBERS, normalized)) return SMALL_NUMBERS[normalized];
        if (Object.hasOwn(TENS, normalized)) return TENS[normalized];
        const [tens, unit, extra] = normalized.split(/\s+/);
        if (!extra && Object.hasOwn(TENS, tens) && Object.hasOwn(SMALL_NUMBERS, unit)
            && SMALL_NUMBERS[unit] < 10) {
            return TENS[tens] + SMALL_NUMBERS[unit];
        }
        return null;
    }

    function parseCommand(raw) {
        const phrase = String(raw || "")
            .toLowerCase()
            .trim()
            .replace(/[.,!?]+$/g, "")
            .replace(/\s+/g, " ");

        if (/^(play|start|start playback|resume|resume playback|play animation)$/.test(phrase)) {
            return { kind: "play" };
        }
        if (/^(pause|stop|stop playback|pause animation)$/.test(phrase)) {
            return { kind: "pause" };
        }
        if (/^(reset|restart|go to start|go to beginning|start over)$/.test(phrase)) {
            return { kind: "reset" };
        }
        if (/^(next|next day|forward|forward one day|advance one day)$/.test(phrase)) {
            return { kind: "next" };
        }
        if (/^(previous|previous day|last day|back|back one day|go back one day)$/.test(phrase)) {
            return { kind: "previous" };
        }
        const match = phrase.match(/^(?:(?:go|jump|skip|move) to )?(?:day )([a-z\d -]+)$/);
        if (match) {
            const day = parseNumber(match[1]);
            if (day !== null) return { kind: "day", day };
        }
        return null;
    }

    function setupLab10() {
        const $ = id => document.getElementById(id);
        const startButton = $("lab10-start-voice");
        const stopButton = $("lab10-stop-voice");
        const status = $("lab10-voice-status");
        const transcript = $("lab10-transcript");
        const action = $("lab10-action");
        const error = $("lab10-command-error");
        const commandInput = $("lab10-command-input");
        const commandButton = $("lab10-run-command");
        const commandForm = $("lab10-command-form");
        const slider = $("time-slider");
        const voiceConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;

        let recognition = null;
        let listening = false;
        let ready = false;
        let wasCancelled = false;
        let hadVoiceError = false;

        function reportError(message) {
            error.hidden = false;
            error.textContent = message;
        }
        function clearError() {
            error.hidden = true;
            error.textContent = "";
        }
        function updateButtons() {
            startButton.disabled = !ready || !voiceConstructor || listening;
            stopButton.disabled = !listening;
            commandInput.disabled = !ready;
            commandButton.disabled = !ready;
            $("lab10-previous").disabled = !ready;
            $("lab10-next").disabled = !ready;
        }
        function visualizationReady() {
            // Lab 7 sets the date label after loading BOTH real CSV files and
            // initializing the SVG network, timeline, and their event handlers.
            return /Day 1\s*\|/.test($("date-label").textContent)
                && Boolean(document.querySelector("#lab7-network-svg .lab7-node"));
        }
        function setReady() {
            if (ready || !visualizationReady()) return;
            ready = true;
            status.textContent = voiceConstructor
                ? "Ready — microphone off"
                : "Speech recognition unavailable in this browser";
            if (!voiceConstructor) {
                reportError("Voice input isn't supported here. Use the Play/Pause/Reset buttons, slider, or typed commands instead. For voice input, try a browser with Web Speech API support over HTTPS or localhost.");
            }
            updateButtons();
        }

        // The existing Lab 7 code owns the visualization state. The slider
        // reflects the *displayed* day, so all modalities stay synchronized.
        function navigateTo(day) {
            slider.value = String(day);
            slider.dispatchEvent(new Event("input", { bubbles: true }));
        }
        function execute(parsed) {
            if (!ready) return { ok: false, message: "The CSV data is still loading." };
            const day = Number(slider.value);
            const min = Number(slider.min);
            const max = Number(slider.max);

            switch (parsed.kind) {
                case "play":
                    $("play-btn").click();
                    return { ok: true, message: "Playback started" };
                case "pause":
                    $("pause-btn").click();
                    return { ok: true, message: "Playback paused" };
                case "reset":
                    $("reset-btn").click();
                    return { ok: true, message: "Reset to Day 1" };
                case "next": {
                    const next = Math.min(day + 1, max);
                    navigateTo(next);
                    return { ok: true, message: next === day
                        ? `Already at the final day (Day ${max})`
                        : `Showing Day ${next}` };
                }
                case "previous": {
                    const previous = Math.max(day - 1, min);
                    navigateTo(previous);
                    return { ok: true, message: previous === day
                        ? `Already at the first day (Day ${min})`
                        : `Showing Day ${previous}` };
                }
                case "day":
                    if (!Number.isInteger(parsed.day) || parsed.day < min || parsed.day > max) {
                        return { ok: false, message: `Day must be between ${min} and ${max}.` };
                    }
                    navigateTo(parsed.day);
                    return { ok: true, message: `Showing Day ${parsed.day}` };
                default:
                    return { ok: false, message: "Unknown action." };
            }
        }

        function processCommand(phrase, source) {
            transcript.textContent = (source === "voice" ? "Heard: " : "Entered: ") + phrase;
            clearError();
            const parsed = parseCommand(phrase);
            if (!parsed) {
                action.textContent = "No action taken";
                reportError("Command not recognized. Try: play, pause, next day, previous day, go to day 30, or reset.");
                return;
            }
            const result = execute(parsed);
            action.textContent = result.ok ? result.message : "No action taken";
            if (!result.ok) reportError(result.message);
        }

        $("lab10-previous").addEventListener("click", () => {
            const result = execute({ kind: "previous" });
            action.textContent = result.message;
        });
        $("lab10-next").addEventListener("click", () => {
            const result = execute({ kind: "next" });
            action.textContent = result.message;
        });
        commandForm.addEventListener("submit", event => {
            event.preventDefault();
            const phrase = commandInput.value.trim();
            if (phrase) processCommand(phrase, "typed");
        });

        if (voiceConstructor) {
            recognition = new voiceConstructor();
            recognition.lang = "en-US";
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                listening = true;
                status.textContent = "Listening… say one command";
                updateButtons();
            };
            recognition.onresult = event => {
                const phrase = event.results[0][0].transcript.trim();
                if (!wasCancelled) processCommand(phrase, "voice");
            };
            recognition.onerror = event => {
                hadVoiceError = true;
                const detail = {
                    "not-allowed": "Microphone permission was denied. Use conventional or typed controls, or change browser permissions.",
                    "service-not-allowed": "The browser's speech service is unavailable or blocked.",
                    "audio-capture": "No working microphone was found.",
                    "no-speech": "No speech was detected. Try again or type the command.",
                    "network": "Speech recognition needs network access in this browser; use the fallback controls.",
                    "language-not-supported": "English speech recognition is unavailable in this browser."
                }[event.error] || `Speech recognition error: ${event.error || "unknown error"}.`;
                reportError(detail);
                status.textContent = "Speech recognition failed — microphone off";
            };
            recognition.onend = () => {
                listening = false;
                if (wasCancelled) {
                    status.textContent = "Microphone stopped";
                } else if (!hadVoiceError) {
                    status.textContent = "Ready — microphone off (click Start listening again)";
                }
                updateButtons();
            };
        }

        startButton.addEventListener("click", () => {
            if (!ready || !recognition || listening) return;
            clearError();
            wasCancelled = false;
            hadVoiceError = false;
            status.textContent = "Requesting microphone…";
            try {
                // Only a direct user click invokes recognition.start().
                recognition.start();
                listening = true;
                updateButtons();
            } catch (err) {
                listening = false;
                status.textContent = "Could not start microphone";
                reportError("The browser could not start speech recognition. Try again or use the fallback controls.");
                updateButtons();
            }
        });
        stopButton.addEventListener("click", () => {
            if (!recognition || !listening) return;
            wasCancelled = true;
            status.textContent = "Stopping microphone…";
            recognition.abort();
        });

        updateButtons();
        setReady();
        if (!ready) {
            const observer = new MutationObserver(() => {
                if (visualizationReady()) {
                    observer.disconnect();
                    setReady();
                }
            });
            observer.observe($("date-label"), { childList: true, subtree: true, characterData: true });
        }
    }

    window.lab10ParseCommand = parseCommand;
    document.addEventListener("DOMContentLoaded", setupLab10);
})();
