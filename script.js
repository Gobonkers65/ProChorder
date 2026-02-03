/* * =========================================
 * JAVASCRIPT-FIL FÖR PROCHORDER
 * =========================================
 */

const SHARED_SONG_LIST_URL =
  "https://raw.githubusercontent.com/Gobonkers65/ProChorder/main/songs-backup.json";

class StableChordEditor {
  static STORAGE_KEYS = {
    PROJECTS: "stableProjects",
    LAST_PROJECT: "lastProject",
    DARK_MODE: "darkMode",
    PROJECT_ORDER: "projectOrder",
  };

  /**
   * Hanterar automatisk omvandling av textlänkar till klickbara <a>-taggar.
   */
  handleAutoLinking(e) {
    if (e.key !== " " && e.key !== "Enter") return;
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;

    const textContent = container.textContent.substring(0, range.startOffset);
    const customLinkRegex = /\[\[(.+?)(?:\|(.*?))?\]\]\s*$/;
    const autoLinkRegex = /(?:^|\s)((?:https?:\/\/\S+|(?:www|ftp)\.\S+))\s*$/;

    const customMatch = textContent.match(customLinkRegex);
    const autoMatch = !customMatch && textContent.match(autoLinkRegex);

    let url, linkText, startIndex, fullMatchLength;

    if (customMatch) {
      url = customMatch[1].trim();
      linkText = (customMatch[2] || "").trim() || url;
      const fullMatchString = customMatch[0].trimEnd();
      startIndex = textContent.lastIndexOf(fullMatchString);
      fullMatchLength = fullMatchString.length;
    } else if (autoMatch) {
      url = autoMatch[1];
      linkText = url;
      startIndex = textContent.lastIndexOf(url);
      fullMatchLength = url.length;
    } else {
      return;
    }

    if (!url || startIndex === -1) return;

    e.preventDefault();
    const replaceRange = document.createRange();
    replaceRange.setStart(container, startIndex);
    replaceRange.setEnd(container, startIndex + fullMatchLength);
    replaceRange.deleteContents();

    const link = document.createElement("a");
    link.href =
      url.startsWith("http") || url.startsWith("//") ? url : `http://${url}`;
    link.textContent = linkText;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    replaceRange.insertNode(link);
    range.setStartAfter(link);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    this.recordHistoryDebounced();
  }

  // --- TUNER FUNKTIONALITET ---
  openTunerModal() {
    this.tunerModal.classList.add("visible");
    this.startTuner();
  }

  closeTunerModal() {
    this.tunerModal.classList.remove("visible");
    this.stopTuner();
  }

  async startTuner() {
    if (this.tunerIframe) {
      this.tunerIframe.src = "tuner/index.html";
    }
  }

  stopTuner() {
    if (this.tunerIframe) {
      this.tunerIframe.src = "about:blank";
    }
  }

  constructor(editorId) {
    this.editor = document.getElementById(editorId);
    this.editMode = "chord";
    this.draggedChord = null;
    this.scrollInterval = null;
    this.scrollSpeed = 0.2;
    this.history = [];
    this.historyIndex = -1;
    this.debounceTimer = null;
    this.currentlyEditing = null;

    this.musicalNotes = [
      "A",
      "A#",
      "B",
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
    ];
    this.historyMax = 100;

    // --- METRONOM SETUP ---
    this.audioContext = null;
    this.metronomeRunning = false;
    this.metronomeInterval = null;
    this.tempo = 120; // BPM
    this.scheduleAheadTime = 0.1;
    this.nextNoteTime = 0.0;
    this.lookahead = 25.0;

    // --- SCROLL PARAMETRAR ---
    this.MIN_MOVE_SPEED = 0.02;
    this.MAX_MOVE_SPEED = 0.5;

    // --- RADIAL BUILDER DATA ---
    this.radialTypes = [
      "",
      "m",
      "6",
      "m6",
      "7",
      "m7",
      "9",
      "m9",
      "11",
      "m11",
      "maj7",
      "sus4",
      "dim",
      "aug",
    ];
    this.radialBassNotes = [
      "(root)",
      "A",
      "A#",
      "B",
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
    ];
    this.radialState = {
      root: "C",
      type: "",
      base: "(root)",
      rootIndex: 3,
      typeIndex: 0,
      baseIndex: 0,
    };

    this.selectElements();
    this.wakeLock = null;
    this.observer = new MutationObserver(this.handleMutations.bind(this));
    this.init();
  }

  selectElements() {
    // Toppmeny & Navigering
    this.hamburgerBtn = document.getElementById("hamburger-btn");
    this.sideMenu = document.getElementById("side-menu");
    this.menuOverlay = document.getElementById("menu-overlay");
    this.mainToggleEditModeBtn = document.getElementById(
      "main-toggle-edit-mode-btn"
    );
    this.btnShowHelp = document.getElementById("btn-show-help");
    this.btnToggleDarkMode = document.getElementById("btn-toggle-dark-mode");

    // Projekt/Sång väljare
    this.projectSelectorBtn = document.getElementById("project-selector-btn");
    this.currentProjectName = document.getElementById("current-project-name");
    this.projectList = document.getElementById("project-list");
    this.projectDropdownMenu = document.getElementById("project-dropdown-menu");
    this.btnNewProject = document.getElementById("btn-new-project");
    this.btnSaveCopy = document.getElementById("btn-save-copy");

    // Sång-metadata
    this.titleInput = document.getElementById("song-title");
    this.authorInput = document.getElementById("song-author");

    // Live-läge & Metronom
    this.btnToggleScrollMode = document.getElementById(
      "btn-toggle-scroll-mode"
    );
    this.btnToggleMetronome = document.getElementById("btn-toggle-metronome");
    this.metronomeBpmInput = document.getElementById("metronome-bpm-input");
    this.btnBpmUp = document.getElementById("btn-bpm-up");
    this.btnBpmDown = document.getElementById("btn-bpm-down");

    // Inställningar
    this.fontSizeSelector = document.getElementById("font-size-selector");

    // Sidomeny Grid-knappar
    this.tunerIframe = document.getElementById("tuner-iframe");
    this.btnOpenTunerModal = document.getElementById("btn-open-tuner-modal");
    this.btnOpenTransposeModal = document.getElementById(
      "btn-open-transpose-modal"
    );
    this.btnToggleChordMode = document.getElementById("btn-toggle-chord-mode");
    this.chordModeIconText = document.getElementById("chord-mode-icon-text");
    this.btnOpenSectionsModal = document.getElementById(
      "btn-open-sections-modal"
    );
    this.btnOpenExportModal = document.getElementById("btn-open-export-modal");
    this.btnOpenImportModal = document.getElementById("btn-open-import-modal");

    // Spara/Radera
    this.btnSaveProject = document.getElementById("btn-save-project");
    this.btnDeleteProject = document.getElementById("btn-delete-project");
    this.btnDeleteAllProjects = document.getElementById(
      "btn-delete-all-projects"
    );

    // Modaler
    this.tunerModal = document.getElementById("tuner-modal");
    this.tunerBtnClose = document.getElementById("tuner-btn-close");
    this.tunerDisplay = document.getElementById("tuner-display");

    this.transposeModal = document.getElementById("transpose-modal");
    this.transposeModalClose = document.getElementById("transpose-modal-close");
    this.btnTransposeUp = document.getElementById("btn-transpose-up");
    this.btnTransposeDown = document.getElementById("btn-transpose-down");

    this.sectionsModal = document.getElementById("sections-modal");
    this.sectionsModalClose = document.getElementById("sections-modal-close");
    this.sectionTypeSelect = document.getElementById(
      "section-type-select-menu"
    );
    this.btnInsertSection = document.getElementById("btn-insert-section");

    this.exportModal = document.getElementById("export-modal");
    this.exportModalClose = document.getElementById("export-modal-close");
    this.btnExportPdf = document.getElementById("btn-export-pdf");
    this.btnExportTxt = document.getElementById("btn-export-txt");
    this.btnExportZip = document.getElementById("btn-export-zip");
    this.btnExportJson = document.getElementById("btn-export-json");
    this.btnExportAllJson = document.getElementById("btn-export-all-json");

    this.importModal = document.getElementById("import-modal");
    this.importModalClose = document.getElementById("import-modal-close");
    this.btnImportJson = document.getElementById("btn-import-json");
    this.btnImportUrl = document.getElementById("btn-import-url");
    this.fileImport = document.getElementById("file-import");

    // Ackord-byggare (Radial)
    this.chordEditorModal = document.getElementById("chord-editor-modal");
    this.modalBtnRemove = document.getElementById("modal-btn-remove");
    this.modalBtnClose = document.getElementById("modal-btn-close");

    // Scroll-kontroller
    this.scrollControls = document.getElementById("scroll-controls");
    this.scrollBtnPlayPause = document.getElementById("scroll-btn-play-pause");
    this.scrollDurationText = document.getElementById("scroll-duration-text");
    this.scrollBtnExit = document.getElementById("scroll-btn-exit");
    this.scrollSpeedSlider = document.getElementById("scroll-speed-slider");
    this.scrollDurationMinutesInput = document.getElementById(
      "scroll-duration-minutes"
    );
    this.scrollDurationSecondsInput = document.getElementById(
      "scroll-duration-seconds"
    );
    this.scrollBtnPrev = document.getElementById("scroll-btn-prev");
    this.scrollBtnNext = document.getElementById("scroll-btn-next");

    // Övrigt
    this.editor = document.getElementById("editor");
    this.dropIndicator = document.createElement("div");
    this.dropIndicator.id = "drop-indicator";
    document.body.appendChild(this.dropIndicator);
    this.floatingLiveBtn = document.getElementById("floating-live-btn");
  }

  init() {
    this.populateSelects();
    this.applySavedTheme();
    this.setupEventListeners();
    this.updateModeUI();
    this.updateDurationFromSpeed();
    this.startObserver();
    this.loadLastProject();
  }

  populateSelects() {
    const sectionData = [
      "Intro",
      "Verse",
      "Chorus",
      "Stick",
      "Bridge",
      "Solo",
      "Outro",
      "Dig",
    ];
    const populate = (sel, options, placeholder) => {
      if (!sel) return;
      sel.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
      options.forEach(
        (o) => (sel.innerHTML += `<option value="${o}">${o}</option>`)
      );
    };
    populate(this.sectionTypeSelect, sectionData, "Välj sektion...");

    // Fontstorlekar
    const sizes = [14, 16, 18, 20, 22, 24, 28, 32];
    if (this.fontSizeSelector) {
      this.fontSizeSelector.innerHTML = "";
      sizes.forEach((size) => {
        const option = document.createElement("option");
        option.value = size;
        option.textContent = size + " px";
        this.fontSizeSelector.appendChild(option);
      });
    }
  }

  applySavedTheme() {
    const isDarkMode =
      localStorage.getItem(StableChordEditor.STORAGE_KEYS.DARK_MODE) ===
      "enabled";

    // Ikoner för Dark/Light mode
    const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="icon-medium"><path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM5.404 15.657a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 101.06 1.06l1.06-1.06zM17 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM4.25 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM15.657 14.596a.75.75 0 101.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 4.343a.75.75 0 101.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06z"/></svg>`;
    const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="icon-medium"><path fill-rule="evenodd" d="M7.455 2.104a.75.75 0 00-.98 1.126 8.5 8.5 0 008.62 8.62.75.75 0 001.127-.98 10 10 0 01-9.767-8.766z" clip-rule="evenodd" /></svg>`;

    if (isDarkMode) {
      document.body.classList.add("dark-mode");
      this.btnToggleDarkMode.innerHTML = moonIcon;
    } else {
      document.body.classList.remove("dark-mode");
      this.btnToggleDarkMode.innerHTML = sunIcon;
    }
  }

  startObserver() {
    this.observer.observe(this.editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  stopObserver() {
    this.observer.disconnect();
  }

  toggleEditMode() {
    this.editMode = this.editMode === "chord" ? "text" : "chord";
    this.updateModeUI();
  }

  // --- WAKE LOCK (Håll skärmen vaken) ---
  async acquireWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
      } catch (err) {
        console.error(
          `Kunde inte skaffa skärmlås: ${err.name}, ${err.message}`
        );
      }
    } else {
      console.warn("Wake Lock API stöds inte i denna webbläsare.");
    }
  }

  async releaseWakeLock() {
    if (this.wakeLock !== null) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {
        console.error(
          `Kunde inte släppa skärmlås: ${err.name}, ${err.message}`
        );
      }
    }
  }

  handleVisibilityChange() {
    if (
      this.editMode === "scroll" &&
      document.visibilityState === "visible" &&
      !this.wakeLock
    ) {
      this.acquireWakeLock();
    }
  }

  setupEventListeners() {
    // --- TOPP MENY & NAVIGATION ---
    const toggleMenu = () => {
      this.sideMenu.classList.toggle("is-closed");
      this.menuOverlay.classList.toggle("is-closed");
    };
    this.hamburgerBtn.addEventListener("click", toggleMenu);
    this.menuOverlay.addEventListener("click", toggleMenu);

    this.btnToggleChordMode.addEventListener("click", () =>
      this.toggleEditMode()
    );
    this.mainToggleEditModeBtn.addEventListener("click", () =>
      this.toggleEditMode()
    );

    this.btnShowHelp.addEventListener("click", () => {
      toggleMenu();
      window.open("https://gobonkers65.github.io/ProChorder/help", "_blank");
    });
    this.btnToggleDarkMode.addEventListener("click", () =>
      this.toggleDarkMode()
    );

    // --- LIVE LÄGE ---
    this.floatingLiveBtn.addEventListener("click", () => {
      this.toggleScrollMode(true, true);
    });
    this.btnToggleScrollMode.addEventListener("click", () => {
      this.toggleScrollMode(true);
      if (!this.sideMenu.classList.contains("is-closed")) {
        toggleMenu();
      }
    });
    this.scrollBtnExit.addEventListener("click", () =>
      this.toggleScrollMode(false)
    );
    this.scrollBtnPlayPause.addEventListener("click", () =>
      this.toggleScrolling()
    );

    this.scrollSpeedSlider.addEventListener("input", (e) => {
      this.setScrollSpeed(e.target.value);
      this.updateDurationFromSpeed();
    });

    const durationChangeHandler = () => {
      const totalSeconds = this.getTotalDurationSeconds();
      if (totalSeconds > 0) this.setScrollForDuration(totalSeconds);
    };
    this.scrollDurationMinutesInput.addEventListener(
      "input",
      durationChangeHandler
    );
    this.scrollDurationSecondsInput.addEventListener(
      "input",
      durationChangeHandler
    );

    this.scrollBtnPrev.addEventListener("click", () =>
      this.loadProjectByIndexDelta(-1)
    );
    this.scrollBtnNext.addEventListener("click", () =>
      this.loadProjectByIndexDelta(1)
    );

    // --- METRONOM ---
    this.btnToggleMetronome.addEventListener("click", () =>
      this.toggleMetronome()
    );

    this.metronomeBpmInput.addEventListener("input", (e) => {
      let newTempo = parseInt(e.target.value);
      const min = parseInt(e.target.min) || 40;
      const max = parseInt(e.target.max) || 300;

      if (newTempo >= min && newTempo <= max) {
        this.tempo = newTempo;
        if (this.metronomeRunning && this.audioContext?.state === "suspended") {
          this.audioContext.resume();
        }
      }
    });

    this.metronomeBpmInput.addEventListener("blur", (e) => {
      if (!e.target.value || e.target.value < 40) {
        e.target.value = this.tempo;
      }
    });

    const updateBpm = (delta) => {
      const min = parseInt(this.metronomeBpmInput.min) || 40;
      const max = parseInt(this.metronomeBpmInput.max) || 300;
      let newTempo = this.tempo + delta;
      if (newTempo >= min && newTempo <= max) {
        this.tempo = newTempo;
        this.metronomeBpmInput.value = newTempo;
      }
    };
    this.btnBpmUp.addEventListener("click", () => updateBpm(1));
    this.btnBpmDown.addEventListener("click", () => updateBpm(-1));

    // --- PROJEKT HANTERING ---
    this.projectList.addEventListener("change", () => {
      const name = this.projectList.value || "";
      if (name) this.loadProject(name);
    });
    this.projectSelectorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleProjectMenu();
    });

    this.titleInput.addEventListener("blur", async () => {
      const oldName = this.projectList.value;
      const newName = this.titleInput.value.trim();
      if (oldName && newName && oldName !== newName) {
        const confirmed = await this.showCustomConfirm(
          `Vill du byta namn på "${oldName}" till "${newName}"?`
        );
        if (confirmed) {
          this.renameProject(oldName, newName);
        } else {
          this.titleInput.value = oldName;
        }
      }
    });

    this.btnNewProject.addEventListener("click", async () => {
      toggleMenu();
      if (
        await this.showCustomConfirm(
          "Är du säker? Osparde ändringar kommer att gå förlorade."
        )
      ) {
        this.createNewProject();
      }
    });

    this.btnSaveCopy.addEventListener("click", async () => {
      toggleMenu();
      this.saveCopy();
    });

    this.btnSaveProject.addEventListener("click", () => {
      const name = this.titleInput.value.trim();
      if (!name) return this.showCustomAlert("Namnge din sång först.");
      this.saveProject(name);
    });

    this.btnDeleteProject.addEventListener("click", async () => {
      toggleMenu();
      const name = this.projectList.value;
      if (!name) return this.showCustomAlert("Välj ett projekt att ta bort.");
      if (
        await this.showCustomConfirm(
          `Ta bort projektet "${name}"? Detta kan inte ångras!`
        )
      ) {
        this.deleteProject(name);
      }
    });

    this.btnDeleteAllProjects.addEventListener("click", () => {
      toggleMenu();
      this.deleteAllProjects();
    });

    // --- MODAL HANTERING ---
    const openModal = (modal) => modal.classList.add("visible");
    const closeModal = (modal) => modal.classList.remove("visible");

    // Tuner
    this.btnOpenTunerModal.addEventListener("click", () => {
      this.openTunerModal();
      toggleMenu();
    });
    this.tunerBtnClose.addEventListener("click", () => this.closeTunerModal());

    // Transpose
    this.btnOpenTransposeModal.addEventListener("click", () => {
      openModal(this.transposeModal);
      toggleMenu();
    });
    this.transposeModalClose.addEventListener("click", () =>
      closeModal(this.transposeModal)
    );
    this.btnTransposeUp.addEventListener("click", () => this.transpose(1));
    this.btnTransposeDown.addEventListener("click", () => this.transpose(-1));

    // Sektioner
    this.btnOpenSectionsModal.addEventListener("click", () => {
      openModal(this.sectionsModal);
      toggleMenu();
    });
    this.sectionsModalClose.addEventListener("click", () =>
      closeModal(this.sectionsModal)
    );
    this.btnInsertSection.addEventListener("click", () => {
      if (this.editMode === "scroll") return;
      const sectionType = this.sectionTypeSelect.value;
      if (sectionType) {
        this.insertSectionMarker(sectionType);
        this.recordHistoryDebounced();
        this.sectionTypeSelect.selectedIndex = 0;
      } else {
        this.showCustomAlert("Välj en sektionstyp");
      }
    });

    // Export/Import
    this.btnOpenExportModal.addEventListener("click", () => {
      openModal(this.exportModal);
      toggleMenu();
    });
    this.exportModalClose.addEventListener("click", () =>
      closeModal(this.exportModal)
    );
    this.btnOpenImportModal.addEventListener("click", () => {
      openModal(this.importModal);
      toggleMenu();
    });
    this.importModalClose.addEventListener("click", () =>
      closeModal(this.importModal)
    );

    this.btnExportPdf.addEventListener("click", () => this.exportPdf());
    this.btnExportTxt.addEventListener("click", () => this.exportTxt());
    this.btnExportZip.addEventListener("click", () => this.exportAllAsZip());
    this.btnExportJson.addEventListener("click", () => this.exportJson());
    this.btnExportAllJson.addEventListener("click", () => this.exportAllJson());

    this.btnImportJson.addEventListener("click", () => this.fileImport.click());
    this.fileImport.addEventListener("change", (e) =>
      this.importJsonFromFile(e.target.files[0])
    );
    this.btnImportUrl.addEventListener("click", async () => {
      const confirmed = await this.showCustomConfirm(
        "Ladda låtlista från GitHub? Lokala låtar med samma titel skrivs över."
      );
      if (confirmed) this.importJsonFromUrl(SHARED_SONG_LIST_URL);
    });

    // --- EDITOR HANTERING ---
    this.fontSizeSelector.addEventListener("change", (e) => {
      this.editor.style.fontSize = e.target.value + "px";
      this.recordHistoryDebounced();
    });

    this.editor.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (link && link.href) {
        e.preventDefault();
        window.open(link.href, "_blank");
        return;
      }
      if (this.editMode !== "chord") return;
      const clickedChord = e.target.closest(".chord");
      if (clickedChord) {
        this.openChordModal(clickedChord, null);
      } else {
        const range = this.getWordAtCursor(e);
        if (range) this.openChordModal(null, range);
      }
    });

    this.editor.addEventListener("keydown", this.handleKeyDown.bind(this));

    // Smart Paste
    this.editor.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData(
        "text/plain"
      );
      const processedText = this.processSmartPaste(text);
      document.execCommand("insertText", false, processedText);
    });

    this.editor.addEventListener("input", () => this.recordHistoryDebounced());
    this.editor.addEventListener("keyup", this.handleAutoLinking.bind(this));

    // Drag & Drop
    this.editor.addEventListener("dragover", this.handleDragOver.bind(this));
    this.editor.addEventListener(
      "dragleave",
      () => (this.dropIndicator.style.display = "none")
    );
    this.editor.addEventListener("drop", this.handleDrop.bind(this));

    // --- ACKORD MODAL ---
    this.modalBtnClose.addEventListener("click", () => this.closeChordModal());
    this.modalBtnRemove.addEventListener("click", () => this.removeChord());

    document.getElementById("center-button").addEventListener("click", () => {
      const finalChord = document.getElementById(
        "current-chord-display"
      ).textContent;
      document.getElementById("center-button").classList.add("confirmed");
      document.getElementById("action-text").textContent = `VALD`;
      this.applyChord(finalChord);
      setTimeout(() => {
        if (document.getElementById("action-text")) {
          document.getElementById("action-text").textContent = `VÄLJ`;
          document
            .getElementById("center-button")
            .classList.remove("confirmed");
        }
      }, 800);
    });

    // --- TANGENTBORDSKORTKOMMANDON ---
    document.addEventListener("keydown", (e) => {
      if (this.editMode === "scroll") {
        if (e.key === " ") {
          e.preventDefault();
          this.toggleScrolling();
        }
        if (e.key === "Escape") this.toggleScrollMode(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        this.undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.shiftKey && e.key === "Z"))
      ) {
        e.preventDefault();
        this.redo();
      }
    });

    document.addEventListener("click", (e) => this.handleOutsideClick(e));
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );
  }

  // --- METRONOM LOGIK ---
  toggleMetronome() {
    if (!this.metronomeRunning) {
      this.startMetronome();
    } else {
      this.stopMetronome();
    }
  }

  async startMetronome() {
    if (this.metronomeRunning) return;

    if (!this.audioContext) {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.metronomeRunning = true;
    this.nextNoteTime = this.audioContext.currentTime;
    this.metronomeInterval = setInterval(
      () => this.scheduler(),
      this.lookahead
    );
    this.btnToggleMetronome.classList.add("is-active");
  }

  stopMetronome() {
    if (!this.metronomeRunning) return;

    clearInterval(this.metronomeInterval);
    this.metronomeRunning = false;
    this.btnToggleMetronome.classList.remove("is-active");
  }

  scheduler() {
    while (
      this.nextNoteTime <
      this.audioContext.currentTime + this.scheduleAheadTime
    ) {
      this.playMetronomeClick(this.nextNoteTime);
      let secondsPerBeat = 60.0 / this.tempo;
      this.nextNoteTime += secondsPerBeat;
    }
  }

  playMetronomeClick(time) {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(880, time);
    gainNode.gain.setValueAtTime(1, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    oscillator.start(time);
    oscillator.stop(time + 0.05);
  }

  // --- PROJEKT MENY ---
  toggleProjectMenu() {
    const isOpen = this.projectDropdownMenu.classList.toggle("is-open");
    this.projectSelectorBtn.classList.toggle("is-active", isOpen);
  }

  closeProjectMenu() {
    this.projectDropdownMenu.classList.remove("is-open");
    this.projectSelectorBtn.classList.remove("is-active");
  }

  handleOutsideClick(e) {
    if (
      this.projectDropdownMenu &&
      !this.projectSelectorBtn.contains(e.target) &&
      !this.projectDropdownMenu.contains(e.target)
    ) {
      this.closeProjectMenu();
    }

    const overlay = e.target.closest(".custom-dialog-overlay");
    if (overlay && e.target === overlay) {
      overlay.classList.remove("visible");
    }
  }

  selectProject(name) {
    this.loadProject(name);
    this.closeProjectMenu();
  }

  updateModeUI() {
    if (this.editMode === "chord") {
      if (this.chordModeIconText) this.chordModeIconText.textContent = "ON";
    } else {
      if (this.chordModeIconText) this.chordModeIconText.textContent = "OFF";
    }

    if (this.mainToggleEditModeBtn) {
      this.mainToggleEditModeBtn.classList.toggle(
        "is-active",
        this.editMode === "chord"
      );
      this.mainToggleEditModeBtn.title =
        this.editMode === "chord"
          ? "Ackordläge PÅ (Klicka för Textläge)"
          : "Ackordläge AV (Klicka för Ackordläge)";
    }

    if (this.editMode === "chord") {
      this.editor.classList.remove("text-mode");
      this.editor.setAttribute("inputmode", "none");
    } else if (this.editMode === "text") {
      this.editor.classList.add("text-mode");
      this.editor.setAttribute("inputmode", "text");
    }
  }

  toggleScrollMode(enter, startImmediately = false) {
    if (enter) {
      this.previousEditMode = this.editMode;

      if (!this.editor.textContent.trim()) {
        this.showCustomAlert("Lägg till text innan du startar Live Mode.");
        return;
      }
      this.acquireWakeLock();
      this.editMode = "scroll";
      this.editor.contentEditable = false;
      document.body.classList.add("scroll-mode-active");

      setTimeout(() => {
        const scrollHeight =
          this.editor.scrollHeight - this.editor.clientHeight;
        if (scrollHeight <= 0) {
          this.showCustomAlert("Texten är för kort för att scrolla.");
          this.toggleScrollMode(false);
          return;
        }
        if (startImmediately) {
          this.startScrolling();
        }
      }, 100);
    } else {
      this.releaseWakeLock();
      this.stopScrolling();

      this.editMode = this.previousEditMode || "chord";

      this.editor.contentEditable = true;
      document.body.classList.remove("scroll-mode-active");
      this.updateModeUI();
    }
  }

  centerChordHandles() {
    this.editor.querySelectorAll(".chord").forEach((chordEl) => {
      const handle = chordEl.querySelector(".chord-handle");
      const text = chordEl.querySelector(".chord-text");
      if (handle && text) {
        const textWidth = text.offsetWidth;
        handle.style.left = `${textWidth / 2}px`;
      }
    });
  }

  // --- RADIAL BUILDER LOGIK ---
  positionItems(layerId, items, currentIndex, radiusMultiplier = 1) {
    const layer = document.getElementById(layerId);
    if (!layer) return;
    layer.innerHTML = "";
    const count = items.length;
    const radius = (layer.offsetWidth / 2) * radiusMultiplier;

    items.forEach((item, index) => {
      const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const div = document.createElement("div");
      div.className = "layer-item";
      let textToShow = item;
      if (item === "(root)") textToShow = "Ø";
      else if (item === "") textToShow = "Ø";

      div.textContent = textToShow;
      div.style.left = `${50 + (x / layer.offsetWidth) * 100}%`;
      div.style.top = `${50 + (y / layer.offsetHeight) * 100}%`;
      div.style.transform = "translate(-50%, -50%)";

      if (index === currentIndex) {
        div.classList.add("active");
      }
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        this.updateRadialSelection(layerId, index);
      });
      layer.appendChild(div);
    });
  }

  updateRadialSelection(layerId, newIndex) {
    if (layerId === "inner-layer") {
      this.radialState.rootIndex = newIndex;
      this.radialState.root = this.musicalNotes[newIndex];
    } else if (layerId === "middle-layer") {
      this.radialState.typeIndex = newIndex;
      this.radialState.type = this.radialTypes[newIndex];
    } else if (layerId === "outer-layer") {
      this.radialState.baseIndex = newIndex;
      this.radialState.base = this.radialBassNotes[newIndex];
    }
    this.renderRadialBuilder();
  }

  renderRadialBuilder() {
    let chordName = this.radialState.root + this.radialState.type;
    if (
      this.radialState.base !== this.radialState.root &&
      this.radialState.base !== "(root)"
    ) {
      chordName += "/" + this.radialState.base;
    }
    document.getElementById("current-chord-display").textContent = chordName;
    this.positionItems(
      "inner-layer",
      this.musicalNotes,
      this.radialState.rootIndex,
      0.85
    );
    this.positionItems(
      "middle-layer",
      this.radialTypes,
      this.radialState.typeIndex,
      0.88
    );
    this.positionItems(
      "outer-layer",
      this.radialBassNotes,
      this.radialState.baseIndex,
      0.92
    );
  }

  parseChordToRadialState(chordName) {
    const chordRegex = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;
    const parts = chordName.match(chordRegex);
    let root, type, base;
    if (parts) {
      root = parts[1];
      type = parts[2] || "";
      base = parts[3] || "(root)";
    } else {
      root = "C";
      type = "";
      base = "(root)";
    }

    let rootIndex = this.musicalNotes.indexOf(root);
    let typeIndex = this.radialTypes.indexOf(type);
    let baseIndex = this.radialBassNotes.indexOf(base);

    if (rootIndex === -1) rootIndex = 3; // Default C
    if (typeIndex === -1) typeIndex = 0;
    if (baseIndex === -1) baseIndex = 0;

    this.radialState = {
      root: this.musicalNotes[rootIndex],
      type: this.radialTypes[typeIndex],
      base: this.radialBassNotes[baseIndex],
      rootIndex,
      typeIndex,
      baseIndex,
    };
  }

  openChordModal(element, range) {
    this.currentlyEditing = { element, range };
    this.chordEditorModal.classList.add("visible");
    if (element) {
      const existingChord = element.dataset.chord;
      this.parseChordToRadialState(existingChord);
      this.modalBtnRemove.style.display = "inline-block";
    } else if (range) {
      this.parseChordToRadialState("C");
      this.modalBtnRemove.style.display = "none";
    }
    this.renderRadialBuilder();
  }

  applyChord(chordName) {
    if (!this.currentlyEditing) return;
    if (this.currentlyEditing.element) {
      const chordTextEl =
        this.currentlyEditing.element.querySelector(".chord-text");
      this.currentlyEditing.element.dataset.chord = chordName;
      if (chordTextEl) chordTextEl.textContent = chordName;
    } else if (this.currentlyEditing.range) {
      const range = this.currentlyEditing.range;
      const wordText = range.toString();
      range.deleteContents();
      const chordSpan = this.createChordSpan(chordName);
      range.insertNode(chordSpan);
      const textNode = document.createTextNode(" " + wordText);
      range.setStartAfter(chordSpan);
      range.insertNode(textNode);
    }
    this.centerChordHandles();
    this.recordHistoryDebounced();
    this.closeChordModal();
  }

  closeChordModal() {
    this.chordEditorModal.classList.remove("visible");
    this.currentlyEditing = null;
  }

  removeChord() {
    if (this.currentlyEditing?.element) {
      this.currentlyEditing.element.remove();
      this.recordHistoryDebounced();
    }
    this.closeChordModal();
  }

  // --- TEXT MARKÖR HANTERING ---
  getWordAtCursor(event) {
    let range = null;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(event.clientX, event.clientY);
    }

    if (
      !range ||
      !range.startContainer.textContent ||
      range.startContainer.nodeType !== Node.TEXT_NODE
    ) {
      return null;
    }

    try {
      const text = range.startContainer.textContent;
      let startIndex = range.startOffset;
      let endIndex = range.startOffset;

      while (startIndex > 0 && text[startIndex - 1].trim() !== "") {
        startIndex--;
      }
      while (endIndex < text.length && text[endIndex].trim() !== "") {
        endIndex++;
      }

      if (startIndex === endIndex) return null;

      const wordRange = document.createRange();
      wordRange.setStart(range.startContainer, startIndex);
      wordRange.setEnd(range.startContainer, endIndex);
      return wordRange;
    } catch (e) {
      console.error("Fel vid getWordAtCursor:", e);
      return null;
    }
  }

  handleDragOver(e) {
    e.preventDefault();
    if (this.editMode !== "chord") return;
    if (e.ctrlKey || e.altKey) e.dataTransfer.dropEffect = "copy";
    else e.dataTransfer.dropEffect = "move";

    let range;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    }

    if (range) {
      const rect = range.getBoundingClientRect();
      this.dropIndicator.style.display = "block";
      this.dropIndicator.style.left = `${rect.left + window.scrollX}px`;
      this.dropIndicator.style.top = `${rect.top + window.scrollY}px`;
    }
  }

  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.dropIndicator.style.display = "none";
    if (this.editMode !== "chord") return;

    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }

    if (!range || !this.editor.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(this.editor);
      range.collapse(false);
    }

    let chordNode;
    if ((e.ctrlKey || e.altKey) && this.draggedChord) {
      const chordText = this.draggedChord.dataset.chord;
      chordNode = this.createChordSpan(chordText);
    } else {
      chordNode = this.draggedChord
        ? this.draggedChord
        : this.createChordSpan(e.dataTransfer.getData("text/plain"));
    }

    chordNode.style.display = "inline-block";
    range.insertNode(chordNode);

    const sel = window.getSelection();
    sel.removeAllRanges();
    const after = document.createRange();
    after.setStartAfter(chordNode);
    after.collapse(true);
    sel.addRange(after);

    this.centerChordHandles();
    this.recordHistoryDebounced();
  }

  createChordSpan(chord) {
    const span = document.createElement("span");
    span.className = "chord";
    span.dataset.chord = chord;
    span.setAttribute("contenteditable", "false");

    const chordText = document.createElement("span");
    chordText.className = "chord-text";
    chordText.textContent = chord;
    chordText.spellcheck = false;
    chordText.draggable = true;
    span.appendChild(chordText);

    span.addEventListener("click", (e) => {
      if (this.editMode !== "chord") return;
      this.clearChordSelection();
      span.classList.add("selected");
    });

    span.addEventListener("dblclick", (e) => {
      if (this.editMode !== "chord") return;
      e.stopPropagation();
      span.remove();
      this.recordHistoryDebounced();
    });

    chordText.addEventListener("dragstart", (e) => {
      if (this.editMode !== "chord") {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      e.dataTransfer.setData("text/plain", chord);
      e.dataTransfer.effectAllowed = "copyMove";
      this.draggedChord = span;
      document.body.classList.add("is-dragging");

      if (e.dataTransfer.setDragImage) {
        const ghost = document.createElement("span");
        ghost.textContent = chord;
        ghost.style.cssText = `display:inline-block;padding:0.1em 0.4em;border-radius:3px;background-color:${getComputedStyle(
          document.body
        ).getPropertyValue("--surface")};color:${getComputedStyle(
          document.body
        ).getPropertyValue(
          "--chord-color"
        )};font-family:var(--font-sans);font-weight:600;font-size:0.85em;border:1px solid ${getComputedStyle(
          document.body
        ).getPropertyValue(
          "--border"
        )};position:absolute;top:-9999px;left:-9999px;`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 10, 15);
        setTimeout(() => document.body.removeChild(ghost), 0);
      }

      const isCopy = e.ctrlKey || e.altKey;
      if (!isCopy) {
        setTimeout(() => {
          span.style.display = "none";
        }, 0);
      }
    });

    chordText.addEventListener("dragend", (e) => {
      e.stopPropagation();
      document.body.classList.remove("is-dragging");
      if (this.draggedChord && this.draggedChord.parentNode) {
        this.draggedChord.style.display = "inline-block";
      }
      this.draggedChord = null;
    });

    return span;
  }

  insertSectionMarker(type) {
    if (this.editMode === "scroll") return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !this.editor.contains(sel.anchorNode))
      return this.showCustomAlert(
        "Placera markören på raden där du vill infoga sektionsmarkören."
      );

    let node = sel.anchorNode;
    while (node && node.parentNode !== this.editor) node = node.parentNode;

    if (!node || node.tagName !== "DIV") {
      const newDiv = document.createElement("div");
      this.editor.appendChild(newDiv);
      node = newDiv;
    }

    const existingMarker = node.querySelector(".section-marker");
    if (existingMarker) existingMarker.remove();
    this.insertSectionMarkerInDiv(node, type);
  }

  insertSectionMarkerInDiv(div, type) {
    const abbreviations = {
      Verse: "V",
      Chorus: "R",
      Stick: "S",
      Intro: "I",
      Outro: "O",
      Solo: "Solo",
      Bridge: "B",
      Dig: "M",
    };
    const markerSpan = document.createElement("span");
    markerSpan.className = "section-marker";
    markerSpan.dataset.section = type;
    markerSpan.setAttribute("contenteditable", "false");
    markerSpan.dataset.abbreviation = abbreviations[type] || type.charAt(0);

    const textSpan = document.createElement("span");
    textSpan.className = "section-marker-text";
    textSpan.textContent = type;
    markerSpan.appendChild(textSpan);

    div.insertBefore(markerSpan, div.firstChild);
    markerSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      markerSpan.remove();
      this.recordHistoryDebounced();
    });
  }

  clearChordSelection() {
    this.editor
      .querySelectorAll(".chord.selected")
      .forEach((s) => s.classList.remove("selected"));
  }

  // --- SÄKER REDIGERING & ENTER-FIX (UPPDATERAD) ---
  handleKeyDown(e) {
    if (this.editMode !== "chord") return;

    // --- FIX: ENTER VID SEKTIONSRUBRIKER ---
    // Vi kollar specifikt om Shift INTE är nertryckt
    if (e.key === "Enter" && !e.shiftKey) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Hitta den div vi redigerar i
      let div = range.startContainer;
      while (div && div.nodeName !== "DIV" && div.id !== "editor") {
        div = div.parentNode;
      }

      // Om divven har en sektionsmarkör och vi trycker Enter...
      if (div && div.querySelector(".section-marker")) {
        e.preventDefault(); // Stoppa webbläsarens normala, buggiga beteende

        // Skapa en ny rad (div)
        const newDiv = document.createElement("div");

        // Flytta allt innehåll som är EFTER markören till den nya raden
        const rangeAfter = range.cloneRange();
        rangeAfter.setEndAfter(div.lastChild);
        const content = rangeAfter.extractContents();

        newDiv.appendChild(content);
        if (newDiv.innerHTML.trim() === "") newDiv.innerHTML = "<br>";

        div.after(newDiv);

        // Flytta markören till den nya raden
        const newRange = document.createRange();
        newRange.setStart(newDiv, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        this.recordHistoryDebounced();
        return;
      }
    }

    // --- SÄKER BACKSPACE ---
    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      if (range.collapsed && range.startOffset === 0) {
        const container = range.startContainer;
        let prevNode = null;
        if (container.nodeType === Node.TEXT_NODE) {
          prevNode = container.previousSibling;
        } else if (container.nodeType === Node.ELEMENT_NODE) {
          prevNode = container.childNodes[range.startOffset - 1];
        }

        if (prevNode && prevNode.nodeType === Node.ELEMENT_NODE) {
          if (
            prevNode.classList.contains("chord") ||
            prevNode.classList.contains("section-marker")
          ) {
            e.preventDefault();
            this.showCustomAlert(
              "Använd dubbelklick eller menyn för att ta bort ackord/sektioner."
            );
            return;
          }
        }
      }
    }
  }

  handleMutations(mutations) {
    this.stopObserver();
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") this.formatNode(mutation.target);
      else if (mutation.type === "childList")
        mutation.addedNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) this.formatNode(n);
        });
    });
    this.startObserver();
  }

  formatNode(node) {
    if (
      this.editMode !== "chord" ||
      !node.textContent ||
      !node.textContent.includes("[")
    )
      return;

    const text = node.textContent;
    const regex = /\[([^\]]+)\]/g;
    let match;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let replaced = false;

    while ((match = regex.exec(text)) !== null) {
      replaced = true;
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText) frag.appendChild(document.createTextNode(beforeText));

      const chord = match[1];
      const chordSpan = this.createChordSpan(chord);
      frag.appendChild(chordSpan);
      lastIndex = regex.lastIndex;
    }

    if (replaced) {
      const afterText = text.substring(lastIndex);
      if (afterText) frag.appendChild(document.createTextNode(afterText));
      if (node.parentNode) {
        const parent = node.parentNode;
        parent.replaceChild(frag, node);
        const sel = window.getSelection();
        const range = document.createRange();
        const lastNode = parent.childNodes[parent.childNodes.length - 1];
        if (lastNode) {
          range.setStart(
            lastNode,
            lastNode.length || lastNode.childNodes.length
          );
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        this.centerChordHandles();
      }
    }
  }

  syncChordData() {
    this.editor.querySelectorAll(".chord").forEach((chordEl) => {
      const chordTextEl = chordEl.querySelector(".chord-text");
      if (chordTextEl) chordEl.dataset.chord = chordTextEl.textContent;
    });
  }

  getContentAsText() {
    let result = [];
    this.editor.childNodes.forEach((lineDiv) => {
      let lineText = "";
      if (lineDiv.nodeType !== Node.ELEMENT_NODE) return;
      const marker = lineDiv.querySelector(".section-marker");
      if (marker) {
        lineText += `::${marker.dataset.section}::`;
      }
      lineDiv.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          lineText += node.textContent;
        } else if (node.matches && node.matches(".chord")) {
          lineText += `[${node.dataset.chord}]`;
        } else if (node.tagName === "A") {
          lineText += `[[${node.href}|${node.textContent}]]`;
        }
      });
      result.push(lineText);
    });
    return result.join("\n");
  }

  loadContent(text, recordHistory = false) {
    this.stopObserver();
    this.editor.innerHTML = "";
    const lines = text.split("\n");

    lines.forEach((lineText) => {
      lineText = lineText.replace(/\[\s*\]/g, "");
      const lineDiv = document.createElement("div");
      let sectionType = null;
      lineText = lineText.replace(/^::(.*?)::/, (match, type) => {
        sectionType = type;
        return "";
      });

      if (sectionType) this.insertSectionMarkerInDiv(lineDiv, sectionType);

      if (lineText.trim() === "" && !lineText.includes("[")) {
        lineDiv.appendChild(document.createElement("br"));
      } else {
        const regex = /\[\[(.+?)(?:\|(.*?))?\]\]|\[([^\]]+)\]/g;
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(lineText)) !== null) {
          if (match.index > lastIndex) {
            lineDiv.appendChild(
              document.createTextNode(
                lineText.substring(lastIndex, match.index)
              )
            );
          }
          if (match[1]) {
            const url = match[1].trim();
            const linkText = (match[2] || "").trim() || url;
            const link = document.createElement("a");
            link.href = url.startsWith("http") ? url : `http://${url}`;
            link.textContent = linkText;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            lineDiv.appendChild(link);
          } else if (match[3]) {
            lineDiv.appendChild(this.createChordSpan(match[3]));
          }
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < lineText.length) {
          lineDiv.appendChild(
            document.createTextNode(lineText.substring(lastIndex))
          );
        }
      }
      this.editor.appendChild(lineDiv);
    });

    this.centerChordHandles();
    this.startObserver();
    if (recordHistory) this.recordHistory();
  }

  _transposeSingleNote(note, steps) {
    const sharpMap = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
    const match = note.match(/^([A-G](?:#|b)?)/);
    if (!match) return note;

    let rootNote = match[0];
    let normalizedNote = rootNote.includes("b")
      ? sharpMap[rootNote] || rootNote
      : rootNote;

    const currentIndex = this.musicalNotes.indexOf(normalizedNote);
    if (currentIndex !== -1) {
      const newIndex =
        (currentIndex + steps + this.musicalNotes.length) %
        this.musicalNotes.length;
      const transposedRoot = this.musicalNotes[newIndex];
      return transposedRoot + note.substring(rootNote.length);
    }
    return note;
  }

  transpose(steps) {
    if (this.editMode === "scroll") return;
    this.syncChordData();
    const text = this.getContentAsText();
    const transposedText = text.replace(/\[([^\]]+)\]/g, (fullMatch, chord) => {
      const parts = chord.split("/");
      const mainChord = parts[0];
      const bassNote = parts.length > 1 ? parts[1] : null;
      const transposedMainChord = this._transposeSingleNote(mainChord, steps);
      if (bassNote) {
        const transposedBassNote = this._transposeSingleNote(bassNote, steps);
        return `[${transposedMainChord}/${transposedBassNote}]`;
      } else {
        return `[${transposedMainChord}]`;
      }
    });
    this.loadContent(transposedText, true);
  }

  recordHistory() {
    this.syncChordData();
    const snapshot = this.getContentAsText();
    if (this.history[this.historyIndex] === snapshot) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > this.historyMax) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  recordHistoryDebounced() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.recordHistory(), 300);
  }

  undo() {
    if (this.editMode === "scroll") return;
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadContent(this.history[this.historyIndex], false);
    }
  }

  redo() {
    if (this.editMode === "scroll") return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.loadContent(this.history[this.historyIndex], false);
    }
  }

  showCustomAlert(message) {
    const dialog = document.getElementById("custom-alert");
    document.getElementById("custom-alert-message").textContent = message;
    dialog.classList.add("visible");
    const okBtn = document.getElementById("custom-alert-ok");
    const close = () => dialog.classList.remove("visible");
    okBtn.onclick = close;
  }

  showCustomConfirm(message) {
    return new Promise((resolve) => {
      const dialog = document.getElementById("custom-confirm");
      document.getElementById("custom-confirm-message").textContent = message;
      dialog.classList.add("visible");
      const okBtn = document.getElementById("custom-confirm-ok");
      const cancelBtn = document.getElementById("custom-confirm-cancel");
      const close = (value) => {
        dialog.classList.remove("visible");
        resolve(value);
      };
      okBtn.onclick = () => close(true);
      cancelBtn.onclick = () => close(false);
    });
  }

  toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    const isDarkMode = document.body.classList.contains("dark-mode");
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.DARK_MODE,
      isDarkMode ? "enabled" : "disabled"
    );
    this.applySavedTheme();
  }

  createNewProject() {
    this.titleInput.value = "";
    this.authorInput.value = "";
    this.loadContent(
      'Öppna sidopanelen, namnge ditt projekt och välj "Save song".. Nu kan du ersätta denna text med dina egna texter och ackord...',
      true
    );
    this.projectList.selectedIndex = 0;
    this.currentProjectName.textContent = "Välj projekt...";
    localStorage.removeItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT);
    this.editor.style.fontSize = "16px";
    this.titleInput.focus();
  }

  saveCopy() {
    const currentName = this.titleInput.value.trim();
    if (!currentName) {
      this.showCustomAlert("Kan inte kopiera en namnlös sång.");
      return;
    }
    const newName = currentName + " - Kopia";
    this.titleInput.value = newName;
    this.saveProject(newName);
    this.showCustomAlert(`Skapade en kopia: "${newName}"`);
  }

  saveProject(name) {
    this.syncChordData();
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};

    projects[name] = {
      title: this.titleInput.value,
      author: this.authorInput.value,
      fontSize: this.editor.style.fontSize || "16px",
      content: this.getContentAsText(),
      scrollSpeed: this.scrollSpeed,
      duration: this.getTotalDurationSeconds(),
      tempo: this.tempo,
    };

    let order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];
    if (!order.includes(name)) {
      order.push(name);
      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
        JSON.stringify(order)
      );
    }

    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECTS,
      JSON.stringify(projects)
    );
    localStorage.setItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT, name);
    this.updateProjectList(name);

    const originalText =
      this.btnSaveProject.querySelector(".menu-grid-title").textContent;
    this.btnSaveProject.querySelector(".menu-grid-title").textContent =
      "Sparad!";
    this.btnSaveProject.disabled = true;
    setTimeout(() => {
      this.btnSaveProject.querySelector(".menu-grid-title").textContent =
        "Spara sång";
      this.btnSaveProject.disabled = false;
    }, 1200);
  }

  loadProject(name) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    if (projects[name]) {
      const data = projects[name];
      this.titleInput.value = data.title || "";
      this.authorInput.value = data.author || "";
      this.editor.style.fontSize = data.fontSize || "16px";

      this.loadContent(data.content || "", true);

      if (data.scrollSpeed !== undefined) {
        const sliderVal =
          ((data.scrollSpeed - this.MIN_MOVE_SPEED) /
            (this.MAX_MOVE_SPEED - this.MIN_MOVE_SPEED)) *
          100;
        this.scrollSpeedSlider.value = Math.max(
          0,
          Math.min(100, Math.round(sliderVal))
        );
        this.setScrollSpeed(this.scrollSpeedSlider.value);
      } else {
        this.scrollSpeedSlider.value = 20;
        this.setScrollSpeed(20);
      }

      if (data.duration !== undefined) {
        this.updateDurationInputs(data.duration);
      } else {
        this.updateDurationFromSpeed();
      }

      this.tempo = data.tempo || 120;
      if (this.metronomeBpmInput) {
        this.metronomeBpmInput.value = this.tempo;
      }

      if (this.fontSizeSelector && data.fontSize) {
        this.fontSizeSelector.value = parseInt(
          (data.fontSize || "16px").replace("px", "")
        );
        this.editor.style.fontSize = data.fontSize;
      }

      localStorage.setItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT, name);
      if (this.projectList.value !== name) this.projectList.value = name;
      this.currentProjectName.textContent = name;
    }
  }

  loadProjectByIndexDelta(delta) {
    if (!this.projectList) return;
    const options = this.projectList.options;
    if (options.length <= 1) return;

    const currentIndex = this.projectList.selectedIndex;
    let newIndex;

    if (currentIndex <= 0) {
      newIndex = delta > 0 ? 1 : options.length - 1;
    } else {
      newIndex = currentIndex + delta;
    }

    if (newIndex >= options.length) {
      newIndex = 1;
    } else if (newIndex < 1) {
      newIndex = options.length - 1;
    }

    const newProjectName = options[newIndex].value;
    if (newProjectName) {
      this.stopScrolling();
      this.loadProject(newProjectName);
    }
  }

  loadLastProject() {
    this.updateProjectList();
    const last = localStorage.getItem(
      StableChordEditor.STORAGE_KEYS.LAST_PROJECT
    );
    if (last) this.loadProject(last);
    else
      this.loadContent(
        "Välkommen till ProChorder!\nOm detta är första gången du använder appen, använd hjälp-knappen i menyn för instruktioner.",
        true
      );
  }

  updateProjectList(selectedValue) {
    const list = this.projectList;
    const dropdown = this.projectDropdownMenu;
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};

    let order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];
    const projectKeys = Object.keys(projects);

    order = order.filter((name) => projectKeys.includes(name));
    projectKeys.forEach((name) => {
      if (!order.includes(name)) order.push(name);
    });
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
      JSON.stringify(order)
    );

    list.innerHTML = '<option value="">Ladda projekt...</option>';
    dropdown.innerHTML = "";

    if (order.length === 0) {
      dropdown.innerHTML = `<div class="project-dropdown-item" style="opacity: 0.6; cursor: default;">Inga projekt sparade</div>`;
    }

    order.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      list.appendChild(option);

      const item = document.createElement("div");
      item.className = "project-dropdown-item";
      item.textContent = name;
      item.dataset.name = name;
      item.draggable = true;

      item.addEventListener("click", () => {
        this.selectProject(name);
      });

      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", index);
        e.dataTransfer.effectAllowed = "move";
        item.classList.add("dragging");
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        document
          .querySelectorAll(".project-dropdown-item")
          .forEach((el) => el.classList.remove("drag-over"));
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        item.classList.add("drag-over");
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
        const toIndex = index;

        if (fromIndex !== toIndex) {
          const itemToMove = order[fromIndex];
          order.splice(fromIndex, 1);
          order.splice(toIndex, 0, itemToMove);

          localStorage.setItem(
            StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
            JSON.stringify(order)
          );

          this.updateProjectList(selectedValue);
        }
      });

      dropdown.appendChild(item);
    });

    const last =
      selectedValue ||
      localStorage.getItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT);
    if (last && projects[last]) {
      list.value = last;
      this.currentProjectName.textContent = last;
    } else {
      list.value = "";
      this.currentProjectName.textContent = "Välj projekt...";
    }
  }

  deleteProject(name) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    delete projects[name];
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECTS,
      JSON.stringify(projects)
    );

    let order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];
    order = order.filter((item) => item !== name);
    localStorage.setItem(
      StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
      JSON.stringify(order)
    );

    const last = localStorage.getItem(
      StableChordEditor.STORAGE_KEYS.LAST_PROJECT
    );
    if (last === name) {
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT);
      this.createNewProject();
    }

    this.updateProjectList();
    this.showCustomAlert(`Projektet "${name}" har tagits bort.`);
  }

  async deleteAllProjects() {
    if (
      await this.showCustomConfirm(
        "Är du säker? Detta raderar ALLA sånger permanent."
      )
    ) {
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECTS);
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.LAST_PROJECT);
      localStorage.removeItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER);
      this.updateProjectList();
      this.createNewProject();
      this.showCustomAlert("Alla projekt är borttagna.");
    }
  }

  async renameProject(oldName, newName) {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    if (projects[oldName] && !projects[newName]) {
      projects[newName] = projects[oldName];
      projects[newName].title = newName;
      delete projects[oldName];

      localStorage.setItem(
        StableChordEditor.STORAGE_KEYS.PROJECTS,
        JSON.stringify(projects)
      );

      let order =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
        ) || [];
      const index = order.indexOf(oldName);
      if (index !== -1) {
        order[index] = newName;
        localStorage.setItem(
          StableChordEditor.STORAGE_KEYS.PROJECT_ORDER,
          JSON.stringify(order)
        );
      }

      const lastProject = localStorage.getItem(
        StableChordEditor.STORAGE_KEYS.LAST_PROJECT
      );
      if (lastProject === oldName)
        localStorage.setItem(
          StableChordEditor.STORAGE_KEYS.LAST_PROJECT,
          newName
        );

      this.titleInput.value = newName;
      this.updateProjectList(newName);
      this.showCustomAlert(`Projektet har döpts om till "${newName}".`);
    } else if (projects[newName]) {
      this.showCustomAlert(`Ett projekt med namnet "${newName}" finns redan.`);
      this.titleInput.value = oldName;
    }
  }

  generatePdfForProject(projectData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 15;
    const sectionMargin = 15;
    const lyricMargin = 35;
    const baseFontSizePx = parseInt(
      (projectData.fontSize || "16px").replace("px", ""),
      10
    );
    const baseFontSizePt = baseFontSizePx * 0.75;
    const lyricLineHeightMultiplier = 0.7;
    const LYRIC_LINE_HEIGHT = baseFontSizePt * lyricLineHeightMultiplier;
    const SECTION_HEADER_LINE_HEIGHT = baseFontSizePt * 0.9;
    const CHORD_COLOR = "#0052cc";
    const TEXT_COLOR = "#172b4d";
    const CHORD_OFFSET = baseFontSizePt * 0.35;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(projectData.title || "Song Title", sectionMargin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(projectData.author || "Artist", pageWidth - sectionMargin, y, {
      align: "right",
    });
    y += 12;

    const lines = (projectData.content || "").split("\n");

    lines.forEach((lineText) => {
      let sectionType = null;
      let remainingText = lineText.replace(/^::(.*?)::/, (match, type) => {
        sectionType = type;
        return "";
      });

      const lineHasContent = remainingText.trim().length > 0;
      const pageBreakThreshold = 280;

      let estimatedLineHeight = LYRIC_LINE_HEIGHT;
      if (sectionType && !lineHasContent) {
        estimatedLineHeight = SECTION_HEADER_LINE_HEIGHT;
      }
      if (y + estimatedLineHeight > pageBreakThreshold) {
        doc.addPage();
        y = 20;
      }

      if (sectionType) {
        if (y > 25) y += LYRIC_LINE_HEIGHT * 0.5;
        const cleanedSectionType = sectionType.replace(/\u200B/g, "");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(baseFontSizePt);
        doc.setTextColor(TEXT_COLOR);
        doc.text(cleanedSectionType, sectionMargin, y);
      }

      if (lineHasContent) {
        const parts = remainingText.split(/(\[[^\]]+\])/g).filter((p) => p);
        let currentX = lyricMargin;

        parts.forEach((part) => {
          if (part.startsWith("[") && part.endsWith("]")) {
            const chord = part.substring(1, part.length - 1);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(baseFontSizePt * 0.85);
            doc.setTextColor(CHORD_COLOR);
            doc.text(chord, currentX, y - CHORD_OFFSET);
          } else {
            const cleanedPart = part.replace(/\u200B/g, "");
            doc.setFont("helvetica", "normal");
            doc.setFontSize(baseFontSizePt);
            doc.setTextColor(TEXT_COLOR);
            doc.text(cleanedPart, currentX, y);
            currentX += doc.getTextWidth(cleanedPart);
          }
        });

        y += LYRIC_LINE_HEIGHT;
      } else if (sectionType) {
        y += LYRIC_LINE_HEIGHT;
      } else {
        y += LYRIC_LINE_HEIGHT * 0.7;
      }
    });
    return doc.output("blob");
  }

  exportPdf() {
    this.syncChordData();
    const projectData = {
      title: this.titleInput.value,
      author: this.authorInput.value,
      content: this.getContentAsText(),
      fontSize: this.editor.style.fontSize,
    };
    const pdfBlob = this.generatePdfForProject(projectData);
    saveAs(pdfBlob, `${this.sanitizeFilename(projectData.title)}.pdf`);
  }

  exportTxt() {
    this.syncChordData();
    const title = this.titleInput.value;
    const author = this.authorInput.value;
    const content = this.getContentAsText();
    const fullText = `${title}\n${author}\n\n${content}`;
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${this.sanitizeFilename(title)}.txt`);
  }

  async exportAllAsZip() {
    this.btnExportZip.textContent = "Genererar...";
    this.btnExportZip.disabled = true;
    try {
      const projects =
        JSON.parse(
          localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
        ) || {};
      if (Object.keys(projects).length === 0)
        return this.showCustomAlert("Inga projekt att exportera.");

      const zip = new JSZip();
      for (const key in projects) {
        const project = projects[key];
        const pdfBlob = this.generatePdfForProject(project);
        zip.file(`${this.sanitizeFilename(project.title)}.pdf`, pdfBlob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "alla_sanger.zip");
    } catch (e) {
      this.showCustomAlert("Fel vid ZIP-export.");
    } finally {
      this.btnExportZip.textContent = "ZIP";
      this.btnExportZip.disabled = false;
    }
  }

  exportJson() {
    this.syncChordData();
    const projectData = {
      title: this.titleInput.value,
      author: this.authorInput.value,
      content: this.getContentAsText(),
      fontSize: this.editor.style.fontSize,
      scrollSpeed: this.scrollSpeed,
      duration: this.getTotalDurationSeconds(),
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: "application/json",
    });
    saveAs(blob, `${this.sanitizeFilename(projectData.title)}.json`);
  }

  exportAllJson() {
    const projects =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)
      ) || {};
    const order =
      JSON.parse(
        localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)
      ) || [];

    // SKAPA LISTAN BASERAT PÅ DIN SORTERING
    const projectsArray = [];

    // 1. Lägg först till alla låtar som finns i din sorterade lista
    order.forEach((title) => {
      if (projects[title]) {
        projectsArray.push(projects[title]);
      }
    });

    // 2. (Säkerhetsåtgärd) Lägg till eventuella "föräldralösa" låtar som finns i databasen
    // men av någon anledning saknas i ordningslistan.
    Object.keys(projects).forEach((title) => {
      if (!order.includes(title)) {
        projectsArray.push(projects[title]);
      }
    });

    const blob = new Blob([JSON.stringify(projectsArray, null, 2)], {
      type: "application/json",
    });
    saveAs(blob, `songs-backup.json`);
  }

  importJsonFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          if (
            await this.showCustomConfirm(
              `${data.length} låtar hittades. Vill du importera? Befintliga låtar med samma namn skrivs över.`
            )
          )
            this.importMultipleProjects(data);
        } else if (data.title) {
          this.importSingleProject(data);
        }
      } catch (e) {
        this.showCustomAlert("Importfel.");
      }
    };
    reader.readAsText(file);
  }

  async importJsonFromUrl(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Nätverksfel");
      const data = await response.json();
      if (Array.isArray(data)) this.importMultipleProjects(data);
      else if (data.title) this.importSingleProject(data);
    } catch (e) {
      this.showCustomAlert("Kunde inte hämta låtar.");
    }
  }

  importSingleProject(data) {
    this.titleInput.value = data.title || "";
    this.authorInput.value = data.author || "";
    this.editor.style.fontSize = data.fontSize || "16px";
    this.loadContent(data.content || "", true);
    if (data.scrollSpeed) this.scrollSpeed = data.scrollSpeed;
    if (data.duration) this.updateDurationInputs(data.duration);
    this.saveProject(data.title);
  }

importMultipleProjects(projectsArray) {
    const projects = JSON.parse(localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECTS)) || {};
    
    // Hämta nuvarande ordning
    let order = JSON.parse(localStorage.getItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER)) || [];
    
    let importedCount = 0, overwrittenCount = 0;
    
    // Lista ut vilka titlar som kommer i den nya filen (i rätt ordning!)
    const newTitles = projectsArray.map(p => p.title).filter(t => t);

    // STEG 1: Städa bort de importerade låtarna från den GAMLA ordningen
    // Detta gör att vi "lyfter ut" dem så vi kan placera dem rätt.
    order = order.filter(title => !newTitles.includes(title));

    // STEG 2: Lägg till låtarna och uppdatera ordningen
    for (const project of projectsArray) {
      if (project && project.title) {
        if (projects[project.title]) overwrittenCount++;
        else importedCount++;
        
        projects[project.title] = project;
      }
    }

    // STEG 3: Lägg in de nya titlarna i slutet av listan (i import-filens ordning)
    // Om du vill att de ska hamna först istället, använd order.unshift(...newTitles);
    order.push(...newTitles);
    
    localStorage.setItem(StableChordEditor.STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    localStorage.setItem(StableChordEditor.STORAGE_KEYS.PROJECT_ORDER, JSON.stringify(order)); 
    
    this.updateProjectList();
    this.showCustomAlert(`${importedCount} nya låtar importerade. ${overwrittenCount} låtar uppdaterade.`);
    
    if (projectsArray.length > 0)
      this.loadProject(projectsArray[0].title);
  }

  sanitizeFilename(name) {
    return name.replace(/[\/\\?%*:|"<>]/g, "-") || "låt";
  }

  // --- SCROLL FUNKTIONALITET ---
  toggleScrolling() {
    if (this.scrollInterval) this.stopScrolling();
    else this.startScrolling();
  }

  startScrolling() {
    if (this.scrollInterval) return;
    if (this.scrollSpeed <= 0) {
      this.calculateAndSetScrollSpeed();
    }
    if (this.scrollSpeed <= 0) return;

    this.scrollBtnPlayPause.textContent = "❚❚";
    this.scrollRemainder = 0;

    const scroll = () => {
      this.scrollRemainder += this.scrollSpeed;
      const move = Math.floor(this.scrollRemainder);
      if (move > 0) {
        this.editor.scrollTop += move;
        this.scrollRemainder -= move;
      }

      if (
        this.editor.scrollTop + this.editor.clientHeight >=
        this.editor.scrollHeight
      ) {
        this.stopScrolling();
      } else {
        this.scrollInterval = requestAnimationFrame(scroll);
      }
    };
    this.scrollInterval = requestAnimationFrame(scroll);
  }

  stopScrolling() {
    if (this.scrollInterval) cancelAnimationFrame(this.scrollInterval);
    this.scrollInterval = null;
    this.scrollBtnPlayPause.textContent = "▶";
  }

  setScrollSpeed(value) {
    const val = parseFloat(value);
    if (val === 0) {
      this.scrollSpeed = 0;
      return;
    }
    this.scrollSpeed =
      this.MIN_MOVE_SPEED +
      (val / 100) * (this.MAX_MOVE_SPEED - this.MIN_MOVE_SPEED);
  }

  getTotalDurationSeconds() {
    const minutes = parseInt(this.scrollDurationMinutesInput.value) || 0;
    const seconds = parseInt(this.scrollDurationSecondsInput.value) || 0;
    return minutes * 60 + seconds;
  }

  updateDurationInputs(totalSeconds) {
    let minutes, seconds;
    if (totalSeconds > 0) {
      minutes = Math.floor(totalSeconds / 60);
      seconds = totalSeconds % 60;
      this.scrollDurationMinutesInput.value = minutes;
      this.scrollDurationSecondsInput.value = seconds;
    } else {
      minutes = 4;
      seconds = 0;
      this.scrollDurationMinutesInput.value = 4;
      this.scrollDurationSecondsInput.value = 0;
    }

    if (this.scrollDurationText) {
      const formattedSeconds = String(seconds).padStart(2, "0");
      this.scrollDurationText.textContent = `${minutes}:${formattedSeconds}`;
    }
  }

  setScrollForDuration(durationSeconds) {
    setTimeout(() => {
      const scrollHeight = Math.max(
        1,
        this.editor.scrollHeight - this.editor.clientHeight
      );
      if (scrollHeight <= 0) return;
      const frames = Math.max(1, durationSeconds * 60);
      this.scrollSpeed = scrollHeight / frames;
      const percent = Math.round(
        ((this.scrollSpeed - 0.02) / (0.5 - 0.02)) * 100
      );
      this.scrollSpeedSlider.value = Math.max(0, Math.min(100, percent));
    }, 100);
  }

  updateDurationFromSpeed() {
    if (this.scrollSpeed < 0.001) return;
    const scrollHeight = Math.max(
      1,
      this.editor.scrollHeight - this.editor.clientHeight
    );
    if (scrollHeight <= 0) return;
    const durationSeconds = scrollHeight / (this.scrollSpeed * 60);
    this.updateDurationInputs(Math.round(durationSeconds));
  }

  processSmartPaste(text) {
    const lines = text.split("\n");
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].trimEnd();
      const nextLine = i + 1 < lines.length ? lines[i + 1].trimEnd() : "";

      if (this.isChordLine(currentLine)) {
        if (nextLine && !this.isChordLine(nextLine)) {
          const merged = this.mergeChordAndLyricLines(lines[i], lines[i + 1]);
          result.push(merged);
          i++;
        } else {
          result.push(
            currentLine.replace(/([A-G][#b]?[a-zA-Z0-9\/]*)/g, "[$1]")
          );
        }
      } else {
        result.push(currentLine);
      }
    }
    return result.join("\n");
  }

  isChordLine(line) {
    if (!line.trim()) return false;

    const tokens = line.trim().split(/\s+/);
    let chordCount = 0;

    const chordRegex =
      /^[A-G][#b]?(m|min|maj|dim|aug|sus|add|[0-9])*(\/[A-G][#b]?)?$/;

    tokens.forEach((token) => {
      const cleanToken = token.replace(/[()]/g, "");
      if (chordRegex.test(cleanToken)) chordCount++;
    });

    return chordCount / tokens.length > 0.8;
  }

  mergeChordAndLyricLines(chordLine, lyricLine) {
    let result = "";
    let lyricIndex = 0;

    const regex = /([A-G][#b]?[^\s]*)/g;
    let match;
    const chords = [];

    while ((match = regex.exec(chordLine)) !== null) {
      chords.push({
        text: match[1],
        index: match.index,
      });
    }

    if (chords.length === 0) return lyricLine;

    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];

      if (chord.index > lyricIndex) {
        if (chord.index > lyricLine.length) {
          result += lyricLine.substring(lyricIndex);
          result += " ".repeat(chord.index - lyricLine.length);
          lyricIndex = lyricLine.length + (chord.index - lyricLine.length);
        } else {
          result += lyricLine.substring(lyricIndex, chord.index);
          lyricIndex = chord.index;
        }
      }

      result += `[${chord.text}]`;
    }

    if (lyricIndex < lyricLine.length) {
      result += lyricLine.substring(lyricIndex);
    }

    return result;
  }
}

window.addEventListener("load", () => new StableChordEditor("editor"));
